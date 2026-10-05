//! Global Admin, first part: the organizer gate (docs/SKEMA-PENGGUNA.md 3.2,
//! docs/ADMIN.md). An admin lists organizers by status and approves,
//! suspends or returns one to pending, always with a reason, and every change
//! goes to the audit log. Only a verified email on ADMIN_EMAILS is an admin.

use axum::Json;
use axum::extract::{Path, Query, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::State;
use crate::organizer::{ApiError, User, signed_in};

const STATUSES: [&str; 3] = ["pending", "approved", "suspended"];

async fn admin(state: &State, headers: &HeaderMap) -> Result<User, ApiError> {
    let user = signed_in(state, headers).await?;
    if !user.admin {
        tracing::info!("user {} asked for an admin page without the role", user.id);
        return Err(ApiError(StatusCode::FORBIDDEN, "not_admin"));
    }
    Ok(user)
}

#[derive(Deserialize)]
pub struct ListQuery {
    #[serde(default = "pending")]
    status: String,
}

fn pending() -> String {
    "pending".into()
}

#[derive(Serialize, sqlx::FromRow)]
pub struct OrganizerRow {
    user_id: i64,
    name: String,
    email: String,
    email_verified: bool,
    provider: String,
    status: String,
    path: String,
    org_name: Option<String>,
    org_kind: Option<String>,
    country: Option<String>,
    /// When they first signed in and when their status last changed, UTC, "YYYY-MM-DD HH:MM".
    joined: String,
    updated: String,
}

/// One organizer row, with `$tail` (a fixed filter) after it: static SQL only.
macro_rules! row_sql {
    ($tail:literal) => {
        concat!(
            "SELECT u.id AS user_id, u.display_name AS name, u.email, u.email_verified,
            u.sign_in_provider AS provider, a.status, a.path,
            o.name AS org_name, o.kind AS org_kind, o.country,
            to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS joined,
            to_char(a.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS updated
     FROM organizer_approvals a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
     LEFT JOIN organizations o ON o.id = m.org_id ",
            $tail
        )
    };
}

/// Organizers with one status, the most recently changed first.
pub async fn list(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<OrganizerRow>>, ApiError> {
    admin(&state, &headers).await?;
    if !STATUSES.contains(&q.status.as_str()) {
        return Err(ApiError(StatusCode::UNPROCESSABLE_ENTITY, "status"));
    }
    let rows = sqlx::query_as::<_, OrganizerRow>(row_sql!(
        "WHERE a.status = $1 AND a.path <> 'demo' ORDER BY a.updated_at DESC, u.id DESC LIMIT 200"
    ))
    .bind(&q.status)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct Decision {
    status: String,
    reason: String,
}

/// A decision that passed the checks: the new status and the trimmed reason.
fn validate(d: &Decision) -> Result<(&str, String), &'static str> {
    let status = d.status.as_str();
    if !STATUSES.contains(&status) {
        return Err("status");
    }
    let reason = d.reason.trim();
    if !(3..=300).contains(&reason.chars().count()) {
        return Err("reason");
    }
    Ok((status, reason.to_string()))
}

/// Sets one organizer's status, with the reason in the audit log.
pub async fn decide(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Path(user_id): Path<i64>,
    Json(body): Json<Decision>,
) -> Result<Json<OrganizerRow>, ApiError> {
    let by = admin(&state, &headers).await?;
    let (status, reason) =
        validate(&body).map_err(|why| ApiError(StatusCode::UNPROCESSABLE_ENTITY, why))?;
    let mut tx = state.db.begin().await?;
    let from: Option<String> =
        sqlx::query_scalar("SELECT status FROM organizer_approvals WHERE user_id = $1 FOR UPDATE")
            .bind(user_id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(from) = from else {
        return Err(ApiError(StatusCode::NOT_FOUND, "no_organizer"));
    };
    if from == status {
        return Err(ApiError(StatusCode::CONFLICT, "unchanged"));
    }
    // An admin's approval is the manual path; the approver is kept with it.
    sqlx::query(
        "UPDATE organizer_approvals SET
             status = $2,
             path = CASE WHEN $2 = 'approved' AND path = 'self' THEN 'manual' ELSE path END,
             approved_by = CASE WHEN $2 = 'approved' THEN $3 ELSE approved_by END,
             updated_at = now()
         WHERE user_id = $1",
    )
    .bind(user_id)
    .bind(status)
    .bind(by.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO audit_log (actor, action, target, detail) VALUES ($1, 'organizer.status', $2, $3)")
        .bind(by.id)
        .bind(format!("user:{user_id}"))
        .bind(json!({ "from": from, "to": status, "reason": reason }))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    tracing::info!(
        "admin {} set organizer {user_id} from {from} to {status}",
        by.id
    );
    let row = sqlx::query_as::<_, OrganizerRow>(row_sql!("WHERE a.user_id = $1"))
        .bind(user_id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(status: &str, reason: &str) -> Decision {
        Decision {
            status: status.into(),
            reason: reason.into(),
        }
    }

    #[test]
    fn a_decision_needs_a_known_status_and_a_reason() {
        assert_eq!(
            validate(&d("approved", "  school email checked  ")),
            Ok(("approved", "school email checked".into()))
        );
        assert_eq!(validate(&d("deleted", "spam")), Err("status"));
        assert_eq!(validate(&d("suspended", "  ")), Err("reason"));
        assert_eq!(validate(&d("suspended", &"x".repeat(301))), Err("reason"));
    }
}
