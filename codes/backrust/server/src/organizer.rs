//! Signed-in adults: who am I, and the organizer self-registration gate
//! (docs/SKEMA-PENGGUNA.md 3.2). A new organizer is `pending` unless their
//! verified email is on an approved school domain, and sends a proof that
//! they teach at a school for an admin to check.

use axum::Json;
use axum::extract::State as Extract;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::State;
use crate::auth::{Adult, AuthError};

/// The organizer statement the sign-up form shows. A new wording gets a new
/// version, and the client must send the version it showed.
pub const TERMS_VERSION: &str = "organizer-2026-10-07";

const ORG_KINDS: [&str; 5] = ["school", "tutoring", "community", "event", "personal"];

#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub &'static str);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!("database: {e}");
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, "database")
    }
}

impl From<AuthError> for ApiError {
    fn from(e: AuthError) -> Self {
        match e {
            AuthError::Invalid(why) => {
                tracing::info!("rejected token: {why}");
                ApiError(StatusCode::UNAUTHORIZED, "invalid_token")
            }
            AuthError::NoEmail => ApiError(StatusCode::FORBIDDEN, "email_required"),
            AuthError::KeysUnavailable(why) => {
                tracing::error!("Firebase keys: {why}");
                ApiError(StatusCode::SERVICE_UNAVAILABLE, "auth_unavailable")
            }
        }
    }
}

pub async fn health(Extract(state): Extract<State>) -> impl IntoResponse {
    let db = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
        .is_ok();
    let status = if db {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(json!({ "ok": db, "sha": state.config.git_sha })),
    )
}

#[derive(Serialize)]
pub struct Org {
    name: String,
    kind: String,
    country: String,
}

#[derive(Serialize)]
pub struct Organizer {
    status: String,
    org: Option<Org>,
    /// The admin's message with `needs_info` or `rejected`, else empty.
    note: String,
    /// The proof last sent, if any.
    proof: Option<SentProof>,
    /// While not yet verified: when the trial class pauses, UTC ISO.
    trial_until: Option<String>,
}

/// What a pending organizer sends to show they teach at a school: facts an
/// admin can check, never a document.
#[derive(Deserialize, Serialize, Debug, PartialEq, Eq, sqlx::FromRow)]
pub struct Proof {
    pub(crate) school: String,
    pub(crate) city: String,
    #[serde(default)]
    pub(crate) npsn: String,
    pub(crate) teacher_role: String,
    #[serde(default)]
    pub(crate) proof_url: String,
    #[serde(default)]
    pub(crate) school_email: String,
    #[serde(default)]
    pub(crate) head_contact: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct SentProof {
    #[serde(flatten)]
    #[sqlx(flatten)]
    proof: Proof,
    /// UTC, "YYYY-MM-DD HH:MM".
    sent: String,
}

#[derive(Serialize)]
pub struct Me {
    email: String,
    name: String,
    admin: bool,
    organizer: Option<Organizer>,
    terms_version: &'static str,
}

pub(crate) struct User {
    pub(crate) id: i64,
    pub(crate) adult: Adult,
    pub(crate) name: String,
    pub(crate) admin: bool,
}

pub(crate) fn bearer(headers: &HeaderMap) -> Result<&str, ApiError> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .ok_or(ApiError(StatusCode::UNAUTHORIZED, "no_token"))
}

/// Checks the token and records the sign-in. Admin follows the environment's
/// list on every sign-in, so removing an email there takes the role away.
pub(crate) async fn signed_in(state: &State, headers: &HeaderMap) -> Result<User, ApiError> {
    let token = bearer(headers)?;
    // A sample teacher's token is checked here, never sent to Firebase.
    let adult = if token.starts_with(crate::demo_teacher::PREFIX) {
        crate::demo_teacher::adult(&state.db, token)
            .await?
            .ok_or(ApiError(StatusCode::UNAUTHORIZED, "invalid_token"))?
    } else {
        state.verifier.verify(token).await?
    };
    let admin = adult.email_verified
        && state
            .config
            .admin_emails
            .contains(&adult.email.to_lowercase());
    let row: (i64, String, String, String) = sqlx::query_as(
        "INSERT INTO users (firebase_uid, email, email_verified, display_name, sign_in_provider, global_role)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN 'admin' ELSE 'none' END)
         ON CONFLICT (firebase_uid) DO UPDATE SET
             email = EXCLUDED.email,
             email_verified = EXCLUDED.email_verified,
             display_name = CASE WHEN users.display_name = '' THEN EXCLUDED.display_name ELSE users.display_name END,
             sign_in_provider = EXCLUDED.sign_in_provider,
             global_role = CASE WHEN $6 THEN 'admin' WHEN users.global_role = 'admin' THEN 'none' ELSE users.global_role END,
             last_seen_at = now()
         RETURNING id, display_name, global_role, status",
    )
    .bind(&adult.uid)
    .bind(&adult.email)
    .bind(adult.email_verified)
    .bind(adult.name.trim())
    .bind(&adult.provider)
    .bind(admin)
    .fetch_one(&state.db)
    .await?;
    if row.3 != "active" {
        return Err(ApiError(StatusCode::FORBIDDEN, "suspended"));
    }
    Ok(User {
        id: row.0,
        adult,
        name: row.1,
        admin: row.2 == "admin",
    })
}

/// Approval status and note, then the owned organization name, kind and country.
type OrganizerRow = (String, String, Option<String>, Option<String>, Option<String>);

async fn me_for(state: &State, user: &User) -> Result<Me, ApiError> {
    let row: Option<OrganizerRow> = sqlx::query_as(
        "SELECT a.status, a.note, o.name, o.kind, o.country
         FROM organizer_approvals a
         LEFT JOIN memberships m ON m.user_id = a.user_id AND m.role = 'owner'
         LEFT JOIN organizations o ON o.id = m.org_id
         WHERE a.user_id = $1
         ORDER BY o.id
         LIMIT 1",
    )
    .bind(user.id)
    .fetch_optional(&state.db)
    .await?;
    let organizer = match row {
        None => None,
        Some((status, note, name, kind, country)) => {
            let proof = sqlx::query_as::<_, SentProof>(
                "SELECT school, city, npsn, teacher_role, proof_url, school_email, head_contact,
                        to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS sent
                 FROM teacher_proofs WHERE user_id = $1",
            )
            .bind(user.id)
            .fetch_optional(&state.db)
            .await?;
            // The trial runs from the first class (crate::classes::OWNER_FROZEN).
            let trial_until = if matches!(status.as_str(), "pending" | "needs_info") {
                sqlx::query_scalar::<_, Option<String>>(
                    "SELECT to_char((min(created_at) + interval '14 days') AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
                     FROM classes WHERE owner = $1",
                )
                .bind(user.id)
                .fetch_one(&state.db)
                .await?
            } else {
                None
            };
            Some(Organizer {
                status,
                org: match (name, kind, country) {
                    (Some(name), Some(kind), Some(country)) => Some(Org {
                        name,
                        kind,
                        country,
                    }),
                    _ => None,
                },
                note,
                proof,
                trial_until,
            })
        }
    };
    Ok(Me {
        email: user.adult.email.clone(),
        name: user.name.clone(),
        admin: user.admin,
        organizer,
        terms_version: TERMS_VERSION,
    })
}

pub async fn me(Extract(state): Extract<State>, headers: HeaderMap) -> Result<Json<Me>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(me_for(&state, &user).await?))
}

#[derive(Deserialize)]
pub struct Registration {
    name: String,
    #[serde(default)]
    org_name: String,
    org_kind: String,
    country: String,
    terms_version: String,
    agree: bool,
}

/// A registration that passed the checks, trimmed and ready to store.
#[derive(Debug, PartialEq, Eq)]
struct Valid {
    name: String,
    org_name: String,
    org_kind: String,
    country: String,
}

fn validate(r: &Registration) -> Result<Valid, &'static str> {
    if !r.agree {
        return Err("terms_not_agreed");
    }
    if r.terms_version != TERMS_VERSION {
        return Err("terms_changed");
    }
    let name = r.name.trim();
    if !(2..=60).contains(&name.chars().count()) {
        return Err("name");
    }
    let org_name = r.org_name.trim();
    if org_name.chars().count() > 80 {
        return Err("org_name");
    }
    // No organization named: a personal workspace under the organizer's own name.
    let org_kind = if org_name.is_empty() {
        "personal"
    } else {
        r.org_kind.as_str()
    };
    if !ORG_KINDS.contains(&org_kind) || (org_kind == "personal" && !org_name.is_empty()) {
        return Err("org_kind");
    }
    let country = r.country.trim().to_uppercase();
    if country.len() != 2 || !country.chars().all(|c| c.is_ascii_uppercase()) {
        return Err("country");
    }
    Ok(Valid {
        name: name.to_string(),
        org_name: if org_name.is_empty() {
            name.to_string()
        } else {
            org_name.to_string()
        },
        org_kind: org_kind.to_string(),
        country,
    })
}

fn school_domain(email: &str, verified: bool, domains: &[String]) -> bool {
    let domain = email
        .rsplit_once('@')
        .map(|(_, d)| d.to_lowercase())
        .unwrap_or_default();
    verified && !domain.is_empty() && domains.contains(&domain)
}

pub async fn register(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(body): Json<Registration>,
) -> Result<(StatusCode, Json<Me>), ApiError> {
    let mut user = signed_in(&state, &headers).await?;
    let v = validate(&body).map_err(|why| ApiError(StatusCode::UNPROCESSABLE_ENTITY, why))?;
    let auto = school_domain(
        &user.adult.email,
        user.adult.email_verified,
        &state.config.auto_approve_domains,
    );
    let (status, path) = if auto {
        ("approved", "school_domain")
    } else {
        ("pending", "self")
    };

    let mut tx = state.db.begin().await?;
    let taken = sqlx::query_scalar::<_, i64>(
        "SELECT user_id FROM organizer_approvals WHERE user_id = $1 FOR UPDATE",
    )
    .bind(user.id)
    .fetch_optional(&mut *tx)
    .await?;
    if taken.is_some() {
        return Err(ApiError(StatusCode::CONFLICT, "already_registered"));
    }
    sqlx::query("UPDATE users SET display_name = $2 WHERE id = $1")
        .bind(user.id)
        .bind(&v.name)
        .execute(&mut *tx)
        .await?;
    let org: i64 = sqlx::query_scalar(
        "INSERT INTO organizations (name, kind, country) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(&v.org_name)
    .bind(&v.org_kind)
    .bind(&v.country)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, 'owner')")
        .bind(user.id)
        .bind(org)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO organizer_approvals (user_id, status, path) VALUES ($1, $2, $3)")
        .bind(user.id)
        .bind(status)
        .bind(path)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO consents (user_id, kind, terms_version) VALUES ($1, 'organizer_terms', $2)",
    )
    .bind(user.id)
    .bind(TERMS_VERSION)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO audit_log (actor, action, target, detail) VALUES ($1, 'organizer.register', $2, $3)")
        .bind(user.id)
        .bind(format!("user:{}", user.id))
        .bind(json!({ "status": status, "path": path, "org": org }))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    tracing::info!("organizer {} registered, {status} ({path})", user.id);

    user.name = v.name;
    Ok((StatusCode::CREATED, Json(me_for(&state, &user).await?)))
}

fn length(s: &str, range: std::ops::RangeInclusive<usize>) -> bool {
    range.contains(&s.chars().count())
}

/// A proof that passed the checks, trimmed: a school, its city and the
/// teacher's role, and a school page or a school email an admin can check.
fn validate_proof(p: &Proof) -> Result<Proof, &'static str> {
    let school = p.school.trim();
    if !length(school, 2..=120) {
        return Err("school");
    }
    let city = p.city.trim();
    if !length(city, 2..=60) {
        return Err("city");
    }
    let npsn: String = p.npsn.split_whitespace().collect::<String>().to_uppercase();
    if !npsn.is_empty() && !(npsn.len() == 8 && npsn.chars().all(|c| c.is_ascii_alphanumeric())) {
        return Err("npsn");
    }
    let role = p.teacher_role.trim();
    if !length(role, 2..=60) {
        return Err("teacher_role");
    }
    let url = p.proof_url.trim();
    let web = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .and_then(|rest| rest.split('/').next())
        .is_some_and(|host| host.contains('.') && !host.starts_with('.'));
    if !url.is_empty() && (!web || url.len() > 300 || url.chars().any(char::is_whitespace)) {
        return Err("proof_url");
    }
    let email = p.school_email.trim().to_lowercase();
    let mail = email
        .split_once('@')
        .is_some_and(|(who, domain)| !who.is_empty() && domain.contains('.') && !domain.contains('@'));
    if !email.is_empty() && (!mail || email.len() > 120 || email.chars().any(char::is_whitespace)) {
        return Err("school_email");
    }
    if url.is_empty() && email.is_empty() {
        return Err("proof");
    }
    let head = p.head_contact.trim();
    if !length(head, 0..=120) {
        return Err("head_contact");
    }
    Ok(Proof {
        school: school.to_string(),
        city: city.to_string(),
        npsn,
        teacher_role: role.to_string(),
        proof_url: url.to_string(),
        school_email: email,
        head_contact: head.to_string(),
    })
}

/// `POST /api/organizer/proof`: a pending organizer's proof, sent again as
/// often as needed while they wait or after an admin asked for more, which
/// puts them back in the queue.
pub async fn send_proof(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(body): Json<Proof>,
) -> Result<Json<Me>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    let p = validate_proof(&body).map_err(|why| ApiError(StatusCode::UNPROCESSABLE_ENTITY, why))?;
    let mut tx = state.db.begin().await?;
    let from: Option<String> =
        sqlx::query_scalar("SELECT status FROM organizer_approvals WHERE user_id = $1 FOR UPDATE")
            .bind(user.id)
            .fetch_optional(&mut *tx)
            .await?;
    match from.as_deref() {
        None => return Err(ApiError(StatusCode::FORBIDDEN, "not_organizer")),
        Some("pending" | "needs_info") => {}
        Some(_) => return Err(ApiError(StatusCode::CONFLICT, "proof_closed")),
    }
    sqlx::query(
        "INSERT INTO teacher_proofs
             (user_id, school, city, npsn, teacher_role, proof_url, school_email, head_contact)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) DO UPDATE SET
             school = EXCLUDED.school,
             city = EXCLUDED.city,
             npsn = EXCLUDED.npsn,
             teacher_role = EXCLUDED.teacher_role,
             proof_url = EXCLUDED.proof_url,
             school_email = EXCLUDED.school_email,
             head_contact = EXCLUDED.head_contact,
             sent_at = now()",
    )
    .bind(user.id)
    .bind(&p.school)
    .bind(&p.city)
    .bind(&p.npsn)
    .bind(&p.teacher_role)
    .bind(&p.proof_url)
    .bind(&p.school_email)
    .bind(&p.head_contact)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE organizer_approvals SET status = 'pending', note = '', updated_at = now()
         WHERE user_id = $1",
    )
    .bind(user.id)
    .execute(&mut *tx)
    .await?;
    // The audit log keeps that a proof came, not what it says.
    sqlx::query("INSERT INTO audit_log (actor, action, target, detail) VALUES ($1, 'organizer.proof', $2, $3)")
        .bind(user.id)
        .bind(format!("user:{}", user.id))
        .bind(json!({ "from": from }))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    tracing::info!("organizer {} sent a proof", user.id);
    Ok(Json(me_for(&state, &user).await?))
}

#[cfg(test)]
mod tests {
    use super::*;

    type Change = fn(&mut Registration);
    type ProofChange = fn(&mut Proof);

    fn proof() -> Proof {
        Proof {
            school: " SD Harapan 1 ".into(),
            city: "Bandung".into(),
            npsn: "2020 1234".into(),
            teacher_role: "Guru kelas 5".into(),
            proof_url: "https://sdharapan.sch.id/guru".into(),
            school_email: "".into(),
            head_contact: "".into(),
        }
    }

    #[test]
    fn a_proof_is_trimmed_and_needs_a_page_or_a_school_email() {
        let p = validate_proof(&proof()).unwrap();
        assert_eq!((p.school.as_str(), p.npsn.as_str()), ("SD Harapan 1", "20201234"));
        let mut by_mail = proof();
        by_mail.proof_url = " ".into();
        by_mail.school_email = " Rina@SDHarapan.sch.id ".into();
        assert_eq!(validate_proof(&by_mail).unwrap().school_email, "rina@sdharapan.sch.id");
        let mut abroad = proof();
        abroad.npsn = "".into();
        assert!(validate_proof(&abroad).is_ok());
    }

    #[test]
    fn refuses_a_proof_an_admin_cannot_check() {
        let cases: [(ProofChange, &str); 9] = [
            (|p| p.school = "S".into(), "school"),
            (|p| p.city = " ".into(), "city"),
            (|p| p.npsn = "1234".into(), "npsn"),
            (|p| p.teacher_role = "".into(), "teacher_role"),
            (|p| p.proof_url = "sdharapan.sch.id".into(), "proof_url"),
            (|p| p.proof_url = "https://localhost/x".into(), "proof_url"),
            (|p| p.school_email = "rina@".into(), "school_email"),
            (|p| p.proof_url = "".into(), "proof"),
            (|p| p.head_contact = "x".repeat(121), "head_contact"),
        ];
        for (change, why) in cases {
            let mut p = proof();
            change(&mut p);
            assert_eq!(validate_proof(&p), Err(why), "{why}");
        }
    }

    fn reg() -> Registration {
        Registration {
            name: "  Rina Putri ".into(),
            org_name: "SD Harapan".into(),
            org_kind: "school".into(),
            country: "id".into(),
            terms_version: TERMS_VERSION.into(),
            agree: true,
        }
    }

    #[test]
    fn a_school_registration_is_trimmed() {
        let v = validate(&reg()).unwrap();
        assert_eq!(v.name, "Rina Putri");
        assert_eq!(v.org_name, "SD Harapan");
        assert_eq!(v.org_kind, "school");
        assert_eq!(v.country, "ID");
    }

    #[test]
    fn no_organization_means_a_personal_workspace() {
        let mut r = reg();
        r.org_name = " ".into();
        let v = validate(&r).unwrap();
        assert_eq!(
            (v.org_kind.as_str(), v.org_name.as_str()),
            ("personal", "Rina Putri")
        );
    }

    #[test]
    fn refuses_what_the_gate_needs() {
        let cases: [(Change, &str); 7] = [
            (|r| r.agree = false, "terms_not_agreed"),
            (|r| r.terms_version = "old".into(), "terms_changed"),
            (|r| r.name = "R".into(), "name"),
            (|r| r.org_name = "x".repeat(81), "org_name"),
            (|r| r.org_kind = "personal".into(), "org_kind"),
            (|r| r.org_kind = "palace".into(), "org_kind"),
            (|r| r.country = "IDN".into(), "country"),
        ];
        for (change, why) in cases {
            let mut r = reg();
            change(&mut r);
            assert_eq!(validate(&r), Err(why));
        }
    }

    #[test]
    fn only_verified_listed_domains_skip_the_queue() {
        let domains = vec!["school.example".to_string()];
        assert!(school_domain("rina@School.Example", true, &domains));
        assert!(!school_domain("rina@school.example", false, &domains));
        assert!(!school_domain("rina@gmail.com", true, &domains));
        assert!(!school_domain("no-at-sign", true, &domains));
    }
}
