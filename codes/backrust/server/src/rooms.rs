//! Class Match rooms: play and watch codes, one
//! task per room that runs the core's `ClassMatch` on the server's clock, the
//! WebSocket at `/api/ws`, and the public demo room of bots.
//!
//! Rooms live in memory. Answers are written to the database at the end of
//! every wave and of the match, keyed by their event id, so writing again
//! after a failure never counts an answer twice.

use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Json;
use axum::extract::State as Extract;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use foldlings_core::class_match::{
    ClassConfig, ClassError, ClassEvent, ClassMatch, Classmate, MAX_SEATS, SeatAnswerEvent,
};
use foldlings_core::fairness::FairnessParams;
use foldlings_core::protocol::{ClientMsg, LobbyView, ServerMsg};
use foldlings_core::race::Phase;
use foldlings_core::session::SessionError;
use foldlings_core::template::ItemTemplate;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, oneshot};
use tokio::time::Instant;

use crate::State;
use crate::organizer::{ApiError, signed_in};

/// Codes are read aloud and typed on a headset: no I, L, O, 0 or 1.
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN: usize = 6;
/// The demo room's watch code, never drawn at random.
pub const DEMO_CODE: &str = "WATCHX";
/// How often a room advances its match.
const TICK: Duration = Duration::from_millis(100);
/// A room nobody is in, or whose match ended, closes after this long.
const IDLE_MS: f64 = 10.0 * 60_000.0;
/// No room runs longer than this.
const MAX_ROOM_MS: f64 = 2.0 * 3_600_000.0;
/// The demo room starts again this long after a match ends.
const DEMO_PAUSE_MS: f64 = 15_000.0;
/// A failed write at the end of a match is tried again this often.
const RETRY_MS: f64 = 5_000.0;
/// A watcher may cheer once in this long.
const CHEER_MS: f64 = 10_000.0;
/// Per connection: messages a second before they are dropped.
const MAX_PER_SECOND: u32 = 10;
/// The first message must be `hello`, within this long.
const HELLO_WITHIN: Duration = Duration::from_secs(10);
/// Messages waiting for a slow client before it is let go.
const OUTBOX: usize = 256;

/// Pseudonyms: a colour, an animal and two digits ("Blue Crane 07").
const COLOURS: [&str; 8] = [
    "Blue", "Red", "Green", "Gold", "Teal", "Coral", "Violet", "Amber",
];
const ANIMALS: [&str; 8] = [
    "Crane", "Fox", "Frog", "Whale", "Owl", "Rabbit", "Turtle", "Swan",
];

/// A random number from the OS-seeded hasher keys (no extra dependency).
fn random_u64() -> u64 {
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u64(0x006e_756d_6572_6961);
    h.finish()
}

fn random_hex() -> String {
    format!("{:016x}{:016x}", random_u64(), random_u64())
}

fn random_code() -> String {
    let mut n = random_u64();
    (0..CODE_LEN)
        .map(|_| {
            let c = CODE_ALPHABET[(n % CODE_ALPHABET.len() as u64) as usize] as char;
            n /= CODE_ALPHABET.len() as u64;
            c
        })
        .collect()
}

/// The content pack every room plays: the bank's templates, and a version
/// that changes whenever one of them does.
pub struct Content {
    pub templates: Vec<ItemTemplate>,
    pub version: String,
}

impl Content {
    /// Reads `templates/` and `contoh/` under `dir`, as the headset bundles them.
    pub fn load(dir: &std::path::Path) -> Result<Content, String> {
        let mut files = Vec::new();
        for sub in ["templates", "contoh"] {
            let d = dir.join(sub);
            let entries = std::fs::read_dir(&d).map_err(|e| format!("{}: {e}", d.display()))?;
            for e in entries {
                let p = e.map_err(|e| e.to_string())?.path();
                if p.extension().is_some_and(|x| x == "json") {
                    files.push(p);
                }
            }
        }
        files.sort();
        let mut hash = Sha256::new();
        let mut templates = Vec::new();
        for p in &files {
            let text = std::fs::read_to_string(p).map_err(|e| format!("{}: {e}", p.display()))?;
            hash.update(p.file_name().unwrap_or_default().as_encoded_bytes());
            hash.update(text.as_bytes());
            templates
                .push(ItemTemplate::from_json(&text).map_err(|e| format!("{}: {e}", p.display()))?);
        }
        if templates.is_empty() {
            return Err(format!("no templates under {}", dir.display()));
        }
        let digest = hash.finalize();
        let version = format!(
            "cp-{}",
            digest[..6]
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        );
        Ok(Content { templates, version })
    }
}

#[derive(Clone)]
struct Entry {
    tx: mpsc::Sender<Cmd>,
    watch: bool,
}

/// Every open room by its codes.
pub struct Rooms {
    content: Content,
    db: Option<sqlx::PgPool>,
    codes: Mutex<HashMap<String, Entry>>,
}

/// What `open` hands the room's creator.
#[derive(Debug, Clone)]
pub struct Opened {
    pub id: String,
    pub play_code: String,
    pub watch_code: String,
    pub host_token: String,
}

impl Rooms {
    pub fn new(content: Content, db: Option<sqlx::PgPool>) -> Arc<Rooms> {
        Arc::new(Rooms {
            content,
            db,
            codes: Mutex::new(HashMap::new()),
        })
    }

    fn find(&self, code: &str) -> Option<Entry> {
        self.codes.lock().expect("codes").get(code).cloned()
    }

    fn forget(&self, codes: &[&str]) {
        let mut map = self.codes.lock().expect("codes");
        for c in codes {
            map.remove(*c);
        }
    }

    /// Two fresh codes, registered together so they can never collide.
    fn register(&self, tx: &mpsc::Sender<Cmd>) -> (String, String) {
        let mut map = self.codes.lock().expect("codes");
        let fresh = || loop {
            let c = random_code();
            if c != DEMO_CODE && !map.contains_key(&c) {
                break c;
            }
        };
        let play = fresh();
        let mut watch = fresh();
        while watch == play {
            watch = fresh();
        }
        map.insert(
            play.clone(),
            Entry {
                tx: tx.clone(),
                watch: false,
            },
        );
        map.insert(
            watch.clone(),
            Entry {
                tx: tx.clone(),
                watch: true,
            },
        );
        (play, watch)
    }

    /// Opens a room of `seats` seats; empty seats are filled by bots when it starts.
    pub async fn open(
        self: &Arc<Self>,
        seats: usize,
        created_by: Option<i64>,
    ) -> Result<Opened, sqlx::Error> {
        let (tx, rx) = mpsc::channel(256);
        let (play_code, watch_code) = self.register(&tx);
        let opened = Opened {
            id: random_hex(),
            play_code,
            watch_code,
            host_token: random_hex(),
        };
        if let Some(db) = &self.db {
            let stored = sqlx::query(
                "INSERT INTO rooms (id, play_code, watch_code, seats, created_by) VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(&opened.id)
            .bind(&opened.play_code)
            .bind(&opened.watch_code)
            .bind(seats as i16)
            .bind(created_by)
            .execute(db)
            .await;
            if let Err(e) = stored {
                self.forget(&[&opened.play_code, &opened.watch_code]);
                return Err(e);
            }
        }
        let room = Room::new(
            self.clone(),
            opened.id.clone(),
            Some(opened.play_code.clone()),
            opened.watch_code.clone(),
            Some(opened.host_token.clone()),
            seats,
        );
        tokio::spawn(room.run(rx));
        Ok(opened)
    }

    /// The public demo: bots racing on a loop, watched with `DEMO_CODE`.
    pub fn open_demo(self: &Arc<Self>) {
        let (tx, rx) = mpsc::channel(256);
        self.codes
            .lock()
            .expect("codes")
            .insert(DEMO_CODE.into(), Entry { tx, watch: true });
        let mut room = Room::new(self.clone(), "demo".into(), None, DEMO_CODE.into(), None, 3);
        room.demo = true;
        tokio::spawn(room.run(rx));
    }
}

enum Cmd {
    Join {
        watch: bool,
        resume: Option<String>,
        host: Option<String>,
        out: mpsc::Sender<ServerMsg>,
        reply: oneshot::Sender<Result<u64, &'static str>>,
    },
    Msg {
        conn: u64,
        msg: ClientMsg,
    },
    Leave {
        conn: u64,
    },
}

struct Slot {
    name: String,
    token: String,
    conn: Option<u64>,
}

struct Conn {
    out: mpsc::Sender<ServerMsg>,
    seat: Option<usize>,
    host: bool,
    last_cheer: f64,
}

struct Room {
    rooms: Arc<Rooms>,
    id: String,
    play_code: Option<String>,
    watch_code: String,
    host_token: Option<String>,
    seats: usize,
    slots: Vec<Slot>,
    conns: HashMap<u64, Conn>,
    next_conn: u64,
    opened: Instant,
    game: Option<ClassMatch>,
    match_id: Option<String>,
    seed: u64,
    /// Answers not yet in the database (kept when a write fails).
    unsaved: Vec<SeatAnswerEvent>,
    /// The match ended but is not stored yet: when to try again.
    commit_retry: Option<f64>,
    done_at: Option<f64>,
    idle_since: Option<f64>,
    demo: bool,
}

impl Room {
    fn new(
        rooms: Arc<Rooms>,
        id: String,
        play_code: Option<String>,
        watch_code: String,
        host_token: Option<String>,
        seats: usize,
    ) -> Room {
        Room {
            rooms,
            id,
            play_code,
            watch_code,
            host_token,
            seats,
            slots: Vec::new(),
            conns: HashMap::new(),
            next_conn: 1,
            opened: Instant::now(),
            game: None,
            match_id: None,
            seed: 0,
            unsaved: Vec::new(),
            commit_retry: None,
            done_at: None,
            idle_since: Some(0.0),
            demo: false,
        }
    }

    fn now(&self) -> f64 {
        self.opened.elapsed().as_secs_f64() * 1000.0
    }

    async fn run(mut self, mut rx: mpsc::Receiver<Cmd>) {
        if self.demo {
            self.start_match(0.0).await;
        }
        let mut every = tokio::time::interval(TICK);
        loop {
            tokio::select! {
                cmd = rx.recv() => match cmd {
                    Some(cmd) => self.handle(cmd).await,
                    None => break,
                },
                _ = every.tick() => {
                    let now = self.now();
                    self.pump(now).await;
                    if self.commit_retry.is_some_and(|t| now >= t) {
                        self.flush(true).await;
                    }
                    if self.demo {
                        if self.done_at.is_some_and(|d| now - d > DEMO_PAUSE_MS) {
                            self.start_match(now).await;
                        }
                    } else if self.should_close(now) {
                        break;
                    }
                }
            }
        }
        let mut codes = vec![self.watch_code.as_str()];
        if let Some(p) = &self.play_code {
            codes.push(p);
        }
        self.rooms.forget(&codes);
        tracing::info!("room {} closed", self.id);
    }

    fn should_close(&self, now: f64) -> bool {
        now > MAX_ROOM_MS
            || self.idle_since.is_some_and(|t| now - t > IDLE_MS)
            || self.done_at.is_some_and(|t| now - t > IDLE_MS)
    }

    fn send(&mut self, conn: u64, msg: ServerMsg) {
        if let Some(c) = self.conns.get(&conn)
            && c.out.try_send(msg).is_err()
        {
            // Too slow or gone: let it go; its socket closes when the sender drops.
            self.drop_conn(conn);
        }
    }

    fn broadcast(&mut self, msg: &ServerMsg) {
        let ids: Vec<u64> = self.conns.keys().copied().collect();
        for id in ids {
            self.send(id, msg.clone());
        }
    }

    fn lobby(&self) -> ServerMsg {
        ServerMsg::Lobby(LobbyView {
            seats: self.seats,
            names: self.slots.iter().map(|s| s.name.clone()).collect(),
            watch_code: self.watch_code.clone(),
        })
    }

    fn state_msg(&self) -> ServerMsg {
        match &self.game {
            Some(m) => ServerMsg::View(m.view()),
            None => self.lobby(),
        }
    }

    fn pseudonym(&self) -> String {
        loop {
            let n = random_u64();
            let name = format!(
                "{} {} {:02}",
                COLOURS[(n % 8) as usize],
                ANIMALS[((n / 8) % 8) as usize],
                1 + (n / 64) % 99
            );
            if self.slots.iter().all(|s| s.name != name) {
                break name;
            }
        }
    }

    async fn handle(&mut self, cmd: Cmd) {
        let now = self.now();
        match cmd {
            Cmd::Join {
                watch,
                resume,
                host,
                out,
                reply,
            } => {
                let conn = self.next_conn;
                let seat = if watch {
                    None
                } else if let Some(s) = resume
                    .as_ref()
                    .and_then(|t| self.slots.iter().position(|s| &s.token == t))
                {
                    if let Some(old) = self.slots[s].conn {
                        self.drop_conn(old);
                    }
                    Some(s)
                } else if self.game.is_some() {
                    let _ = reply.send(Err("match_started"));
                    return;
                } else if self.slots.len() >= self.seats {
                    let _ = reply.send(Err("room_full"));
                    return;
                } else {
                    let name = self.pseudonym();
                    self.slots.push(Slot {
                        name,
                        token: random_hex(),
                        conn: None,
                    });
                    Some(self.slots.len() - 1)
                };
                if reply.send(Ok(conn)).is_err() {
                    return;
                }
                self.next_conn += 1;
                let is_host = host.is_some() && host == self.host_token;
                self.conns.insert(
                    conn,
                    Conn {
                        out,
                        seat,
                        host: is_host,
                        last_cheer: f64::NEG_INFINITY,
                    },
                );
                self.idle_since = None;
                if let Some(s) = seat {
                    self.slots[s].conn = Some(conn);
                    if let Some(m) = &mut self.game {
                        let _ = m.set_away(s, false, now);
                    }
                }
                let welcome = ServerMsg::Welcome {
                    seat,
                    name: seat.map(|s| self.slots[s].name.clone()),
                    token: seat.map(|s| self.slots[s].token.clone()),
                    now_ms: now,
                };
                self.send(conn, welcome);
                if self.game.is_some() {
                    let state = self.state_msg();
                    self.send(conn, state);
                    self.pump(now).await;
                } else {
                    let lobby = self.lobby();
                    self.broadcast(&lobby);
                }
            }
            Cmd::Leave { conn } => self.drop_conn(conn),
            Cmd::Msg { conn, msg } => {
                // Time first, so an answer after the bell finds its creature gone.
                self.pump(now).await;
                self.on_message(conn, msg, now).await;
                self.pump(now).await;
            }
        }
    }

    fn drop_conn(&mut self, conn: u64) {
        let Some(c) = self.conns.remove(&conn) else {
            return;
        };
        if let Some(s) = c.seat
            && self.slots[s].conn == Some(conn)
        {
            self.slots[s].conn = None;
            let now = self.now();
            if let Some(m) = &mut self.game {
                let _ = m.set_away(s, true, now);
            }
        }
        if self.conns.is_empty() {
            self.idle_since = Some(self.now());
        }
    }

    async fn on_message(&mut self, conn: u64, msg: ClientMsg, now: f64) {
        let Some(c) = self.conns.get(&conn) else {
            return;
        };
        let (seat, host) = (c.seat, c.host);
        let error = |code| ServerMsg::Error { code };
        match msg {
            ClientMsg::Hello { .. } => self.send(conn, error("already_joined")),
            ClientMsg::Start => {
                if self.demo || !(host || seat == Some(0)) {
                    self.send(conn, error("not_host"));
                } else if self.game.is_some() {
                    self.send(conn, error("match_started"));
                } else if self.slots.is_empty() {
                    self.send(conn, error("no_players"));
                } else {
                    self.start_match(now).await;
                }
            }
            ClientMsg::Cheer => {
                let c = self.conns.get_mut(&conn).expect("checked");
                if seat.is_some() {
                    self.send(conn, error("watchers_only"));
                } else if now - c.last_cheer < CHEER_MS {
                    self.send(conn, error("rate_limited"));
                } else {
                    c.last_cheer = now;
                    self.broadcast(&ServerMsg::Cheer { at_ms: now });
                }
            }
            ClientMsg::Next | ClientMsg::AnswerBalloon { .. } | ClientMsg::AnswerOrb { .. } => {
                let (Some(s), Some(m)) = (seat, self.game.as_mut()) else {
                    self.send(
                        conn,
                        error(if seat.is_none() {
                            "no_seat"
                        } else {
                            "not_started"
                        }),
                    );
                    return;
                };
                let reply = match msg {
                    ClientMsg::Next => match m.next(s, now) {
                        Ok(Some(o)) => Ok(ServerMsg::Offer(o)),
                        Ok(None) => Err("wait"),
                        Err(e) => Err(error_code(&e)),
                    },
                    ClientMsg::AnswerBalloon { offer_id, index } => m
                        .answer_balloon(s, offer_id, index, now)
                        .map(ServerMsg::Verdict)
                        .map_err(|e| error_code(&e)),
                    ClientMsg::AnswerOrb { offer_id, crystals } => m
                        .answer_orb(s, offer_id, &crystals, now)
                        .map(ServerMsg::Verdict)
                        .map_err(|e| error_code(&e)),
                    _ => unreachable!("matched above"),
                };
                match reply {
                    Ok(msg) => self.send(conn, msg),
                    Err(code) => self.send(conn, error(code)),
                }
            }
        }
    }

    async fn start_match(&mut self, now: f64) {
        self.seed = random_u64();
        let classmates = self
            .slots
            .iter()
            .enumerate()
            .map(|(i, s)| Classmate {
                name: s.name.clone(),
                player_id: format!("{}:{i}", self.id),
                grade: None,
            })
            .collect();
        let cfg = ClassConfig::new(
            self.seed,
            classmates,
            self.seats.max(self.slots.len()),
            self.rooms.content.version.clone(),
        );
        let mut m = match ClassMatch::new(
            self.rooms.content.templates.clone(),
            cfg,
            FairnessParams::default(),
        ) {
            Ok((m, _)) => m,
            Err(e) => {
                tracing::error!("room {}: cannot start: {e}", self.id);
                self.broadcast(&ServerMsg::Error {
                    code: "cannot_start",
                });
                return;
            }
        };
        m.start(now);
        // Seats whose classmate is not connected start away.
        for (i, s) in self.slots.iter().enumerate() {
            if s.conn.is_none() {
                let _ = m.set_away(i, true, now);
            }
        }
        self.game = Some(m);
        self.done_at = None;
        self.match_id = Some(random_hex());
        self.unsaved.clear();
        self.commit_retry = None;
        self.store_match().await;
        let view = self.state_msg();
        self.broadcast(&view);
        self.pump(now).await;
    }

    /// Advances the match and tells everyone what happened.
    async fn pump(&mut self, now: f64) {
        let Some(m) = &mut self.game else {
            return;
        };
        if m.phase() == Phase::Done {
            return;
        }
        let events = m.tick(now);
        if events.is_empty() {
            return;
        }
        let view = ServerMsg::View(m.view());
        let mut wave_over = false;
        let mut ended = false;
        for e in events {
            match e {
                ClassEvent::TimeUp { .. } => wave_over = true,
                ClassEvent::MatchEnd { .. } => ended = true,
                _ => {}
            }
            self.broadcast(&ServerMsg::Event { event: e });
        }
        self.broadcast(&view);
        // The recap first; `match_committed` follows once it is stored.
        if ended {
            let recap = self.game.as_ref().map(|m| m.recap()).expect("running");
            self.broadcast(&ServerMsg::Recap(recap));
            self.done_at = Some(now);
        }
        if wave_over || ended {
            self.flush(ended).await;
        }
    }

    /// The match's row, before any of its answers. The demo room stores nothing.
    async fn store_match(&mut self) -> bool {
        let (Some(db), Some(id), false) = (&self.rooms.db, &self.match_id, self.demo) else {
            return false;
        };
        let seats: Vec<Value> = self
            .game
            .as_ref()
            .map(|m| m.view().seats)
            .unwrap_or_default()
            .iter()
            .map(|s| json!({ "name": s.name, "bot": s.bot }))
            .collect();
        let stored = sqlx::query(
            "INSERT INTO matches (id, room_id, seed, content_pack_version, fairness_params_version, seats)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(&self.id)
        .bind(self.seed as i64)
        .bind(&self.rooms.content.version)
        .bind(FairnessParams::default().version)
        .bind(Value::Array(seats))
        .execute(db)
        .await;
        match stored {
            Ok(_) => true,
            Err(e) => {
                tracing::error!("room {}: match row: {e}", self.id);
                false
            }
        }
    }

    /// Writes the answers so far; at the end also the recap, then tells
    /// everyone. A failed final write is tried again every `RETRY_MS`.
    async fn flush(&mut self, ended: bool) {
        if let Some(m) = &mut self.game {
            self.unsaved.extend(m.drain_answer_events());
        }
        if self.demo || self.rooms.db.is_none() {
            self.unsaved.clear();
            return;
        }
        if ended {
            self.commit_retry = Some(self.now() + RETRY_MS);
        }
        if !self.store_match().await {
            return;
        }
        let db = self.rooms.db.clone().expect("checked");
        let id = self.match_id.clone().expect("running");
        let mut tx = match db.begin().await {
            Ok(tx) => tx,
            Err(e) => {
                tracing::error!("room {}: flush: {e}", self.id);
                return;
            }
        };
        for a in &self.unsaved {
            let event = serde_json::to_value(&a.event).unwrap_or(Value::Null);
            let r = sqlx::query(
                "INSERT INTO match_answers (event_id, match_id, seat, event) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (event_id) DO NOTHING",
            )
            .bind(&a.event.event_id)
            .bind(&id)
            .bind(a.seat as i16)
            .bind(event)
            .execute(&mut *tx)
            .await;
            if let Err(e) = r {
                tracing::error!("room {}: flush: {e}", self.id);
                return;
            }
        }
        if ended {
            let recap = self
                .game
                .as_ref()
                .and_then(|m| serde_json::to_value(m.recap()).ok());
            let r = sqlx::query("UPDATE matches SET ended_at = now(), recap = $2 WHERE id = $1")
                .bind(&id)
                .bind(recap)
                .execute(&mut *tx)
                .await;
            if let Err(e) = r {
                tracing::error!("room {}: flush: {e}", self.id);
                return;
            }
        }
        if let Err(e) = tx.commit().await {
            tracing::error!("room {}: flush: {e}", self.id);
            return;
        }
        self.unsaved.clear();
        if ended {
            self.commit_retry = None;
            self.broadcast(&ServerMsg::MatchCommitted { match_id: id });
        }
    }
}

fn error_code(e: &ClassError) -> &'static str {
    match e {
        ClassError::Away(_) => "away",
        ClassError::NotClassmate(_) | ClassError::UnknownSeat(_) => "no_seat",
        ClassError::Session(SessionError::BadChoice(_) | SessionError::WrongGame { .. }) => {
            "bad_choice"
        }
        ClassError::Session(SessionError::UnknownOffer(_) | SessionError::AlreadyAnswered(_)) => {
            "not_your_offer"
        }
        _ => "internal",
    }
}

// ------------------------------------------------------------ HTTP

#[derive(Deserialize)]
pub struct NewRoom {
    #[serde(default = "three")]
    seats: usize,
}

fn three() -> usize {
    3
}

/// `POST /api/rooms`: a signed-in adult opens a room (anyone, when the
/// server runs with `OPEN_ROOMS=1` for local tests).
pub async fn create(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(body): Json<NewRoom>,
) -> Result<Json<Value>, ApiError> {
    let user = if state.config.open_rooms {
        signed_in(&state, &headers).await.ok()
    } else {
        Some(signed_in(&state, &headers).await?)
    };
    if body.seats == 0 || body.seats > MAX_SEATS {
        return Err(ApiError(StatusCode::BAD_REQUEST, "seats"));
    }
    let opened = state.rooms.open(body.seats, user.map(|u| u.id)).await?;
    tracing::info!("room {} opened", opened.id);
    Ok(Json(json!({
        "id": opened.id,
        "play_code": opened.play_code,
        "watch_code": opened.watch_code,
        "host_token": opened.host_token,
        "seats": body.seats,
    })))
}

/// `GET /api/ws`: one headset or screen in one room.
pub async fn ws(Extract(state): Extract<State>, upgrade: WebSocketUpgrade) -> Response {
    let rooms = state.rooms.clone();
    upgrade
        .max_message_size(4096)
        .on_upgrade(move |socket| connection(rooms, socket))
}

async fn send_json(socket: &mut WebSocket, msg: &ServerMsg) -> bool {
    match serde_json::to_string(msg) {
        Ok(text) => socket.send(Message::Text(text.into())).await.is_ok(),
        Err(_) => false,
    }
}

async fn connection(rooms: Arc<Rooms>, mut socket: WebSocket) {
    let hello = match tokio::time::timeout(HELLO_WITHIN, socket.recv()).await {
        Ok(Some(Ok(Message::Text(t)))) => serde_json::from_str::<ClientMsg>(&t).ok(),
        _ => None,
    };
    let Some(ClientMsg::Hello { code, resume, host }) = hello else {
        send_json(
            &mut socket,
            &ServerMsg::Error {
                code: "hello_first",
            },
        )
        .await;
        return;
    };
    let code = code.trim().to_uppercase();
    let Some(entry) = rooms.find(&code) else {
        send_json(
            &mut socket,
            &ServerMsg::Error {
                code: "room_not_found",
            },
        )
        .await;
        return;
    };
    drop(rooms);
    let (out, mut inbox) = mpsc::channel(OUTBOX);
    let (reply, joined) = oneshot::channel();
    let join = Cmd::Join {
        watch: entry.watch,
        resume,
        host,
        out,
        reply,
    };
    if entry.tx.send(join).await.is_err() {
        send_json(
            &mut socket,
            &ServerMsg::Error {
                code: "room_not_found",
            },
        )
        .await;
        return;
    }
    let conn = match joined.await {
        Ok(Ok(conn)) => conn,
        Ok(Err(code)) => {
            send_json(&mut socket, &ServerMsg::Error { code }).await;
            return;
        }
        Err(_) => return,
    };
    let mut window = Instant::now();
    let mut count = 0u32;
    loop {
        tokio::select! {
            msg = inbox.recv() => match msg {
                Some(msg) => {
                    if !send_json(&mut socket, &msg).await {
                        break;
                    }
                }
                None => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if window.elapsed() >= Duration::from_secs(1) {
                        window = Instant::now();
                        count = 0;
                    }
                    count += 1;
                    if count > MAX_PER_SECOND {
                        if count == MAX_PER_SECOND + 1 {
                            send_json(&mut socket, &ServerMsg::Error { code: "rate_limited" }).await;
                        }
                        continue;
                    }
                    match serde_json::from_str::<ClientMsg>(&text) {
                        Ok(msg) => {
                            if entry.tx.send(Cmd::Msg { conn, msg }).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => {
                            send_json(&mut socket, &ServerMsg::Error { code: "bad_message" }).await;
                        }
                    }
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                Some(Ok(_)) => {}
            },
        }
    }
    let _ = entry.tx.send(Cmd::Leave { conn }).await;
}

#[cfg(test)]
mod tests;
