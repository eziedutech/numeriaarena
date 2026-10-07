//! The rules on their own, then the whole flow against a real Postgres when
//! `TEST_DATABASE_URL` is set (the local one: `docker compose up -d postgres`).

use super::*;

#[test]
fn five_wrong_lock_and_ten_need_the_teacher() {
    let mut tries = 0;
    let mut wrong = 0;
    let mut seen = Vec::new();
    for _ in 0..10 {
        let a = after_wrong(tries, wrong);
        seen.push((a.lock, a.teacher));
        tries = a.tries;
        wrong = a.wrong;
    }
    assert_eq!(seen[3], (false, false));
    assert_eq!(seen[4], (true, false));
    assert_eq!(seen[8], (false, false));
    assert_eq!(seen[9], (false, true));
    assert_eq!(after_wrong(4, 4).tries, 0);
}

#[test]
fn pictures_stay_on_the_nine() {
    for _ in 0..200 {
        assert!(new_picture().iter().all(|&p| p < PICTURES));
    }
    let a = picture_hash("salt", &[1, 2, 3]);
    assert_eq!(a, picture_hash("salt", &[1, 2, 3]));
    assert_ne!(a, picture_hash("salt", &[3, 2, 1]));
    assert_ne!(a, picture_hash("other", &[1, 2, 3]));
}

#[test]
fn a_class_pauses_after_thirty_wrong_then_recovers() {
    let g = Guard::default();
    let t = Instant::now();
    for _ in 0..CLASS_WRONG - 1 {
        g.wrong("c", t);
    }
    assert!(!g.paused("c", t));
    g.wrong("c", t);
    assert!(g.paused("c", t));
    assert!(!g.paused("other", t));
    assert!(!g.paused("c", t + CLASS_WINDOW + Duration::from_secs(1)));
}

#[test]
fn a_new_class_is_checked() {
    let ok = NewClass {
        label: " 5B ".into(),
        grade: 5,
        school_year: "2026/27".into(),
        seats: 30,
    };
    assert_eq!(validate(&ok).unwrap().label, "5B");
    let bad = |label: &str, grade, seats| NewClass {
        label: label.into(),
        grade,
        school_year: String::new(),
        seats,
    };
    assert_eq!(validate(&bad("  ", 5, 3)), Err("label"));
    assert_eq!(validate(&bad(&"x".repeat(31), 5, 3)), Err("label"));
    assert_eq!(validate(&bad("5B", 0, 3)), Err("grade"));
    assert_eq!(validate(&bad("5B", 5, 0)), Err("seats"));
    assert_eq!(validate(&bad("5B", 5, MAX_SEATS + 1)), Err("seats"));
}

// ------------------------------------------------------------ with Postgres

async fn db() -> Option<PgPool> {
    let url = std::env::var("TEST_DATABASE_URL").ok()?;
    let db = PgPool::connect(&url).await.expect("TEST_DATABASE_URL");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("migrate");
    Some(db)
}

/// A new adult, with an organizer approval in `status` (none when `None`).
async fn teacher(db: &PgPool, status: Option<&str>) -> i64 {
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO users (firebase_uid, email, email_verified) VALUES ($1, 'teacher@test.example', true)
         RETURNING id",
    )
    .bind(format!("test-{}", random_hex()))
    .fetch_one(db)
    .await
    .unwrap();
    if let Some(status) = status {
        sqlx::query(
            "INSERT INTO organizer_approvals (user_id, status, path) VALUES ($1, $2, 'self')",
        )
        .bind(id)
        .bind(status)
        .execute(db)
        .await
        .unwrap();
    }
    id
}

fn new_class(seats: i16) -> NewClass {
    NewClass {
        label: "5B".into(),
        grade: 5,
        school_year: "2026/27".into(),
        seats,
    }
}

fn picture_of(card: &Value) -> Vec<u8> {
    card["picture"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_u64().unwrap() as u8)
        .collect()
}

/// A picture that is not this one.
fn other(p: &[u8]) -> Vec<u8> {
    vec![(p[0] + 1) % PICTURES, p[1], p[2]]
}

fn signing(code: &str, seat: i16, picture: Vec<u8>) -> SignIn {
    SignIn {
        class_code: code.to_lowercase(),
        seat,
        picture,
    }
}

fn why(r: Result<Value, ApiError>) -> &'static str {
    match r {
        Ok(_) => "ok",
        Err(ApiError(_, why)) => why,
    }
}

#[tokio::test]
async fn a_class_from_creation_to_archive() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let guard = Guard::default();
    let owner = teacher(&db, Some("approved")).await;
    let a = allowance(&db, owner, false).await.unwrap();
    assert_eq!(a, Allowance::Full);

    let made = create_class(&db, owner, a, &new_class(3)).await.unwrap();
    let id = made["class"]["id"].as_str().unwrap().to_owned();
    let code = made["class"]["join_code"].as_str().unwrap().to_owned();
    assert_eq!(code.len(), 6);
    let cards = made["seats"].as_array().unwrap().clone();
    assert_eq!(cards.len(), 3);
    let names: Vec<&str> = cards
        .iter()
        .map(|c| c["pseudonym"].as_str().unwrap())
        .collect();
    assert!(names[0] != names[1] && names[1] != names[2] && names[0] != names[2]);

    // The teacher's list and page never show a picture again.
    let list = list_classes(&db, owner).await.unwrap();
    assert_eq!(list["classes"][0]["seats"], 3);
    let page = class_detail(&db, owner, &id).await.unwrap();
    assert_eq!(page["seats"][2]["number"], 3);
    assert!(page["seats"][0].get("picture").is_none());

    // Seat 1 signs in with its card; the code is read in any case.
    let p1 = picture_of(&cards[0]);
    let signed = sign_in(&db, &guard, &signing(&code, 1, p1.clone()))
        .await
        .unwrap();
    assert_eq!(signed["pseudonym"], cards[0]["pseudonym"]);
    let token = signed["token"].as_str().unwrap().to_owned();
    let s = student(&db, &token).await.unwrap().unwrap();
    assert_eq!((s.number, s.class_id.as_str()), (1, id.as_str()));
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 9, p1.clone())).await),
        "seat_not_found"
    );
    assert_eq!(
        why(sign_in(&db, &guard, &signing("ZZZZZZ", 1, p1.clone())).await),
        "class_not_found"
    );
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 1, vec![1, 2])).await),
        "picture"
    );

    // Four wrong pictures are only wrong; the fifth locks the seat, even for the right one.
    let p2 = picture_of(&cards[1]);
    for _ in 0..4 {
        assert_eq!(
            why(sign_in(&db, &guard, &signing(&code, 2, other(&p2))).await),
            "wrong_picture"
        );
    }
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 2, other(&p2))).await),
        "locked"
    );
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 2, p2.clone())).await),
        "locked"
    );
    let page = class_detail(&db, owner, &id).await.unwrap();
    assert_eq!(page["seats"][1]["locked"], true);

    // Five more after the lock ends: only the teacher opens it now.
    let lift = || {
        sqlx::query("UPDATE class_seats SET locked_until = now() - interval '1 second' WHERE class_id = $1 AND number = 2")
            .bind(&id)
            .execute(&db)
    };
    lift().await.unwrap();
    for _ in 0..4 {
        assert_eq!(
            why(sign_in(&db, &guard, &signing(&code, 2, other(&p2))).await),
            "wrong_picture"
        );
    }
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 2, other(&p2))).await),
        "ask_teacher"
    );
    lift().await.unwrap();
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 2, p2.clone())).await),
        "ask_teacher"
    );
    change_seat(&db, owner, &id, 2, SeatChange::Unlock)
        .await
        .unwrap();
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 2, p2.clone())).await),
        "ok"
    );

    // A new picture: the old card fails and the signed-in device is signed out.
    let card = change_seat(&db, owner, &id, 1, SeatChange::Picture)
        .await
        .unwrap();
    assert_eq!(card["pseudonym"], cards[0]["pseudonym"]);
    assert!(student(&db, &token).await.unwrap().is_none());
    let new_p1 = picture_of(&card);
    if new_p1 != p1 {
        assert_eq!(
            why(sign_in(&db, &guard, &signing(&code, 1, p1.clone())).await),
            "wrong_picture"
        );
    }
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 1, new_p1)).await),
        "ok"
    );

    // A reset seat gets a name no other seat has.
    let card = change_seat(&db, owner, &id, 3, SeatChange::Reset)
        .await
        .unwrap();
    assert!(
        card["pseudonym"] != cards[0]["pseudonym"] && card["pseudonym"] != cards[1]["pseudonym"]
    );

    // More seats continue the numbers.
    let more = more_seats(&db, owner, a, &id, 2).await.unwrap();
    assert_eq!(more["seats"][0]["number"], 4);
    assert_eq!(
        why(more_seats(&db, owner, a, &id, MAX_SEATS).await),
        "seats_limit"
    );

    // Another teacher sees nothing and changes nothing.
    let stranger = teacher(&db, Some("approved")).await;
    assert_eq!(
        why(class_detail(&db, stranger, &id).await),
        "class_not_found"
    );
    assert_eq!(
        why(change_seat(&db, stranger, &id, 1, SeatChange::Picture).await),
        "class_not_found"
    );
    assert_eq!(why(archive(&db, stranger, &id).await), "class_not_found");

    // Archived: the code stops working, devices sign out, the list keeps it without a code.
    let p4 = picture_of(&more["seats"][0]);
    let signed = sign_in(&db, &guard, &signing(&code, 4, p4.clone()))
        .await
        .unwrap();
    archive(&db, owner, &id).await.unwrap();
    assert!(
        student(&db, signed["token"].as_str().unwrap())
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        why(sign_in(&db, &guard, &signing(&code, 4, p4)).await),
        "class_not_found"
    );
    let list = list_classes(&db, owner).await.unwrap();
    assert_eq!(list["classes"][0]["status"], "archived");
    assert!(list["classes"][0]["join_code"].is_null());
    assert_eq!(why(more_seats(&db, owner, a, &id, 1).await), "archived");
}

#[tokio::test]
async fn seats_race_in_groups_of_six_unless_the_teacher_moves_one() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let owner = teacher(&db, Some("approved")).await;
    let a = allowance(&db, owner, false).await.unwrap();
    let made = create_class(&db, owner, a, &new_class(14)).await.unwrap();
    let id = made["class"]["id"].as_str().unwrap().to_owned();
    let groups = |seats: Vec<(i16, u8)>| seats.into_iter().map(|(_, g)| g).collect::<Vec<_>>();
    assert_eq!(
        groups(seat_groups(&db, &id).await.unwrap()),
        [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2]
    );
    // Seat 13 moves to group B; the page shows the choice.
    let moved = set_group(&db, owner, &id, 13, Some(1)).await.unwrap();
    assert_eq!(
        (moved["group"].as_u64(), moved["group_chosen"].as_bool()),
        (Some(1), Some(true))
    );
    let page = class_detail(&db, owner, &id).await.unwrap();
    assert_eq!(page["seats"][12]["group"], 1);
    assert_eq!(page["seats"][12]["group_chosen"], true);
    assert_eq!(page["seats"][13]["group"], 2);
    assert_eq!(page["seats"][13]["group_chosen"], false);
    assert_eq!(seat_groups(&db, &id).await.unwrap()[12], (13, 1));
    assert_eq!(why(set_group(&db, owner, &id, 13, Some(8)).await), "group");
    assert_eq!(
        why(set_group(&db, owner, &id, 40, Some(1)).await),
        "seat_not_found"
    );
    let stranger = teacher(&db, Some("approved")).await;
    assert_ne!(why(set_group(&db, stranger, &id, 13, Some(0)).await), "ok");
    // Back by number.
    groups_by_number(&db, owner, &id).await.unwrap();
    assert_eq!(seat_groups(&db, &id).await.unwrap()[12], (13, 2));
}

#[tokio::test]
async fn pending_teachers_get_one_small_class_and_others_none() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let pending = teacher(&db, Some("pending")).await;
    let a = allowance(&db, pending, false).await.unwrap();
    assert_eq!(a, Allowance::Trial);
    assert_eq!(
        why(create_class(&db, pending, a, &new_class(6)).await),
        "seats_limit"
    );
    let made = create_class(&db, pending, a, &new_class(5)).await.unwrap();
    assert_eq!(
        why(create_class(&db, pending, a, &new_class(1)).await),
        "classes_limit"
    );
    let id = made["class"]["id"].as_str().unwrap();
    assert_eq!(why(more_seats(&db, pending, a, id, 1).await), "seats_limit");

    let nobody = teacher(&db, None).await;
    assert!(matches!(
        allowance(&db, nobody, false).await,
        Err(ApiError(_, "not_organizer"))
    ));
    assert_eq!(allowance(&db, nobody, true).await.unwrap(), Allowance::Full);
    let suspended = teacher(&db, Some("suspended")).await;
    assert!(matches!(
        allowance(&db, suspended, false).await,
        Err(ApiError(_, "suspended"))
    ));
}

#[tokio::test]
async fn a_seat_keeps_its_match_results_until_it_is_emptied() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let owner = teacher(&db, Some("approved")).await;
    let a = allowance(&db, owner, false).await.unwrap();
    let made = create_class(&db, owner, a, &new_class(2)).await.unwrap();
    let id = made["class"]["id"].as_str().unwrap().to_owned();
    let seat: i64 =
        sqlx::query_scalar("SELECT id FROM class_seats WHERE class_id = $1 AND number = 1")
            .bind(&id)
            .fetch_one(&db)
            .await
            .unwrap();
    let (room, game) = (random_hex(), random_hex());
    sqlx::query("INSERT INTO rooms (id, play_code, watch_code, seats, created_by, class_id) VALUES ($1, 'AAAAAA', 'BBBBBB', 3, $2, $3)")
        .bind(&room)
        .bind(owner)
        .bind(&id)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO matches (id, room_id, seed, content_pack_version, fairness_params_version, seats) VALUES ($1, $2, 1, 'cp', 'fp', '[]')")
        .bind(&game)
        .bind(&room)
        .execute(&db)
        .await
        .unwrap();
    // An official match in the class's room, and one in a room for anyone.
    let other = random_hex();
    sqlx::query("INSERT INTO matches (id, room_id, seed, content_pack_version, fairness_params_version, seats) VALUES ($1, $2, 1, 'cp', 'fp', '[]')")
        .bind(&other)
        .bind(&room)
        .execute(&db)
        .await
        .unwrap();
    for (m, official, points) in [(&game, true, 120), (&other, false, 40)] {
        sqlx::query("INSERT INTO match_seat_results (match_id, seat, class_seat_id, official, points, folded, place, stars) VALUES ($1, 0, $2, $3, $4, 3, 1, 2)")
            .bind(m)
            .bind(seat)
            .bind(official)
            .bind(points)
            .execute(&db)
            .await
            .unwrap();
    }
    // Plays on its own, one sent twice.
    let race: Play = serde_json::from_value(json!({
        "client_id": "r1", "kind": "race", "game": "make10", "points": 90, "folded": 4,
        "place": 2, "stars": 1, "duration_ms": 90000
    }))
    .unwrap();
    let practice: Play = serde_json::from_value(json!({
        "client_id": "p1", "kind": "practice", "points": 50, "folded": 5,
        "right": 5, "total": 6, "duration_ms": 60000
    }))
    .unwrap();
    record_play(&db, seat, &race).await.unwrap();
    record_play(&db, seat, &race).await.unwrap();
    record_play(&db, seat, &practice).await.unwrap();
    let bad: Play = serde_json::from_value(json!({
        "client_id": "x", "kind": "race", "points": 9, "folded": 1, "place": 9, "stars": 1,
        "duration_ms": 1
    }))
    .unwrap();
    assert_eq!(record_play(&db, seat, &bad).await.unwrap_err().1, "play");

    let detail = class_detail(&db, owner, &id).await.unwrap();
    let s0 = &detail["seats"][0];
    assert_eq!(s0["official"]["matches"], 1);
    assert_eq!(s0["official"]["stars"], 2);
    assert_eq!(s0["last_official"]["points"], 120);
    assert_eq!(s0["other_rooms"]["matches"], 1);
    assert_eq!(s0["own"]["races"], 1);
    assert_eq!(s0["own"]["practices"], 1);
    assert_eq!(s0["own"]["days"], 1);
    assert_eq!(detail["seats"][1]["official"]["matches"], 0);
    assert!(detail["seats"][1]["last_official"].is_null());
    assert_eq!(detail["seats"][1]["own"]["races"], 0);
    // A new picture keeps the records; emptying the seat for a new student does not.
    change_seat(&db, owner, &id, 1, SeatChange::Picture)
        .await
        .unwrap();
    assert_eq!(
        class_detail(&db, owner, &id).await.unwrap()["seats"][0]["official"]["matches"],
        1
    );
    change_seat(&db, owner, &id, 1, SeatChange::Reset)
        .await
        .unwrap();
    let after = class_detail(&db, owner, &id).await.unwrap();
    assert_eq!(after["seats"][0]["official"]["matches"], 0);
    assert_eq!(after["seats"][0]["other_rooms"]["matches"], 0);
    assert_eq!(after["seats"][0]["own"]["races"], 0);
}

#[tokio::test]
async fn deleting_a_class_takes_everything_it_holds() {
    let Some(db) = db().await else {
        eprintln!("TEST_DATABASE_URL not set: skipped");
        return;
    };
    let owner = teacher(&db, Some("approved")).await;
    let stranger = teacher(&db, Some("approved")).await;
    let a = allowance(&db, owner, false).await.unwrap();
    let made = create_class(&db, owner, a, &new_class(2)).await.unwrap();
    let id = made["class"]["id"].as_str().unwrap().to_owned();
    let seat: i64 =
        sqlx::query_scalar("SELECT id FROM class_seats WHERE class_id = $1 AND number = 1")
            .bind(&id)
            .fetch_one(&db)
            .await
            .unwrap();
    let (room, game) = (random_hex(), random_hex());
    sqlx::query("INSERT INTO rooms (id, play_code, watch_code, seats, created_by, class_id) VALUES ($1, 'AAAAAA', 'BBBBBB', 3, $2, $3)")
        .bind(&room)
        .bind(owner)
        .bind(&id)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO matches (id, room_id, seed, content_pack_version, fairness_params_version, seats) VALUES ($1, $2, 1, 'cp', 'fp', '[]')")
        .bind(&game)
        .bind(&room)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO match_seat_results (match_id, seat, class_seat_id, official, points, folded, place, stars) VALUES ($1, 0, $2, true, 50, 3, 1, 2)")
        .bind(&game)
        .bind(seat)
        .execute(&db)
        .await
        .unwrap();
    let practice: Play = serde_json::from_value(json!({
        "client_id": "p1", "kind": "practice", "points": 50, "folded": 5,
        "right": 5, "total": 6, "duration_ms": 60000
    }))
    .unwrap();
    record_play(&db, seat, &practice).await.unwrap();
    sqlx::query("INSERT INTO town_plots (class_id, class_seat_id, land_index, kind, x, y) VALUES ($1, $2, 0, 'plain', 0, 0)")
        .bind(&id)
        .bind(seat)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO ai_insights (class_id, seat, data_hash, value, provider, model) VALUES ($1, 1, 'h', '{}', 'p', 'm')")
        .bind(&id)
        .execute(&db)
        .await
        .unwrap();
    // An archived class can be deleted too, but only by its teacher.
    archive(&db, owner, &id).await.unwrap();
    assert_eq!(
        why(delete_class(&db, stranger, &id).await),
        "class_not_found"
    );
    delete_class(&db, owner, &id).await.unwrap();

    let count = |sql: &'static str, key: String| {
        let db = db.clone();
        async move {
            sqlx::query_scalar::<_, i64>(sql)
                .bind(key)
                .fetch_one(&db)
                .await
                .unwrap()
        }
    };
    assert_eq!(
        count("SELECT count(*) FROM classes WHERE id = $1", id.clone()).await,
        0
    );
    assert_eq!(
        count(
            "SELECT count(*) FROM class_seats WHERE class_id = $1",
            id.clone()
        )
        .await,
        0
    );
    assert_eq!(
        count(
            "SELECT count(*) FROM town_plots WHERE class_id = $1",
            id.clone()
        )
        .await,
        0
    );
    assert_eq!(
        count(
            "SELECT count(*) FROM ai_insights WHERE class_id = $1",
            id.clone()
        )
        .await,
        0
    );
    assert_eq!(
        count("SELECT count(*) FROM rooms WHERE id = $1", room.clone()).await,
        0
    );
    assert_eq!(
        count("SELECT count(*) FROM matches WHERE id = $1", game.clone()).await,
        0
    );
    assert_eq!(
        count(
            "SELECT count(*) FROM seat_plays WHERE class_seat_id::text = $1",
            seat.to_string()
        )
        .await,
        0
    );
    assert_eq!(
        count(
            "SELECT count(*) FROM audit_log WHERE target = $1",
            format!("class:{id}")
        )
        .await,
        1
    );
    assert_eq!(why(delete_class(&db, owner, &id).await), "class_not_found");
}
