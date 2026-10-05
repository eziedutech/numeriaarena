//! The boards against a real Postgres when `TEST_DATABASE_URL` is set.

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

/// A new teacher, approved when `approved`, else waiting with a trial class.
async fn teacher(db: &PgPool, approved: bool) -> i64 {
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO users (firebase_uid, email, email_verified) VALUES ($1, 'teacher@test.example', true)
         RETURNING id",
    )
    .bind(format!("test-{}", random_hex()))
    .fetch_one(db)
    .await
    .unwrap();
    sqlx::query("INSERT INTO organizer_approvals (user_id, status, path) VALUES ($1, $2, 'self')")
        .bind(id)
        .bind(if approved { "approved" } else { "pending" })
        .execute(db)
        .await
        .unwrap();
    id
}

/// A class of `seats` seats, and the ids of its seats by number.
async fn class(db: &PgPool, owner: i64, seats: i16) -> (String, Vec<i64>) {
    let a = allowance(db, owner, false).await.unwrap();
    let new: crate::classes::NewClass = serde_json::from_value(json!({
        "label": "5B", "grade": 5, "school_year": "2026/27", "seats": seats
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

/// A judged race of the seat, `days_ago` days back.
async fn race(db: &PgPool, owner: i64, seat: i64, points: i32, days_ago: i32) {
    let (room, game) = (random_hex(), random_hex());
    sqlx::query("INSERT INTO rooms (id, play_code, watch_code, seats, created_by) VALUES ($1, 'AAAAAA', 'BBBBBB', 2, $2)")
        .bind(&room)
        .bind(owner)
        .execute(db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO matches (id, room_id, seed, content_pack_version, fairness_params_version, seats) VALUES ($1, $2, 1, 'cp', 'fp', '[]')")
        .bind(&game)
        .bind(&room)
        .execute(db)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO match_seat_results (match_id, seat, class_seat_id, official, points, folded, place, stars, created_at)
         VALUES ($1, 0, $2, false, $3, 1, 1, 1, now() - make_interval(days => $4))",
    )
    .bind(&game)
    .bind(seat)
    .bind(points)
    .bind(days_ago)
    .execute(db)
    .await
    .unwrap();
}

/// A play on its own the device reported, `days_ago` days back.
async fn practice(db: &PgPool, seat: i64, points: i32, days_ago: i32) {
    sqlx::query(
        "INSERT INTO seat_plays (class_seat_id, client_id, kind, points, folded, right_answers, total, duration_ms, played_at)
         VALUES ($1, $2, 'practice', $3, 0, 1, 1, 1000, now() - make_interval(days => $4))",
    )
    .bind(seat)
    .bind(random_hex())
    .bind(points)
    .bind(days_ago)
    .execute(db)
    .await
    .unwrap();
}

fn places(rows: &Value) -> Vec<(i64, i64, bool)> {
    rows.as_array()
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["place"].as_i64().unwrap(),
                r["score"].as_i64().unwrap(),
                r["me"].as_bool().unwrap(),
            )
        })
        .collect()
}

#[tokio::test]
async fn a_class_board_ranks_judged_races_and_days_played() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let owner = teacher(&db, true).await;
    let (id, seats) = class(&db, owner, 3).await;
    // Seat 1: a best of 40 and an old 90; seat 2: 40 later; seat 3: only practice, high as it says.
    race(&db, owner, seats[0], 40, 0).await;
    race(&db, owner, seats[0], 25, 0).await;
    race(&db, owner, seats[1], 40, 0).await;
    race(&db, owner, seats[0], 90, 400).await;
    practice(&db, seats[2], 99_999, 0).await;
    practice(&db, seats[2], 1, 0).await;
    practice(&db, seats[2], 1, 1).await;

    let month = board(&db, Some(&id), Period::Month, Some(seats[1]), TOP)
        .await
        .unwrap();
    // A practice never counts as a race; the tie goes to who reached it first.
    let strike = places(&month["strike"]);
    assert_eq!(strike.len(), 2);
    assert_eq!(strike[0].1, 40);
    assert_eq!(strike[1], (2, 40, true));
    // Two days for seat 3 (if the month is that old), one each for the others.
    let days = places(&month["days"]);
    assert_eq!(days.len(), 3);
    assert!(days.iter().all(|d| (1..=2).contains(&d.1)));

    let all = board(&db, Some(&id), Period::All, None, TOP).await.unwrap();
    assert_eq!(places(&all["strike"])[0], (1, 90, false));
    let names: Vec<_> = all["days"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["score"].as_i64().unwrap())
        .collect();
    assert_eq!(names, vec![2, 2, 1]);
}

#[tokio::test]
async fn global_takes_classes_that_take_part_and_shows_the_seat_beyond_the_top() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let owner = teacher(&db, true).await;
    let (id, seats) = class(&db, owner, 12).await;
    for (i, &s) in seats.iter().enumerate() {
        race(&db, owner, s, 90_000 - i as i32, 0).await;
    }
    let mine = *seats.last().unwrap();
    let global = board(&db, None, Period::Month, Some(mine), TOP)
        .await
        .unwrap();
    let strike = global["strike"].as_array().unwrap();
    assert_eq!(strike.len(), TOP as usize + 1);
    assert!(
        strike[..TOP as usize]
            .iter()
            .all(|r| !r["me"].as_bool().unwrap())
    );
    assert!(strike[TOP as usize]["me"].as_bool().unwrap());
    // Only the pseudonym and the grade: no class, no seat number.
    let mut keys: Vec<_> = strike[0].as_object().unwrap().keys().cloned().collect();
    keys.sort();
    assert_eq!(keys, vec!["grade", "me", "name", "place", "score"]);

    // The teacher takes the class off Global.
    set_on_global(&db, owner, &id, false).await.unwrap();
    let global = board(&db, None, Period::Month, Some(mine), TOP)
        .await
        .unwrap();
    assert!(
        global["strike"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| !r["me"].as_bool().unwrap())
    );
    assert!(
        set_on_global(&db, teacher(&db, true).await, &id, true)
            .await
            .is_err()
    );

    // A teacher not yet approved has a class, but it stays off Global.
    let pending = teacher(&db, false).await;
    let (_, others) = class(&db, pending, 1).await;
    race(&db, pending, others[0], 95_000, 0).await;
    let global = board(&db, None, Period::Month, Some(others[0]), TOP)
        .await
        .unwrap();
    assert!(
        global["strike"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| !r["me"].as_bool().unwrap())
    );
}
