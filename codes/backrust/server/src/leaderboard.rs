//! The leaderboards: My Class (a seat's own class) and Global (every class
//! that takes part), this month or all time, in two kinds:
//!
//! - High Strike: a seat's best points in one race. Only races the server
//!   judged count (rooms for a class, rooms for anyone, FIND A RIVAL), so a
//!   score can never be sent in by a device. Points measure effort against
//!   what was expected, so a student who finds maths hard can top it too.
//!   Global takes only the usual race, so a room of longer or easier rounds
//!   cannot top it; My Class takes every race of the class.
//! - Most Days: the days a seat played in the period, any kind of play, at
//!   most one a day, so it rewards coming back rather than playing long.
//! - City Builder: the Folds in the finished buildings of a seat's Fold Town.
//!
//! The top ten show, and the asking seat's own row wherever it is; never the
//! bottom of a list. Global shows only a pseudonym and the class's grade
//! (and a sample class's label, marked as a demo). A
//! month starts on the 1st at 00:00 UTC, the same moment for everyone.

use axum::Json;
use axum::extract::{Path, Query, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};

use foldlings_core::setup::RoomSetup;

use crate::State;
use crate::classes::{audit, owned, student};
use crate::organizer::{ApiError, bearer};

/// Rows of a board, above the asking seat's own.
const TOP: i64 = 10;
/// A teacher sees their whole class.
const WHOLE_CLASS: i64 = 100;

/// The seats a board ranks: `$1` is a class, or empty for Global, which takes
/// the active classes of approved teachers that have not left it. A sample
/// class of TRY THE TEACHER PAGE takes part too, marked with its label (like
/// `5A Demo`) so nobody mistakes it for a real class; a real class's label
/// never shows.
const SCOPE: &str = "
    scope AS (
        SELECT s.id, s.pseudonym, c.grade,
               CASE WHEN EXISTS (SELECT 1 FROM demo_teachers d WHERE d.user_id = c.owner)
                    THEN c.label || ' Demo' END AS demo
        FROM class_seats s JOIN classes c ON c.id = s.class_id
        WHERE ($1 <> '' AND s.class_id = $1)
           OR ($1 = '' AND c.on_global AND c.status = 'active'
               AND EXISTS (SELECT 1 FROM users u WHERE u.id = c.owner AND u.status = 'active'
                   AND (u.global_role = 'admin' OR EXISTS (
                       SELECT 1 FROM organizer_approvals a WHERE a.user_id = u.id AND a.status = 'approved'))))
    ),
    since AS (
        SELECT CASE WHEN $2 = 'month' THEN date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                    ELSE '-infinity'::timestamptz END AS t
    )";

/// The rows of `ranked` (seat, score, place) to show: the top and the asking seat `$3`.
const ROWS: &str = "
    SELECT json_build_object('place', place, 'name', scope.pseudonym, 'grade', scope.grade,
                             'demo', scope.demo, 'score', score, 'me', seat = $3)
    FROM ranked JOIN scope ON scope.id = ranked.seat
    WHERE place <= $4 OR seat = $3
    ORDER BY place";

/// Best points in one judged race; a tie goes to whoever reached it first.
/// Global counts only rooms of the usual race (or from before rooms had a setup).
fn strike_sql() -> String {
    let usual = json!(RoomSetup::default());
    format!(
        "WITH {SCOPE},
        best AS (
            SELECT DISTINCT ON (r.class_seat_id) r.class_seat_id AS seat, r.points::bigint AS score, r.created_at AS at
            FROM match_seat_results r JOIN scope ON scope.id = r.class_seat_id
                 JOIN matches m ON m.id = r.match_id JOIN rooms ro ON ro.id = m.room_id, since
            WHERE r.created_at >= since.t AND r.points > 0
              AND ($1 <> '' OR ro.setup IS NULL OR ro.setup = '{usual}'::jsonb)
            ORDER BY r.class_seat_id, r.points DESC, r.created_at
        ),
        ranked AS (SELECT seat, score, row_number() OVER (ORDER BY score DESC, at) AS place FROM best)
        {ROWS}"
    )
}

/// Days with any play; a tie goes to whoever reached it first.
fn days_sql() -> String {
    format!(
        "WITH {SCOPE},
        played AS (
            SELECT p.class_seat_id AS seat, p.played_at AS at
            FROM seat_plays p JOIN scope ON scope.id = p.class_seat_id, since WHERE p.played_at >= since.t
            UNION ALL
            SELECT r.class_seat_id, r.created_at
            FROM match_seat_results r JOIN scope ON scope.id = r.class_seat_id, since WHERE r.created_at >= since.t
        ),
        counted AS (
            SELECT seat, count(DISTINCT (at AT TIME ZONE 'UTC')::date) AS score, max(at) AS at FROM played GROUP BY seat
        ),
        ranked AS (SELECT seat, score, row_number() OVER (ORDER BY score DESC, at) AS place FROM counted)
        {ROWS}"
    )
}

/// City Builder: the Folds in finished buildings of a seat's Fold Town that
/// stand now (this month: finished this month); a tie goes to whoever
/// finished first.
fn city_sql() -> String {
    format!(
        "WITH {SCOPE},
        built AS (
            SELECT i.class_seat_id AS seat, sum(i.price)::bigint AS score, max(i.ready_at) AS at
            FROM town_items i JOIN scope ON scope.id = i.class_seat_id, since
            WHERE i.ready_at <= now() AND i.ready_at >= since.t
            GROUP BY i.class_seat_id
            HAVING sum(i.price) > 0
        ),
        ranked AS (SELECT seat, score, row_number() OVER (ORDER BY score DESC, at) AS place FROM built)
        {ROWS}"
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Period {
    Month,
    All,
}

impl Period {
    fn parse(s: Option<&str>) -> Result<Self, ApiError> {
        match s {
            None | Some("month") => Ok(Period::Month),
            Some("all") => Ok(Period::All),
            _ => Err(ApiError(StatusCode::BAD_REQUEST, "period")),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Period::Month => "month",
            Period::All => "all",
        }
    }
}

/// Both kinds of a board: `class` is the class, or `None` for Global; `me` the asking seat.
pub(crate) async fn board(
    db: &PgPool,
    class: Option<&str>,
    period: Period,
    me: Option<i64>,
    top: i64,
) -> Result<Value, sqlx::Error> {
    let rows = |sql: String| {
        sqlx::query_scalar::<_, Value>(sqlx::AssertSqlSafe(sql))
            .bind(class.unwrap_or(""))
            .bind(period.name())
            .bind(me.unwrap_or(0))
            .bind(top)
            .fetch_all(db)
    };
    let strike = rows(strike_sql()).await?;
    let days = rows(days_sql()).await?;
    let city = rows(city_sql()).await?;
    Ok(json!({
        "board": if class.is_some() { "class" } else { "global" },
        "period": period.name(),
        "strike": strike,
        "days": days,
        "city": city,
    }))
}

#[derive(Deserialize)]
pub struct Ask {
    board: Option<String>,
    period: Option<String>,
}

/// `GET /api/leaderboard?period=`: Global, for anyone, with no row of their own.
pub async fn global(
    Extract(state): Extract<State>,
    Query(q): Query<Ask>,
) -> Result<Json<Value>, ApiError> {
    let period = Period::parse(q.period.as_deref())?;
    Ok(Json(board(&state.db, None, period, None, TOP).await?))
}

/// `GET /api/student/leaderboard?board=class|global&period=`: a signed-in seat's boards.
pub async fn for_student(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Query(q): Query<Ask>,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(ApiError(StatusCode::UNAUTHORIZED, "signed_out"))?;
    let period = Period::parse(q.period.as_deref())?;
    let class = match q.board.as_deref() {
        None | Some("class") => Some(s.class_id.as_str()),
        Some("global") => None,
        _ => return Err(ApiError(StatusCode::BAD_REQUEST, "board")),
    };
    let mut out = board(&state.db, class, period, Some(s.seat_id), TOP).await?;
    let on_global: bool = sqlx::query_scalar("SELECT on_global FROM classes WHERE id = $1")
        .bind(&s.class_id)
        .fetch_one(&state.db)
        .await?;
    out["class"] = json!(s.class_label);
    out["on_global"] = json!(on_global);
    Ok(Json(out))
}

/// `GET /api/classes/{id}/leaderboard?period=`: the teacher's class, every seat.
pub async fn for_class(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Query(q): Query<Ask>,
) -> Result<Json<Value>, ApiError> {
    let (user, _) = crate::classes::teacher(&state, &headers).await?;
    let period = Period::parse(q.period.as_deref())?;
    let on_global: Option<bool> =
        sqlx::query_scalar("SELECT on_global FROM classes WHERE id = $1 AND owner = $2")
            .bind(&id)
            .bind(user.id)
            .fetch_optional(&state.db)
            .await?;
    let on_global = on_global.ok_or(ApiError(StatusCode::NOT_FOUND, "class_not_found"))?;
    let mut out = board(&state.db, Some(&id), period, None, WHOLE_CLASS).await?;
    out["on_global"] = json!(on_global);
    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct OnGlobal {
    on: bool,
}

pub(crate) async fn set_on_global(
    db: &PgPool,
    owner: i64,
    id: &str,
    on: bool,
) -> Result<Value, ApiError> {
    let mut tx: Transaction<'_, Postgres> = db.begin().await?;
    owned(&mut tx, owner, id).await?;
    sqlx::query("UPDATE classes SET on_global = $2 WHERE id = $1")
        .bind(id)
        .bind(on)
        .execute(&mut *tx)
        .await?;
    audit(&mut tx, owner, "class.global", id, json!({ "on": on })).await?;
    tx.commit().await?;
    Ok(json!({ "on_global": on }))
}

/// `POST /api/classes/{id}/global`: the class takes part in Global, or leaves it.
pub async fn global_setting(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<OnGlobal>,
) -> Result<Json<Value>, ApiError> {
    let (user, _) = crate::classes::teacher(&state, &headers).await?;
    Ok(Json(set_on_global(&state.db, user.id, &id, body.on).await?))
}

#[cfg(test)]
mod tests;
