//! Solo session: offers, judging, retries, points and events.

use foldlings_core::fairness::{FairnessParams, GameType};
use foldlings_core::rational::Rational;
use foldlings_core::session::{SessionConfig, SessionError, SoloSession};
use foldlings_core::template::ItemTemplate;

const TEMPLATES: [&str; 4] = [
    include_str!("../../../content/contoh/tpl.dc.add.v1.json"),
    include_str!("../../../content/contoh/tpl.fr.add_like.v1.json"),
    include_str!("../../../content/contoh/tpl.md.multiples_sort.v1.json"),
    include_str!("../../../content/contoh/tpl.me.table_width.v1.json"),
];

fn session(seed: u64) -> SoloSession {
    let templates = TEMPLATES
        .iter()
        .map(|t| ItemTemplate::from_json(t).unwrap())
        .collect();
    let cfg = SessionConfig {
        seed,
        grade: Some(5),
        candidates: 12,
        timed: true,
        expected_answer_ms: 8000.0,
        player_id: "test".into(),
        content_pack_version: "cp-test".into(),
    };
    let (s, rejected) = SoloSession::new(templates, cfg, FairnessParams::default()).unwrap();
    assert!(rejected.is_empty());
    s
}

/// Reads a shown number back: "3/8", "2 1/4" (mixed), "0.25", or a
/// measurement such as "4 m" or "2.5 cm" (the unit is dropped).
fn value(text: &str) -> Rational {
    let text = text
        .trim_end_matches(|c: char| c.is_ascii_alphabetic())
        .trim_end();
    if let Some((whole, frac)) = text.split_once(' ') {
        return Rational::int(whole.parse().unwrap())
            .checked_add(&value(frac))
            .unwrap();
    }
    match text.split_once('/') {
        Some((n, d)) => Rational::new(n.parse().unwrap(), d.parse().unwrap()).unwrap(),
        None => Rational::parse_decimal(text).unwrap(),
    }
}

#[test]
fn balloons_hold_exactly_one_right_answer() {
    let mut s = session(1);
    for _ in 0..200 {
        let offer = s.next(GameType::BalloonBurst).unwrap();
        assert_eq!(offer.balloons.len(), 4, "{:?}", offer.balloons);
        let texts: Vec<&str> = offer.balloons.iter().map(|b| b.text.as_str()).collect();
        let mut unique = texts.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), 4, "balloons must differ: {texts:?}");
        assert!(
            texts
                .iter()
                .all(|t| !t.contains(',') && !t.starts_with('-'))
        );
        // Pop a random balloon; the verdict names the right text, which must
        // appear on exactly one balloon, and the verdict must agree with it.
        let pick = (offer.offer_id as usize * 7) % 4;
        let v = s.answer_balloon(offer.offer_id, pick, 5000.0, 0.0).unwrap();
        assert_eq!(
            texts.iter().filter(|t| **t == v.expected_text).count(),
            1,
            "{texts:?}"
        );
        assert_eq!(v.correct, texts[pick] == v.expected_text);
        if !v.correct {
            assert!(v.retry_allowed && v.points == 0);
            s.close(offer.offer_id);
        } else {
            assert!(v.points >= 34, "at least half of the lowest base");
        }
    }
}

#[test]
fn wrong_then_retry_is_worth_half_and_then_closes() {
    let mut s = session(2);
    let offer = s.next(GameType::BalloonBurst).unwrap();
    let wrong = offer
        .balloons
        .iter()
        .position(|b| b.misconception.is_some())
        .expect("a distractor balloon");
    let v1 = s
        .answer_balloon(offer.offer_id, wrong, 4000.0, 1.0)
        .unwrap();
    assert!(!v1.correct && v1.retry_allowed && v1.points == 0);
    // Find the right one by elimination: the expected text is returned.
    let right = offer
        .balloons
        .iter()
        .position(|b| b.text == v1.expected_text)
        .unwrap();
    let v2 = s
        .answer_balloon(offer.offer_id, right, 4000.0, 2.0)
        .unwrap();
    assert!(v2.correct && v2.attempt == 2 && !v2.retry_allowed);
    let base = foldlings_core::fairness::points(
        offer.p_final,
        foldlings_core::fairness::Outcome::Correct,
        1,
        Some(0.5),
        0,
        &FairnessParams::default(),
    );
    assert_eq!(v2.points, (base as f64 / 2.0).round() as u32);
    assert_eq!(
        s.answer_balloon(offer.offer_id, right, 1.0, 3.0)
            .unwrap_err(),
        SessionError::UnknownOffer(offer.offer_id)
    );
    let events = s.drain_events();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].attempt, 1);
    assert_eq!(events[1].attempt, 2);
    assert_ne!(events[0].event_id, events[1].event_id);
    assert!(s.drain_events().is_empty());
}

#[test]
fn only_the_first_attempt_moves_the_rating() {
    let mut s = session(3);
    let offer = s.next(GameType::BalloonBurst).unwrap();
    let before = s.rating(&offer.skill);
    let wrong = offer
        .balloons
        .iter()
        .position(|b| b.misconception.is_some())
        .unwrap();
    let v1 = s
        .answer_balloon(offer.offer_id, wrong, 4000.0, 0.0)
        .unwrap();
    let after_first = s.rating(&offer.skill);
    assert!(after_first.theta < before.theta);
    let right = offer
        .balloons
        .iter()
        .position(|b| b.text == v1.expected_text)
        .unwrap();
    s.answer_balloon(offer.offer_id, right, 4000.0, 0.0)
        .unwrap();
    assert_eq!(s.rating(&offer.skill), after_first);
}

/// Every template in codes/content, examples and bank alike.
fn all_templates() -> Vec<ItemTemplate> {
    let mut out = Vec::new();
    for dir in ["../../content/contoh", "../../content/templates"] {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(dir);
        for entry in std::fs::read_dir(&dir).unwrap() {
            let text = std::fs::read_to_string(entry.unwrap().path()).unwrap();
            out.push(ItemTemplate::from_json(&text).unwrap());
        }
    }
    out
}

#[test]
fn orb_forge_always_has_an_exact_pair() {
    let cfg = SessionConfig {
        seed: 4,
        grade: Some(4),
        candidates: 12,
        timed: true,
        expected_answer_ms: 8000.0,
        player_id: "test".into(),
        content_pack_version: "cp-test".into(),
    };
    let (mut s, rejected) =
        SoloSession::new(all_templates(), cfg, FairnessParams::default()).unwrap();
    assert!(rejected.is_empty());
    let mut templates_seen = std::collections::BTreeSet::new();
    for _ in 0..300 {
        let offer = s.next(GameType::OrbForge).unwrap();
        let target = offer.target.clone().unwrap();
        let t = Rational::new(target.num, target.den).unwrap();
        let vals: Vec<Rational> = offer
            .crystals
            .iter()
            .map(|c| Rational::new(c.num, c.den).unwrap())
            .collect();
        for c in &offer.crystals {
            assert_eq!(
                value(&c.text),
                Rational::new(c.num, c.den).unwrap(),
                "shown text matches value: {}",
                c.text
            );
            // Crystals read like the target: no fraction beside "16 cm".
            assert!(
                target.text.contains('/') || !c.text.contains('/'),
                "crystal {} shown as a fraction for target {}",
                c.text,
                target.text
            );
        }
        let mut pair = None;
        'outer: for i in 0..vals.len() {
            if vals[i] == t {
                pair = Some(vec![i]);
                break;
            }
            for j in i + 1..vals.len() {
                if vals[i].checked_add(&vals[j]).unwrap() == t {
                    pair = Some(vec![i, j]);
                    break 'outer;
                }
            }
        }
        let pair =
            pair.unwrap_or_else(|| panic!("no pair for {} in {:?}", target.text, offer.crystals));
        let v = s.answer_orb(offer.offer_id, &pair, 6000.0, 0.0).unwrap();
        assert!(v.correct, "{:?}", v);
        assert_eq!(v.built_text.as_deref().map(value), Some(t));
        templates_seen.insert(offer.template_id.clone());
    }
    // Large whole numbers (three-digit addition) must be among those checked.
    assert!(
        templates_seen.contains("tpl.pv.add_3digit.v1"),
        "{templates_seen:?}"
    );
}

#[test]
fn orb_with_wrong_crystals_bounces() {
    let mut s = session(5);
    let offer = s.next(GameType::OrbForge).unwrap();
    let t = offer.target.clone().unwrap();
    let t = Rational::new(t.num, t.den).unwrap();
    let wrong = (0..offer.crystals.len())
        .find(|i| Rational::new(offer.crystals[*i].num, offer.crystals[*i].den).unwrap() != t)
        .unwrap();
    let v = s.answer_orb(offer.offer_id, &[wrong], 6000.0, 0.0).unwrap();
    assert!(!v.correct && v.retry_allowed);
    assert!(
        s.answer_orb(offer.offer_id, &[0, 0], 1.0, 0.0).is_err(),
        "same crystal twice is refused"
    );
}

#[test]
fn sessions_are_deterministic_and_reject_unsupported_games() {
    let mut a = session(9);
    let mut b = session(9);
    for _ in 0..20 {
        let x = a.next(GameType::BalloonBurst).unwrap();
        let y = b.next(GameType::BalloonBurst).unwrap();
        assert_eq!(
            serde_json::to_string(&x).unwrap(),
            serde_json::to_string(&y).unwrap()
        );
    }
    assert_eq!(
        a.next(GameType::BalanceGate).err(),
        Some(SessionError::NoItemForGame(GameType::BalanceGate))
    );
}

#[test]
fn balloon_count_follows_the_chosen_template() {
    // One skill per template, so each skill's only template is always the one chosen.
    let templates = vec![
        ItemTemplate::from_json(TEMPLATES[0]).unwrap(),
        ItemTemplate::from_json(include_str!(
            "../../../content/templates/tpl.fr.add_unit_easy.v1.json"
        ))
        .unwrap(),
    ];
    let cfg = SessionConfig {
        seed: 11,
        grade: Some(4),
        candidates: 12,
        timed: false,
        expected_answer_ms: 8000.0,
        player_id: "test".into(),
        content_pack_version: "cp-test".into(),
    };
    let (mut s, _) = SoloSession::new(templates, cfg, FairnessParams::default()).unwrap();
    let mut seen_three = false;
    for _ in 0..300 {
        let offer = s.next(GameType::BalloonBurst).unwrap();
        let expected = if offer.template_id == "tpl.fr.add_unit_easy.v1" {
            3
        } else {
            4
        };
        assert_eq!(offer.balloons.len(), expected, "{}", offer.template_id);
        seen_three |= expected == 3;
        s.close(offer.offer_id);
    }
    assert!(seen_three, "the easy template was never chosen");
}
