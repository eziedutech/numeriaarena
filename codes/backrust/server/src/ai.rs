//! The AI gateway: every call to a language model goes through here. Code
//! asks for a task (`class_insight`); the admin's bindings pick the provider
//! and the model, tried in rank order. Each call is held against the monthly
//! budget before it is made, and logged without its prompt or its answer.
//! With no provider set up a task says so; it never makes something up.

pub mod admin;

use std::time::{Duration, Instant};

use ring::aead::{AES_256_GCM, Aad, LessSafeKey, NONCE_LEN, Nonce, UnboundKey};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::rooms::random_u64;

/// Something the server asks a model for.
pub struct Task {
    pub code: &'static str,
    /// Its input is made from students' answers, so only a provider ticked
    /// for student data may take it.
    pub student_data: bool,
}

pub const CLASS_INSIGHT: Task = Task {
    code: "class_insight",
    student_data: true,
};

/// One student's practice plan; asks the class insight's chain until bound its own.
pub const PRACTICE_PLAN: Task = Task {
    code: "practice_plan",
    student_data: true,
};

pub const TASKS: [&Task; 2] = [&CLASS_INSIGHT, &PRACTICE_PLAN];

pub fn task(code: &str) -> Option<&'static Task> {
    TASKS.into_iter().find(|t| t.code == code)
}

#[derive(Debug, PartialEq, Eq)]
pub enum AiError {
    /// No active provider with a key holds the task.
    NotSetUp,
    /// The month's budget would be passed.
    Budget,
    /// Every provider in the chain failed or answered something unusable.
    Failed,
    /// AI_MASTER_KEY is not set, so keys can be neither kept nor read.
    NoMasterKey,
    Database,
}

impl From<sqlx::Error> for AiError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!("ai database: {e}");
        AiError::Database
    }
}

/// A usable answer and who gave it.
#[derive(Debug)]
pub struct Answer {
    pub value: Value,
    pub provider: String,
    pub model: String,
}

/// What a provider sent back.
struct Reply {
    text: String,
    /// `length` when the answer was cut off at the token limit.
    finish: Option<String>,
    tokens_in: Option<i64>,
    tokens_out: Option<i64>,
}

#[derive(Debug)]
enum CallError {
    /// 429, 5xx, a timeout or no connection: worth another try.
    Busy(String),
    /// Any other refusal: the next provider is tried at once.
    Refused(u16, String),
    /// It answered, but not in the shape asked for.
    Bad(String),
}

impl std::fmt::Display for CallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CallError::Busy(why) => write!(f, "busy: {why}"),
            CallError::Refused(401 | 403, _) => {
                write!(
                    f,
                    "the provider refused the key: check the key, not the URL"
                )
            }
            CallError::Refused(code, why) => write!(f, "refused {code}: {why}"),
            CallError::Bad(why) => write!(f, "bad answer: {why}"),
        }
    }
}

/// One row of a task's chain, with its provider.
#[derive(sqlx::FromRow)]
struct Route {
    provider: String,
    kind: String,
    base_url: String,
    key_cipher: Option<Vec<u8>>,
    model: String,
    max_tokens: i32,
    temperature: Option<f32>,
    price_in: i64,
    price_out: i64,
}

/// Micro-USD for these tokens at prices given per million tokens.
fn cost(tokens_in: i64, tokens_out: i64, price_in: i64, price_out: i64) -> i64 {
    let micro = i128::from(tokens_in) * i128::from(price_in)
        + i128::from(tokens_out) * i128::from(price_out);
    i64::try_from((micro + 999_999) / 1_000_000).unwrap_or(i64::MAX)
}

/// The JSON object in a model's text, even with words or a code fence around it.
pub(crate) fn json_in(text: &str) -> Option<Value> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    let v: Value = serde_json::from_str(text.get(start..=end)?).ok()?;
    v.is_object().then_some(v)
}

/// A model id inside a URL path (Bedrock ids have `:` and `/`).
fn path_part(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// At most `n` characters of a provider's error, for the log.
fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

pub struct Gateway {
    master: Option<LessSafeKey>,
    http: reqwest::Client,
}

impl Gateway {
    /// `master` is AI_MASTER_KEY: any long secret, hashed into the AES key.
    pub fn new(master: Option<&str>) -> Self {
        let master = master.filter(|m| !m.trim().is_empty()).map(|m| {
            let digest = Sha256::digest(m.trim().as_bytes());
            LessSafeKey::new(UnboundKey::new(&AES_256_GCM, &digest[..]).expect("a 32-byte key"))
        });
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .expect("an HTTP client with the installed TLS provider");
        Gateway { master, http }
    }

    pub fn has_master(&self) -> bool {
        self.master.is_some()
    }

    /// A provider's key sealed for the database, bound to the provider's code.
    pub(crate) fn seal(&self, code: &str, key: &str) -> Result<Vec<u8>, AiError> {
        let master = self.master.as_ref().ok_or(AiError::NoMasterKey)?;
        let mut nonce = [0u8; NONCE_LEN];
        SystemRandom::new()
            .fill(&mut nonce)
            .map_err(|_| AiError::NoMasterKey)?;
        let mut sealed = key.as_bytes().to_vec();
        master
            .seal_in_place_append_tag(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(code.as_bytes()),
                &mut sealed,
            )
            .map_err(|_| AiError::NoMasterKey)?;
        let mut out = nonce.to_vec();
        out.extend(sealed);
        Ok(out)
    }

    pub(crate) fn open(&self, code: &str, cipher: &[u8]) -> Result<String, AiError> {
        let master = self.master.as_ref().ok_or(AiError::NoMasterKey)?;
        if cipher.len() <= NONCE_LEN {
            return Err(AiError::NoMasterKey);
        }
        let nonce = Nonce::try_assume_unique_for_key(&cipher[..NONCE_LEN])
            .map_err(|_| AiError::NoMasterKey)?;
        let mut buf = cipher[NONCE_LEN..].to_vec();
        let plain = master
            .open_in_place(nonce, Aad::from(code.as_bytes()), &mut buf)
            .map_err(|_| AiError::NoMasterKey)?;
        String::from_utf8(plain.to_vec()).map_err(|_| AiError::NoMasterKey)
    }

    /// One POST, tried again with a growing pause when the provider is busy.
    async fn post(&self, url: &str, key: &str, body: &Value) -> Result<Value, CallError> {
        let mut last = String::new();
        for attempt in 0..3u32 {
            if attempt > 0 {
                let jitter = random_u64() % 250;
                tokio::time::sleep(Duration::from_millis(400 * 3u64.pow(attempt - 1) + jitter))
                    .await;
            }
            let sent = self.http.post(url).bearer_auth(key).json(body).send().await;
            let res = match sent {
                Ok(res) => res,
                Err(e) => {
                    last = clip(&e.to_string(), 200);
                    continue;
                }
            };
            let status = res.status().as_u16();
            let text = res.text().await.unwrap_or_default();
            if status == 429 || status >= 500 {
                last = format!("{status} {}", clip(&text, 200));
                continue;
            }
            if !(200..300).contains(&status) {
                return Err(CallError::Refused(status, clip(&text, 200)));
            }
            return serde_json::from_str(&text).map_err(|_| CallError::Bad("not JSON".into()));
        }
        Err(CallError::Busy(last))
    }

    /// OpenAI-compatible Chat Completions. JSON mode is asked for, and asked
    /// again without when the provider does not know it.
    async fn chat(
        &self,
        r: &Route,
        key: &str,
        system: &str,
        user: &str,
    ) -> Result<Reply, CallError> {
        let url = format!("{}/chat/completions", r.base_url.trim_end_matches('/'));
        let mut body = json!({
            "model": r.model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user },
            ],
            "max_tokens": r.max_tokens,
            "response_format": { "type": "json_object" },
        });
        if let Some(t) = r.temperature {
            body["temperature"] = json!(t);
        }
        let v = match self.post(&url, key, &body).await {
            Err(CallError::Refused(400, _)) => {
                body.as_object_mut().map(|o| o.remove("response_format"));
                self.post(&url, key, &body).await?
            }
            other => other?,
        };
        let choice = &v["choices"][0];
        let text = choice["message"]["content"]
            .as_str()
            .ok_or_else(|| CallError::Bad("no message".into()))?;
        Ok(Reply {
            text: text.to_string(),
            finish: choice["finish_reason"].as_str().map(str::to_string),
            tokens_in: v["usage"]["prompt_tokens"].as_i64(),
            tokens_out: v["usage"]["completion_tokens"].as_i64(),
        })
    }

    /// Amazon Bedrock's Converse API, with a Bedrock API key.
    async fn converse(
        &self,
        r: &Route,
        key: &str,
        system: &str,
        user: &str,
    ) -> Result<Reply, CallError> {
        let url = format!(
            "{}/model/{}/converse",
            r.base_url.trim_end_matches('/'),
            path_part(&r.model)
        );
        let mut config = json!({ "maxTokens": r.max_tokens });
        if let Some(t) = r.temperature {
            config["temperature"] = json!(t);
        }
        let body = json!({
            "system": [{ "text": system }],
            "messages": [{ "role": "user", "content": [{ "text": user }] }],
            "inferenceConfig": config,
        });
        let v = self.post(&url, key, &body).await?;
        let text = v["output"]["message"]["content"]
            .as_array()
            .and_then(|parts| parts.iter().find_map(|p| p["text"].as_str()))
            .ok_or_else(|| CallError::Bad("no text".into()))?;
        let finish = v["stopReason"]
            .as_str()
            .map(|s| if s == "max_tokens" { "length" } else { s }.to_string());
        Ok(Reply {
            text: text.to_string(),
            finish,
            tokens_in: v["usage"]["inputTokens"].as_i64(),
            tokens_out: v["usage"]["outputTokens"].as_i64(),
        })
    }

    async fn call(
        &self,
        r: &Route,
        key: &str,
        system: &str,
        user: &str,
    ) -> Result<Reply, CallError> {
        if r.kind == "bedrock" {
            self.converse(r, key, system, user).await
        } else {
            self.chat(r, key, system, user).await
        }
    }

    /// Asks a task's chain for a JSON object that passes `check`. The input
    /// is JSON made by the server, never text typed by a child.
    pub async fn ask(
        &self,
        db: &PgPool,
        task: &Task,
        system: &str,
        input: &Value,
        check: impl Fn(&Value) -> Result<(), String>,
    ) -> Result<Answer, AiError> {
        let routes: Vec<Route> = sqlx::query_as(
            "SELECT p.code AS provider, p.kind, p.base_url, p.key_cipher, b.model,
                    b.max_tokens, b.temperature, b.price_in, b.price_out
             FROM ai_task_bindings b JOIN ai_providers p ON p.id = b.provider_id
             WHERE b.task = $1 AND p.active AND p.key_cipher IS NOT NULL
               AND (p.student_data OR NOT $2)
             ORDER BY b.rank",
        )
        .bind(task.code)
        .bind(task.student_data)
        .fetch_all(db)
        .await?;
        if routes.is_empty() {
            return Err(AiError::NotSetUp);
        }
        let user = input.to_string();
        let mut tried = false;
        for r in &routes {
            let Some(key) = r
                .key_cipher
                .as_deref()
                .and_then(|c| self.open(&r.provider, c).ok())
            else {
                tracing::warn!(
                    "ai: the key of {} cannot be read with this AI_MASTER_KEY",
                    r.provider
                );
                continue;
            };
            // About three characters a token, and every token it may write.
            let guess_in = ((system.len() + user.len()) / 3 + 1) as i64;
            let held = cost(guess_in, i64::from(r.max_tokens), r.price_in, r.price_out);
            let id = match reserve(db, task.code, &r.provider, &r.model, held).await {
                Ok(id) => id,
                Err(AiError::Budget) => return Err(AiError::Budget),
                Err(e) => return Err(e),
            };
            tried = true;
            let started = Instant::now();
            let result = self.call(r, &key, system, &user).await;
            let ms = i32::try_from(started.elapsed().as_millis()).unwrap_or(i32::MAX);
            let (reply, outcome, detail) = match result {
                Err(e) => (None, "failed", Some(e.to_string())),
                Ok(reply) => {
                    let (outcome, detail) = if reply.finish.as_deref() == Some("length") {
                        (
                            "truncated",
                            Some("cut off at max_tokens: raise it in the admin".into()),
                        )
                    } else {
                        match json_in(&reply.text) {
                            None => ("not_json", None),
                            Some(v) => match check(&v) {
                                Err(why) => ("rejected", Some(clip(&why, 300))),
                                Ok(()) => ("ok", None),
                            },
                        }
                    };
                    (Some(reply), outcome, detail)
                }
            };
            let spent = reply
                .as_ref()
                .and_then(|x| Some((x.tokens_in?, x.tokens_out?)));
            let price = spent.map_or(if reply.is_some() { held } else { 0 }, |(i, o)| {
                cost(i, o, r.price_in, r.price_out)
            });
            sqlx::query(
                "UPDATE ai_calls SET cost = $2, tokens_in = $3, tokens_out = $4, latency_ms = $5,
                     outcome = $6, finish_reason = $7, detail = $8
                 WHERE id = $1",
            )
            .bind(id)
            .bind(price)
            .bind(spent.map(|s| s.0 as i32))
            .bind(spent.map(|s| s.1 as i32))
            .bind(ms)
            .bind(outcome)
            .bind(reply.as_ref().and_then(|x| x.finish.clone()))
            .bind(&detail)
            .execute(db)
            .await?;
            if outcome == "ok" {
                let value = reply
                    .as_ref()
                    .and_then(|x| json_in(&x.text))
                    .unwrap_or_default();
                return Ok(Answer {
                    value,
                    provider: r.provider.clone(),
                    model: r.model.clone(),
                });
            }
            tracing::info!("ai {}: {} {} {outcome}", task.code, r.provider, r.model);
        }
        Err(if tried {
            AiError::Failed
        } else {
            AiError::NotSetUp
        })
    }

    /// The admin's TEST button: the provider's model list, or else one tiny
    /// call to `model`.
    pub(crate) async fn probe(
        &self,
        kind: &str,
        base_url: &str,
        key: &str,
        model: Option<&str>,
    ) -> Value {
        let started = Instant::now();
        let base = base_url.trim_end_matches('/');
        let ms = |s: Instant| s.elapsed().as_millis() as u64;
        if kind == "openai" {
            match self
                .http
                .get(format!("{base}/models"))
                .bearer_auth(key)
                .send()
                .await
            {
                Ok(res) if res.status().is_success() => {
                    let v: Value = res.json().await.unwrap_or_default();
                    let mut models: Vec<String> = v["data"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|m| m["id"].as_str().map(str::to_string))
                                .collect()
                        })
                        .unwrap_or_default();
                    models.sort();
                    models.truncate(200);
                    return json!({ "ok": true, "latency_ms": ms(started), "models": models });
                }
                Ok(res) if matches!(res.status().as_u16(), 401 | 403) => {
                    return json!({ "ok": false, "latency_ms": ms(started),
                        "error": CallError::Refused(401, String::new()).to_string() });
                }
                Ok(_) | Err(_) if model.is_none() => {
                    return json!({ "ok": false, "latency_ms": ms(started),
                        "error": "no model list here: give a model to try one call" });
                }
                _ => {}
            }
        }
        let Some(model) = model else {
            return json!({ "ok": false, "error": "a model is needed to test this provider" });
        };
        let r = Route {
            provider: String::new(),
            kind: kind.into(),
            base_url: base.into(),
            key_cipher: None,
            model: model.into(),
            max_tokens: 16,
            temperature: None,
            price_in: 0,
            price_out: 0,
        };
        let reply = if kind == "bedrock" {
            self.converse(&r, key, "Answer in one word.", "Say ok.")
                .await
        } else {
            // Without JSON mode: some providers want the word JSON in the prompt for it.
            let url = format!("{base}/chat/completions");
            let body = json!({ "model": model, "max_tokens": 16,
                "messages": [{ "role": "user", "content": "Say ok." }] });
            self.post(&url, key, &body).await.map(|v| Reply {
                text: v["choices"][0]["message"]["content"]
                    .as_str()
                    .unwrap_or_default()
                    .into(),
                finish: None,
                tokens_in: None,
                tokens_out: None,
            })
        };
        match reply {
            Ok(_) => json!({ "ok": true, "latency_ms": ms(started), "model": model }),
            Err(e) => {
                json!({ "ok": false, "latency_ms": ms(started), "model": model, "error": e.to_string() })
            }
        }
    }
}

/// Holds `held` micro-USD of the month's budget for one call, or refuses.
async fn reserve(
    db: &PgPool,
    task: &str,
    provider: &str,
    model: &str,
    held: i64,
) -> Result<i64, AiError> {
    let mut tx = db.begin().await?;
    let budget: i64 = sqlx::query_scalar("SELECT monthly_budget FROM ai_settings FOR UPDATE")
        .fetch_one(&mut *tx)
        .await?;
    let spent = month_spent(&mut *tx).await?;
    if spent.saturating_add(held) > budget {
        tracing::warn!("ai {task}: the month's budget is used up");
        return Err(AiError::Budget);
    }
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO ai_calls (task, provider, model, reserved) VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(task)
    .bind(provider)
    .bind(model)
    .bind(held)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(id)
}

/// Micro-USD used this calendar month (UTC), counting calls still waiting at what they hold.
pub(crate) async fn month_spent<'e>(db: impl sqlx::PgExecutor<'e>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(COALESCE(cost, reserved)), 0)::BIGINT FROM ai_calls
         WHERE at >= date_trunc('month', now(), 'UTC')",
    )
    .fetch_one(db)
    .await
}

#[cfg(test)]
mod tests;
