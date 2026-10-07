//! Class Match: classmates race each other at their own desks, run by the server.
//!
//! The race of `race.rs` for several people at once. Every seat races for
//! itself on one shared clock: the same rounds, the same points formula, each
//! classmate with their own session, so every one gets creatures for their own
//! level. Seats nobody took are filled by bots, clearly marked; their level
//! follows the classmates' average and their pace the classmates' median, and
//! they never write answer events, so a bot never moves anyone's rating.
//!
//! A seat whose connection drops is set away: its open creature is closed
//! without an event (the answer is void) and it gets no creatures until it is
//! back. After `STAND_IN_MS` away a stand-in bot works at the desk so the room
//! stays alive, but it earns the seat nothing and writes no answer events; it
//! leaves the moment the classmate is back. A match of bots only (no
//! classmates) is the public demo room.
//! All timing uses the `now_ms` the server passes, and answer times are
//! measured on that clock from when the creature was handed out.

use serde::{Deserialize, Serialize};

use crate::fairness::{
    Band, FairnessParams, GameType, MatchStats, Outcome, Rating, assign_highlights, bot_answer,
    bot_theta, points,
};
use crate::race::{
    BOSS_MULTIPLIER, BOT_BETWEEN_MS, BOT_READ_MS, BREAK_MS, Emote, LAST_START_MS, PACE_MAX_MS,
    PACE_MIN_MS, PACE_SPREAD, Phase, PlayerRecap, RaceOffer, RaceVerdict, RoundPlan, SkillChange,
    Tally, WaveSpec, default_boss_game, default_boss_seconds, default_waves,
};
use crate::rng::Rng;
use crate::session::{AnswerEvent, SessionConfig, SessionError, SoloSession, Verdict};
use crate::template::{I18n, ItemTemplate};

/// Most seats a class match holds.
pub const MAX_SEATS: usize = 6;
/// How long a seat is away before a stand-in bot works at its desk.
pub const STAND_IN_MS: f64 = 60_000.0;

/// A classmate taking a seat.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Classmate {
    /// Pseudonym shown to everyone ("Blue Crane 07").
    pub name: String,
    /// Id written into answer events (seat or device id, never a real name).
    pub player_id: String,
    #[serde(default)]
    pub grade: Option<u8>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ClassConfig {
    pub seed: u64,
    /// Classmates, in seat order; seats after them are bots. Empty for the demo room.
    pub classmates: Vec<Classmate>,
    #[serde(default = "default_seats")]
    pub seats: usize,
    #[serde(default)]
    pub content_pack_version: String,
    #[serde(default = "default_expected_ms")]
    pub expected_answer_ms: f64,
    #[serde(default = "default_waves")]
    pub waves: Vec<WaveSpec>,
    #[serde(default = "default_boss_game")]
    pub boss_game: GameType,
    #[serde(default = "default_boss_seconds")]
    pub boss_seconds: f64,
    #[serde(default = "default_bot_names")]
    pub bot_names: Vec<String>,
}

impl ClassConfig {
    /// A match with the usual rounds and bot names.
    pub fn new(
        seed: u64,
        classmates: Vec<Classmate>,
        seats: usize,
        content_pack_version: String,
    ) -> Self {
        ClassConfig {
            seed,
            classmates,
            seats,
            content_pack_version,
            expected_answer_ms: default_expected_ms(),
            waves: default_waves(),
            boss_game: default_boss_game(),
            boss_seconds: default_boss_seconds(),
            bot_names: default_bot_names(),
        }
    }
}

fn default_seats() -> usize {
    3
}
fn default_expected_ms() -> f64 {
    8000.0
}
fn default_bot_names() -> Vec<String> {
    ["Clip", "Crease", "Pleat", "Tuck", "Flap", "Ridge"]
        .map(String::from)
        .to_vec()
}

#[derive(Clone, Debug, PartialEq)]
pub enum ClassError {
    Session(SessionError),
    /// No seats, more classmates than seats, or more than `MAX_SEATS`.
    Seats,
    /// Too few bot names for the empty seats.
    BotNames,
    UnknownSeat(usize),
    /// The seat is a bot's.
    NotClassmate(usize),
    /// The seat is away; it has to come back first.
    Away(usize),
}

impl From<SessionError> for ClassError {
    fn from(e: SessionError) -> Self {
        ClassError::Session(e)
    }
}

impl std::fmt::Display for ClassError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClassError::Session(e) => e.fmt(f),
            ClassError::Seats => write!(f, "1 to {MAX_SEATS} seats, classmates in at most all"),
            ClassError::BotNames => write!(f, "not enough bot names"),
            ClassError::UnknownSeat(s) => write!(f, "no seat {s}"),
            ClassError::NotClassmate(s) => write!(f, "seat {s} is a bot"),
            ClassError::Away(s) => write!(f, "seat {s} is away"),
        }
    }
}

impl std::error::Error for ClassError {}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClassEvent {
    WaveStart {
        at_ms: f64,
        wave: usize,
        game: GameType,
        ends_at_ms: f64,
    },
    /// A seat started on a creature; `prompt` is what the Arena Screen shows.
    SeatWorking {
        at_ms: f64,
        seat: usize,
        prompt: I18n,
    },
    /// `points` is 0 for a stand-in, which earns the seat nothing.
    SeatAnswer {
        at_ms: f64,
        seat: usize,
        correct: bool,
        attempt: u32,
        points: u32,
    },
    Emote {
        at_ms: f64,
        seat: usize,
        emote: Emote,
    },
    TimeUp {
        at_ms: f64,
        wave: Option<usize>,
    },
    BossStart {
        at_ms: f64,
        ends_at_ms: f64,
    },
    MatchEnd {
        at_ms: f64,
    },
    SeatAway {
        at_ms: f64,
        seat: usize,
    },
    SeatBack {
        at_ms: f64,
        seat: usize,
    },
    /// A stand-in bot sat down at an away seat's desk (it leaves at `seat_back`).
    StandIn {
        at_ms: f64,
        seat: usize,
    },
}

#[derive(Clone, Debug, Serialize)]
pub struct SeatView {
    pub name: String,
    pub bot: bool,
    pub away: bool,
    /// A stand-in bot works at this away seat's desk.
    pub stand_in: bool,
    pub points: u32,
    pub folded: u32,
    /// 1 for the leader; ties share a place.
    pub place: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct ClassView {
    #[serde(flatten)]
    pub phase: Phase,
    pub waves: usize,
    pub plan: Vec<RoundPlan>,
    pub ends_at_ms: Option<f64>,
    pub seats: Vec<SeatView>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ClassRecap {
    /// One per seat, in seat order.
    pub players: Vec<PlayerRecap>,
    /// Each seat's skill changes; empty for bots.
    pub skills: Vec<Vec<SkillChange>>,
}

/// One answer event and the seat it came from.
#[derive(Clone, Debug, Serialize)]
pub struct SeatAnswerEvent {
    pub seat: usize,
    #[serde(flatten)]
    pub event: AnswerEvent,
}

struct Current {
    offer_id: u32,
    boss: bool,
    challenge: bool,
    /// When the creature was handed out, on the server's clock.
    shown_at: f64,
}

struct Human {
    session: SoloSession,
    grade: Option<u8>,
    current: Option<Current>,
    /// First-try answer times this round (ms).
    times: Vec<f64>,
    /// Typical answer time, from the last round answered in.
    pace_ms: Option<f64>,
    away: bool,
    /// When the seat went away, on the server's clock.
    away_since: f64,
    /// Works at the desk after `STAND_IN_MS` away; earns nothing.
    stand_in: Option<Bot>,
}

struct Work {
    b: f64,
    p: f64,
    attempt: u32,
    done_at: f64,
    answer_ms: f64,
}

struct Bot {
    theta: f64,
    pace_ms: f64,
    work: Option<Work>,
    free_at: f64,
}

enum Brain {
    Human(Box<Human>),
    Bot(Bot),
}

struct Seat {
    name: String,
    brain: Brain,
    tally: Tally,
}

pub struct ClassMatch {
    cfg: ClassConfig,
    /// Draws the bots' creatures; never answered, so nobody's rating moves.
    bank: SoloSession,
    rng: Rng,
    phase: Phase,
    seats: Vec<Seat>,
    ends_at: f64,
    now: f64,
    events: Vec<ClassEvent>,
}

/// A seed for each seat from the match's, so a match can be replayed from its seed.
fn seat_seed(seed: u64, seat: usize) -> u64 {
    seed ^ (seat as u64 + 1).wrapping_mul(0x9e37_79b9_7f4a_7c15)
}

impl ClassMatch {
    /// Templates that fail to compile are returned by id (once, not per seat).
    pub fn new(
        templates: Vec<ItemTemplate>,
        cfg: ClassConfig,
        params: FairnessParams,
    ) -> Result<(Self, Vec<String>), ClassError> {
        let humans = cfg.classmates.len();
        if cfg.seats == 0 || humans > cfg.seats || cfg.seats > MAX_SEATS {
            return Err(ClassError::Seats);
        }
        if cfg.bot_names.len() < cfg.seats - humans {
            return Err(ClassError::BotNames);
        }
        let session_cfg = |seed: u64, player_id: &str, grade: Option<u8>| SessionConfig {
            seed,
            grade,
            candidates: 12,
            timed: true,
            expected_answer_ms: cfg.expected_answer_ms,
            player_id: player_id.to_string(),
            content_pack_version: cfg.content_pack_version.clone(),
        };
        let (bank, rejected) = SoloSession::new(
            templates.clone(),
            session_cfg(seat_seed(cfg.seed, MAX_SEATS), "bots", None),
            params.clone(),
        )?;
        for w in &cfg.waves {
            bank.check_game(w.game)?;
        }
        bank.check_game(cfg.boss_game)?;
        let mut seats = Vec::with_capacity(cfg.seats);
        for (i, c) in cfg.classmates.iter().enumerate() {
            let (mut session, _) = SoloSession::new(
                templates.clone(),
                session_cfg(seat_seed(cfg.seed, i), &c.player_id, c.grade),
                params.clone(),
            )?;
            session.set_mode("class_match");
            seats.push(Seat {
                name: c.name.clone(),
                brain: Brain::Human(Box::new(Human {
                    session,
                    grade: c.grade,
                    current: None,
                    times: Vec::new(),
                    pace_ms: None,
                    away: false,
                    away_since: 0.0,
                    stand_in: None,
                })),
                tally: Tally::default(),
            });
        }
        for k in 0..cfg.seats - humans {
            seats.push(Seat {
                name: cfg.bot_names[k].clone(),
                brain: Brain::Bot(Bot {
                    theta: 0.0,
                    pace_ms: 0.0,
                    work: None,
                    free_at: f64::INFINITY,
                }),
                tally: Tally::default(),
            });
        }
        let rng = Rng::new(cfg.seed ^ 0xc1a5_5e55);
        Ok((
            ClassMatch {
                cfg,
                bank,
                rng,
                phase: Phase::Ready,
                seats,
                ends_at: f64::INFINITY,
                now: 0.0,
                events: Vec::new(),
            },
            rejected,
        ))
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn seat_count(&self) -> usize {
        self.seats.len()
    }

    pub fn is_bot(&self, seat: usize) -> bool {
        self.seats
            .get(seat)
            .is_some_and(|s| matches!(s.brain, Brain::Bot(_)))
    }

    pub fn start(&mut self, now_ms: f64) {
        if self.phase == Phase::Ready {
            self.now = now_ms;
            self.begin_round(Phase::Wave { wave: 0 }, now_ms);
        }
    }

    fn in_round(&self) -> bool {
        matches!(self.phase, Phase::Wave { .. } | Phase::Boss)
    }

    fn game(&self) -> GameType {
        match self.phase {
            Phase::Wave { wave } => self.cfg.waves[wave].game,
            _ => self.cfg.boss_game,
        }
    }

    fn human_theta(h: &Human) -> f64 {
        let r = h.session.ratings();
        if r.is_empty() {
            return Rating::start(h.grade, h.session.params()).theta;
        }
        r.values().map(|x| x.theta).sum::<f64>() / r.len() as f64
    }

    fn begin_round(&mut self, phase: Phase, at: f64) {
        self.phase = phase;
        let seconds = match phase {
            Phase::Wave { wave } => self.cfg.waves[wave].seconds,
            _ => self.cfg.boss_seconds,
        };
        self.ends_at = at + seconds * 1000.0;
        // Bots follow the classmates: their average level and median pace, re-drawn each round.
        let mut thetas = Vec::new();
        let mut paces = Vec::new();
        for s in &mut self.seats {
            if let Brain::Human(h) = &mut s.brain {
                if !h.times.is_empty() {
                    let mut t = std::mem::take(&mut h.times);
                    t.sort_by(f64::total_cmp);
                    h.pace_ms = Some(t[t.len() / 2]);
                }
                thetas.push(Self::human_theta(h));
                if let Some(p) = h.pace_ms {
                    paces.push(p);
                }
            }
        }
        paces.sort_by(f64::total_cmp);
        let pace = paces
            .get(paces.len() / 2)
            .copied()
            .unwrap_or(self.cfg.expected_answer_ms)
            .clamp(PACE_MIN_MS, PACE_MAX_MS);
        let mut k = 0.0;
        for s in &mut self.seats {
            if let Brain::Bot(b) = &mut s.brain {
                let spread = PACE_SPREAD.0 + (PACE_SPREAD.1 - PACE_SPREAD.0) * self.rng.unit();
                b.pace_ms = pace * spread;
                b.theta = bot_theta(&thetas, self.bank.params(), &mut self.rng);
                b.work = None;
                b.free_at = at + 900.0 + 700.0 * k;
                k += 1.0;
            }
        }
        for d in 0..self.seats.len() {
            if let Brain::Human(h) = &mut self.seats[d].brain
                && let Some(b) = &mut h.stand_in
            {
                b.work = None;
                b.free_at = at + 900.0 + 700.0 * k;
                k += 1.0;
            }
        }
        match phase {
            Phase::Wave { wave } => self.events.push(ClassEvent::WaveStart {
                at_ms: at,
                wave,
                game: self.cfg.waves[wave].game,
                ends_at_ms: self.ends_at,
            }),
            Phase::Boss => self.events.push(ClassEvent::BossStart {
                at_ms: at,
                ends_at_ms: self.ends_at,
            }),
            _ => {}
        }
    }

    // ------------------------------------------------------------ classmates

    fn human(&mut self, seat: usize) -> Result<&mut Human, ClassError> {
        match self.seats.get_mut(seat).map(|s| &mut s.brain) {
            None => Err(ClassError::UnknownSeat(seat)),
            Some(Brain::Bot(_)) => Err(ClassError::NotClassmate(seat)),
            Some(Brain::Human(h)) => Ok(h),
        }
    }

    /// Next creature for a classmate's desk, or `None` between rounds, while
    /// one is open, or in the last moments of a round.
    pub fn next(&mut self, seat: usize, now_ms: f64) -> Result<Option<RaceOffer>, ClassError> {
        self.now = self.now.max(now_ms);
        let open = !self.in_round() || self.now > self.ends_at - LAST_START_MS;
        let boss = self.phase == Phase::Boss;
        let game = self.game();
        let now = self.now;
        let h = self.human(seat)?;
        if h.away {
            return Err(ClassError::Away(seat));
        }
        if open || h.current.is_some() {
            return Ok(None);
        }
        let offer = h.session.next(game)?;
        h.current = Some(Current {
            offer_id: offer.offer_id,
            boss,
            challenge: offer.band == Band::Explore,
            shown_at: now,
        });
        self.events.push(ClassEvent::SeatWorking {
            at_ms: now,
            seat,
            prompt: offer.prompt.clone(),
        });
        Ok(Some(RaceOffer { offer, boss }))
    }

    pub fn answer_balloon(
        &mut self,
        seat: usize,
        offer_id: u32,
        index: usize,
        now_ms: f64,
    ) -> Result<RaceVerdict, ClassError> {
        let time_ms = self.check_current(seat, offer_id, now_ms)?;
        let h = self.human(seat)?;
        let v = h.session.answer_balloon(offer_id, index, time_ms, now_ms)?;
        Ok(self.after_answer(seat, v, time_ms))
    }

    pub fn answer_orb(
        &mut self,
        seat: usize,
        offer_id: u32,
        crystals: &[usize],
        now_ms: f64,
    ) -> Result<RaceVerdict, ClassError> {
        let time_ms = self.check_current(seat, offer_id, now_ms)?;
        let h = self.human(seat)?;
        let v = h.session.answer_orb(offer_id, crystals, time_ms, now_ms)?;
        Ok(self.after_answer(seat, v, time_ms))
    }

    pub fn answer_balance(
        &mut self,
        seat: usize,
        offer_id: u32,
        index: usize,
        now_ms: f64,
    ) -> Result<RaceVerdict, ClassError> {
        let time_ms = self.check_current(seat, offer_id, now_ms)?;
        let h = self.human(seat)?;
        let v = h.session.answer_balance(offer_id, index, time_ms, now_ms)?;
        Ok(self.after_answer(seat, v, time_ms))
    }

    pub fn answer_sort(
        &mut self,
        seat: usize,
        offer_id: u32,
        gate: usize,
        now_ms: f64,
    ) -> Result<RaceVerdict, ClassError> {
        let time_ms = self.check_current(seat, offer_id, now_ms)?;
        let h = self.human(seat)?;
        let v = h.session.answer_sort(offer_id, gate, time_ms, now_ms)?;
        Ok(self.after_answer(seat, v, time_ms))
    }

    pub fn answer_bridge(
        &mut self,
        seat: usize,
        offer_id: u32,
        planks: &[usize],
        now_ms: f64,
    ) -> Result<RaceVerdict, ClassError> {
        let time_ms = self.check_current(seat, offer_id, now_ms)?;
        let h = self.human(seat)?;
        let v = h.session.answer_bridge(offer_id, planks, time_ms, now_ms)?;
        Ok(self.after_answer(seat, v, time_ms))
    }

    /// Answers count only for the seat's open creature; returns the answer
    /// time on the server's clock.
    fn check_current(
        &mut self,
        seat: usize,
        offer_id: u32,
        now_ms: f64,
    ) -> Result<f64, ClassError> {
        self.now = self.now.max(now_ms);
        let now = self.now;
        let h = self.human(seat)?;
        if h.away {
            return Err(ClassError::Away(seat));
        }
        match &h.current {
            Some(c) if c.offer_id == offer_id => Ok((now - c.shown_at).max(0.0)),
            _ => Err(SessionError::UnknownOffer(offer_id).into()),
        }
    }

    fn after_answer(&mut self, seat: usize, verdict: Verdict, time_ms: f64) -> RaceVerdict {
        let now = self.now;
        let s = &mut self.seats[seat];
        let Brain::Human(h) = &mut s.brain else {
            unreachable!("checked")
        };
        let cur = h.current.as_mut().expect("checked");
        let (boss, challenge) = (cur.boss, cur.challenge);
        let race_points = verdict.points * if boss { BOSS_MULTIPLIER } else { 1 };
        if verdict.attempt == 1 {
            h.times.push(time_ms);
        }
        s.tally
            .answered(verdict.attempt, verdict.correct, challenge);
        s.tally.points += race_points;
        if verdict.retry_allowed {
            // The second try is timed from the first answer.
            cur.shown_at = now;
        } else {
            h.current = None;
        }
        self.events.push(ClassEvent::SeatAnswer {
            at_ms: now,
            seat,
            correct: verdict.correct,
            attempt: verdict.attempt,
            points: race_points,
        });
        RaceVerdict {
            verdict,
            race_points,
            boss,
        }
    }

    /// The seat's connection dropped: its open creature goes home without an answer.
    pub fn set_away(&mut self, seat: usize, away: bool, now_ms: f64) -> Result<(), ClassError> {
        self.now = self.now.max(now_ms);
        let now = self.now;
        let h = self.human(seat)?;
        if h.away == away {
            return Ok(());
        }
        h.away = away;
        h.away_since = now;
        // Back: the stand-in leaves, whatever it was working on goes with it.
        h.stand_in = None;
        if away && let Some(cur) = h.current.take() {
            h.session.close(cur.offer_id);
        }
        self.events.push(if away {
            ClassEvent::SeatAway { at_ms: now, seat }
        } else {
            ClassEvent::SeatBack { at_ms: now, seat }
        });
        Ok(())
    }

    // ------------------------------------------------------------ time

    /// Advances match time to `now_ms` and returns what happened, oldest
    /// first, including what `next` and the answers added since the last call.
    pub fn tick(&mut self, now_ms: f64) -> Vec<ClassEvent> {
        while let Some(at) = self.next_due() {
            if at > now_ms {
                break;
            }
            self.step(at);
        }
        self.now = now_ms.max(self.now);
        std::mem::take(&mut self.events)
    }

    fn next_due(&self) -> Option<f64> {
        match self.phase {
            Phase::Ready | Phase::Done => None,
            Phase::Break { until_ms, .. } => Some(until_ms),
            Phase::Wave { .. } | Phase::Boss => Some(
                self.seats
                    .iter()
                    .filter_map(|s| match &s.brain {
                        Brain::Bot(b) => Some(b.work.as_ref().map_or(b.free_at, |w| w.done_at)),
                        Brain::Human(h) => match &h.stand_in {
                            Some(b) => Some(b.work.as_ref().map_or(b.free_at, |w| w.done_at)),
                            None if h.away => Some(h.away_since + STAND_IN_MS),
                            None => None,
                        },
                    })
                    .fold(self.ends_at, f64::min),
            ),
        }
    }

    fn step(&mut self, at: f64) {
        match self.phase {
            Phase::Break {
                next_wave: Some(w), ..
            } => self.begin_round(Phase::Wave { wave: w }, at),
            Phase::Break {
                next_wave: None, ..
            } => self.begin_round(Phase::Boss, at),
            Phase::Wave { .. } | Phase::Boss if at >= self.ends_at => self.time_up(at),
            Phase::Wave { .. } | Phase::Boss => {
                for d in 0..self.seats.len() {
                    self.seat_stand_in(d, at);
                    if self.has_bot(d) {
                        self.step_bot(d, at);
                    }
                }
            }
            Phase::Ready | Phase::Done => {}
        }
    }

    fn time_up(&mut self, at: f64) {
        for s in &mut self.seats {
            match &mut s.brain {
                Brain::Human(h) => {
                    if let Some(cur) = h.current.take() {
                        h.session.close(cur.offer_id);
                    }
                    if let Some(b) = &mut h.stand_in {
                        b.work = None;
                    }
                }
                Brain::Bot(b) => b.work = None,
            }
        }
        let wave = match self.phase {
            Phase::Wave { wave } => Some(wave),
            _ => None,
        };
        self.events.push(ClassEvent::TimeUp { at_ms: at, wave });
        match wave {
            Some(w) => {
                let next_wave = (w + 1 < self.cfg.waves.len()).then_some(w + 1);
                self.phase = Phase::Break {
                    next_wave,
                    until_ms: at + BREAK_MS,
                };
            }
            None => self.finish(at),
        }
    }

    fn finish(&mut self, at: f64) {
        let leader = self.leader();
        for d in 0..self.seats.len() {
            if matches!(self.seats[d].brain, Brain::Bot(_)) {
                // A winning bot applauds; the other bots give a thumbs up.
                let emote = if d == leader {
                    Emote::Clap
                } else {
                    Emote::ThumbsUp
                };
                self.events.push(ClassEvent::Emote {
                    at_ms: at,
                    seat: d,
                    emote,
                });
            }
        }
        self.events.push(ClassEvent::MatchEnd { at_ms: at });
        self.phase = Phase::Done;
    }

    /// The seat's bot, or the stand-in at an away classmate's desk.
    fn bot(&mut self, d: usize) -> &mut Bot {
        match &mut self.seats[d].brain {
            Brain::Bot(b) => b,
            Brain::Human(h) => h.stand_in.as_mut().expect("only bots step"),
        }
    }

    fn has_bot(&self, d: usize) -> bool {
        match &self.seats[d].brain {
            Brain::Bot(_) => true,
            Brain::Human(h) => h.stand_in.is_some(),
        }
    }

    /// A seat away for `STAND_IN_MS` gets a stand-in at its level and pace.
    fn seat_stand_in(&mut self, d: usize, at: f64) {
        let expected = self.cfg.expected_answer_ms;
        let Brain::Human(h) = &mut self.seats[d].brain else {
            return;
        };
        if !h.away || h.stand_in.is_some() || at < h.away_since + STAND_IN_MS {
            return;
        }
        h.stand_in = Some(Bot {
            theta: Self::human_theta(h),
            pace_ms: h
                .pace_ms
                .unwrap_or(expected)
                .clamp(PACE_MIN_MS, PACE_MAX_MS),
            work: None,
            free_at: at,
        });
        self.events.push(ClassEvent::StandIn { at_ms: at, seat: d });
    }

    fn step_bot(&mut self, d: usize, at: f64) {
        if self.bot(d).work.as_ref().is_some_and(|w| w.done_at <= at) {
            self.finish_bot_answer(d, at);
        }
        let ends_at = self.ends_at;
        let b = self.bot(d);
        if b.work.is_none() && b.free_at <= at {
            if at <= ends_at - LAST_START_MS {
                self.start_bot_work(d, at);
            } else {
                b.free_at = f64::INFINITY;
            }
        }
    }

    fn start_bot_work(&mut self, d: usize, at: f64) {
        let game = self.game();
        let (theta, pace) = {
            let b = self.bot(d);
            (b.theta, b.pace_ms)
        };
        let rating = Rating {
            theta,
            sigma: self.bank.params().sigma_min,
            answers: u32::MAX,
        };
        let Some((item, p)) = self.bank.bot_item(game, rating, &mut self.rng) else {
            self.bot(d).free_at = at + BOT_BETWEEN_MS;
            return;
        };
        let choices = crate::session::guess_choices(game);
        let (_, ms) = bot_answer(theta, item.b, game, choices, pace, &mut self.rng);
        self.events.push(ClassEvent::SeatWorking {
            at_ms: at,
            seat: d,
            prompt: item.prompt.clone(),
        });
        self.bot(d).work = Some(Work {
            b: item.b,
            p,
            attempt: 1,
            done_at: at + BOT_READ_MS + ms,
            answer_ms: ms,
        });
    }

    fn finish_bot_answer(&mut self, d: usize, at: f64) {
        let game = self.game();
        let boss = self.phase == Phase::Boss;
        let expected = self.cfg.expected_answer_ms * game.time_factor();
        let (mut w, theta, pace) = {
            let b = self.bot(d);
            (b.work.take().expect("checked"), b.theta, b.pace_ms)
        };
        let choices = crate::session::guess_choices(game);
        let (outcome, retry_ms) = bot_answer(theta, w.b, game, choices, pace * 0.6, &mut self.rng);
        let correct = outcome == Outcome::Correct;
        let params = self.bank.params().clone();
        let stand_in = matches!(self.seats[d].brain, Brain::Human(_));
        let tally = &mut self.seats[d].tally;
        let pts = if stand_in {
            0
        } else {
            points(
                w.p,
                outcome,
                w.attempt,
                Some(w.answer_ms / expected),
                tally.streak,
                &params,
            ) * if boss { BOSS_MULTIPLIER } else { 1 }
        };
        let streak = if stand_in {
            0
        } else {
            tally.points += pts;
            tally.answered(w.attempt, correct, false);
            tally.streak
        };
        self.events.push(ClassEvent::SeatAnswer {
            at_ms: at,
            seat: d,
            correct,
            attempt: w.attempt,
            points: pts,
        });
        if !correct && w.attempt == 1 {
            w.attempt = 2;
            w.done_at = at + retry_ms;
            w.answer_ms = retry_ms;
            self.bot(d).work = Some(w);
            return;
        }
        self.bot(d).free_at = at + BOT_BETWEEN_MS;
        if streak > 0 && streak.is_multiple_of(3) {
            self.events.push(ClassEvent::Emote {
                at_ms: at,
                seat: d,
                emote: Emote::ThumbsUp,
            });
        }
    }

    // ------------------------------------------------------------ reading

    fn places(&self) -> Vec<u32> {
        let pts: Vec<u32> = self.seats.iter().map(|s| s.tally.points).collect();
        pts.iter()
            .map(|p| 1 + pts.iter().filter(|q| *q > p).count() as u32)
            .collect()
    }

    fn leader(&self) -> usize {
        (0..self.seats.len())
            .max_by_key(|i| (self.seats[*i].tally.points, std::cmp::Reverse(*i)))
            .unwrap_or(0)
    }

    pub fn view(&self) -> ClassView {
        let places = self.places();
        let seats = self
            .seats
            .iter()
            .enumerate()
            .map(|(i, s)| SeatView {
                name: s.name.clone(),
                bot: matches!(s.brain, Brain::Bot(_)),
                away: matches!(&s.brain, Brain::Human(h) if h.away),
                stand_in: matches!(&s.brain, Brain::Human(h) if h.stand_in.is_some()),
                points: s.tally.points,
                folded: s.tally.folded,
                place: places[i],
            })
            .collect();
        let plan = self
            .cfg
            .waves
            .iter()
            .map(|w| RoundPlan {
                game: w.game,
                seconds: w.seconds,
                boss: false,
            })
            .chain(std::iter::once(RoundPlan {
                game: self.cfg.boss_game,
                seconds: self.cfg.boss_seconds,
                boss: true,
            }))
            .collect();
        ClassView {
            phase: self.phase,
            waves: self.cfg.waves.len(),
            plan,
            ends_at_ms: self.in_round().then_some(self.ends_at),
            seats,
        }
    }

    /// End-of-match summary: places, personal stars, one different highlight each.
    pub fn recap(&self) -> ClassRecap {
        let mut skills = Vec::new();
        let mut stats = Vec::new();
        for s in &self.seats {
            let (changes, gain) = match &s.brain {
                Brain::Human(h) => {
                    let start = Rating::start(h.grade, h.session.params()).theta;
                    let changes: Vec<SkillChange> = h
                        .session
                        .ratings()
                        .iter()
                        .map(|(k, r)| SkillChange {
                            skill: k.clone(),
                            theta_before: start,
                            theta_after: r.theta,
                        })
                        .collect();
                    let gain = if changes.is_empty() {
                        0.0
                    } else {
                        changes
                            .iter()
                            .map(|c| c.theta_after - c.theta_before)
                            .sum::<f64>()
                            / changes.len() as f64
                    };
                    (changes, gain)
                }
                Brain::Bot(_) => (Vec::new(), 0.0),
            };
            stats.push(MatchStats {
                saves: s.tally.retries_won,
                theta_gain: gain,
                accuracy: s.tally.accuracy(),
                best_streak: s.tally.best_streak,
                challenge_tries: s.tally.challenge_tries,
            });
            skills.push(changes);
        }
        let highlights = assign_highlights(&stats);
        let places = self.places();
        let players = self
            .seats
            .iter()
            .enumerate()
            .map(|(i, s)| PlayerRecap {
                name: s.name.clone(),
                bot: matches!(s.brain, Brain::Bot(_)),
                points: s.tally.points,
                folded: s.tally.folded,
                place: places[i],
                stars: s.tally.stars(),
                highlight: highlights.as_ref().map(|h| h[i]),
            })
            .collect();
        ClassRecap { players, skills }
    }

    /// Classmates' answer events since the last call, for the database.
    pub fn drain_answer_events(&mut self) -> Vec<SeatAnswerEvent> {
        let mut out = Vec::new();
        for (seat, s) in self.seats.iter_mut().enumerate() {
            if let Brain::Human(h) = &mut s.brain {
                out.extend(
                    h.session
                        .drain_events()
                        .into_iter()
                        .map(|event| SeatAnswerEvent { seat, event }),
                );
            }
        }
        out
    }

    #[doc(hidden)]
    pub fn answer_key(&self, seat: usize, offer_id: u32) -> Option<Vec<usize>> {
        match &self.seats.get(seat)?.brain {
            Brain::Human(h) => h.session.answer_key(offer_id),
            Brain::Bot(_) => None,
        }
    }
}
