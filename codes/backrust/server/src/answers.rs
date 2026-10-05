//! Answers a student gives on their own, sent from the device's outbox once
//! they are signed in to a seat, and the teacher's report of a class: by
//! skill and by question, with class races (the official record) and own
//! play kept apart. A race on the classroom's smartboard, saved by the
//! teacher who watched it, counts with the class's races.

use axum::Json;
use axum::extract::{Path, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use foldlings_core::template::CompiledTemplate;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use sqlx::PgPool;

use crate::State;
use crate::classes::{audit, owned, student};
use crate::organizer::{ApiError, bearer, signed_in};
use crate::rooms::Content;

/// At most this many answers in one request (the device sends 200 at a time).
const BATCH: usize = 200;
/// At most this many answers one seat sends in ten minutes.
const PER_TEN_MINUTES: i64 = 2_000;
/// One answer event, as JSON, is no longer than this.
const EVENT_BYTES: usize = 2_000;

/// One answer from the device's outbox.
#[derive(Deserialize)]
pub struct Sent {
    event_id: String,
    mode: String,
    event: Value,
}

#[derive(Deserialize)]
pub struct Batch {
    events: Vec<Sent>,
}

/// What a student's device sends of its own play.
const OWN_MODES: &[&str] = &["practice", "race"];
/// What the teacher sends of a race on the smartboard.
const BOARD_MODES: &[&str] = &["board"];

/// What is kept of one answer.
struct Answer {
    template_id: String,
    skill: String,
    correct: bool,
    attempt: i16,
    time_ms: i32,
    misconception: Option<String>,
}

/// The answer to keep, None for one to let go (cancelled for a technical
/// reason), or why it is refused.
#[cfg(test)]
fn check(content: &Content, sent: &Sent) -> Result<Option<Answer>, &'static str> {
    check_for(content, sent, OWN_MODES)
}

fn check_for(
    content: &Content,
    sent: &Sent,
    modes: &[&str],
) -> Result<Option<Answer>, &'static str> {
    if !(1..=120).contains(&sent.event_id.len()) {
        return Err("event_id");
    }
    if !modes.contains(&sent.mode.as_str()) {
        return Err("mode");
    }
    let e = &sent.event;
    if e.to_string().len() > EVENT_BYTES {
        return Err("too_big");
    }
    let text = |k: &str| e.get(k).and_then(Value::as_str);
    let template = text("template_id")
        .and_then(|id| content.templates.iter().find(|t| t.id == id))
        .ok_or("unknown_template")?;
    if text("skill") != Some(template.skill.as_str()) {
        return Err("skill");
    }
    let correct = match text("result") {
        Some("correct") => true,
        Some("wrong") => false,
        Some("void") => return Ok(None),
        _ => return Err("result"),
    };
    let attempt = e
        .get("attempt")
        .and_then(Value::as_u64)
        .filter(|a| (1..=10).contains(a))
        .ok_or("attempt")?;
    let time_ms = e
        .get("time_ms")
        .and_then(Value::as_f64)
        .filter(|t| (0.0..=3_600_000.0).contains(t))
        .ok_or("time_ms")?;
    let misconception = match e.get("misconception") {
        None | Some(Value::Null) => None,
        Some(Value::String(m)) if m.len() <= 64 => Some(m.clone()),
        _ => return Err("misconception"),
    };
    Ok(Some(Answer {
        template_id: template.id.clone(),
        skill: template.skill.clone(),
        correct,
        attempt: attempt as i16,
        time_ms: time_ms as i32,
        misconception,
    }))
}

/// Keeps a batch for the seat. Every answer is either acknowledged (kept,
/// kept before, or let go) or refused with its reason, so the device knows
/// what to drop from its outbox and what to set aside.
pub(crate) async fn store_answers(
    db: &PgPool,
    content: &Content,
    seat_id: i64,
    sent: &[Sent],
) -> Result<Value, ApiError> {
    store_for(db, content, seat_id, sent, OWN_MODES).await
}

async fn store_for(
    db: &PgPool,
    content: &Content,
    seat_id: i64,
    sent: &[Sent],
    modes: &[&str],
) -> Result<Value, ApiError> {
    if sent.len() > BATCH {
        return Err(ApiError(StatusCode::PAYLOAD_TOO_LARGE, "batch"));
    }
    let recent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM seat_answers
         WHERE class_seat_id = $1 AND received_at > now() - interval '10 minutes'",
    )
    .bind(seat_id)
    .fetch_one(db)
    .await?;
    if recent + sent.len() as i64 > PER_TEN_MINUTES {
        return Err(ApiError(StatusCode::TOO_MANY_REQUESTS, "slow_down"));
    }
    let (mut acked, mut rejected, mut stored) = (Vec::new(), Vec::new(), 0);
    let mut tx = db.begin().await?;
    for s in sent {
        match check_for(content, s, modes) {
            Err(why) => rejected.push(json!({ "event_id": s.event_id, "reason": why })),
            Ok(None) => acked.push(s.event_id.clone()),
            Ok(Some(a)) => {
                let done = sqlx::query(
                    "INSERT INTO seat_answers (class_seat_id, event_id, mode, skill, template_id,
                         correct, attempt, time_ms, misconception, event)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     ON CONFLICT (class_seat_id, event_id) DO NOTHING",
                )
                .bind(seat_id)
                .bind(&s.event_id)
                .bind(&s.mode)
                .bind(&a.skill)
                .bind(&a.template_id)
                .bind(a.correct)
                .bind(a.attempt)
                .bind(a.time_ms)
                .bind(&a.misconception)
                .bind(&s.event)
                .execute(&mut *tx)
                .await?;
                stored += done.rows_affected();
                acked.push(s.event_id.clone());
            }
        }
    }
    tx.commit().await?;
    Ok(json!({ "acked": acked, "rejected": rejected, "stored": stored }))
}

/// `POST /api/student/events`: answers from the device's outbox.
pub async fn student_events(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(batch): Json<Batch>,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(ApiError(StatusCode::UNAUTHORIZED, "signed_out"))?;
    Ok(Json(
        store_answers(&state.db, state.rooms.content(), s.seat_id, &batch.events).await?,
    ))
}

/// Per seat, source and question: first tries right, and first tries. Only
/// a first try measures what the student knows; a retry already saw the
/// answer. `class` is the class's own rooms and its races on the smartboard,
/// `own` the student's own play.
const REPORT_SQL: &str = "
    WITH seats AS (SELECT id, number FROM class_seats WHERE class_id = $1)
    SELECT number, source, template_id, skill, sum(right_n)::bigint, sum(total_n)::bigint
    FROM (
    SELECT s.number, 'class' AS source,
           COALESCE(a.event->>'template_id', ''), COALESCE(a.event->>'skill', ''),
           count(*) FILTER (WHERE a.event->>'result' = 'correct') AS right_n, count(*) AS total_n
    FROM seats s
    JOIN match_seat_results r ON r.class_seat_id = s.id AND r.official
    JOIN match_answers a ON a.match_id = r.match_id AND a.seat = r.seat
    WHERE a.event->>'result' IN ('correct', 'wrong') AND a.event->>'attempt' = '1'
    GROUP BY 1, 2, 3, 4
    UNION ALL
    SELECT s.number, CASE WHEN e.mode = 'board' THEN 'class' ELSE 'own' END,
           e.template_id, e.skill, count(*) FILTER (WHERE e.correct), count(*)
    FROM seats s
    JOIN seat_answers e ON e.class_seat_id = s.id
    WHERE e.attempt = 1
    GROUP BY 1, 2, 3, 4
    ) r (number, source, template_id, skill, right_n, total_n)
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2, 3";

/// Seat number, source, template, skill, first tries right, first tries.
type ReportRow = (i16, String, String, String, i64, i64);

/// Per seat, source, skill and kind of mistake: wrong first tries whose
/// answer was a lure made for that mistake (like adding the denominators).
const MISTAKES_SQL: &str = "
    WITH seats AS (SELECT id, number FROM class_seats WHERE class_id = $1)
    SELECT number, source, skill, misconception, sum(n)::bigint
    FROM (
    SELECT s.number, 'class' AS source, COALESCE(a.event->>'skill', ''), a.event->>'misconception', count(*)
    FROM seats s
    JOIN match_seat_results r ON r.class_seat_id = s.id AND r.official
    JOIN match_answers a ON a.match_id = r.match_id AND a.seat = r.seat
    WHERE a.event->>'result' = 'wrong' AND a.event->>'attempt' = '1'
      AND COALESCE(a.event->>'misconception', '') <> ''
    GROUP BY 1, 2, 3, 4
    UNION ALL
    SELECT s.number, CASE WHEN e.mode = 'board' THEN 'class' ELSE 'own' END,
           e.skill, e.misconception, count(*)
    FROM seats s
    JOIN seat_answers e ON e.class_seat_id = s.id
    WHERE NOT e.correct AND e.attempt = 1 AND COALESCE(e.misconception, '') <> ''
    GROUP BY 1, 2, 3, 4
    ) m (number, source, skill, misconception, n)
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2, 3, 4";

/// Seat number, source, skill, kind of mistake, how many.
type MistakeRow = (i16, String, String, String, i64);

/// The class's report for its teacher, with the titles of its skills and
/// the prompts of its questions.
pub(crate) async fn class_report(
    db: &PgPool,
    content: &Content,
    owner: i64,
    id: &str,
) -> Result<Value, ApiError> {
    let label: Option<String> =
        sqlx::query_scalar("SELECT label FROM classes WHERE id = $1 AND owner = $2")
            .bind(id)
            .bind(owner)
            .fetch_optional(db)
            .await?;
    let label = label.ok_or(ApiError(StatusCode::NOT_FOUND, "class_not_found"))?;
    let rows: Vec<ReportRow> = sqlx::query_as(REPORT_SQL).bind(id).fetch_all(db).await?;
    let (mut skills, mut templates) = (Map::new(), Map::new());
    for (_, _, template, skill, _, _) in &rows {
        if let Some(title) = content.skills.get(skill) {
            skills.insert(skill.clone(), json!(title));
        }
        if templates.contains_key(template) {
            continue;
        }
        if let Some(t) = content.templates.iter().find(|t| &t.id == template) {
            // The prompt has the template's blanks; one question made from it reads as a real one.
            let example = CompiledTemplate::compile(t.clone())
                .ok()
                .and_then(|c| c.instantiate(1).ok())
                .map(|item| item.prompt);
            templates.insert(
                template.clone(),
                json!({ "skill": t.skill, "prompt": t.prompt, "example": example }),
            );
        }
    }
    let rows: Vec<Value> = rows
        .iter()
        .map(|(seat, source, template, skill, right, total)| {
            json!({
                "seat": seat,
                "source": source,
                "template_id": template,
                "skill": skill,
                "right": right,
                "total": total,
            })
        })
        .collect();
    let mistakes: Vec<MistakeRow> = sqlx::query_as(MISTAKES_SQL).bind(id).fetch_all(db).await?;
    let mut words = Map::new();
    for (_, _, _, code, _) in &mistakes {
        if let Some(m) = content.misconceptions.get(code) {
            words.insert(code.clone(), json!(m));
        }
    }
    let mistakes: Vec<Value> = mistakes
        .iter()
        .map(|(seat, source, skill, code, count)| {
            json!({ "seat": seat, "source": source, "skill": skill, "misconception": code, "count": count })
        })
        .collect();
    Ok(json!({
        "label": label,
        "skills": skills,
        "templates": templates,
        "rows": rows,
        "mistakes": mistakes,
        "misconceptions": words,
    }))
}

/// `GET /api/classes/{id}/report`.
pub async fn report(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(
        class_report(&state.db, state.rooms.content(), user.id, &id).await?,
    ))
}

/// One player of a race on the smartboard: a seat of the class.
#[derive(Deserialize)]
pub struct BoardPlayer {
    seat: i16,
    right: i16,
    place: i16,
    events: Vec<Sent>,
}

/// A race on the smartboard, as the game sends it when it ends.
#[derive(Deserialize)]
pub struct BoardRace {
    client_id: String,
    duration_ms: i32,
    total: i16,
    players: Vec<BoardPlayer>,
}

/// Stars for the share of right answers.
fn board_stars(right: i16, total: i16) -> i16 {
    match right * 10 {
        r if r >= total * 9 => 3,
        r if r >= total * 7 => 2,
        r if r >= total * 5 => 1,
        _ => 0,
    }
}

/// Keeps a race on the smartboard for the class's report: a play and the
/// answers of each seat that raced. Sending the same race again keeps it once.
pub(crate) async fn record_board(
    db: &PgPool,
    content: &Content,
    owner: i64,
    id: &str,
    race: &BoardRace,
) -> Result<Value, ApiError> {
    let mut numbers: Vec<i16> = race.players.iter().map(|p| p.seat).collect();
    numbers.sort_unstable();
    numbers.dedup();
    let fits = (1..=64).contains(&race.client_id.len())
        && (1..=50).contains(&race.total)
        && (0..=3_600_000).contains(&race.duration_ms)
        && (1..=3).contains(&race.players.len())
        && numbers.len() == race.players.len()
        && race.players.iter().all(|p| {
            (0..=race.total).contains(&p.right)
                && (1..=3).contains(&p.place)
                && p.events.len() <= race.total as usize
        });
    if !fits {
        return Err(ApiError(StatusCode::UNPROCESSABLE_ENTITY, "board"));
    }
    let mut tx = db.begin().await?;
    owned(&mut tx, owner, id).await?;
    let mut seats = Vec::new();
    for p in &race.players {
        let seat: Option<i64> =
            sqlx::query_scalar("SELECT id FROM class_seats WHERE class_id = $1 AND number = $2")
                .bind(id)
                .bind(p.seat)
                .fetch_optional(&mut *tx)
                .await?;
        let seat = seat.ok_or(ApiError(StatusCode::NOT_FOUND, "seat_not_found"))?;
        sqlx::query(
            "INSERT INTO seat_plays (class_seat_id, client_id, kind, game, points, folded, place,
                 stars, right_answers, total, duration_ms)
             VALUES ($1, $2, 'board', 'board_race', $3, 0, $4, $5, $3, $6, $7)
             ON CONFLICT (class_seat_id, client_id) DO NOTHING",
        )
        .bind(seat)
        .bind(&race.client_id)
        .bind(p.right)
        .bind(p.place)
        .bind(board_stars(p.right, race.total))
        .bind(race.total)
        .bind(race.duration_ms)
        .execute(&mut *tx)
        .await?;
        seats.push(seat);
    }
    audit(
        &mut tx,
        owner,
        "class.board",
        id,
        json!({ "race": race.client_id, "seats": numbers }),
    )
    .await?;
    tx.commit().await?;
    let mut players = Vec::new();
    for (p, seat) in race.players.iter().zip(seats) {
        let answers = store_for(db, content, seat, &p.events, BOARD_MODES).await?;
        players.push(json!({ "seat": p.seat, "answers": answers }));
    }
    Ok(json!({ "stored": true, "players": players }))
}

/// `POST /api/classes/{id}/board`: a race on the smartboard the teacher saves.
pub async fn board(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(race): Json<BoardRace>,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(
        record_board(&state.db, state.rooms.content(), user.id, &id, &race).await?,
    ))
}

#[cfg(test)]
mod tests;
