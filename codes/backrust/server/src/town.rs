//! MY FOLD TOWN on the class map. Every land of a seat's town is one cell of
//! its class's map: the student picks the cell and kind of their first land,
//! and each later land joins beside their own when there is room. Classmates
//! see each other's lands by pseudonym; the teacher sees their own class by
//! seat number and nobody else's.

use axum::Json;
use axum::extract::{Path, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use foldlings_core::fairness::FairnessParams;
use foldlings_core::stars::{Landmark, SkillAnswer, landmarks, skill_stars};
use foldlings_core::town::{
    Group, LandKind, MAP_COLS, MAP_ROWS, Play, PlaySource, Refusal, Town, TownEvent, asset_by_id,
    earnings, next_cell, on_map,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool};
use std::collections::HashMap;
use std::collections::hash_map::Entry;

use crate::State;
use crate::classes::student;
use crate::organizer::{ApiError, bearer, signed_in};

/// The lands of a class, with the seat that owns each.
async fn cells(
    db: &PgPool,
    class_id: &str,
    me: Option<i64>,
    teacher: bool,
) -> Result<Value, ApiError> {
    let rows: Vec<(i64, i16, Value)> = sqlx::query_as(
        "SELECT s.id, c.grade,
                json_build_object('x', p.x, 'y', p.y, 'kind', p.kind, 'land', p.land_index,
                                  'name', s.pseudonym, 'me', s.id = $2,
                                  'seat', CASE WHEN $3 THEN s.number END)
         FROM town_plots p
         JOIN class_seats s ON s.id = p.class_seat_id
         JOIN classes c ON c.id = p.class_id
         WHERE p.class_id = $1
         ORDER BY p.y, p.x",
    )
    .bind(class_id)
    .bind(me.unwrap_or(0))
    .bind(teacher)
    .fetch_all(db)
    .await?;
    let mut conn = db.acquire().await?;
    let now_ms = chrono_now_ms(&mut conn).await?;
    let mut towns: HashMap<i64, (Town, Vec<Landmark>)> = HashMap::new();
    let mut cells = Vec::with_capacity(rows.len());
    for (seat, grade, mut cell) in rows {
        if let Entry::Vacant(e) = towns.entry(seat) {
            let earned = earnings(&plays(&mut conn, seat).await?).total;
            let (town, _) = Town::replay(&stored(&mut conn, seat).await?, earned);
            let stars = skill_stars(
                &answers(&mut conn, seat).await?,
                u8::try_from(grade).ok(),
                now_ms,
                &FairnessParams::default(),
            );
            e.insert((town, landmarks(&stars)));
        }
        let (town, raised) = &towns[&seat];
        let land = cell["land"].as_u64().unwrap_or(0) as u16;
        cell["town"] = on_the_land(town, raised, land);
        cells.push(cell);
    }
    Ok(json!({ "cols": MAP_COLS, "rows": MAP_ROWS, "cells": cells }))
}

/// What stands on one land, for its cell's icons: homes, trees, bigger
/// buildings, and the landmark of its plot once a skill raised it.
fn on_the_land(town: &Town, raised: &[Landmark], land: u16) -> Value {
    let (mut homes, mut trees, mut buildings) = (0, 0, 0);
    for it in town.items.iter().filter(|i| i.land == land) {
        let Some(a) = asset_by_id(&it.asset) else {
            continue;
        };
        if a.id.starts_with("house_") {
            homes += 1;
        } else if a.id.starts_with("tree_") {
            trees += 1;
        } else if matches!(a.group, Group::Public | Group::Large) {
            buildings += 1;
        }
    }
    let landmark = raised
        .get(usize::from(land))
        .filter(|_| usize::from(land) < town.lands.len())
        .map(|l| json!({ "mission": l.mission, "skill": l.skill }));
    json!({ "homes": homes, "trees": trees, "buildings": buildings, "landmark": landmark })
}

/// `GET /api/student/town/map`: the student's class map.
pub async fn student_map(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(ApiError(StatusCode::UNAUTHORIZED, "signed_out"))?;
    let mut out = cells(&state.db, &s.class_id, Some(s.seat_id), false).await?;
    out["class"] = json!(s.class_label);
    Ok(Json(out))
}

/// A teacher's class map; another teacher's class is not found.
pub(crate) async fn teacher_map(db: &PgPool, owner: i64, id: &str) -> Result<Value, ApiError> {
    let mine: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM classes WHERE id = $1 AND owner = $2)")
            .bind(id)
            .bind(owner)
            .fetch_one(db)
            .await?;
    if !mine {
        return Err(ApiError(StatusCode::NOT_FOUND, "class_not_found"));
    }
    cells(db, id, None, true).await
}

/// `GET /api/classes/{id}/town/map`: the teacher's class map.
pub async fn class_map(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(teacher_map(&state.db, user.id, &id).await?))
}

#[derive(Deserialize)]
pub struct Plot {
    pub(crate) x: u8,
    pub(crate) y: u8,
    pub(crate) kind: String,
}

/// The first land of a seat, at the cell the student picked.
pub(crate) async fn place_first(
    db: &PgPool,
    class_id: &str,
    seat: i64,
    plot: &Plot,
) -> Result<Value, ApiError> {
    if !on_map(plot.x, plot.y) {
        return Err(ApiError(StatusCode::BAD_REQUEST, "off_map"));
    }
    let kind = LandKind::of_code(&plot.kind).ok_or(ApiError(StatusCode::BAD_REQUEST, "kind"))?;
    let done = sqlx::query(
        "INSERT INTO town_plots (class_id, class_seat_id, land_index, kind, x, y)
         VALUES ($1, $2, 0, $3, $4, $5) ON CONFLICT DO NOTHING",
    )
    .bind(class_id)
    .bind(seat)
    .bind(kind.code())
    .bind(i16::from(plot.x))
    .bind(i16::from(plot.y))
    .execute(db)
    .await?;
    if done.rows_affected() == 0 {
        let placed: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM town_plots WHERE class_seat_id = $1 AND land_index = 0)",
        )
        .bind(seat)
        .fetch_one(db)
        .await?;
        return Err(ApiError(
            StatusCode::CONFLICT,
            if placed {
                "already_placed"
            } else {
                "cell_taken"
            },
        ));
    }
    Ok(json!({ "x": plot.x, "y": plot.y, "kind": kind, "land": 0 }))
}

/// A later land of a seat: the first free cell beside its own, or None when
/// there is none (or no first land on the map). Called inside the
/// transaction that opens the land; the class row stays locked till it ends.
pub(crate) async fn place_later(
    conn: &mut PgConnection,
    class_id: &str,
    seat: i64,
    land: i16,
    kind: LandKind,
) -> Result<Option<(u8, u8)>, ApiError> {
    sqlx::query("SELECT 1 FROM classes WHERE id = $1 FOR UPDATE")
        .bind(class_id)
        .execute(&mut *conn)
        .await?;
    let taken: Vec<(i64, i16, i16, i16)> = sqlx::query_as(
        "SELECT class_seat_id, land_index, x, y FROM town_plots WHERE class_id = $1",
    )
    .bind(class_id)
    .fetch_all(&mut *conn)
    .await?;
    let mut own: Vec<(i16, (u8, u8))> = taken
        .iter()
        .filter(|t| t.0 == seat)
        .map(|t| (t.1, (t.2 as u8, t.3 as u8)))
        .collect();
    if own.iter().any(|o| o.0 == land) {
        return Ok(None);
    }
    own.sort();
    let own: Vec<(u8, u8)> = own.into_iter().map(|o| o.1).collect();
    if own.is_empty() {
        return Ok(None);
    }
    let Some((x, y)) = next_cell(&own, |c| taken.iter().any(|t| (t.2 as u8, t.3 as u8) == c))
    else {
        return Ok(None);
    };
    sqlx::query(
        "INSERT INTO town_plots (class_id, class_seat_id, land_index, kind, x, y)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(class_id)
    .bind(seat)
    .bind(land)
    .bind(kind.code())
    .bind(i16::from(x))
    .bind(i16::from(y))
    .execute(&mut *conn)
    .await?;
    Ok(Some((x, y)))
}

/// `POST /api/student/town/plot`: the student puts their first land on the map.
pub async fn student_plot(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(plot): Json<Plot>,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(ApiError(StatusCode::UNAUTHORIZED, "signed_out"))?;
    Ok(Json(
        place_first(&state.db, &s.class_id, s.seat_id, &plot).await?,
    ))
}

// ---------------------------------------------------------------- the town

/// Events in one batch at most; a device sends the rest next time.
const MAX_BATCH: usize = 200;

/// Every play of a seat, for its Folds: the device reports practice and races
/// with robots (held to the daily limit); the server judged the rest.
async fn plays(conn: &mut PgConnection, seat: i64) -> Result<Vec<Play>, ApiError> {
    let rows: Vec<(i32, i32, bool)> = sqlx::query_as(
        "SELECT ((played_at AT TIME ZONE 'UTC')::date - DATE '1970-01-01'), GREATEST(points, 0), kind = 'board'
         FROM seat_plays WHERE class_seat_id = $1
         UNION ALL
         SELECT ((created_at AT TIME ZONE 'UTC')::date - DATE '1970-01-01'), GREATEST(points, 0), true
         FROM match_seat_results WHERE class_seat_id = $1",
    )
    .bind(seat)
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(day, points, server)| Play {
            day: day.max(0) as u32,
            points: points as u32,
            source: if server {
                PlaySource::Server
            } else {
                PlaySource::Device
            },
        })
        .collect())
}

/// Every judged answer of a seat, timed by when the server took it.
async fn answers(conn: &mut PgConnection, seat: i64) -> Result<Vec<SkillAnswer>, ApiError> {
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT (event || jsonb_build_object('at_ms', (extract(epoch FROM received_at) * 1000)::bigint))::json
         FROM seat_answers WHERE class_seat_id = $1
         UNION ALL
         SELECT (a.event || jsonb_build_object('at_ms', (extract(epoch FROM a.created_at) * 1000)::bigint))::json
         FROM match_answers a
         JOIN match_seat_results r ON r.match_id = a.match_id AND r.seat = a.seat
         WHERE r.class_seat_id = $1",
    )
    .bind(seat)
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect())
}

/// What a batch did: the ids taken (or taken before) and the ids refused.
#[derive(Default)]
pub(crate) struct Taken {
    accepted: Vec<String>,
    refused: Vec<(String, &'static str)>,
}

/// Takes a batch of a seat's town events and answers with the town as it
/// now stands: its Folds and stars worked out from what the server holds.
pub(crate) async fn take(
    db: &PgPool,
    class_id: &str,
    seat: i64,
    grade: i16,
    batch: &[Value],
) -> Result<Value, ApiError> {
    if batch.len() > MAX_BATCH {
        return Err(ApiError(StatusCode::PAYLOAD_TOO_LARGE, "too_many_events"));
    }
    let mut tx = db.begin().await?;
    sqlx::query("SELECT 1 FROM class_seats WHERE id = $1 FOR UPDATE")
        .bind(seat)
        .execute(&mut *tx)
        .await?;
    let now_ms = chrono_now_ms(&mut tx).await?;
    let earnings = earnings(&plays(&mut tx, seat).await?);
    let stored = stored(&mut tx, seat).await?;
    let (mut town, _) = Town::replay(&stored, earnings.total);
    let mut last_at = stored.iter().map(TownEvent::at_ms).max().unwrap_or(0);
    let mut out = Taken::default();
    for raw in batch {
        let id = raw["event_id"].as_str().unwrap_or_default().to_string();
        let Ok(mut ev) = serde_json::from_value::<TownEvent>(raw.clone()) else {
            out.refused.push((id, "bad_event"));
            continue;
        };
        if id.is_empty() || id.len() > 64 {
            out.refused.push((id, "bad_event"));
            continue;
        }
        // A device's clock may run ahead or behind; never past now, never
        // before what was taken already.
        last_at = ev.at_ms().clamp(last_at, now_ms.max(last_at));
        ev.set_at_ms(last_at);
        let lands_before = town.lands.len();
        match town.apply(&ev, earnings.total) {
            Ok(()) => {}
            Err(Refusal::Duplicate) => {
                out.accepted.push(id);
                continue;
            }
            Err(r) => {
                out.refused.push((id, r.code()));
                continue;
            }
        }
        sqlx::query("INSERT INTO town_events (class_seat_id, event_id, event) VALUES ($1, $2, $3)")
            .bind(seat)
            .bind(&id)
            .bind(serde_json::to_value(&ev).unwrap_or_default())
            .execute(&mut *tx)
            .await?;
        if let TownEvent::TownLand { kind, .. } = ev
            && town.lands.len() > lands_before
        {
            let land = lands_before as i16;
            let moved = sqlx::query(
                "UPDATE town_plots SET kind = $3 WHERE class_seat_id = $1 AND land_index = $2",
            )
            .bind(seat)
            .bind(land)
            .bind(kind.code())
            .execute(&mut *tx)
            .await?;
            if moved.rows_affected() == 0 && land > 0 {
                place_later(&mut tx, class_id, seat, land, kind).await?;
            }
        }
        out.accepted.push(id);
    }
    sqlx::query("DELETE FROM town_items WHERE class_seat_id = $1")
        .bind(seat)
        .execute(&mut *tx)
        .await?;
    for i in &town.items {
        sqlx::query(
            "INSERT INTO town_items (class_seat_id, place_id, asset, price, ready_at)
             VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000))",
        )
        .bind(seat)
        .bind(&i.id)
        .bind(&i.asset)
        .bind(i.price as i32)
        .bind(i.ready_at_ms() as f64)
        .execute(&mut *tx)
        .await?;
    }
    let answers = answers(&mut tx, seat).await?;
    tx.commit().await?;
    let stars = skill_stars(
        &answers,
        u8::try_from(grade).ok(),
        now_ms,
        &FairnessParams::default(),
    );
    Ok(json!({
        "accepted": out.accepted,
        "refused": out.refused,
        "town": town.view(earnings.total, now_ms),
        "earnings": earnings,
        "landmarks": landmarks(&stars),
        "stars": stars,
        "now_ms": now_ms,
    }))
}

async fn chrono_now_ms(conn: &mut PgConnection) -> Result<i64, ApiError> {
    Ok(
        sqlx::query_scalar("SELECT (extract(epoch FROM now()) * 1000)::bigint")
            .fetch_one(&mut *conn)
            .await?,
    )
}

/// The seat's events in the order the server took them.
async fn stored(conn: &mut PgConnection, seat: i64) -> Result<Vec<TownEvent>, ApiError> {
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT event::json FROM town_events WHERE class_seat_id = $1 ORDER BY seq",
    )
    .bind(seat)
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect())
}

#[derive(Deserialize)]
pub struct Batch {
    #[serde(default)]
    events: Vec<Value>,
}

/// `POST /api/student/town`: a batch of the student's town events; answers
/// with the town, every event of it, its Folds and its stars.
pub async fn student_town_post(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(batch): Json<Batch>,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(ApiError(StatusCode::UNAUTHORIZED, "signed_out"))?;
    let mut out = take(&state.db, &s.class_id, s.seat_id, s.grade, &batch.events).await?;
    out["events"] = events_json(&state.db, s.seat_id).await?;
    Ok(Json(out))
}

/// `GET /api/student/town`: the same with no new events, for a device that
/// signs in or comes back.
pub async fn student_town(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(ApiError(StatusCode::UNAUTHORIZED, "signed_out"))?;
    let mut out = take(&state.db, &s.class_id, s.seat_id, s.grade, &[]).await?;
    out["events"] = events_json(&state.db, s.seat_id).await?;
    Ok(Json(out))
}

async fn events_json(db: &PgPool, seat: i64) -> Result<Value, ApiError> {
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT event::json FROM town_events WHERE class_seat_id = $1 ORDER BY seq",
    )
    .bind(seat)
    .fetch_all(db)
    .await?;
    Ok(Value::Array(rows))
}

#[cfg(test)]
mod tests;
