//! Solo Squad: one player and two partner bots defending three desks.
//!
//! The player's desk is paced by the player: the headset asks for the next
//! creature when it is ready. The two bot desks run on match time: creatures
//! arrive at the load-balanced rate, bots answer with the same ability model
//! as players, and a creature that beats a desk twice escapes to the calmest
//! other desk. A creature that escapes twice reaches the crystal.
//!
//! Scripted moments (from the design, never hidden from the tests):
//! - in the second wave one bot creature always escapes to the player's desk;
//! - the boss takes three parts: the bots bring the first two, the player
//!   always lands the last one.
//!
//! All timing uses the `now_ms` the caller passes, and every event is
//! processed at its own scheduled time, so the result does not depend on how
//! often `tick` is called. The same code can run on the server later.

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

use crate::fairness::{
    FairnessParams, GameType, Highlight, MatchStats, Outcome, Rating, assign_highlights,
    bot_answer, bot_theta, may_send_help_orb, overflow_target, points, spawn_per_minute,
    team_stars,
};
use crate::rng::Rng;
use crate::session::{Offer, SessionConfig, SessionError, SoloSession, Verdict};
use crate::template::ItemTemplate;

/// Desk index of the player; bots sit at 1 and 2.
pub const PLAYER: usize = 0;
/// Pause between a folded creature and the bot's next one (fold animation).
const BOT_FOLD_MS: f64 = 900.0;
/// A bot looks at a new creature this long before its answer clock starts.
const BOT_READ_MS: f64 = 1200.0;
/// Bots stop receiving new creatures at this many waiting.
const BOT_QUEUE_CAP: usize = 4;
/// Pause between waves, for the wave banner.
const BREAK_MS: f64 = 4000.0;
/// The scripted escape waits this long into the second wave.
const SCRIPT_ESCAPE_AFTER_MS: f64 = 15000.0;
/// Bot boss parts land this long after the boss appears.
const BOSS_PART_MS: [f64; 2] = [2500.0, 5000.0];
/// The player gets this many boss creatures before the boss retreats.
const BOSS_TRIES: u32 = 3;
/// Waiting creatures (including the current one) that count as overwhelmed.
const OVERWHELMED_AT: u32 = 3;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WaveSpec {
    pub game: GameType,
    /// Creatures the player meets in this wave, rescued ones not counted.
    pub creatures: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SquadConfig {
    #[serde(flatten)]
    pub session: SessionConfig,
    #[serde(default = "default_waves")]
    pub waves: Vec<WaveSpec>,
    #[serde(default = "default_boss_game")]
    pub boss_game: GameType,
    /// Rescues the team aims for (one of the three stars).
    #[serde(default = "default_saves_goal")]
    pub saves_goal: u32,
    #[serde(default = "default_bot_names")]
    pub bot_names: [String; 2],
}

fn default_waves() -> Vec<WaveSpec> {
    vec![
        WaveSpec {
            game: GameType::BalloonBurst,
            creatures: 6,
        },
        WaveSpec {
            game: GameType::OrbForge,
            creatures: 6,
        },
        WaveSpec {
            game: GameType::BalloonBurst,
            creatures: 6,
        },
    ]
}
fn default_boss_game() -> GameType {
    GameType::BalloonBurst
}
fn default_saves_goal() -> u32 {
    // The scripted escape in wave 2 always gives the player one rescue; a
    // higher goal would cost a strong team a star for having nothing to save.
    1
}
fn default_bot_names() -> [String; 2] {
    ["Clip".into(), "Crease".into()]
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Emote {
    ThumbsUp,
    Clap,
    Help,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SquadEvent {
    WaveStart {
        at_ms: f64,
        wave: usize,
        game: GameType,
    },
    /// A creature stepped out of a bot desk's portal.
    BotSpawn {
        at_ms: f64,
        desk: usize,
    },
    /// A bot started on a creature; `prompt` is shown in its portal window.
    BotWorking {
        at_ms: f64,
        desk: usize,
        prompt: String,
    },
    BotAnswer {
        at_ms: f64,
        desk: usize,
        correct: bool,
        attempt: u32,
        points: u32,
        answer_text: String,
    },
    /// `to: None` means the creature reached the crystal.
    Escape {
        at_ms: f64,
        from: usize,
        to: Option<usize>,
    },
    HelpOrb {
        at_ms: f64,
        from: usize,
        to: usize,
    },
    Emote {
        at_ms: f64,
        desk: usize,
        emote: Emote,
    },
    WaveEnd {
        at_ms: f64,
        wave: usize,
    },
    BossStart {
        at_ms: f64,
    },
    BossPart {
        at_ms: f64,
        desk: usize,
    },
    BossEnd {
        at_ms: f64,
        folded: bool,
    },
    MatchEnd {
        at_ms: f64,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum Phase {
    Ready,
    Wave {
        wave: usize,
    },
    /// Pause before `next_wave`; `None` means the boss comes next.
    Break {
        next_wave: Option<usize>,
        until_ms: f64,
    },
    Boss,
    Done,
}

#[derive(Clone, Debug, Serialize)]
pub struct SquadOffer {
    #[serde(flatten)]
    pub offer: Offer,
    /// Desk this creature escaped from, when the player is rescuing it.
    pub rescued_from: Option<usize>,
    pub boss: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct SquadVerdict {
    #[serde(flatten)]
    pub verdict: Verdict,
    /// Set when the creature left the player's desk: a bot desk, or `None`
    /// with `crystal_hit` when it reached the crystal.
    pub escaped_to: Option<usize>,
    pub crystal_hit: bool,
    pub boss_folded: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct DeskView {
    pub name: String,
    pub bot: bool,
    /// Creatures on the desk, including the one being answered.
    pub waiting: u32,
    pub points: u32,
    pub saves: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct SquadView {
    #[serde(flatten)]
    pub phase: Phase,
    pub waves: usize,
    pub desks: Vec<DeskView>,
    pub team_points: u32,
    pub crystal_hits: u32,
    pub saves: u32,
    pub saves_goal: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlayerRecap {
    pub name: String,
    pub bot: bool,
    pub points: u32,
    pub highlight: Option<Highlight>,
}

#[derive(Clone, Debug, Serialize)]
pub struct SkillChange {
    pub skill: String,
    pub theta_before: f64,
    pub theta_after: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Recap {
    pub stars: u8,
    pub crystals_safe: bool,
    pub boss_folded: bool,
    pub saves: u32,
    pub saves_goal: u32,
    pub team_points: u32,
    pub players: Vec<PlayerRecap>,
    pub skills: Vec<SkillChange>,
}

#[derive(Clone, Copy, Debug)]
struct Creature {
    /// Times it already escaped a desk.
    hops: u8,
}

#[derive(Clone, Debug)]
struct Work {
    creature: Creature,
    b: f64,
    p: f64,
    attempt: u32,
    done_at: f64,
    answer_ms: f64,
    answer_text: String,
    /// Scripted: both attempts miss and the creature goes to the player.
    forced_escape: bool,
}

#[derive(Clone, Debug, Default)]
struct Tally {
    points: u32,
    saves: u32,
    first_tries: u32,
    first_correct: u32,
    streak: u32,
    best_streak: u32,
    challenge_tries: u32,
}

impl Tally {
    fn answered(&mut self, attempt: u32, correct: bool, challenge: bool) {
        if attempt == 1 {
            self.first_tries += 1;
            if correct {
                self.first_correct += 1;
            }
            if challenge {
                self.challenge_tries += 1;
            }
        }
        if correct {
            self.streak += 1;
            self.best_streak = self.best_streak.max(self.streak);
        } else {
            self.streak = 0;
        }
    }
}

struct Bot {
    name: String,
    theta: f64,
    queue: VecDeque<Creature>,
    work: Option<Work>,
    /// When the bot may pick up the next creature.
    free_at: f64,
    next_spawn: f64,
    correct_at: VecDeque<f64>,
    tally: Tally,
    asked_help: bool,
}

impl Bot {
    fn waiting(&self) -> u32 {
        self.queue.len() as u32 + u32::from(self.work.is_some())
    }
}

struct Current {
    offer_id: u32,
    creature: Creature,
    rescued_from: Option<usize>,
    boss: bool,
    challenge: bool,
}

pub struct SquadMatch {
    cfg: SquadConfig,
    session: SoloSession,
    rng: Rng,
    phase: Phase,
    bots: [Bot; 2],
    /// Creatures that escaped to the player's desk, oldest first.
    rescues: VecDeque<(Creature, usize)>,
    current: Option<Current>,
    /// Own creatures the player met in the current wave.
    met: u32,
    wave_start: f64,
    scripted_done: bool,
    last_help: f64,
    player: Tally,
    crystal_hits: u32,
    boss_start: f64,
    boss_parts: usize,
    boss_tries: u32,
    boss_folded: bool,
    last_player_at: f64,
    player_correct_at: VecDeque<f64>,
    events: Vec<SquadEvent>,
}

impl SquadMatch {
    pub fn new(
        templates: Vec<ItemTemplate>,
        cfg: SquadConfig,
        params: FairnessParams,
    ) -> Result<(Self, Vec<String>), SessionError> {
        let (session, rejected) = SoloSession::new(templates, cfg.session.clone(), params)?;
        for w in &cfg.waves {
            session.check_game(w.game)?;
        }
        session.check_game(cfg.boss_game)?;
        let rng = Rng::new(cfg.session.seed ^ 0x5eed_b075);
        let bot = |name: &String| Bot {
            name: name.clone(),
            theta: 0.0,
            queue: VecDeque::new(),
            work: None,
            free_at: 0.0,
            next_spawn: f64::INFINITY,
            correct_at: VecDeque::new(),
            tally: Tally::default(),
            asked_help: false,
        };
        let bots = [bot(&cfg.bot_names[0]), bot(&cfg.bot_names[1])];
        Ok((
            SquadMatch {
                cfg,
                session,
                rng,
                phase: Phase::Ready,
                bots,
                rescues: VecDeque::new(),
                current: None,
                met: 0,
                wave_start: 0.0,
                scripted_done: false,
                last_help: f64::NEG_INFINITY,
                player: Tally::default(),
                crystal_hits: 0,
                boss_start: 0.0,
                boss_parts: 0,
                boss_tries: 0,
                boss_folded: false,
                last_player_at: 0.0,
                player_correct_at: VecDeque::new(),
                events: Vec::new(),
            },
            rejected,
        ))
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn start(&mut self, now_ms: f64) {
        if self.phase == Phase::Ready {
            self.begin_wave(0, now_ms);
        }
    }

    fn player_theta(&self) -> f64 {
        let r = self.session.ratings();
        if r.is_empty() {
            return Rating::start(self.cfg.session.grade, self.session.params()).theta;
        }
        r.values().map(|x| x.theta).sum::<f64>() / r.len() as f64
    }

    fn begin_wave(&mut self, wave: usize, at: f64) {
        self.phase = Phase::Wave { wave };
        self.wave_start = at;
        self.met = 0;
        // Bots follow the player's current level, re-drawn each wave so
        // placement answers in wave 1 are reflected from wave 2 on.
        let theta = self.player_theta();
        for i in 0..2 {
            self.bots[i].theta = bot_theta(&[theta], self.session.params(), &mut self.rng);
            self.bots[i].next_spawn = at + 1500.0 + 1500.0 * i as f64;
            self.bots[i].free_at = at;
        }
        let game = self.cfg.waves[wave].game;
        self.events.push(SquadEvent::WaveStart {
            at_ms: at,
            wave,
            game,
        });
    }

    fn game(&self) -> GameType {
        match self.phase {
            Phase::Wave { wave } => self.cfg.waves[wave].game,
            _ => self.cfg.boss_game,
        }
    }

    fn player_waiting(&self) -> u32 {
        self.rescues.len() as u32 + u32::from(self.current.is_some())
    }

    fn player_share_done(&self) -> bool {
        match self.phase {
            Phase::Wave { wave } => self.met >= self.cfg.waves[wave].creatures,
            _ => true,
        }
    }

    // ------------------------------------------------------------ player

    /// Next creature for the player's desk, or `None` while there is nothing
    /// to answer (between waves, waiting for the boss, or after the match).
    /// Rescued creatures come before the player's own.
    pub fn player_next(&mut self) -> Result<Option<SquadOffer>, SessionError> {
        if self.current.is_some() {
            return Ok(None);
        }
        let (creature, rescued_from, boss) = match self.phase {
            Phase::Wave { wave } => {
                if let Some((c, from)) = self.rescues.pop_front() {
                    (c, Some(from), false)
                } else if self.met < self.cfg.waves[wave].creatures {
                    self.met += 1;
                    (Creature { hops: 0 }, None, false)
                } else {
                    return Ok(None);
                }
            }
            Phase::Boss if self.boss_parts == BOSS_PART_MS.len() && !self.boss_folded => {
                if self.boss_tries >= BOSS_TRIES {
                    return Ok(None);
                }
                self.boss_tries += 1;
                (Creature { hops: 0 }, None, true)
            }
            _ => return Ok(None),
        };
        let offer = self.session.next(self.game())?;
        self.current = Some(Current {
            offer_id: offer.offer_id,
            creature,
            rescued_from,
            boss,
            challenge: offer.band == crate::fairness::Band::Explore,
        });
        Ok(Some(SquadOffer {
            offer,
            rescued_from,
            boss,
        }))
    }

    pub fn answer_balloon(
        &mut self,
        offer_id: u32,
        index: usize,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<SquadVerdict, SessionError> {
        self.check_current(offer_id)?;
        let v = self
            .session
            .answer_balloon(offer_id, index, time_ms, now_ms)?;
        Ok(self.after_player(v, now_ms))
    }

    pub fn answer_orb(
        &mut self,
        offer_id: u32,
        crystals: &[usize],
        time_ms: f64,
        now_ms: f64,
    ) -> Result<SquadVerdict, SessionError> {
        self.check_current(offer_id)?;
        let v = self
            .session
            .answer_orb(offer_id, crystals, time_ms, now_ms)?;
        Ok(self.after_player(v, now_ms))
    }

    fn check_current(&self, offer_id: u32) -> Result<(), SessionError> {
        match &self.current {
            Some(c) if c.offer_id == offer_id => Ok(()),
            _ => Err(SessionError::UnknownOffer(offer_id)),
        }
    }

    fn after_player(&mut self, verdict: Verdict, now: f64) -> SquadVerdict {
        let cur = self.current.as_ref().expect("checked");
        let (creature, rescued_from, boss, challenge) =
            (cur.creature, cur.rescued_from, cur.boss, cur.challenge);
        self.player
            .answered(verdict.attempt, verdict.correct, challenge);
        self.player.points += verdict.points;
        self.last_player_at = now;
        let mut out = SquadVerdict {
            verdict: verdict.clone(),
            escaped_to: None,
            crystal_hit: false,
            boss_folded: false,
        };
        if verdict.retry_allowed {
            return out;
        }
        self.current = None;
        if verdict.correct {
            self.player_correct_at.push_back(now);
            if rescued_from.is_some() {
                self.player.saves += 1;
            }
            if self.player.streak > 0 && self.player.streak.is_multiple_of(3) {
                let desk = 1 + self.rng.below(2) as usize;
                self.events.push(SquadEvent::Emote {
                    at_ms: now,
                    desk,
                    emote: Emote::ThumbsUp,
                });
            }
            if boss {
                self.boss_folded = true;
                out.boss_folded = true;
                self.end_boss(now, true);
            }
        } else if boss {
            if self.boss_tries >= BOSS_TRIES {
                self.end_boss(now, false);
            }
        } else {
            let to = self.escape(PLAYER, creature, now);
            out.escaped_to = to;
            out.crystal_hit = to.is_none();
        }
        out
    }

    // ------------------------------------------------------------ desks

    /// Sends a creature that beat desk `from` to the calmest other desk,
    /// or to the crystal on its second escape. Returns the receiving desk.
    fn escape(&mut self, from: usize, c: Creature, at: f64) -> Option<usize> {
        let to = if c.hops >= 1 {
            None
        } else {
            let waiting = [
                self.player_waiting(),
                self.bots[0].waiting(),
                self.bots[1].waiting(),
            ];
            overflow_target(&waiting, from)
        };
        self.send(from, c, to, at);
        to
    }

    fn send(&mut self, from: usize, c: Creature, to: Option<usize>, at: f64) {
        let moved = Creature { hops: c.hops + 1 };
        match to {
            None => self.crystal_hits += 1,
            Some(PLAYER) => self.rescues.push_back((moved, from)),
            Some(d) => self.bots[d - 1].queue.push_back(moved),
        }
        self.events.push(SquadEvent::Escape {
            at_ms: at,
            from,
            to,
        });
    }

    /// Advances match time to `now_ms` and returns what happened, oldest first.
    pub fn tick(&mut self, now_ms: f64) -> Vec<SquadEvent> {
        while let Some(at) = self.next_due() {
            if at > now_ms {
                break;
            }
            self.step(at);
        }
        std::mem::take(&mut self.events)
    }

    /// Earliest scheduled moment, if any.
    fn next_due(&self) -> Option<f64> {
        let mut due = f64::INFINITY;
        match self.phase {
            Phase::Ready | Phase::Done => return None,
            Phase::Break { until_ms, .. } => due = until_ms,
            Phase::Boss => {
                if self.boss_parts < BOSS_PART_MS.len() {
                    due = self.boss_start + BOSS_PART_MS[self.boss_parts];
                }
            }
            Phase::Wave { .. } => {
                for b in &self.bots {
                    due = due.min(b.next_spawn);
                    match &b.work {
                        Some(w) => due = due.min(w.done_at),
                        None if !b.queue.is_empty() => due = due.min(b.free_at),
                        None => {}
                    }
                }
                if self.wave_over() {
                    return Some(self.wave_end_time());
                }
            }
        }
        due.is_finite().then_some(due)
    }

    fn wave_over(&self) -> bool {
        self.player_share_done()
            && self.current.is_none()
            && self.rescues.is_empty()
            && self
                .bots
                .iter()
                .all(|b| b.work.is_none() && b.queue.is_empty())
    }

    /// The wave ends once the last desk has finished folding.
    fn wave_end_time(&self) -> f64 {
        self.bots
            .iter()
            .map(|b| b.free_at)
            .fold(self.wave_start.max(self.last_player_at), f64::max)
    }

    fn step(&mut self, at: f64) {
        match self.phase {
            Phase::Break {
                next_wave: Some(w), ..
            } => self.begin_wave(w, at),
            Phase::Break {
                next_wave: None, ..
            } => {
                self.phase = Phase::Boss;
                self.boss_start = at;
                self.events.push(SquadEvent::BossStart { at_ms: at });
            }
            Phase::Boss => {
                let desk = 1 + self.boss_parts;
                self.boss_parts += 1;
                self.events.push(SquadEvent::BossPart { at_ms: at, desk });
            }
            Phase::Wave { wave } => {
                if self.wave_over() {
                    self.events.push(SquadEvent::WaveEnd { at_ms: at, wave });
                    for d in [1, 2] {
                        self.events.push(SquadEvent::Emote {
                            at_ms: at,
                            desk: d,
                            emote: Emote::Clap,
                        });
                    }
                    let next_wave = (wave + 1 < self.cfg.waves.len()).then_some(wave + 1);
                    self.phase = Phase::Break {
                        next_wave,
                        until_ms: at + BREAK_MS,
                    };
                    return;
                }
                for d in 0..2 {
                    self.step_bot(d, at);
                }
                self.maybe_help(at);
            }
            Phase::Ready | Phase::Done => {}
        }
    }

    fn step_bot(&mut self, d: usize, at: f64) {
        let desk = d + 1;
        // A creature arrives.
        if self.bots[d].next_spawn <= at {
            let share_done = self.player_share_done();
            while self
                .player_correct_at
                .front()
                .is_some_and(|t| *t < at - 60000.0)
            {
                self.player_correct_at.pop_front();
            }
            let player_correct_60s = self.player_correct_at.len() as u32;
            let spawning = !share_done
                && self.bots[d].queue.len() + usize::from(self.bots[d].work.is_some())
                    < BOT_QUEUE_CAP;
            if spawning {
                self.bots[d].queue.push_back(Creature { hops: 0 });
                self.events.push(SquadEvent::BotSpawn { at_ms: at, desk });
            }
            let b = &mut self.bots[d];
            while b.correct_at.front().is_some_and(|t| *t < at - 60000.0) {
                b.correct_at.pop_front();
            }
            let elapsed_s = (at - self.wave_start) / 1000.0;
            let own = spawn_per_minute(b.correct_at.len() as u32, elapsed_s, self.session.params());
            // A bot desk is never busier than the player's, so a slow player
            // is not outscored by partners who simply got more creatures.
            let player = spawn_per_minute(player_correct_60s, elapsed_s, self.session.params());
            let rate = own.min(player);
            b.next_spawn = if share_done {
                f64::INFINITY
            } else {
                at + 60000.0 / rate
            };
            let waiting = b.waiting();
            if waiting >= OVERWHELMED_AT && !b.asked_help {
                b.asked_help = true;
                self.events.push(SquadEvent::Emote {
                    at_ms: at,
                    desk,
                    emote: Emote::Help,
                });
            } else if waiting < OVERWHELMED_AT {
                b.asked_help = false;
            }
        }
        // An answer lands.
        if self.bots[d].work.as_ref().is_some_and(|w| w.done_at <= at) {
            self.finish_bot_answer(d, at);
        }
        // The bot picks up the next creature.
        if self.bots[d].work.is_none()
            && self.bots[d].free_at <= at
            && let Some(c) = self.bots[d].queue.pop_front()
        {
            self.start_bot_work(d, c, at);
        }
    }

    fn start_bot_work(&mut self, d: usize, creature: Creature, at: f64) {
        let game = self.game();
        let rating = Rating {
            theta: self.bots[d].theta,
            sigma: self.session.params().sigma_min,
            answers: u32::MAX,
        };
        let Some((item, p)) = self.session.bot_item(game, rating, &mut self.rng) else {
            // No item for this game: the creature goes on to the next desk, reported.
            self.escape(d + 1, creature, at);
            return;
        };
        let choices = (game == GameType::BalloonBurst).then_some(4);
        let (_, ms) = bot_answer(
            self.bots[d].theta,
            item.b,
            game,
            choices,
            self.cfg.session.expected_answer_ms,
            &mut self.rng,
        );
        let scripted = matches!(self.phase, Phase::Wave { wave: 1 })
            && !self.scripted_done
            && at - self.wave_start >= SCRIPT_ESCAPE_AFTER_MS
            && creature.hops == 0;
        if scripted {
            self.scripted_done = true;
        }
        self.events.push(SquadEvent::BotWorking {
            at_ms: at,
            desk: d + 1,
            prompt: item.prompt.en.clone(),
        });
        self.bots[d].work = Some(Work {
            creature,
            b: item.b,
            p,
            attempt: 1,
            done_at: at + BOT_READ_MS + ms,
            answer_ms: ms,
            answer_text: item
                .answer
                .as_ref()
                .map(|a| a.text.clone())
                .unwrap_or_default(),
            forced_escape: scripted,
        });
    }

    fn finish_bot_answer(&mut self, d: usize, at: f64) {
        let game = self.game();
        let mut w = self.bots[d].work.take().expect("checked");
        let choices = (game == GameType::BalloonBurst).then_some(4);
        let (mut outcome, retry_ms) = bot_answer(
            self.bots[d].theta,
            w.b,
            game,
            choices,
            self.cfg.session.expected_answer_ms * 0.6,
            &mut self.rng,
        );
        if w.forced_escape {
            outcome = Outcome::Wrong;
        }
        let correct = outcome == Outcome::Correct;
        let ratio = w.answer_ms / self.cfg.session.expected_answer_ms;
        let bot = &mut self.bots[d];
        let pts = points(
            w.p,
            outcome,
            w.attempt,
            Some(ratio),
            bot.tally.streak,
            self.session.params(),
        );
        bot.tally.points += pts;
        bot.tally.answered(w.attempt, correct, false);
        self.events.push(SquadEvent::BotAnswer {
            at_ms: at,
            desk: d + 1,
            correct,
            attempt: w.attempt,
            points: pts,
            answer_text: w.answer_text.clone(),
        });
        if correct {
            let bot = &mut self.bots[d];
            bot.correct_at.push_back(at);
            if w.creature.hops > 0 {
                bot.tally.saves += 1;
            }
            bot.free_at = at + BOT_FOLD_MS;
        } else if w.attempt == 1 {
            w.attempt = 2;
            w.done_at = at + retry_ms;
            w.answer_ms = retry_ms;
            self.bots[d].work = Some(w);
        } else {
            self.bots[d].free_at = at + BOT_FOLD_MS;
            if w.forced_escape {
                self.send(d + 1, w.creature, Some(PLAYER), at);
            } else {
                self.escape(d + 1, w.creature, at);
            }
        }
    }

    /// When the player's desk piles up, the calmer bot folds one waiting
    /// creature for them, at most once per cooldown.
    fn maybe_help(&mut self, at: f64) {
        let waiting = self.player_waiting();
        if self.rescues.is_empty()
            || !may_send_help_orb(
                waiting,
                OVERWHELMED_AT,
                (at - self.last_help) / 1000.0,
                self.session.params(),
            )
        {
            return;
        }
        let d = if self.bots[0].waiting() <= self.bots[1].waiting() {
            0
        } else {
            1
        };
        self.rescues.pop_back();
        self.bots[d].tally.saves += 1;
        self.last_help = at;
        self.events.push(SquadEvent::HelpOrb {
            at_ms: at,
            from: d + 1,
            to: PLAYER,
        });
    }

    fn end_boss(&mut self, at: f64, folded: bool) {
        self.events.push(SquadEvent::BossEnd { at_ms: at, folded });
        self.events.push(SquadEvent::MatchEnd { at_ms: at });
        self.phase = Phase::Done;
    }

    // ------------------------------------------------------------ reading

    pub fn view(&self) -> SquadView {
        let mut desks = vec![DeskView {
            name: self.cfg.session.player_id.clone(),
            bot: false,
            waiting: self.player_waiting(),
            points: self.player.points,
            saves: self.player.saves,
        }];
        for b in &self.bots {
            desks.push(DeskView {
                name: b.name.clone(),
                bot: true,
                waiting: b.waiting(),
                points: b.tally.points,
                saves: b.tally.saves,
            });
        }
        let saves = desks.iter().map(|d| d.saves).sum();
        SquadView {
            phase: self.phase,
            waves: self.cfg.waves.len(),
            team_points: desks.iter().map(|d| d.points).sum(),
            desks,
            crystal_hits: self.crystal_hits,
            saves,
            saves_goal: self.cfg.saves_goal,
        }
    }

    /// End-of-match summary. Every player, bots included, gets one different highlight.
    pub fn recap(&self) -> Recap {
        let view = self.view();
        let start = Rating::start(self.cfg.session.grade, self.session.params()).theta;
        let skills: Vec<SkillChange> = self
            .session
            .ratings()
            .iter()
            .map(|(k, r)| SkillChange {
                skill: k.clone(),
                theta_before: start,
                theta_after: r.theta,
            })
            .collect();
        let gain = if skills.is_empty() {
            0.0
        } else {
            skills
                .iter()
                .map(|s| s.theta_after - s.theta_before)
                .sum::<f64>()
                / skills.len() as f64
        };
        let stats = |t: &Tally, theta_gain: f64| MatchStats {
            saves: t.saves,
            theta_gain,
            accuracy: if t.first_tries == 0 {
                0.0
            } else {
                t.first_correct as f64 / t.first_tries as f64
            },
            best_streak: t.best_streak,
            challenge_tries: t.challenge_tries,
        };
        let all = [
            stats(&self.player, gain),
            stats(&self.bots[0].tally, 0.0),
            stats(&self.bots[1].tally, 0.0),
        ];
        let highlights = assign_highlights(&all);
        let players = view
            .desks
            .iter()
            .enumerate()
            .map(|(i, d)| PlayerRecap {
                name: d.name.clone(),
                bot: d.bot,
                points: d.points,
                highlight: highlights.as_ref().map(|h| h[i]),
            })
            .collect();
        let crystals_safe = self.crystal_hits == 0;
        Recap {
            stars: team_stars(
                crystals_safe,
                self.boss_folded,
                view.saves,
                self.cfg.saves_goal,
            ),
            crystals_safe,
            boss_folded: self.boss_folded,
            saves: view.saves,
            saves_goal: self.cfg.saves_goal,
            team_points: view.team_points,
            players,
            skills,
        }
    }

    #[doc(hidden)]
    pub fn answer_key(&self, offer_id: u32) -> Option<Vec<usize>> {
        self.session.answer_key(offer_id)
    }

    pub fn drain_answer_events(&mut self) -> Vec<crate::session::AnswerEvent> {
        self.session.drain_events()
    }
}
