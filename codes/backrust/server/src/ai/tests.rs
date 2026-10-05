//! The gateway's pieces, then a whole chain against a fake provider and a
//! real Postgres when `TEST_DATABASE_URL` is set.

use super::*;
use crate::ai::admin::{ProviderBody, provider_problem};
use axum::Router;
use axum::extract::Path;
use axum::http::StatusCode;
use axum::routing::{get, post};

/// A gateway as main makes one, after the TLS provider is installed.
fn gateway(master: Option<&str>) -> Gateway {
    let _ = rustls::crypto::ring::default_provider().install_default();
    Gateway::new(master)
}

#[test]
fn costs_round_up_to_a_micro_dollar() {
    assert_eq!(cost(0, 0, 3_000_000, 15_000_000), 0);
    // 1000 in at 3 USD and 2000 out at 15 USD a million: 0.003 + 0.03 USD.
    assert_eq!(cost(1000, 2000, 3_000_000, 15_000_000), 33_000);
    assert_eq!(cost(1, 0, 1, 0), 1);
}

#[test]
fn the_json_is_found_inside_words_and_fences() {
    assert_eq!(json_in("```json\n{\"a\": 1}\n```"), Some(json!({ "a": 1 })));
    assert_eq!(
        json_in("Sure! {\"a\": {\"b\": 2}} Hope it helps."),
        Some(json!({ "a": { "b": 2 } }))
    );
    assert_eq!(json_in("no json"), None);
    assert_eq!(json_in("[1, 2]"), None);
}

#[test]
fn a_model_id_is_escaped_for_the_path() {
    assert_eq!(
        path_part("us.anthropic.model-v1:0"),
        "us.anthropic.model-v1%3A0"
    );
    assert_eq!(path_part("a/b"), "a%2Fb");
}

#[test]
fn a_key_opens_only_with_its_master_and_its_provider() {
    let g = gateway(Some("a long master secret"));
    let sealed = g.seal("fireworks", "sk-123456").unwrap();
    assert!(!sealed.windows(9).any(|w| w == b"sk-123456"));
    assert_eq!(g.open("fireworks", &sealed).unwrap(), "sk-123456");
    assert!(g.open("other", &sealed).is_err());
    assert!(
        gateway(Some("another secret"))
            .open("fireworks", &sealed)
            .is_err()
    );
    assert_eq!(gateway(None).seal("x", "k"), Err(AiError::NoMasterKey));
}

fn body(code: &str, url: &str) -> ProviderBody {
    serde_json::from_value(json!({ "code": code, "label": "L", "kind": "openai", "base_url": url }))
        .unwrap()
}

#[test]
fn a_provider_needs_https_unless_it_is_this_machine() {
    assert_eq!(
        provider_problem(&body("fw", "https://api.fireworks.ai/inference/v1")),
        None
    );
    assert_eq!(
        provider_problem(&body("local", "http://127.0.0.1:8080/v1")),
        None
    );
    assert_eq!(provider_problem(&body("local", "http://localhost")), None);
    assert_eq!(provider_problem(&body("x", "https://a.b")), Some("ai_code"));
    assert_eq!(
        provider_problem(&body("Big", "https://a.b")),
        Some("ai_code")
    );
    assert_eq!(
        provider_problem(&body("plain", "http://api.example.com")),
        Some("ai_url")
    );
    assert_eq!(
        provider_problem(&body("trick", "http://localhost.example.com")),
        Some("ai_url")
    );
}

/// A provider that answers by the first part of its path.
async fn fake_provider() -> String {
    async fn chat(
        Path(mode): Path<String>,
        axum::Json(b): axum::Json<Value>,
    ) -> (StatusCode, axum::Json<Value>) {
        let reply = |content: &str, finish: &str| {
            json!({ "choices": [{ "message": { "content": content }, "finish_reason": finish }],
                    "usage": { "prompt_tokens": 1000, "completion_tokens": 2000 } })
        };
        match mode.as_str() {
            "refuse" => (
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({ "error": "bad key" })),
            ),
            "jsonmode" if b.get("response_format").is_some() => (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({ "error": "unknown field" })),
            ),
            "length" => (StatusCode::OK, axum::Json(reply("{\"x\": 1", "length"))),
            "wrong" => (StatusCode::OK, axum::Json(reply("{\"x\": 2}", "stop"))),
            _ => (
                StatusCode::OK,
                axum::Json(reply("Here it is: {\"x\": 1}", "stop")),
            ),
        }
    }
    async fn models() -> axum::Json<Value> {
        axum::Json(json!({ "data": [{ "id": "b-model" }, { "id": "a-model" }] }))
    }
    let app = Router::new()
        .route("/{mode}/chat/completions", post(chat))
        .route("/{mode}/models", get(models));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{addr}")
}

async fn db() -> Option<PgPool> {
    let url = std::env::var("TEST_DATABASE_URL").ok()?;
    let db = PgPool::connect(&url).await.expect("TEST_DATABASE_URL");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("migrate");
    Some(db)
}

async fn provider(db: &PgPool, g: &Gateway, code: &str, url: &str, student_data: bool) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO ai_providers (code, label, kind, base_url, key_cipher, key_tail, student_data)
         VALUES ($1, $1, 'openai', $2, $3, 'test', $4) RETURNING id",
    )
    .bind(code)
    .bind(url)
    .bind(g.seal(code, "test-key").unwrap())
    .bind(student_data)
    .fetch_one(db)
    .await
    .unwrap()
}

async fn chain(db: &PgPool, task: &str, links: &[(i64, &str)], price: i64) {
    sqlx::query("DELETE FROM ai_task_bindings WHERE task = $1")
        .bind(task)
        .execute(db)
        .await
        .unwrap();
    for (rank, (id, model)) in links.iter().enumerate() {
        sqlx::query(
            "INSERT INTO ai_task_bindings (task, rank, provider_id, model, max_tokens, price_in, price_out)
             VALUES ($1, $2, $3, $4, 100, $5, $5)",
        )
        .bind(task)
        .bind(rank as i16)
        .bind(id)
        .bind(model)
        .bind(price)
        .execute(db)
        .await
        .unwrap();
    }
}

#[tokio::test]
async fn a_task_walks_its_chain_within_the_budget_and_logs_every_call() {
    let Some(db) = db().await else { return };
    let g = gateway(Some("test master"));
    let base = fake_provider().await;
    let tag = format!("{:08x}", random_u64() as u32);
    let task: &'static Task = Box::leak(Box::new(Task {
        code: Box::leak(format!("test_{tag}").into_boxed_str()),
        student_data: true,
    }));
    let check = |v: &Value| {
        if v["x"] == 1 {
            Ok(())
        } else {
            Err("x is not 1".to_string())
        }
    };
    let input = json!({ "n": 1 });
    macro_rules! ask {
        ($g:expr) => {
            $g.ask(&db, task, "system", &input, check).await
        };
    }

    // Nothing bound: the task says it is not set up.
    assert_eq!(ask!(g).unwrap_err(), AiError::NotSetUp);

    // A provider not ticked for student data is never given this task.
    let open = provider(
        &db,
        &g,
        &format!("open-{tag}"),
        &format!("{base}/ok"),
        false,
    )
    .await;
    chain(&db, task.code, &[(open, "m")], 0).await;
    assert_eq!(ask!(g).unwrap_err(), AiError::NotSetUp);

    // A refused key moves to the next provider; one without JSON mode is asked again without it.
    let refuse = provider(
        &db,
        &g,
        &format!("refuse-{tag}"),
        &format!("{base}/refuse"),
        true,
    )
    .await;
    let plain = provider(
        &db,
        &g,
        &format!("plain-{tag}"),
        &format!("{base}/jsonmode"),
        true,
    )
    .await;
    chain(&db, task.code, &[(refuse, "m1"), (plain, "m2")], 1_000_000).await;
    let a = ask!(g).unwrap();
    assert_eq!(a.value, json!({ "x": 1 }));
    assert_eq!(
        (a.provider.as_str(), a.model.as_str()),
        (format!("plain-{tag}").as_str(), "m2")
    );
    let rows: Vec<(String, String, Option<i64>, Option<i32>)> = sqlx::query_as(
        "SELECT provider, outcome, cost, tokens_out FROM ai_calls WHERE task = $1 ORDER BY id",
    )
    .bind(task.code)
    .fetch_all(&db)
    .await
    .unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].1, "failed");
    assert_eq!(rows[0].2, Some(0));
    // 3000 tokens at 1 USD a million.
    assert_eq!(
        (rows[1].1.as_str(), rows[1].2, rows[1].3),
        ("ok", Some(3000), Some(2000))
    );

    // Cut off, or an answer the check refuses: every link fails.
    let cut = provider(
        &db,
        &g,
        &format!("cut-{tag}"),
        &format!("{base}/length"),
        true,
    )
    .await;
    let wrong = provider(
        &db,
        &g,
        &format!("wrong-{tag}"),
        &format!("{base}/wrong"),
        true,
    )
    .await;
    chain(&db, task.code, &[(cut, "m"), (wrong, "m")], 0).await;
    assert_eq!(ask!(g).unwrap_err(), AiError::Failed);
    let last: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT outcome, detail FROM ai_calls WHERE task = $1 ORDER BY id DESC LIMIT 2",
    )
    .bind(task.code)
    .fetch_all(&db)
    .await
    .unwrap();
    assert_eq!(last[0], ("rejected".into(), Some("x is not 1".into())));
    assert_eq!(last[1].0, "truncated");

    // A call that would pass the month's budget is not made.
    let ok = provider(&db, &g, &format!("ok-{tag}"), &format!("{base}/ok"), true).await;
    chain(&db, task.code, &[(ok, "m")], 1_000_000_000).await;
    let mut tx = db.begin().await.unwrap();
    let before: i64 = sqlx::query_scalar("SELECT monthly_budget FROM ai_settings FOR UPDATE")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    let spent = month_spent(&mut *tx).await.unwrap();
    sqlx::query("UPDATE ai_settings SET monthly_budget = $1")
        .bind(spent + 10)
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let n: i64 = sqlx::query_scalar("SELECT count(*) FROM ai_calls WHERE task = $1")
        .bind(task.code)
        .fetch_one(&db)
        .await
        .unwrap();
    let budget = ask!(g).unwrap_err();
    sqlx::query("UPDATE ai_settings SET monthly_budget = $1")
        .bind(before)
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(budget, AiError::Budget);
    let after: i64 = sqlx::query_scalar("SELECT count(*) FROM ai_calls WHERE task = $1")
        .bind(task.code)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(after, n);

    // A key sealed under another master is skipped, not sent.
    assert_eq!(
        ask!(gateway(Some("other master"))).unwrap_err(),
        AiError::NotSetUp
    );

    // TEST lists the provider's models.
    let probe = g.probe("openai", &format!("{base}/ok"), "k", None).await;
    assert_eq!(probe["models"], json!(["a-model", "b-model"]));
    let probe = g
        .probe("openai", &format!("{base}/refuse"), "k", Some("m"))
        .await;
    assert_eq!(probe["ok"], json!(true));

    sqlx::query("DELETE FROM ai_task_bindings WHERE task = $1")
        .bind(task.code)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("DELETE FROM ai_providers WHERE code LIKE '%-' || $1")
        .bind(&tag)
        .execute(&db)
        .await
        .unwrap();
}
