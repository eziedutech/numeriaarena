//! An AI practice plan for one student, for their teacher: the one to three
//! skills most worth practising first, what the answers show and one step to
//! take for each, in English and Indonesian. Made from the same numbers as a
//! seat's insight and checked the same way; the model sees a seat number,
//! skill titles and counts, never a name. Until the admin binds the task its
//! own chain, it asks the class insight's.

use axum::Json;
use axum::extract::{Path, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::collections::BTreeSet;

use crate::State;
use crate::ai::{AiError, CLASS_INSIGHT, Gateway, PRACTICE_PLAN};
use crate::answers::class_report;
use crate::insight::{ENOUGH, allowed_numbers, check_line, first_tries, insight_input};
use crate::organizer::ApiError;
use crate::rooms::Content;

/// Changed whenever the prompt or the input changes, so old plans are made again.
const VERSION: &str = "practice-2026-10-07";
/// Plans made for sample teachers in an hour, all together.
const DEMO_HOURLY: i64 = 20;
/// Skills in a plan at most.
const MOST: usize = 3;

const SYSTEM: &str = "You help a primary school maths teacher plan practice for one student. \
The input is JSON: for each skill, the student's first tries right and first tries in all (percent is right out of all), \
and the kinds of mistakes they made, each with a title and a note. The student appears only as a seat number. \
Reply with one JSON object and nothing else: \
{\"en\": {\"note\": string, \"plan\": [{\"skill\": string, \"why\": string, \"do\": string}]}, \
\"id\": {the same in Indonesian}}. \
plan has 1 to 3 items: the skills most worth practising first, the weakest with enough tries first. \
skill is the skill's title copied exactly from the input, in English in both languages. \
why is one short sentence on what the answers show, naming the mistake if there is one. \
do is one short, concrete step for the student, written to the teacher: a few untimed rounds of \
PRACTICE ON MY OWN (BERLATIH SENDIRI in Indonesian), RACE THE ROBOTS (LOMBA LAWAN ROBOT) once they are sure, \
or a short activity with paper, objects or drawings. \
note is one plain sentence on what is going well. \
Use only numbers that are in the input; do not make up figures, and keep example numbers in tips at 10 or below. \
A skill with fewer than 3 tries has too few answers to judge. \
No links, no em dashes, no markdown, no names of people.";

fn line<'a>(v: &'a Value, field: &str, most: usize) -> Result<&'a str, String> {
    let s = v[field].as_str().ok_or(format!("no {field}"))?;
    if !(1..=most).contains(&s.chars().count()) {
        return Err(format!("{field} length"));
    }
    Ok(s)
}

/// Whether a plan may be shown: both languages, one to three skills from the
/// input, each named by its English title, and every line clean.
pub(crate) fn check_plan(input: &Value, out: &Value) -> Result<(), String> {
    let allowed = allowed_numbers(input);
    let titles: BTreeSet<&str> = input["skills"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|s| s["skill"].as_str())
        .collect();
    for lang in ["en", "id"] {
        let side = &out[lang];
        check_line(line(side, "note", 400)?, &allowed)?;
        let plan = side["plan"].as_array().ok_or("no plan")?;
        if !(1..=MOST).contains(&plan.len()) {
            return Err("plan size".into());
        }
        for item in plan {
            let skill = item["skill"].as_str().ok_or("no skill")?;
            if !titles.contains(skill) {
                return Err(format!("skill {skill}"));
            }
            check_line(line(item, "why", 300)?, &allowed)?;
            check_line(line(item, "do", 300)?, &allowed)?;
        }
    }
    Ok(())
}

/// What a plan was made from, with the prompt's version.
fn hash_of(input: &Value) -> String {
    Sha256::digest(format!("{VERSION}\n{input}").as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Only the parts shown, with each skill's code beside its title so the page
/// can link it to a lesson.
fn shown(out: &Value, report: &Value) -> Value {
    let code_of = |title: &str| {
        report["skills"]
            .as_object()
            .and_then(|m| m.iter().find(|(_, v)| v["en"] == title).map(|(k, _)| k.clone()))
            .unwrap_or_default()
    };
    let side = |s: &Value| {
        let plan: Vec<Value> = s["plan"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|p| {
                let title = p["skill"].as_str().unwrap_or("");
                json!({ "skill": code_of(title), "why": p["why"], "do": p["do"] })
            })
            .collect();
        json!({ "note": s["note"], "plan": plan })
    };
    json!({ "en": side(&out["en"]), "id": side(&out["id"]) })
}

/// A seat's plan: kept if its numbers have not changed, else asked for.
pub(crate) async fn practice_plan(
    db: &PgPool,
    content: &Content,
    ai: &Gateway,
    owner: i64,
    id: &str,
    seat: i16,
) -> Result<Value, ApiError> {
    let report = class_report(db, content, owner, id).await?;
    if seat <= 0 {
        return Err(ApiError(StatusCode::BAD_REQUEST, "seat_not_found"));
    }
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM class_seats WHERE class_id = $1 AND number = $2)",
    )
    .bind(id)
    .bind(seat)
    .fetch_one(db)
    .await?;
    if !exists {
        return Err(ApiError(StatusCode::NOT_FOUND, "seat_not_found"));
    }
    let input = insight_input(&report, seat);
    if first_tries(&input) < ENOUGH {
        return Err(ApiError(
            StatusCode::UNPROCESSABLE_ENTITY,
            "insight_too_few",
        ));
    }
    let hash = hash_of(&input);
    let kept: Option<(Value, String)> = sqlx::query_as(
        "SELECT value, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
         FROM ai_practice WHERE class_id = $1 AND seat = $2 AND data_hash = $3",
    )
    .bind(id)
    .bind(seat)
    .bind(&hash)
    .fetch_optional(db)
    .await?;
    if let Some((value, at)) = kept {
        return Ok(json!({ "plan": value, "at": at, "kept": true }));
    }
    let demo: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM demo_teachers WHERE user_id = $1)")
            .bind(owner)
            .fetch_one(db)
            .await?;
    if demo {
        let made: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM ai_practice i JOIN classes c ON c.id = i.class_id
             JOIN demo_teachers d ON d.user_id = c.owner
             WHERE i.created_at > now() - interval '1 hour'",
        )
        .fetch_one(db)
        .await?;
        if made >= DEMO_HOURLY {
            return Err(ApiError(StatusCode::TOO_MANY_REQUESTS, "insight_demo_busy"));
        }
    }
    let check = |out: &Value| check_plan(&input, out);
    let answer = match ai.ask(db, &PRACTICE_PLAN, SYSTEM, &input, check).await {
        Err(AiError::NotSetUp) => ai.ask(db, &CLASS_INSIGHT, SYSTEM, &input, check).await,
        a => a,
    }
    .map_err(|e| match e {
        AiError::Database => ApiError(StatusCode::INTERNAL_SERVER_ERROR, "database"),
        AiError::NoMasterKey => ApiError(StatusCode::SERVICE_UNAVAILABLE, "ai_not_set_up"),
        e => e.into(),
    })?;
    let value = shown(&answer.value, &report);
    let at: String = sqlx::query_scalar(
        "INSERT INTO ai_practice (class_id, seat, data_hash, value, provider, model)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (class_id, seat) DO UPDATE SET
             data_hash = EXCLUDED.data_hash, value = EXCLUDED.value, provider = EXCLUDED.provider,
             model = EXCLUDED.model, created_at = now()
         RETURNING to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')",
    )
    .bind(id)
    .bind(seat)
    .bind(&hash)
    .bind(&value)
    .bind(&answer.provider)
    .bind(&answer.model)
    .fetch_one(db)
    .await?;
    Ok(json!({ "plan": value, "at": at, "kept": false }))
}

#[derive(Deserialize)]
pub struct PracticeBody {
    seat: i16,
}

/// `POST /api/classes/{id}/practice`.
pub async fn practice(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(b): Json<PracticeBody>,
) -> Result<Json<Value>, ApiError> {
    let (user, _) = crate::classes::teacher(&state, &headers).await?;
    Ok(Json(
        practice_plan(
            &state.db,
            state.rooms.content(),
            &state.ai,
            user.id,
            &id,
            b.seat,
        )
        .await?,
    ))
}

#[cfg(test)]
mod tests;
