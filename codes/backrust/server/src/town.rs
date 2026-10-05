//! MY FOLD TOWN on the class map. Every land of a seat's town is one cell of
//! its class's map: the student picks the cell and kind of their first land,
//! and each later land joins beside their own when there is room. Classmates
//! see each other's lands by pseudonym; the teacher sees their own class by
//! seat number and nobody else's.

use axum::Json;
use axum::extract::{Path, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use foldlings_core::town::{LandKind, MAP_COLS, MAP_ROWS, next_cell, on_map};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool};

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
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT json_build_object('x', p.x, 'y', p.y, 'kind', p.kind, 'land', p.land_index,
                                  'name', s.pseudonym, 'me', s.id = $2,
                                  'seat', CASE WHEN $3 THEN s.number END)
         FROM town_plots p JOIN class_seats s ON s.id = p.class_seat_id
         WHERE p.class_id = $1
         ORDER BY p.y, p.x",
    )
    .bind(class_id)
    .bind(me.unwrap_or(0))
    .bind(teacher)
    .fetch_all(db)
    .await?;
    Ok(json!({ "cols": MAP_COLS, "rows": MAP_ROWS, "cells": rows }))
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
// Opening a land on the server comes with the town's own events.
#[cfg_attr(not(test), allow(dead_code))]
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

#[cfg(test)]
mod tests;
