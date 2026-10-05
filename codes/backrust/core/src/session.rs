//! Solo session: the game loop's decisions for one player, offline.
//!
//! The headset calls `next` for a creature, shows what the offer contains,
//! and reports the player's hand action back. Choosing items, building
//! balloons and crystals, judging answers, points and rating updates all
//! happen here, so the server can run the very same code for Class Match.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::fairness::{
    Band, Candidate, FairnessParams, GameType, Outcome, Rating, Situation, choose, points, update,
};
use crate::format::{NumberFormat, format_number};
use crate::rational::Rational;
use crate::rng::Rng;
use crate::template::{AnswerKind, CompiledTemplate, I18n, Item, ItemTemplate};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionConfig {
    pub seed: u64,
    /// Grade chosen by a teacher; `None` for a guest.
    #[serde(default)]
    pub grade: Option<u8>,
    #[serde(default = "default_candidates")]
    pub candidates: u32,
    /// `false` in no-timer mode: no speed bonus.
    #[serde(default = "yes")]
    pub timed: bool,
    #[serde(default = "default_expected_ms")]
    pub expected_answer_ms: f64,
    /// Player id written into events (pseudonym or device profile).
    #[serde(default = "default_player")]
    pub player_id: String,
    #[serde(default)]
    pub content_pack_version: String,
}

fn default_candidates() -> u32 {
    12
}
fn yes() -> bool {
    true
}
fn default_expected_ms() -> f64 {
    8000.0
}
fn default_player() -> String {
    "guest".into()
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NumberView {
    pub text: String,
    pub num: i128,
    pub den: i128,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct BalloonView {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub misconception: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Offer {
    pub offer_id: u32,
    pub game: GameType,
    pub template_id: String,
    pub skill: String,
    pub prompt: I18n,
    pub band: Band,
    pub p_final: f64,
    pub show_demo: bool,
    /// Orb Forge: the value on the creature's shield. Bridge Builder: the
    /// gap's length. Factory Sort: the number the creature carries.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<NumberView>,
    /// Balloon Burst: shuffled options. Balance Gate: the weights to pick from.
    pub balloons: Vec<BalloonView>,
    /// Orb Forge: crystals the player can merge. Bridge Builder: planks.
    pub crystals: Vec<NumberView>,
    /// Orb Forge: how many crystals an orb may hold. Bridge Builder: planks a bridge may hold.
    pub max_crystals: u32,
    /// Factory Sort: the gates' labels, in order.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub gates: Vec<I18n>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Verdict {
    pub offer_id: u32,
    pub correct: bool,
    pub points: u32,
    pub attempt: u32,
    /// The creature bounces and may be tried once more.
    pub retry_allowed: bool,
    pub expected_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub misconception: Option<String>,
    /// Orb Forge, Bridge Builder: value of what the player built.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub built_text: Option<String>,
    /// Factory Sort: the gate the number belongs in.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_gate: Option<usize>,
    pub streak: u32,
    pub total_points: u32,
}

/// One answer, as stored on the device and later synced.
#[derive(Clone, Debug, Serialize)]
pub struct AnswerEvent {
    pub event_id: String,
    pub at_ms: f64,
    pub player: String,
    pub mode: &'static str,
    pub game_type: GameType,
    pub skill: String,
    pub template_id: String,
    pub params_hash: String,
    pub b: f64,
    pub p_final: f64,
    pub result: Outcome,
    pub attempt: u32,
    pub assisted: bool,
    pub time_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub misconception: Option<String>,
    pub fairness_params_version: String,
    pub content_pack_version: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum SessionError {
    NoTemplates,
    NoItemForGame(GameType),
    UnknownOffer(u32),
    AlreadyAnswered(u32),
    WrongGame { offer: u32, expected: GameType },
    BadChoice(String),
}

impl std::fmt::Display for SessionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SessionError::NoTemplates => write!(f, "no usable templates"),
            SessionError::NoItemForGame(g) => write!(f, "no template supports {g:?}"),
            SessionError::UnknownOffer(id) => write!(f, "unknown offer {id}"),
            SessionError::AlreadyAnswered(id) => write!(f, "offer {id} is closed"),
            SessionError::WrongGame { offer, expected } => {
                write!(f, "offer {offer} belongs to {expected:?}")
            }
            SessionError::BadChoice(m) => write!(f, "bad choice: {m}"),
        }
    }
}

impl std::error::Error for SessionError {}

struct Open {
    offer: Offer,
    item: Item,
    expected: Rational,
    /// The right balloon or weight, or Factory Sort's right gate.
    correct_choice: usize,
    balloon_values: Vec<Option<String>>,
    crystal_values: Vec<Rational>,
    attempt: u32,
}

pub struct SoloSession {
    cfg: SessionConfig,
    params: FairnessParams,
    templates: Vec<CompiledTemplate>,
    ratings: BTreeMap<String, Rating>,
    rng: Rng,
    wrong_streak: u32,
    streak: u32,
    recent: Vec<String>,
    open: BTreeMap<u32, Open>,
    next_id: u32,
    total_points: u32,
    events: Vec<AnswerEvent>,
    /// Written into each answer event: `solo_squad` unless a match says otherwise.
    mode: &'static str,
}

fn adapter_key(game: GameType) -> &'static str {
    match game {
        GameType::OrbForge => "orb_forge",
        GameType::BalloonBurst => "balloon_burst",
        GameType::FactorySort => "factory_sort",
        GameType::BridgeBuilder => "bridge_builder",
        GameType::BalanceGate => "balance_gate",
        GameType::MeasureHunt => "measure_hunt",
    }
}

/// Options a player picks from in a choice game, for the chance of a lucky guess.
pub(crate) fn guess_choices(game: GameType) -> Option<u32> {
    match game {
        GameType::BalloonBurst => Some(4),
        GameType::BalanceGate => Some(BALANCE_WEIGHTS as u32),
        GameType::FactorySort => Some(2),
        _ => None,
    }
}

/// Weights on Balance Gate's table: the right one and two that look close.
const BALANCE_WEIGHTS: usize = 3;

fn adapter_u32(t: &ItemTemplate, game: GameType, key: &str, default: u32) -> u32 {
    t.game_adapters
        .get(adapter_key(game))
        .and_then(|a| a.get(key))
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(default)
}

impl SoloSession {
    /// Compiles the templates once. Templates that fail to compile are
    /// returned by id so the caller can report them (never dropped silently).
    pub fn new(
        templates: Vec<ItemTemplate>,
        cfg: SessionConfig,
        params: FairnessParams,
    ) -> Result<(Self, Vec<String>), SessionError> {
        let mut compiled = Vec::new();
        let mut rejected = Vec::new();
        for t in templates {
            let id = t.id.clone();
            match CompiledTemplate::compile(t) {
                Ok(ct) => compiled.push(ct),
                Err(_) => rejected.push(id),
            }
        }
        if compiled.is_empty() {
            return Err(SessionError::NoTemplates);
        }
        let rng = Rng::new(cfg.seed);
        Ok((
            SoloSession {
                cfg,
                params,
                templates: compiled,
                ratings: BTreeMap::new(),
                rng,
                wrong_streak: 0,
                streak: 0,
                recent: Vec::new(),
                open: BTreeMap::new(),
                next_id: 1,
                total_points: 0,
                events: Vec::new(),
                mode: "solo_squad",
            },
            rejected,
        ))
    }

    fn supports(ct: &CompiledTemplate, game: GameType) -> bool {
        let value_answer = matches!(
            ct.source.answer_kind,
            AnswerKind::Value | AnswerKind::Equation
        );
        let Some(adapter) = ct.source.game_adapters.get(adapter_key(game)) else {
            return false;
        };
        // Orb Forge here builds orbs by adding crystals, so it needs "+".
        let ops_fit = game != GameType::OrbForge
            || adapter
                .get("ops")
                .and_then(|o| o.as_array())
                .is_some_and(|ops| ops.iter().any(|op| op == "+"));
        match game {
            GameType::FactorySort => ct.source.answer_kind == AnswerKind::Predicate,
            GameType::MeasureHunt => false,
            _ => value_answer && ops_fit,
        }
    }

    /// Skill first (uniform for now), then `count` candidate items from that skill.
    fn draw(
        templates: &[CompiledTemplate],
        usable: &[usize],
        count: u32,
        rng: &mut Rng,
    ) -> (String, Vec<(usize, Item)>) {
        let mut skills: Vec<&str> = usable
            .iter()
            .map(|i| templates[*i].source.skill.as_str())
            .collect();
        skills.sort_unstable();
        skills.dedup();
        let skill = skills[rng.below(skills.len() as u64) as usize].to_string();
        let pool: Vec<usize> = usable
            .iter()
            .copied()
            .filter(|i| templates[*i].source.skill == skill)
            .collect();
        let mut items = Vec::new();
        for _ in 0..count.max(1) {
            let ti = pool[rng.below(pool.len() as u64) as usize];
            let seed = rng.next_u64();
            if let Ok(item) = templates[ti].instantiate(seed) {
                items.push((ti, item));
            }
        }
        (skill, items)
    }

    fn keyed(items: &[(usize, Item)]) -> Vec<Candidate> {
        items
            .iter()
            .map(|(_, it)| Candidate {
                key: format!("{}#{}", it.template_id, it.params_hash),
                b: it.b,
            })
            .collect()
    }

    /// An item for a partner bot, chosen for the bot's own rating with the
    /// bot's own random stream, so the player's state is never touched.
    pub(crate) fn bot_item(
        &self,
        game: GameType,
        rating: Rating,
        rng: &mut Rng,
    ) -> Option<(Item, f64)> {
        let usable: Vec<usize> = (0..self.templates.len())
            .filter(|i| Self::supports(&self.templates[*i], game))
            .collect();
        if usable.is_empty() {
            return None;
        }
        let (_, mut items) = Self::draw(&self.templates, &usable, self.cfg.candidates, rng);
        let cands = Self::keyed(&items);
        let choices = guess_choices(game);
        let at = Situation {
            rating,
            game,
            choices,
            wrong_streak: 0,
            recent: &[],
        };
        let pick = choose(&cands, &at, &self.params, rng)?;
        Some((items.swap_remove(pick.index).1, pick.p_final))
    }

    /// The mode written into answer events from now on (Class Match uses `class_match`).
    pub(crate) fn set_mode(&mut self, mode: &'static str) {
        self.mode = mode;
    }

    /// Fails when no template can fill creatures for `game`.
    pub fn check_game(&self, game: GameType) -> Result<(), SessionError> {
        if self.templates.iter().any(|t| Self::supports(t, game)) {
            Ok(())
        } else {
            Err(SessionError::NoItemForGame(game))
        }
    }

    /// Ratings of every skill the player has answered so far.
    pub fn ratings(&self) -> &BTreeMap<String, Rating> {
        &self.ratings
    }

    pub fn params(&self) -> &FairnessParams {
        &self.params
    }

    pub fn rating(&self, skill: &str) -> Rating {
        self.ratings
            .get(skill)
            .copied()
            .unwrap_or_else(|| Rating::start(self.cfg.grade, &self.params))
    }

    pub fn total_points(&self) -> u32 {
        self.total_points
    }

    /// Next creature for `game`.
    pub fn next(&mut self, game: GameType) -> Result<Offer, SessionError> {
        let usable: Vec<usize> = (0..self.templates.len())
            .filter(|i| Self::supports(&self.templates[*i], game))
            .collect();
        if usable.is_empty() {
            return Err(SessionError::NoItemForGame(game));
        }
        // Orb Forge asks for two crystals joined, so an answer that cannot be
        // cut in two (16 - 3 x 5 = 1) is left out, and the draw tried again.
        let mut draws = 0;
        let (skill, mut items) = loop {
            let (skill, mut items) =
                Self::draw(&self.templates, &usable, self.cfg.candidates, &mut self.rng);
            match game {
                GameType::OrbForge | GameType::BridgeBuilder => {
                    items.retain(|(ti, item)| orb_buildable(&self.templates[*ti], item));
                }
                GameType::FactorySort => items.retain(|(_, item)| !item.sort_items.is_empty()),
                _ => {}
            }
            draws += 1;
            if !items.is_empty() || draws >= 8 {
                break (skill, items);
            }
        };
        if items.is_empty() {
            return Err(SessionError::NoItemForGame(game));
        }
        let cands = Self::keyed(&items);

        let choices = if game == GameType::BalloonBurst {
            Some(adapter_u32(
                &self.templates[items[0].0].source,
                game,
                "choices",
                4,
            ))
        } else {
            guess_choices(game)
        };
        let at = Situation {
            rating: self.rating(&skill),
            game,
            choices,
            wrong_streak: self.wrong_streak,
            recent: &self.recent,
        };
        let pick = choose(&cands, &at, &self.params, &mut self.rng)
            .ok_or(SessionError::NoItemForGame(game))?;
        let (ti, item) = items.swap_remove(pick.index);
        self.recent.push(cands[pick.index].key.clone());
        if self.recent.len() > self.params.no_repeat_window {
            self.recent.remove(0);
        }

        let ct = &self.templates[ti];
        // Factory Sort's items have no answer of their own: each number has a gate.
        let (answer_text, raw_den, expected) = match &item.answer {
            Some(a) => (
                a.text.clone(),
                a.raw_den.unwrap_or(1),
                Rational::new(a.num.unwrap_or(0), a.den.unwrap_or(1))
                    .expect("answers have a positive denominator"),
            ),
            None => (String::new(), 1, Rational::ZERO),
        };
        let fmt = ct.distractor_format();

        let offer_id = self.next_id;
        self.next_id += 1;
        let mut offer = Offer {
            offer_id,
            game,
            template_id: item.template_id.clone(),
            skill: item.skill.clone(),
            prompt: item.prompt.clone(),
            band: pick.band,
            p_final: pick.p_final,
            show_demo: pick.show_demo,
            target: None,
            balloons: Vec::new(),
            crystals: Vec::new(),
            max_crystals: 2,
            gates: Vec::new(),
        };
        let mut open = Open {
            offer: offer.clone(),
            item: item.clone(),
            expected,
            correct_choice: 0,
            balloon_values: Vec::new(),
            crystal_values: Vec::new(),
            attempt: 1,
        };

        match game {
            GameType::BalloonBurst | GameType::BalanceGate => {
                // The chosen template decides how many balloons, not the first candidate.
                let n = if game == GameType::BalloonBurst {
                    adapter_u32(&ct.source, game, "choices", 4).max(2) as usize
                } else {
                    BALANCE_WEIGHTS
                };
                let opts = options(
                    &item,
                    expected,
                    &answer_text,
                    raw_den,
                    fmt,
                    n,
                    &mut self.rng,
                );
                open.correct_choice = opts
                    .iter()
                    .position(|(v, _, m)| *v == expected && m.is_none())
                    .unwrap_or(0);
                open.balloon_values = opts.iter().map(|(_, _, m)| m.clone()).collect();
                offer.balloons = opts
                    .into_iter()
                    .map(|(_, text, misconception)| BalloonView {
                        text,
                        misconception,
                    })
                    .collect();
            }
            GameType::OrbForge | GameType::BridgeBuilder => {
                let (max, decoys, pieces) = if game == GameType::OrbForge {
                    let max = adapter_u32(&ct.source, game, "max_crystals", 2).clamp(2, 4);
                    (max, adapter_u32(&ct.source, game, "decoys", 3), 2)
                } else {
                    let max = adapter_u32(&ct.source, game, "max_planks", 3).clamp(2, 4);
                    // A bridge of three planks now and then, when it may hold three.
                    let pieces = if max >= 3 && self.rng.below(2) == 1 {
                        3
                    } else {
                        2
                    };
                    (max, adapter_u32(&ct.source, game, "decoys", 3), pieces)
                };
                let values = parts(
                    &expected,
                    raw_den,
                    fmt,
                    pieces,
                    decoys as usize,
                    &mut self.rng,
                );
                offer.crystals = values
                    .iter()
                    .map(|v| NumberView {
                        text: show(v, raw_den, fmt).unwrap_or_else(|| v.to_string()),
                        num: v.num(),
                        den: v.den(),
                    })
                    .collect();
                offer.target = Some(NumberView {
                    text: answer_text.clone(),
                    num: expected.num(),
                    den: expected.den(),
                });
                offer.max_crystals = max;
                open.crystal_values = values;
            }
            GameType::FactorySort => {
                // The gate is drawn first, so each gate comes up about as often.
                let mut gates: Vec<usize> = item.sort_items.iter().map(|s| s.gate).collect();
                gates.sort_unstable();
                gates.dedup();
                let gate = gates[self.rng.below(gates.len() as u64) as usize];
                let these: Vec<_> = item.sort_items.iter().filter(|s| s.gate == gate).collect();
                let one = these[self.rng.below(these.len() as u64) as usize];
                offer.target = Some(NumberView {
                    text: one.text.clone(),
                    num: one.num,
                    den: one.den,
                });
                offer.gates = item.gates.clone();
                open.correct_choice = gate;
                open.expected = Rational::new(one.num, one.den).expect("valid item");
            }
            other => return Err(SessionError::NoItemForGame(other)),
        }
        open.offer = offer.clone();
        self.open.insert(offer_id, open);
        Ok(offer)
    }

    pub fn answer_balloon(
        &mut self,
        offer_id: u32,
        index: usize,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<Verdict, SessionError> {
        self.answer_choice(GameType::BalloonBurst, offer_id, index, time_ms, now_ms)
    }

    /// Balance Gate: the weight put on the empty pan.
    pub fn answer_balance(
        &mut self,
        offer_id: u32,
        index: usize,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<Verdict, SessionError> {
        self.answer_choice(GameType::BalanceGate, offer_id, index, time_ms, now_ms)
    }

    fn check_open(&self, game: GameType, offer_id: u32) -> Result<&Open, SessionError> {
        let open = self
            .open
            .get(&offer_id)
            .ok_or(SessionError::UnknownOffer(offer_id))?;
        if open.offer.game != game {
            return Err(SessionError::WrongGame {
                offer: offer_id,
                expected: open.offer.game,
            });
        }
        Ok(open)
    }

    fn answer_choice(
        &mut self,
        game: GameType,
        offer_id: u32,
        index: usize,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<Verdict, SessionError> {
        let open = self.check_open(game, offer_id)?;
        if index >= open.offer.balloons.len() {
            return Err(SessionError::BadChoice(format!(
                "choice {index} does not exist"
            )));
        }
        let correct = index == open.correct_choice;
        let misconception = if correct {
            None
        } else {
            open.balloon_values[index].clone()
        };
        self.judge(offer_id, correct, misconception, None, time_ms, now_ms)
    }

    /// Factory Sort: the gate the player sent the creature through.
    pub fn answer_sort(
        &mut self,
        offer_id: u32,
        gate: usize,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<Verdict, SessionError> {
        let open = self.check_open(GameType::FactorySort, offer_id)?;
        if gate >= open.offer.gates.len() {
            return Err(SessionError::BadChoice(format!(
                "gate {gate} does not exist"
            )));
        }
        let correct = gate == open.correct_choice;
        self.judge(offer_id, correct, None, None, time_ms, now_ms)
    }

    pub fn answer_orb(
        &mut self,
        offer_id: u32,
        crystals: &[usize],
        time_ms: f64,
        now_ms: f64,
    ) -> Result<Verdict, SessionError> {
        self.answer_sum(GameType::OrbForge, offer_id, crystals, time_ms, now_ms)
    }

    /// Bridge Builder: the planks laid across the gap.
    pub fn answer_bridge(
        &mut self,
        offer_id: u32,
        planks: &[usize],
        time_ms: f64,
        now_ms: f64,
    ) -> Result<Verdict, SessionError> {
        self.answer_sum(GameType::BridgeBuilder, offer_id, planks, time_ms, now_ms)
    }

    fn answer_sum(
        &mut self,
        game: GameType,
        offer_id: u32,
        crystals: &[usize],
        time_ms: f64,
        now_ms: f64,
    ) -> Result<Verdict, SessionError> {
        let open = self.check_open(game, offer_id)?;
        let mut seen = crystals.to_vec();
        seen.sort_unstable();
        seen.dedup();
        if crystals.is_empty()
            || seen.len() != crystals.len()
            || crystals.len() > open.offer.max_crystals as usize
        {
            return Err(SessionError::BadChoice(
                "an orb or bridge needs 1 to max_crystals different parts".into(),
            ));
        }
        let mut sum = Rational::ZERO;
        for &i in crystals {
            let v = open
                .crystal_values
                .get(i)
                .ok_or_else(|| SessionError::BadChoice(format!("part {i} does not exist")))?;
            sum = sum
                .checked_add(v)
                .map_err(|e| SessionError::BadChoice(e.to_string()))?;
        }
        let correct = sum == open.expected;
        let raw_den = open
            .item
            .answer
            .as_ref()
            .and_then(|a| a.raw_den)
            .unwrap_or(1);
        let fmt = self
            .templates
            .iter()
            .find(|t| t.source.id == open.item.template_id)
            .and_then(|t| t.distractor_format());
        let built = show(&sum, raw_den, fmt).unwrap_or_else(|| sum.to_string());
        self.judge(offer_id, correct, None, Some(built), time_ms, now_ms)
    }

    fn judge(
        &mut self,
        offer_id: u32,
        correct: bool,
        misconception: Option<String>,
        built_text: Option<String>,
        time_ms: f64,
        now_ms: f64,
    ) -> Result<Verdict, SessionError> {
        let mut open = self
            .open
            .remove(&offer_id)
            .ok_or(SessionError::UnknownOffer(offer_id))?;
        let attempt = open.attempt;
        let outcome = if correct {
            Outcome::Correct
        } else {
            Outcome::Wrong
        };
        let ratio = if self.cfg.timed {
            Some(time_ms / self.cfg.expected_answer_ms)
        } else {
            None
        };
        let pts = points(
            open.offer.p_final,
            outcome,
            attempt,
            ratio,
            self.streak,
            &self.params,
        );
        self.total_points += pts;

        // Only the first attempt measures ability; a retry already saw the answer's shape.
        if attempt == 1 {
            let r = self.rating(&open.item.skill);
            self.ratings.insert(
                open.item.skill.clone(),
                update(r, open.offer.p_final, outcome, false, &self.params),
            );
        }
        if correct {
            self.streak += 1;
            self.wrong_streak = 0;
        } else {
            self.streak = 0;
            if attempt == 1 {
                self.wrong_streak += 1;
            }
        }
        let event_id = format!("{:016x}{:016x}", self.rng.next_u64(), self.rng.next_u64());
        self.events.push(AnswerEvent {
            event_id,
            at_ms: now_ms,
            player: self.cfg.player_id.clone(),
            mode: self.mode,
            game_type: open.offer.game,
            skill: open.item.skill.clone(),
            template_id: open.item.template_id.clone(),
            params_hash: open.item.params_hash.clone(),
            b: open.item.b,
            p_final: open.offer.p_final,
            result: outcome,
            attempt,
            assisted: false,
            time_ms,
            misconception: misconception.clone(),
            fairness_params_version: self.params.version.clone(),
            content_pack_version: self.cfg.content_pack_version.clone(),
        });

        let retry_allowed = !correct && attempt == 1;
        let sorting = open.offer.game == GameType::FactorySort;
        let verdict = Verdict {
            offer_id,
            correct,
            points: pts,
            attempt,
            retry_allowed,
            expected_text: match &open.offer.target {
                Some(t) if sorting => t.text.clone(),
                _ => open
                    .item
                    .answer
                    .as_ref()
                    .map(|a| a.text.clone())
                    .unwrap_or_default(),
            },
            misconception,
            built_text,
            expected_gate: sorting.then_some(open.correct_choice),
            streak: self.streak,
            total_points: self.total_points,
        };
        if retry_allowed {
            open.attempt = 2;
            self.open.insert(offer_id, open);
        }
        Ok(verdict)
    }

    /// The right choice for an open creature: the balloon index, or crystal
    /// indices that add up to the target. For simulated players and tests;
    /// the headset never calls it.
    #[doc(hidden)]
    pub fn answer_key(&self, offer_id: u32) -> Option<Vec<usize>> {
        let open = self.open.get(&offer_id)?;
        match open.offer.game {
            GameType::BalloonBurst | GameType::BalanceGate | GameType::FactorySort => {
                Some(vec![open.correct_choice])
            }
            GameType::OrbForge | GameType::BridgeBuilder => {
                let v = &open.crystal_values;
                // Fewest parts first, each size in order.
                for size in 1..=(open.offer.max_crystals as usize).min(v.len()) {
                    let mut pick: Vec<usize> = (0..size).collect();
                    loop {
                        let sum = pick
                            .iter()
                            .try_fold(Rational::ZERO, |a, &i| a.checked_add(&v[i]).ok());
                        if sum == Some(open.expected) {
                            return Some(pick);
                        }
                        // The next `size` indices in order.
                        let Some(k) = (0..size).rev().find(|&k| pick[k] < v.len() - size + k)
                        else {
                            break;
                        };
                        pick[k] += 1;
                        for j in k + 1..size {
                            pick[j] = pick[j - 1] + 1;
                        }
                    }
                }
                None
            }
            _ => None,
        }
    }

    /// Answer events since the last call, oldest first, for the device outbox.
    pub fn drain_events(&mut self) -> Vec<AnswerEvent> {
        std::mem::take(&mut self.events)
    }

    /// Abandon an open creature (for example it walked off the desk). No rating change.
    pub fn close(&mut self, offer_id: u32) -> bool {
        self.open.remove(&offer_id).is_some()
    }
}

/// The right answer with its distractors, then near values, shuffled: as
/// many options as `n`, each with its value, text and mistake.
fn options(
    item: &Item,
    expected: Rational,
    answer_text: &str,
    raw_den: i128,
    fmt: Option<NumberFormat>,
    n: usize,
    rng: &mut Rng,
) -> Vec<(Rational, String, Option<String>)> {
    let mut opts: Vec<(Rational, String, Option<String>)> =
        vec![(expected, answer_text.to_string(), None)];
    for d in &item.distractors {
        if opts.len() >= n {
            break;
        }
        let v = Rational::new(d.num, d.den).expect("valid distractor");
        opts.push((v, d.text.clone(), Some(d.misconception.clone())));
    }
    let step = unit_step(&expected, raw_den, fmt);
    let mut k = 1i128;
    while opts.len() < n && k < 40 {
        for sign in [1i128, -1] {
            if opts.len() >= n {
                break;
            }
            let Ok(delta) = step.checked_mul(&Rational::int(sign * k)) else {
                continue;
            };
            let Ok(v) = expected.checked_add(&delta) else {
                continue;
            };
            if v.is_negative() || v == Rational::ZERO || opts.iter().any(|(w, _, _)| *w == v) {
                continue;
            }
            if let Some(text) = show(&v, raw_den, fmt) {
                opts.push((v, text, None));
            }
        }
        k += 1;
    }
    shuffle(&mut opts, rng);
    opts
}

/// The parts an answer is built from (Orb Forge's crystals, Bridge Builder's
/// planks): `pieces` of them that add up to it when the answer allows, and
/// `decoys` more that step like them, shuffled.
fn parts(
    expected: &Rational,
    raw_den: i128,
    fmt: Option<NumberFormat>,
    pieces: i128,
    decoys: usize,
    rng: &mut Rng,
) -> Vec<Rational> {
    // Decoys step by `step`; the exact parts by `split`.
    let step = orb_step(expected, raw_den, fmt);
    let (split, units) = orb_split(expected, raw_den, fmt);
    let pieces = pieces.min(units);
    let mut values: Vec<Rational> = Vec::new();
    if pieces >= 2 {
        let mut left = units;
        for after in (1..pieces).rev() {
            let k = rng.int_between(1, left - after).unwrap_or(1);
            values.push(split.checked_mul(&Rational::int(k)).expect("small"));
            left -= k;
        }
        values.push(split.checked_mul(&Rational::int(left)).expect("small"));
    } else {
        values.push(*expected);
    }
    let base = values[0];
    let want = values.len().max(2) + decoys;
    let mut j = 1i128;
    while values.len() < want && j < 40 {
        for sign in [1i128, -1] {
            if values.len() >= want {
                break;
            }
            let Ok(delta) = step.checked_mul(&Rational::int(sign * j)) else {
                continue;
            };
            let Ok(v) = base.checked_add(&delta) else {
                continue;
            };
            if v.is_negative() || v == Rational::ZERO || values.contains(&v) || v == *expected {
                continue;
            }
            values.push(v);
        }
        j += 1;
    }
    shuffle(&mut values, rng);
    values
}

/// How Orb Forge cuts an answer into two crystals: the size of one part
/// (a step that divides the answer, so 886 splits into whole numbers, not
/// tens) and how many such parts the answer holds. Fewer than two parts
/// (an answer of 1, or 1/8 in eighths) cannot be built from two crystals.
fn orb_split(expected: &Rational, raw_den: i128, fmt: Option<NumberFormat>) -> (Rational, i128) {
    let step = orb_step(expected, raw_den, fmt);
    let split = match expected.checked_div(&step) {
        Ok(u) if u.is_integer() => step,
        _ => Rational::ONE,
    };
    let units = expected.checked_div(&split).map(|u| u.floor()).unwrap_or(1);
    (split, units)
}

/// Orb Forge's step for crystals: crystals read like the target, so a whole
/// answer from a fraction template (4 x 1 1/2 = 6) steps by whole numbers,
/// not halves.
fn orb_step(expected: &Rational, raw_den: i128, fmt: Option<NumberFormat>) -> Rational {
    let fraction = matches!(
        fmt,
        Some(NumberFormat::Fraction { .. }) | Some(NumberFormat::Mixed { .. })
    );
    if fraction && expected.is_integer() {
        unit_step(expected, 1, None)
    } else {
        unit_step(expected, raw_den, fmt)
    }
}

/// Whether an item's answer can be joined from two crystals.
fn orb_buildable(ct: &CompiledTemplate, item: &Item) -> bool {
    let Some(answer) = item.answer.as_ref() else {
        return false;
    };
    let Ok(expected) = Rational::new(answer.num.unwrap_or(0), answer.den.unwrap_or(1)) else {
        return false;
    };
    orb_split(
        &expected,
        answer.raw_den.unwrap_or(1),
        ct.distractor_format(),
    )
    .1 >= 2
}

/// Smallest natural step for near-miss values in the answer's own terms:
/// 1/den for fractions, the last decimal place for decimals, 1 or 10 for
/// whole numbers.
fn unit_step(answer: &Rational, raw_den: i128, fmt: Option<NumberFormat>) -> Rational {
    match fmt {
        Some(NumberFormat::Fraction { .. }) | Some(NumberFormat::Mixed { .. }) => {
            Rational::new(1, raw_den.max(1)).unwrap_or(Rational::ONE)
        }
        // A whole-number length ("16 cm") steps by whole units, so its parts
        // and decoys stay whole numbers that the answer's format can show.
        Some(NumberFormat::Measure { .. }) => {
            let places = (0..=3)
                .find(|p| answer.fits_decimal_places(*p))
                .unwrap_or(3);
            Rational::new(1, 10i128.pow(places)).unwrap_or(Rational::ONE)
        }
        Some(NumberFormat::Decimal { .. }) | Some(NumberFormat::Percent { .. }) => {
            let places = (0..=3)
                .find(|p| answer.fits_decimal_places(*p))
                .unwrap_or(3)
                .max(1);
            Rational::new(1, 10i128.pow(places)).unwrap_or(Rational::ONE)
        }
        _ => {
            if answer.floor().abs() >= 100 {
                Rational::int(10)
            } else {
                Rational::ONE
            }
        }
    }
}

/// Formats a value like the answer; fractions keep the answer's denominator.
fn show(v: &Rational, raw_den: i128, fmt: Option<NumberFormat>) -> Option<String> {
    match fmt? {
        NumberFormat::Fraction { simplify: false } | NumberFormat::Mixed { simplify: false } => {
            let r = v.reduced();
            if raw_den % r.den() == 0 {
                let scaled = Rational::raw(r.num() * (raw_den / r.den()), raw_den).ok()?;
                format_number(&scaled, fmt?).ok()
            } else {
                format_number(v, fmt?).ok()
            }
        }
        f => format_number(v, f).ok(),
    }
}

fn shuffle<T>(items: &mut [T], rng: &mut Rng) {
    for i in (1..items.len()).rev() {
        let j = rng.below(i as u64 + 1) as usize;
        items.swap(i, j);
    }
}
