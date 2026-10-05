//! What is kept of an answer, then the outbox and the report against a real
//! Postgres when `TEST_DATABASE_URL` is set.

use super::*;
use crate::classes::{SeatChange, allowance, change_seat, create_class};
use crate::rooms::random_hex;

fn content() -> Content {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content");
    Content::load(&dir).unwrap()
}

/// An answer to the bank's first question.
fn answer(c: &Content, id: &str, result: &str, attempt: u32) -> Sent {
    let t = &c.templates[0];
    Sent {
        event_id: id.into(),
        mode: "practice".into(),
        event: json!({
            "event_id": id, "at_ms": 1000.0, "player": "me", "mode": "practice",
            "game_type": "balloon_burst", "skill": t.skill, "template_id": t.id,
            "params_hash": "x", "b": 0.0, "p_final": 0.7, "result": result,
            "attempt": attempt, "assisted": false, "time_ms": 4200.0,
            "fairness_params_version": "fp", "content_pack_version": "cp"
        }),
    }
}

#[test]
fn every_kind_of_mistake_in_the_bank_has_words_for_the_teacher() {
    let c = content();
    let missing: Vec<_> = c
        .templates
        .iter()
        .flat_map(|t| t.distractors.iter().map(|d| &d.misconception))
        .filter(|code| !c.misconceptions.contains_key(*code))
        .collect();
    assert!(
        missing.is_empty(),
        "not in misconceptions.json: {missing:?}"
    );
}

#[test]
fn only_answers_to_the_bank_are_kept() {
    let c = content();
    assert!(
        check(&c, &answer(&c, "a", "correct", 1))
            .unwrap()
            .unwrap()
            .correct
    );
    assert!(check(&c, &answer(&c, "a", "void", 1)).unwrap().is_none());
    let mut odd = answer(&c, "a", "correct", 1);
    odd.event["template_id"] = json!("tpl.none");
    assert_eq!(check(&c, &odd).err(), Some("unknown_template"));
    let mut odd = answer(&c, "a", "correct", 1);
    odd.event["skill"] = json!("XX.NONE");
    assert_eq!(check(&c, &odd).err(), Some("skill"));
    assert_eq!(
        check(&c, &answer(&c, "a", "maybe", 1)).err(),
        Some("result")
    );
    assert_eq!(
        check(&c, &answer(&c, "a", "wrong", 0)).err(),
        Some("attempt")
    );
    let mut odd = answer(&c, "a", "correct", 1);
    odd.mode = "class".into();
    assert_eq!(check(&c, &odd).err(), Some("mode"));
    let mut odd = answer(&c, "a", "correct", 1);
    odd.event["misconception"] = json!("m".repeat(EVENT_BYTES));
    assert_eq!(check(&c, &odd).err(), Some("too_big"));
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

/// One match in a room of the class; `official` when the class's own.
async fn match_with(
    db: &PgPool,
    owner: i64,
    class: &str,
    seat: i64,
    official: bool,
    events: &[Value],
) {
    let (room, game) = (random_hex(), random_hex());
    sqlx::query("INSERT INTO rooms (id, play_code, watch_code, seats, created_by, class_id) VALUES ($1, 'AAAAAA', 'BBBBBB', 3, $2, $3)")
        .bind(&room)
        .bind(owner)
        .bind(class)
        .execute(db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO matches (id, room_id, seed, content_pack_version, fairness_params_version, seats) VALUES ($1, $2, 1, 'cp', 'fp', '[]')")
        .bind(&game)
        .bind(&room)
        .execute(db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO match_seat_results (match_id, seat, class_seat_id, official, points, folded, place, stars) VALUES ($1, 0, $2, $3, 10, 1, 1, 1)")
        .bind(&game)
        .bind(seat)
        .bind(official)
        .execute(db)
        .await
        .unwrap();
    for e in events {
        sqlx::query(
            "INSERT INTO match_answers (event_id, match_id, seat, event) VALUES ($1, $2, 0, $3)",
        )
        .bind(random_hex())
        .bind(&game)
        .bind(e)
        .execute(db)
        .await
        .unwrap();
    }
}

#[tokio::test]
async fn own_answers_and_class_races_are_reported_apart() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let c = content();
    let t = &c.templates[0];
    let owner = teacher(&db).await;
    let a = allowance(&db, owner, false).await.unwrap();
    let new: crate::classes::NewClass = serde_json::from_value(json!({
        "label": "5B", "grade": 5, "school_year": "2026/27", "seats": 2
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

    // Own play: two right and one wrong first try, a retry, a cancelled one, a stray.
    let mut stray = answer(&c, "e6", "correct", 1);
    stray.event["template_id"] = json!("tpl.none");
    let batch = vec![
        answer(&c, "e1", "correct", 1),
        answer(&c, "e2", "correct", 1),
        {
            let mut e = answer(&c, "e3", "wrong", 1);
            e.event["misconception"] = json!("off_by_one");
            e
        },
        answer(&c, "e4", "correct", 2),
        answer(&c, "e5", "void", 1),
        stray,
    ];
    let first = store_answers(&db, &c, seat, &batch).await.unwrap();
    assert_eq!(first["stored"], 4);
    assert_eq!(first["acked"], json!(["e1", "e2", "e3", "e4", "e5"]));
    assert_eq!(
        first["rejected"],
        json!([{ "event_id": "e6", "reason": "unknown_template" }])
    );
    // Sent again (the answer did not reach the device): kept once.
    let again = store_answers(&db, &c, seat, &batch).await.unwrap();
    assert_eq!(again["stored"], 0);
    assert_eq!(again["acked"], first["acked"]);

    // A class race counts; a room for anyone does not.
    let race = |result: &str| answer(&c, "m", result, 1).event;
    match_with(&db, owner, &id, seat, true, &[race("wrong"), race("wrong")]).await;
    match_with(&db, owner, &id, seat, false, &[race("correct")]).await;

    let report = class_report(&db, &c, owner, &id).await.unwrap();
    let rows = report["rows"].as_array().unwrap();
    assert_eq!(
        rows,
        &vec![
            json!({ "seat": 1, "source": "class", "template_id": t.id, "skill": t.skill, "right": 0, "total": 2 }),
            json!({ "seat": 1, "source": "own", "template_id": t.id, "skill": t.skill, "right": 2, "total": 3 }),
        ]
    );
    assert!(report["skills"][&t.skill]["en"].is_string());
    assert_eq!(
        report["mistakes"],
        json!([{ "seat": 1, "source": "own", "skill": t.skill, "misconception": "off_by_one", "count": 1 }])
    );
    assert_eq!(report["templates"][&t.id]["skill"], json!(t.skill));
    let example = report["templates"][&t.id]["example"]["en"]
        .as_str()
        .unwrap();
    assert!(!example.contains('{'), "{example}");
    // Another adult sees nothing of it.
    let stranger = teacher(&db).await;
    let hidden = class_report(&db, &c, stranger, &id).await.unwrap_err();
    assert_eq!(hidden.1, "class_not_found");
    // A new student in the seat starts with no answers of the last one.
    change_seat(&db, owner, &id, 1, SeatChange::Reset)
        .await
        .unwrap();
    let report = class_report(&db, &c, owner, &id).await.unwrap();
    assert_eq!(report["rows"], json!([]));
}

/// An answer from a race on the smartboard.
fn board_answer(c: &Content, id: &str, result: &str) -> Sent {
    let mut s = answer(c, id, result, 1);
    s.mode = "board".into();
    s.event["mode"] = json!("board");
    s
}

#[tokio::test]
async fn a_race_on_the_smartboard_counts_with_the_class() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let c = content();
    let t = &c.templates[0];
    let owner = teacher(&db).await;
    let a = allowance(&db, owner, false).await.unwrap();
    let new: crate::classes::NewClass = serde_json::from_value(json!({
        "label": "5C", "grade": 5, "school_year": "2026/27", "seats": 3
    }))
    .unwrap();
    let made = create_class(&db, owner, a, &new).await.unwrap();
    let id = made["class"]["id"].as_str().unwrap().to_owned();
    let race = |players: Value| -> BoardRace {
        serde_json::from_value(json!({
            "client_id": "b1", "duration_ms": 60000, "total": 2, "players": players
        }))
        .unwrap()
    };
    let events = |e: Vec<Sent>| -> Value {
        e.iter()
            .map(|s| json!({ "event_id": s.event_id, "mode": s.mode, "event": s.event }))
            .collect()
    };
    let saved = race(json!([
        { "seat": 1, "right": 2, "place": 1,
          "events": events(vec![board_answer(&c, "b1-1-1", "correct"), board_answer(&c, "b1-1-2", "correct")]) },
        { "seat": 2, "right": 1, "place": 2,
          "events": events(vec![board_answer(&c, "b1-2-1", "correct"), board_answer(&c, "b1-2-2", "wrong")]) },
    ]));
    let done = record_board(&db, &c, owner, &id, &saved).await.unwrap();
    assert_eq!(done["players"][0]["answers"]["stored"], 2);
    // Sent again (the network dropped the reply): kept once.
    let again = record_board(&db, &c, owner, &id, &saved).await.unwrap();
    assert_eq!(again["players"][1]["answers"]["stored"], 0);

    let report = class_report(&db, &c, owner, &id).await.unwrap();
    assert_eq!(
        report["rows"],
        json!([
            { "seat": 1, "source": "class", "template_id": t.id, "skill": t.skill, "right": 2, "total": 2 },
            { "seat": 2, "source": "class", "template_id": t.id, "skill": t.skill, "right": 1, "total": 2 },
        ])
    );
    let detail = crate::classes::class_detail(&db, owner, &id).await.unwrap();
    assert_eq!(
        detail["seats"][0]["board"],
        json!({ "races": 1, "stars": 3 })
    );
    assert_eq!(
        detail["seats"][1]["board"],
        json!({ "races": 1, "stars": 1 })
    );
    assert_eq!(detail["seats"][0]["own"]["days"], 0);

    // The same seat twice, a seat the class lacks, another adult's class.
    let twice = race(json!([
        { "seat": 1, "right": 0, "place": 1, "events": [] },
        { "seat": 1, "right": 0, "place": 2, "events": [] },
    ]));
    assert_eq!(
        record_board(&db, &c, owner, &id, &twice)
            .await
            .unwrap_err()
            .1,
        "board"
    );
    let lacking = race(json!([{ "seat": 9, "right": 0, "place": 1, "events": [] }]));
    assert_eq!(
        record_board(&db, &c, owner, &id, &lacking)
            .await
            .unwrap_err()
            .1,
        "seat_not_found"
    );
    let stranger = teacher(&db).await;
    assert_eq!(
        record_board(&db, &c, stranger, &id, &saved)
            .await
            .unwrap_err()
            .1,
        "class_not_found"
    );
    // A student's own device cannot send answers as a smartboard race.
    let seat: i64 =
        sqlx::query_scalar("SELECT id FROM class_seats WHERE class_id = $1 AND number = 3")
            .bind(&id)
            .fetch_one(&db)
            .await
            .unwrap();
    let own = store_answers(&db, &c, seat, &[board_answer(&c, "x1", "correct")])
        .await
        .unwrap();
    assert_eq!(
        own["rejected"],
        json!([{ "event_id": "x1", "reason": "mode" }])
    );
}
