//! Rooms driven through their command channel, on tokio's paused clock, so a
//! whole match (about four minutes) runs in a moment. No database.

use super::*;
use foldlings_core::fairness::GameType;

fn rooms() -> Arc<Rooms> {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../content");
    Rooms::new(Content::load(&dir).unwrap(), None)
}

struct Client {
    conn: u64,
    inbox: mpsc::Receiver<ServerMsg>,
    tx: mpsc::Sender<Cmd>,
}

impl Client {
    async fn send(&self, msg: ClientMsg) {
        self.tx
            .send(Cmd::Msg {
                conn: self.conn,
                msg,
            })
            .await
            .unwrap();
    }

    async fn recv(&mut self) -> ServerMsg {
        tokio::time::timeout(Duration::from_secs(600), self.inbox.recv())
            .await
            .expect("a message in time")
            .expect("room open")
    }

    /// Reads until a message `pick` accepts.
    async fn until<T>(&mut self, mut pick: impl FnMut(&ServerMsg) -> Option<T>) -> T {
        loop {
            let m = self.recv().await;
            if let Some(t) = pick(&m) {
                return t;
            }
        }
    }
}

/// The teacher's class screen starts the room; returns once the countdown is over.
async fn start(rooms: &Rooms, opened: &Opened) -> Client {
    let mut host = join(
        rooms,
        &opened.watch_code,
        None,
        Some(opened.host_token.clone()),
    )
    .await
    .unwrap();
    host.send(ClientMsg::Start).await;
    host.until(|m| matches!(m, ServerMsg::View(_)).then_some(()))
        .await;
    host
}

async fn join(
    rooms: &Rooms,
    code: &str,
    resume: Option<String>,
    host: Option<String>,
) -> Result<Client, &'static str> {
    join_with(rooms, code, resume, host, None).await
}

async fn join_with(
    rooms: &Rooms,
    code: &str,
    resume: Option<String>,
    host: Option<String>,
    student: Option<Seated>,
) -> Result<Client, &'static str> {
    let entry = rooms.find(code).ok_or("room_not_found")?;
    let (out, inbox) = mpsc::channel(OUTBOX);
    let (reply, joined) = oneshot::channel();
    entry
        .tx
        .send(Cmd::Join {
            watch: entry.watch,
            resume,
            host,
            student,
            out,
            reply,
        })
        .await
        .unwrap();
    let conn = joined.await.unwrap()?;
    Ok(Client {
        conn,
        inbox,
        tx: entry.tx,
    })
}

#[test]
fn codes_are_six_unambiguous_letters() {
    for _ in 0..200 {
        let c = random_code();
        assert_eq!(c.len(), CODE_LEN);
        assert!(c.bytes().all(|b| CODE_ALPHABET.contains(&b)), "{c}");
        assert!(!c.contains(['I', 'L', 'O', '0', '1']));
    }
}

#[test]
fn content_has_a_version() {
    let r = rooms();
    assert!(r.content.version.starts_with("cp-"));
    assert_eq!(r.content.version.len(), 15);
}

/// Plays as one classmate: asks for creatures and answers each after 4 s,
/// until the recap. Returns the points the verdicts gave and the recap.
async fn play_seat(mut c: Client) -> (u32, foldlings_core::class_match::ClassRecap) {
    let mut points = 0;
    let mut asked = false;
    loop {
        if !asked {
            c.send(ClientMsg::Next).await;
            asked = true;
        }
        match c.recv().await {
            ServerMsg::Offer(o) => {
                tokio::time::sleep(Duration::from_secs(4)).await;
                let id = o.offer.offer_id;
                let msg = match o.offer.game {
                    GameType::BalloonBurst => ClientMsg::AnswerBalloon {
                        offer_id: id,
                        index: 0,
                    },
                    _ => ClientMsg::AnswerOrb {
                        offer_id: id,
                        crystals: vec![0],
                    },
                };
                c.send(msg).await;
            }
            ServerMsg::Verdict(v) => {
                points += v.race_points;
                if v.verdict.retry_allowed {
                    // Try again with another choice.
                    let id = v.verdict.offer_id;
                    c.send(ClientMsg::AnswerBalloon {
                        offer_id: id,
                        index: 1,
                    })
                    .await;
                } else {
                    asked = false;
                }
            }
            ServerMsg::Error { code: "wait" } => {
                tokio::time::sleep(Duration::from_millis(500)).await;
                asked = false;
            }
            ServerMsg::Error {
                code: "not_your_offer" | "bad_choice",
            } => asked = false,
            ServerMsg::Recap(r) => return (points, r),
            _ => {}
        }
    }
}

#[tokio::test(start_paused = true)]
async fn two_classmates_and_a_bot_race_to_the_recap() {
    let rooms = rooms();
    let opened = rooms.open(3, None, RoomKind::Class).await.unwrap();
    let mut watcher = join(&rooms, &opened.watch_code, None, None).await.unwrap();
    let mut a = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let b = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let (seat, name) = a
        .until(|m| match m {
            ServerMsg::Welcome { seat, name, .. } => Some((*seat, name.clone())),
            _ => None,
        })
        .await;
    assert_eq!(seat, Some(0));
    let name = name.unwrap();
    assert_eq!(name.split(' ').count(), 3, "{name}");
    // The watcher sees both names arrive in the lobby.
    watcher
        .until(|m| match m {
            ServerMsg::Lobby(l) if l.names.len() == 2 => Some(()),
            _ => None,
        })
        .await;
    let _host = start(&rooms, &opened).await;
    // The watcher reads along (a watcher that stops reading is let go).
    let watch = async {
        let mut saw_bot = false;
        loop {
            match watcher.recv().await {
                ServerMsg::Event {
                    event: ClassEvent::SeatWorking { seat: 2, .. },
                } => saw_bot = true,
                ServerMsg::Recap(_) => break saw_bot,
                _ => {}
            }
        }
    };
    let (ra, rb, saw_bot) = tokio::join!(play_seat(a), play_seat(b), watch);
    let (pa, recap) = ra;
    let (pb, _) = rb;
    assert_eq!(recap.players.len(), 3);
    assert!(!recap.players[0].bot && !recap.players[1].bot && recap.players[2].bot);
    assert_eq!(recap.players[0].points, pa);
    assert_eq!(recap.players[1].points, pb);
    assert_eq!(recap.players[0].name, name);
    assert!(pa > 0 && recap.players[0].folded > 0, "{recap:?}");
    assert!(saw_bot);
}

#[tokio::test(start_paused = true)]
async fn an_adult_finds_the_rooms_they_opened() {
    let rooms = rooms();
    let first = rooms.open(3, Some(7), RoomKind::Class).await.unwrap();
    tokio::time::advance(Duration::from_millis(10)).await;
    let second = rooms.open(2, Some(7), RoomKind::Class).await.unwrap();
    rooms.open(3, Some(8), RoomKind::Class).await.unwrap();
    rooms.open(3, None, RoomKind::Class).await.unwrap();
    let mine = rooms.hosted_by(7);
    let codes: Vec<&str> = mine
        .iter()
        .map(|(o, _, _, _)| o.play_code.as_str())
        .collect();
    assert_eq!(codes, [second.play_code.as_str(), first.play_code.as_str()]);
    assert_eq!(mine[0].0.host_token, second.host_token);
    assert_eq!(mine[0].1, 2);
    // A closed room is gone from the list.
    rooms.forget(&[&first.play_code, &first.watch_code]);
    assert_eq!(rooms.hosted_by(7).len(), 1);
}

#[tokio::test(start_paused = true)]
async fn only_its_host_closes_a_room_and_it_cannot_be_joined_again() {
    let rooms = rooms();
    let opened = rooms.open(3, Some(7), RoomKind::Class).await.unwrap();
    let mut seat = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let mut screen = join(&rooms, &opened.watch_code, None, None).await.unwrap();
    assert!(!rooms.close(&opened.id, 8).await);
    assert!(rooms.close(&opened.id, 7).await);
    for c in [&mut seat, &mut screen] {
        c.until(|m| {
            matches!(
                m,
                ServerMsg::Error {
                    code: "room_closed"
                }
            )
            .then_some(())
        })
        .await;
        // Then the room is gone and its sockets close.
        assert!(c.inbox.recv().await.is_none());
    }
    assert!(rooms.hosted_by(7).is_empty());
    assert!(matches!(
        join(&rooms, &opened.play_code, None, None).await,
        Err("room_not_found")
    ));
    assert!(!rooms.close(&opened.id, 7).await);
}

#[tokio::test(start_paused = true)]
async fn an_open_room_starts_when_everyone_in_it_is_ready() {
    let rooms = rooms();
    let opened = rooms.open(3, None, RoomKind::Open).await.unwrap();
    let mut a = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let b = join(&rooms, &opened.play_code, None, None).await.unwrap();
    // Nobody starts an open room, not even its creator's screen.
    let mut screen = join(
        &rooms,
        &opened.watch_code,
        None,
        Some(opened.host_token.clone()),
    )
    .await
    .unwrap();
    screen.send(ClientMsg::Start).await;
    screen
        .until(|m| matches!(m, ServerMsg::Error { code: "not_host" }).then_some(()))
        .await;
    let lobby = |want: fn(&LobbyView) -> bool| {
        move |m: &ServerMsg| match m {
            ServerMsg::Lobby(l) if want(l) => Some(()),
            _ => None,
        }
    };
    a.send(ClientMsg::Ready).await;
    a.until(lobby(|l| {
        l.ready == [true, false] && l.starts_at_ms.is_none()
    }))
    .await;
    b.send(ClientMsg::Ready).await;
    a.until(lobby(|l| l.starts_at_ms.is_some())).await;
    // One more coming in stops the countdown until they are ready too.
    let c = join(&rooms, &opened.play_code, None, None).await.unwrap();
    a.until(lobby(|l| l.names.len() == 3 && l.starts_at_ms.is_none()))
        .await;
    c.send(ClientMsg::Ready).await;
    a.until(lobby(|l| l.starts_at_ms.is_some())).await;
    a.until(|m| matches!(m, ServerMsg::View(_)).then_some(()))
        .await;
}

#[tokio::test(start_paused = true)]
async fn seats_fill_then_the_room_is_full() {
    let rooms = rooms();
    let opened = rooms.open(2, None, RoomKind::Class).await.unwrap();
    let _a = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let _b = join(&rooms, &opened.play_code, None, None).await.unwrap();
    assert_eq!(
        join(&rooms, &opened.play_code, None, None).await.err(),
        Some("room_full")
    );
    assert_eq!(
        join(&rooms, "ZZZZZZ", None, None).await.err(),
        Some("room_not_found")
    );
}

#[tokio::test(start_paused = true)]
async fn in_a_class_room_only_the_teacher_starts_after_a_countdown() {
    let rooms = rooms();
    let opened = rooms.open(3, None, RoomKind::Class).await.unwrap();
    let mut a = join(&rooms, &opened.play_code, None, None).await.unwrap();
    // Not the first seat, and not a screen without the host token.
    a.send(ClientMsg::Start).await;
    a.until(|m| matches!(m, ServerMsg::Error { code: "not_host" }).then_some(()))
        .await;
    let mut watcher = join(&rooms, &opened.watch_code, None, None).await.unwrap();
    watcher.send(ClientMsg::Start).await;
    watcher
        .until(|m| matches!(m, ServerMsg::Error { code: "not_host" }).then_some(()))
        .await;
    let mut screen = join(
        &rooms,
        &opened.watch_code,
        None,
        Some(opened.host_token.clone()),
    )
    .await
    .unwrap();
    screen.send(ClientMsg::Start).await;
    let at = a
        .until(|m| match m {
            ServerMsg::Lobby(l) => l.starts_at_ms,
            _ => None,
        })
        .await;
    // During the countdown a late classmate still sits down, and sees it.
    let mut late = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let (names, seen) = late
        .until(|m| match m {
            ServerMsg::Lobby(l) => Some((l.names.len(), l.starts_at_ms)),
            _ => None,
        })
        .await;
    assert_eq!((names, seen), (2, Some(at)));
    screen.send(ClientMsg::Start).await;
    screen
        .until(|m| matches!(m, ServerMsg::Error { code: "starting" }).then_some(()))
        .await;
    let began = tokio::time::Instant::now();
    late.until(|m| matches!(m, ServerMsg::View(_)).then_some(()))
        .await;
    let waited = began.elapsed().as_millis();
    assert!((9_000..=10_200).contains(&waited), "{waited}");
    // Once started, a new classmate cannot sit down.
    assert_eq!(
        join(&rooms, &opened.play_code, None, None).await.err(),
        Some("match_started")
    );
}

#[tokio::test(start_paused = true)]
async fn a_student_signed_in_to_a_seat_races_under_its_pseudonym() {
    let rooms = rooms();
    let opened = rooms.open(3, None, RoomKind::Class).await.unwrap();
    let welcome = |m: &ServerMsg| match m {
        ServerMsg::Welcome { seat, name, .. } => Some((*seat, name.clone())),
        _ => None,
    };
    let fox = || Some(seated(7, "Red Fox 03", "c1"));
    let mut a = join_with(&rooms, &opened.play_code, None, None, fox())
        .await
        .unwrap();
    assert_eq!(a.until(welcome).await, (Some(0), Some("Red Fox 03".into())));
    // A seat of another class with the same pseudonym gets a made-up one.
    let other = Some(seated(9, "Red Fox 03", "c2"));
    let mut b = join_with(&rooms, &opened.play_code, None, None, other)
        .await
        .unwrap();
    let (seat, name) = b.until(welcome).await;
    assert_eq!(seat, Some(1));
    assert_ne!(name.as_deref(), Some("Red Fox 03"));
    // The same seat again (a reload, another tab) takes its own place back.
    let mut again = join_with(&rooms, &opened.play_code, None, None, fox())
        .await
        .unwrap();
    assert_eq!(
        again.until(welcome).await,
        (Some(0), Some("Red Fox 03".into()))
    );
}

fn seated(seat_id: i64, pseudonym: &str, class_id: &str) -> Seated {
    Seated {
        seat_id,
        pseudonym: pseudonym.into(),
        class_id: class_id.into(),
        group: 0,
    }
}

/// Seat `number` of class c1, in the group of its number.
fn classmate(number: i16) -> Option<Seated> {
    Some(Seated {
        seat_id: number as i64,
        pseudonym: format!("Seat {number:02}"),
        class_id: "c1".into(),
        group: crate::classes::race_group(number, None),
    })
}

/// Class c1 with seats 01 to `seats`, in groups by number.
fn class_of(seats: i16) -> RoomClass {
    RoomClass {
        id: "c1".into(),
        label: "5B".into(),
        grade: 5,
        seats: (1..=seats)
            .map(|n| (n, crate::classes::race_group(n, None)))
            .collect(),
    }
}

async fn turn_of(c: &mut Client) -> TurnView {
    c.until(|m| match m {
        ServerMsg::Lobby(l) => l.turn.clone(),
        _ => None,
    })
    .await
}

#[tokio::test(start_paused = true)]
async fn a_class_races_one_group_of_six_at_a_time() {
    let rooms = rooms();
    let opened = rooms
        .open_for(6, Some(7), RoomKind::Class, Some(class_of(8)))
        .await
        .unwrap();
    let code = opened.play_code.clone();
    // Group A (01 to 06) sits down first; seat 07 waits for group B.
    assert_eq!(
        join_with(&rooms, &code, None, None, classmate(7))
            .await
            .err(),
        Some("not_your_turn")
    );
    let mut one = join_with(&rooms, &code, None, None, classmate(1))
        .await
        .unwrap();
    let turn = turn_of(&mut one).await;
    assert_eq!(
        turn,
        TurnView {
            group: 0,
            seats: vec![1, 2, 3, 4, 5, 6],
            next: Some(1),
            groups: vec![0, 1],
        }
    );
    // Only the class screen calls a group, and only one with seats.
    one.send(ClientMsg::Turn { group: 1 }).await;
    one.until(|m| matches!(m, ServerMsg::Error { code: "not_host" }).then_some(()))
        .await;
    let mut screen = join(
        &rooms,
        &opened.watch_code,
        None,
        Some(opened.host_token.clone()),
    )
    .await
    .unwrap();
    screen.send(ClientMsg::Turn { group: 5 }).await;
    screen
        .until(|m| matches!(m, ServerMsg::Error { code: "no_group" }).then_some(()))
        .await;
    // Called before the match, group B takes the desks and group A stands up.
    screen.send(ClientMsg::Turn { group: 1 }).await;
    one.until(|m| matches!(m, ServerMsg::Error { code: "turn_over" }).then_some(()))
        .await;
    let mut seven = join_with(&rooms, &code, None, None, classmate(7))
        .await
        .unwrap();
    let turn = turn_of(&mut seven).await;
    assert_eq!(
        (turn.group, turn.seats, turn.next),
        (1, vec![7, 8], Some(0))
    );
    assert_eq!(
        join_with(&rooms, &code, None, None, classmate(2))
            .await
            .err(),
        Some("not_your_turn")
    );
    // Group B races; during the match no group is called.
    screen.send(ClientMsg::Start).await;
    screen
        .until(|m| matches!(m, ServerMsg::View(_)).then_some(()))
        .await;
    screen.send(ClientMsg::Turn { group: 0 }).await;
    screen
        .until(|m| {
            matches!(
                m,
                ServerMsg::Error {
                    code: "match_started"
                }
            )
            .then_some(())
        })
        .await;
    let race = tokio::spawn(play_seat(seven));
    screen
        .until(|m| matches!(m, ServerMsg::Recap(_)).then_some(()))
        .await;
    race.await.unwrap();
    // After the recap, group A comes back for the next match.
    screen.send(ClientMsg::Turn { group: 0 }).await;
    let turn = turn_of(&mut screen).await;
    assert_eq!(turn.group, 0);
    let mut two = join_with(&rooms, &code, None, None, classmate(2))
        .await
        .unwrap();
    let name = two
        .until(|m| match m {
            ServerMsg::Welcome { name, .. } => Some(name.clone()),
            _ => None,
        })
        .await;
    assert_eq!(name.as_deref(), Some("Seat 02"));
}

#[tokio::test(start_paused = true)]
async fn rooms_open_to_anyone_have_no_turns() {
    let rooms = rooms();
    let opened = rooms.open(3, None, RoomKind::Class).await.unwrap();
    let mut a = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let turn = a
        .until(|m| match m {
            ServerMsg::Lobby(l) => Some(l.turn.clone()),
            _ => None,
        })
        .await;
    assert_eq!(turn, None);
    let mut screen = join(
        &rooms,
        &opened.watch_code,
        None,
        Some(opened.host_token.clone()),
    )
    .await
    .unwrap();
    screen.send(ClientMsg::Turn { group: 0 }).await;
    screen
        .until(|m| matches!(m, ServerMsg::Error { code: "no_class" }).then_some(()))
        .await;
}

/// The seats of the match once it starts: (name, bot).
async fn match_seats(c: &mut Client) -> Vec<(String, bool)> {
    c.until(|m| match m {
        ServerMsg::View(v) => Some(v.seats.iter().map(|s| (s.name.clone(), s.bot)).collect()),
        _ => None,
    })
    .await
}

#[tokio::test(start_paused = true)]
async fn two_students_of_a_grade_find_each_other_as_rivals() {
    let rooms = rooms();
    let code = rooms.find_rival(4).await.unwrap();
    // Another grade waits in a duel of its own.
    assert_ne!(rooms.find_rival(5).await.unwrap(), code);
    let mut a = join_with(
        &rooms,
        &code,
        None,
        None,
        Some(seated(1, "Red Fox 03", "c1")),
    )
    .await
    .unwrap();
    let rival_by = a
        .until(|m| match m {
            ServerMsg::Lobby(l) => l.rival_by_ms,
            _ => None,
        })
        .await;
    assert!(rival_by >= DUEL_WAIT_MS, "{rival_by}");
    // The second student of grade 4 is sent to the same duel, and it starts.
    assert_eq!(rooms.find_rival(4).await.unwrap(), code);
    let mut b = join_with(
        &rooms,
        &code,
        None,
        None,
        Some(seated(2, "Teal Owl 11", "c2")),
    )
    .await
    .unwrap();
    // Once it counts down, the duel takes no one else.
    a.until(|m| match m {
        ServerMsg::Lobby(l) if l.starts_at_ms.is_some() => Some(()),
        _ => None,
    })
    .await;
    assert_ne!(rooms.find_rival(4).await.unwrap(), code);
    let seats = match_seats(&mut b).await;
    assert_eq!(
        seats,
        vec![("Red Fox 03".into(), false), ("Teal Owl 11".into(), false)]
    );
}

#[tokio::test(start_paused = true)]
async fn a_student_with_no_rival_races_a_robot() {
    let rooms = rooms();
    let code = rooms.find_rival(4).await.unwrap();
    // A duel is for students signed in to a seat.
    let guest = join(&rooms, &code, None, None).await;
    assert_eq!(guest.err(), Some("students_only"));
    let mut a = join_with(
        &rooms,
        &code,
        None,
        None,
        Some(seated(1, "Red Fox 03", "c1")),
    )
    .await
    .unwrap();
    let seats = match_seats(&mut a).await;
    assert_eq!(seats.len(), 2);
    assert_eq!(seats[0], ("Red Fox 03".into(), false));
    assert!(seats[1].1);
}

#[tokio::test(start_paused = true)]
async fn a_student_who_leaves_a_duel_gives_the_desk_up() {
    let rooms = rooms();
    let code = rooms.find_rival(4).await.unwrap();
    let a = join_with(
        &rooms,
        &code,
        None,
        None,
        Some(seated(1, "Red Fox 03", "c1")),
    )
    .await
    .unwrap();
    a.tx.send(Cmd::Leave { conn: a.conn }).await.unwrap();
    // The next one finds the same duel with both desks free, and waits anew.
    assert_eq!(rooms.find_rival(4).await.unwrap(), code);
    let mut b = join_with(
        &rooms,
        &code,
        None,
        None,
        Some(seated(2, "Teal Owl 11", "c2")),
    )
    .await
    .unwrap();
    let seat = b
        .until(|m| match m {
            ServerMsg::Welcome { seat, .. } => Some(*seat),
            _ => None,
        })
        .await;
    assert_eq!(seat, Some(0));
    let names = b
        .until(|m| match m {
            ServerMsg::Lobby(l) if l.rival_by_ms.is_some() => Some(l.names.clone()),
            _ => None,
        })
        .await;
    assert_eq!(names, vec!["Teal Owl 11".to_string()]);
}

#[tokio::test(start_paused = true)]
async fn a_room_for_a_class_seats_only_that_class() {
    let rooms = rooms();
    let class = RoomClass {
        id: "c1".into(),
        label: "5B".into(),
        grade: 5,
        seats: vec![(3, 0)],
    };
    let opened = rooms
        .open_for(3, Some(7), RoomKind::Class, Some(class.clone()))
        .await
        .unwrap();
    assert_eq!(rooms.class_room("c1"), Some(opened.play_code.clone()));
    assert_eq!(rooms.class_room("c2"), None);
    assert_eq!(rooms.hosted_by(7)[0].3, Some(class));
    // A guest, and a seat of another class, are turned away.
    let guest = join(&rooms, &opened.play_code, None, None).await;
    assert_eq!(guest.err(), Some("class_only"));
    let other = join_with(
        &rooms,
        &opened.play_code,
        None,
        None,
        Some(seated(9, "Red Fox 03", "c2")),
    )
    .await;
    assert_eq!(other.err(), Some("wrong_class"));
    // The class's own seat sits down under its pseudonym; watchers still watch.
    let mut a = join_with(
        &rooms,
        &opened.play_code,
        None,
        None,
        Some(seated(3, "Blue Crane 07", "c1")),
    )
    .await
    .unwrap();
    let name = a
        .until(|m| match m {
            ServerMsg::Welcome { name, .. } => Some(name.clone()),
            _ => None,
        })
        .await;
    assert_eq!(name.as_deref(), Some("Blue Crane 07"));
    assert!(join(&rooms, &opened.watch_code, None, None).await.is_ok());
}

#[tokio::test(start_paused = true)]
async fn a_dropped_seat_comes_back_with_its_token() {
    let rooms = rooms();
    let opened = rooms.open(3, None, RoomKind::Class).await.unwrap();
    let mut a = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let token = a
        .until(|m| match m {
            ServerMsg::Welcome { token, .. } => token.clone(),
            _ => None,
        })
        .await;
    let _host = start(&rooms, &opened).await;
    a.until(|m| matches!(m, ServerMsg::View(_)).then_some(()))
        .await;
    a.tx.send(Cmd::Leave { conn: a.conn }).await.unwrap();
    let mut watcher = join(&rooms, &opened.watch_code, None, None).await.unwrap();
    watcher
        .until(|m| match m {
            ServerMsg::View(v) if v.seats[0].away => Some(()),
            _ => None,
        })
        .await;
    let mut back = join(&rooms, &opened.play_code, Some(token), None)
        .await
        .unwrap();
    let seat = back
        .until(|m| match m {
            ServerMsg::Welcome { seat, .. } => Some(*seat),
            _ => None,
        })
        .await;
    assert_eq!(seat, Some(0));
    watcher
        .until(|m| match m {
            ServerMsg::Event {
                event: ClassEvent::SeatBack { seat: 0, .. },
            } => Some(()),
            _ => None,
        })
        .await;
}

#[tokio::test(start_paused = true)]
async fn watchers_cheer_at_most_every_ten_seconds() {
    let rooms = rooms();
    let opened = rooms.open(3, None, RoomKind::Class).await.unwrap();
    let mut w = join(&rooms, &opened.watch_code, None, None).await.unwrap();
    w.send(ClientMsg::Cheer).await;
    w.until(|m| matches!(m, ServerMsg::Cheer { .. }).then_some(()))
        .await;
    w.send(ClientMsg::Cheer).await;
    w.until(|m| {
        matches!(
            m,
            ServerMsg::Error {
                code: "rate_limited"
            }
        )
        .then_some(())
    })
    .await;
    tokio::time::sleep(Duration::from_secs(11)).await;
    w.send(ClientMsg::Cheer).await;
    w.until(|m| matches!(m, ServerMsg::Cheer { .. }).then_some(()))
        .await;
}

#[tokio::test(start_paused = true)]
async fn the_demo_room_races_bots_for_watchers() {
    let rooms = rooms();
    rooms.open_demo();
    let mut w = join(&rooms, DEMO_CODE, None, None).await.unwrap();
    let recap = w
        .until(|m| match m {
            ServerMsg::Recap(r) => Some(r.clone()),
            _ => None,
        })
        .await;
    assert!(recap.players.iter().all(|p| p.bot));
    // And it starts again.
    w.until(|m| match m {
        ServerMsg::Event {
            event: ClassEvent::WaveStart { wave: 0, .. },
        } => Some(()),
        _ => None,
    })
    .await;
}
