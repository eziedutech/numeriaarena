//! The class map against a real Postgres when `TEST_DATABASE_URL` is set.

use super::*;
use crate::classes::{allowance, create_class};
use crate::rooms::random_hex;

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

async fn class(db: &PgPool, owner: i64, seats: i16) -> (String, Vec<i64>) {
    let a = allowance(db, owner, false).await.unwrap();
    let new: crate::classes::NewClass = serde_json::from_value(json!({
        "label": "4C", "grade": 4, "school_year": "2026/27", "seats": seats
    }))
    .unwrap();
    let made = create_class(db, owner, a, &new).await.unwrap();
    let id = made["class"]["id"].as_str().unwrap().to_owned();
    let ids = sqlx::query_scalar("SELECT id FROM class_seats WHERE class_id = $1 ORDER BY number")
        .bind(&id)
        .fetch_all(db)
        .await
        .unwrap();
    (id, ids)
}

fn plot(x: u8, y: u8, kind: &str) -> Plot {
    Plot {
        x,
        y,
        kind: kind.into(),
    }
}

fn code(e: ApiError) -> &'static str {
    e.1
}

#[tokio::test]
async fn a_student_picks_a_free_cell_once_and_later_lands_join_beside_it() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let owner = teacher(&db).await;
    let (id, seats) = class(&db, owner, 3).await;
    place_first(&db, &id, seats[0], &plot(3, 3, "river"))
        .await
        .unwrap();
    let e = place_first(&db, &id, seats[1], &plot(3, 3, "plain"))
        .await
        .unwrap_err();
    assert_eq!(code(e), "cell_taken");
    let e = place_first(&db, &id, seats[0], &plot(5, 5, "plain"))
        .await
        .unwrap_err();
    assert_eq!(code(e), "already_placed");
    assert_eq!(
        code(
            place_first(&db, &id, seats[1], &plot(10, 0, "plain"))
                .await
                .unwrap_err()
        ),
        "off_map"
    );
    assert_eq!(
        code(
            place_first(&db, &id, seats[1], &plot(0, 0, "lava"))
                .await
                .unwrap_err()
        ),
        "kind"
    );
    place_first(&db, &id, seats[1], &plot(4, 3, "hills"))
        .await
        .unwrap();

    // Right of (3, 3) is taken by seat 2, so the second land goes below.
    let mut tx = db.begin().await.unwrap();
    let at = place_later(&mut tx, &id, seats[0], 1, LandKind::Beach)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(at, Some((3, 4)));
    // A seat with no first land on the map stays off it.
    let mut tx = db.begin().await.unwrap();
    let at = place_later(&mut tx, &id, seats[2], 1, LandKind::Plain)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    assert_eq!(at, None);

    let map = teacher_map(&db, owner, &id).await.unwrap();
    let cells = map["cells"].as_array().unwrap();
    assert_eq!(cells.len(), 3);
    assert_eq!(cells[0]["kind"], "river");
    assert_eq!(cells[0]["seat"], 1);
    assert_eq!(cells[2]["land"], 1);
    assert_eq!(cells[2]["kind"], "beach");

    // Classmates see a pseudonym, never a seat number.
    let seen = cells_for(&db, &id, seats[1]).await;
    assert!(seen.iter().all(|c| c["seat"].is_null()));
    assert_eq!(seen.iter().filter(|c| c["me"] == true).count(), 1);
}

async fn cells_for(db: &PgPool, id: &str, seat: i64) -> Vec<Value> {
    cells(db, id, Some(seat), false).await.unwrap()["cells"]
        .as_array()
        .unwrap()
        .clone()
}

#[tokio::test]
async fn a_teacher_sees_only_their_own_class_map() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let a = teacher(&db).await;
    let b = teacher(&db).await;
    let (class_b, seats_b) = class(&db, b, 1).await;
    place_first(&db, &class_b, seats_b[0], &plot(0, 0, "plain"))
        .await
        .unwrap();
    assert_eq!(
        code(teacher_map(&db, a, &class_b).await.unwrap_err()),
        "class_not_found"
    );
    let map = teacher_map(&db, b, &class_b).await.unwrap();
    assert_eq!(map["cells"].as_array().unwrap().len(), 1);
}
