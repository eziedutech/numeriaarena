//! A sample teacher against a real Postgres when `TEST_DATABASE_URL` is set.

use super::*;
use crate::answers::class_report;

fn content() -> Content {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content");
    Content::load(&dir).unwrap()
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

#[test]
fn the_school_year_reads_like_the_class_page() {
    let year = school_year();
    assert_eq!(year.len(), 7);
    assert_eq!(&year[4..5], "/");
}

#[tokio::test]
async fn a_sample_has_played_signs_in_and_is_gone_after_its_day() {
    let Some(db) = db().await else { return };
    let c = content();
    let made = make(&db, &c).await.unwrap();
    let token = made["token"].as_str().unwrap();
    assert!(token.starts_with(PREFIX));
    assert!(made["card"]["pseudonym"].is_string());

    let teacher = adult(&db, token).await.unwrap().expect("signs in");
    assert!(teacher.email.is_empty());
    assert!(adult(&db, "demo_nothing").await.unwrap().is_none());
    let user: i64 = sqlx::query_scalar("SELECT id FROM users WHERE firebase_uid = $1")
        .bind(&teacher.uid)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(
        crate::classes::allowance(&db, user, false).await.unwrap(),
        Allowance::Full
    );

    let class = made["class"]["id"].as_str().unwrap();
    let report = class_report(&db, &c, user, class).await.unwrap();
    let rows = report["rows"].as_array().unwrap();
    assert!(rows.iter().any(|r| r["source"] == "class"));
    assert!(rows.iter().any(|r| r["source"] == "own"));
    assert!(!report["mistakes"].as_array().unwrap().is_empty());
    let rooms: i64 = sqlx::query_scalar("SELECT count(*) FROM rooms WHERE created_by = $1")
        .bind(user)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(rooms, RACES as i64);
    let map = crate::town::teacher_map(&db, user, class).await.unwrap();
    let cells = map["cells"].as_array().unwrap();
    assert_eq!(cells.len(), TOWNS.len());
    for cell in cells {
        assert!(
            cell["seat"].as_i64().unwrap() > 1,
            "the first seat picks its own land"
        );
        assert!(cell["town"]["homes"].as_u64().unwrap() >= 3, "{cell}");
        assert!(cell["town"]["trees"].as_u64().unwrap() >= 3, "{cell}");
    }

    // A day later the sample, its class, rooms and races are gone.
    sqlx::query("UPDATE demo_teachers SET expires_at = now() WHERE user_id = $1")
        .bind(user)
        .execute(&db)
        .await
        .unwrap();
    assert!(adult(&db, token).await.unwrap().is_none());
    sweep(&db).await.unwrap();
    for sql in [
        "SELECT count(*) FROM users WHERE id = $1",
        "SELECT count(*) FROM rooms WHERE created_by = $1",
        "SELECT count(*) FROM classes WHERE owner = $1",
        "SELECT count(*) FROM memberships WHERE user_id = $1",
    ] {
        let left: i64 = sqlx::query_scalar(sql)
            .bind(user)
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(left, 0, "{sql}");
    }
    let class_left: i64 = sqlx::query_scalar("SELECT count(*) FROM classes WHERE id = $1")
        .bind(class)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(class_left, 0);
}
