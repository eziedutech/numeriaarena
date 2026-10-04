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

async fn join(
    rooms: &Rooms,
    code: &str,
    resume: Option<String>,
    host: Option<String>,
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
    let opened = rooms.open(3, None).await.unwrap();
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
    a.send(ClientMsg::Start).await;
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
async fn seats_fill_then_the_room_is_full() {
    let rooms = rooms();
    let opened = rooms.open(2, None).await.unwrap();
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
async fn only_the_first_seat_or_the_host_starts() {
    let rooms = rooms();
    let opened = rooms.open(3, None).await.unwrap();
    let _a = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let mut b = join(&rooms, &opened.play_code, None, None).await.unwrap();
    b.send(ClientMsg::Start).await;
    b.until(|m| matches!(m, ServerMsg::Error { code: "not_host" }).then_some(()))
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
    screen
        .until(|m| matches!(m, ServerMsg::View(_)).then_some(()))
        .await;
    // Once started, a new classmate cannot sit down.
    assert_eq!(
        join(&rooms, &opened.play_code, None, None).await.err(),
        Some("match_started")
    );
}

#[tokio::test(start_paused = true)]
async fn a_dropped_seat_comes_back_with_its_token() {
    let rooms = rooms();
    let opened = rooms.open(3, None).await.unwrap();
    let mut a = join(&rooms, &opened.play_code, None, None).await.unwrap();
    let token = a
        .until(|m| match m {
            ServerMsg::Welcome { token, .. } => token.clone(),
            _ => None,
        })
        .await;
    a.send(ClientMsg::Start).await;
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
    let opened = rooms.open(3, None).await.unwrap();
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
