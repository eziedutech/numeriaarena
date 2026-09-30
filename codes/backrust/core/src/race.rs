//! Race: the player against two rival bots, each at their own desk.
//!
//! Every desk meets the same number of creatures per wave, so the race is
//! about points, not about who was handed more questions. Points come from the
//! same formula for everyone: harder items for one's own level are worth more,
//! and speed and streaks add a bonus. Each wave the bots are re-drawn near the
//! player's current level, so the race stays close in both directions. A
//! creature missed twice goes home without points. The last round is a boss
//! creature per desk, worth double.
//!
//! All timing uses the `now_ms` the caller passes, and every scheduled step is
//! processed at its own time, so results do not depend on how often `tick`
//! runs. The server can run the same code for Class Match.

use serde::{Deserialize, Serialize};

use crate::fairness::{
    Band, FairnessParams, GameType, Highlight, MatchStats, Outcome, Rating, assign_highlights,
    bot_answer, bot_theta, points,
};
use crate::rng::Rng;
use crate::session::{Offer, SessionConfig, SessionError, SoloSession, Verdict};
use crate::template::ItemTemplate;

/// Desk index of the player; the bots sit at 1 and 2.
pub const PLAYER: usize = 0;
/// A bot looks at a new creature this long before its answer clock starts.
const BOT_READ_MS: f64 = 1200.0;
/// Walk-in and fold-home animations between two of a bot's creatures.
const BOT_BETWEEN_MS: f64 = 2500.0;
/// Once the player has finished a wave, waiting bots speed up to this pace.
const HURRY_MS: f64 = 700.0;
/// Pause between waves, for the wave banner.
const BREAK_MS: f64 = 4000.0;
/// Boss creatures are worth this many times their points.
const BOSS_MULTIPLIER: u32 = 2;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WaveSpec {
    pub game: GameType,
    /// Creatures every desk meets in this wave.
    pub creatures: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RaceConfig {
    #[serde(flatten)]
    pub session: SessionConfig,
    #[serde(default = "default_waves")]
    pub waves: Vec<WaveSpec>,
    #[serde(default = "default_boss_game")]
    pub boss_game: GameType,
    #[serde(default = "default_bot_names")]
    pub bot_names: [String; 2],
}

fn default_waves() -> Vec<WaveSpec> {
    vec![
        WaveSpec {
            game: GameType::BalloonBurst,
            creatures: 5,
        },
        WaveSpec {
            game: GameType::OrbForge,
            creatures: 5,
        },
        WaveSpec {
            game: GameType::BalloonBurst,
            creatures: 5,
        },
    ]
}
fn default_boss_game() -> GameType {
    GameType::BalloonBurst
}
fn default_bot_names() -> [String; 2] {
    ["Clip".into(), "Crease".into()]
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Emote {
    ThumbsUp,
    Clap,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RaceEvent {
    WaveStart {
        at_ms: f64,
        wave: usize,
        game: GameType,
    },
    /// A bot started on a creature; `prompt` is shown in its window.
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
    },
    /// A desk met every creature of the current round.
    DeskDone {
        at_ms: f64,
        desk: usize,
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
    /// Pause before `next_wave`; `None` means the boss round comes next.
    Break {
        next_wave: Option<usize>,
        until_ms: f64,
    },
    Boss,
    Done,
}

#[derive(Clone, Debug, Serialize)]
pub struct RaceOffer {
    #[serde(flatten)]
    pub offer: Offer,
    pub boss: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct RaceVerdict {
    #[serde(flatten)]
    pub verdict: Verdict,
    /// Points this answer added to the player's race score (doubled on a boss).
    pub race_points: u32,
    pub boss: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct DeskView {
    pub name: String,
    pub bot: bool,
    pub points: u32,
    /// Creatures met in the current round, and how many the round has.
    pub met: u32,
    pub of: u32,
    /// 1 for the leader; ties share a place.
    pub place: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct RaceView {
    #[serde(flatten)]
    pub phase: Phase,
    pub waves: usize,
    pub desks: Vec<DeskView>,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlayerRecap {
    pub name: String,
    pub bot: bool,
    pub points: u32,
    pub place: u32,
    /// 1 to 3 from first-try accuracy.
    pub stars: u8,
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
    /// Player first, then the bots, in desk order.
    pub players: Vec<PlayerRecap>,
    pub skills: Vec<SkillChange>,
}

#[derive(Clone, Debug, Default)]
struct Tally {
    points: u32,
    first_tries: u32,
    first_correct: u32,
    streak: u32,
    best_streak: u32,
    challenge_tries: u32,
    retries_won: u32,
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
        } else if correct {
            self.retries_won += 1;
        }
        if correct {
            self.streak += 1;
            self.best_streak = self.best_streak.max(self.streak);
        } else {
            self.streak = 0;
        }
    }

    fn accuracy(&self) -> f64 {
        if self.first_tries == 0 {
            0.0
        } else {
            self.first_correct as f64 / self.first_tries as f64
        }
    }

    /// Personal stars: 3 from 80% right on the first try, 2 from 60%.
    fn stars(&self) -> u8 {
        match self.accuracy() {
            a if a >= 0.8 => 3,
            a if a >= 0.6 => 2,
            _ => 1,
        }
    }
}

#[derive(Clone, Debug)]
struct Work {
    b: f64,
    p: f64,
    attempt: u32,
    done_at: f64,
    answer_ms: f64,
    challenge: bool,
}

struct Bot {
    name: String,
    theta: f64,
    work: Option<Work>,
    /// When the bot may pick up its next creature.
    free_at: f64,
    met: u32,
    announced_done: bool,
    tally: Tally,
}

struct Current {
    offer_id: u32,
    boss: bool,
    challenge: bool,
}

pub struct RaceMatch {
    cfg: RaceConfig,
    session: SoloSession,
    rng: Rng,
    phase: Phase,
    bots: [Bot; 2],
    current: Option<Current>,
    /// Creatures the player met in the current round.
    met: u32,
    player_done_at: Option<f64>,
    player: Tally,
    last_player_at: f64,
    events: Vec<RaceEvent>,
}

impl RaceMatch {
    pub fn new(
        templates: Vec<ItemTemplate>,
        cfg: RaceConfig,
        params: FairnessParams,
    ) -> Result<(Self, Vec<String>), SessionError> {
        let (session, rejected) = SoloSession::new(templates, cfg.session.clone(), params)?;
        for w in &cfg.waves {
            session.check_game(w.game)?;
        }
        session.check_game(cfg.boss_game)?;
        let rng = Rng::new(cfg.session.seed ^ 0x7ace_b075);
        let bot = |name: &String| Bot {
            name: name.clone(),
            theta: 0.0,
            work: None,
            free_at: f64::INFINITY,
            met: 0,
            announced_done: false,
            tally: Tally::default(),
        };
        let bots = [bot(&cfg.bot_names[0]), bot(&cfg.bot_names[1])];
        Ok((
            RaceMatch {
                cfg,
                session,
                rng,
                phase: Phase::Ready,
                bots,
                current: None,
                met: 0,
                player_done_at: None,
                player: Tally::default(),
                last_player_at: 0.0,
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
            self.begin_round(Phase::Wave { wave: 0 }, now_ms);
        }
    }

    fn player_theta(&self) -> f64 {
        let r = self.session.ratings();
        if r.is_empty() {
            return Rating::start(self.cfg.session.grade, self.session.params()).theta;
        }
        r.values().map(|x| x.theta).sum::<f64>() / r.len() as f64
    }

    /// Creatures per desk in the current round.
    fn round_size(&self) -> u32 {
        match self.phase {
            Phase::Wave { wave } => self.cfg.waves[wave].creatures,
            Phase::Boss => 1,
            _ => 0,
        }
    }

    fn game(&self) -> GameType {
        match self.phase {
            Phase::Wave { wave } => self.cfg.waves[wave].game,
            _ => self.cfg.boss_game,
        }
    }

    fn begin_round(&mut self, phase: Phase, at: f64) {
        self.phase = phase;
        self.met = 0;
        self.player_done_at = None;
        // Rivals follow the player's current level, re-drawn each round, so
        // the race stays close whichever way the player's answers go.
        let theta = self.player_theta();
        for i in 0..2 {
            let b = &mut self.bots[i];
            b.theta = bot_theta(&[theta], self.session.params(), &mut self.rng);
            b.met = 0;
            b.work = None;
            b.announced_done = false;
            b.free_at = at + 900.0 + 700.0 * i as f64;
        }
        match phase {
            Phase::Wave { wave } => self.events.push(RaceEvent::WaveStart {
                at_ms: at,
                wave,
                game: self.cfg.waves[wave].game,
            }),
            Phase::Boss => self.events.push(RaceEvent::BossStart { at_ms: at }),
            _ => {}
        }
    }

    // ------------------------------------------------------------ player

    /// Next creature for the player's desk, or `None` when the player has met
    /// every creature of the round (or between rounds).
    pub fn player_next(&mut self) -> Result<Option<RaceOffer>, SessionError> {
        if self.current.is_some() || !matches!(self.phase, Phase::Wave { .. } | Phase::Boss) {
            return Ok(None);
        }
        if self.met >= self.round_size() {
            return Ok(None);
        }
        self.met += 1;
        let boss = self.phase == Phase::Boss;
        let offer = self.session.next(self.game())?;
        self.current = Some(Current {
            offer_id: offer.offer_id,
            boss,
            challenge: offer.band == Band::Explore,
        });
        Ok(Some(RaceOffer { offer, boss }))
    }

    pub fn answer_balloon(
        &mut self,
        offer_id: u32,
        index: usize,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<RaceVerdict, SessionError> {
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
    ) -> Result<RaceVerdict, SessionError> {
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

    fn after_player(&mut self, verdict: Verdict, now: f64) -> RaceVerdict {
        let cur = self.current.as_ref().expect("checked");
        let (boss, challenge) = (cur.boss, cur.challenge);
        let race_points = verdict.points * if boss { BOSS_MULTIPLIER } else { 1 };
        self.player
            .answered(verdict.attempt, verdict.correct, challenge);
        self.player.points += race_points;
        self.last_player_at = now;
        if !verdict.retry_allowed {
            self.current = None;
            if self.met >= self.round_size() {
                self.player_done_at = Some(now);
                self.events.push(RaceEvent::DeskDone {
                    at_ms: now,
                    desk: PLAYER,
                });
            }
        }
        RaceVerdict {
            verdict,
            race_points,
            boss,
        }
    }

    // ------------------------------------------------------------ time

    /// Advances match time to `now_ms` and returns what happened, oldest first.
    pub fn tick(&mut self, now_ms: f64) -> Vec<RaceEvent> {
        while let Some(at) = self.next_due() {
            if at > now_ms {
                break;
            }
            self.step(at);
        }
        std::mem::take(&mut self.events)
    }

    fn player_finished(&self) -> bool {
        self.current.is_none() && self.met >= self.round_size()
    }

    fn round_over(&self) -> bool {
        self.player_finished()
            && self
                .bots
                .iter()
                .all(|b| b.met >= self.round_size() && b.work.is_none())
    }

    fn next_due(&self) -> Option<f64> {
        match self.phase {
            Phase::Ready | Phase::Done => None,
            Phase::Break { until_ms, .. } => Some(until_ms),
            Phase::Wave { .. } | Phase::Boss => {
                if self.round_over() {
                    let end = self
                        .bots
                        .iter()
                        .map(|b| b.free_at.min(1e300))
                        .fold(self.last_player_at, f64::max);
                    return Some(end);
                }
                let size = self.round_size();
                self.bots
                    .iter()
                    .filter_map(|b| match &b.work {
                        Some(w) => Some(w.done_at),
                        None if b.met < size => Some(b.free_at),
                        None => None,
                    })
                    .reduce(f64::min)
            }
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
            Phase::Wave { wave } if self.round_over() => {
                self.events.push(RaceEvent::WaveEnd { at_ms: at, wave });
                let next_wave = (wave + 1 < self.cfg.waves.len()).then_some(wave + 1);
                self.phase = Phase::Break {
                    next_wave,
                    until_ms: at + BREAK_MS,
                };
            }
            Phase::Boss if self.round_over() => {
                let leader = self.leader_desk();
                if leader != PLAYER {
                    // The winning rival applauds; the others give a thumbs up.
                    self.events.push(RaceEvent::Emote {
                        at_ms: at,
                        desk: leader,
                        emote: Emote::Clap,
                    });
                }
                for d in [1, 2] {
                    if d != leader {
                        self.events.push(RaceEvent::Emote {
                            at_ms: at,
                            desk: d,
                            emote: Emote::ThumbsUp,
                        });
                    }
                }
                self.events.push(RaceEvent::MatchEnd { at_ms: at });
                self.phase = Phase::Done;
            }
            Phase::Wave { .. } | Phase::Boss => {
                for d in 0..2 {
                    self.step_bot(d, at);
                }
            }
            Phase::Ready | Phase::Done => {}
        }
    }

    fn step_bot(&mut self, d: usize, at: f64) {
        if self.bots[d].work.as_ref().is_some_and(|w| w.done_at <= at) {
            self.finish_bot_answer(d, at);
        }
        let size = self.round_size();
        if self.bots[d].work.is_none() && self.bots[d].met < size && self.bots[d].free_at <= at {
            self.start_bot_work(d, at);
        }
    }

    fn start_bot_work(&mut self, d: usize, at: f64) {
        let game = self.game();
        let rating = Rating {
            theta: self.bots[d].theta,
            sigma: self.session.params().sigma_min,
            answers: u32::MAX,
        };
        self.bots[d].met += 1;
        let Some((item, p)) = self.session.bot_item(game, rating, &mut self.rng) else {
            // Checked in `new`; a template that stops instantiating ends this creature.
            self.bots[d].free_at = at + BOT_BETWEEN_MS;
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
        // Once the player is done, rivals finish their round quickly instead of keeping them waiting.
        let (read, think) = if self.player_finished() {
            (0.0, HURRY_MS)
        } else {
            (BOT_READ_MS, ms)
        };
        self.events.push(RaceEvent::BotWorking {
            at_ms: at,
            desk: d + 1,
            prompt: item.prompt.en.clone(),
        });
        self.bots[d].work = Some(Work {
            b: item.b,
            p,
            attempt: 1,
            done_at: at + read + think,
            answer_ms: ms,
            challenge: false,
        });
    }

    fn finish_bot_answer(&mut self, d: usize, at: f64) {
        let game = self.game();
        let mut w = self.bots[d].work.take().expect("checked");
        let choices = (game == GameType::BalloonBurst).then_some(4);
        let (outcome, retry_ms) = bot_answer(
            self.bots[d].theta,
            w.b,
            game,
            choices,
            self.cfg.session.expected_answer_ms * 0.6,
            &mut self.rng,
        );
        let correct = outcome == Outcome::Correct;
        let boss = self.phase == Phase::Boss;
        let ratio = w.answer_ms / self.cfg.session.expected_answer_ms;
        let bot = &mut self.bots[d];
        let pts = points(
            w.p,
            outcome,
            w.attempt,
            Some(ratio),
            bot.tally.streak,
            self.session.params(),
        ) * if boss { BOSS_MULTIPLIER } else { 1 };
        bot.tally.points += pts;
        bot.tally.answered(w.attempt, correct, w.challenge);
        self.events.push(RaceEvent::BotAnswer {
            at_ms: at,
            desk: d + 1,
            correct,
            attempt: w.attempt,
            points: pts,
        });
        let hurry = self.player_finished();
        if !correct && w.attempt == 1 {
            w.attempt = 2;
            w.done_at = at + if hurry { HURRY_MS } else { retry_ms };
            w.answer_ms = retry_ms;
            self.bots[d].work = Some(w);
            return;
        }
        let bot = &mut self.bots[d];
        bot.free_at = at + if hurry { HURRY_MS } else { BOT_BETWEEN_MS };
        if bot.tally.streak > 0 && bot.tally.streak.is_multiple_of(3) {
            self.events.push(RaceEvent::Emote {
                at_ms: at,
                desk: d + 1,
                emote: Emote::ThumbsUp,
            });
        }
        let size = self.round_size();
        let bot = &mut self.bots[d];
        if bot.met >= size && !bot.announced_done {
            bot.announced_done = true;
            self.events.push(RaceEvent::DeskDone {
                at_ms: at,
                desk: d + 1,
            });
        }
    }

    // ------------------------------------------------------------ reading

    fn desk_points(&self) -> [u32; 3] {
        [
            self.player.points,
            self.bots[0].tally.points,
            self.bots[1].tally.points,
        ]
    }

    /// Place of each desk: 1 for the most points; ties share a place.
    fn places(&self) -> [u32; 3] {
        let pts = self.desk_points();
        let mut out = [1u32; 3];
        for i in 0..3 {
            out[i] = 1 + pts.iter().filter(|p| **p > pts[i]).count() as u32;
        }
        out
    }

    fn leader_desk(&self) -> usize {
        let pts = self.desk_points();
        (0..3)
            .max_by_key(|i| (pts[*i], std::cmp::Reverse(*i)))
            .unwrap_or(0)
    }

    pub fn view(&self) -> RaceView {
        let places = self.places();
        let size = self.round_size();
        let mut desks = vec![DeskView {
            name: self.cfg.session.player_id.clone(),
            bot: false,
            points: self.player.points,
            met: self.met,
            of: size,
            place: places[0],
        }];
        for (i, b) in self.bots.iter().enumerate() {
            desks.push(DeskView {
                name: b.name.clone(),
                bot: true,
                points: b.tally.points,
                met: b.met,
                of: size,
                place: places[i + 1],
            });
        }
        RaceView {
            phase: self.phase,
            waves: self.cfg.waves.len(),
            desks,
        }
    }

    /// End-of-match summary: places, personal stars, one different highlight each.
    pub fn recap(&self) -> Recap {
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
            // In a race nobody rescues; a won second try is the closest thing to a save.
            saves: t.retries_won,
            theta_gain,
            accuracy: t.accuracy(),
            best_streak: t.best_streak,
            challenge_tries: t.challenge_tries,
        };
        let all = [
            stats(&self.player, gain),
            stats(&self.bots[0].tally, 0.0),
            stats(&self.bots[1].tally, 0.0),
        ];
        let highlights = assign_highlights(&all);
        let places = self.places();
        let tallies = [&self.player, &self.bots[0].tally, &self.bots[1].tally];
        let names = [
            self.cfg.session.player_id.clone(),
            self.bots[0].name.clone(),
            self.bots[1].name.clone(),
        ];
        let players = (0..3)
            .map(|i| PlayerRecap {
                name: names[i].clone(),
                bot: i != PLAYER,
                points: tallies[i].points,
                place: places[i],
                stars: tallies[i].stars(),
                highlight: highlights.as_ref().map(|h| h[i]),
            })
            .collect();
        Recap { players, skills }
    }

    #[doc(hidden)]
    pub fn answer_key(&self, offer_id: u32) -> Option<Vec<usize>> {
        self.session.answer_key(offer_id)
    }

    pub fn drain_answer_events(&mut self) -> Vec<crate::session::AnswerEvent> {
        self.session.drain_events()
    }
}
