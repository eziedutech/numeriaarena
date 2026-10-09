//! Measure Hunt: the child measures a shape on the real desk with pins and
//! threads, then picks the perimeter, area or volume from five choices.
//!
//! The shape is either a paper object the game puts on the desk, whose true
//! size is known here, or a real object near the child, which the headset
//! cannot recognise (the web has no camera pixels). Both are judged from the
//! pins alone: for a paper object how near each pin is to the true corner,
//! for a real one whether the pins make the shape asked for (right corners,
//! no flat triangle, three edges at right angles). That process earns up to
//! `PROCESS_MAX` points, the right choice `ANSWER_POINTS` more.
//!
//! Every length is in centimetres. Paper objects are given in their own
//! frame: y up, standing on y = 0, centred on x and z. Real objects are in the
//! desk's frame, y up. The answer is worked out from the lengths the child
//! sees on the threads (whole centimetres), so the sums always agree with
//! the labels.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::dsl::{Env, Value};
use crate::fairness::{FairnessParams, GameType, Outcome, Rating, p_correct};
use crate::format::{NumberFormat, format_number};
use crate::rational::Rational;
use crate::rng::Rng;
use crate::session::AnswerEvent;
use crate::template::{CompiledTemplate, I18n, Item, ItemTemplate};

/// A pin this near a paper object's corner sits on it.
pub const SNAP_CM: f64 = 3.0;
/// A pin further than this from every corner of a paper object is not on one.
pub const REACH_CM: f64 = 5.0;
/// Placing the pins and threads well.
pub const PROCESS_MAX: u32 = 60;
/// A real object's size is not known, so only its shape is judged: the process counts for less.
pub const REAL_PROCESS_MAX: u32 = 40;
/// The right choice.
pub const ANSWER_POINTS: u32 = 100;
pub const CHOICES: usize = 5;
/// The shortest side a fingertip measures fairly (its error is about 1.7 cm).
const SHORTEST_CM: f64 = 5.0;
/// A real corner counts as square within this many degrees.
const SQUARE_DEG: f64 = 12.0;
/// The three edges of a real box may lean a little more.
const BOX_DEG: f64 = 15.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Shape {
    Square,
    Rectangle,
    Triangle,
    Circle,
    Cube,
    Cuboid,
    Cylinder,
    Sphere,
}

impl Shape {
    pub fn solid(self) -> bool {
        matches!(
            self,
            Shape::Cube | Shape::Cuboid | Shape::Cylinder | Shape::Sphere
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Task {
    Perimeter,
    Area,
    Edges,
    Volume,
    Surface,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    /// A paper object the game puts on the desk.
    Paper,
    /// Something real near the child.
    Real,
}

#[derive(Clone, Debug, Deserialize)]
pub struct HuntConfig {
    pub seed: u64,
    #[serde(default)]
    pub grade: Option<u8>,
    #[serde(default = "guest")]
    pub player_id: String,
    #[serde(default)]
    pub content_pack_version: String,
}

fn guest() -> String {
    "guest".into()
}

/// One kind of question the grade may be asked.
#[derive(Clone, Debug, Serialize)]
pub struct HuntTask {
    pub template_id: String,
    pub skill: String,
    pub shape: Shape,
    pub task: Task,
    pub unit: String,
    pub prompt: I18n,
}

/// A question handed to the child.
#[derive(Clone, Debug, Serialize)]
pub struct HuntOffer {
    pub offer_id: u32,
    pub template_id: String,
    pub skill: String,
    pub shape: Shape,
    pub task: Task,
    pub unit: String,
    pub source: Source,
    pub prompt: I18n,
    /// A paper object's size in cm, by parameter (p, l, t, s, r, d, a ...).
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub size: BTreeMap<String, f64>,
    /// A paper object's corners (or centre and rim) in its own frame, in cm.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub keys: Vec<[f64; 3]>,
    pub snap_cm: f64,
}

/// The pins as the child placed them.
#[derive(Clone, Debug, Deserialize)]
pub struct Pins {
    pub points: Vec<[f64; 3]>,
}

/// What the pins measured.
#[derive(Clone, Debug, Serialize)]
pub struct Reading {
    pub offer_id: u32,
    /// The shape is measured and the choices are out.
    pub ok: bool,
    /// Why it is not, for the hint: `need_pins`, `off_corner`, `diagonal`,
    /// `same_corner`, `not_an_edge`, `off_centre`, `off_rim`, `not_across`,
    /// `height_not_upright`, `too_small`, `not_square_corner`, `sides_differ`,
    /// `not_square`, `not_cube`, `not_flat`, `flat_triangle`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub problem: Option<&'static str>,
    /// The pins after snapping to a paper object's corners.
    pub pins: Vec<[f64; 3]>,
    /// Each thread's length as shown, whole cm, in the order of the pins.
    pub lengths: Vec<u32>,
    pub process_points: u32,
    pub choices: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct HuntVerdict {
    pub offer_id: u32,
    pub correct: bool,
    pub process_points: u32,
    pub answer_points: u32,
    pub points: u32,
    pub expected_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub misconception: Option<String>,
    pub total_points: u32,
    pub right: u32,
    pub answered: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum HuntError {
    NoTemplates,
    NoTask(String),
    UnknownOffer(u32),
    NotMeasured(u32),
    AlreadyAnswered(u32),
    BadChoice(usize),
    Item(String),
}

impl std::fmt::Display for HuntError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HuntError::NoTemplates => write!(f, "no Measure Hunt templates"),
            HuntError::NoTask(id) => write!(f, "no Measure Hunt task {id}"),
            HuntError::UnknownOffer(id) => write!(f, "no question {id}"),
            HuntError::NotMeasured(id) => write!(f, "question {id} is not measured yet"),
            HuntError::AlreadyAnswered(id) => write!(f, "question {id} is already answered"),
            HuntError::BadChoice(i) => write!(f, "no choice {i}"),
            HuntError::Item(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for HuntError {}

struct Kind {
    template: usize,
    shape: Shape,
    task: Task,
    unit: String,
}

struct Open {
    offer: HuntOffer,
    kind: usize,
    /// Tries at measuring that came back with a problem.
    misses: u32,
    item: Option<Item>,
    /// The choices in the order shown, each with its misconception (none for the answer).
    choices: Vec<(String, Option<String>)>,
    process: u32,
    opened_ms: f64,
    answered: bool,
}

pub struct Hunt {
    cfg: HuntConfig,
    params: FairnessParams,
    templates: Vec<CompiledTemplate>,
    kinds: Vec<Kind>,
    rng: Rng,
    open: BTreeMap<u32, Open>,
    next_id: u32,
    total: u32,
    right: u32,
    answered: u32,
    events: Vec<AnswerEvent>,
}

impl Hunt {
    /// The Measure Hunt templates among `templates`; the others are ignored.
    /// Returns the ids of Measure Hunt templates that did not compile.
    pub fn new(
        templates: Vec<ItemTemplate>,
        cfg: HuntConfig,
        params: FairnessParams,
    ) -> Result<(Self, Vec<String>), HuntError> {
        let mut compiled = Vec::new();
        let mut kinds = Vec::new();
        let mut rejected = Vec::new();
        for t in templates {
            let Some(adapter) = t.game_adapters.get("measure_hunt") else {
                continue;
            };
            let shape: Option<Shape> = adapter.get("shape").and_then(|v| Shape::deserialize(v).ok());
            let task: Option<Task> = adapter.get("task").and_then(|v| Task::deserialize(v).ok());
            let (Some(shape), Some(task)) = (shape, task) else {
                // The old real-world estimate templates have no shape.
                continue;
            };
            let unit = adapter
                .get("unit")
                .and_then(|u| u.as_str())
                .unwrap_or("cm")
                .to_string();
            let id = t.id.clone();
            match CompiledTemplate::compile(t) {
                Ok(ct) => {
                    kinds.push(Kind {
                        template: compiled.len(),
                        shape,
                        task,
                        unit,
                    });
                    compiled.push(ct);
                }
                Err(_) => rejected.push(id),
            }
        }
        if kinds.is_empty() {
            return Err(HuntError::NoTemplates);
        }
        let rng = Rng::new(cfg.seed);
        Ok((
            Hunt {
                cfg,
                params,
                templates: compiled,
                kinds,
                rng,
                open: BTreeMap::new(),
                next_id: 1,
                total: 0,
                right: 0,
                answered: 0,
                events: Vec::new(),
            },
            rejected,
        ))
    }

    fn fits_grade(&self, k: &Kind) -> bool {
        match self.cfg.grade {
            Some(g) => self.templates[k.template].source.grades.contains(&g),
            None => true,
        }
    }

    /// The questions this grade gets, flat shapes or solids.
    pub fn tasks(&self, solid: bool) -> Vec<HuntTask> {
        self.kinds
            .iter()
            .filter(|k| k.shape.solid() == solid && self.fits_grade(k))
            .map(|k| {
                let t = &self.templates[k.template].source;
                HuntTask {
                    template_id: t.id.clone(),
                    skill: t.skill.clone(),
                    shape: k.shape,
                    task: k.task,
                    unit: k.unit.clone(),
                    prompt: t.prompt.clone(),
                }
            })
            .collect()
    }

    /// The next question: `template_id` from `tasks`, or a random one of the
    /// group when it is empty.
    pub fn next(
        &mut self,
        template_id: &str,
        solid: bool,
        source: Source,
        now_ms: f64,
    ) -> Result<HuntOffer, HuntError> {
        let kind = if template_id.is_empty() {
            let fit: Vec<usize> = (0..self.kinds.len())
                .filter(|i| {
                    let k = &self.kinds[*i];
                    k.shape.solid() == solid && self.fits_grade(k)
                })
                .collect();
            if fit.is_empty() {
                return Err(HuntError::NoTask(String::new()));
            }
            fit[self.rng.below(fit.len() as u64) as usize]
        } else {
            (0..self.kinds.len())
                .find(|i| self.templates[self.kinds[*i].template].source.id == template_id)
                .ok_or_else(|| HuntError::NoTask(template_id.into()))?
        };
        let k = &self.kinds[kind];
        let ct = &self.templates[k.template];
        let mut size = BTreeMap::new();
        let mut keys = Vec::new();
        if source == Source::Paper {
            let env = ct
                .sample_valid(&mut self.rng, 200)
                .map_err(|e| HuntError::Item(format!("{e:?}")))?;
            for name in ct.param_names() {
                if let Some(Value::Num(v)) = env.get(name) {
                    size.insert(name.to_string(), v.to_f64());
                }
            }
            keys = key_points(k.shape, &size);
        }
        let id = self.next_id;
        self.next_id += 1;
        let offer = HuntOffer {
            offer_id: id,
            template_id: ct.source.id.clone(),
            skill: ct.source.skill.clone(),
            shape: k.shape,
            task: k.task,
            unit: k.unit.clone(),
            source,
            prompt: ct.source.prompt.clone(),
            size,
            keys,
            snap_cm: SNAP_CM,
        };
        self.open.insert(
            id,
            Open {
                offer: offer.clone(),
                kind,
                misses: 0,
                item: None,
                choices: Vec::new(),
                process: 0,
                opened_ms: now_ms,
                answered: false,
            },
        );
        Ok(offer)
    }

    /// Judges the pins. With a problem the child moves pins and measures
    /// again; each miss lowers the process points a little.
    pub fn measure(&mut self, offer_id: u32, pins: &Pins) -> Result<Reading, HuntError> {
        let open = self
            .open
            .get(&offer_id)
            .ok_or(HuntError::UnknownOffer(offer_id))?;
        if open.answered {
            return Err(HuntError::AlreadyAnswered(offer_id));
        }
        let k = &self.kinds[open.kind];
        let task = k.task;
        let looked = match open.offer.source {
            Source::Paper => paper(k.shape, task, &open.offer.size, &pins.points),
            Source::Real => real(k.shape, task, &pins.points),
        };
        let misses = open.misses;
        let template = k.template;
        let shown = match looked {
            Err((problem, snapped)) => {
                let open = self.open.get_mut(&offer_id).expect("open");
                open.misses += 1;
                return Ok(Reading {
                    offer_id,
                    ok: false,
                    problem: Some(problem),
                    lengths: snapped.iter().enumerate().map(|(i, _)| thread(&snapped, k.shape, i)).collect(),
                    pins: snapped,
                    process_points: 0,
                    choices: Vec::new(),
                });
            }
            Ok(s) => s,
        };
        // The structure counts in full the first time, half the second.
        let structure = match misses {
            0 => 20.0,
            1 => 10.0,
            _ => 0.0,
        };
        let cap = match open.offer.source {
            Source::Paper => PROCESS_MAX,
            Source::Real => REAL_PROCESS_MAX,
        };
        let process = (structure + 40.0 * shown.quality).round().min(cap as f64) as u32;
        let mut env = Env::new();
        for (name, v) in &shown.params {
            env.insert(name.clone(), Value::Num(Rational::int(i128::from(*v))));
        }
        let seed = self.rng.next_u64();
        let item = self.templates[template]
            .instantiate_with(env, seed)
            .map_err(|e| HuntError::Item(e.to_string()))?;
        let choices = five_choices(&item, &mut self.rng);
        let open = self.open.get_mut(&offer_id).expect("open");
        open.item = Some(item);
        open.choices = choices.clone();
        open.process = process;
        Ok(Reading {
            offer_id,
            ok: true,
            problem: None,
            pins: shown.pins,
            lengths: shown.lengths,
            process_points: process,
            choices: choices.into_iter().map(|(t, _)| t).collect(),
        })
    }

    /// The child picked choice `index` of the reading's choices.
    pub fn answer(
        &mut self,
        offer_id: u32,
        index: usize,
        now_ms: f64,
    ) -> Result<HuntVerdict, HuntError> {
        let open = self
            .open
            .get_mut(&offer_id)
            .ok_or(HuntError::UnknownOffer(offer_id))?;
        if open.answered {
            return Err(HuntError::AlreadyAnswered(offer_id));
        }
        let Some(item) = open.item.clone() else {
            return Err(HuntError::NotMeasured(offer_id));
        };
        let (_, misconception) = open
            .choices
            .get(index)
            .cloned()
            .ok_or(HuntError::BadChoice(index))?;
        open.answered = true;
        let correct = misconception.is_none();
        let answer_points = if correct { ANSWER_POINTS } else { 0 };
        let process = open.process;
        let points = process + answer_points;
        let time_ms = (now_ms - open.opened_ms).clamp(0.0, 3_600_000.0);
        self.total += points;
        self.answered += 1;
        if correct {
            self.right += 1;
        }
        let rating = Rating::start(self.cfg.grade, &self.params);
        let p = p_correct(rating.theta, item.b, GameType::MeasureHunt, None);
        let guess = 1.0 / CHOICES as f64;
        let event_id = format!("{:016x}{:016x}", self.rng.next_u64(), self.rng.next_u64());
        self.events.push(AnswerEvent {
            event_id,
            at_ms: now_ms,
            player: self.cfg.player_id.clone(),
            mode: "solo_squad",
            game_type: GameType::MeasureHunt,
            skill: item.skill.clone(),
            template_id: item.template_id.clone(),
            params_hash: item.params_hash.clone(),
            b: item.b,
            p_final: ((guess + (1.0 - guess) * p) * 10000.0).round() / 10000.0,
            result: if correct {
                Outcome::Correct
            } else {
                Outcome::Wrong
            },
            attempt: 1,
            assisted: false,
            time_ms,
            misconception: misconception.clone(),
            fairness_params_version: self.params.version.clone(),
            content_pack_version: self.cfg.content_pack_version.clone(),
        });
        Ok(HuntVerdict {
            offer_id,
            correct,
            process_points: process,
            answer_points,
            points,
            expected_text: item.answer.map(|a| a.text).unwrap_or_default(),
            misconception,
            total_points: self.total,
            right: self.right,
            answered: self.answered,
        })
    }

    /// A question left when the time ran out: nothing is recorded.
    pub fn close(&mut self, offer_id: u32) -> bool {
        self.open.remove(&offer_id).is_some()
    }

    pub fn drain_events(&mut self) -> Vec<AnswerEvent> {
        std::mem::take(&mut self.events)
    }

    pub fn total_points(&self) -> u32 {
        self.total
    }
}

// ---------------------------------------------------------------- choices

/// The answer, the template's lures, and near numbers when there are fewer
/// than four lures, shuffled.
fn five_choices(item: &Item, rng: &mut Rng) -> Vec<(String, Option<String>)> {
    let Some(answer) = item.answer.as_ref() else {
        return Vec::new();
    };
    let mut out: Vec<(String, Option<String>)> = vec![(answer.text.clone(), None)];
    let mut values: Vec<f64> = Vec::new();
    if let (Some(n), Some(d)) = (answer.num, answer.den) {
        values.push(n as f64 / d as f64);
    }
    for d in &item.distractors {
        if out.len() >= CHOICES {
            break;
        }
        if out.iter().any(|(t, _)| *t == d.text) {
            continue;
        }
        values.push(d.num as f64 / d.den as f64);
        out.push((d.text.clone(), Some(d.misconception.clone())));
    }
    let base = values.first().copied().unwrap_or(10.0);
    let whole = answer.den == Some(1);
    let mut step: u32 = 1;
    while out.len() < CHOICES && step < 40 {
        let sign = if step % 2 == 0 { -1.0 } else { 1.0 };
        let v = base * (1.0 + sign * 0.1 * f64::from(step.div_ceil(2)));
        let v = if whole { v.round() } else { (v * 10.0).round() / 10.0 };
        step += 1;
        if v <= 0.0 || values.iter().any(|x| (x - v).abs() < 1e-9) {
            continue;
        }
        let Some(r) = Rational::from_f64(v) else {
            continue;
        };
        let Ok(text) = format_number(&r, NumberFormat::Decimal { places: 2 }) else {
            continue;
        };
        values.push(v);
        out.push((text, Some("near_value".into())));
    }
    for i in (1..out.len()).rev() {
        let j = rng.below(i as u64 + 1) as usize;
        out.swap(i, j);
    }
    out
}

// ---------------------------------------------------------------- geometry

type P = [f64; 3];

fn sub(a: P, b: P) -> P {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: P, b: P) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn cross(a: P, b: P) -> P {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn len(a: P) -> f64 {
    dot(a, a).sqrt()
}

fn dist(a: P, b: P) -> f64 {
    len(sub(a, b))
}

/// The angle between two directions, in degrees.
fn angle(a: P, b: P) -> f64 {
    let d = len(a) * len(b);
    if d == 0.0 {
        return 0.0;
    }
    (dot(a, b) / d).clamp(-1.0, 1.0).acos().to_degrees()
}

fn whole(v: f64) -> u32 {
    v.round().max(0.0) as u32
}

/// The thread shown next to pin `i`: to the next pin around a flat shape, to
/// the first pin for the edges of a box, to the centre for a circle.
fn thread(pins: &[P], shape: Shape, i: usize) -> u32 {
    let n = pins.len();
    if n < 2 {
        return 0;
    }
    let (a, b) = match shape {
        Shape::Cube | Shape::Cuboid => {
            if i == 0 {
                return 0;
            }
            (pins[0], pins[i])
        }
        Shape::Circle | Shape::Cylinder | Shape::Sphere => {
            if i == 0 {
                return 0;
            }
            (pins[0], pins[i])
        }
        _ => (pins[i], pins[(i + 1) % n]),
    };
    whole(dist(a, b))
}

/// A paper object's corners (or centre and rim) in its own frame.
pub fn key_points(shape: Shape, size: &BTreeMap<String, f64>) -> Vec<P> {
    let g = |k: &str| size.get(k).copied().unwrap_or(0.0);
    let flat = |w: f64, d: f64| {
        vec![
            [-w / 2.0, 0.0, -d / 2.0],
            [w / 2.0, 0.0, -d / 2.0],
            [w / 2.0, 0.0, d / 2.0],
            [-w / 2.0, 0.0, d / 2.0],
        ]
    };
    match shape {
        Shape::Square => flat(g("s"), g("s")),
        Shape::Rectangle => flat(g("p"), g("l")),
        Shape::Triangle => {
            // A right triangle: legs along x and z, the right angle at the front left.
            let (x, z) = if size.contains_key("t") {
                (g("a"), g("t"))
            } else {
                (g("b"), g("a"))
            };
            vec![
                [-x / 2.0, 0.0, z / 2.0],
                [x / 2.0, 0.0, z / 2.0],
                [-x / 2.0, 0.0, -z / 2.0],
            ]
        }
        Shape::Circle => vec![[0.0, 0.0, 0.0], [g("r"), 0.0, 0.0]],
        Shape::Cylinder => vec![[0.0, g("t"), 0.0], [g("r"), g("t"), 0.0]],
        Shape::Sphere => vec![[-g("d") / 2.0, g("d") / 2.0, 0.0], [g("d") / 2.0, g("d") / 2.0, 0.0]],
        Shape::Cube | Shape::Cuboid => {
            let (w, d, h) = if shape == Shape::Cube {
                (g("s"), g("s"), g("s"))
            } else {
                (g("p"), g("l"), g("t"))
            };
            let mut out = Vec::new();
            for y in [0.0, h] {
                for (x, z) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)] {
                    out.push([x * w / 2.0, y, z * d / 2.0]);
                }
            }
            out
        }
    }
}

/// How near a pin is to where it belongs, 1 at best.
fn accuracy(error_cm: f64) -> f64 {
    if error_cm <= 1.5 {
        1.0
    } else if error_cm <= SNAP_CM {
        0.7
    } else if error_cm <= REACH_CM {
        0.4
    } else {
        0.0
    }
}

struct Shown {
    pins: Vec<P>,
    lengths: Vec<u32>,
    /// Template parameter to its whole-cm value.
    params: Vec<(String, u32)>,
    /// 0 to 1: how well the pins were placed.
    quality: f64,
}

type Looked = Result<Shown, (&'static str, Vec<P>)>;

fn need(points: &[P], n: usize) -> Result<(), (&'static str, Vec<P>)> {
    if points.len() == n {
        Ok(())
    } else {
        Err(("need_pins", points.to_vec()))
    }
}

/// The nearest key point to `p` and how far it is.
fn nearest(keys: &[P], p: P) -> (usize, f64) {
    let mut best = (0, f64::INFINITY);
    for (i, k) in keys.iter().enumerate() {
        let d = dist(*k, p);
        if d < best.1 {
            best = (i, d);
        }
    }
    best
}

/// Each pin on its nearest corner; an error when one is off every corner or
/// two share one.
fn on_corners(keys: &[P], points: &[P]) -> Result<(Vec<usize>, Vec<P>, f64), (&'static str, Vec<P>)> {
    let mut which = Vec::new();
    let mut snapped = Vec::new();
    let mut score = 0.0;
    for p in points {
        let (i, d) = nearest(keys, *p);
        snapped.push(if d <= SNAP_CM { keys[i] } else { *p });
        if d > REACH_CM {
            return Err(("off_corner", snapped_rest(&snapped, points)));
        }
        if which.contains(&i) {
            return Err(("same_corner", snapped_rest(&snapped, points)));
        }
        which.push(i);
        score += accuracy(d);
    }
    Ok((which, snapped, score / points.len().max(1) as f64))
}

fn snapped_rest(done: &[P], points: &[P]) -> Vec<P> {
    let mut out = done.to_vec();
    out.extend_from_slice(&points[done.len()..]);
    out
}

/// Judges pins on a paper object of known size.
fn paper(shape: Shape, task: Task, size: &BTreeMap<String, f64>, points: &[P]) -> Looked {
    let keys = key_points(shape, size);
    match shape {
        Shape::Square | Shape::Rectangle => {
            need(points, 4)?;
            let (which, pins, q) = on_corners(&keys, points)?;
            // Going round: each next pin is a neighbouring corner, not across.
            for i in 0..4 {
                if (which[i] + 2) % 4 == which[(i + 1) % 4] {
                    return Err(("diagonal", pins));
                }
            }
            Ok(flat4(shape, pins, q))
        }
        Shape::Triangle => {
            let corners = if task == Task::Area { 4 } else { 3 };
            need(points, corners)?;
            let (_, mut pins, q) = on_corners(&keys, &points[..3])?;
            if task == Task::Area {
                // The height's foot, on the true foot when near it.
                let (apex, base, foot, d) = height_of(&pins, points[3]);
                let true_foot = foot_on(pins[base.0], pins[base.1], pins[apex]);
                let off = dist(points[3], true_foot);
                pins.push(if off <= SNAP_CM { true_foot } else { points[3] });
                if d > REACH_CM || off > REACH_CM {
                    return Err(("height_not_upright", pins));
                }
                let _ = foot;
                return Ok(triangle_area(pins, (q * 3.0 + accuracy(off)) / 4.0));
            }
            Ok(triangle_perimeter(pins, q))
        }
        Shape::Circle | Shape::Cylinder => {
            need(points, 2)?;
            let centre = keys[0];
            let r = size.get("r").copied().unwrap_or(0.0);
            let dc = dist(points[0], centre);
            if dc > REACH_CM {
                return Err(("off_centre", points.to_vec()));
            }
            let c = if dc <= SNAP_CM { centre } else { points[0] };
            let out = sub(points[1], c);
            let flat = [out[0], 0.0, out[2]];
            let reach = len(flat);
            let rim_off = (reach - r).abs() + out[1].abs();
            if rim_off > REACH_CM || reach == 0.0 {
                return Err(("off_rim", vec![c, points[1]]));
            }
            let rim = if rim_off <= SNAP_CM {
                [c[0] + flat[0] / reach * r, c[1], c[2] + flat[2] / reach * r]
            } else {
                points[1]
            };
            let q = (accuracy(dc) + accuracy(rim_off)) / 2.0;
            Ok(round_one(vec![c, rim], "r", q))
        }
        Shape::Sphere => {
            need(points, 2)?;
            let d = size.get("d").copied().unwrap_or(0.0);
            let centre = [0.0, d / 2.0, 0.0];
            let off: Vec<f64> = points.iter().map(|p| (dist(*p, centre) - d / 2.0).abs()).collect();
            let across = dist(points[0], points[1]);
            if off.iter().any(|o| *o > REACH_CM) || (across - d).abs() > REACH_CM {
                return Err(("not_across", points.to_vec()));
            }
            let pins = if (across - d).abs() <= SNAP_CM && off.iter().all(|o| *o <= SNAP_CM) {
                // The two ends of the diameter through the first pin.
                let dir = sub(points[0], centre);
                let l = len(dir).max(1e-9);
                let u = [dir[0] / l, dir[1] / l, dir[2] / l];
                let h = d / 2.0;
                vec![
                    [centre[0] + u[0] * h, centre[1] + u[1] * h, centre[2] + u[2] * h],
                    [centre[0] - u[0] * h, centre[1] - u[1] * h, centre[2] - u[2] * h],
                ]
            } else {
                points.to_vec()
            };
            let q = (accuracy(off[0]) + accuracy(off[1]) + accuracy((across - d).abs())) / 3.0;
            Ok(round_one(pins, "d", q))
        }
        Shape::Cube | Shape::Cuboid => {
            need(points, 4)?;
            let (which, pins, q) = on_corners(&keys, points)?;
            for &w in &which[1..] {
                if !neighbours(which[0], w) {
                    return Err(("not_an_edge", pins));
                }
            }
            box_edges(shape, pins, q)
        }
    }
}

/// Corners 0 to 3 are the bottom face going round, 4 to 7 the top.
fn neighbours(a: usize, b: usize) -> bool {
    let (fa, fb) = (a / 4, b / 4);
    let (ra, rb) = (a % 4, b % 4);
    if fa == fb {
        (ra + 1) % 4 == rb || (rb + 1) % 4 == ra
    } else {
        ra == rb
    }
}

fn flat4(shape: Shape, pins: Vec<P>, quality: f64) -> Shown {
    let sides: Vec<f64> = (0..4).map(|i| dist(pins[i], pins[(i + 1) % 4])).collect();
    let (params, lengths) = if shape == Shape::Square {
        let s = whole(sides.iter().sum::<f64>() / 4.0);
        (vec![("s".to_string(), s)], vec![s; 4])
    } else {
        let a = whole((sides[0] + sides[2]) / 2.0);
        let b = whole((sides[1] + sides[3]) / 2.0);
        let (p, l) = (a.max(b), a.min(b));
        (
            vec![("p".to_string(), p), ("l".to_string(), l)],
            vec![a, b, a, b],
        )
    };
    Shown {
        pins,
        lengths,
        params,
        quality,
    }
}

fn triangle_perimeter(pins: Vec<P>, quality: f64) -> Shown {
    let lengths: Vec<u32> = (0..3).map(|i| whole(dist(pins[i], pins[(i + 1) % 3]))).collect();
    Shown {
        params: vec![
            ("a".to_string(), lengths[0]),
            ("b".to_string(), lengths[1]),
            ("c".to_string(), lengths[2]),
        ],
        pins,
        lengths,
        quality,
    }
}

/// `pins` are the three corners and the height's foot.
fn triangle_area(pins: Vec<P>, quality: f64) -> Shown {
    let (apex, base, _, _) = height_of(&pins[..3], pins[3]);
    let mut lengths: Vec<u32> = (0..3).map(|i| whole(dist(pins[i], pins[(i + 1) % 3]))).collect();
    let a = whole(dist(pins[base.0], pins[base.1]));
    let t = whole(dist(pins[apex], pins[3]));
    lengths.push(t);
    Shown {
        params: vec![("a".to_string(), a), ("t".to_string(), t)],
        pins,
        lengths,
        quality,
    }
}

/// For a height ending at `foot`: the apex, the base it falls on, the foot
/// on that base's line, and how far `foot` is from the line.
fn height_of(corners: &[P], foot: P) -> (usize, (usize, usize), P, f64) {
    let mut best = (0, (1, 2), foot, f64::INFINITY);
    for apex in 0..3 {
        let base = ((apex + 1) % 3, (apex + 2) % 3);
        let on = foot_on(corners[base.0], corners[base.1], foot);
        let d = dist(on, foot);
        if d < best.3 {
            best = (apex, base, on, d);
        }
    }
    best
}

/// The point of line a-b nearest to `p` (kept between a and b).
fn foot_on(a: P, b: P, p: P) -> P {
    let ab = sub(b, a);
    let l2 = dot(ab, ab);
    if l2 == 0.0 {
        return a;
    }
    let t = (dot(sub(p, a), ab) / l2).clamp(0.0, 1.0);
    [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]
}

fn round_one(pins: Vec<P>, name: &str, quality: f64) -> Shown {
    let v = whole(dist(pins[0], pins[1]));
    Shown {
        pins,
        lengths: vec![0, v],
        params: vec![(name.to_string(), v)],
        quality,
    }
}

/// The three edges from the first pin: the most upright is the height, the
/// longer of the others the length.
fn box_edges(shape: Shape, pins: Vec<P>, quality: f64) -> Looked {
    let edges: Vec<P> = (1..4).map(|i| sub(pins[i], pins[0])).collect();
    let sizes: Vec<f64> = edges.iter().map(|e| len(*e)).collect();
    let up = (0..3)
        .max_by(|a, b| {
            let ua = edges[*a][1].abs() / sizes[*a].max(1e-9);
            let ub = edges[*b][1].abs() / sizes[*b].max(1e-9);
            ua.total_cmp(&ub)
        })
        .unwrap_or(2);
    let mut lengths = vec![0];
    lengths.extend(sizes.iter().map(|s| whole(*s)));
    let params = if shape == Shape::Cube {
        let s = whole(sizes.iter().sum::<f64>() / 3.0);
        lengths = vec![0, s, s, s];
        vec![("s".to_string(), s)]
    } else {
        let t = whole(sizes[up]);
        let mut flat: Vec<u32> = (0..3).filter(|i| *i != up).map(|i| whole(sizes[i])).collect();
        flat.sort_unstable();
        vec![
            ("p".to_string(), flat[1]),
            ("l".to_string(), flat[0]),
            ("t".to_string(), t),
        ]
    };
    Ok(Shown {
        pins,
        lengths,
        params,
        quality,
    })
}

/// How square a real corner is, 1 at best.
fn squareness(deviation_deg: f64, limit: f64) -> f64 {
    if deviation_deg <= limit / 4.0 {
        1.0
    } else if deviation_deg <= limit / 2.0 {
        0.7
    } else {
        0.4
    }
}

/// Judges pins on a real object: the shape they make.
fn real(shape: Shape, task: Task, points: &[P]) -> Looked {
    let short = |pins: &[P], n: usize, round: bool| -> bool {
        (0..n).any(|i| {
            let j = if round { (i + 1) % pins.len() } else { i + 1 };
            j < pins.len() && dist(pins[i], pins[j]) < SHORTEST_CM
        })
    };
    match shape {
        Shape::Square | Shape::Rectangle => {
            need(points, 4)?;
            if short(points, 4, true) {
                return Err(("too_small", points.to_vec()));
            }
            // The fourth pin on the plane of the first three.
            let n = cross(sub(points[1], points[0]), sub(points[2], points[0]));
            let off = dot(sub(points[3], points[0]), n).abs() / len(n).max(1e-9);
            if off > SNAP_CM {
                return Err(("not_flat", points.to_vec()));
            }
            let mut worst: f64 = 0.0;
            let mut sum = 0.0;
            for i in 0..4 {
                let a = sub(points[(i + 3) % 4], points[i]);
                let b = sub(points[(i + 1) % 4], points[i]);
                let dev = (angle(a, b) - 90.0).abs();
                worst = worst.max(dev);
                sum += dev;
            }
            if worst > SQUARE_DEG {
                return Err(("not_square_corner", points.to_vec()));
            }
            let sides: Vec<f64> = (0..4).map(|i| dist(points[i], points[(i + 1) % 4])).collect();
            let differ = |a: f64, b: f64| (a - b).abs() / a.max(b) > 0.2;
            if differ(sides[0], sides[2]) || differ(sides[1], sides[3]) {
                return Err(("sides_differ", points.to_vec()));
            }
            if shape == Shape::Square {
                let (lo, hi) = sides
                    .iter()
                    .fold((f64::INFINITY, 0.0_f64), |(lo, hi), s| (lo.min(*s), hi.max(*s)));
                if (hi - lo) / hi > 0.15 {
                    return Err(("not_square", points.to_vec()));
                }
            }
            Ok(flat4(shape, points.to_vec(), squareness(sum / 4.0, SQUARE_DEG)))
        }
        Shape::Triangle => {
            let n = if task == Task::Area { 4 } else { 3 };
            need(points, n)?;
            if short(points, 3, true) {
                return Err(("too_small", points.to_vec()));
            }
            let smallest = (0..3)
                .map(|i| {
                    angle(
                        sub(points[(i + 1) % 3], points[i]),
                        sub(points[(i + 2) % 3], points[i]),
                    )
                })
                .fold(180.0_f64, f64::min);
            if smallest < 12.0 {
                return Err(("flat_triangle", points.to_vec()));
            }
            if task == Task::Area {
                let (apex, base, on, d) = height_of(&points[..3], points[3]);
                let up = sub(points[apex], points[3]);
                let along = sub(points[base.1], points[base.0]);
                let dev = (angle(up, along) - 90.0).abs();
                if d > SNAP_CM || dev > SQUARE_DEG || len(up) < SHORTEST_CM / 2.0 {
                    return Err(("height_not_upright", points.to_vec()));
                }
                let mut pins = points[..3].to_vec();
                pins.push(on);
                return Ok(triangle_area(pins, squareness(dev, SQUARE_DEG)));
            }
            Ok(triangle_perimeter(points.to_vec(), 1.0))
        }
        Shape::Circle | Shape::Cylinder => {
            need(points, 2)?;
            if dist(points[0], points[1]) < SHORTEST_CM - 1.0 {
                return Err(("too_small", points.to_vec()));
            }
            Ok(round_one(points.to_vec(), "r", 1.0))
        }
        Shape::Sphere => {
            need(points, 2)?;
            if dist(points[0], points[1]) < 2.0 * SHORTEST_CM {
                return Err(("too_small", points.to_vec()));
            }
            Ok(round_one(points.to_vec(), "d", 1.0))
        }
        Shape::Cube | Shape::Cuboid => {
            need(points, 4)?;
            let edges: Vec<P> = (1..4).map(|i| sub(points[i], points[0])).collect();
            if edges.iter().any(|e| len(*e) < SHORTEST_CM) {
                return Err(("too_small", points.to_vec()));
            }
            let mut worst: f64 = 0.0;
            let mut sum = 0.0;
            for (a, b) in [(0, 1), (0, 2), (1, 2)] {
                let dev = (angle(edges[a], edges[b]) - 90.0).abs();
                worst = worst.max(dev);
                sum += dev;
            }
            if worst > BOX_DEG {
                return Err(("not_square_corner", points.to_vec()));
            }
            if shape == Shape::Cube {
                let s: Vec<f64> = edges.iter().map(|e| len(*e)).collect();
                let (lo, hi) = s
                    .iter()
                    .fold((f64::INFINITY, 0.0_f64), |(lo, hi), v| (lo.min(*v), hi.max(*v)));
                if (hi - lo) / hi > 0.15 {
                    return Err(("not_cube", points.to_vec()));
                }
            }
            box_edges(shape, points.to_vec(), squareness(sum / 3.0, BOX_DEG))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hunt(grade: Option<u8>) -> Hunt {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../content/templates");
        let templates: Vec<ItemTemplate> = std::fs::read_dir(dir)
            .expect("templates")
            .filter_map(|e| {
                let p = e.ok()?.path();
                let text = std::fs::read_to_string(&p).ok()?;
                ItemTemplate::from_json(&text).ok()
            })
            .collect();
        let cfg = HuntConfig {
            seed: 7,
            grade,
            player_id: "me".into(),
            content_pack_version: "test".into(),
        };
        let (h, rejected) = Hunt::new(templates, cfg, FairnessParams::default()).expect("hunt");
        assert!(rejected.is_empty(), "{rejected:?}");
        h
    }

    fn task_id(h: &Hunt, shape: Shape, task: Task) -> String {
        h.kinds
            .iter()
            .find(|k| k.shape == shape && k.task == task)
            .map(|k| h.templates[k.template].source.id.clone())
            .expect("task")
    }

    #[test]
    fn grades_get_their_own_questions() {
        let g4 = hunt(Some(4));
        let flat: Vec<Task> = g4.tasks(false).iter().map(|t| t.task).collect();
        assert!(flat.contains(&Task::Perimeter));
        assert!(g4.tasks(false).iter().all(|t| t.shape != Shape::Circle));
        assert!(g4.tasks(true).iter().all(|t| t.task == Task::Edges));
        let g6 = hunt(Some(6));
        assert!(g6.tasks(false).iter().any(|t| t.shape == Shape::Circle));
        assert!(g6.tasks(true).iter().any(|t| t.task == Task::Surface));
        assert!(g6.tasks(true).iter().all(|t| t.task != Task::Edges));
    }

    #[test]
    fn pins_on_a_paper_rectangle_snap_and_score_in_full() {
        let mut h = hunt(Some(4));
        let id = task_id(&h, Shape::Rectangle, Task::Perimeter);
        let offer = h.next(&id, false, Source::Paper, 0.0).expect("offer");
        let (p, l) = (offer.size["p"], offer.size["l"]);
        // Each pin a centimetre off its corner.
        let pins: Vec<P> = offer.keys.iter().map(|k| [k[0] + 1.0, 0.3, k[2]]).collect();
        let r = h.measure(offer.offer_id, &Pins { points: pins }).expect("reading");
        assert!(r.ok, "{:?}", r.problem);
        assert_eq!(r.lengths, vec![p as u32, l as u32, p as u32, l as u32]);
        assert_eq!(r.process_points, PROCESS_MAX);
        assert_eq!(r.choices.len(), CHOICES);
        let right = format!("{}", 2 * (p as u32 + l as u32));
        let i = r.choices.iter().position(|c| *c == right).expect("answer among the choices");
        let v = h.answer(offer.offer_id, i, 4000.0).expect("verdict");
        assert!(v.correct);
        assert_eq!(v.points, PROCESS_MAX + ANSWER_POINTS);
        let events = h.drain_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].game_type, GameType::MeasureHunt);
        assert_eq!(events[0].template_id, id);
        assert_eq!(events[0].time_ms, 4000.0);
    }

    #[test]
    fn a_diagonal_thread_is_sent_back_and_costs_structure() {
        let mut h = hunt(Some(4));
        let id = task_id(&h, Shape::Rectangle, Task::Perimeter);
        let offer = h.next(&id, false, Source::Paper, 0.0).expect("offer");
        let k = &offer.keys;
        let crossed = vec![k[0], k[2], k[1], k[3]];
        let r = h.measure(offer.offer_id, &Pins { points: crossed }).expect("reading");
        assert!(!r.ok);
        assert_eq!(r.problem, Some("diagonal"));
        assert!(r.choices.is_empty());
        let r = h.measure(offer.offer_id, &Pins { points: k.clone() }).expect("reading");
        assert!(r.ok);
        assert_eq!(r.process_points, 50);
    }

    #[test]
    fn a_pin_off_every_corner_is_refused() {
        let mut h = hunt(Some(4));
        let id = task_id(&h, Shape::Square, Task::Perimeter);
        let offer = h.next(&id, false, Source::Paper, 0.0).expect("offer");
        let mut pins = offer.keys.clone();
        pins[2] = [0.0, 0.0, 0.0];
        let r = h.measure(offer.offer_id, &Pins { points: pins }).expect("reading");
        assert_eq!(r.problem, Some("off_corner"));
    }

    #[test]
    fn a_real_table_top_is_measured_from_the_pins() {
        let mut h = hunt(Some(5));
        let id = task_id(&h, Shape::Rectangle, Task::Area);
        let offer = h.next(&id, false, Source::Real, 0.0).expect("offer");
        assert!(offer.size.is_empty());
        // 120 by 60 cm, a little uneven, as a fingertip leaves it.
        let pins = vec![[0.0, 0.0, 0.0], [120.4, 0.5, 1.0], [121.0, 0.2, 60.3], [0.6, -0.4, 59.7]];
        let r = h.measure(offer.offer_id, &Pins { points: pins }).expect("reading");
        assert!(r.ok, "{:?}", r.problem);
        assert_eq!(r.lengths, vec![120, 60, 120, 60]);
        assert!(r.choices.contains(&"7200".to_string()), "{:?}", r.choices);
        // Only the shape is judged, so the process counts for at most 40 points.
        assert_eq!(r.process_points, REAL_PROCESS_MAX);
    }

    #[test]
    fn a_real_shape_that_is_not_a_rectangle_is_refused() {
        let mut h = hunt(Some(5));
        let id = task_id(&h, Shape::Rectangle, Task::Area);
        let offer = h.next(&id, false, Source::Real, 0.0).expect("offer");
        let kite = vec![[0.0, 0.0, 0.0], [30.0, 0.0, -20.0], [60.0, 0.0, 0.0], [30.0, 0.0, 20.0]];
        let r = h.measure(offer.offer_id, &Pins { points: kite }).expect("reading");
        assert_eq!(r.problem, Some("not_square_corner"));
    }

    #[test]
    fn a_triangle_area_needs_an_upright_height() {
        let mut h = hunt(Some(5));
        let id = task_id(&h, Shape::Triangle, Task::Area);
        let offer = h.next(&id, false, Source::Real, 0.0).expect("offer");
        let corners = [[0.0, 0.0, 0.0], [30.0, 0.0, 0.0], [10.0, 0.0, -20.0]];
        let mut slanted = corners.to_vec();
        slanted.push([20.0, 0.0, 0.0]);
        let r = h.measure(offer.offer_id, &Pins { points: slanted }).expect("reading");
        assert_eq!(r.problem, Some("height_not_upright"));
        let mut upright = corners.to_vec();
        upright.push([10.0, 0.0, 0.5]);
        let r = h.measure(offer.offer_id, &Pins { points: upright }).expect("reading");
        assert!(r.ok, "{:?}", r.problem);
        assert_eq!(r.lengths[3], 20);
        assert!(r.choices.contains(&"300".to_string()), "{:?}", r.choices);
    }

    #[test]
    fn a_paper_box_is_measured_from_one_corner() {
        let mut h = hunt(Some(5));
        let id = task_id(&h, Shape::Cuboid, Task::Volume);
        let offer = h.next(&id, true, Source::Paper, 0.0).expect("offer");
        let k = &offer.keys;
        // Corner 0, its two bottom neighbours and the corner above it.
        let r = h
            .measure(offer.offer_id, &Pins { points: vec![k[0], k[1], k[3], k[4]] })
            .expect("reading");
        assert!(r.ok, "{:?}", r.problem);
        let (p, l, t) = (offer.size["p"], offer.size["l"], offer.size["t"]);
        assert!(r.choices.contains(&format!("{}", (p * l * t) as u32)), "{:?}", r.choices);
        // Across a face is not an edge.
        let offer = h.next(&id, true, Source::Paper, 0.0).expect("offer");
        let k = &offer.keys;
        let r = h
            .measure(offer.offer_id, &Pins { points: vec![k[0], k[2], k[3], k[4]] })
            .expect("reading");
        assert_eq!(r.problem, Some("not_an_edge"));
    }

    #[test]
    fn the_compass_snaps_to_a_paper_circle() {
        let mut h = hunt(Some(6));
        let id = task_id(&h, Shape::Circle, Task::Area);
        let offer = h.next(&id, false, Source::Paper, 0.0).expect("offer");
        let r0 = offer.size["r"];
        let r = h
            .measure(offer.offer_id, &Pins { points: vec![[1.0, 0.0, 0.5], [0.0, 0.2, r0 + 1.5]] })
            .expect("reading");
        assert!(r.ok, "{:?}", r.problem);
        assert_eq!(r.lengths[1], r0 as u32);
        let area = format_number(
            &Rational::from_f64(3.14 * r0 * r0).expect("area"),
            NumberFormat::Decimal { places: 2 },
        )
        .expect("text");
        assert!(r.choices.contains(&area), "{area} {:?}", r.choices);
    }

    #[test]
    fn five_different_choices_every_time() {
        let mut h = hunt(None);
        for solid in [false, true] {
            for t in h.tasks(solid) {
                let offer = h.next(&t.template_id, solid, Source::Paper, 0.0).expect("offer");
                let mut pins = offer.keys.clone();
                match offer.shape {
                    Shape::Cube | Shape::Cuboid => pins = vec![pins[0], pins[1], pins[3], pins[4]],
                    Shape::Triangle if offer.task == Task::Area => pins.push(pins[0]),
                    _ => {}
                }
                let r = h.measure(offer.offer_id, &Pins { points: pins }).expect("reading");
                assert!(r.ok, "{} {:?}", t.template_id, r.problem);
                let mut c = r.choices.clone();
                c.sort();
                c.dedup();
                assert_eq!(c.len(), CHOICES, "{} {:?}", t.template_id, r.choices);
            }
        }
    }

    #[test]
    fn a_wrong_choice_keeps_the_process_points_and_names_the_lure() {
        let mut h = hunt(Some(4));
        let id = task_id(&h, Shape::Square, Task::Perimeter);
        let offer = h.next(&id, false, Source::Paper, 0.0).expect("offer");
        let s = offer.size["s"] as u32;
        let r = h.measure(offer.offer_id, &Pins { points: offer.keys.clone() }).expect("reading");
        let lure = r.choices.iter().position(|c| *c == format!("{}", s * s)).expect("area lure");
        let v = h.answer(offer.offer_id, lure, 1000.0).expect("verdict");
        assert!(!v.correct);
        assert_eq!(v.points, PROCESS_MAX);
        assert_eq!(v.misconception.as_deref(), Some("gave_area"));
        assert_eq!(v.expected_text, format!("{}", 4 * s));
        assert!(h.answer(offer.offer_id, 0, 1000.0).is_err());
    }
}
