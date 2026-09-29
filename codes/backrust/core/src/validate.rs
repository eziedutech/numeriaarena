//! Deterministic template validator, run before any template goes live.
//!
//! Every failure is named with an example so a person can fix it (global
//! rule 18). Checks this code cannot do yet are listed in `not_checked`
//! instead of being silently skipped.

use serde::{Deserialize, Serialize};

use crate::dsl::{Env, Value};
use crate::format::format_number;
use crate::rational::Rational;
use crate::rng::Rng;
use crate::template::{
    AnswerFormat, AnswerKind, CompiledTemplate, ItemTemplate, MEASURED_VAR, Status,
};

pub const VALIDATOR_VERSION: &str = "validator-0.1.0";

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Issue {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub example: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SkillEntry {
    pub code: String,
    pub grades: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SkillCatalog {
    pub version: String,
    pub skills: Vec<SkillEntry>,
}

impl SkillCatalog {
    pub fn from_json(text: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(text)
    }

    pub fn get(&self, code: &str) -> Option<&SkillEntry> {
        self.skills.iter().find(|s| s.code == code)
    }
}

#[derive(Clone, Debug)]
pub struct Options {
    pub samples: u32,
    pub seed: u64,
    pub min_constraint_rate: f64,
    /// Distinct distractors every item should keep after collisions are dropped.
    pub min_distinct_distractors: usize,
    /// Share of draws that must keep `min_distinct_distractors`.
    pub min_distinct_rate: f64,
    /// A distractor kept in fewer draws than this is flagged as nearly useless.
    pub min_distractor_keep_rate: f64,
    pub b_low: f64,
    pub b_high: f64,
    pub max_prompt_chars: usize,
    pub max_label_chars: usize,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            samples: 2000,
            seed: 20260929,
            min_constraint_rate: 0.95,
            min_distinct_distractors: 2,
            min_distinct_rate: 0.90,
            min_distractor_keep_rate: 0.50,
            b_low: -4.0,
            b_high: 3.0,
            max_prompt_chars: 60,
            max_label_chars: 40,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct Stats {
    pub attempts: u32,
    pub accepted: u32,
    pub constraint_rate: f64,
    pub longest_prompt_en: usize,
    pub longest_prompt_id: usize,
    pub b_min: f64,
    pub b_max: f64,
    pub feature_true_counts: Vec<u32>,
    /// Share of draws in which each distractor is kept (not dropped as a collision).
    pub distractor_ok_rates: Vec<(String, f64)>,
    /// Share of draws that keep the required number of distinct distractors.
    pub distinct_distractor_rate: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Report {
    pub template_id: String,
    pub validator_version: &'static str,
    pub passed: bool,
    pub issues: Vec<Issue>,
    pub not_checked: Vec<&'static str>,
    pub stats: Stats,
}

/// Largest answer a grade may see. Starting values, not results: tune after review.
fn magnitude_limit(grades: &[u8]) -> Rational {
    match grades.iter().min() {
        Some(4) | None => Rational::int(1_000_000),
        _ => Rational::int(10_000_000),
    }
}

const EMDASH: char = '\u{2014}';

fn describe(env: &Env) -> String {
    env.iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join(", ")
}

struct Collector {
    issues: Vec<Issue>,
}

impl Collector {
    fn push(&mut self, code: &'static str, message: String, example: Option<String>) {
        // One entry per code keeps the report readable; the first example is enough to reproduce.
        if !self
            .issues
            .iter()
            .any(|i| i.code == code && i.message == message)
        {
            self.issues.push(Issue {
                code,
                message,
                example,
            });
        }
    }
}

pub fn validate(template: &ItemTemplate, skills: &SkillCatalog, opts: &Options) -> Report {
    let mut c = Collector { issues: Vec::new() };
    let mut stats = Stats {
        b_min: f64::INFINITY,
        b_max: f64::NEG_INFINITY,
        ..Stats::default()
    };
    let not_checked = vec![
        "json_schema: run content-cli, which checks item-template.schema.json",
        "game_adapters: orb_forge and bridge_builder solvability is checked when those adapters are built (week 1 and 4)",
        "brand names, real people, specific real places: manual review by a person",
    ];

    // Structure (step 3 and bookkeeping).
    let suffix = format!(".v{}", template.version);
    if !template.id.ends_with(&suffix) {
        c.push(
            "id_version",
            format!("id {} does not end with {suffix}", template.id),
            None,
        );
    }
    if template.status == Status::Retired
        && template.retired_reason.as_deref().unwrap_or("").is_empty()
    {
        c.push(
            "retired_reason",
            "retired templates need retired_reason".into(),
            None,
        );
    }
    match skills.get(&template.skill) {
        None => c.push(
            "skill_unknown",
            format!(
                "skill {} is not in skills.json {}",
                template.skill, skills.version
            ),
            None,
        ),
        Some(skill) => {
            for g in &template.grades {
                if !skill.grades.contains(g) {
                    c.push(
                        "grade_outside_skill",
                        format!(
                            "grade {g} is outside skill {} grades {:?}",
                            skill.code, skill.grades
                        ),
                        None,
                    );
                }
            }
        }
    }
    let format_ok = match (template.answer_kind, template.answer.format) {
        (AnswerKind::Predicate, f) => f == AnswerFormat::Bool,
        (AnswerKind::Estimate, f) => f == AnswerFormat::Measure,
        (AnswerKind::Value | AnswerKind::Equation, f) => f != AnswerFormat::Bool,
        (AnswerKind::Compare, _) => true,
    };
    if !format_ok {
        c.push(
            "answer_format",
            format!(
                "answer_kind {:?} cannot use format {:?}",
                template.answer_kind, template.answer.format
            ),
            None,
        );
    }
    for (what, text) in [
        ("prompt.en", &template.prompt.en),
        ("prompt.id", &template.prompt.id),
    ] {
        if text.trim().is_empty() {
            c.push("prompt_missing", format!("{what} is empty"), None);
        }
        if text.contains(EMDASH) {
            c.push(
                "emdash",
                format!("{what} contains an emdash"),
                Some(text.clone()),
            );
        }
    }
    if let Some(p) = &template.predicate {
        for g in &p.gates {
            for t in [&g.label.en, &g.label.id] {
                if t.contains(EMDASH) {
                    c.push(
                        "emdash",
                        "gate label contains an emdash".into(),
                        Some(t.clone()),
                    );
                }
            }
        }
    }

    // Parse (step 2).
    let compiled = match CompiledTemplate::compile(template.clone()) {
        Ok(ct) => ct,
        Err(parse_issues) => {
            c.issues.extend(parse_issues);
            return finish(template, c, not_checked, stats);
        }
    };

    // Sampling (steps 4, 5, 6 partly, 7, 8).
    let mut rng = Rng::new(opts.seed);
    let limit = magnitude_limit(&template.grades);
    let answer_fmt = compiled.answer_format();
    let n_distractors = template.distractors.len();
    let mut distractor_ok = vec![0u32; n_distractors];
    let mut distinct_ok = 0u32;
    let n_features = template.difficulty.features.len();
    let mut feature_true = vec![0u32; n_features];

    for _ in 0..opts.samples {
        stats.attempts += 1;
        let env = match compiled.sample_params(&mut rng) {
            Ok(env) => env,
            Err(e) => {
                c.push(
                    "param_sampling",
                    format!("parameters could not be drawn: {e}"),
                    None,
                );
                continue;
            }
        };
        match compiled.constraints_hold(&env) {
            Ok(true) => {}
            Ok(false) => continue,
            Err(e) => {
                c.push(
                    "constraint_error",
                    format!("a constraint failed to evaluate: {e}"),
                    Some(describe(&env)),
                );
                continue;
            }
        }
        stats.accepted += 1;

        let mut env = env;
        if template.answer_kind == AnswerKind::Estimate {
            // Any plausible real measurement; the answer is the measurement itself.
            let measured = rng.int_between(20, 200).unwrap_or(100);
            env.insert(MEASURED_VAR.into(), Value::Num(Rational::int(measured)));
        }

        // Prompt length after filling placeholders.
        match compiled.render_prompt(&env) {
            Ok(p) => {
                let (en, id) = (p.en.chars().count(), p.id.chars().count());
                stats.longest_prompt_en = stats.longest_prompt_en.max(en);
                stats.longest_prompt_id = stats.longest_prompt_id.max(id);
                if en > opts.max_prompt_chars || id > opts.max_prompt_chars {
                    c.push(
                        "prompt_too_long",
                        format!(
                            "prompt is longer than {} characters after filling",
                            opts.max_prompt_chars
                        ),
                        Some(format!("{} | {}", p.en, p.id)),
                    );
                }
            }
            Err(e) => c.push(
                "prompt_error",
                format!("prompt could not be filled: {e}"),
                Some(describe(&env)),
            ),
        }

        // Difficulty.
        for (i, flag) in compiled.feature_flags(&env).into_iter().enumerate() {
            match flag {
                Ok(true) => feature_true[i] += 1,
                Ok(false) => {}
                Err(e) => c.push(
                    "feature_error",
                    format!("difficulty feature {i} failed: {e}"),
                    Some(describe(&env)),
                ),
            }
        }
        if let Ok(b) = compiled.difficulty(&env) {
            stats.b_min = stats.b_min.min(b);
            stats.b_max = stats.b_max.max(b);
        }

        if template.answer_kind == AnswerKind::Predicate {
            check_predicate(&compiled, &env, &mut rng, template, opts, &mut c);
            continue;
        }

        // Answer.
        let answer = match compiled.eval_answer(&env) {
            Ok(v) => v,
            Err(e) => {
                c.push(
                    "answer_error",
                    format!("answer could not be computed: {e}"),
                    Some(describe(&env)),
                );
                continue;
            }
        };
        let answer_num = match (&answer, template.answer.format) {
            (Value::Num(v), _) => Some(*v),
            (Value::Bool(_), AnswerFormat::Bool) => None,
            _ => {
                c.push(
                    "answer_type",
                    "answer has the wrong kind of value for its format".into(),
                    Some(describe(&env)),
                );
                continue;
            }
        };
        if let Some(v) = answer_num {
            if v.is_negative() {
                c.push(
                    "answer_negative",
                    "answer is negative; grades 4 to 6 do not use negatives".into(),
                    Some(describe(&env)),
                );
            }
            let abs = if v.is_negative() {
                v.checked_neg().unwrap_or(v)
            } else {
                v
            };
            if abs > limit {
                c.push(
                    "answer_too_large",
                    format!("answer is above {limit} for these grades"),
                    Some(describe(&env)),
                );
            }
            if let Some(f) = answer_fmt
                && let Err(e) = format_number(&v, f)
            {
                c.push(
                    "answer_format_fit",
                    format!("answer does not fit its format: {e}"),
                    Some(describe(&env)),
                );
            }
        }

        // Distractors.
        let dfmt = compiled.distractor_format();
        let values: Vec<Option<Rational>> = compiled
            .eval_distractors(&env)
            .into_iter()
            .map(|(_, r)| match r {
                Ok(Value::Num(v))
                    if !v.is_negative() && dfmt.is_none_or(|f| format_number(&v, f).is_ok()) =>
                {
                    Some(v)
                }
                _ => None,
            })
            .collect();
        // Same rule as the game: in order, drop a distractor equal to the
        // answer or to one already kept.
        let mut kept: Vec<Rational> = Vec::new();
        for (i, v) in values.iter().enumerate() {
            let Some(v) = v else { continue };
            if answer_num.is_some_and(|a| a == *v) || kept.contains(v) {
                continue;
            }
            kept.push(*v);
            distractor_ok[i] += 1;
        }
        if kept.len() >= opts.min_distinct_distractors.min(n_distractors) {
            distinct_ok += 1;
        }
    }

    // Aggregate checks.
    stats.constraint_rate = if stats.attempts == 0 {
        0.0
    } else {
        stats.accepted as f64 / stats.attempts as f64
    };
    if stats.constraint_rate < opts.min_constraint_rate {
        c.push(
            "constraint_rate",
            format!(
                "only {:.1}% of random draws satisfy the constraints (needs {:.0}%)",
                stats.constraint_rate * 100.0,
                opts.min_constraint_rate * 100.0
            ),
            None,
        );
    }
    if stats.accepted > 0 {
        let needs_distractors = !matches!(
            template.answer_kind,
            AnswerKind::Predicate | AnswerKind::Estimate
        );
        if needs_distractors && n_distractors > 0 {
            stats.distinct_distractor_rate = distinct_ok as f64 / stats.accepted as f64;
            if stats.distinct_distractor_rate < opts.min_distinct_rate {
                c.push(
                    "distractor_rate",
                    format!(
                        "only {:.1}% of items keep {} different distractors (needs {:.0}%)",
                        stats.distinct_distractor_rate * 100.0,
                        opts.min_distinct_distractors.min(n_distractors),
                        opts.min_distinct_rate * 100.0
                    ),
                    None,
                );
            }
        }
        for (i, d) in template.distractors.iter().enumerate() {
            let rate = distractor_ok[i] as f64 / stats.accepted as f64;
            stats
                .distractor_ok_rates
                .push((d.misconception.clone(), rate));
            if needs_distractors && rate < opts.min_distractor_keep_rate {
                c.push(
                    "distractor_useless",
                    format!(
                        "distractor {} is kept in only {:.1}% of items (needs {:.0}%)",
                        d.misconception,
                        rate * 100.0,
                        opts.min_distractor_keep_rate * 100.0
                    ),
                    Some(d.expr.clone()),
                );
            }
        }
        for (i, f) in template.difficulty.features.iter().enumerate() {
            let count = feature_true[i];
            if count == 0 || count == stats.accepted {
                c.push(
                    "feature_dead",
                    format!(
                        "difficulty feature {i} is {} in every draw",
                        if count == 0 { "false" } else { "true" }
                    ),
                    Some(f.when.clone()),
                );
            }
        }
        if stats.b_min < opts.b_low || stats.b_max > opts.b_high {
            c.push(
                "b_range",
                format!(
                    "difficulty b ranges {:.2} to {:.2}, outside {} to {}",
                    stats.b_min, stats.b_max, opts.b_low, opts.b_high
                ),
                None,
            );
        }
    }
    stats.feature_true_counts = feature_true;
    if stats.accepted == 0 {
        stats.b_min = 0.0;
        stats.b_max = 0.0;
    }
    finish(template, c, not_checked, stats)
}

fn check_predicate(
    ct: &CompiledTemplate,
    env: &Env,
    rng: &mut Rng,
    t: &ItemTemplate,
    opts: &Options,
    c: &mut Collector,
) {
    let exclusive = t.predicate.as_ref().is_none_or(|p| p.exclusive);
    match ct.render_gate_labels(env) {
        Ok(labels) => {
            for l in labels {
                if l.en.chars().count() > opts.max_label_chars
                    || l.id.chars().count() > opts.max_label_chars
                {
                    c.push(
                        "label_too_long",
                        format!(
                            "gate label is longer than {} characters",
                            opts.max_label_chars
                        ),
                        Some(format!("{} | {}", l.en, l.id)),
                    );
                }
            }
        }
        Err(e) => c.push(
            "label_error",
            format!("gate label could not be filled: {e}"),
            Some(describe(env)),
        ),
    }
    let x = match ct.sample_pool_item(env, rng) {
        Ok(x) => x,
        Err(e) => {
            c.push(
                "item_pool",
                format!("item_pool could not be drawn: {e}"),
                Some(describe(env)),
            );
            return;
        }
    };
    match ct.gate_for(env, x) {
        Ok((None, _)) => c.push(
            "gate_none",
            "an item fits no gate".into(),
            Some(format!("{}, x={x}", describe(env))),
        ),
        Ok((_, n)) if exclusive && n > 1 => c.push(
            "gate_not_exclusive",
            "an item fits more than one gate".into(),
            Some(format!("{}, x={x}", describe(env))),
        ),
        Ok(_) => {}
        Err(e) => c.push(
            "gate_error",
            format!("a gate rule failed: {e}"),
            Some(format!("{}, x={x}", describe(env))),
        ),
    }
    let mut with_x = env.clone();
    with_x.insert(crate::template::ITEM_VAR.into(), Value::Num(x));
    if let Err(e) = ct.eval_answer(&with_x).and_then(|v| v.as_bool()) {
        c.push(
            "answer_error",
            format!("predicate answer must be true or false: {e}"),
            Some(describe(&with_x)),
        );
    }
}

fn finish(t: &ItemTemplate, c: Collector, not_checked: Vec<&'static str>, stats: Stats) -> Report {
    Report {
        template_id: t.id.clone(),
        validator_version: VALIDATOR_VERSION,
        passed: c.issues.is_empty(),
        issues: c.issues,
        not_checked,
        stats,
    }
}
