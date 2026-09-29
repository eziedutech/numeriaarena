//! Item templates: parsing, compiling and turning a template plus a seed
//! into one concrete item. The answer is always computed here, never
//! written by a person or a model.

use std::fmt;

use serde::de::{MapAccess, Visitor};
use serde::ser::SerializeMap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sha2::{Digest, Sha256};

use crate::dsl::{Env, Expr, Value, parse};
use crate::error::EvalError;
use crate::format::{NumberFormat, Unit, format_auto, format_number};
use crate::rational::Rational;
use crate::rng::Rng;
use crate::validate::Issue;

// ---------------------------------------------------------------- JSON model

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Draft,
    Validated,
    Reviewed,
    Live,
    Retired,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnswerKind {
    Value,
    Compare,
    Predicate,
    Equation,
    Estimate,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParamKind {
    Int,
    Decimal,
    Choice,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum Bound {
    Num(f64),
    Expr(String),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum ChoiceValue {
    Num(f64),
    Text(String),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ParamDef {
    #[serde(rename = "type")]
    pub kind: ParamKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<Bound>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<Bound>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub values: Option<Vec<ChoiceValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclude: Option<Vec<f64>>,
}

/// Parameters in declaration order: a bound may refer to earlier parameters.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Params(pub Vec<(String, ParamDef)>);

impl<'de> Deserialize<'de> for Params {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct OrderedParams;
        impl<'de> Visitor<'de> for OrderedParams {
            type Value = Params;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                write!(f, "an object of parameter definitions")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Params, A::Error> {
                let mut out = Vec::new();
                while let Some((name, def)) = map.next_entry::<String, ParamDef>()? {
                    out.push((name, def));
                }
                Ok(Params(out))
            }
        }
        deserializer.deserialize_map(OrderedParams)
    }
}

impl Serialize for Params {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (name, def) in &self.0 {
            map.serialize_entry(name, def)?;
        }
        map.end()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnswerFormat {
    Int,
    Fraction,
    Mixed,
    Decimal,
    Percent,
    Bool,
    Measure,
}

fn yes() -> bool {
    true
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AnswerSpec {
    pub expr: String,
    pub format: AnswerFormat,
    #[serde(default = "yes")]
    pub simplify: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decimal_places: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    #[serde(default = "yes")]
    pub accept_equivalent: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct I18n {
    pub en: String,
    pub id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Gate {
    pub rule: String,
    pub label: I18n,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PredicateSpec {
    pub gates: Vec<Gate>,
    pub item_pool: ParamDef,
    #[serde(default = "yes")]
    pub exclusive: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct EstimateSpec {
    pub target: String,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback_when_no_table: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Feature {
    pub when: String,
    pub add: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Difficulty {
    pub base: f64,
    #[serde(default)]
    pub features: Vec<Feature>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Distractor {
    pub expr: String,
    pub misconception: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ItemTemplate {
    pub id: String,
    pub version: u32,
    pub skill: String,
    pub grades: Vec<u8>,
    pub status: Status,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retired_reason: Option<String>,
    pub answer_kind: AnswerKind,
    pub params: Params,
    #[serde(default)]
    pub constraints: Vec<String>,
    pub answer: AnswerSpec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub predicate: Option<PredicateSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimate: Option<EstimateSpec>,
    pub difficulty: Difficulty,
    #[serde(default)]
    pub distractors: Vec<Distractor>,
    pub prompt: I18n,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visual_model: Option<String>,
    /// Shape is enforced by the JSON Schema; adapters read it when they are built.
    pub game_adapters: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub provenance: serde_json::Value,
}

impl ItemTemplate {
    pub fn from_json(text: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(text)
    }
}

// ---------------------------------------------------------------- compiled form

/// Variable that holds the sorted item in predicate templates.
pub const ITEM_VAR: &str = "x";
/// Variable that holds the real measurement in estimate templates.
pub const MEASURED_VAR: &str = "measured";

#[derive(Clone, Debug)]
enum Piece {
    Lit(String),
    Var(String),
    Expr(Expr),
}

#[derive(Clone, Debug)]
struct CompiledParam {
    name: String,
    kind: ParamKind,
    min: Option<Expr>,
    max: Option<Expr>,
    step: Option<Rational>,
    values: Vec<Value>,
    exclude: Vec<Rational>,
}

#[derive(Clone, Debug)]
pub struct CompiledTemplate {
    pub source: ItemTemplate,
    params: Vec<CompiledParam>,
    constraints: Vec<Expr>,
    answer: Expr,
    distractors: Vec<(Expr, String)>,
    features: Vec<(Expr, f64)>,
    gates: Vec<(Expr, Vec<Piece>, Vec<Piece>)>,
    item_pool: Option<CompiledParam>,
    prompt_en: Vec<Piece>,
    prompt_id: Vec<Piece>,
}

fn issue(code: &'static str, message: String) -> Issue {
    Issue {
        code,
        message,
        example: None,
    }
}

struct Scope<'a> {
    issues: &'a mut Vec<Issue>,
}

impl Scope<'_> {
    fn expr(&mut self, what: &str, src: &str, allowed: &[&str]) -> Option<Expr> {
        match parse(src) {
            Ok(e) => {
                for v in e.variables() {
                    if !allowed.contains(&v.as_str()) {
                        self.issues.push(issue(
                            "unknown_variable",
                            format!("{what}: '{v}' is not a parameter defined before it (expression: {src})"),
                        ));
                    }
                }
                Some(e)
            }
            Err(err) => {
                self.issues.push(issue(
                    "parse_error",
                    format!("{what}: {err} (expression: {src})"),
                ));
                None
            }
        }
    }

    fn bound(&mut self, what: &str, bound: &Option<Bound>, allowed: &[&str]) -> Option<Expr> {
        match bound {
            None => None,
            Some(Bound::Num(n)) => match Rational::from_f64(*n) {
                Some(r) => Some(Expr::Num(r)),
                None => {
                    self.issues.push(issue(
                        "bad_number",
                        format!("{what}: {n} is not a plain decimal"),
                    ));
                    None
                }
            },
            Some(Bound::Expr(src)) => self.expr(what, src, allowed),
        }
    }

    fn param(&mut self, name: &str, def: &ParamDef, allowed: &[&str]) -> Option<CompiledParam> {
        let before = self.issues.len();
        let min = self.bound(&format!("param {name}.min"), &def.min, allowed);
        let max = self.bound(&format!("param {name}.max"), &def.max, allowed);
        let step = match def.step {
            Some(s) => Rational::from_f64(s),
            None => None,
        };
        let mut values = Vec::new();
        for v in def.values.iter().flatten() {
            match v {
                ChoiceValue::Num(n) => match Rational::from_f64(*n) {
                    Some(r) => values.push(Value::Num(r)),
                    None => self.issues.push(issue(
                        "bad_number",
                        format!("param {name}: choice {n} is not a plain decimal"),
                    )),
                },
                ChoiceValue::Text(t) => values.push(Value::Text(t.clone())),
            }
        }
        let exclude = def
            .exclude
            .iter()
            .flatten()
            .filter_map(|n| Rational::from_f64(*n))
            .collect();
        match def.kind {
            ParamKind::Int | ParamKind::Decimal if def.min.is_none() || def.max.is_none() => {
                self.issues.push(issue(
                    "param_range",
                    format!("param {name}: int and decimal need min and max"),
                ));
            }
            ParamKind::Decimal if step.is_none() => {
                self.issues.push(issue(
                    "param_step",
                    format!("param {name}: decimal needs a positive step"),
                ));
            }
            ParamKind::Choice if values.is_empty() => {
                self.issues.push(issue(
                    "param_values",
                    format!("param {name}: choice needs values"),
                ));
            }
            _ => {}
        }
        if self.issues.len() > before {
            return None;
        }
        Some(CompiledParam {
            name: name.to_string(),
            kind: def.kind,
            min,
            max,
            step,
            values,
            exclude,
        })
    }

    fn text(&mut self, what: &str, src: &str, allowed: &[&str]) -> Vec<Piece> {
        let mut pieces = Vec::new();
        let mut rest = src;
        while let Some(open) = rest.find('{') {
            if open > 0 {
                pieces.push(Piece::Lit(rest[..open].to_string()));
            }
            let Some(close) = rest[open..].find('}') else {
                self.issues.push(issue(
                    "prompt_placeholder",
                    format!("{what}: '{{' without '}}' in {src:?}"),
                ));
                return pieces;
            };
            let inner = &rest[open + 1..open + close];
            if let Some(expr_src) = inner.strip_prefix('=') {
                if let Some(e) = self.expr(what, expr_src, allowed) {
                    pieces.push(Piece::Expr(e));
                }
            } else if allowed.contains(&inner) {
                pieces.push(Piece::Var(inner.to_string()));
            } else {
                self.issues.push(issue(
                    "prompt_placeholder",
                    format!("{what}: unknown placeholder {{{inner}}}"),
                ));
            }
            rest = &rest[open + close + 1..];
        }
        if !rest.is_empty() {
            pieces.push(Piece::Lit(rest.to_string()));
        }
        pieces
    }
}

impl CompiledTemplate {
    pub fn compile(source: ItemTemplate) -> Result<Self, Vec<Issue>> {
        let mut issues = Vec::new();
        let mut scope = Scope {
            issues: &mut issues,
        };

        let mut names: Vec<&str> = Vec::new();
        let mut params = Vec::new();
        for (name, def) in &source.params.0 {
            if names.contains(&name.as_str())
                || name == ITEM_VAR && source.answer_kind == AnswerKind::Predicate
            {
                scope.issues.push(issue(
                    "param_name",
                    format!("param name '{name}' is duplicated or reserved"),
                ));
            }
            if let Some(p) = scope.param(name, def, &names) {
                params.push(p);
            }
            names.push(name);
        }

        let mut full = names.clone();
        match source.answer_kind {
            AnswerKind::Predicate => full.push(ITEM_VAR),
            AnswerKind::Estimate => full.push(MEASURED_VAR),
            _ => {}
        }

        let constraints = source
            .constraints
            .iter()
            .enumerate()
            .filter_map(|(i, c)| scope.expr(&format!("constraint {i}"), c, &names))
            .collect();
        let answer = scope.expr("answer.expr", &source.answer.expr, &full);
        let distractors = source
            .distractors
            .iter()
            .filter_map(|d| {
                scope
                    .expr(&format!("distractor {}", d.misconception), &d.expr, &full)
                    .map(|e| (e, d.misconception.clone()))
            })
            .collect();
        let features = source
            .difficulty
            .features
            .iter()
            .enumerate()
            .filter_map(|(i, f)| {
                scope
                    .expr(&format!("difficulty feature {i}"), &f.when, &full)
                    .map(|e| (e, f.add))
            })
            .collect();

        let mut gates = Vec::new();
        let mut item_pool = None;
        if let Some(p) = &source.predicate {
            for (i, g) in p.gates.iter().enumerate() {
                let rule = scope.expr(&format!("gate {i} rule"), &g.rule, &full);
                let en = scope.text(&format!("gate {i} label.en"), &g.label.en, &names);
                let id = scope.text(&format!("gate {i} label.id"), &g.label.id, &names);
                if let Some(rule) = rule {
                    gates.push((rule, en, id));
                }
            }
            item_pool = scope.param("item_pool", &p.item_pool, &names);
        }
        if source.answer_kind == AnswerKind::Predicate && source.predicate.is_none() {
            scope.issues.push(issue(
                "predicate_missing",
                "answer_kind predicate needs a predicate block".into(),
            ));
        }
        if source.answer_kind == AnswerKind::Estimate && source.estimate.is_none() {
            scope.issues.push(issue(
                "estimate_missing",
                "answer_kind estimate needs an estimate block".into(),
            ));
        }

        let prompt_en = scope.text("prompt.en", &source.prompt.en, &names);
        let prompt_id = scope.text("prompt.id", &source.prompt.id, &names);

        match (answer, issues.is_empty()) {
            (Some(answer), true) => Ok(CompiledTemplate {
                source,
                params,
                constraints,
                answer,
                distractors,
                features,
                gates,
                item_pool,
                prompt_en,
                prompt_id,
            }),
            _ => Err(issues),
        }
    }

    pub fn answer_format(&self) -> Option<NumberFormat> {
        number_format(&self.source.answer)
    }

    /// Distractors keep up to 3 decimal places, so a misplaced-point mistake
    /// (4.7 + 0.358) can still be shown even when the answer needs only 2.
    pub fn distractor_format(&self) -> Option<NumberFormat> {
        match self.answer_format()? {
            NumberFormat::Decimal { places } => Some(NumberFormat::Decimal {
                places: places.max(3),
            }),
            other => Some(other),
        }
    }

    // ------------------------------------------------------------ sampling

    fn sample_param(p: &CompiledParam, env: &Env, rng: &mut Rng) -> Result<Value, SampleFail> {
        let bound = |e: &Option<Expr>| -> Result<Rational, SampleFail> {
            e.as_ref()
                .ok_or(SampleFail::EmptyRange(p.name.clone()))?
                .eval_num(env)
                .map_err(SampleFail::Eval)
        };
        match p.kind {
            ParamKind::Choice => {
                let i = rng.below(p.values.len() as u64) as usize;
                Ok(p.values[i].clone())
            }
            ParamKind::Int => {
                let lo = bound(&p.min)?.ceil();
                let hi = bound(&p.max)?.floor();
                for _ in 0..64 {
                    let v = Rational::int(
                        rng.int_between(lo, hi)
                            .ok_or(SampleFail::EmptyRange(p.name.clone()))?,
                    );
                    if !p.exclude.contains(&v) {
                        return Ok(Value::Num(v));
                    }
                }
                Err(SampleFail::EmptyRange(p.name.clone()))
            }
            ParamKind::Decimal => {
                let lo = bound(&p.min)?;
                let hi = bound(&p.max)?;
                let step = p.step.ok_or(SampleFail::EmptyRange(p.name.clone()))?;
                let count = hi
                    .checked_sub(&lo)
                    .and_then(|d| d.checked_div(&step))
                    .map_err(SampleFail::Eval)?
                    .floor();
                for _ in 0..64 {
                    let k = rng
                        .int_between(0, count)
                        .ok_or(SampleFail::EmptyRange(p.name.clone()))?;
                    let v = lo
                        .checked_add(
                            &step
                                .checked_mul(&Rational::int(k))
                                .map_err(SampleFail::Eval)?,
                        )
                        .map_err(SampleFail::Eval)?;
                    if !p.exclude.contains(&v) {
                        return Ok(Value::Num(v));
                    }
                }
                Err(SampleFail::EmptyRange(p.name.clone()))
            }
        }
    }

    /// One draw of all parameters, without checking constraints.
    pub fn sample_params(&self, rng: &mut Rng) -> Result<Env, SampleFail> {
        let mut env = Env::new();
        for p in &self.params {
            let v = Self::sample_param(p, &env, rng)?;
            env.insert(p.name.clone(), v);
        }
        Ok(env)
    }

    pub fn constraints_hold(&self, env: &Env) -> Result<bool, EvalError> {
        for c in &self.constraints {
            if !c.eval_bool(env)? {
                return Ok(false);
            }
        }
        Ok(true)
    }

    /// Draws parameters until the constraints hold (at most `max_tries` draws).
    pub fn sample_valid(&self, rng: &mut Rng, max_tries: u32) -> Result<Env, SampleFail> {
        let mut last = SampleFail::ConstraintsNeverHeld;
        for _ in 0..max_tries {
            match self.sample_params(rng) {
                Ok(env) => match self.constraints_hold(&env) {
                    Ok(true) => return Ok(env),
                    Ok(false) => last = SampleFail::ConstraintsNeverHeld,
                    Err(e) => last = SampleFail::Eval(e),
                },
                Err(e) => last = e,
            }
        }
        Err(last)
    }

    pub fn sample_pool_item(&self, env: &Env, rng: &mut Rng) -> Result<Rational, SampleFail> {
        let pool = self
            .item_pool
            .as_ref()
            .ok_or(SampleFail::EmptyRange("item_pool".into()))?;
        Self::sample_param(pool, env, rng)?
            .as_num()
            .map_err(SampleFail::Eval)
    }

    /// Index of the first gate whose rule is true for item `x`, and how many are true.
    pub fn gate_for(&self, env: &Env, x: Rational) -> Result<(Option<usize>, usize), EvalError> {
        let mut env = env.clone();
        env.insert(ITEM_VAR.into(), Value::Num(x));
        let mut first = None;
        let mut count = 0;
        for (i, (rule, _, _)) in self.gates.iter().enumerate() {
            if rule.eval_bool(&env)? {
                count += 1;
                first.get_or_insert(i);
            }
        }
        Ok((first, count))
    }

    pub fn eval_answer(&self, env: &Env) -> Result<Value, EvalError> {
        self.answer.eval(env)
    }

    /// Distractor values with their misconception code. Errors are kept, not dropped.
    pub fn eval_distractors(&self, env: &Env) -> Vec<(String, Result<Value, EvalError>)> {
        self.distractors
            .iter()
            .map(|(e, m)| (m.clone(), e.eval(env)))
            .collect()
    }

    pub fn feature_flags(&self, env: &Env) -> Vec<Result<bool, EvalError>> {
        self.features
            .iter()
            .map(|(e, _)| e.eval_bool(env))
            .collect()
    }

    pub fn difficulty(&self, env: &Env) -> Result<f64, EvalError> {
        let mut b = self.source.difficulty.base;
        for (e, add) in &self.features {
            if e.eval_bool(env)? {
                b += add;
            }
        }
        Ok(b)
    }

    pub fn render_prompt(&self, env: &Env) -> Result<I18n, EvalError> {
        Ok(I18n {
            en: render(&self.prompt_en, env)?,
            id: render(&self.prompt_id, env)?,
        })
    }

    pub fn render_gate_labels(&self, env: &Env) -> Result<Vec<I18n>, EvalError> {
        self.gates
            .iter()
            .map(|(_, en, id)| {
                Ok(I18n {
                    en: render(en, env)?,
                    id: render(id, env)?,
                })
            })
            .collect()
    }

    pub fn param_names(&self) -> Vec<&str> {
        self.params.iter().map(|p| p.name.as_str()).collect()
    }

    /// Short stable hash of the concrete parameters (first 16 hex digits of SHA-256).
    pub fn params_hash(&self, env: &Env) -> String {
        let mut canonical = self.source.id.clone();
        for p in &self.params {
            canonical.push('|');
            canonical.push_str(&p.name);
            canonical.push('=');
            if let Some(v) = env.get(&p.name) {
                canonical.push_str(&v.to_string());
            }
        }
        let digest = Sha256::digest(canonical.as_bytes());
        digest.iter().take(8).map(|b| format!("{b:02x}")).collect()
    }

    // ------------------------------------------------------------ concrete items

    /// Turns the template and a seed into one playable item.
    pub fn instantiate(&self, seed: u64) -> Result<Item, InstantiateError> {
        let mut rng = Rng::new(seed);
        let env = self
            .sample_valid(&mut rng, 200)
            .map_err(InstantiateError::Sample)?;
        let prompt = self.render_prompt(&env).map_err(InstantiateError::Eval)?;
        // Rounded so logged events read -0.1, not -0.09999999999999998.
        let b =
            (self.difficulty(&env).map_err(InstantiateError::Eval)? * 10000.0).round() / 10000.0;
        let params = self
            .params
            .iter()
            .map(|p| ParamValue {
                name: p.name.clone(),
                value: env.get(&p.name).map(display).unwrap_or_default(),
            })
            .collect();

        let mut answer = None;
        let mut distractors = Vec::new();
        let mut sort_items = Vec::new();
        let mut gates = Vec::new();

        match self.source.answer_kind {
            AnswerKind::Predicate => {
                gates = self
                    .render_gate_labels(&env)
                    .map_err(InstantiateError::Eval)?;
                let wave = self
                    .source
                    .game_adapters
                    .get("factory_sort")
                    .and_then(|a| a.get("items_per_wave"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(10);
                for _ in 0..wave {
                    let x = self
                        .sample_pool_item(&env, &mut rng)
                        .map_err(InstantiateError::Sample)?;
                    let (gate, _) = self.gate_for(&env, x).map_err(InstantiateError::Eval)?;
                    let gate = gate.ok_or(InstantiateError::NoGate(x.to_string()))?;
                    sort_items.push(SortItem {
                        text: format_auto(&x),
                        gate,
                    });
                }
            }
            AnswerKind::Estimate => {
                // The answer is the real measurement, known only at play time.
            }
            _ => {
                let value = self.eval_answer(&env).map_err(InstantiateError::Eval)?;
                let (out, num) = self.answer_out(&value).map_err(InstantiateError::Format)?;
                answer = Some(out);
                let dfmt = self.distractor_format();
                let mut taken: Vec<Rational> = num.into_iter().collect();
                for (misconception, result) in self.eval_distractors(&env) {
                    let Ok(Value::Num(v)) = result else { continue };
                    if v.is_negative() || taken.contains(&v) {
                        continue;
                    }
                    let Some(Ok(text)) = dfmt.map(|f| format_number(&v, f)) else {
                        continue;
                    };
                    taken.push(v);
                    distractors.push(DistractorOut {
                        text,
                        misconception,
                        num: v.num(),
                        den: v.den(),
                    });
                }
            }
        }

        Ok(Item {
            template_id: self.source.id.clone(),
            skill: self.source.skill.clone(),
            answer_kind: self.source.answer_kind,
            params,
            params_hash: self.params_hash(&env),
            b,
            prompt,
            answer,
            distractors,
            gates,
            sort_items,
            seed,
        })
    }

    fn answer_out(
        &self,
        value: &Value,
    ) -> Result<(AnswerOut, Option<Rational>), crate::format::FormatError> {
        Ok(match value {
            Value::Num(v) => {
                let text = match self.answer_format() {
                    Some(f) => format_number(v, f)?,
                    None => format_auto(v),
                };
                let shown = if self.source.answer.simplify {
                    v.reduced()
                } else {
                    *v
                };
                (
                    AnswerOut {
                        text,
                        num: Some(shown.num()),
                        den: Some(shown.den()),
                        raw_den: Some(v.den()),
                        truth: None,
                    },
                    Some(*v),
                )
            }
            Value::Bool(b) => (
                AnswerOut {
                    text: b.to_string(),
                    num: None,
                    den: None,
                    raw_den: None,
                    truth: Some(*b),
                },
                None,
            ),
            Value::Text(t) => (
                AnswerOut {
                    text: t.clone(),
                    num: None,
                    den: None,
                    raw_den: None,
                    truth: None,
                },
                None,
            ),
        })
    }

    /// Checks a player's numeric answer. With `accept_equivalent: false` the
    /// player must also use the expected spelling (for example simplest form).
    pub fn is_correct(&self, expected: &Rational, given: &Rational) -> bool {
        if expected != given {
            return false;
        }
        if self.source.answer.accept_equivalent {
            return true;
        }
        let spelled = if self.source.answer.simplify {
            expected.reduced()
        } else {
            *expected
        };
        spelled.num() == given.num() && spelled.den() == given.den()
    }
}

fn display(value: &Value) -> String {
    match value {
        Value::Num(r) => format_auto(r),
        other => other.to_string(),
    }
}

fn render(pieces: &[Piece], env: &Env) -> Result<String, EvalError> {
    let mut out = String::new();
    for p in pieces {
        match p {
            Piece::Lit(t) => out.push_str(t),
            Piece::Var(name) => match env.get(name) {
                Some(Value::Num(r)) => out.push_str(&format_auto(r)),
                Some(other) => out.push_str(&other.to_string()),
                None => return Err(EvalError::UnknownVariable(name.clone())),
            },
            Piece::Expr(e) => match e.eval(env)? {
                Value::Num(r) => out.push_str(&format_auto(&r)),
                other => out.push_str(&other.to_string()),
            },
        }
    }
    Ok(out)
}

pub fn number_format(spec: &AnswerSpec) -> Option<NumberFormat> {
    let places = spec.decimal_places;
    Some(match spec.format {
        AnswerFormat::Int => NumberFormat::Int,
        AnswerFormat::Fraction => NumberFormat::Fraction {
            simplify: spec.simplify,
        },
        AnswerFormat::Mixed => NumberFormat::Mixed {
            simplify: spec.simplify,
        },
        AnswerFormat::Decimal => NumberFormat::Decimal {
            places: places.unwrap_or(3),
        },
        AnswerFormat::Percent => NumberFormat::Percent {
            places: places.unwrap_or(0),
        },
        AnswerFormat::Measure => NumberFormat::Measure {
            unit: spec
                .unit
                .as_deref()
                .and_then(Unit::parse)
                .unwrap_or(Unit::Cm),
            places: places.unwrap_or(1),
        },
        AnswerFormat::Bool => return None,
    })
}

// ---------------------------------------------------------------- outputs

#[derive(Clone, Debug, PartialEq)]
pub enum SampleFail {
    EmptyRange(String),
    Eval(EvalError),
    ConstraintsNeverHeld,
}

impl fmt::Display for SampleFail {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SampleFail::EmptyRange(p) => write!(f, "no value fits the range of '{p}'"),
            SampleFail::Eval(e) => write!(f, "{e}"),
            SampleFail::ConstraintsNeverHeld => write!(f, "constraints never held"),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum InstantiateError {
    Sample(SampleFail),
    Eval(EvalError),
    Format(crate::format::FormatError),
    NoGate(String),
}

impl fmt::Display for InstantiateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            InstantiateError::Sample(e) => write!(f, "sampling failed: {e}"),
            InstantiateError::Eval(e) => write!(f, "evaluation failed: {e}"),
            InstantiateError::Format(e) => write!(f, "formatting failed: {e}"),
            InstantiateError::NoGate(x) => write!(f, "item {x} fits no gate"),
        }
    }
}

impl std::error::Error for InstantiateError {}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct ParamValue {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct AnswerOut {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num: Option<i128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub den: Option<i128>,
    /// Denominator as the template built it (2/8 keeps 8 even when shown as 1/4).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_den: Option<i128>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truth: Option<bool>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct DistractorOut {
    pub text: String,
    pub misconception: String,
    pub num: i128,
    pub den: i128,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct SortItem {
    pub text: String,
    pub gate: usize,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Item {
    pub template_id: String,
    pub skill: String,
    pub answer_kind: AnswerKind,
    pub params: Vec<ParamValue>,
    pub params_hash: String,
    pub b: f64,
    pub prompt: I18n,
    pub answer: Option<AnswerOut>,
    pub distractors: Vec<DistractorOut>,
    pub gates: Vec<I18n>,
    pub sort_items: Vec<SortItem>,
    pub seed: u64,
}
