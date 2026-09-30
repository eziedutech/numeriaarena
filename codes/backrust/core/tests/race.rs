//! Race: whole matches played by a simulated player against two rival bots.

use foldlings_core::fairness::{FairnessParams, GameType};
use foldlings_core::race::{PLAYER, Phase, RaceConfig, RaceEvent, RaceMatch, RaceOffer, Recap};
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

fn config(seed: u64) -> RaceConfig {
    serde_json::from_value(serde_json::json!({
        "seed": seed,
        "grade": 5,
        "player_id": "sim",
        "content_pack_version": "cp-test",
    }))
    .unwrap()
}

struct Played {
    events: Vec<RaceEvent>,
    recap: Recap,
    phase: Phase,
    /// Creatures each desk met in every round, read when the round ended.
    met_per_round: Vec<[u32; 3]>,
    player_points_from_verdicts: u32,
    minutes: f64,
}

/// Plays one match. The player answers each creature `think_ms` after it
/// appears (plus walk-in and homecoming time), right with chance `accuracy`.
fn play(seed: u64, accuracy: f64, think_ms: f64) -> Played {
    let (mut m, rejected) =
        RaceMatch::new(all_templates(), config(seed), FairnessParams::default()).unwrap();
    assert!(rejected.is_empty(), "{rejected:?}");
    let mut rng = Rng::new(seed.wrapping_mul(31) + 7);
    let mut now = 0.0;
    m.start(now);
    let mut events = Vec::new();
    let mut pending: Option<(RaceOffer, f64)> = None;
    let mut met_per_round = Vec::new();
    // Creatures met this round, counted from what actually happened.
    let mut round = [0u32; 3];
    let mut verdict_points = 0;
    while m.phase() != Phase::Done && now < 30.0 * 60000.0 {
        let fresh = m.tick(now);
        for e in &fresh {
            match e {
                RaceEvent::BotWorking { desk, .. } => round[*desk] += 1,
                RaceEvent::WaveEnd { .. } | RaceEvent::MatchEnd { .. } => {
                    met_per_round.push(round);
                    round = [0; 3];
                }
                _ => {}
            }
        }
        events.extend(fresh);
        if pending.is_none()
            && let Some(o) = m.player_next().unwrap()
        {
            round[PLAYER] += 1;
            // Walk-in (0.7 s) before the answer clock starts.
            pending = Some((o, now + 700.0 + think_ms));
        }
        if let Some((o, due)) = pending.take() {
            if now >= due {
                let key = m
                    .answer_key(o.offer.offer_id)
                    .expect("open offer has a key");
                let right = rng.unit() < accuracy;
                let v = match o.offer.game {
                    GameType::BalloonBurst => {
                        let pick = if right {
                            key[0]
                        } else {
                            (key[0] + 1) % o.offer.balloons.len()
                        };
                        m.answer_balloon(o.offer.offer_id, pick, think_ms, now)
                    }
                    GameType::OrbForge => {
                        let picks = if right {
                            key.clone()
                        } else {
                            let wrong = (0..o.offer.crystals.len())
                                .find(|i| key != vec![*i])
                                .unwrap();
                            vec![wrong]
                        };
                        m.answer_orb(o.offer.offer_id, &picks, think_ms, now)
                    }
                    other => panic!("unexpected game {other:?}"),
                }
                .unwrap();
                assert_eq!(v.verdict.correct, right);
                assert_eq!(v.race_points, v.verdict.points * if o.boss { 2 } else { 1 });
                verdict_points += v.race_points;
                if v.verdict.retry_allowed {
                    pending = Some((o, now + think_ms / 2.0));
                } else {
                    // Homecoming animation before the desk takes the next creature.
                    now += 2600.0;
                }
            } else {
                pending = Some((o, due));
            }
        }
        now += 250.0;
    }
    events.extend(m.tick(now));
    Played {
        minutes: events
            .iter()
            .find_map(|e| match e {
                RaceEvent::MatchEnd { at_ms } => Some(at_ms / 60000.0),
                _ => None,
            })
            .unwrap_or(f64::NAN),
        events,
        recap: m.recap(),
        phase: m.phase(),
        met_per_round,
        player_points_from_verdicts: verdict_points,
    }
}

#[test]
fn every_race_finishes_with_equal_rounds_and_consistent_places() {
    for seed in 1..=60u64 {
        for accuracy in [0.2, 0.75, 0.97] {
            let p = play(seed, accuracy, 6000.0);
            let tag = format!("seed {seed} accuracy {accuracy}");
            assert_eq!(p.phase, Phase::Done, "{tag}: race never ended");
            // Three waves of 5 and a boss round of 1, the same for every desk.
            assert_eq!(
                p.met_per_round,
                vec![[5, 5, 5], [5, 5, 5], [5, 5, 5], [1, 1, 1]],
                "{tag}"
            );
            let r = &p.recap;
            assert_eq!(r.players.len(), 3);
            assert!(!r.players[PLAYER].bot && r.players[1].bot && r.players[2].bot);
            assert_eq!(
                r.players[PLAYER].points, p.player_points_from_verdicts,
                "{tag}"
            );
            for a in &r.players {
                let above = r.players.iter().filter(|b| b.points > a.points).count() as u32;
                assert_eq!(a.place, above + 1, "{tag}: place must follow points");
                assert!((1..=3).contains(&a.stars), "{tag}");
            }
            let mut hl: Vec<_> = r.players.iter().map(|x| x.highlight.unwrap()).collect();
            hl.sort();
            hl.dedup();
            assert_eq!(hl.len(), 3, "{tag}: highlights must differ");
        }
    }
}

#[test]
fn same_seed_same_race() {
    let a = play(11, 0.75, 6000.0);
    let b = play(11, 0.75, 6000.0);
    assert_eq!(a.events, b.events);
    assert_eq!(a.recap.players[1].points, b.recap.players[1].points);
}

#[test]
fn a_player_who_never_misses_usually_wins() {
    let wins = (1..=60u64)
        .filter(|s| play(*s, 1.0, 5000.0).recap.players[PLAYER].place == 1)
        .count();
    assert!(wins >= 45, "a perfect player won only {wins} of 60 races");
}

/// Race statistics for the design notes:
/// `cargo test --release --test race report -- --ignored --nocapture`.
#[test]
#[ignore]
fn report() {
    for accuracy in [0.2, 0.5, 0.75, 0.9, 0.97] {
        let mut places = [0u32; 4];
        let (mut minutes, mut player, mut bots) = (0.0, 0u32, 0u32);
        let n = 100u64;
        for seed in 1..=n {
            let p = play(seed, accuracy, 6000.0);
            places[p.recap.players[PLAYER].place as usize] += 1;
            minutes += p.minutes;
            player += p.recap.players[PLAYER].points;
            bots += p.recap.players[1].points + p.recap.players[2].points;
        }
        println!(
            "right {accuracy}: places 1/2/3 = {}/{}/{} of {n}, {:.1} min, player {} pts, bot {} pts (mean)",
            places[1],
            places[2],
            places[3],
            minutes / n as f64,
            player / n as u32,
            bots / (2 * n as u32)
        );
    }
}
