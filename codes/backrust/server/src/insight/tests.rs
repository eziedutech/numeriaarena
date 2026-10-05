//! What the model is given and what of its answer is shown, then the kept
//! insight against a real Postgres when `TEST_DATABASE_URL` is set.

use super::*;
use crate::answers::{Sent, store_answers};
use crate::classes::{allowance, create_class};
use crate::rooms::random_hex;

fn report() -> Value {
    json!({
        "label": "5A Mawar",
        "skills": { "fraction_add": { "en": "Adding fractions", "id": "Menjumlah pecahan" },
                    "place_value": { "en": "Place value", "id": "Nilai tempat" } },
        "rows": [
            { "seat": 1, "source": "class", "template_id": "t1", "skill": "fraction_add", "right": 1, "total": 4 },
            { "seat": 1, "source": "own", "template_id": "t1", "skill": "fraction_add", "right": 0, "total": 2 },
            { "seat": 2, "source": "own", "template_id": "t1", "skill": "fraction_add", "right": 5, "total": 6 },
            { "seat": 2, "source": "own", "template_id": "t2", "skill": "place_value", "right": 12, "total": 14 },
        ],
        "mistakes": [
            { "seat": 1, "source": "class", "skill": "fraction_add", "misconception": "added_denominators", "count": 3 },
            { "seat": 2, "source": "own", "skill": "fraction_add", "misconception": "added_denominators", "count": 1 },
        ],
        "misconceptions": { "added_denominators": {
            "title": { "en": "Adds the denominators", "id": "Menjumlah penyebut" },
            "note": { "en": "Adds the bottoms as well as the tops.", "id": "Ikut menjumlah penyebut." } } },
    })
}

#[test]
fn the_model_gets_numbers_and_titles_never_the_class_or_its_codes() {
    let input = insight_input(&report(), 0);
    assert_eq!(input["seats_with_answers"], 2);
    // Place value has more answers, so it comes first.
    assert_eq!(
        input["skills"][0],
        json!({ "skill": "Place value", "right": 12, "tries": 14, "percent": 86,
                "seats_tried": 1, "seats_needing_help": [] })
    );
    assert_eq!(input["skills"][1]["right"], 6);
    assert_eq!(input["skills"][1]["tries"], 12);
    assert_eq!(input["skills"][1]["seats_needing_help"], json!([1]));
    assert_eq!(
        input["mistakes"],
        json!([{ "mistake": "Adds the denominators", "note": "Adds the bottoms as well as the tops.",
                 "skill": "Adding fractions", "times": 4, "seats": 2 }])
    );
    let text = input.to_string();
    assert!(
        !text.contains("Mawar")
            && !text.contains("fraction_add")
            && !text.contains("added_denominators"),
        "{text}"
    );

    let one = insight_input(&report(), 1);
    assert_eq!(one["scope"], "one student, seat 1");
    assert_eq!(one["skills"].as_array().unwrap().len(), 1);
    assert_eq!(one["skills"][0]["tries"], 6);
    assert!(one["skills"][0].get("seats_needing_help").is_none());
    assert_eq!(one["mistakes"][0]["times"], 3);
    assert_eq!(first_tries(&one), 6);
    assert_ne!(hash_of(&input), hash_of(&one));
}

fn answer(summary: &str) -> Value {
    let side = |s: &str| {
        json!({ "summary": s, "strengths": ["Place value is strong at 86 percent."],
                "gaps": ["Adding fractions: 6 of 12 right."], "next": ["Use fraction strips with 1/2 and 1/4."] })
    };
    json!({ "en": side(summary), "id": side("Nilai tempat sudah kuat."), "extra": "dropped" })
}

#[test]
fn an_answer_is_shown_only_with_the_input_numbers_and_no_links_or_codes() {
    let input = insight_input(&report(), 0);
    let good = answer("2 seats answered; seat 1 needs help with adding fractions.");
    assert_eq!(check_insight(&input, &good), Ok(()));
    assert_eq!(shown(&good).get("extra"), None);
    assert_eq!(shown(&good)["id"]["summary"], "Nilai tempat sudah kuat.");

    for (summary, why) in [
        ("About 73 percent were right.", "number 73"),
        ("Adding fractions \u{2014} needs work.", "dash"),
        ("See https://example.com for more.", "link"),
        ("Practise fraction_add.", "code"),
        ("", "summary length"),
    ] {
        assert_eq!(
            check_insight(&input, &answer(summary)),
            Err(why.to_string()),
            "{summary}"
        );
    }
    let mut no_id = answer("Fine.");
    no_id.as_object_mut().unwrap().remove("id");
    assert!(check_insight(&input, &no_id).is_err());
    let mut long = answer("Fine.");
    long["en"]["next"] = json!(["a", "b", "c", "d", "e"]);
    assert_eq!(check_insight(&input, &long), Err("too many next".into()));
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

async fn teacher(db: &PgPool) -> i64 {
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO users (firebase_uid, email, email_verified) VALUES ($1, 'teacher@test.example', true)
         RETURNING id",
    )
    .bind(format!("test-{}", random_hex()))
    .fetch_one(db)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO organizer_approvals (user_id, status, path) VALUES ($1, 'approved', 'self')",
    )
    .bind(id)
    .execute(db)
    .await
    .unwrap();
    id
}

fn sent(c: &Content, id: &str, result: &str) -> Sent {
    let t = &c.templates[0];
    serde_json::from_value(json!({
        "event_id": id, "mode": "practice",
        "event": {
            "event_id": id, "at_ms": 1000.0, "player": "me", "mode": "practice",
            "game_type": "balloon_burst", "skill": t.skill, "template_id": t.id,
            "params_hash": "x", "b": 0.0, "p_final": 0.7, "result": result,
            "attempt": 1, "assisted": false, "time_ms": 4200.0,
            "fairness_params_version": "fp", "content_pack_version": "cp"
        }
    }))
    .unwrap()
}

#[tokio::test]
async fn an_insight_is_for_its_teacher_and_kept_until_the_numbers_change() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content");
    let c = Content::load(&dir).unwrap();
    // No master key: every sealed key is skipped, so AI reads as off.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let ai = Gateway::new(None);
    let owner = teacher(&db).await;
    let a = allowance(&db, owner, false).await.unwrap();
    let new: crate::classes::NewClass = serde_json::from_value(json!({
        "label": "5C", "grade": 5, "school_year": "2026/27", "seats": 2
    }))
    .unwrap();
    let made = create_class(&db, owner, a, &new).await.unwrap();
    let id = made["class"]["id"].as_str().unwrap().to_owned();
    let seat: i64 =
        sqlx::query_scalar("SELECT id FROM class_seats WHERE class_id = $1 AND number = 1")
            .bind(&id)
            .fetch_one(&db)
            .await
            .unwrap();
    let ask = |seat: i16| class_insight(&db, &c, &ai, owner, &id, seat);

    // Too few answers: no model is asked.
    store_answers(&db, &c, seat, &[sent(&c, "a1", "correct")])
        .await
        .unwrap();
    assert_eq!(ask(0).await.unwrap_err().1, "insight_too_few");
    let batch: Vec<Sent> = (2..=6)
        .map(|n| {
            sent(
                &c,
                &format!("a{n}"),
                if n % 2 == 0 { "wrong" } else { "correct" },
            )
        })
        .collect();
    store_answers(&db, &c, seat, &batch).await.unwrap();
    assert_eq!(ask(2).await.unwrap_err().1, "insight_too_few");
    assert_eq!(ask(9).await.unwrap_err().1, "seat_not_found");
    assert_eq!(ask(0).await.unwrap_err().1, "ai_not_set_up");

    // Another adult cannot ask about the class.
    let stranger = teacher(&db).await;
    let hidden = class_insight(&db, &c, &ai, stranger, &id, 0)
        .await
        .unwrap_err();
    assert_eq!(hidden.1, "class_not_found");

    // One made for these numbers is given again without a model.
    let report = class_report(&db, &c, owner, &id).await.unwrap();
    let value = shown(&answer("Kept."));
    sqlx::query(
        "INSERT INTO ai_insights (class_id, seat, data_hash, value, provider, model)
         VALUES ($1, 0, $2, $3, 'p', 'm')",
    )
    .bind(&id)
    .bind(hash_of(&insight_input(&report, 0)))
    .bind(&value)
    .execute(&db)
    .await
    .unwrap();
    let kept = ask(0).await.unwrap();
    assert_eq!(
        (kept["insight"].clone(), kept["kept"].clone()),
        (value, json!(true))
    );

    // A new answer changes the numbers: the kept one no longer fits.
    store_answers(&db, &c, seat, &[sent(&c, "a7", "correct")])
        .await
        .unwrap();
    assert_eq!(ask(0).await.unwrap_err().1, "ai_not_set_up");

    // With a provider: made from the numbers, kept, and given again without asking.
    let taken: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM ai_task_bindings WHERE task = 'class_insight')",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    if taken {
        eprintln!("class_insight is bound in this database: the call itself is skipped");
        return;
    }
    let (base, seen) = fake_provider().await;
    let ai = Gateway::new(Some("test master"));
    let code = format!("ins-{}", &random_hex()[..8]);
    let provider: i64 = sqlx::query_scalar(
        "INSERT INTO ai_providers (code, label, kind, base_url, key_cipher, key_tail, student_data)
         VALUES ($1, $1, 'openai', $2, $3, 'test', true) RETURNING id",
    )
    .bind(&code)
    .bind(&base)
    .bind(ai.seal(&code, "k").unwrap())
    .fetch_one(&db)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO ai_task_bindings (task, rank, provider_id, model, max_tokens) VALUES ('class_insight', 0, $1, 'm', 2000)",
    )
    .bind(provider)
    .execute(&db)
    .await
    .unwrap();
    let first = class_insight(&db, &c, &ai, owner, &id, 0).await;
    let again = class_insight(&db, &c, &ai, owner, &id, 0).await;
    sqlx::query("DELETE FROM ai_task_bindings WHERE provider_id = $1")
        .bind(provider)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("DELETE FROM ai_providers WHERE id = $1")
        .bind(provider)
        .execute(&db)
        .await
        .unwrap();
    let first = first.unwrap();
    assert_eq!(first["kept"], false);
    assert_eq!(first["insight"]["en"]["summary"], "Seat 1 tried 7 times.");
    assert_eq!(first["insight"].get("extra"), None);
    assert_eq!(again.unwrap()["kept"], true);
    let sent = seen.lock().unwrap().clone();
    assert_eq!(sent.len(), 1, "asked once");
    assert!(
        !sent[0].contains("5C") && sent[0].contains("whole class"),
        "{}",
        sent[0]
    );
}

type Seen = std::sync::Arc<std::sync::Mutex<Vec<String>>>;

/// A provider that answers every insight the same, and keeps what it was sent.
async fn fake_provider() -> (String, Seen) {
    let seen: Seen = Default::default();
    let kept = seen.clone();
    let chat = move |axum::Json(b): axum::Json<Value>| {
        let kept = kept.clone();
        async move {
            kept.lock().unwrap().push(
                b["messages"][1]["content"]
                    .as_str()
                    .unwrap_or("")
                    .to_owned(),
            );
            let side = |s: &str| json!({ "summary": s, "strengths": [], "gaps": ["Practise more."], "next": [] });
            let out = json!({ "en": side("Seat 1 tried 7 times."), "id": side("Kursi 1 mencoba 7 kali."), "extra": 1 });
            axum::Json(json!({
                "choices": [{ "message": { "content": out.to_string() }, "finish_reason": "stop" }],
                "usage": { "prompt_tokens": 10, "completion_tokens": 10 }
            }))
        }
    };
    let app = axum::Router::new().route("/chat/completions", axum::routing::post(chat));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}"), seen)
}
