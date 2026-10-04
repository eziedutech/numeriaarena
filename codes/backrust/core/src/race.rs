//! Race: the player against two rival bots, each at their own desk.
//!
//! Every round lasts a fixed time (a minute per wave, then a short boss
//! round worth double) and creatures keep coming at every desk until the
//! clock runs out, so the race rewards answering well and steadily, and a
//! session always takes the same time. Points come from the same formula for
//! everyone: harder items for one's own level are worth more, and speed and
//! streaks add a bonus. Each round the bots are re-drawn near the player's
//! current level and answer pace, so the race stays close in both directions
//! for a quick or a careful player. A creature
//! missed twice goes home without points; one still open when time runs out
//! goes home too.
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
use crate::template::{I18n, ItemTemplate};

/// Desk index of the player; the bots sit at 1 and 2.
pub const PLAYER: usize = 0;
/// A bot looks at a new creature this long before its answer clock starts.
pub(crate) const BOT_READ_MS: f64 = 1200.0;
/// Walk-in and fold-home animations between two of a bot's creatures.
pub(crate) const BOT_BETWEEN_MS: f64 = 2500.0;
/// Pause between rounds, for the round banner.
pub(crate) const BREAK_MS: f64 = 4000.0;
/// Boss creatures are worth this many times their points.
pub(crate) const BOSS_MULTIPLIER: u32 = 2;
/// No new creature starts this close to the end of a round.
pub(crate) const LAST_START_MS: f64 = 1500.0;
/// Rivals' answer pace follows the player's, within these bounds (ms).
pub(crate) const PACE_MIN_MS: f64 = 3000.0;
pub(crate) const PACE_MAX_MS: f64 = 15000.0;
/// Each round a rival's pace is the player's times a factor in this range.
pub(crate) const PACE_SPREAD: (f64, f64) = (0.85, 1.15);

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WaveSpec {
    pub game: GameType,
    /// How long the wave lasts; creatures keep coming until then.
    pub seconds: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RaceConfig {
    #[serde(flatten)]
    pub session: SessionConfig,
    #[serde(default = "default_waves")]
    pub waves: Vec<WaveSpec>,
    #[serde(default = "default_boss_game")]
    pub boss_game: GameType,
    #[serde(default = "default_boss_seconds")]
    pub boss_seconds: f64,
    #[serde(default = "default_bot_names")]
    pub bot_names: [String; 2],
}

pub(crate) fn default_waves() -> Vec<WaveSpec> {
    vec![
        WaveSpec {
            game: GameType::BalloonBurst,
            seconds: 60.0,
        },
        WaveSpec {
            game: GameType::OrbForge,
            seconds: 60.0,
        },
        WaveSpec {
            game: GameType::BalloonBurst,
            seconds: 60.0,
        },
    ]
}
pub(crate) fn default_boss_game() -> GameType {
    GameType::BalloonBurst
}
pub(crate) fn default_boss_seconds() -> f64 {
    20.0
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
        ends_at_ms: f64,
    },
    /// A bot started on a creature; `prompt` is shown in its window, in the player's language.
    BotWorking {
        at_ms: f64,
        desk: usize,
        prompt: I18n,
    },
    BotAnswer {
        at_ms: f64,
        desk: usize,
        correct: bool,
        attempt: u32,
        points: u32,
    },
    Emote {
        at_ms: f64,
        desk: usize,
        emote: Emote,
    },
    /// The round's clock ran out. `player_cut` is set when the player's open
    /// creature was sent home unanswered.
    TimeUp {
        at_ms: f64,
        wave: Option<usize>,
        player_cut: bool,
    },
    BossStart {
        at_ms: f64,
        ends_at_ms: f64,
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
    /// Creatures folded (answered right) in the whole race.
    pub folded: u32,
    /// 1 for the leader; ties share a place.
    pub place: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct RaceView {
    #[serde(flatten)]
    pub phase: Phase,
    pub waves: usize,
    /// Every round in order, the boss last: what the race card lists.
    pub plan: Vec<RoundPlan>,
    /// When the current round's clock runs out, on the caller's clock.
    pub ends_at_ms: Option<f64>,
    pub desks: Vec<DeskView>,
}

/// One round of the race as planned: its game, length, and whether it is the boss.
#[derive(Clone, Debug, Serialize)]
pub struct RoundPlan {
    pub game: GameType,
    pub seconds: f64,
    pub boss: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlayerRecap {
    pub name: String,
    pub bot: bool,
    pub points: u32,
    pub folded: u32,
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
pub(crate) struct Tally {
    pub(crate) points: u32,
    pub(crate) folded: u32,
    pub(crate) first_tries: u32,
    pub(crate) first_correct: u32,
    pub(crate) streak: u32,
    pub(crate) best_streak: u32,
    pub(crate) challenge_tries: u32,
    pub(crate) retries_won: u32,
}

impl Tally {
    pub(crate) fn answered(&mut self, attempt: u32, correct: bool, challenge: bool) {
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
            self.folded += 1;
            self.streak += 1;
            self.best_streak = self.best_streak.max(self.streak);
        } else {
            self.streak = 0;
        }
    }

    pub(crate) fn accuracy(&self) -> f64 {
        if self.first_tries == 0 {
            0.0
        } else {
            self.first_correct as f64 / self.first_tries as f64
        }
    }

    /// Personal stars: 3 from 80% right on the first try, 2 from 60%.
    pub(crate) fn stars(&self) -> u8 {
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
}

struct Bot {
    name: String,
    theta: f64,
    /// Expected answer time this round, following the player's pace.
    pace_ms: f64,
    work: Option<Work>,
    /// When the bot may pick up its next creature.
    free_at: f64,
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
    /// When the current round's clock runs out.
    ends_at: f64,
    /// Latest time the caller reported.
    now: f64,
    player: Tally,
    /// First-try answer times of the player in the current round (ms).
    player_times: Vec<f64>,
    /// The player's typical answer time, from the last round they answered in.
    player_pace_ms: Option<f64>,
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
            pace_ms: 0.0,
            work: None,
            free_at: f64::INFINITY,
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
                ends_at: f64::INFINITY,
                now: 0.0,
                player: Tally::default(),
                player_times: Vec::new(),
                player_pace_ms: None,
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
            self.now = now_ms;
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

    fn in_round(&self) -> bool {
        matches!(self.phase, Phase::Wave { .. } | Phase::Boss)
    }

    fn game(&self) -> GameType {
        match self.phase {
            Phase::Wave { wave } => self.cfg.waves[wave].game,
            _ => self.cfg.boss_game,
        }
    }

    fn begin_round(&mut self, phase: Phase, at: f64) {
        self.phase = phase;
        let seconds = match phase {
            Phase::Wave { wave } => self.cfg.waves[wave].seconds,
            _ => self.cfg.boss_seconds,
        };
        self.ends_at = at + seconds * 1000.0;
        // Rivals follow the player's current level and pace, re-drawn each
        // round, so the race stays close whichever way the player's answers go.
        if !self.player_times.is_empty() {
            let mut t = std::mem::take(&mut self.player_times);
            t.sort_by(f64::total_cmp);
            self.player_pace_ms = Some(t[t.len() / 2]);
        }
        let pace = self
            .player_pace_ms
            .unwrap_or(self.cfg.session.expected_answer_ms)
            .clamp(PACE_MIN_MS, PACE_MAX_MS);
        let theta = self.player_theta();
        for i in 0..2 {
            let spread = PACE_SPREAD.0 + (PACE_SPREAD.1 - PACE_SPREAD.0) * self.rng.unit();
            let b = &mut self.bots[i];
            b.pace_ms = pace * spread;
            b.theta = bot_theta(&[theta], self.session.params(), &mut self.rng);
            b.work = None;
            b.free_at = at + 900.0 + 700.0 * i as f64;
        }
        match phase {
            Phase::Wave { wave } => self.events.push(RaceEvent::WaveStart {
                at_ms: at,
                wave,
                game: self.cfg.waves[wave].game,
                ends_at_ms: self.ends_at,
            }),
            Phase::Boss => self.events.push(RaceEvent::BossStart {
                at_ms: at,
                ends_at_ms: self.ends_at,
            }),
            _ => {}
        }
    }

    // ------------------------------------------------------------ player

    /// Next creature for the player's desk, or `None` between rounds, while a
    /// creature is open, or in the last moments of a round.
    pub fn player_next(&mut self) -> Result<Option<RaceOffer>, SessionError> {
        if self.current.is_some() || !self.in_round() || self.now > self.ends_at - LAST_START_MS {
            return Ok(None);
        }
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
        Ok(self.after_player(v, time_ms))
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
        Ok(self.after_player(v, time_ms))
    }

    /// Answers count only for the open creature and only before the round's
    /// clock runs out.
    fn check_current(&self, offer_id: u32) -> Result<(), SessionError> {
        match &self.current {
            Some(c) if c.offer_id == offer_id => Ok(()),
            _ => Err(SessionError::UnknownOffer(offer_id)),
        }
    }

    fn after_player(&mut self, verdict: Verdict, time_ms: f64) -> RaceVerdict {
        let cur = self.current.as_ref().expect("checked");
        let (boss, challenge) = (cur.boss, cur.challenge);
        let race_points = verdict.points * if boss { BOSS_MULTIPLIER } else { 1 };
        if verdict.attempt == 1 {
            self.player_times.push(time_ms);
        }
        self.player
            .answered(verdict.attempt, verdict.correct, challenge);
        self.player.points += race_points;
        if !verdict.retry_allowed {
            self.current = None;
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
        self.now = now_ms.max(self.now);
        std::mem::take(&mut self.events)
    }

    fn next_due(&self) -> Option<f64> {
        match self.phase {
            Phase::Ready | Phase::Done => None,
            Phase::Break { until_ms, .. } => Some(until_ms),
            // The earliest bot step, or the end of the round, whichever comes first.
            Phase::Wave { .. } | Phase::Boss => Some(
                self.bots
                    .iter()
                    .map(|b| b.work.as_ref().map_or(b.free_at, |w| w.done_at))
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
                for d in 0..2 {
                    self.step_bot(d, at);
                }
            }
            Phase::Ready | Phase::Done => {}
        }
    }

    /// The round's clock ran out: open creatures go home without points.
    fn time_up(&mut self, at: f64) {
        let player_cut = if let Some(cur) = self.current.take() {
            self.session.close(cur.offer_id);
            true
        } else {
            false
        };
        for b in &mut self.bots {
            b.work = None;
        }
        let wave = match self.phase {
            Phase::Wave { wave } => Some(wave),
            _ => None,
        };
        self.events.push(RaceEvent::TimeUp {
            at_ms: at,
            wave,
            player_cut,
        });
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

    fn step_bot(&mut self, d: usize, at: f64) {
        if self.bots[d].work.as_ref().is_some_and(|w| w.done_at <= at) {
            self.finish_bot_answer(d, at);
        }
        if self.bots[d].work.is_none() && self.bots[d].free_at <= at {
            if at <= self.ends_at - LAST_START_MS {
                self.start_bot_work(d, at);
            } else {
                // Too late in the round to start another creature.
                self.bots[d].free_at = f64::INFINITY;
            }
        }
    }

    fn start_bot_work(&mut self, d: usize, at: f64) {
        let game = self.game();
        let rating = Rating {
            theta: self.bots[d].theta,
            sigma: self.session.params().sigma_min,
            answers: u32::MAX,
        };
        let Some((item, p)) = self.session.bot_item(game, rating, &mut self.rng) else {
            // Checked in `new`; a template that stops instantiating skips this creature.
            self.bots[d].free_at = at + BOT_BETWEEN_MS;
            return;
        };
        let choices = (game == GameType::BalloonBurst).then_some(4);
        let (_, ms) = bot_answer(
            self.bots[d].theta,
            item.b,
            game,
            choices,
            self.bots[d].pace_ms,
            &mut self.rng,
        );
        self.events.push(RaceEvent::BotWorking {
            at_ms: at,
            desk: d + 1,
            prompt: item.prompt.clone(),
        });
        self.bots[d].work = Some(Work {
            b: item.b,
            p,
            attempt: 1,
            done_at: at + BOT_READ_MS + ms,
            answer_ms: ms,
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
            self.bots[d].pace_ms * 0.6,
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
        bot.tally.answered(w.attempt, correct, false);
        self.events.push(RaceEvent::BotAnswer {
            at_ms: at,
            desk: d + 1,
            correct,
            attempt: w.attempt,
            points: pts,
        });
        if !correct && w.attempt == 1 {
            w.attempt = 2;
            w.done_at = at + retry_ms;
            w.answer_ms = retry_ms;
            self.bots[d].work = Some(w);
            return;
        }
        let bot = &mut self.bots[d];
        bot.free_at = at + BOT_BETWEEN_MS;
        if bot.tally.streak > 0 && bot.tally.streak.is_multiple_of(3) {
            self.events.push(RaceEvent::Emote {
                at_ms: at,
                desk: d + 1,
                emote: Emote::ThumbsUp,
            });
        }
    }

    // ------------------------------------------------------------ reading

    fn tallies(&self) -> [&Tally; 3] {
        [&self.player, &self.bots[0].tally, &self.bots[1].tally]
    }

    /// Place of each desk: 1 for the most points; ties share a place.
    fn places(&self) -> [u32; 3] {
        let pts = self.tallies().map(|t| t.points);
        let mut out = [1u32; 3];
        for i in 0..3 {
            out[i] = 1 + pts.iter().filter(|p| **p > pts[i]).count() as u32;
        }
        out
    }

    fn leader_desk(&self) -> usize {
        let pts = self.tallies().map(|t| t.points);
        (0..3)
            .max_by_key(|i| (pts[*i], std::cmp::Reverse(*i)))
            .unwrap_or(0)
    }

    fn names(&self) -> [String; 3] {
        [
            self.cfg.session.player_id.clone(),
            self.bots[0].name.clone(),
            self.bots[1].name.clone(),
        ]
    }

    pub fn view(&self) -> RaceView {
        let places = self.places();
        let names = self.names();
        let desks = self
            .tallies()
            .iter()
            .enumerate()
            .map(|(i, t)| DeskView {
                name: names[i].clone(),
                bot: i != PLAYER,
                points: t.points,
                folded: t.folded,
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
        RaceView {
            phase: self.phase,
            waves: self.cfg.waves.len(),
            plan,
            ends_at_ms: self.in_round().then_some(self.ends_at),
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
        let tallies = self.tallies();
        let all = [
            stats(tallies[0], gain),
            stats(tallies[1], 0.0),
            stats(tallies[2], 0.0),
        ];
        let highlights = assign_highlights(&all);
        let places = self.places();
        let names = self.names();
        let players = (0..3)
            .map(|i| PlayerRecap {
                name: names[i].clone(),
                bot: i != PLAYER,
                points: tallies[i].points,
                folded: tallies[i].folded,
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
