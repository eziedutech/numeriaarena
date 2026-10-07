//! Fairness Engine: ability model, item choice, points, highlights, load balance.
//!
//! Pure functions only. Every number that shapes play lives in
//! `FairnessParams`, which is versioned and editable by an admin.
//! Speed never lowers a rating; wrong answers never cost points.

use serde::{Deserialize, Serialize};

use crate::rng::Rng;

// ---------------------------------------------------------------- parameters

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FairnessParams {
    pub version: String,
    /// Chance of success the selector aims for.
    pub target_p: f64,
    pub accept_low: f64,
    pub accept_high: f64,
    /// Share of items drawn from the harder exploration band.
    pub explore_rate: f64,
    pub explore_low: f64,
    pub explore_high: f64,
    /// After this many wrong answers in a row the next item aims at `relief_p`.
    pub relief_after_wrong: u32,
    pub relief_p: f64,
    /// After this many wrong answers in a row a visual demonstration is shown.
    pub demo_after_wrong: u32,
    /// Concrete items not repeated within this many recent items.
    pub no_repeat_window: usize,
    pub k_min: f64,
    pub k_max: f64,
    pub sigma_min: f64,
    pub sigma_max: f64,
    pub sigma_decay: f64,
    /// Sigma grows by this much per day without practice.
    pub sigma_daily_growth: f64,
    pub assisted_weight: f64,
    /// Placement: first answers per skill move theta by fixed steps.
    pub placement_items: u32,
    pub placement_step_up: f64,
    pub placement_step_down: f64,
    pub start_theta_grade4: f64,
    pub start_theta_grade5: f64,
    pub start_theta_grade6: f64,
    pub speed_bonus_max: f64,
    pub streak_bonus_step: f64,
    pub streak_bonus_max: f64,
    pub second_attempt_factor: f64,
    pub mastery_threshold: f64,
    pub mastery_min_correct: u32,
    pub mastery_min_game_types: usize,
    pub mastery_min_days: usize,
    pub bot_delta: f64,
    pub help_orb_cooldown_s: f64,
    /// Spawn rate as a share of the desk's own correct-answer rate.
    /// Below 1 so a desk is kept busy without piling up.
    pub spawn_pressure: f64,
    pub spawn_start_per_min: f64,
    pub spawn_min_per_min: f64,
    pub spawn_max_per_min: f64,
    pub k_item: f64,
    pub calibration_min_answers: u32,
}

impl Default for FairnessParams {
    /// Starting values from the design notes. Starting points, not results.
    fn default() -> Self {
        FairnessParams {
            version: "fp-2026-09-29.2".into(),
            target_p: 0.75,
            accept_low: 0.6,
            accept_high: 0.9,
            explore_rate: 0.10,
            explore_low: 0.45,
            explore_high: 0.6,
            relief_after_wrong: 2,
            relief_p: 0.9,
            demo_after_wrong: 3,
            no_repeat_window: 20,
            k_min: 0.08,
            k_max: 0.5,
            sigma_min: 0.25,
            sigma_max: 1.0,
            sigma_decay: 0.97,
            sigma_daily_growth: 0.02,
            assisted_weight: 0.5,
            placement_items: 8,
            placement_step_up: 0.5,
            placement_step_down: 1.0,
            start_theta_grade4: -0.5,
            start_theta_grade5: 0.0,
            start_theta_grade6: 0.5,
            speed_bonus_max: 0.20,
            streak_bonus_step: 0.05,
            streak_bonus_max: 0.25,
            second_attempt_factor: 0.5,
            mastery_threshold: 0.0,
            mastery_min_correct: 8,
            mastery_min_game_types: 2,
            mastery_min_days: 2,
            bot_delta: 0.3,
            help_orb_cooldown_s: 30.0,
            spawn_pressure: 0.9,
            spawn_start_per_min: 5.0,
            spawn_min_per_min: 2.0,
            spawn_max_per_min: 10.0,
            k_item: 0.02,
            calibration_min_answers: 200,
        }
    }
}

// ---------------------------------------------------------------- game types

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameType {
    OrbForge,
    BalloonBurst,
    FactorySort,
    BridgeBuilder,
    BalanceGate,
    MeasureHunt,
}

impl GameType {
    /// Discrimination per game type (`a_game`). Starting values.
    pub fn discrimination(self) -> f64 {
        match self {
            GameType::BalloonBurst | GameType::FactorySort => 1.0,
            _ => 1.2,
        }
    }

    /// How much longer than the expected answer time an answer of this game
    /// may take for the same speed bonus: building takes longer than picking.
    pub fn time_factor(self) -> f64 {
        match self {
            GameType::OrbForge | GameType::BridgeBuilder | GameType::MeasureHunt => 1.5,
            _ => 1.0,
        }
    }
}

// ---------------------------------------------------------------- ability

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Rating {
    pub theta: f64,
    pub sigma: f64,
    /// Answers that updated this rating (placement uses the first few).
    pub answers: u32,
}

impl Rating {
    pub fn start(grade: Option<u8>, p: &FairnessParams) -> Rating {
        // Grades 4 to 6 have their own start; the others go on by the same step.
        let step = (p.start_theta_grade6 - p.start_theta_grade4) / 2.0;
        let theta = match grade {
            Some(4) => p.start_theta_grade4,
            Some(5) => p.start_theta_grade5,
            Some(6) => p.start_theta_grade6,
            Some(g @ 1..=3) => p.start_theta_grade4 - step * f64::from(4 - g),
            Some(g @ 7..=9) => p.start_theta_grade6 + step * f64::from(g - 6),
            _ => 0.0,
        };
        Rating {
            theta,
            sigma: p.sigma_max,
            answers: 0,
        }
    }

    /// Sigma grows slowly while a skill is not practised.
    pub fn after_idle_days(self, days: u32, p: &FairnessParams) -> Rating {
        let sigma = (self.sigma + p.sigma_daily_growth * days as f64).min(p.sigma_max);
        Rating { sigma, ..self }
    }
}

/// Chance of a correct answer, with guessing for choice games.
/// `choices` is the number of options in Balloon Burst, Balance Gate and
/// Factory Sort, `None` elsewhere.
pub fn p_correct(theta: f64, b: f64, game: GameType, choices: Option<u32>) -> f64 {
    let p = 1.0 / (1.0 + (-(theta - b) * game.discrimination()).exp());
    let c = match (game, choices) {
        (GameType::BalloonBurst | GameType::BalanceGate | GameType::FactorySort, Some(n))
            if n > 0 =>
        {
            1.0 / n as f64
        }
        _ => 0.0,
    };
    c + (1.0 - c) * p
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Correct,
    Wrong,
    /// Cancelled for a technical reason (tracking lost, network): no update.
    Void,
}

/// Elo with a K that follows uncertainty; fixed steps while placing.
pub fn update(
    r: Rating,
    p_final: f64,
    outcome: Outcome,
    assisted: bool,
    p: &FairnessParams,
) -> Rating {
    let result = match outcome {
        Outcome::Correct => 1.0,
        Outcome::Wrong => 0.0,
        Outcome::Void => return r,
    };
    let weight = if assisted { p.assisted_weight } else { 1.0 };
    let theta = if r.answers < p.placement_items {
        let step = if result > 0.5 {
            p.placement_step_up
        } else {
            -p.placement_step_down
        };
        r.theta + weight * step
    } else {
        let span = p.sigma_max - p.sigma_min;
        let share = if span > 0.0 {
            ((r.sigma - p.sigma_min) / span).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let k = p.k_min + (p.k_max - p.k_min) * share;
        r.theta + weight * k * (result - p_final)
    };
    let sigma = (r.sigma * p.sigma_decay).max(p.sigma_min);
    Rating {
        theta,
        sigma,
        answers: r.answers + 1,
    }
}

// ---------------------------------------------------------------- choosing items

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Band {
    Normal,
    Explore,
    Relief,
}

#[derive(Clone, Debug)]
pub struct Candidate {
    pub key: String,
    pub b: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Choice {
    pub index: usize,
    pub band: Band,
    pub p_final: f64,
    /// True when three wrong answers in a row call for a visual demonstration.
    pub show_demo: bool,
}

/// Where one player stands when the next item is chosen.
#[derive(Clone, Copy, Debug)]
pub struct Situation<'a> {
    pub rating: Rating,
    pub game: GameType,
    /// Number of options in Balloon Burst, `None` elsewhere.
    pub choices: Option<u32>,
    pub wrong_streak: u32,
    /// Keys of the latest concrete items, newest last.
    pub recent: &'a [String],
}

/// Picks the next item for one player. Returns `None` for an empty list.
pub fn choose(
    candidates: &[Candidate],
    at: &Situation,
    p: &FairnessParams,
    rng: &mut Rng,
) -> Option<Choice> {
    let Situation {
        rating,
        game,
        choices,
        wrong_streak,
        recent,
    } = *at;
    if candidates.is_empty() {
        return None;
    }
    let window = &recent[recent.len().saturating_sub(p.no_repeat_window)..];
    let fresh: Vec<usize> = (0..candidates.len())
        .filter(|i| !window.contains(&candidates[*i].key))
        .collect();
    let pool: Vec<usize> = if fresh.is_empty() {
        (0..candidates.len()).collect()
    } else {
        fresh
    };

    let (band, low, high, aim) = if wrong_streak >= p.relief_after_wrong {
        (Band::Relief, p.relief_p - 0.05, 1.0, p.relief_p)
    } else if rng.unit() < p.explore_rate {
        (
            Band::Explore,
            p.explore_low,
            p.explore_high,
            (p.explore_low + p.explore_high) / 2.0,
        )
    } else {
        (Band::Normal, p.accept_low, p.accept_high, p.target_p)
    };

    let prob = |i: usize| p_correct(rating.theta, candidates[i].b, game, choices);
    let inside: Vec<usize> = pool
        .iter()
        .copied()
        .filter(|i| (low..=high).contains(&prob(*i)))
        .collect();
    let index = if !inside.is_empty() {
        inside[rng.below(inside.len() as u64) as usize]
    } else {
        *pool
            .iter()
            .min_by(|a, b| (prob(**a) - aim).abs().total_cmp(&(prob(**b) - aim).abs()))
            .expect("pool is not empty")
    };
    Some(Choice {
        index,
        band,
        p_final: prob(index),
        show_demo: wrong_streak >= p.demo_after_wrong,
    })
}

// ---------------------------------------------------------------- points

/// Points for one answer. `time_ratio` is answer time divided by
/// the expected time for the template and game; `None` when the timer is off.
/// `streak_before` counts correct answers in a row before this one.
pub fn points(
    p_final: f64,
    outcome: Outcome,
    attempt: u32,
    time_ratio: Option<f64>,
    streak_before: u32,
    p: &FairnessParams,
) -> u32 {
    if outcome != Outcome::Correct {
        return 0;
    }
    let base = (100.0 * (0.6 + 0.8 * (1.0 - p_final))).round();
    // Full bonus at half the expected time or faster, none at the expected time or slower.
    let speed = match time_ratio {
        Some(r) => p.speed_bonus_max * ((1.0 - r) / 0.5).clamp(0.0, 1.0),
        None => 0.0,
    };
    let streak = (p.streak_bonus_step * streak_before as f64).min(p.streak_bonus_max);
    let attempt_factor = if attempt >= 2 {
        p.second_attempt_factor
    } else {
        1.0
    };
    (base * (1.0 + speed + streak) * attempt_factor).round() as u32
}

/// Measure Hunt points from the relative error of the guess.
pub fn measure_points(guess: f64, actual: f64, unit_correct: bool) -> u32 {
    if !unit_correct || actual <= 0.0 || !guess.is_finite() {
        return 0;
    }
    let e = (guess - actual).abs() / actual;
    match e {
        e if e <= 0.05 => 120,
        e if e <= 0.10 => 100,
        e if e <= 0.20 => 70,
        e if e <= 0.35 => 40,
        _ => 15,
    }
}

/// Team stars from team goals, never from ranking.
pub fn team_stars(crystals_safe: bool, boss_folded: bool, saves: u32, saves_goal: u32) -> u8 {
    let goals = [crystals_safe, boss_folded, saves >= saves_goal]
        .iter()
        .filter(|g| **g)
        .count();
    goals.max(1) as u8
}

// ---------------------------------------------------------------- highlights

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Highlight {
    BestSave,
    MostImproved,
    SharpestAim,
    SteadyStreak,
    BraveTry,
}

pub const HIGHLIGHTS: [Highlight; 5] = [
    Highlight::BestSave,
    Highlight::MostImproved,
    Highlight::SharpestAim,
    Highlight::SteadyStreak,
    Highlight::BraveTry,
];

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct MatchStats {
    pub saves: u32,
    pub theta_gain: f64,
    pub accuracy: f64,
    pub best_streak: u32,
    pub challenge_tries: u32,
}

impl MatchStats {
    fn value(&self, h: Highlight) -> f64 {
        match h {
            Highlight::BestSave => self.saves as f64,
            Highlight::MostImproved => self.theta_gain,
            Highlight::SharpestAim => self.accuracy,
            Highlight::SteadyStreak => self.best_streak as f64,
            Highlight::BraveTry => self.challenge_tries as f64,
        }
    }
}

/// One different highlight for every player. Chooses the
/// assignment where players most stand out in their highlight. Returns
/// `None` when there are more players than highlights.
pub fn assign_highlights(players: &[MatchStats]) -> Option<Vec<Highlight>> {
    let n = players.len();
    if n > HIGHLIGHTS.len() {
        return None;
    }
    if n == 0 {
        return Some(Vec::new());
    }
    // Score: how far above the group's mean a player is, scaled per highlight.
    let score = |player: usize, h: Highlight| -> f64 {
        let values: Vec<f64> = players.iter().map(|s| s.value(h)).collect();
        let mean = values.iter().sum::<f64>() / n as f64;
        let spread = values
            .iter()
            .map(|v| (v - mean).abs())
            .fold(0.0, f64::max)
            .max(1e-9);
        (values[player] - mean) / spread
    };
    let mut best: Option<(f64, Vec<usize>)> = None;
    let mut perm: Vec<usize> = (0..HIGHLIGHTS.len()).collect();
    permute(&mut perm, 0, n, &mut |pick| {
        let total: f64 = (0..n).map(|i| score(i, HIGHLIGHTS[pick[i]])).sum();
        // Ties keep the first assignment found, so the result is deterministic.
        if best.as_ref().is_none_or(|(t, _)| total > *t + 1e-12) {
            best = Some((total, pick[..n].to_vec()));
        }
    });
    best.map(|(_, pick)| pick.into_iter().map(|i| HIGHLIGHTS[i]).collect())
}

fn permute(items: &mut Vec<usize>, k: usize, n: usize, visit: &mut dyn FnMut(&[usize])) {
    if k == n {
        visit(items);
        return;
    }
    for i in k..items.len() {
        items.swap(k, i);
        permute(items, k + 1, n, visit);
        items.swap(k, i);
    }
}

// ---------------------------------------------------------------- mastery

#[derive(Clone, Debug, Default)]
pub struct MasteryEvidence {
    pub correct: u32,
    pub game_types: Vec<GameType>,
    /// Distinct play days (any stable day number, e.g. days since epoch).
    pub days: Vec<u32>,
}

/// Skill mastered: confident ability, enough correct answers,
/// in at least two game types, on at least two different days.
pub fn is_mastered(r: Rating, ev: &MasteryEvidence, p: &FairnessParams) -> bool {
    let mut games = ev.game_types.clone();
    games.sort_by_key(|g| *g as u8);
    games.dedup();
    let mut days = ev.days.clone();
    days.sort_unstable();
    days.dedup();
    r.theta - 2.0 * r.sigma > p.mastery_threshold
        && ev.correct >= p.mastery_min_correct
        && games.len() >= p.mastery_min_game_types
        && days.len() >= p.mastery_min_days
}

// ---------------------------------------------------------------- load balance and bots

/// Foldlings per minute for one desk, following that player's own correct
/// answers in the last 60 seconds, so every player is equally
/// busy. `elapsed_s` is match time; the first minute uses a start rate.
pub fn spawn_per_minute(desk_correct_60s: u32, elapsed_s: f64, p: &FairnessParams) -> f64 {
    if elapsed_s < 60.0 {
        return p.spawn_start_per_min;
    }
    (p.spawn_pressure * desk_correct_60s as f64).clamp(p.spawn_min_per_min, p.spawn_max_per_min)
}

/// Desk that receives an escaped Foldling: the one with the fewest waiting
/// creatures, never the desk it escaped from. Ties go to the lowest index.
pub fn overflow_target(waiting: &[u32], from: usize) -> Option<usize> {
    (0..waiting.len())
        .filter(|i| *i != from)
        .min_by_key(|i| (waiting[*i], *i))
}

/// A bot may send a help orb when a desk is overwhelmed, at most once per cooldown.
pub fn may_send_help_orb(
    desk_waiting: u32,
    overwhelmed_at: u32,
    seconds_since_last: f64,
    p: &FairnessParams,
) -> bool {
    desk_waiting >= overwhelmed_at && seconds_since_last >= p.help_orb_cooldown_s
}

/// Bot ability for one match: players' mean plus a random delta.
pub fn bot_theta(player_thetas: &[f64], p: &FairnessParams, rng: &mut Rng) -> f64 {
    let mean = if player_thetas.is_empty() {
        0.0
    } else {
        player_thetas.iter().sum::<f64>() / player_thetas.len() as f64
    };
    mean + (rng.unit() * 2.0 - 1.0) * p.bot_delta
}

/// Bot answer: correct with its own chance, time around the expected time.
/// Bots never update anyone's rating and never feed item calibration.
pub fn bot_answer(
    theta: f64,
    b: f64,
    game: GameType,
    choices: Option<u32>,
    expected_ms: f64,
    rng: &mut Rng,
) -> (Outcome, f64) {
    let pc = p_correct(theta, b, game, choices);
    let outcome = if rng.unit() < pc {
        Outcome::Correct
    } else {
        Outcome::Wrong
    };
    // Spread of roughly +-35% around the expected time.
    let noise = 0.65 + 0.7 * rng.unit();
    (outcome, expected_ms * noise)
}

// ---------------------------------------------------------------- calibration

/// Largest change of a template's difficulty in one scheduled calibration run.
pub const CALIBRATION_MAX_SHIFT: f64 = 0.5;

/// Moves a template's difficulty from aggregated answers: item
/// Elo, each answer shifting b by `k_item * (outcome - p_final)` in the
/// opposite direction. Does nothing until `answers_total` reaches the minimum.
/// `residual_sum` is the sum of (outcome - p_final) since the last run.
pub fn calibrate_item(b: f64, answers_total: u32, residual_sum: f64, p: &FairnessParams) -> f64 {
    if answers_total < p.calibration_min_answers {
        return b;
    }
    let shift = (p.k_item * residual_sum).clamp(-CALIBRATION_MAX_SHIFT, CALIBRATION_MAX_SHIFT);
    // More correct answers than expected means the item is easier than thought.
    b - shift
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> FairnessParams {
        FairnessParams::default()
    }

    #[test]
    fn probability_is_half_at_equal_ability() {
        assert!((p_correct(0.5, 0.5, GameType::OrbForge, None) - 0.5).abs() < 1e-12);
        assert!(p_correct(1.0, 0.0, GameType::OrbForge, None) > 0.5);
        // Guessing floor for four balloons.
        assert!(p_correct(-10.0, 5.0, GameType::BalloonBurst, Some(4)) > 0.249);
    }

    #[test]
    fn void_answers_do_not_move_ratings() {
        let r = Rating {
            theta: 0.3,
            sigma: 0.6,
            answers: 10,
        };
        assert_eq!(update(r, 0.7, Outcome::Void, false, &params()), r);
    }

    #[test]
    fn elo_update_direction_and_assisted_weight() {
        let p = params();
        let r = Rating {
            theta: 0.0,
            sigma: 1.0,
            answers: 10,
        };
        let up = update(r, 0.75, Outcome::Correct, false, &p);
        let down = update(r, 0.75, Outcome::Wrong, false, &p);
        let assisted = update(r, 0.75, Outcome::Correct, true, &p);
        assert!((up.theta - 0.5 * 0.25).abs() < 1e-12);
        assert!((down.theta + 0.5 * 0.75).abs() < 1e-12);
        assert!((assisted.theta - 0.5 * 0.5 * 0.25).abs() < 1e-12);
        assert!((up.sigma - 0.97).abs() < 1e-12);
    }

    #[test]
    fn sigma_has_a_floor_and_grows_when_idle() {
        let p = params();
        let mut r = Rating {
            theta: 0.0,
            sigma: 1.0,
            answers: 10,
        };
        for _ in 0..200 {
            r = update(r, 0.75, Outcome::Correct, false, &p);
        }
        assert!((r.sigma - p.sigma_min).abs() < 1e-12);
        assert!((r.after_idle_days(10, &p).sigma - 0.45).abs() < 1e-9);
        assert_eq!(r.after_idle_days(1000, &p).sigma, p.sigma_max);
    }

    #[test]
    fn placement_moves_in_fixed_steps() {
        let p = params();
        let r = Rating::start(Some(5), &p);
        let r1 = update(r, 0.5, Outcome::Correct, false, &p);
        let r2 = update(r1, 0.5, Outcome::Wrong, false, &p);
        assert_eq!(r1.theta, 0.5);
        assert_eq!(r2.theta, -0.5);
    }

    #[test]
    fn chooser_targets_the_band_and_avoids_repeats() {
        let p = params();
        let mut rng = Rng::new(1);
        let r = Rating {
            theta: 0.0,
            sigma: 0.3,
            answers: 20,
        };
        let cands: Vec<Candidate> = (-30..=30)
            .map(|i| Candidate {
                key: format!("k{i}"),
                b: i as f64 / 10.0,
            })
            .collect();
        fn at(rating: Rating, wrong_streak: u32, recent: &[String]) -> Situation<'_> {
            Situation {
                rating,
                game: GameType::OrbForge,
                choices: None,
                wrong_streak,
                recent,
            }
        }
        let mut normal = 0;
        for _ in 0..500 {
            let c = choose(&cands, &at(r, 0, &[]), &p, &mut rng).unwrap();
            if c.band == Band::Normal {
                normal += 1;
                assert!(
                    (p.accept_low..=p.accept_high).contains(&c.p_final),
                    "{}",
                    c.p_final
                );
            }
        }
        assert!(
            (400..=490).contains(&normal),
            "about 90% normal, got {normal}"
        );
        let relief = choose(&cands, &at(r, 2, &[]), &p, &mut rng).unwrap();
        assert_eq!(relief.band, Band::Relief);
        assert!(relief.p_final >= 0.85);
        assert!(!relief.show_demo);
        assert!(
            choose(&cands, &at(r, 3, &[]), &p, &mut rng)
                .unwrap()
                .show_demo
        );
        let recent: Vec<String> = cands
            .iter()
            .filter(|c| c.b != 1.0)
            .map(|c| c.key.clone())
            .collect();
        let only = choose(
            &cands,
            &at(r, 0, &recent[recent.len() - 20..]),
            &p,
            &mut rng,
        )
        .unwrap();
        assert!(!recent[recent.len() - 20..].contains(&cands[only.index].key));
    }

    #[test]
    fn every_grade_starts_a_step_from_the_next() {
        let p = params();
        let start = |g| Rating::start(Some(g), &p).theta;
        assert_eq!(start(5), p.start_theta_grade5);
        assert!((start(1) - -2.0).abs() < 1e-9 && (start(9) - 2.0).abs() < 1e-9);
        assert!((1..9).all(|g| start(g) < start(g + 1)));
        assert_eq!(Rating::start(None, &p).theta, 0.0);
    }

    #[test]
    fn points_follow_the_design() {
        let p = params();
        assert_eq!(points(0.75, Outcome::Correct, 1, None, 0, &p), 80);
        assert_eq!(points(0.9, Outcome::Correct, 1, None, 0, &p), 68);
        assert_eq!(points(0.4, Outcome::Correct, 1, None, 0, &p), 108);
        assert_eq!(points(0.75, Outcome::Wrong, 1, Some(0.1), 9, &p), 0);
        assert_eq!(points(0.75, Outcome::Correct, 1, Some(0.5), 0, &p), 96);
        assert_eq!(points(0.75, Outcome::Correct, 1, Some(1.5), 0, &p), 80);
        assert_eq!(points(0.75, Outcome::Correct, 1, None, 10, &p), 100);
        assert_eq!(points(0.75, Outcome::Correct, 2, None, 0, &p), 40);
    }

    #[test]
    fn measure_hunt_tiers() {
        assert_eq!(measure_points(130.0, 130.0, true), 120);
        assert_eq!(measure_points(120.0, 130.0, true), 100);
        assert_eq!(measure_points(100.0, 130.0, true), 40);
        assert_eq!(measure_points(10.0, 130.0, true), 15);
        assert_eq!(measure_points(130.0, 130.0, false), 0);
    }

    #[test]
    fn highlights_are_unique_and_complete() {
        let mut rng = Rng::new(9);
        for n in 0..=5 {
            for _ in 0..200 {
                let players: Vec<MatchStats> = (0..n)
                    .map(|_| MatchStats {
                        saves: rng.below(5) as u32,
                        theta_gain: rng.unit() - 0.5,
                        accuracy: rng.unit(),
                        best_streak: rng.below(8) as u32,
                        challenge_tries: rng.below(4) as u32,
                    })
                    .collect();
                let h = assign_highlights(&players).unwrap();
                assert_eq!(h.len(), n);
                let mut sorted = h.clone();
                sorted.sort();
                sorted.dedup();
                assert_eq!(sorted.len(), n);
            }
        }
        assert!(assign_highlights(&[MatchStats::default(); 6]).is_none());
        let clear = [
            MatchStats {
                saves: 9,
                ..Default::default()
            },
            MatchStats {
                best_streak: 9,
                ..Default::default()
            },
        ];
        assert_eq!(
            assign_highlights(&clear).unwrap(),
            vec![Highlight::BestSave, Highlight::SteadyStreak]
        );
    }

    #[test]
    fn mastery_needs_spacing_and_variety() {
        let p = params();
        let strong = Rating {
            theta: 1.2,
            sigma: 0.25,
            answers: 30,
        };
        let ev = MasteryEvidence {
            correct: 8,
            game_types: vec![GameType::OrbForge, GameType::BalloonBurst],
            days: vec![1, 2],
        };
        assert!(is_mastered(strong, &ev, &p));
        let one_day = MasteryEvidence {
            days: vec![1, 1],
            ..ev.clone()
        };
        assert!(!is_mastered(strong, &one_day, &p));
        let one_game = MasteryEvidence {
            game_types: vec![GameType::OrbForge; 3],
            ..ev.clone()
        };
        assert!(!is_mastered(strong, &one_game, &p));
        assert!(!is_mastered(
            Rating {
                sigma: 0.7,
                ..strong
            },
            &ev,
            &p
        ));
    }

    #[test]
    fn load_balance_rules() {
        let p = params();
        assert_eq!(spawn_per_minute(0, 10.0, &p), 5.0);
        assert!((spawn_per_minute(6, 90.0, &p) - 5.4).abs() < 1e-12);
        assert_eq!(spawn_per_minute(0, 90.0, &p), 2.0);
        assert_eq!(spawn_per_minute(30, 90.0, &p), 10.0);
        assert_eq!(overflow_target(&[2, 5, 1], 2), Some(0));
        assert_eq!(overflow_target(&[4, 1, 1], 0), Some(1));
        assert_eq!(overflow_target(&[3], 0), None);
        assert!(may_send_help_orb(6, 5, 31.0, &p));
        assert!(!may_send_help_orb(6, 5, 10.0, &p));
    }

    #[test]
    fn calibration_waits_then_moves_a_bounded_amount() {
        let p = params();
        assert_eq!(calibrate_item(0.4, 199, 30.0, &p), 0.4);
        assert!((calibrate_item(0.4, 200, 10.0, &p) - 0.2).abs() < 1e-12);
        assert_eq!(
            calibrate_item(0.4, 500, 100.0, &p),
            0.4 - CALIBRATION_MAX_SHIFT
        );
        assert!(calibrate_item(0.4, 500, -10.0, &p) > 0.4);
    }

    #[test]
    fn bots_stay_near_the_players() {
        let p = params();
        let mut rng = Rng::new(4);
        for _ in 0..1000 {
            let t = bot_theta(&[0.2, 0.6], &p, &mut rng);
            assert!((0.1..=0.7).contains(&t));
        }
    }
}
