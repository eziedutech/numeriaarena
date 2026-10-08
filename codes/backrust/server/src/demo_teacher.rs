//! TRY THE TEACHER PAGE: anyone (a judge, a curious teacher) gets their own
//! sample teacher without signing up, with a class of six seats that has
//! already raced and practised, so the class page, its report and its
//! insights show something at once, and five of its seats have a small town
//! on the class map (the first, the visitor's own card, picks its land). Each visitor's sample is theirs alone and
//! is gone after a day. Its token stands in for a sign-in token.

use axum::Json;
use axum::extract::State as Extract;
use axum::http::StatusCode;
use foldlings_core::fairness::FairnessParams;
use foldlings_core::rng::Rng;
use foldlings_core::town::{COLS, LandKind, ROWS, Town, TownEvent, asset_by_id};
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};

use crate::State;
use crate::auth::Adult;
use crate::classes::{Allowance, NewClass, create_class, token_hash};
use crate::organizer::ApiError;
use crate::rooms::{Content, random_code, random_hex, random_u64};
use crate::town::{Plot, place_first, take};

/// A token of a sample teacher starts with this, so it is never sent to Firebase.
pub(crate) const PREFIX: &str = "demo_";
/// How long a sample lasts.
const HOURS: i32 = 24;
/// Samples made in one hour, for everyone together.
const PER_HOUR: i64 = 300;
const SEATS: i16 = 6;
const GRADE: u8 = 5;
/// Skills in the sample: one each from this many templates of the grade.
const SKILLS: usize = 5;
const RACES: usize = 3;
const RACE_ANSWERS: usize = 8;
const PRACTICES: usize = 2;
const PRACTICE_ANSWERS: usize = 6;
/// The towns on the class map: a seat (after the first), its cell and its land.
const TOWNS: [(usize, u8, u8, LandKind); 5] = [
    (1, 2, 2, LandKind::Plain),
    (2, 5, 1, LandKind::River),
    (3, 7, 3, LandKind::Hills),
    (4, 3, 5, LandKind::Beach),
    (5, 6, 6, LandKind::Plain),
];
/// What each of those towns has built, about 110 Folds: less than any seat earned.
const BUILT: [&str; 8] = [
    "house_hut",
    "house_cottage",
    "house_hut",
    "tree_round",
    "tree_round",
    "tree_pine",
    "people_man",
    "animal_cat",
];

/// The sample teacher a token belongs to, while it lasts.
pub(crate) async fn adult(db: &PgPool, token: &str) -> Result<Option<Adult>, ApiError> {
    let uid: Option<String> = sqlx::query_scalar(
        "SELECT u.firebase_uid FROM demo_teachers d JOIN users u ON u.id = d.user_id
         WHERE d.token_hash = $1 AND d.expires_at > now()",
    )
    .bind(token_hash(token))
    .fetch_optional(db)
    .await?;
    Ok(uid.map(|uid| Adult {
        uid,
        email: String::new(),
        email_verified: false,
        name: String::new(),
        provider: "demo".into(),
    }))
}

/// Removes the samples whose day is over, with all they made.
async fn sweep(db: &PgPool) -> Result<(), ApiError> {
    let gone: Vec<i64> =
        sqlx::query_scalar("SELECT user_id FROM demo_teachers WHERE expires_at <= now()")
            .fetch_all(db)
            .await?;
    if gone.is_empty() {
        return Ok(());
    }
    let mut tx = db.begin().await?;
    for sql in [
        "DELETE FROM rooms WHERE created_by = ANY($1)",
        "DELETE FROM audit_log WHERE actor = ANY($1)",
        "DELETE FROM organizations o WHERE EXISTS (
             SELECT 1 FROM memberships m WHERE m.org_id = o.id AND m.user_id = ANY($1))",
        "DELETE FROM users WHERE id = ANY($1)",
    ] {
        sqlx::query(sql).bind(&gone).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(())
}

/// The school year a class made today belongs to, as the class page writes it.
fn school_year() -> String {
    let days = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() / 86_400)
        .unwrap_or(0) as i64;
    // Civil date from days since 1970 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    let start = if month >= 7 { year } else { year - 1 };
    format!("{start}/{:02}", (start + 1) % 100)
}

/// One answer as the game records it.
#[allow(clippy::too_many_arguments)]
fn event(
    id: &str,
    mode: &str,
    player: &str,
    t: &foldlings_core::template::ItemTemplate,
    correct: bool,
    misconception: Option<&str>,
    time_ms: u64,
    content: &Content,
) -> Value {
    json!({
        "event_id": id,
        "at_ms": 0.0,
        "player": player,
        "mode": mode,
        "game_type": "balloon_burst",
        "skill": t.skill,
        "template_id": t.id,
        "params_hash": "sample",
        "b": t.difficulty.base,
        "p_final": 0.7,
        "result": if correct { "correct" } else { "wrong" },
        "attempt": 1,
        "assisted": false,
        "time_ms": time_ms as f64,
        "misconception": misconception,
        "fairness_params_version": FairnessParams::default().version,
        "content_pack_version": content.version,
    })
}

/// Fills the class with play: class races in the teacher's rooms and each
/// seat's own practice, a few days back. Seats differ, and one skill is weak
/// for most of the class, so the insights have something to say.
async fn seed(
    tx: &mut Transaction<'_, Postgres>,
    content: &Content,
    owner: i64,
    class: &str,
    seats: &[(i64, String)],
) -> Result<(), ApiError> {
    let mut rng = Rng::new(random_u64());
    let mut picked: Vec<&foldlings_core::template::ItemTemplate> = Vec::new();
    let mut grade: Vec<_> = content
        .templates
        .iter()
        .filter(|t| t.grades.contains(&GRADE) && !t.distractors.is_empty())
        .collect();
    grade.sort_by(|a, b| a.id.cmp(&b.id));
    // A fraction skill with a well known mistake goes first: it is the weak one.
    grade.sort_by_key(|t| {
        !t.distractors
            .iter()
            .any(|d| d.misconception == "added_denominators")
    });
    for t in grade {
        if picked.len() < SKILLS && picked.iter().all(|p| p.skill != t.skill) {
            picked.push(t);
        }
    }
    if picked.is_empty() {
        return Ok(());
    }
    // How likely a seat is to be right: seats from strong to struggling, the first skill hard.
    let chance = |seat: usize, skill: usize| -> u64 {
        let base = [88i64, 80, 72, 64, 56, 48][seat % 6];
        let shift = if skill == 0 {
            -35
        } else {
            (skill as i64 % 3) * 4 - 4
        };
        (base + shift).clamp(10, 95) as u64
    };
    let answer = |rng: &mut Rng, seat: usize, k: usize| {
        let t = picked[k % picked.len()];
        let correct = rng.below(100) < chance(seat, k % picked.len());
        let lure = if correct || rng.below(100) < 15 {
            None
        } else {
            // The first lure is the mistake made most; the others now and then.
            let i = if rng.below(100) < 70 {
                0
            } else {
                rng.below(t.distractors.len() as u64) as usize
            };
            Some(t.distractors[i].misconception.as_str())
        };
        (t, correct, lure, 3_000 + rng.below(9_000))
    };

    for race in 0..RACES {
        let days = (RACES - race) as i32 * 2;
        let (room, game) = (random_hex(), random_hex());
        sqlx::query(
            "INSERT INTO rooms (id, play_code, watch_code, seats, created_by, kind, class_id, created_at)
             VALUES ($1, $2, $3, $4, $5, 'class', $6, now() - make_interval(days => $7))",
        )
        .bind(&room)
        .bind(random_code())
        .bind(random_code())
        .bind(SEATS)
        .bind(owner)
        .bind(class)
        .bind(days)
        .execute(&mut **tx)
        .await?;
        let mut players = Vec::new();
        let mut events = Vec::new();
        for (i, (_, name)) in seats.iter().enumerate() {
            let (mut points, mut right) = (0u32, 0u32);
            for k in 0..RACE_ANSWERS {
                let (t, correct, lure, ms) = answer(&mut rng, i, k + race);
                if correct {
                    right += 1;
                    points += 100 + rng.below(60) as u32;
                }
                let id = format!("{game}-{i}-{k}");
                events.push((
                    id.clone(),
                    i,
                    event(&id, "race", name, t, correct, lure, ms, content),
                ));
            }
            let stars = match right * 100 / RACE_ANSWERS as u32 {
                80.. => 3,
                50.. => 2,
                _ => 1,
            };
            players.push((i, name.clone(), points, right, stars));
        }
        let mut order: Vec<usize> = (0..players.len()).collect();
        order.sort_by_key(|&i| std::cmp::Reverse(players[i].2));
        let place = |i: usize| order.iter().position(|&o| o == i).unwrap_or(0) as u32 + 1;
        let recap: Vec<Value> = players
            .iter()
            .map(|(i, name, points, right, stars)| {
                json!({ "name": name, "bot": false, "points": points, "folded": right,
                        "place": place(*i), "stars": stars, "highlight": null })
            })
            .collect();
        let desks: Vec<Value> = seats
            .iter()
            .map(|(_, n)| json!({ "name": n, "bot": false }))
            .collect();
        sqlx::query(
            "INSERT INTO matches (id, room_id, seed, content_pack_version, fairness_params_version,
                 seats, race_group, started_at, ended_at, recap)
             VALUES ($1, $2, $3, $4, $5, $6, 0, now() - make_interval(days => $7),
                 now() - make_interval(days => $7) + interval '4 minutes', $8)",
        )
        .bind(&game)
        .bind(&room)
        .bind((random_u64() >> 1) as i64)
        .bind(&content.version)
        .bind(FairnessParams::default().version)
        .bind(Value::Array(desks))
        .bind(days)
        .bind(json!({ "players": recap, "skills": [] }))
        .execute(&mut **tx)
        .await?;
        for (id, desk, e) in events {
            sqlx::query(
                "INSERT INTO match_answers (event_id, match_id, seat, event) VALUES ($1, $2, $3, $4)",
            )
            .bind(id)
            .bind(&game)
            .bind(desk as i16)
            .bind(e)
            .execute(&mut **tx)
            .await?;
        }
        for (i, _, points, right, stars) in &players {
            sqlx::query(
                "INSERT INTO match_seat_results (match_id, seat, class_seat_id, official, points, folded, place, stars, created_at)
                 VALUES ($1, $2, $3, true, $4, $5, $6, $7, now() - make_interval(days => $8))",
            )
            .bind(&game)
            .bind(*i as i16)
            .bind(seats[*i].0)
            .bind(*points as i32)
            .bind(*right as i32)
            .bind(place(*i) as i16)
            .bind(*stars as i16)
            .bind(days)
            .execute(&mut **tx)
            .await?;
        }
    }

    for (i, (seat_id, name)) in seats.iter().enumerate() {
        for p in 0..PRACTICES {
            let days = (p * 2 + 1) as i32;
            let play = random_hex();
            let mut right = 0i16;
            for k in 0..PRACTICE_ANSWERS {
                let (t, correct, lure, ms) = answer(&mut rng, i, k + p * 3);
                right += i16::from(correct);
                let id = format!("{play}-{k}");
                let e = event(&id, "practice", name, t, correct, lure, ms, content);
                sqlx::query(
                    "INSERT INTO seat_answers (class_seat_id, event_id, mode, skill, template_id,
                         correct, attempt, time_ms, misconception, event, received_at)
                     VALUES ($1, $2, 'practice', $3, $4, $5, 1, $6, $7, $8, now() - make_interval(days => $9))",
                )
                .bind(seat_id)
                .bind(&id)
                .bind(&t.skill)
                .bind(&t.id)
                .bind(correct)
                .bind(ms as i32)
                .bind(lure)
                .bind(e)
                .bind(days)
                .execute(&mut **tx)
                .await?;
            }
            sqlx::query(
                "INSERT INTO seat_plays (class_seat_id, client_id, kind, game, points, folded,
                     right_answers, total, duration_ms, played_at)
                 VALUES ($1, $2, 'practice', 'balloon_burst', $3, $4, $4, $5, 180000,
                     now() - make_interval(days => $6))",
            )
            .bind(seat_id)
            .bind(&play)
            .bind(i32::from(right) * 120)
            .bind(right)
            .bind(PRACTICE_ANSWERS as i16)
            .bind(days)
            .execute(&mut **tx)
            .await?;
        }
        sqlx::query(
            "UPDATE class_seats SET last_seen_at = now() - make_interval(hours => $2) WHERE id = $1",
        )
        .bind(seat_id)
        .bind(20 + i as i32)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

/// A few houses and trees for the seats in TOWNS, each on the first tile it
/// fits from the middle of its page, taken the way a student's town is.
async fn towns(db: &PgPool, class: &str, seats: &[(i64, String)]) -> Result<(), ApiError> {
    let start = sqlx::query_scalar::<_, i64>(
        "SELECT (extract(epoch FROM now() - interval '2 days') * 1000)::bigint",
    )
    .fetch_one(db)
    .await?;
    for (n, (seat, cx, cy, kind)) in TOWNS.into_iter().enumerate() {
        let Some((id, _)) = seats.get(seat) else {
            continue;
        };
        let plot = Plot {
            x: cx,
            y: cy,
            kind: kind.code().to_owned(),
        };
        place_first(db, class, *id, &plot).await?;
        let mut town = Town::default();
        let mut events = vec![TownEvent::TownLand {
            event_id: format!("sample-{n}-land"),
            at_ms: start,
            kind,
        }];
        town.apply(&events[0], u32::MAX).ok();
        // The middle tiles first, so the town sits in view.
        let mut tiles: Vec<(u8, u8)> = (0..ROWS)
            .flat_map(|y| (0..COLS).map(move |x| (x, y)))
            .collect();
        tiles.sort_by_key(|&(x, y)| {
            (i16::from(x) * 2 - 11).abs() + (i16::from(y) * 2 - 6).abs() * 2
        });
        for (k, asset) in BUILT.iter().enumerate() {
            let Some(a) = asset_by_id(asset) else {
                continue;
            };
            let Some(&(x, y)) = tiles
                .iter()
                .find(|&&(x, y)| town.fits(a, 0, x, y, 0, None).is_ok())
            else {
                continue;
            };
            let ev = TownEvent::TownPlace {
                event_id: format!("sample-{n}-{k}"),
                at_ms: start + (k as i64 + 1) * 60_000,
                asset: (*asset).to_owned(),
                land: 0,
                x,
                y,
                rot: 0,
                cols: Some(COLS),
                spot: None,
            };
            if town.apply(&ev, u32::MAX).is_ok() {
                events.push(ev);
            }
        }
        let batch: Vec<Value> = events
            .iter()
            .filter_map(|e| serde_json::to_value(e).ok())
            .collect();
        take(db, class, *id, i16::from(GRADE), &batch).await?;
    }
    Ok(())
}

/// Makes one sample teacher with a class that has played: the token, and the
/// class's code and first seat card so the visitor can sign in to the game too.
pub(crate) async fn make(db: &PgPool, content: &Content) -> Result<Value, ApiError> {
    sweep(db).await?;
    let recent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM demo_teachers WHERE created_at > now() - interval '1 hour'",
    )
    .fetch_one(db)
    .await?;
    if recent >= PER_HOUR {
        return Err(ApiError(StatusCode::TOO_MANY_REQUESTS, "busy"));
    }
    let token = format!("{PREFIX}{}{}", random_hex(), random_hex());
    let mut tx = db.begin().await?;
    let user: i64 = sqlx::query_scalar(
        "INSERT INTO users (firebase_uid, email, email_verified, display_name, sign_in_provider)
         VALUES ($1, '', false, 'Sample Teacher', 'demo') RETURNING id",
    )
    .bind(format!("demo:{}", random_hex()))
    .fetch_one(&mut *tx)
    .await?;
    let org: i64 = sqlx::query_scalar(
        "INSERT INTO organizations (name, kind, country) VALUES ('Numeria Sample School', 'school', 'ID')
         RETURNING id",
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, 'owner')")
        .bind(user)
        .bind(org)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO organizer_approvals (user_id, status, path) VALUES ($1, 'approved', 'demo')",
    )
    .bind(user)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO demo_teachers (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + make_interval(hours => $3))",
    )
    .bind(token_hash(&token))
    .bind(user)
    .bind(HOURS)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let new: NewClass = serde_json::from_value(json!({
        "label": "5A",
        "grade": GRADE,
        "school_year": school_year(),
        "seats": SEATS,
    }))
    .map_err(|_| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "internal"))?;
    let made = create_class(db, user, Allowance::Full, &new).await?;
    let class = made["class"]["id"].as_str().unwrap_or_default().to_owned();
    let seats: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, pseudonym FROM class_seats WHERE class_id = $1 ORDER BY number")
            .bind(&class)
            .fetch_all(db)
            .await?;
    let mut tx = db.begin().await?;
    seed(&mut tx, content, user, &class, &seats).await?;
    tx.commit().await?;
    towns(db, &class, &seats).await?;
    Ok(json!({
        "token": token,
        "hours": HOURS,
        "class": made["class"],
        "card": made["seats"][0],
    }))
}

/// `POST /api/demo/teacher`.
pub async fn start(Extract(state): Extract<State>) -> Result<Json<Value>, ApiError> {
    Ok(Json(make(&state.db, state.rooms.content()).await?))
}

#[cfg(test)]
mod tests;
