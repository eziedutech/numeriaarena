//! The admin's AI page: providers with their sealed keys, which provider and
//! model each task uses, the monthly budget, and the call log. Every change
//! goes to the audit log; a key is never sent back, only its last four
//! characters.

use axum::Json;
use axum::extract::{Path, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};

use super::{AiError, TASKS, month_spent, task};
use crate::State;
use crate::organizer::{ApiError, User, signed_in};

async fn admin(state: &State, headers: &HeaderMap) -> Result<User, ApiError> {
    let user = signed_in(state, headers).await?;
    if !user.admin {
        return Err(ApiError(StatusCode::FORBIDDEN, "not_admin"));
    }
    Ok(user)
}

impl From<AiError> for ApiError {
    fn from(e: AiError) -> Self {
        match e {
            AiError::NotSetUp => ApiError(StatusCode::SERVICE_UNAVAILABLE, "ai_not_set_up"),
            AiError::Budget => ApiError(StatusCode::SERVICE_UNAVAILABLE, "ai_budget"),
            AiError::Failed => ApiError(StatusCode::BAD_GATEWAY, "ai_failed"),
            AiError::NoMasterKey => ApiError(StatusCode::SERVICE_UNAVAILABLE, "ai_master_key"),
            AiError::Database => ApiError(StatusCode::INTERNAL_SERVER_ERROR, "database"),
        }
    }
}

fn unprocessable(why: &'static str) -> ApiError {
    ApiError(StatusCode::UNPROCESSABLE_ENTITY, why)
}

async fn audit(
    state: &State,
    by: i64,
    action: &str,
    target: &str,
    detail: Value,
) -> Result<(), ApiError> {
    sqlx::query("INSERT INTO audit_log (actor, action, target, detail) VALUES ($1, $2, $3, $4)")
        .bind(by)
        .bind(action)
        .bind(target)
        .bind(detail)
        .execute(&state.db)
        .await?;
    Ok(())
}

/// Everything the page shows at once.
pub(crate) async fn overview_json(state: &State) -> Result<Value, ApiError> {
    let providers: Vec<Value> = sqlx::query_scalar(
        "SELECT json_build_object(
             'code', p.code, 'label', p.label, 'kind', p.kind, 'base_url', p.base_url,
             'has_key', p.key_cipher IS NOT NULL, 'key_tail', p.key_tail,
             'student_data', p.student_data, 'active', p.active, 'last_test', p.last_test,
             'tasks', COALESCE((SELECT json_agg(DISTINCT b.task) FROM ai_task_bindings b
                                WHERE b.provider_id = p.id), '[]'::json))
         FROM ai_providers p ORDER BY p.code",
    )
    .fetch_all(&state.db)
    .await?;
    let bindings: Vec<Value> = sqlx::query_scalar(
        "SELECT json_build_object('task', b.task, 'rank', b.rank, 'provider', p.code,
             'model', b.model, 'max_tokens', b.max_tokens, 'temperature', b.temperature,
             'price_in', b.price_in, 'price_out', b.price_out)
         FROM ai_task_bindings b JOIN ai_providers p ON p.id = b.provider_id
         ORDER BY b.task, b.rank",
    )
    .fetch_all(&state.db)
    .await?;
    let tasks: Vec<Value> = TASKS
        .iter()
        .map(|t| {
            let chain: Vec<&Value> = bindings.iter().filter(|b| b["task"] == t.code).collect();
            json!({ "code": t.code, "student_data": t.student_data, "chain": chain })
        })
        .collect();
    let budget: i64 = sqlx::query_scalar("SELECT monthly_budget FROM ai_settings")
        .fetch_one(&state.db)
        .await?;
    let spent = month_spent(&state.db).await?;
    Ok(json!({
        "master_key": state.ai.has_master(),
        "providers": providers,
        "tasks": tasks,
        "budget": { "monthly": budget, "spent": spent },
    }))
}

/// `GET /api/admin/ai`.
pub async fn overview(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    admin(&state, &headers).await?;
    Ok(Json(overview_json(&state).await?))
}

#[derive(Deserialize)]
pub struct ProviderBody {
    code: String,
    label: String,
    kind: String,
    base_url: String,
    /// Empty keeps the key it has.
    #[serde(default)]
    key: String,
    #[serde(default)]
    student_data: bool,
    #[serde(default = "yes")]
    active: bool,
}

fn yes() -> bool {
    true
}

/// What is wrong with a provider as sent, checked before the database does.
pub(crate) fn provider_problem(b: &ProviderBody) -> Option<&'static str> {
    let code_ok = (2..=32).contains(&b.code.len())
        && b.code
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_');
    if !code_ok {
        return Some("ai_code");
    }
    if !(1..=80).contains(&b.label.trim().chars().count()) {
        return Some("ai_label");
    }
    if b.kind != "openai" && b.kind != "bedrock" {
        return Some("ai_kind");
    }
    let url = b.base_url.trim();
    let local = ["http://localhost", "http://127.0.0.1"].iter().any(|p| {
        url.strip_prefix(p)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with([':', '/']))
    });
    if !(url.len() > 8 && url.starts_with("https://") || local) || url.len() > 300 {
        return Some("ai_url");
    }
    if b.key.len() > 4000 {
        return Some("ai_key");
    }
    None
}

/// `POST /api/admin/ai/providers`: adds a provider or changes one.
pub async fn save_provider(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(b): Json<ProviderBody>,
) -> Result<Json<Value>, ApiError> {
    let by = admin(&state, &headers).await?;
    if let Some(why) = provider_problem(&b) {
        return Err(unprocessable(why));
    }
    let key = b.key.trim();
    let sealed = if key.is_empty() {
        None
    } else {
        Some(state.ai.seal(&b.code, key)?)
    };
    let tail: String = key
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let new: bool = sqlx::query_scalar(
        "INSERT INTO ai_providers (code, label, kind, base_url, key_cipher, key_tail, student_data, active)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, ''), $7, $8)
         ON CONFLICT (code) DO UPDATE SET
             label = EXCLUDED.label, kind = EXCLUDED.kind, base_url = EXCLUDED.base_url,
             key_cipher = COALESCE($5, ai_providers.key_cipher),
             key_tail = COALESCE($6, ai_providers.key_tail),
             student_data = EXCLUDED.student_data, active = EXCLUDED.active,
             -- A new address or key has not been tested yet.
             last_test = CASE WHEN $5 IS NULL AND ai_providers.base_url = EXCLUDED.base_url
                              THEN ai_providers.last_test END,
             updated_at = now()
         RETURNING (xmax = 0)",
    )
    .bind(&b.code)
    .bind(b.label.trim())
    .bind(&b.kind)
    .bind(b.base_url.trim().trim_end_matches('/'))
    .bind(&sealed)
    .bind(sealed.as_ref().map(|_| tail))
    .bind(b.student_data)
    .bind(b.active)
    .fetch_one(&state.db)
    .await?;
    audit(
        &state,
        by.id,
        if new {
            "ai.provider.add"
        } else {
            "ai.provider.change"
        },
        &format!("ai_provider:{}", b.code),
        json!({ "kind": b.kind, "base_url": b.base_url.trim(), "new_key": sealed.is_some(),
                "student_data": b.student_data, "active": b.active }),
    )
    .await?;
    Ok(Json(overview_json(&state).await?))
}

/// `DELETE /api/admin/ai/providers/{code}`: refused while a task still uses it.
pub async fn delete_provider(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Path(code): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let by = admin(&state, &headers).await?;
    let used: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM ai_task_bindings b JOIN ai_providers p ON p.id = b.provider_id
                        WHERE p.code = $1)",
    )
    .bind(&code)
    .fetch_one(&state.db)
    .await?;
    if used {
        return Err(ApiError(StatusCode::CONFLICT, "ai_provider_in_use"));
    }
    let gone = sqlx::query("DELETE FROM ai_providers WHERE code = $1")
        .bind(&code)
        .execute(&state.db)
        .await?
        .rows_affected();
    if gone == 0 {
        return Err(ApiError(StatusCode::NOT_FOUND, "ai_no_provider"));
    }
    audit(
        &state,
        by.id,
        "ai.provider.delete",
        &format!("ai_provider:{code}"),
        json!({}),
    )
    .await?;
    Ok(Json(overview_json(&state).await?))
}

#[derive(Deserialize)]
pub struct TestBody {
    #[serde(default)]
    model: Option<String>,
}

/// `POST /api/admin/ai/providers/{code}/test`: the model list, or one tiny call.
pub async fn test_provider(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Path(code): Path<String>,
    Json(b): Json<TestBody>,
) -> Result<Json<Value>, ApiError> {
    admin(&state, &headers).await?;
    let row: Option<(String, String, Option<Vec<u8>>)> =
        sqlx::query_as("SELECT kind, base_url, key_cipher FROM ai_providers WHERE code = $1")
            .bind(&code)
            .fetch_optional(&state.db)
            .await?;
    let (kind, base_url, cipher) = row.ok_or(ApiError(StatusCode::NOT_FOUND, "ai_no_provider"))?;
    let cipher = cipher.ok_or(unprocessable("ai_no_key"))?;
    let key = state.ai.open(&code, &cipher)?;
    let model = b.model.as_deref().map(str::trim).filter(|m| !m.is_empty());
    let mut result = state.ai.probe(&kind, &base_url, &key, model).await;
    result["at"] = json!(chrono_now(&state).await?);
    // The list may be long; the row keeps whether it worked and how fast.
    let kept = json!({ "ok": result["ok"], "latency_ms": result["latency_ms"], "model": result["model"],
                       "models": result["models"].as_array().map(Vec::len), "error": result["error"], "at": result["at"] });
    sqlx::query("UPDATE ai_providers SET last_test = $2 WHERE code = $1")
        .bind(&code)
        .bind(kept)
        .execute(&state.db)
        .await?;
    Ok(Json(result))
}

async fn chrono_now(state: &State) -> Result<String, sqlx::Error> {
    sqlx::query_scalar("SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')")
        .fetch_one(&state.db)
        .await
}

#[derive(Deserialize)]
pub struct Link {
    provider: String,
    model: String,
    #[serde(default = "max_tokens")]
    max_tokens: i32,
    #[serde(default)]
    temperature: Option<f32>,
    #[serde(default)]
    price_in: i64,
    #[serde(default)]
    price_out: i64,
}

fn max_tokens() -> i32 {
    8000
}

#[derive(Deserialize)]
pub struct ChainBody {
    /// First tried first; empty leaves the task without AI.
    chain: Vec<Link>,
}

pub(crate) fn link_problem(l: &Link) -> Option<&'static str> {
    if l.model.trim().is_empty() || l.model.len() > 200 {
        return Some("ai_model");
    }
    if !(16..=64000).contains(&l.max_tokens) {
        return Some("ai_max_tokens");
    }
    if l.temperature.is_some_and(|t| !(0.0..=2.0).contains(&t)) {
        return Some("ai_temperature");
    }
    if l.price_in < 0
        || l.price_out < 0
        || l.price_in > 1_000_000_000
        || l.price_out > 1_000_000_000
    {
        return Some("ai_price");
    }
    None
}

/// `PUT /api/admin/ai/tasks/{task}`: the task's chain, replaced whole.
pub async fn save_chain(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Path(code): Path<String>,
    Json(b): Json<ChainBody>,
) -> Result<Json<Value>, ApiError> {
    let by = admin(&state, &headers).await?;
    let t = task(&code).ok_or(ApiError(StatusCode::NOT_FOUND, "ai_no_task"))?;
    if b.chain.len() > 3 {
        return Err(unprocessable("ai_chain"));
    }
    if let Some(why) = b.chain.iter().find_map(link_problem) {
        return Err(unprocessable(why));
    }
    let mut tx = state.db.begin().await?;
    sqlx::query("DELETE FROM ai_task_bindings WHERE task = $1")
        .bind(t.code)
        .execute(&mut *tx)
        .await?;
    for (rank, l) in b.chain.iter().enumerate() {
        let provider: Option<(i64, bool)> =
            sqlx::query_as("SELECT id, student_data FROM ai_providers WHERE code = $1")
                .bind(&l.provider)
                .fetch_optional(&mut *tx)
                .await?;
        let (id, student_data) =
            provider.ok_or(ApiError(StatusCode::NOT_FOUND, "ai_no_provider"))?;
        if t.student_data && !student_data {
            return Err(unprocessable("ai_student_data"));
        }
        sqlx::query(
            "INSERT INTO ai_task_bindings (task, rank, provider_id, model, max_tokens, temperature, price_in, price_out)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(t.code)
        .bind(rank as i16)
        .bind(id)
        .bind(l.model.trim())
        .bind(l.max_tokens)
        .bind(l.temperature)
        .bind(l.price_in)
        .bind(l.price_out)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    let chain: Vec<Value> = b
        .chain
        .iter()
        .map(|l| json!({ "provider": l.provider, "model": l.model.trim(), "max_tokens": l.max_tokens }))
        .collect();
    audit(
        &state,
        by.id,
        "ai.task.chain",
        &format!("ai_task:{}", t.code),
        json!({ "chain": chain }),
    )
    .await?;
    Ok(Json(overview_json(&state).await?))
}

#[derive(Deserialize)]
pub struct BudgetBody {
    /// Micro-USD a month.
    monthly: i64,
    reason: String,
}

/// `PUT /api/admin/ai/budget`, with a reason in the audit log.
pub async fn save_budget(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(b): Json<BudgetBody>,
) -> Result<Json<Value>, ApiError> {
    let by = admin(&state, &headers).await?;
    // Up to 10,000 USD a month.
    if !(0..=10_000_000_000).contains(&b.monthly) {
        return Err(unprocessable("ai_budget_value"));
    }
    let reason = b.reason.trim();
    if !(3..=300).contains(&reason.chars().count()) {
        return Err(unprocessable("reason"));
    }
    let from: i64 = sqlx::query_scalar(
        "UPDATE ai_settings SET monthly_budget = $1
         RETURNING (SELECT monthly_budget FROM ai_settings)",
    )
    .bind(b.monthly)
    .fetch_one(&state.db)
    .await?;
    audit(
        &state,
        by.id,
        "ai.budget",
        "ai_settings",
        json!({ "from": from, "to": b.monthly, "reason": reason }),
    )
    .await?;
    Ok(Json(overview_json(&state).await?))
}

/// `GET /api/admin/ai/calls`: the latest 100 calls, without what was said.
pub async fn calls(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Vec<Value>>, ApiError> {
    admin(&state, &headers).await?;
    let rows: Vec<Value> = sqlx::query_scalar(
        "SELECT json_build_object('id', id, 'task', task, 'provider', provider, 'model', model,
             'reserved', reserved, 'cost', cost, 'tokens_in', tokens_in, 'tokens_out', tokens_out,
             'latency_ms', latency_ms, 'outcome', outcome, 'finish_reason', finish_reason,
             'detail', detail, 'at', to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
         FROM ai_calls ORDER BY id DESC LIMIT 100",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}
