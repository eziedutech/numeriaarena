//! AI insights for a class's teacher: the same numbers as the report, for the
//! whole class or one seat, read by a model into what is strong, what needs
//! work and what to do next, in English and Indonesian. The model sees seat
//! numbers, skill titles and counts, never a name, and every answer is
//! checked against those numbers before the teacher sees it.

use axum::Json;
use axum::extract::{Path, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::collections::{BTreeMap, BTreeSet};

use crate::State;
use crate::ai::{AiError, CLASS_INSIGHT, Gateway};
use crate::answers::class_report;
use crate::organizer::ApiError;
use crate::rooms::Content;

/// Changed whenever the prompt or the input changes, so old insights are made again.
const VERSION: &str = "insight-2026-10-05";

/// First tries the class (or seat) needs before a model is asked.
pub(crate) const ENOUGH: i64 = 5;
/// A seat with this many first tries in a skill and under half right needs help there.
const SEAT_ENOUGH: i64 = 3;
/// Insights made for sample teachers in an hour, all together.
const DEMO_HOURLY: i64 = 20;

const SYSTEM: &str = "You help a primary school maths teacher read their class's practice results. \
The input is JSON: for each skill, first tries right and first tries in all (percent is right out of all), \
and the kinds of mistakes made, each with a title and a note. Students appear only as seat numbers. \
Reply with one JSON object and nothing else: \
{\"en\": {\"summary\": string, \"strengths\": [string], \"gaps\": [string], \"next\": [string]}, \
\"id\": {the same in Indonesian}}. \
summary is two or three plain sentences. strengths, gaps and next have at most 3 short items each; \
next gives concrete classroom steps for the gaps. \
Name skills and mistakes by their titles, never by codes with underscores. \
Use only numbers that are in the input; do not make up figures, and keep example numbers in tips at 10 or below. \
A skill with fewer than 5 tries has too few answers to judge. \
No links, no em dashes, no markdown, no names of people.";

/// A skill's first tries right and in all, and the same per seat.
type SkillSum = (i64, i64, BTreeMap<i64, (i64, i64)>);

/// The numbers for the model, built from the report; `seat` 0 is the whole class.
pub(crate) fn insight_input(report: &Value, seat: i16) -> Value {
    let skill_title = |code: &str| {
        report["skills"][code]["en"]
            .as_str()
            .unwrap_or(code)
            .to_owned()
    };
    let mut skills: BTreeMap<String, SkillSum> = BTreeMap::new();
    for r in report["rows"].as_array().into_iter().flatten() {
        let n = r["seat"].as_i64().unwrap_or(0);
        if seat != 0 && n != i64::from(seat) {
            continue;
        }
        let (right, total) = (
            r["right"].as_i64().unwrap_or(0),
            r["total"].as_i64().unwrap_or(0),
        );
        let s = skills
            .entry(r["skill"].as_str().unwrap_or("").to_owned())
            .or_default();
        s.0 += right;
        s.1 += total;
        let p = s.2.entry(n).or_default();
        p.0 += right;
        p.1 += total;
    }
    let mut skills: Vec<_> = skills.into_iter().collect();
    // Most answered first.
    skills.sort_by(|a, b| b.1.1.cmp(&a.1.1).then(a.0.cmp(&b.0)));
    let seats: BTreeSet<i64> = skills.iter().flat_map(|s| s.1.2.keys().copied()).collect();
    let skills: Vec<Value> = skills
        .iter()
        .take(30)
        .map(|(code, (right, total, per_seat))| {
            let mut v = json!({
                "skill": skill_title(code),
                "right": right,
                "tries": total,
                "percent": percent(*right, *total),
            });
            if seat == 0 {
                let help: Vec<i64> = per_seat
                    .iter()
                    .filter(|(_, (r, t))| *t >= SEAT_ENOUGH && r * 2 < *t)
                    .map(|(n, _)| *n)
                    .collect();
                v["seats_tried"] = json!(per_seat.len());
                v["seats_needing_help"] = json!(help);
            }
            v
        })
        .collect();
    // Kind of mistake: skill, times, seats.
    let mut mistakes: BTreeMap<String, (String, i64, BTreeSet<i64>)> = BTreeMap::new();
    for m in report["mistakes"].as_array().into_iter().flatten() {
        let n = m["seat"].as_i64().unwrap_or(0);
        if seat != 0 && n != i64::from(seat) {
            continue;
        }
        let e = mistakes
            .entry(m["misconception"].as_str().unwrap_or("").to_owned())
            .or_insert_with(|| {
                (
                    m["skill"].as_str().unwrap_or("").to_owned(),
                    0,
                    BTreeSet::new(),
                )
            });
        e.1 += m["count"].as_i64().unwrap_or(0);
        e.2.insert(n);
    }
    let mut mistakes: Vec<_> = mistakes.into_iter().collect();
    mistakes.sort_by(|a, b| b.1.1.cmp(&a.1.1).then(a.0.cmp(&b.0)));
    let mistakes: Vec<Value> = mistakes
        .iter()
        .take(15)
        .map(|(code, (skill, times, who))| {
            let words = &report["misconceptions"][code];
            let mut v = json!({
                "mistake": words["title"]["en"].as_str().map(str::to_owned).unwrap_or_else(|| code.replace('_', " ")),
                "note": words["note"]["en"],
                "skill": skill_title(skill),
                "times": times,
            });
            if seat == 0 {
                v["seats"] = json!(who.len());
            }
            v
        })
        .collect();
    let mut input = Map::new();
    if seat == 0 {
        input.insert("scope".into(), json!("whole class"));
        input.insert("seats_with_answers".into(), json!(seats.len()));
    } else {
        input.insert("scope".into(), json!(format!("one student, seat {seat}")));
    }
    input.insert("skills".into(), json!(skills));
    input.insert("mistakes".into(), json!(mistakes));
    Value::Object(input)
}

fn percent(right: i64, total: i64) -> i64 {
    if total == 0 {
        0
    } else {
        (right * 200 + total) / (total * 2)
    }
}

pub(crate) fn first_tries(input: &Value) -> i64 {
    input["skills"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|s| s["tries"].as_i64().unwrap_or(0))
        .sum()
}

/// Every whole number in the input, the ones the model may write.
fn numbers_in(v: &Value, out: &mut BTreeSet<u64>) {
    match v {
        Value::Number(n) => {
            if let Some(n) = n.as_u64() {
                out.insert(n);
            }
        }
        Value::String(s) => out.extend(numbers_of(s)),
        Value::Array(a) => a.iter().for_each(|x| numbers_in(x, out)),
        Value::Object(o) => o.values().for_each(|x| numbers_in(x, out)),
        _ => {}
    }
}

fn numbers_of(s: &str) -> Vec<u64> {
    s.split(|c: char| !c.is_ascii_digit())
        .filter(|d| !d.is_empty())
        .filter_map(|d| d.parse().ok())
        .collect()
}

fn texts(side: &Value) -> Result<Vec<&str>, String> {
    let summary = side["summary"].as_str().ok_or("no summary")?;
    if !(1..=600).contains(&summary.chars().count()) {
        return Err("summary length".into());
    }
    let mut all = vec![summary];
    for list in ["strengths", "gaps", "next"] {
        let items = side[list].as_array().ok_or(format!("no {list}"))?;
        if items.len() > 4 {
            return Err(format!("too many {list}"));
        }
        for item in items {
            let s = item.as_str().ok_or(format!("{list} not text"))?;
            if !(1..=300).contains(&s.chars().count()) {
                return Err(format!("{list} length"));
            }
            all.push(s);
        }
    }
    Ok(all)
}

/// The whole numbers a model may write about `input`.
pub(crate) fn allowed_numbers(input: &Value) -> BTreeSet<u64> {
    let mut allowed = BTreeSet::new();
    numbers_in(input, &mut allowed);
    allowed
}

/// One line of an answer: no dashes, links or codes, and no number over 10 the input does not have.
pub(crate) fn check_line(s: &str, allowed: &BTreeSet<u64>) -> Result<(), String> {
    if s.contains(['\u{2014}', '\u{2013}']) {
        return Err("dash".into());
    }
    let lower = s.to_lowercase();
    if lower.contains("http") || lower.contains("www.") || s.contains("](") {
        return Err("link".into());
    }
    if s.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .any(|w| w.contains('_'))
    {
        return Err("code".into());
    }
    if let Some(n) = numbers_of(s)
        .into_iter()
        .find(|n| *n > 10 && !allowed.contains(n))
    {
        return Err(format!("number {n}"));
    }
    Ok(())
}

/// Whether an answer may be shown: both languages in the shape asked for,
/// no links or codes, and no number the input does not have.
pub(crate) fn check_insight(input: &Value, out: &Value) -> Result<(), String> {
    let allowed = allowed_numbers(input);
    for lang in ["en", "id"] {
        for s in texts(&out[lang])? {
            check_line(s, &allowed)?;
        }
    }
    Ok(())
}

/// What an insight was made from, with the prompt's version.
pub(crate) fn hash_of(input: &Value) -> String {
    Sha256::digest(format!("{VERSION}\n{input}").as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Only the parts shown, so a model's extra fields are not kept.
fn shown(out: &Value) -> Value {
    let side = |s: &Value| json!({ "summary": s["summary"], "strengths": s["strengths"], "gaps": s["gaps"], "next": s["next"] });
    json!({ "en": side(&out["en"]), "id": side(&out["id"]) })
}

/// The insight for the class or a seat: kept if the numbers have not changed, else asked for.
pub(crate) async fn class_insight(
    db: &PgPool,
    content: &Content,
    ai: &Gateway,
    owner: i64,
    id: &str,
    seat: i16,
) -> Result<Value, ApiError> {
    let report = class_report(db, content, owner, id).await?;
    if seat != 0 {
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
         FROM ai_insights WHERE class_id = $1 AND seat = $2 AND data_hash = $3",
    )
    .bind(id)
    .bind(seat)
    .bind(&hash)
    .fetch_optional(db)
    .await?;
    if let Some((value, at)) = kept {
        return Ok(json!({ "insight": value, "at": at, "kept": true }));
    }
    let demo: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM demo_teachers WHERE user_id = $1)")
            .bind(owner)
            .fetch_one(db)
            .await?;
    if demo {
        let made: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM ai_insights i JOIN classes c ON c.id = i.class_id
             JOIN demo_teachers d ON d.user_id = c.owner
             WHERE i.created_at > now() - interval '1 hour'",
        )
        .fetch_one(db)
        .await?;
        if made >= DEMO_HOURLY {
            return Err(ApiError(StatusCode::TOO_MANY_REQUESTS, "insight_demo_busy"));
        }
    }
    let answer = ai
        .ask(db, &CLASS_INSIGHT, SYSTEM, &input, |out| {
            check_insight(&input, out)
        })
        .await
        .map_err(|e| match e {
            AiError::Database => ApiError(StatusCode::INTERNAL_SERVER_ERROR, "database"),
            // A key that cannot be opened reads to a teacher like AI being off.
            AiError::NoMasterKey => ApiError(StatusCode::SERVICE_UNAVAILABLE, "ai_not_set_up"),
            e => e.into(),
        })?;
    let value = shown(&answer.value);
    let at: String = sqlx::query_scalar(
        "INSERT INTO ai_insights (class_id, seat, data_hash, value, provider, model)
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
    Ok(json!({ "insight": value, "at": at, "kept": false }))
}

#[derive(Deserialize)]
pub struct InsightBody {
    /// 0 or absent for the whole class.
    #[serde(default)]
    seat: i16,
}

/// `POST /api/classes/{id}/insight`.
pub async fn insight(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(b): Json<InsightBody>,
) -> Result<Json<Value>, ApiError> {
    let (user, _) = crate::classes::teacher(&state, &headers).await?;
    Ok(Json(
        class_insight(
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
