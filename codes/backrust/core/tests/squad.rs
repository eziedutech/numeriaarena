//! Solo Squad: whole matches played by a simulated player against the real director.

use foldlings_core::fairness::{FairnessParams, GameType, HIGHLIGHTS};
use foldlings_core::rng::Rng;
use foldlings_core::squad::{
    PLAYER, Phase, Recap, SquadConfig, SquadEvent, SquadMatch, SquadOffer,
};
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

fn config(seed: u64) -> SquadConfig {
    serde_json::from_value(serde_json::json!({
        "seed": seed,
        "grade": 5,
        "player_id": "sim",
        "content_pack_version": "cp-test",
    }))
    .unwrap()
}

struct Played {
    events: Vec<SquadEvent>,
    recap: Recap,
    phase: Phase,
    max_bot_waiting: u32,
    max_player_waiting: u32,
    boss_offer_after_parts: bool,
}

/// Plays one match. The player answers each creature `think_ms` after it
/// appears, right with chance `accuracy`.
fn play(seed: u64, accuracy: f64, think_ms: f64, tick_ms: f64) -> Played {
    let (mut m, rejected) =
        SquadMatch::new(all_templates(), config(seed), FairnessParams::default()).unwrap();
    assert!(rejected.is_empty(), "{rejected:?}");
    let mut rng = Rng::new(seed.wrapping_mul(31) + 7);
    let mut now = 0.0;
    m.start(now);
    let mut events = Vec::new();
    let mut pending: Option<(SquadOffer, f64)> = None;
    let mut max_bot_waiting = 0;
    let mut max_player_waiting = 0;
    let mut boss_offer_after_parts = true;
    while m.phase() != Phase::Done && now < 30.0 * 60000.0 {
        events.extend(m.tick(now));
        if pending.is_none()
            && let Some(o) = m.player_next().unwrap()
        {
            if o.boss {
                let parts = events
                    .iter()
                    .filter(|e| matches!(e, SquadEvent::BossPart { .. }))
                    .count();
                boss_offer_after_parts &= parts == 2;
            }
            pending = Some((o, now + think_ms));
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
                if v.verdict.retry_allowed {
                    pending = Some((o, now + think_ms / 2.0));
                }
            } else {
                pending = Some((o, due));
            }
        }
        let view = m.view();
        max_player_waiting = max_player_waiting.max(view.desks[PLAYER].waiting);
        for d in &view.desks[1..] {
            max_bot_waiting = max_bot_waiting.max(d.waiting);
        }
        now += tick_ms;
    }
    events.extend(m.tick(now));
    Played {
        events,
        recap: m.recap(),
        phase: m.phase(),
        max_bot_waiting,
        max_player_waiting,
        boss_offer_after_parts,
    }
}

fn wave_of(events: &[SquadEvent], index: usize) -> Option<usize> {
    let mut wave = None;
    for e in &events[..=index] {
        match e {
            SquadEvent::WaveStart { wave: w, .. } => wave = Some(*w),
            SquadEvent::WaveEnd { .. } => wave = None,
            _ => {}
        }
    }
    wave
}

#[test]
fn every_match_finishes_with_a_fair_recap() {
    for seed in 1..=60u64 {
        for accuracy in [0.2, 0.75, 0.97] {
            let p = play(seed, accuracy, 6000.0, 250.0);
            let tag = format!("seed {seed} accuracy {accuracy}");
            assert_eq!(p.phase, Phase::Done, "{tag}: match never ended");
            let r = &p.recap;
            assert!((1..=3).contains(&r.stars), "{tag}: stars {}", r.stars);
            assert_eq!(r.players.len(), 3);
            assert!(r.players[1].bot && r.players[2].bot && !r.players[0].bot);
            let mut hl: Vec<_> = r.players.iter().map(|x| x.highlight.unwrap()).collect();
            hl.sort();
            hl.dedup();
            assert_eq!(hl.len(), 3, "{tag}: highlights must differ");
            assert!(hl.iter().all(|h| HIGHLIGHTS.contains(h)));
            assert_eq!(
                r.team_points,
                r.players.iter().map(|x| x.points).sum::<u32>(),
                "{tag}: team points are the sum of the desks"
            );
            // Bots stop receiving creatures at the cap; one more can arrive by escape.
            assert!(
                p.max_bot_waiting <= 6,
                "{tag}: bot desk piled up to {}",
                p.max_bot_waiting
            );
            assert!(
                p.max_player_waiting <= 4,
                "{tag}: player desk piled up to {}",
                p.max_player_waiting
            );
            assert!(
                p.boss_offer_after_parts,
                "{tag}: the player's boss part came before the bots'"
            );
            let waves: Vec<usize> = p
                .events
                .iter()
                .filter_map(|e| match e {
                    SquadEvent::WaveStart { wave, .. } => Some(*wave),
                    _ => None,
                })
                .collect();
            assert_eq!(waves, vec![0, 1, 2], "{tag}");
        }
    }
}

#[test]
fn a_bot_creature_reaches_the_player_in_wave_two() {
    for seed in 1..=60u64 {
        let p = play(seed, 0.75, 6000.0, 250.0);
        let rescues = p
            .events
            .iter()
            .enumerate()
            .filter(|(i, e)| {
                matches!(e, SquadEvent::Escape { from, to: Some(PLAYER), .. } if *from != PLAYER)
                    && wave_of(&p.events, *i) == Some(1)
            })
            .count();
        assert!(
            rescues >= 1,
            "seed {seed}: no escape to the player in wave 2"
        );
    }
}

#[test]
fn the_boss_falls_only_to_the_player() {
    for seed in 1..=30u64 {
        let strong = play(seed, 1.0, 5000.0, 250.0);
        assert!(strong.recap.boss_folded, "seed {seed}");
        let weak = play(seed, 0.0, 5000.0, 250.0);
        assert!(
            !weak.recap.boss_folded,
            "seed {seed}: boss folded without the player"
        );
        let ends: Vec<bool> = weak
            .events
            .iter()
            .filter_map(|e| match e {
                SquadEvent::BossEnd { folded, .. } => Some(*folded),
                _ => None,
            })
            .collect();
        assert_eq!(ends, vec![false]);
    }
}

#[test]
fn a_creature_that_escapes_twice_hits_the_crystal() {
    // A player who is always wrong sends every creature to a bot; the ones
    // the bot also misses must hit the crystal, never bounce forever.
    let mut hits = 0;
    for seed in 1..=30u64 {
        let p = play(seed, 0.0, 4000.0, 250.0);
        let crystal = p
            .events
            .iter()
            .filter(|e| matches!(e, SquadEvent::Escape { to: None, .. }))
            .count() as u32;
        assert_eq!(crystal > 0, !p.recap.crystals_safe, "seed {seed}");
        hits += crystal;
    }
    assert!(
        hits > 0,
        "bots never missed a rescued creature in 30 matches"
    );
}

#[test]
fn same_seed_same_match() {
    let a = play(11, 0.75, 6000.0, 250.0);
    let b = play(11, 0.75, 6000.0, 250.0);
    assert_eq!(a.events, b.events);
    assert_eq!(a.recap.team_points, b.recap.team_points);
}

/// Match statistics for the design notes: `cargo test --release --test squad report -- --ignored --nocapture`.
#[test]
#[ignore]
fn report() {
    for accuracy in [0.2, 0.75, 0.97] {
        let mut stars = [0u32; 4];
        let (mut dur, mut bot_ok, mut bot_n, mut pp, mut bp, mut resc, mut hits) =
            (0.0, 0, 0, 0, 0, 0, 0);
        for seed in 1..=60u64 {
            let p = play(seed, accuracy, 6000.0, 250.0);
            stars[p.recap.stars as usize] += 1;
            for e in &p.events {
                match e {
                    SquadEvent::MatchEnd { at_ms } => dur += at_ms / 60000.0,
                    SquadEvent::BotAnswer {
                        correct,
                        attempt: 1,
                        ..
                    } => {
                        bot_n += 1;
                        if *correct {
                            bot_ok += 1;
                        }
                    }
                    SquadEvent::Escape { to: Some(0), .. } => resc += 1,
                    SquadEvent::Escape { to: None, .. } => hits += 1,
                    _ => {}
                }
            }
            pp += p.recap.players[0].points;
            bp += p.recap.players[1].points + p.recap.players[2].points;
        }
        println!(
            "acc {accuracy}: min/match {:.1}, bot first-try {:.2} ({} answers/match), player pts {} bots pts {} (per match), rescues/match {:.1}, crystal hits/match {:.2}, stars {:?}",
            dur / 60.0,
            bot_ok as f64 / bot_n as f64,
            bot_n / 60,
            pp / 60,
            bp / 120,
            resc as f64 / 60.0,
            hits as f64 / 60.0,
            &stars[1..]
        );
    }
}
