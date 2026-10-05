//! Skill stars, worked out again from a player's answers, and the Fold Town
//! landmark each mission's stars raise.
//!
//! One star: five right answers in the skill. Two: the skill is mastered (a
//! confident rating, enough right answers in two kinds of game on two days).
//! Three: still mastered seven days after it first was. A star once earned
//! stays, so a landmark never disappears.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::fairness::{
    FairnessParams, GameType, MasteryEvidence, Outcome, Rating, is_mastered, update,
};

pub const STAR1_CORRECT: u32 = 5;
pub const STAR3_DAYS: u32 = 7;
const DAY_MS: i64 = 86_400_000;

/// One judged answer, as the answer events carry it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SkillAnswer {
    pub skill: String,
    pub game_type: GameType,
    pub p_final: f64,
    pub result: Outcome,
    #[serde(default)]
    pub assisted: bool,
    pub at_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SkillStars {
    pub skill: String,
    pub stars: u8,
    pub correct: u32,
    /// When each star was earned.
    pub star1_at_ms: Option<i64>,
    pub star2_at_ms: Option<i64>,
    pub star3_at_ms: Option<i64>,
}

fn day_of(at_ms: i64) -> u32 {
    (at_ms.max(0) / DAY_MS) as u32
}

/// Stars for every skill answered, sorted by skill. `now_ms` lets the third
/// star come without a new answer.
pub fn skill_stars(
    answers: &[SkillAnswer],
    grade: Option<u8>,
    now_ms: i64,
    p: &FairnessParams,
) -> Vec<SkillStars> {
    let mut by_skill: BTreeMap<&str, Vec<&SkillAnswer>> = BTreeMap::new();
    for a in answers {
        by_skill.entry(a.skill.as_str()).or_default().push(a);
    }
    by_skill
        .into_iter()
        .map(|(skill, mut list)| {
            list.sort_by_key(|a| a.at_ms);
            let mut rating = Rating::start(grade, p);
            let mut ev = MasteryEvidence::default();
            let mut last_day: Option<u32> = None;
            let mut s = SkillStars {
                skill: skill.to_string(),
                stars: 0,
                correct: 0,
                star1_at_ms: None,
                star2_at_ms: None,
                star3_at_ms: None,
            };
            let check = |rating: Rating, ev: &MasteryEvidence, at_ms: i64, s: &mut SkillStars| {
                if s.star1_at_ms.is_none() && ev.correct >= STAR1_CORRECT {
                    s.star1_at_ms = Some(at_ms);
                }
                if !is_mastered(rating, ev, p) {
                    return;
                }
                match s.star2_at_ms {
                    None => s.star2_at_ms = Some(at_ms),
                    Some(first) if s.star3_at_ms.is_none() => {
                        if day_of(at_ms) >= day_of(first) + STAR3_DAYS {
                            s.star3_at_ms = Some(at_ms);
                        }
                    }
                    Some(_) => {}
                }
            };
            for a in list {
                let day = day_of(a.at_ms);
                if let Some(prev) = last_day {
                    rating = rating.after_idle_days(day.saturating_sub(prev), p);
                }
                last_day = Some(day);
                rating = update(rating, a.p_final, a.result, a.assisted, p);
                if a.result == Outcome::Correct {
                    ev.correct += 1;
                    ev.game_types.push(a.game_type);
                    ev.days.push(day);
                }
                check(rating, &ev, a.at_ms, &mut s);
            }
            if let Some(prev) = last_day {
                let idle = rating.after_idle_days(day_of(now_ms).saturating_sub(prev), p);
                check(idle, &ev, now_ms.max(0), &mut s);
            }
            s.correct = ev.correct;
            s.stars = [s.star1_at_ms, s.star2_at_ms, s.star3_at_ms]
                .iter()
                .filter(|t| t.is_some())
                .count() as u8;
            s
        })
        .collect()
}

/// A mission of the curriculum and the landmark it raises in Fold Town.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mission {
    Fractions,
    MultiplyDivide,
    PlaceValue,
    Decimals,
    Measurement,
}

pub const MISSIONS: [Mission; 5] = [
    Mission::Fractions,
    Mission::MultiplyDivide,
    Mission::PlaceValue,
    Mission::Decimals,
    Mission::Measurement,
];

impl Mission {
    /// The start of the skill ids in this mission, such as `FR.` in `FR.EQUIV`.
    pub fn prefix(self) -> &'static str {
        match self {
            Mission::Fractions => "FR.",
            Mission::MultiplyDivide => "MD.",
            Mission::PlaceValue => "PV.",
            Mission::Decimals => "DC.",
            Mission::Measurement => "ME.",
        }
    }

    pub fn landmark(self) -> &'static str {
        match self {
            Mission::Fractions => "landmark_fraction_bridge",
            Mission::MultiplyDivide => "landmark_times_tower",
            Mission::PlaceValue => "landmark_number_hall",
            Mission::Decimals => "landmark_decimal_market",
            Mission::Measurement => "landmark_clock_tower",
        }
    }

    pub fn of_skill(skill: &str) -> Option<Mission> {
        MISSIONS.into_iter().find(|m| skill.starts_with(m.prefix()))
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Landmark {
    pub mission: Mission,
    pub landmark: &'static str,
    /// The best stars of any skill in the mission (the landmark's tier).
    pub tier: u8,
    /// The skill whose first star raised it, named in the recap.
    pub skill: String,
    pub at_ms: i64,
}

/// Landmarks raised so far, in the order they were: the n-th stands on the
/// n-th page's landmark plot.
pub fn landmarks(stars: &[SkillStars]) -> Vec<Landmark> {
    let mut out: Vec<Landmark> = MISSIONS
        .into_iter()
        .filter_map(|m| {
            let skills: Vec<&SkillStars> = stars
                .iter()
                .filter(|s| Mission::of_skill(&s.skill) == Some(m))
                .collect();
            let first = skills
                .iter()
                .filter_map(|s| s.star1_at_ms.map(|t| (t, s)))
                .min_by_key(|(t, s)| (*t, s.skill.clone()))?;
            Some(Landmark {
                mission: m,
                landmark: m.landmark(),
                tier: skills.iter().map(|s| s.stars).max().unwrap_or(0),
                skill: first.1.skill.clone(),
                at_ms: first.0,
            })
        })
        .collect();
    out.sort_by_key(|l| (l.at_ms, l.mission));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn answer(skill: &str, game: GameType, ok: bool, at_ms: i64) -> SkillAnswer {
        SkillAnswer {
            skill: skill.into(),
            game_type: game,
            p_final: 0.75,
            result: if ok { Outcome::Correct } else { Outcome::Wrong },
            assisted: false,
            at_ms,
        }
    }

    fn star(stars: &[SkillStars], skill: &str) -> u8 {
        stars
            .iter()
            .find(|s| s.skill == skill)
            .map_or(0, |s| s.stars)
    }

    #[test]
    fn five_right_answers_give_the_first_star() {
        let p = FairnessParams::default();
        let mut list: Vec<SkillAnswer> = (0..4)
            .map(|i| answer("FR.EQUIV", GameType::BalloonBurst, true, i * 1000))
            .collect();
        list.push(answer("FR.EQUIV", GameType::BalloonBurst, false, 5000));
        let s = skill_stars(&list, Some(4), 6000, &p);
        assert_eq!(star(&s, "FR.EQUIV"), 0);
        list.push(answer("FR.EQUIV", GameType::OrbForge, true, 7000));
        let s = skill_stars(&list, Some(4), 8000, &p);
        assert_eq!(star(&s, "FR.EQUIV"), 1);
        assert_eq!(s[0].star1_at_ms, Some(7000));
        assert_eq!(s[0].correct, 5);
    }

    /// Many right answers in two games on two days: mastered.
    fn mastered_run(skill: &str, from_day: i64) -> Vec<SkillAnswer> {
        let mut list = Vec::new();
        for day in [from_day, from_day + 1] {
            for i in 0..30 {
                let game = if i % 2 == 0 {
                    GameType::BalloonBurst
                } else {
                    GameType::OrbForge
                };
                list.push(answer(skill, game, true, day * DAY_MS + i * 10_000));
            }
        }
        list
    }

    #[test]
    fn mastery_gives_the_second_star_and_a_week_more_the_third() {
        let p = FairnessParams::default();
        let list = mastered_run("MD.FACTS", 100);
        let s = skill_stars(&list, Some(5), 101 * DAY_MS + DAY_MS / 2, &p);
        assert_eq!(star(&s, "MD.FACTS"), 2);
        // One day of answers is never mastery.
        let one_day: Vec<SkillAnswer> = list[..30].to_vec();
        let s = skill_stars(&one_day, Some(5), 100 * DAY_MS + DAY_MS / 2, &p);
        assert_eq!(star(&s, "MD.FACTS"), 1);
        // Seven days later, still mastered without a new answer.
        let s = skill_stars(&list, Some(5), 108 * DAY_MS + 1, &p);
        assert_eq!(star(&s, "MD.FACTS"), 3);
    }

    #[test]
    fn stars_once_earned_stay() {
        let p = FairnessParams::default();
        let mut list = mastered_run("PV.ROUND", 10);
        for i in 0..40 {
            list.push(answer(
                "PV.ROUND",
                GameType::BalloonBurst,
                false,
                12 * DAY_MS + i,
            ));
        }
        let s = skill_stars(&list, Some(4), 12 * DAY_MS + 100, &p);
        assert_eq!(star(&s, "PV.ROUND"), 2);
    }

    #[test]
    fn landmarks_come_in_the_order_their_first_star_did() {
        let p = FairnessParams::default();
        let mut list: Vec<SkillAnswer> = (0..5)
            .map(|i| answer("DC.READ", GameType::BalloonBurst, true, 100 + i))
            .collect();
        list.extend((0..5).map(|i| answer("FR.ADD.LIKE", GameType::OrbForge, true, 50 + i)));
        list.extend((0..4).map(|i| answer("ME.AREA", GameType::OrbForge, true, 10 + i)));
        let s = skill_stars(&list, Some(4), 1000, &p);
        let l = landmarks(&s);
        assert_eq!(
            l.iter().map(|l| l.mission).collect::<Vec<_>>(),
            vec![Mission::Fractions, Mission::Decimals]
        );
        assert_eq!(l[0].landmark, "landmark_fraction_bridge");
        assert_eq!(l[0].skill, "FR.ADD.LIKE");
        assert_eq!(l[0].tier, 1);
        assert_eq!(Mission::of_skill("MD.PRIME"), Some(Mission::MultiplyDivide));
        assert_eq!(Mission::of_skill("XX.NONE"), None);
    }

    #[test]
    fn answers_read_from_answer_events() {
        let json = r#"{"event_id":"e","skill":"FR.OF","game_type":"orb_forge","p_final":0.7,"result":"correct","assisted":false,"at_ms":5,"b":0.1}"#;
        let a: SkillAnswer = serde_json::from_str(json).unwrap();
        assert_eq!(a.game_type, GameType::OrbForge);
        assert_eq!(a.result, Outcome::Correct);
    }
}
