//! MY CLASSES: a teacher's standing classes, each with numbered seats that
//! keep one pseudonym all year, and a student's sign-in to a seat with the
//! class code, the seat number and a picture password (three of nine
//! pictures, in order). Real names never reach the server: the teacher writes
//! them on the printed card, or keeps them in their own browser.
//!
//! A picture password has only 729 values, so it holds because of the locks,
//! not the hash: five wrong pictures lock a seat for five minutes, ten
//! without a right one lock it until the teacher opens it, and thirty wrong
//! in one class within ten minutes pause that class's sign-in.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Path, State as Extract};
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, PgPool};

use crate::State;
use crate::organizer::{ApiError, bearer, signed_in};
use crate::rooms::{pseudonym, random_code, random_hex, random_u64};

/// Seats in one class.
const MAX_SEATS: i16 = 40;
/// Seats in a pending organizer's one trial class.
const TRIAL_SEATS: i16 = 5;
/// Active classes per teacher.
const MAX_CLASSES: i64 = 30;
/// A picture password: three of the nine pictures, in order.
type Picture = [u8; 3];
const PICTURES: u8 = 9;
/// Wrong pictures before a seat locks for `LOCK_MINUTES`.
const TRIES: i16 = 5;
const LOCK_MINUTES: i32 = 5;
/// Wrong pictures without a right one before only the teacher opens the seat.
const TEACHER_AFTER: i16 = 10;
/// How long a signed-in device stays signed in.
const SESSION_DAYS: i32 = 30;
/// Wrong pictures in one class within `CLASS_WINDOW` that pause its sign-in.
const CLASS_WRONG: usize = 30;
const CLASS_WINDOW: Duration = Duration::from_secs(600);
/// A room for a class has this many desks, so its seats race in groups of
/// this many by number (01 to 06 group A), unless the teacher moves a seat.
pub(crate) const GROUP_SIZE: i16 = 6;
/// Groups A to H.
pub(crate) const MAX_GROUPS: i16 = 8;

/// The group seat `number` races in (0 is A): the teacher's choice, or by number.
pub(crate) fn race_group(number: i16, chosen: Option<i16>) -> u8 {
    chosen
        .unwrap_or((number - 1) / GROUP_SIZE)
        .clamp(0, MAX_GROUPS - 1) as u8
}

fn err(status: StatusCode, why: &'static str) -> ApiError {
    ApiError(status, why)
}

/// Wrong pictures per class, kept in memory: a restart forgets them, while
/// the seat locks in the database stay.
#[derive(Default)]
pub struct Guard(Mutex<HashMap<String, VecDeque<Instant>>>);

impl Guard {
    fn paused(&self, class: &str, now: Instant) -> bool {
        let mut map = self.0.lock().unwrap();
        let Some(q) = map.get_mut(class) else {
            return false;
        };
        while q
            .front()
            .is_some_and(|t| now.duration_since(*t) > CLASS_WINDOW)
        {
            q.pop_front();
        }
        if q.is_empty() {
            map.remove(class);
            return false;
        }
        q.len() >= CLASS_WRONG
    }

    fn wrong(&self, class: &str, now: Instant) {
        let mut map = self.0.lock().unwrap();
        let q = map.entry(class.to_owned()).or_default();
        q.push_back(now);
        if q.len() > CLASS_WRONG {
            q.pop_front();
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn new_picture() -> Picture {
    let n = random_u64();
    let p = PICTURES as u64;
    [(n % p) as u8, ((n / p) % p) as u8, ((n / p / p) % p) as u8]
}

fn picture_hash(salt: &str, picture: &Picture) -> String {
    let mut h = Sha256::new();
    h.update(salt.as_bytes());
    h.update(b":");
    h.update(picture);
    hex(&h.finalize())
}

pub(crate) fn token_hash(token: &str) -> String {
    hex(&Sha256::digest(token.as_bytes()))
}

/// A seat's counters after one more wrong picture.
#[derive(Debug, PartialEq, Eq)]
struct AfterWrong {
    tries: i16,
    wrong: i16,
    lock: bool,
    teacher: bool,
}

fn after_wrong(tries: i16, wrong: i16) -> AfterWrong {
    let wrong = wrong + 1;
    let tries = tries + 1;
    let teacher = wrong >= TEACHER_AFTER;
    let lock = !teacher && tries >= TRIES;
    AfterWrong {
        tries: if lock { 0 } else { tries },
        wrong,
        lock,
        teacher,
    }
}

/// A name no other seat in the class has.
fn fresh_name(taken: &[String]) -> String {
    loop {
        let name = pseudonym(random_u64());
        if !taken.contains(&name) {
            break name;
        }
    }
}

// ------------------------------------------------------------ teacher side

/// What the signed-in adult may make: approved organizers (and admins) a
/// full set, pending ones a single trial class.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Allowance {
    Trial,
    Full,
}

pub(crate) async fn allowance(db: &PgPool, user: i64, admin: bool) -> Result<Allowance, ApiError> {
    if admin {
        return Ok(Allowance::Full);
    }
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM organizer_approvals WHERE user_id = $1")
            .bind(user)
            .fetch_optional(db)
            .await?;
    match status.as_deref() {
        Some("approved") => Ok(Allowance::Full),
        Some("pending") => Ok(Allowance::Trial),
        Some(_) => Err(err(StatusCode::FORBIDDEN, "suspended")),
        None => Err(err(StatusCode::FORBIDDEN, "not_organizer")),
    }
}

impl Allowance {
    fn seats(self) -> i16 {
        match self {
            Allowance::Trial => TRIAL_SEATS,
            Allowance::Full => MAX_SEATS,
        }
    }

    fn classes(self) -> i64 {
        match self {
            Allowance::Trial => 1,
            Allowance::Full => MAX_CLASSES,
        }
    }
}

#[derive(Deserialize)]
pub struct NewClass {
    label: String,
    grade: i16,
    #[serde(default)]
    school_year: String,
    seats: i16,
}

#[derive(Debug, PartialEq, Eq)]
struct ValidClass {
    label: String,
    grade: i16,
    school_year: String,
    seats: i16,
}

fn validate(c: &NewClass) -> Result<ValidClass, &'static str> {
    let label = c.label.trim();
    if !(1..=30).contains(&label.chars().count()) {
        return Err("label");
    }
    if !(1..=9).contains(&c.grade) {
        return Err("grade");
    }
    let school_year = c.school_year.trim();
    if school_year.chars().count() > 20 {
        return Err("school_year");
    }
    if !(1..=MAX_SEATS).contains(&c.seats) {
        return Err("seats");
    }
    Ok(ValidClass {
        label: label.to_string(),
        grade: c.grade,
        school_year: school_year.to_string(),
        seats: c.seats,
    })
}

async fn audit(
    conn: &mut PgConnection,
    actor: i64,
    action: &str,
    class: &str,
    detail: Value,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO audit_log (actor, action, target, detail) VALUES ($1, $2, $3, $4)")
        .bind(actor)
        .bind(action)
        .bind(format!("class:{class}"))
        .bind(detail)
        .execute(conn)
        .await?;
    Ok(())
}

/// A seat as the teacher gets it once: the picture is never shown again.
fn seat_card(number: i16, name: &str, picture: &Picture) -> Value {
    json!({ "number": number, "pseudonym": name, "picture": picture })
}

/// Adds `count` seats after the class's last one, each with its own name and picture.
async fn add_seats(
    conn: &mut PgConnection,
    class: &str,
    count: i16,
) -> Result<Vec<Value>, sqlx::Error> {
    let (last, mut names): (i16, Vec<String>) = sqlx::query_as(
        "SELECT COALESCE(MAX(number), 0)::SMALLINT, COALESCE(array_agg(pseudonym), '{}')
         FROM class_seats WHERE class_id = $1",
    )
    .bind(class)
    .fetch_one(&mut *conn)
    .await?;
    let mut cards = Vec::new();
    for number in last + 1..=last + count {
        let name = fresh_name(&names);
        let picture = new_picture();
        let salt = random_hex();
        sqlx::query(
            "INSERT INTO class_seats (class_id, number, pseudonym, picture_salt, picture_hash)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(class)
        .bind(number)
        .bind(&name)
        .bind(&salt)
        .bind(picture_hash(&salt, &picture))
        .execute(&mut *conn)
        .await?;
        cards.push(seat_card(number, &name, &picture));
        names.push(name);
    }
    Ok(cards)
}

/// The class, if this adult owns it, locked for the change that follows.
async fn owned(conn: &mut PgConnection, owner: i64, id: &str) -> Result<(), ApiError> {
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM classes WHERE id = $1 AND owner = $2 FOR UPDATE")
            .bind(id)
            .bind(owner)
            .fetch_optional(&mut *conn)
            .await?;
    match status.as_deref() {
        Some("active") => Ok(()),
        Some(_) => Err(err(StatusCode::CONFLICT, "archived")),
        None => Err(err(StatusCode::NOT_FOUND, "class_not_found")),
    }
}

const CLASS_JSON: &str = "json_build_object(
    'id', c.id,
    'label', c.label,
    'grade', c.grade,
    'school_year', c.school_year,
    'join_code', CASE WHEN c.status = 'active' THEN c.join_code END,
    'status', c.status,
    'seats', (SELECT count(*) FROM class_seats s WHERE s.class_id = c.id),
    'created_at', c.created_at
)";

async fn class_json(conn: &mut PgConnection, id: &str) -> Result<Value, sqlx::Error> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {CLASS_JSON} FROM classes c WHERE c.id = $1"
    )))
    .bind(id)
    .fetch_one(conn)
    .await
}

pub(crate) async fn create_class(
    db: &PgPool,
    owner: i64,
    allowance: Allowance,
    body: &NewClass,
) -> Result<Value, ApiError> {
    let v = validate(body).map_err(|why| err(StatusCode::UNPROCESSABLE_ENTITY, why))?;
    if v.seats > allowance.seats() {
        return Err(err(StatusCode::FORBIDDEN, "seats_limit"));
    }
    let mut tx = db.begin().await?;
    // One change at a time per teacher, so two tabs cannot pass the limits together.
    sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
        .bind(owner)
        .execute(&mut *tx)
        .await?;
    let active: i64 =
        sqlx::query_scalar("SELECT count(*) FROM classes WHERE owner = $1 AND status = 'active'")
            .bind(owner)
            .fetch_one(&mut *tx)
            .await?;
    if active >= allowance.classes() {
        return Err(err(StatusCode::FORBIDDEN, "classes_limit"));
    }
    let id = random_hex();
    let mut made = false;
    for _ in 0..5 {
        made = sqlx::query(
            "INSERT INTO classes (id, owner, label, grade, school_year, join_code)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (join_code) WHERE status = 'active' DO NOTHING",
        )
        .bind(&id)
        .bind(owner)
        .bind(&v.label)
        .bind(v.grade)
        .bind(&v.school_year)
        .bind(random_code())
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1;
        if made {
            break;
        }
    }
    if !made {
        return Err(err(StatusCode::INTERNAL_SERVER_ERROR, "internal"));
    }
    let seats = add_seats(&mut tx, &id, v.seats).await?;
    audit(
        &mut tx,
        owner,
        "class.create",
        &id,
        json!({ "seats": v.seats }),
    )
    .await?;
    let class = class_json(&mut tx, &id).await?;
    tx.commit().await?;
    Ok(json!({ "class": class, "seats": seats }))
}

pub(crate) async fn list_classes(db: &PgPool, owner: i64) -> Result<Value, ApiError> {
    let classes: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {CLASS_JSON} FROM classes c WHERE c.owner = $1
         ORDER BY c.status = 'active' DESC, c.created_at DESC"
    )))
    .bind(owner)
    .fetch_all(db)
    .await?;
    Ok(json!({ "classes": classes }))
}

pub(crate) async fn class_detail(db: &PgPool, owner: i64, id: &str) -> Result<Value, ApiError> {
    let class: Option<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {CLASS_JSON} FROM classes c WHERE c.id = $1 AND c.owner = $2"
    )))
    .bind(id)
    .bind(owner)
    .fetch_optional(db)
    .await?;
    let class = class.ok_or(err(StatusCode::NOT_FOUND, "class_not_found"))?;
    let seats: Vec<Value> = sqlx::query_scalar(
        "SELECT json_build_object(
            'number', number,
            'pseudonym', pseudonym,
            'locked', teacher_lock OR COALESCE(locked_until > now(), false),
            'last_seen_at', last_seen_at,
            'group', COALESCE(race_group, LEAST((number - 1) / $2, $3 - 1)),
            'group_chosen', race_group IS NOT NULL,
            'official', (
                SELECT json_build_object('matches', count(*), 'stars', COALESCE(sum(r.stars), 0))
                FROM match_seat_results r WHERE r.class_seat_id = s.id AND r.official
            ),
            'last_official', (
                SELECT json_build_object('at', r.created_at, 'place', r.place, 'points', r.points, 'stars', r.stars)
                FROM match_seat_results r WHERE r.class_seat_id = s.id AND r.official
                ORDER BY r.created_at DESC LIMIT 1
            ),
            'other_rooms', (
                SELECT json_build_object('matches', count(*), 'last_at', max(r.created_at))
                FROM match_seat_results r WHERE r.class_seat_id = s.id AND NOT r.official
            ),
            'own', (
                SELECT json_build_object(
                    'races', count(*) FILTER (WHERE p.kind = 'race'),
                    'practices', count(*) FILTER (WHERE p.kind = 'practice'),
                    'days', count(DISTINCT p.played_at::date),
                    'last_at', max(p.played_at)
                ) FROM seat_plays p WHERE p.class_seat_id = s.id
            )
        ) FROM class_seats s WHERE class_id = $1 ORDER BY number",
    )
    .bind(id)
    .bind(GROUP_SIZE)
    .bind(MAX_GROUPS)
    .fetch_all(db)
    .await?;
    Ok(json!({ "class": class, "seats": seats }))
}

pub(crate) async fn more_seats(
    db: &PgPool,
    owner: i64,
    allowance: Allowance,
    id: &str,
    count: i16,
) -> Result<Value, ApiError> {
    if !(1..=MAX_SEATS).contains(&count) {
        return Err(err(StatusCode::UNPROCESSABLE_ENTITY, "seats"));
    }
    let mut tx = db.begin().await?;
    owned(&mut tx, owner, id).await?;
    let now: i64 = sqlx::query_scalar("SELECT count(*) FROM class_seats WHERE class_id = $1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if now + count as i64 > allowance.seats() as i64 {
        return Err(err(StatusCode::FORBIDDEN, "seats_limit"));
    }
    let seats = add_seats(&mut tx, id, count).await?;
    audit(&mut tx, owner, "class.seats", id, json!({ "added": count })).await?;
    tx.commit().await?;
    Ok(json!({ "seats": seats }))
}

/// What a teacher does to one seat.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SeatChange {
    /// A new picture: the old card stops working, devices sign out.
    Picture,
    /// Opens a locked seat, keeping its picture.
    Unlock,
    /// For a new student: a new name and picture, devices sign out.
    Reset,
}

pub(crate) async fn change_seat(
    db: &PgPool,
    owner: i64,
    id: &str,
    number: i16,
    change: SeatChange,
) -> Result<Value, ApiError> {
    let mut tx = db.begin().await?;
    owned(&mut tx, owner, id).await?;
    let seat: Option<(i64, String)> = sqlx::query_as(
        "SELECT id, pseudonym FROM class_seats WHERE class_id = $1 AND number = $2 FOR UPDATE",
    )
    .bind(id)
    .bind(number)
    .fetch_optional(&mut *tx)
    .await?;
    let (seat, mut name) = seat.ok_or(err(StatusCode::NOT_FOUND, "seat_not_found"))?;
    sqlx::query(
        "UPDATE class_seats SET tries = 0, wrong = 0, locked_until = NULL, teacher_lock = false
         WHERE id = $1",
    )
    .bind(seat)
    .execute(&mut *tx)
    .await?;
    if change == SeatChange::Unlock {
        audit(&mut tx, owner, "seat.unlock", id, json!({ "seat": number })).await?;
        tx.commit().await?;
        return Ok(json!({ "number": number, "pseudonym": name }));
    }
    if change == SeatChange::Reset {
        let others: Vec<String> = sqlx::query_scalar(
            "SELECT pseudonym FROM class_seats WHERE class_id = $1 AND id <> $2",
        )
        .bind(id)
        .bind(seat)
        .fetch_all(&mut *tx)
        .await?;
        name = fresh_name(&others);
        // A new student starts with no results of the last one.
        sqlx::query("DELETE FROM match_seat_results WHERE class_seat_id = $1")
            .bind(seat)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM seat_plays WHERE class_seat_id = $1")
            .bind(seat)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM seat_answers WHERE class_seat_id = $1")
            .bind(seat)
            .execute(&mut *tx)
            .await?;
    }
    let picture = new_picture();
    let salt = random_hex();
    sqlx::query(
        "UPDATE class_seats SET pseudonym = $2, picture_salt = $3, picture_hash = $4,
             last_seen_at = CASE WHEN $5 THEN NULL ELSE last_seen_at END
         WHERE id = $1",
    )
    .bind(seat)
    .bind(&name)
    .bind(&salt)
    .bind(picture_hash(&salt, &picture))
    .bind(change == SeatChange::Reset)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM seat_sessions WHERE seat_id = $1")
        .bind(seat)
        .execute(&mut *tx)
        .await?;
    let action = if change == SeatChange::Reset {
        "seat.reset"
    } else {
        "seat.picture"
    };
    audit(&mut tx, owner, action, id, json!({ "seat": number })).await?;
    tx.commit().await?;
    Ok(seat_card(number, &name, &picture))
}

/// Puts seat `number` in race group `group` (0 is A), or back in the group of
/// its number when None.
pub(crate) async fn set_group(
    db: &PgPool,
    owner: i64,
    id: &str,
    number: i16,
    group: Option<i16>,
) -> Result<Value, ApiError> {
    if group.is_some_and(|g| !(0..MAX_GROUPS).contains(&g)) {
        return Err(err(StatusCode::UNPROCESSABLE_ENTITY, "group"));
    }
    let mut tx = db.begin().await?;
    owned(&mut tx, owner, id).await?;
    let done =
        sqlx::query("UPDATE class_seats SET race_group = $3 WHERE class_id = $1 AND number = $2")
            .bind(id)
            .bind(number)
            .bind(group)
            .execute(&mut *tx)
            .await?;
    if done.rows_affected() == 0 {
        return Err(err(StatusCode::NOT_FOUND, "seat_not_found"));
    }
    audit(
        &mut tx,
        owner,
        "seat.group",
        id,
        json!({ "seat": number, "group": group }),
    )
    .await?;
    tx.commit().await?;
    Ok(
        json!({ "number": number, "group": race_group(number, group), "group_chosen": group.is_some() }),
    )
}

/// Every seat back in the group of its number.
pub(crate) async fn groups_by_number(db: &PgPool, owner: i64, id: &str) -> Result<Value, ApiError> {
    let mut tx = db.begin().await?;
    owned(&mut tx, owner, id).await?;
    sqlx::query("UPDATE class_seats SET race_group = NULL WHERE class_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit(&mut tx, owner, "class.groups", id, json!({})).await?;
    tx.commit().await?;
    Ok(json!({ "by_number": true }))
}

/// Each seat's number and race group, for a room opened for the class.
pub(crate) async fn seat_groups(
    db: &PgPool,
    class_id: &str,
) -> Result<Vec<(i16, u8)>, sqlx::Error> {
    let rows: Vec<(i16, Option<i16>)> = sqlx::query_as(
        "SELECT number, race_group FROM class_seats WHERE class_id = $1 ORDER BY number",
    )
    .bind(class_id)
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(n, g)| (n, race_group(n, g)))
        .collect())
}

/// Archives the class: its code stops working and every device signs out.
pub(crate) async fn archive(db: &PgPool, owner: i64, id: &str) -> Result<Value, ApiError> {
    let mut tx = db.begin().await?;
    owned(&mut tx, owner, id).await?;
    sqlx::query("UPDATE classes SET status = 'archived', archived_at = now() WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "DELETE FROM seat_sessions WHERE seat_id IN (SELECT id FROM class_seats WHERE class_id = $1)",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    audit(&mut tx, owner, "class.archive", id, json!({})).await?;
    tx.commit().await?;
    Ok(json!({ "archived": id }))
}

// ------------------------------------------------------------ student side

#[derive(Deserialize)]
pub struct SignIn {
    class_code: String,
    seat: i16,
    picture: Vec<u8>,
}

pub(crate) async fn sign_in(db: &PgPool, guard: &Guard, body: &SignIn) -> Result<Value, ApiError> {
    let picture: Picture = body
        .picture
        .as_slice()
        .try_into()
        .ok()
        .filter(|p: &Picture| p.iter().all(|&x| x < PICTURES))
        .ok_or(err(StatusCode::UNPROCESSABLE_ENTITY, "picture"))?;
    let code = body.class_code.trim().to_uppercase();
    let mut tx = db.begin().await?;
    let class: Option<(String, String, i16)> = sqlx::query_as(
        "SELECT id, label, grade FROM classes WHERE join_code = $1 AND status = 'active'",
    )
    .bind(&code)
    .fetch_optional(&mut *tx)
    .await?;
    let (class, label, grade) = class.ok_or(err(StatusCode::NOT_FOUND, "class_not_found"))?;
    if guard.paused(&class, Instant::now()) {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "class_paused"));
    }
    type SeatRow = (i64, String, String, String, i16, i16, bool, bool);
    let seat: Option<SeatRow> = sqlx::query_as(
        "SELECT id, pseudonym, picture_salt, picture_hash, tries, wrong, teacher_lock,
                COALESCE(locked_until > now(), false)
         FROM class_seats WHERE class_id = $1 AND number = $2 FOR UPDATE",
    )
    .bind(&class)
    .bind(body.seat)
    .fetch_optional(&mut *tx)
    .await?;
    let (seat, name, salt, hash, tries, wrong, teacher_lock, locked) =
        seat.ok_or(err(StatusCode::NOT_FOUND, "seat_not_found"))?;
    if teacher_lock {
        return Err(err(StatusCode::FORBIDDEN, "ask_teacher"));
    }
    if locked {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "locked"));
    }
    if picture_hash(&salt, &picture) != hash {
        let a = after_wrong(tries, wrong);
        sqlx::query(
            "UPDATE class_seats SET tries = $2, wrong = $3, teacher_lock = $4,
                 locked_until = CASE WHEN $5 THEN now() + make_interval(mins => $6) ELSE NULL END
             WHERE id = $1",
        )
        .bind(seat)
        .bind(a.tries)
        .bind(a.wrong)
        .bind(a.teacher)
        .bind(a.lock)
        .bind(LOCK_MINUTES)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        guard.wrong(&class, Instant::now());
        return Err(if a.teacher {
            err(StatusCode::FORBIDDEN, "ask_teacher")
        } else if a.lock {
            err(StatusCode::TOO_MANY_REQUESTS, "locked")
        } else {
            err(StatusCode::UNAUTHORIZED, "wrong_picture")
        });
    }
    sqlx::query(
        "UPDATE class_seats SET tries = 0, wrong = 0, locked_until = NULL, last_seen_at = now()
         WHERE id = $1",
    )
    .bind(seat)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM seat_sessions WHERE seat_id = $1 AND expires_at < now()")
        .bind(seat)
        .execute(&mut *tx)
        .await?;
    let token = random_hex();
    sqlx::query(
        "INSERT INTO seat_sessions (token_hash, seat_id, expires_at)
         VALUES ($1, $2, now() + make_interval(days => $3))",
    )
    .bind(token_hash(&token))
    .bind(seat)
    .bind(SESSION_DAYS)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(json!({
        "token": token,
        "seat": body.seat,
        "pseudonym": name,
        "class_label": label,
        "grade": grade,
    }))
}

/// A signed-in student: their seat, and the class it belongs to.
/// The seat and class ids are for joining a room opened for this class.
#[derive(Debug)]
pub(crate) struct Student {
    pub(crate) seat_id: i64,
    pub(crate) class_id: String,
    pub(crate) number: i16,
    pub(crate) pseudonym: String,
    pub(crate) class_label: String,
    pub(crate) grade: i16,
    /// The group the seat races in, in a room for its class.
    pub(crate) race_group: u8,
}

/// Seat id, class id, number, pseudonym, class label, grade, chosen group.
type StudentRow = (i64, String, i16, String, String, i16, Option<i16>);

/// The student a token belongs to, while it is fresh and the class active.
pub(crate) async fn student(db: &PgPool, token: &str) -> Result<Option<Student>, sqlx::Error> {
    let row: Option<StudentRow> = sqlx::query_as(
        "SELECT s.id, c.id, s.number, s.pseudonym, c.label, c.grade, s.race_group
         FROM seat_sessions t
         JOIN class_seats s ON s.id = t.seat_id
         JOIN classes c ON c.id = s.class_id
         WHERE t.token_hash = $1 AND t.expires_at > now() AND c.status = 'active'",
    )
    .bind(token_hash(token))
    .fetch_optional(db)
    .await?;
    Ok(row.map(
        |(seat_id, class_id, number, pseudonym, class_label, grade, chosen)| Student {
            seat_id,
            class_id,
            number,
            pseudonym,
            class_label,
            grade,
            race_group: race_group(number, chosen),
        },
    ))
}

pub(crate) async fn sign_out(db: &PgPool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM seat_sessions WHERE token_hash = $1")
        .bind(token_hash(token))
        .execute(db)
        .await?;
    Ok(())
}

// ------------------------------------------------------------ HTTP

/// `GET /api/classes`: the signed-in teacher's classes, the active ones first.
pub async fn list(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    allowance(&state.db, user.id, user.admin).await?;
    Ok(Json(list_classes(&state.db, user.id).await?))
}

/// `POST /api/classes`: a new class and its seats, each picture shown this once.
pub async fn create(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(body): Json<NewClass>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let user = signed_in(&state, &headers).await?;
    let a = allowance(&state.db, user.id, user.admin).await?;
    let made = create_class(&state.db, user.id, a, &body).await?;
    tracing::info!("class made by {}", user.id);
    Ok((StatusCode::CREATED, Json(made)))
}

/// `GET /api/classes/{id}`: the class and its seats (no pictures).
pub async fn detail(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(class_detail(&state.db, user.id, &id).await?))
}

#[derive(Deserialize)]
pub struct MoreSeats {
    count: i16,
}

/// `POST /api/classes/{id}/seats`: more seats after the last one.
pub async fn add(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<MoreSeats>,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    let a = allowance(&state.db, user.id, user.admin).await?;
    Ok(Json(
        more_seats(&state.db, user.id, a, &id, body.count).await?,
    ))
}

async fn seat_change(
    state: State,
    headers: HeaderMap,
    (id, number): (String, i16),
    change: SeatChange,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(
        change_seat(&state.db, user.id, &id, number, change).await?,
    ))
}

/// `POST /api/classes/{id}/seats/{n}/picture`: a new picture for a lost card.
pub async fn picture(
    Extract(state): Extract<State>,
    Path(seat): Path<(String, i16)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    seat_change(state, headers, seat, SeatChange::Picture).await
}

/// `POST /api/classes/{id}/seats/{n}/unlock`: opens a locked seat.
pub async fn unlock(
    Extract(state): Extract<State>,
    Path(seat): Path<(String, i16)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    seat_change(state, headers, seat, SeatChange::Unlock).await
}

/// `DELETE /api/classes/{id}/seats/{n}`: empties the seat for a new student.
pub async fn reset(
    Extract(state): Extract<State>,
    Path(seat): Path<(String, i16)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    seat_change(state, headers, seat, SeatChange::Reset).await
}

#[derive(Deserialize)]
pub struct Group {
    group: Option<i16>,
}

/// `POST /api/classes/{id}/seats/{n}/group`: the seat's race group (0 is A),
/// or null for the group of its number.
pub async fn group(
    Extract(state): Extract<State>,
    Path((id, number)): Path<(String, i16)>,
    headers: HeaderMap,
    Json(body): Json<Group>,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(
        set_group(&state.db, user.id, &id, number, body.group).await?,
    ))
}

/// `DELETE /api/classes/{id}/groups`: every seat races in the group of its number.
pub async fn ungroup(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(groups_by_number(&state.db, user.id, &id).await?))
}

/// `DELETE /api/classes/{id}`: archives the class.
pub async fn remove(
    Extract(state): Extract<State>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = signed_in(&state, &headers).await?;
    Ok(Json(archive(&state.db, user.id, &id).await?))
}

/// `POST /api/student/sign-in`: class code, seat number and picture.
pub async fn student_sign_in(
    Extract(state): Extract<State>,
    Json(body): Json<SignIn>,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(sign_in(&state.db, &state.classes, &body).await?))
}

/// `GET /api/student/me`: who this device is signed in as.
pub async fn student_me(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(err(StatusCode::UNAUTHORIZED, "signed_out"))?;
    Ok(Json(json!({
        "seat": s.number,
        "pseudonym": s.pseudonym,
        "class_label": s.class_label,
        "grade": s.grade,
    })))
}

/// `GET /api/student/room`: the room the student's teacher opened for their
/// class, newest first, so the student joins without typing its code.
pub async fn student_room(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(err(StatusCode::UNAUTHORIZED, "signed_out"))?;
    let code = state.rooms.class_room(&s.class_id);
    Ok(Json(
        json!({ "play_code": code, "class_label": s.class_label }),
    ))
}

/// `POST /api/student/rival`: FIND A RIVAL. The play code of a room of two
/// desks for students of the same grade; a robot takes the empty one when no
/// rival comes in time. Its results count as a room for anyone.
pub async fn student_rival(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(err(StatusCode::UNAUTHORIZED, "signed_out"))?;
    let code = state.rooms.find_rival(s.grade).await?;
    Ok(Json(json!({ "play_code": code, "grade": s.grade })))
}

/// A race against the robots or a practice the student played on their own,
/// as the game reports it.
#[derive(Deserialize)]
pub struct Play {
    client_id: String,
    kind: String,
    game: Option<String>,
    points: i32,
    folded: i32,
    place: Option<i16>,
    stars: Option<i16>,
    right: Option<i16>,
    total: Option<i16>,
    duration_ms: i32,
}

/// Plays one seat may send in a minute; more are refused, not stored.
const PLAYS_PER_MINUTE: i64 = 12;

/// Keeps a play on its own apart from the matches in rooms: the game reports
/// it and nothing checks it, so it tells how often a student plays, not how
/// well. Sending the same `client_id` again stores it once.
pub(crate) async fn record_play(db: &PgPool, seat_id: i64, play: &Play) -> Result<Value, ApiError> {
    let race = play.kind == "race";
    let fits = (1..=64).contains(&play.client_id.len())
        && (race || play.kind == "practice")
        && play.game.as_ref().is_none_or(|g| g.len() <= 32)
        && (0..=100_000).contains(&play.points)
        && (0..=1_000).contains(&play.folded)
        && (0..=3_600_000).contains(&play.duration_ms)
        && if race {
            play.place.is_some_and(|p| (1..=6).contains(&p))
                && play.stars.is_some_and(|s| (0..=3).contains(&s))
        } else {
            match (play.right, play.total) {
                (Some(r), Some(t)) => (0..=t).contains(&r) && t <= 200,
                _ => false,
            }
        };
    if !fits {
        return Err(err(StatusCode::UNPROCESSABLE_ENTITY, "play"));
    }
    let recent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM seat_plays
         WHERE class_seat_id = $1 AND played_at > now() - interval '1 minute'",
    )
    .bind(seat_id)
    .fetch_one(db)
    .await?;
    if recent >= PLAYS_PER_MINUTE {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "too_many_plays"));
    }
    sqlx::query(
        "INSERT INTO seat_plays (class_seat_id, client_id, kind, game, points, folded, place, stars,
             right_answers, total, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (class_seat_id, client_id) DO NOTHING",
    )
    .bind(seat_id)
    .bind(&play.client_id)
    .bind(&play.kind)
    .bind(&play.game)
    .bind(play.points)
    .bind(play.folded)
    .bind(if race { play.place } else { None })
    .bind(if race { play.stars } else { None })
    .bind(if race { None } else { play.right })
    .bind(if race { None } else { play.total })
    .bind(play.duration_ms)
    .execute(db)
    .await?;
    Ok(json!({ "stored": true }))
}

/// `POST /api/student/plays`: a play on the student's own, kept for the
/// teacher apart from the class's matches.
pub async fn student_play(
    Extract(state): Extract<State>,
    headers: HeaderMap,
    Json(play): Json<Play>,
) -> Result<Json<Value>, ApiError> {
    let s = student(&state.db, bearer(&headers)?)
        .await?
        .ok_or(err(StatusCode::UNAUTHORIZED, "signed_out"))?;
    Ok(Json(record_play(&state.db, s.seat_id, &play).await?))
}

/// `POST /api/student/sign-out`: forgets this device's session.
pub async fn student_sign_out(
    Extract(state): Extract<State>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    sign_out(&state.db, bearer(&headers)?).await?;
    Ok(Json(json!({ "signed_out": true })))
}

#[cfg(test)]
mod tests;
