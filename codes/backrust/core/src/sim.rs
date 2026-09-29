//! Fairness simulator: checks the engine against students of known ability.
//!
//! Synthetic students with a known true ability play against the real
//! Fairness Engine code. The engine only sees modelled difficulties; the
//! students answer from true difficulties that differ by noise, so the
//! engine is not tested under perfect knowledge.

use serde::Serialize;

use crate::fairness::{
    Candidate, FairnessParams, GameType, MatchStats, Outcome, Rating, Situation, assign_highlights,
    choose, overflow_target, p_correct, points, spawn_per_minute, update,
};
use crate::rng::Rng;

const GAMES: [GameType; 5] = [
    GameType::OrbForge,
    GameType::BalloonBurst,
    GameType::FactorySort,
    GameType::BridgeBuilder,
    GameType::BalanceGate,
];

#[derive(Clone, Debug)]
pub struct SimConfig {
    pub seed: u64,
    pub students: u32,
    pub items: u32,
    pub candidates_per_pick: u32,
    /// Standard deviation between modelled and true item difficulty.
    pub b_noise: f64,
    /// Modelled difficulty range of the synthetic item bank.
    pub bank_low: f64,
    pub bank_high: f64,
    pub expected_answer_s: f64,
    pub session_s: f64,
    pub matches: u32,
    /// A desk counts as stuck when this many Foldlings wait at once.
    pub stuck_at: u32,
}

impl Default for SimConfig {
    fn default() -> Self {
        SimConfig {
            seed: 20260929,
            students: 1000,
            items: 40,
            candidates_per_pick: 12,
            b_noise: 0.25,
            bank_low: -3.0,
            bank_high: 3.0,
            expected_answer_s: 8.0,
            session_s: 480.0,
            matches: 1000,
            stuck_at: 12,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Criterion {
    pub name: &'static str,
    pub value: f64,
    pub limit: f64,
    pub passed: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct SimReport {
    pub params_version: String,
    pub mean_abs_error_after_items: f64,
    pub mean_abs_error_by_true_theta: Vec<(f64, f64)>,
    pub observed_correct_rate: f64,
    pub points_per_min_strong: f64,
    pub points_per_min_weak: f64,
    pub points_per_min_gap: f64,
    pub cold_start_points_per_min_strong: f64,
    pub cold_start_points_per_min_weak: f64,
    pub max_waiting_any_desk: u32,
    pub stuck_matches: u32,
    pub highlight_failures: u32,
    pub criteria: Vec<Criterion>,
    pub not_checked: Vec<&'static str>,
}

fn normal(rng: &mut Rng) -> f64 {
    // Box-Muller.
    let u1 = rng.unit().max(1e-12);
    let u2 = rng.unit();
    (-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()
}

struct Student {
    true_theta: f64,
    rating: Rating,
    wrong_streak: u32,
    streak: u32,
    recent: Vec<String>,
    counter: u64,
}

struct Answer {
    outcome: Outcome,
    p_model: f64,
    seconds: f64,
    points: u32,
}

impl Student {
    fn new(true_theta: f64, grade: u8, p: &FairnessParams) -> Self {
        Student {
            true_theta,
            rating: Rating::start(Some(grade), p),
            wrong_streak: 0,
            streak: 0,
            recent: Vec::new(),
            counter: 0,
        }
    }

    fn play_one(
        &mut self,
        cfg: &SimConfig,
        p: &FairnessParams,
        rng: &mut Rng,
        timed: bool,
    ) -> Answer {
        let game = GAMES[rng.below(GAMES.len() as u64) as usize];
        let choices = if game == GameType::BalloonBurst {
            Some(4)
        } else {
            None
        };
        // Candidate items from templates around the student's current estimate.
        let mut cands = Vec::with_capacity(cfg.candidates_per_pick as usize);
        let mut true_b = Vec::with_capacity(cfg.candidates_per_pick as usize);
        for _ in 0..cfg.candidates_per_pick {
            self.counter += 1;
            let b_model = cfg.bank_low + rng.unit() * (cfg.bank_high - cfg.bank_low);
            cands.push(Candidate {
                key: format!("i{}", self.counter),
                b: b_model,
            });
            true_b.push(b_model + cfg.b_noise * normal(rng));
        }
        let at = Situation {
            rating: self.rating,
            game,
            choices,
            wrong_streak: self.wrong_streak,
            recent: &self.recent,
        };
        let pick = choose(&cands, &at, p, rng).expect("candidates");
        let b_true = true_b[pick.index];
        let p_true = p_correct(self.true_theta, b_true, game, choices);
        let outcome = if rng.unit() < p_true {
            Outcome::Correct
        } else {
            Outcome::Wrong
        };
        // Time grows when the item is hard for this student, with personal noise.
        let seconds = cfg.expected_answer_s
            * (0.25 * (b_true - self.true_theta)).exp()
            * (0.25 * normal(rng)).exp();
        let ratio = if timed {
            Some(seconds / cfg.expected_answer_s)
        } else {
            None
        };
        let pts = points(pick.p_final, outcome, 1, ratio, self.streak, p);
        self.rating = update(self.rating, pick.p_final, outcome, false, p);
        if outcome == Outcome::Correct {
            self.streak += 1;
            self.wrong_streak = 0;
        } else {
            self.streak = 0;
            self.wrong_streak += 1;
        }
        self.recent.push(cands[pick.index].key.clone());
        if self.recent.len() > p.no_repeat_window {
            self.recent.remove(0);
        }
        Answer {
            outcome,
            p_model: pick.p_final,
            seconds,
            points: pts,
        }
    }
}

/// Criterion 1: rating error after `items` answers, plus the observed correct rate.
fn measurement(cfg: &SimConfig, p: &FairnessParams, rng: &mut Rng) -> (f64, Vec<(f64, f64)>, f64) {
    let mut total_err = 0.0;
    let mut buckets = [(0.0, 0u32); 5];
    let mut correct = 0u64;
    let mut answered = 0u64;
    for _ in 0..cfg.students {
        let true_theta = rng.unit() * 4.0 - 2.0;
        let grade = 4 + rng.below(3) as u8;
        let mut s = Student::new(true_theta, grade, p);
        for i in 0..cfg.items {
            let a = s.play_one(cfg, p, rng, true);
            if i >= p.placement_items {
                answered += 1;
                correct += (a.outcome == Outcome::Correct) as u64;
            }
        }
        let err = (s.rating.theta - true_theta).abs();
        total_err += err;
        let bucket = (((true_theta + 2.0) / 0.8) as usize).min(4);
        buckets[bucket].0 += err;
        buckets[bucket].1 += 1;
    }
    let by_theta = buckets
        .iter()
        .enumerate()
        .map(|(i, (sum, n))| {
            (
                -2.0 + 0.8 * i as f64 + 0.4,
                if *n == 0 { 0.0 } else { sum / *n as f64 },
            )
        })
        .collect();
    (
        total_err / cfg.students as f64,
        by_theta,
        correct as f64 / answered.max(1) as f64,
    )
}

/// Criterion 2: points per minute for strong and weak students over one session.
fn points_per_minute(
    cfg: &SimConfig,
    p: &FairnessParams,
    rng: &mut Rng,
    true_theta: f64,
    warm: bool,
) -> f64 {
    let mut total_points = 0.0;
    let mut total_minutes = 0.0;
    for _ in 0..cfg.students / 2 {
        let mut s = Student::new(true_theta, 5, p);
        if warm {
            for _ in 0..cfg.items {
                s.play_one(cfg, p, rng, true);
            }
        }
        let mut t = 0.0;
        while t < cfg.session_s {
            let a = s.play_one(cfg, p, rng, true);
            t += a.seconds;
            total_points += a.points as f64;
        }
        total_minutes += t / 60.0;
    }
    total_points / total_minutes
}

/// Criteria 3 and 4: three desks share a match; no desk may pile up
/// Foldlings without limit, and every player gets one unique highlight.
fn matches(cfg: &SimConfig, p: &FairnessParams, rng: &mut Rng) -> (u32, u32, u32) {
    let mut max_waiting = 0;
    let mut stuck = 0;
    let mut highlight_failures = 0;
    let tick = 1.0;
    for _ in 0..cfg.matches {
        let mut desks: Vec<Student> = (0..3)
            .map(|_| Student::new(rng.unit() * 4.0 - 2.0, 5, p))
            .collect();
        for d in desks.iter_mut() {
            for _ in 0..20 {
                d.play_one(cfg, p, rng, true);
            }
        }
        let start: Vec<f64> = desks.iter().map(|d| d.rating.theta).collect();
        let mut waiting = [1u32; 3];
        let mut spawn_clock = [0.0f64; 3];
        let mut busy_until = [0.0f64; 3];
        let mut recent_correct: Vec<Vec<f64>> = vec![Vec::new(); 3];
        let mut stats = [MatchStats::default(); 3];
        let mut answers = [0u32; 3];
        let mut corrects = [0u32; 3];
        let mut streak = [0u32; 3];
        let mut last_help = [-100.0f64; 3];
        let mut was_stuck = false;
        let mut t = 0.0;
        while t < cfg.session_s {
            let counts: Vec<u32> = recent_correct
                .iter()
                .map(|v| v.iter().filter(|x| **x > t - 60.0).count() as u32)
                .collect();
            for i in 0..3 {
                spawn_clock[i] += tick * spawn_per_minute(counts[i], t, p) / 60.0;
                if spawn_clock[i] >= 1.0 {
                    spawn_clock[i] -= 1.0;
                    waiting[i] += 1;
                }
                // A partner sends a help orb to an overwhelmed desk.
                if crate::fairness::may_send_help_orb(waiting[i], 5, t - last_help[i], p) {
                    waiting[i] -= 1;
                    last_help[i] = t;
                }
                if waiting[i] > 0 && t >= busy_until[i] {
                    let a = desks[i].play_one(cfg, p, rng, true);
                    busy_until[i] = t + a.seconds;
                    answers[i] += 1;
                    if a.outcome == Outcome::Correct {
                        waiting[i] -= 1;
                        corrects[i] += 1;
                        streak[i] += 1;
                        stats[i].best_streak = stats[i].best_streak.max(streak[i]);
                        recent_correct[i].push(t);
                        if a.p_model < 0.6 {
                            stats[i].challenge_tries += 1;
                        }
                    } else {
                        streak[i] = 0;
                        if a.p_model < 0.6 {
                            stats[i].challenge_tries += 1;
                        }
                        // After a second miss the Foldling escapes to the least busy friend.
                        if rng.unit() < 0.5
                            && let Some(j) = overflow_target(&waiting, i)
                        {
                            waiting[i] -= 1;
                            waiting[j] += 1;
                            stats[j].saves += 1;
                        }
                    }
                }
                max_waiting = max_waiting.max(waiting[i]);
                if waiting[i] >= cfg.stuck_at {
                    was_stuck = true;
                }
            }
            t += tick;
        }
        stuck += was_stuck as u32;
        for i in 0..3 {
            stats[i].accuracy = corrects[i] as f64 / answers[i].max(1) as f64;
            stats[i].theta_gain = desks[i].rating.theta - start[i];
        }
        match assign_highlights(&stats) {
            Some(h) => {
                let mut u = h.clone();
                u.sort();
                u.dedup();
                if u.len() != 3 {
                    highlight_failures += 1;
                }
            }
            None => highlight_failures += 1,
        }
    }
    (max_waiting, stuck, highlight_failures)
}

pub fn run(cfg: &SimConfig, p: &FairnessParams) -> SimReport {
    let mut rng = Rng::new(cfg.seed);
    let (err, by_theta, correct_rate) = measurement(cfg, p, &mut rng);
    let strong = points_per_minute(cfg, p, &mut rng, 1.5, true);
    let weak = points_per_minute(cfg, p, &mut rng, -1.5, true);
    let cold_strong = points_per_minute(cfg, p, &mut rng, 1.5, false);
    let cold_weak = points_per_minute(cfg, p, &mut rng, -1.5, false);
    let gap = (strong - weak).abs() / strong.max(weak);
    let (max_waiting, stuck, highlight_failures) = matches(cfg, p, &mut rng);

    let criteria = vec![
        Criterion {
            name: "mean |theta - true theta| after 40 items",
            value: err,
            limit: 0.35,
            passed: err < 0.35,
        },
        Criterion {
            name: "points per minute gap, strong vs weak",
            value: gap,
            limit: 0.15,
            passed: gap < 0.15,
        },
        Criterion {
            name: "matches with a stuck desk",
            value: stuck as f64,
            limit: 0.0,
            passed: stuck == 0,
        },
        Criterion {
            name: "matches where highlights were not unique and complete",
            value: highlight_failures as f64,
            limit: 0.0,
            passed: highlight_failures == 0,
        },
    ];
    SimReport {
        params_version: p.version.clone(),
        mean_abs_error_after_items: err,
        mean_abs_error_by_true_theta: by_theta,
        observed_correct_rate: correct_rate,
        points_per_min_strong: strong,
        points_per_min_weak: weak,
        points_per_min_gap: gap,
        cold_start_points_per_min_strong: cold_strong,
        cold_start_points_per_min_weak: cold_weak,
        max_waiting_any_desk: max_waiting,
        stuck_matches: stuck,
        highlight_failures,
        criteria,
        not_checked: vec![
            "rubber band never wins or loses a match on its own: needs the real match rules (boss, crystals), week 1 and 3",
            "bot scripted moments (wave 2 escape, final boss hit): part of match logic, week 2",
            "real item difficulties: synthetic b in [-3, 3] with noise; recheck with live data",
        ],
    }
}
