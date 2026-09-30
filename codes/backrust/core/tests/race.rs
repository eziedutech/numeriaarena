//! Race: whole matches played by a simulated player against two rival bots.

use foldlings_core::fairness::{FairnessParams, GameType};
use foldlings_core::race::{PLAYER, Phase, RaceConfig, RaceEvent, RaceMatch, RaceOffer, Recap};
use foldlings_core::rng::Rng;
use foldlings_core::session::SessionError;
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
    player_points_from_verdicts: u32,
    /// Answers the core refused because the round's clock had run out.
    late_answers: u32,
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
    let mut verdict_points = 0;
    let mut late_answers = 0;
    // The player's next creature appears after the last one's homecoming.
    let mut ready_at = 0.0;
    while m.phase() != Phase::Done && now < 30.0 * 60000.0 {
        events.extend(m.tick(now));
        if pending.is_none()
            && now >= ready_at
            && let Some(o) = m.player_next().unwrap()
        {
            // Walk-in (0.7 s) before the answer clock starts.
            pending = Some((o, now + 700.0 + think_ms));
        }
        if let Some((o, due)) = pending.take() {
            if now >= due {
                let key = m.answer_key(o.offer.offer_id);
                let right = rng.unit() < accuracy;
                let result = match (o.offer.game, key) {
                    (_, None) => Err(SessionError::UnknownOffer(o.offer.offer_id)),
                    (GameType::BalloonBurst, Some(key)) => {
                        let pick = if right {
                            key[0]
                        } else {
                            (key[0] + 1) % o.offer.balloons.len()
                        };
                        m.answer_balloon(o.offer.offer_id, pick, think_ms, now)
                    }
                    (GameType::OrbForge, Some(key)) => {
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
                    (other, _) => panic!("unexpected game {other:?}"),
                };
                match result {
                    Ok(v) => {
                        assert_eq!(v.verdict.correct, right);
                        assert_eq!(v.race_points, v.verdict.points * if o.boss { 2 } else { 1 });
                        verdict_points += v.race_points;
                        if v.verdict.retry_allowed {
                            pending = Some((o, now + think_ms / 2.0));
                        } else {
                            ready_at = now + 2600.0;
                        }
                    }
                    // The round ended while this creature was open: it went home.
                    Err(SessionError::UnknownOffer(_)) => late_answers += 1,
                    Err(e) => panic!("{e}"),
                }
            } else {
                pending = Some((o, due));
            }
        }
        now += 250.0;
    }
    events.extend(m.tick(now));
    Played {
        events,
        recap: m.recap(),
        phase: m.phase(),
        player_points_from_verdicts: verdict_points,
        late_answers,
    }
}

/// (start, end) of every round, in match milliseconds.
fn rounds(events: &[RaceEvent]) -> Vec<(f64, f64)> {
    let mut out = Vec::new();
    let mut start = None;
    for e in events {
        match e {
            RaceEvent::WaveStart {
                at_ms, ends_at_ms, ..
            }
            | RaceEvent::BossStart { at_ms, ends_at_ms } => start = Some((*at_ms, *ends_at_ms)),
            RaceEvent::TimeUp { at_ms, .. } => {
                let (s, planned) = start.take().expect("time up without a round");
                assert_eq!(*at_ms, planned, "a round ended off its clock");
                out.push((s, *at_ms));
            }
            _ => {}
        }
    }
    out
}

#[test]
fn every_race_runs_on_the_clock_with_consistent_places() {
    for seed in 1..=40u64 {
        for accuracy in [0.2, 0.75, 0.97] {
            let p = play(seed, accuracy, 6000.0);
            let tag = format!("seed {seed} accuracy {accuracy}");
            assert_eq!(p.phase, Phase::Done, "{tag}: race never ended");
            let lengths: Vec<f64> = rounds(&p.events).iter().map(|(s, e)| e - s).collect();
            assert_eq!(lengths, vec![60000.0, 60000.0, 60000.0, 20000.0], "{tag}");
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
fn no_bot_answer_lands_outside_a_round() {
    let p = play(5, 0.75, 6000.0);
    let rounds = rounds(&p.events);
    for e in &p.events {
        if let RaceEvent::BotAnswer { at_ms, .. } = e {
            assert!(
                rounds.iter().any(|(s, end)| at_ms >= s && at_ms <= end),
                "bot answered at {at_ms}, outside every round"
            );
        }
    }
}

#[test]
fn an_answer_after_time_up_is_refused() {
    // A very slow player often has a creature open when the clock runs out.
    let late: u32 = (1..=10u64)
        .map(|s| play(s, 0.9, 25000.0).late_answers)
        .sum();
    assert!(late > 0, "no answer ever arrived after time up");
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
    for think in [4000.0, 6000.0, 10000.0] {
        for accuracy in [0.5, 0.75, 0.9] {
            let mut places = [0u32; 4];
            let (mut player, mut bots, mut folded) = (0u32, 0u32, 0u32);
            let n = 100u64;
            for seed in 1..=n {
                let p = play(seed, accuracy, think);
                places[p.recap.players[PLAYER].place as usize] += 1;
                player += p.recap.players[PLAYER].points;
                folded += p.recap.players[PLAYER].folded;
                bots += p.recap.players[1].points + p.recap.players[2].points;
            }
            println!(
                "{:>2.0} s per answer, right {accuracy}: places 1/2/3 = {}/{}/{} of {n}, player {} pts ({} folded), bot {} pts (mean)",
                think / 1000.0,
                places[1],
                places[2],
                places[3],
                player / n as u32,
                folded / n as u32,
                bots / (2 * n as u32)
            );
        }
    }
}
