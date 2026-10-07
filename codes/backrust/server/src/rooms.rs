//! Class Match rooms: play and watch codes, one
//! task per room that runs the core's `ClassMatch` on the server's clock, the
//! WebSocket at `/api/ws`, and the public demo room of bots.
//!
//! Rooms live in memory. Answers are written to the database at the end of
//! every wave and of the match, keyed by their event id, so writing again
//! after a failure never counts an answer twice.

use std::collections::{BTreeMap, HashMap};
use std::hash::{BuildHasher, Hasher};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Json;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use foldlings_core::class_match::{
    ClassConfig, ClassError, ClassEvent, ClassMatch, Classmate, MAX_SEATS, SeatAnswerEvent,
};
use foldlings_core::fairness::FairnessParams;
use foldlings_core::protocol::{ClientMsg, LobbyView, RoomKind, ServerMsg, TurnView};
use foldlings_core::race::Phase;
use foldlings_core::session::SessionError;
use foldlings_core::setup::RoomSetup;
use foldlings_core::template::{I18n, ItemTemplate};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, oneshot};
use tokio::time::Instant;

use crate::State;
use crate::classes::GROUP_SIZE;
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
/// From START (or everyone READY) to the first wave, so every desk is there.
const COUNTDOWN_MS: f64 = 10_000.0;
/// A duel waits this long for a rival before a robot takes the empty seat.
const DUEL_WAIT_MS: f64 = 20_000.0;
/// Two rivals are in: the duel starts this much later.
const DUEL_COUNTDOWN_MS: f64 = 5_000.0;
/// The rooms an adult sees in their history.
const HISTORY: i64 = 30;
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

/// "Blue Crane 07" from a random number.
pub(crate) fn pseudonym(n: u64) -> String {
    format!(
        "{} {} {:02}",
        COLOURS[(n % 8) as usize],
        ANIMALS[((n / 8) % 8) as usize],
        1 + (n / 64) % 99
    )
}

/// A random number from the OS-seeded hasher keys (no extra dependency).
pub(crate) fn random_u64() -> u64 {
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u64(0x006e_756d_6572_6961);
    h.finish()
}

pub(crate) fn random_hex() -> String {
    format!("{:016x}{:016x}", random_u64(), random_u64())
}

pub(crate) fn random_code() -> String {
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
    /// Each skill's title by its code, for the teacher's report.
    pub skills: HashMap<String, I18n>,
    /// Each kind of mistake's title and a sentence for the teacher, by its code.
    pub misconceptions: HashMap<String, Misconception>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Misconception {
    pub title: I18n,
    pub note: I18n,
}

#[derive(Deserialize)]
struct MisconceptionFile {
    misconceptions: Vec<MisconceptionEntry>,
}

#[derive(Deserialize)]
struct MisconceptionEntry {
    code: String,
    #[serde(flatten)]
    words: Misconception,
}

#[derive(Deserialize)]
struct SkillFile {
    skills: Vec<SkillTitle>,
}

#[derive(Deserialize)]
struct SkillTitle {
    code: String,
    title: I18n,
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
        // The titles only label the report: without the file it shows the codes.
        let skills = match std::fs::read_to_string(dir.join("skills.json")) {
            Ok(text) => serde_json::from_str::<SkillFile>(&text)
                .map_err(|e| format!("skills.json: {e}"))?
                .skills
                .into_iter()
                .map(|s| (s.code, s.title))
                .collect(),
            Err(_) => HashMap::new(),
        };
        // Likewise: without the file a mistake shows as its code.
        let misconceptions = match std::fs::read_to_string(dir.join("misconceptions.json")) {
            Ok(text) => serde_json::from_str::<MisconceptionFile>(&text)
                .map_err(|e| format!("misconceptions.json: {e}"))?
                .misconceptions
                .into_iter()
                .map(|m| (m.code, m.words))
                .collect(),
            Err(_) => HashMap::new(),
        };
        Ok(Content {
            templates,
            version,
            skills,
            misconceptions,
        })
    }
}

#[derive(Clone)]
struct Entry {
    tx: mpsc::Sender<Cmd>,
    watch: bool,
    /// On the play code of a room an adult opened: theirs to find again.
    hosted: Option<Arc<Hosted>>,
}

/// An open room as `GET /api/rooms` lists it.
pub struct HostedRoom {
    pub opened: Opened,
    pub seats: usize,
    pub kind: RoomKind,
    pub class: Option<RoomClass>,
    pub setup: RoomSetup,
}

/// A room as its creator sees it, kept while the room is open.
struct Hosted {
    by: i64,
    opened: Opened,
    seats: usize,
    kind: RoomKind,
    class: Option<RoomClass>,
    setup: RoomSetup,
    at: Instant,
}

/// The teacher's class a room is opened for: only its seats sit down.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoomClass {
    pub id: String,
    pub label: String,
    pub grade: i16,
    /// Each seat's number and race group (0 is A).
    pub seats: Vec<(i16, u8)>,
}

/// A class seat signed in on a device that joins a room.
#[derive(Debug, Clone)]
pub(crate) struct Seated {
    pub(crate) seat_id: i64,
    pub(crate) pseudonym: String,
    pub(crate) class_id: String,
    /// The seat's race group, in a room for its class.
    pub(crate) group: u8,
}

/// Every open room by its codes.
pub struct Rooms {
    content: Content,
    db: Option<sqlx::PgPool>,
    codes: Mutex<HashMap<String, Entry>>,
    /// The play code of the duel waiting for a rival, by grade.
    waiting: Mutex<HashMap<i16, String>>,
    /// One student at a time is matched, so two never open two duels at once.
    matching: tokio::sync::Mutex<()>,
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
            waiting: Mutex::new(HashMap::new()),
            matching: tokio::sync::Mutex::new(()),
        })
    }

    pub fn content(&self) -> &Content {
        &self.content
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

    /// The rooms `user` opened that are still open, the newest first.
    pub fn hosted_by(&self, user: i64) -> Vec<HostedRoom> {
        let map = self.codes.lock().expect("codes");
        let mut mine: Vec<&Arc<Hosted>> = map
            .values()
            .filter_map(|e| e.hosted.as_ref())
            .filter(|h| h.by == user)
            .collect();
        mine.sort_by_key(|h| std::cmp::Reverse(h.at));
        mine.iter()
            .map(|h| HostedRoom {
                opened: h.opened.clone(),
                seats: h.seats,
                kind: h.kind,
                class: h.class.clone(),
                setup: h.setup.clone(),
            })
            .collect()
    }

    /// The play code of the newest room still open for class `class_id`.
    pub fn class_room(&self, class_id: &str) -> Option<String> {
        let map = self.codes.lock().expect("codes");
        map.values()
            .filter_map(|e| e.hosted.as_ref())
            .filter(|h| h.class.as_ref().is_some_and(|c| c.id == class_id))
            .max_by_key(|h| h.at)
            .map(|h| h.opened.play_code.clone())
    }

    /// Closes room `id` for the adult who opened it: its codes go at once, so
    /// nobody joins again, and everyone in it is told. False if it is not theirs.
    pub async fn close(&self, id: &str, user: i64) -> bool {
        let tx = {
            let mut map = self.codes.lock().expect("codes");
            let Some(h) = map
                .values()
                .filter_map(|e| e.hosted.clone())
                .find(|h| h.by == user && h.opened.id == id)
            else {
                return false;
            };
            map.remove(&h.opened.watch_code);
            map.remove(&h.opened.play_code).map(|e| e.tx)
        };
        if let Some(tx) = tx {
            let _ = tx.send(Cmd::Close).await;
        }
        true
    }

    /// Closes every room still open for class `class_id`, as when it is deleted.
    pub async fn close_class(&self, class_id: &str) {
        let txs: Vec<mpsc::Sender<Cmd>> = {
            let mut map = self.codes.lock().expect("codes");
            let gone: Vec<Arc<Hosted>> = map
                .values()
                .filter_map(|e| e.hosted.clone())
                .filter(|h| h.class.as_ref().is_some_and(|c| c.id == class_id))
                .collect();
            gone.iter()
                .filter_map(|h| {
                    map.remove(&h.opened.watch_code);
                    map.remove(&h.opened.play_code).map(|e| e.tx)
                })
                .collect()
        };
        for tx in txs {
            let _ = tx.send(Cmd::Close).await;
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
                hosted: None,
            },
        );
        map.insert(
            watch.clone(),
            Entry {
                tx: tx.clone(),
                watch: true,
                hosted: None,
            },
        );
        (play, watch)
    }

    /// Opens a room of `seats` seats; empty seats are filled by bots when it starts.
    pub async fn open(
        self: &Arc<Self>,
        seats: usize,
        created_by: Option<i64>,
        kind: RoomKind,
    ) -> Result<Opened, sqlx::Error> {
        self.open_for(seats, created_by, kind, None, RoomSetup::default())
            .await
    }

    /// The same, for one class of the teacher: its seats only, at its grade.
    pub async fn open_for(
        self: &Arc<Self>,
        seats: usize,
        created_by: Option<i64>,
        kind: RoomKind,
        class: Option<RoomClass>,
        setup: RoomSetup,
    ) -> Result<Opened, sqlx::Error> {
        self.open_room(seats, created_by, kind, class, None, setup)
            .await
    }

    /// FIND A RIVAL for a student of `grade`: the play code of the duel that
    /// waits for one at that grade, or of a new one.
    pub async fn find_rival(self: &Arc<Self>, grade: i16) -> Result<String, sqlx::Error> {
        let _one = self.matching.lock().await;
        let waiting = self.waiting.lock().expect("waiting").get(&grade).cloned();
        if let Some(code) = waiting
            && self.find(&code).is_some()
        {
            return Ok(code);
        }
        let opened = self
            .open_room(
                2,
                None,
                RoomKind::Duel,
                None,
                Some(grade),
                RoomSetup::default(),
            )
            .await?;
        self.waiting
            .lock()
            .expect("waiting")
            .insert(grade, opened.play_code.clone());
        Ok(opened.play_code)
    }

    async fn open_room(
        self: &Arc<Self>,
        seats: usize,
        created_by: Option<i64>,
        kind: RoomKind,
        class: Option<RoomClass>,
        duel: Option<i16>,
        setup: RoomSetup,
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
                "INSERT INTO rooms (id, play_code, watch_code, seats, created_by, kind, class_id, setup)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(&opened.id)
            .bind(&opened.play_code)
            .bind(&opened.watch_code)
            .bind(seats as i16)
            .bind(created_by)
            .bind(kind.as_str())
            .bind(class.as_ref().map(|c| c.id.clone()))
            .bind(json!(setup))
            .execute(db)
            .await;
            if let Err(e) = stored {
                self.forget(&[&opened.play_code, &opened.watch_code]);
                return Err(e);
            }
        }
        if let Some(by) = created_by
            && let Some(e) = self.codes.lock().expect("codes").get_mut(&opened.play_code)
        {
            e.hosted = Some(Arc::new(Hosted {
                by,
                opened: opened.clone(),
                seats,
                kind,
                class: class.clone(),
                setup: setup.clone(),
                at: Instant::now(),
            }));
        }
        let mut room = Room::new(
            self.clone(),
            opened.id.clone(),
            Some(opened.play_code.clone()),
            opened.watch_code.clone(),
            Some(opened.host_token.clone()),
            seats,
        );
        room.kind = kind;
        room.class = class;
        room.duel = duel;
        room.setup = setup;
        room.turn = room.groups().keys().next().copied().unwrap_or(0);
        tokio::spawn(room.run(rx));
        Ok(opened)
    }

    /// The public demo: bots racing on a loop, watched with `DEMO_CODE`.
    pub fn open_demo(self: &Arc<Self>) {
        let (tx, rx) = mpsc::channel(256);
        self.codes.lock().expect("codes").insert(
            DEMO_CODE.into(),
            Entry {
                tx,
                watch: true,
                hosted: None,
            },
        );
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
        /// A class seat signed in on this device.
        student: Option<Seated>,
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
    /// Its host closed it: everyone out, and the room ends.
    Close,
}

struct Slot {
    name: String,
    token: String,
    /// The class seat racing here, when a signed-in student took it.
    seat_id: Option<i64>,
    conn: Option<u64>,
    ready: bool,
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
    kind: RoomKind,
    /// Opened for a class: only its seats sit down.
    class: Option<RoomClass>,
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
    /// Closed by its host; the room ends after this command.
    shut: bool,
    /// The countdown is on: the match starts at this time.
    starts_at: Option<f64>,
    /// In a room for a class: the race group whose seats sit down (0 is A).
    turn: u8,
    /// A duel (FIND A RIVAL) at this grade.
    duel: Option<i16>,
    /// A duel's first student is in: a robot takes the empty seat at this time.
    rival_by: Option<f64>,
    setup: RoomSetup,
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
            kind: RoomKind::Class,
            class: None,
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
            shut: false,
            starts_at: None,
            turn: 0,
            duel: None,
            rival_by: None,
            setup: RoomSetup::default(),
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
                    Some(cmd) => {
                        self.handle(cmd).await;
                        if self.shut {
                            break;
                        }
                    }
                    None => break,
                },
                _ = every.tick() => {
                    let now = self.now();
                    self.settle();
                    if self.game.is_none() && self.starts_at.is_some_and(|t| now >= t) {
                        self.starts_at = None;
                        self.start_match(now).await;
                    }
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
        self.unlist();
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
            kind: self.kind,
            ready: self.slots.iter().map(|s| s.ready).collect(),
            starts_at_ms: self.starts_at,
            turn: self.turn_view(),
            rival_by_ms: self.rival_by.filter(|_| self.starts_at.is_none()),
            setup: self.setup.clone(),
        })
    }

    /// A duel that starts takes no one else: FIND A RIVAL opens a new one.
    fn unlist(&self) {
        let (Some(grade), Some(code)) = (self.duel, &self.play_code) else {
            return;
        };
        let mut waiting = self.rooms.waiting.lock().expect("waiting");
        if waiting.get(&grade) == Some(code) {
            waiting.remove(&grade);
        }
    }

    /// A duel starts when its two rivals are in, or when the first one has
    /// waited long enough: then a robot races them.
    fn settle_duel(&mut self) {
        if self.game.is_some() || self.starts_at.is_some() {
            return;
        }
        let now = self.now();
        let here = self.slots.iter().filter(|s| s.conn.is_some()).count();
        let before = self.rival_by;
        if here == 0 {
            self.rival_by = None;
        } else {
            let by = *self.rival_by.get_or_insert(now + DUEL_WAIT_MS);
            if here >= self.seats || now >= by {
                self.starts_at = Some(now + DUEL_COUNTDOWN_MS);
                self.unlist();
            }
        }
        if before != self.rival_by || self.starts_at.is_some() {
            let lobby = self.lobby();
            self.broadcast(&lobby);
        }
    }

    /// In a duel's lobby a student who leaves gives the seat up, so a rival
    /// never races an empty desk.
    fn leave_duel(&mut self, seat: usize) {
        if self.duel.is_none()
            || self.game.is_some()
            || self.starts_at.is_some()
            || self.slots[seat].conn.is_some()
        {
            return;
        }
        self.slots.remove(seat);
        for c in self.conns.values_mut() {
            if let Some(s) = c.seat
                && s > seat
            {
                c.seat = Some(s - 1);
            }
        }
        let lobby = self.lobby();
        self.broadcast(&lobby);
        self.settle();
    }

    /// The class's seat numbers by race group.
    fn groups(&self) -> BTreeMap<u8, Vec<i16>> {
        let mut groups: BTreeMap<u8, Vec<i16>> = BTreeMap::new();
        for &(number, group) in self.class.iter().flat_map(|c| &c.seats) {
            groups.entry(group).or_default().push(number);
        }
        groups
    }

    fn turn_view(&self) -> Option<TurnView> {
        self.class.as_ref()?;
        let mut groups = self.groups();
        let keys: Vec<u8> = groups.keys().copied().collect();
        let next = keys
            .iter()
            .copied()
            .find(|&g| g > self.turn)
            .or(keys.first().copied())
            .filter(|&g| g != self.turn);
        Some(TurnView {
            group: self.turn,
            seats: groups.remove(&self.turn).unwrap_or_default(),
            next,
            groups: keys,
        })
    }

    /// The class's groups as the teacher left them on the class page.
    async fn refresh_groups(&mut self) {
        let (Some(db), Some(class)) = (&self.rooms.db, &mut self.class) else {
            return;
        };
        match crate::classes::seat_groups(db, &class.id).await {
            Ok(seats) => class.seats = seats,
            Err(e) => tracing::warn!("room {}: groups: {e}", self.id),
        }
    }

    /// The class screen calls group `group`: the last group's seats leave
    /// (each told `turn_over`), and the next match seats only the new group.
    fn call_group(&mut self, group: u8) {
        self.turn = group;
        self.game = None;
        self.match_id = None;
        self.done_at = None;
        let seated: Vec<u64> = self
            .conns
            .iter()
            .filter(|(_, c)| c.seat.is_some())
            .map(|(&id, _)| id)
            .collect();
        for id in seated {
            if let Some(c) = self.conns.get_mut(&id) {
                c.seat = None;
            }
            self.send(id, ServerMsg::Error { code: "turn_over" });
            self.drop_conn(id);
        }
        self.slots.clear();
        let lobby = self.lobby();
        self.broadcast(&lobby);
    }

    /// In an open room the countdown runs while every classmate here is
    /// ready: one more coming in stops it until they are ready too.
    fn settle(&mut self) {
        if self.duel.is_some() {
            self.settle_duel();
            return;
        }
        if self.kind != RoomKind::Open || self.game.is_some() || self.demo {
            return;
        }
        let mut here = self.slots.iter().filter(|s| s.conn.is_some()).peekable();
        let all = here.peek().is_some() && here.all(|s| s.ready);
        let changed = match (all, self.starts_at) {
            (true, None) => {
                self.starts_at = Some(self.now() + COUNTDOWN_MS);
                true
            }
            (false, Some(_)) => {
                self.starts_at = None;
                true
            }
            _ => false,
        };
        if changed {
            let lobby = self.lobby();
            self.broadcast(&lobby);
        }
    }

    fn state_msg(&self) -> ServerMsg {
        match &self.game {
            Some(m) => ServerMsg::View(m.view()),
            None => self.lobby(),
        }
    }

    /// Why a newcomer may not sit in a room opened for a class: a guest, a
    /// seat of another class, or of a group whose turn it is not. None in a
    /// room open to anyone.
    fn class_gate(&self, student: Option<&Seated>) -> Option<&'static str> {
        if self.duel.is_some() {
            return student.is_none().then_some("students_only");
        }
        let class = self.class.as_ref()?;
        match student {
            None => Some("class_only"),
            Some(s) if s.class_id != class.id => Some("wrong_class"),
            Some(s) if s.group != self.turn => Some("not_your_turn"),
            Some(_) => None,
        }
    }

    fn pseudonym(&self) -> String {
        loop {
            let name = pseudonym(random_u64());
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
                student,
                out,
                reply,
            } => {
                let conn = self.next_conn;
                // A class seat already in the room (another tab, a reload)
                // takes its own place back, like a resume token.
                let seat = if watch {
                    None
                } else if let Some(s) = resume
                    .as_ref()
                    .and_then(|t| self.slots.iter().position(|s| &s.token == t))
                    .or_else(|| {
                        let id = student.as_ref()?.seat_id;
                        self.slots.iter().position(|s| s.seat_id == Some(id))
                    })
                {
                    if let Some(old) = self.slots[s].conn {
                        self.drop_conn(old);
                    }
                    Some(s)
                } else if let Some(code) = self.class_gate(student.as_ref()) {
                    let _ = reply.send(Err(code));
                    return;
                } else if self.game.is_some() {
                    let _ = reply.send(Err("match_started"));
                    return;
                } else if self.slots.len() >= self.seats {
                    let _ = reply.send(Err("room_full"));
                    return;
                } else {
                    // A signed-in student races under their seat's pseudonym,
                    // unless a seat from another class has it in this room.
                    let (seat_id, name) = match student {
                        Some(s) if self.slots.iter().all(|o| o.name != s.pseudonym) => {
                            (Some(s.seat_id), s.pseudonym)
                        }
                        other => (other.map(|s| s.seat_id), self.pseudonym()),
                    };
                    self.slots.push(Slot {
                        name,
                        seat_id,
                        token: random_hex(),
                        conn: None,
                        ready: false,
                    });
                    Some(self.slots.len() - 1)
                };
                if reply.send(Ok(conn)).is_err() {
                    return;
                }
                self.next_conn += 1;
                let is_host = host.is_some() && host == self.host_token;
                if is_host {
                    self.refresh_groups().await;
                }
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
                    self.settle();
                }
            }
            Cmd::Leave { conn } => {
                let seat = self.conns.get(&conn).and_then(|c| c.seat);
                self.drop_conn(conn);
                if let Some(s) = seat {
                    self.leave_duel(s);
                }
            }
            Cmd::Close => {
                // What was answered is kept; the match does not go on.
                if self.game.is_some() && self.done_at.is_none() {
                    self.flush(false).await;
                } else if self.commit_retry.is_some() {
                    self.flush(true).await;
                }
                self.broadcast(&ServerMsg::Error {
                    code: "room_closed",
                });
                self.shut = true;
            }
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
                if self.demo || self.kind != RoomKind::Class || !host {
                    self.send(conn, error("not_host"));
                } else if self.game.is_some() {
                    self.send(conn, error("match_started"));
                } else if self.starts_at.is_some() {
                    self.send(conn, error("starting"));
                } else if self.slots.is_empty() {
                    self.send(conn, error("no_players"));
                } else {
                    // Classmates still coming in may sit down during the countdown.
                    self.starts_at = Some(now + COUNTDOWN_MS);
                    let lobby = self.lobby();
                    self.broadcast(&lobby);
                }
            }
            ClientMsg::Turn { group } => {
                if self.demo || !host {
                    self.send(conn, error("not_host"));
                } else if self.class.is_none() {
                    self.send(conn, error("no_class"));
                } else if self.game.as_ref().is_some_and(|m| m.phase() != Phase::Done) {
                    self.send(conn, error("match_started"));
                } else if self.starts_at.is_some() {
                    self.send(conn, error("starting"));
                } else {
                    self.refresh_groups().await;
                    // The last match is stored before its seats go.
                    if self.commit_retry.is_some() {
                        self.flush(true).await;
                    }
                    if self.commit_retry.is_some() {
                        self.send(conn, error("saving"));
                    } else if !self.groups().contains_key(&group) {
                        self.send(conn, error("no_group"));
                    } else {
                        self.call_group(group);
                    }
                }
            }
            ClientMsg::Ready => {
                if self.kind != RoomKind::Open {
                    self.send(conn, error("not_open"));
                } else if self.game.is_some() {
                    self.send(conn, error("match_started"));
                } else if let Some(s) = seat {
                    if !self.slots[s].ready {
                        self.slots[s].ready = true;
                        let lobby = self.lobby();
                        self.broadcast(&lobby);
                        self.settle();
                    }
                } else {
                    self.send(conn, error("no_seat"));
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
            ClientMsg::Next
            | ClientMsg::AnswerBalloon { .. }
            | ClientMsg::AnswerOrb { .. }
            | ClientMsg::AnswerSort { .. }
            | ClientMsg::AnswerBalance { .. }
            | ClientMsg::AnswerBridge { .. } => {
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
                    ClientMsg::AnswerSort { offer_id, gate } => m
                        .answer_sort(s, offer_id, gate, now)
                        .map(ServerMsg::Verdict)
                        .map_err(|e| error_code(&e)),
                    ClientMsg::AnswerBalance { offer_id, index } => m
                        .answer_balance(s, offer_id, index, now)
                        .map(ServerMsg::Verdict)
                        .map_err(|e| error_code(&e)),
                    ClientMsg::AnswerBridge { offer_id, planks } => m
                        .answer_bridge(s, offer_id, &planks, now)
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
                // A class's room plays at the class's grade, a duel at its own.
                grade: self
                    .class
                    .as_ref()
                    .map(|c| c.grade)
                    .or(self.duel)
                    .and_then(|g| u8::try_from(g).ok()),
            })
            .collect();
        let mut cfg = ClassConfig::new(
            self.seed,
            classmates,
            self.seats.max(self.slots.len()),
            self.rooms.content.version.clone(),
        );
        cfg.waves = self.setup.waves();
        let mut m = match ClassMatch::new(
            self.rooms.content.templates.clone(),
            cfg,
            self.setup.params(FairnessParams::default()),
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
            "INSERT INTO matches (id, room_id, seed, content_pack_version, fairness_params_version, seats, race_group)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
        )
        .bind(id)
        .bind(&self.id)
        .bind(self.seed as i64)
        .bind(&self.rooms.content.version)
        .bind(self.setup.params(FairnessParams::default()).version)
        .bind(Value::Array(seats))
        .bind(self.class.as_ref().map(|_| self.turn as i16))
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
            // Each class seat keeps its own result, for the teacher's class page.
            let players = self
                .game
                .as_ref()
                .map(|m| m.recap().players)
                .unwrap_or_default();
            // Official only in a room opened for a class, which seats no one else.
            let official = self.class.is_some();
            for (i, (slot, p)) in self.slots.iter().zip(players).enumerate() {
                let Some(seat_id) = slot.seat_id else {
                    continue;
                };
                let r = sqlx::query(
                    "INSERT INTO match_seat_results (match_id, seat, class_seat_id, official, points, folded, place, stars)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (match_id, seat) DO NOTHING",
                )
                .bind(&id)
                .bind(i as i16)
                .bind(seat_id)
                .bind(official)
                .bind(p.points as i32)
                .bind(p.folded as i32)
                .bind(p.place as i16)
                .bind(p.stars as i16)
                .execute(&mut *tx)
                .await;
                if let Err(e) = r {
                    tracing::error!("room {}: flush: {e}", self.id);
                    return;
                }
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
    #[serde(default)]
    kind: RoomKind,
    /// One of the teacher's classes: the room takes only its seats.
    #[serde(default)]
    class_id: Option<String>,
    /// Games, rounds and level; the usual race when left out.
    #[serde(default)]
    setup: RoomSetup,
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
    if let Some(code) = body.setup.problem() {
        return Err(ApiError(StatusCode::BAD_REQUEST, code));
    }
    // A class's room always has a group's six desks.
    let seats = if body.class_id.is_some() {
        GROUP_SIZE as usize
    } else {
        body.seats
    };
    let class = match (&body.class_id, &user) {
        (None, _) => None,
        (Some(_), None) => return Err(ApiError(StatusCode::UNAUTHORIZED, "signed_out")),
        (Some(id), Some(u)) => {
            let row: Option<(String, i16)> = sqlx::query_as(
                "SELECT label, grade FROM classes WHERE id = $1 AND owner = $2 AND status = 'active'",
            )
            .bind(id)
            .bind(u.id)
            .fetch_optional(&state.db)
            .await?;
            let (label, grade) = row.ok_or(ApiError(StatusCode::NOT_FOUND, "class_not_found"))?;
            Some(RoomClass {
                id: id.clone(),
                label,
                grade,
                seats: crate::classes::seat_groups(&state.db, id).await?,
            })
        }
    };
    let label = class.as_ref().map(|c| c.label.clone());
    let opened = state
        .rooms
        .open_for(
            seats,
            user.map(|u| u.id),
            body.kind,
            class,
            body.setup.clone(),
        )
        .await?;
    tracing::info!("room {} opened", opened.id);
    Ok(Json(json!({
        "id": opened.id,
        "play_code": opened.play_code,
        "watch_code": opened.watch_code,
        "host_token": opened.host_token,
        "seats": seats,
        "class_label": label,
        "setup": body.setup,
    })))
}

/// `GET /api/rooms`: the rooms the signed-in adult opened that are still
/// open, the newest first, so a reloaded page finds its room again.
pub async fn mine(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    let rooms: Vec<Value> = state
        .rooms
        .hosted_by(user.id)
        .into_iter()
        .map(|h| {
            json!({
                "id": h.opened.id,
                "play_code": h.opened.play_code,
                "watch_code": h.opened.watch_code,
                "host_token": h.opened.host_token,
                "seats": h.seats,
                "kind": h.kind,
                "class_label": h.class.map(|c| c.label),
                "setup": h.setup,
            })
        })
        .collect();
    Ok(Json(json!({ "rooms": rooms })))
}

/// `GET /api/rooms/history`: the rooms the signed-in adult opened, the newest
/// first (open or closed), each with its matches: when, and every seat's
/// pseudonym, points, place and stars.
pub async fn history(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    let Some(db) = &state.rooms.db else {
        return Ok(Json(json!({ "rooms": [] })));
    };
    let open: Vec<String> = state
        .rooms
        .hosted_by(user.id)
        .into_iter()
        .map(|h| h.opened.id)
        .collect();
    let rows: Vec<(Value,)> = sqlx::query_as(
        "SELECT json_build_object(
            'id', r.id,
            'play_code', r.play_code,
            'kind', r.kind,
            'seats', r.seats,
            'created_at', r.created_at,
            'class_label', (SELECT c.label FROM classes c WHERE c.id = r.class_id),
            'setup', r.setup,
            'matches', COALESCE((
                SELECT json_agg(json_build_object(
                    'started_at', m.started_at,
                    'ended_at', m.ended_at,
                    'seats', m.seats,
                    'race_group', m.race_group,
                    'players', m.recap->'players'
                ) ORDER BY m.started_at)
                FROM matches m WHERE m.room_id = r.id
            ), '[]'::json)
        )
        FROM rooms r WHERE r.created_by = $1
        ORDER BY r.created_at DESC LIMIT $2",
    )
    .bind(user.id)
    .bind(HISTORY)
    .fetch_all(db)
    .await
    .map_err(|e| {
        tracing::error!("room history: {e}");
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, "internal")
    })?;
    let rooms: Vec<Value> = rows
        .into_iter()
        .map(|(mut r,)| {
            let id = r["id"].as_str().unwrap_or_default().to_owned();
            r["open"] = Value::Bool(open.contains(&id));
            r
        })
        .collect();
    Ok(Json(json!({ "rooms": rooms })))
}

/// `DELETE /api/rooms/{id}`: the adult who opened the room closes it.
pub async fn close(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    if !state.rooms.close(&id, user.id).await {
        return Err(ApiError(StatusCode::NOT_FOUND, "room_not_found"));
    }
    tracing::info!("room {id} closed by its host");
    Ok(Json(json!({ "closed": id })))
}

/// `GET /api/ws`: one headset or screen in one room.
pub async fn ws(Extract(state): Extract<State>, upgrade: WebSocketUpgrade) -> Response {
    let rooms = state.rooms.clone();
    let db = state.db.clone();
    upgrade
        .max_message_size(4096)
        .on_upgrade(move |socket| connection(rooms, db, socket))
}

async fn send_json(socket: &mut WebSocket, msg: &ServerMsg) -> bool {
    match serde_json::to_string(msg) {
        Ok(text) => socket.send(Message::Text(text.into())).await.is_ok(),
        Err(_) => false,
    }
}

async fn connection(rooms: Arc<Rooms>, db: sqlx::PgPool, mut socket: WebSocket) {
    let hello = match tokio::time::timeout(HELLO_WITHIN, socket.recv()).await {
        Ok(Some(Ok(Message::Text(t)))) => serde_json::from_str::<ClientMsg>(&t).ok(),
        _ => None,
    };
    let Some(ClientMsg::Hello {
        code,
        resume,
        host,
        student,
    }) = hello
    else {
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
    // A token that has run out or was signed out races as a guest.
    let student = match student {
        Some(token) => match crate::classes::student(&db, &token).await {
            Ok(s) => s.map(|s| Seated {
                seat_id: s.seat_id,
                pseudonym: s.pseudonym,
                class_id: s.class_id,
                group: s.race_group,
            }),
            Err(e) => {
                tracing::warn!("student lookup failed: {e}");
                None
            }
        },
        None => None,
    };
    let (out, mut inbox) = mpsc::channel(OUTBOX);
    let (reply, joined) = oneshot::channel();
    let join = Cmd::Join {
        watch: entry.watch,
        resume,
        host,
        student,
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
