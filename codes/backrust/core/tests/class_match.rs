//! Class Match: whole matches with simulated classmates and filler bots.

use foldlings_core::class_match::{ClassConfig, ClassError, ClassEvent, ClassMatch, ClassRecap};
use foldlings_core::fairness::{FairnessParams, GameType};
use foldlings_core::race::{Phase, RaceOffer};
use foldlings_core::rng::Rng;
use foldlings_core::template::ItemTemplate;

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

fn config(seed: u64, classmates: usize, seats: usize) -> ClassConfig {
    let mates: Vec<_> = (0..classmates)
        .map(|i| {
            serde_json::json!({
                "name": format!("Blue Crane 0{}", i + 1),
                "player_id": format!("seat-{i}"),
                "grade": 5,
            })
        })
        .collect();
    serde_json::from_value(serde_json::json!({
        "seed": seed,
        "classmates": mates,
        "seats": seats,
        "content_pack_version": "cp-test",
    }))
    .unwrap()
}

struct Played {
    events: Vec<ClassEvent>,
    recap: ClassRecap,
    answer_events: Vec<(usize, String)>,
    verdict_points: Vec<u32>,
}

/// Plays one match. Each classmate answers `think_ms` after their creature
/// appears, right with chance `accuracy`. `away` drops a seat for a while.
fn play(
    seed: u64,
    classmates: usize,
    seats: usize,
    accuracy: f64,
    think_ms: f64,
    away: Option<(usize, f64, f64)>,
) -> Played {
    let (mut m, rejected) = ClassMatch::new(
        all_templates(),
        config(seed, classmates, seats),
        FairnessParams::default(),
    )
    .unwrap();
    assert!(rejected.is_empty(), "{rejected:?}");
    let mut rng = Rng::new(seed.wrapping_mul(17) + 3);
    let mut now = 0.0;
    m.start(now);
    let mut events = Vec::new();
    let mut pending: Vec<Option<(RaceOffer, f64)>> = (0..classmates).map(|_| None).collect();
    let mut verdict_points = vec![0; classmates];
    let mut answer_events = Vec::new();
    while m.phase() != Phase::Done && now < 30.0 * 60000.0 {
        events.extend(m.tick(now));
        if let Some((seat, from, to)) = away {
            if now >= from && now < to {
                m.set_away(seat, true, now).unwrap();
                pending[seat] = None;
            } else if now >= to {
                m.set_away(seat, false, now).unwrap();
            }
        }
        for seat in 0..classmates {
            if away.is_some_and(|(s, from, to)| s == seat && now >= from && now < to) {
                assert_eq!(m.next(seat, now).unwrap_err(), ClassError::Away(seat));
                continue;
            }
            if pending[seat].is_none()
                && let Some(o) = m.next(seat, now).unwrap()
            {
                pending[seat] = Some((o, now + think_ms));
            }
            let Some((o, due)) = pending[seat].take() else {
                continue;
            };
            if now < due {
                pending[seat] = Some((o, due));
                continue;
            }
            let id = o.offer.offer_id;
            let key = m.answer_key(seat, id);
            let Some(key) = key else {
                // Sent home when the round ran out.
                continue;
            };
            let right = rng.unit() < accuracy;
            let v = match o.offer.game {
                GameType::BalloonBurst => {
                    let pick = if right {
                        key[0]
                    } else {
                        (key[0] + 1) % o.offer.balloons.len()
                    };
                    m.answer_balloon(seat, id, pick, now)
                }
                _ => {
                    let pick: Vec<usize> = if right {
                        key
                    } else {
                        let wrong = (0..o.offer.crystals.len())
                            .find(|i| key != vec![*i])
                            .unwrap();
                        vec![wrong]
                    };
                    m.answer_orb(seat, id, &pick, now)
                }
            };
            match v {
                Ok(v) => {
                    verdict_points[seat] += v.race_points;
                    if v.verdict.retry_allowed {
                        pending[seat] = Some((o, now + think_ms));
                    }
                }
                Err(e) => panic!("seat {seat}: {e}"),
            }
        }
        answer_events.extend(
            m.drain_answer_events()
                .into_iter()
                .map(|e| (e.seat, e.event.event_id)),
        );
        now += 100.0;
    }
    events.extend(m.tick(now));
    assert_eq!(m.phase(), Phase::Done);
    Played {
        events,
        recap: m.recap(),
        answer_events,
        verdict_points,
    }
}

#[test]
fn three_classmates_race_on_one_clock() {
    let p = play(11, 3, 3, 0.8, 6000.0, None);
    // Three waves and a boss, one shared clock.
    let starts = p
        .events
        .iter()
        .filter(|e| matches!(e, ClassEvent::WaveStart { .. }))
        .count();
    assert_eq!(starts, 3);
    assert!(
        p.events
            .iter()
            .any(|e| matches!(e, ClassEvent::BossStart { .. }))
    );
    let ends: Vec<f64> = p
        .events
        .iter()
        .filter_map(|e| match e {
            ClassEvent::MatchEnd { at_ms } => Some(*at_ms),
            _ => None,
        })
        .collect();
    assert_eq!(ends, vec![3.0 * 60000.0 + 20000.0 + 3.0 * 4000.0]);
    assert!(p.recap.players.iter().all(|r| !r.bot));
    for seat in 0..3 {
        assert_eq!(p.recap.players[seat].points, p.verdict_points[seat]);
        assert!(
            p.recap.players[seat].folded > 5,
            "{:?}",
            p.recap.players[seat]
        );
        assert!(!p.recap.skills[seat].is_empty());
    }
    // Every answer is an event of its own, once.
    let mut ids: Vec<&String> = p.answer_events.iter().map(|(_, id)| id).collect();
    let n = ids.len();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), n);
}

#[test]
fn empty_seats_are_bots_and_write_no_answers() {
    let p = play(5, 1, 3, 0.7, 7000.0, None);
    let r = &p.recap.players;
    assert!(!r[0].bot && r[1].bot && r[2].bot);
    assert_eq!(r[1].name, "Clip");
    assert!(r[1].folded > 0 && r[2].folded > 0);
    assert!(p.recap.skills[1].is_empty() && p.recap.skills[2].is_empty());
    assert!(!p.answer_events.is_empty());
    assert!(p.answer_events.iter().all(|(seat, _)| *seat == 0));
    // Bots show what they are working on, for the Arena Screen.
    assert!(
        p.events
            .iter()
            .any(|e| matches!(e, ClassEvent::SeatWorking { seat: 2, .. }))
    );
}

#[test]
fn a_seat_away_gets_nothing_and_comes_back() {
    let p = play(9, 2, 3, 0.8, 6000.0, Some((1, 20000.0, 50000.0)));
    assert!(
        p.events
            .iter()
            .any(|e| matches!(e, ClassEvent::SeatAway { seat: 1, .. }))
    );
    assert!(
        p.events
            .iter()
            .any(|e| matches!(e, ClassEvent::SeatBack { seat: 1, .. }))
    );
    // Nothing for seat 1 while it was away.
    assert!(!p.events.iter().any(|e| matches!(e,
        ClassEvent::SeatWorking { seat: 1, at_ms, .. } | ClassEvent::SeatAnswer { seat: 1, at_ms, .. }
            if *at_ms > 20000.0 && *at_ms < 50000.0)));
    assert!(p.recap.players[1].folded > 0);
}

#[test]
fn the_demo_room_is_bots_only() {
    let (mut m, _) =
        ClassMatch::new(all_templates(), config(3, 0, 3), FairnessParams::default()).unwrap();
    m.start(0.0);
    let mut now = 0.0;
    while m.phase() != Phase::Done {
        now += 500.0;
        m.tick(now);
    }
    let r = m.recap();
    assert!(r.players.iter().all(|p| p.bot && p.folded > 0));
    assert!(m.drain_answer_events().is_empty());
}

#[test]
fn same_seed_same_match() {
    let a = play(21, 2, 4, 0.75, 6500.0, None);
    let b = play(21, 2, 4, 0.75, 6500.0, None);
    assert_eq!(a.events, b.events);
    assert_eq!(a.answer_events, b.answer_events);
}

#[test]
fn seats_are_checked() {
    let t = all_templates;
    let p = FairnessParams::default;
    assert!(matches!(
        ClassMatch::new(t(), config(1, 0, 0), p()),
        Err(ClassError::Seats)
    ));
    assert!(matches!(
        ClassMatch::new(t(), config(1, 4, 3), p()),
        Err(ClassError::Seats)
    ));
    assert!(matches!(
        ClassMatch::new(t(), config(1, 1, 7), p()),
        Err(ClassError::Seats)
    ));
    let (mut m, _) = ClassMatch::new(t(), config(1, 1, 3), p()).unwrap();
    m.start(0.0);
    assert_eq!(m.next(1, 0.0).unwrap_err(), ClassError::NotClassmate(1));
    assert_eq!(m.next(5, 0.0).unwrap_err(), ClassError::UnknownSeat(5));
    let o = m.next(0, 0.0).unwrap().unwrap();
    assert!(m.next(0, 10.0).unwrap().is_none());
    // Measured on the server's clock: 3 s after it was handed out.
    let v = m.answer_balloon(0, o.offer.offer_id, 0, 3000.0);
    assert!(v.is_ok() || o.offer.game != GameType::BalloonBurst);
    let ev = m.drain_answer_events();
    if let Some(e) = ev.first() {
        assert_eq!(e.event.time_ms, 3000.0);
        assert_eq!(e.event.mode, "class_match");
    }
}
