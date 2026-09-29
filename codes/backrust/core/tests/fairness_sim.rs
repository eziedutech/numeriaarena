//! Pass conditions of the Fairness Engine, measured by the simulator.

use foldlings_core::fairness::FairnessParams;
use foldlings_core::sim::{SimConfig, run};

fn small() -> SimConfig {
    // Smaller than the CLI run so the test suite stays quick; same seed.
    SimConfig {
        students: 400,
        matches: 300,
        ..SimConfig::default()
    }
}

#[test]
fn every_criterion_passes_with_the_default_bank() {
    let report = run(&small(), &FairnessParams::default());
    for c in &report.criteria {
        assert!(c.passed, "{}: {} (limit {})", c.name, c.value, c.limit);
    }
    assert!(report.max_waiting_any_desk < small().stuck_at);
    assert!(!report.not_checked.is_empty());
}

/// Without easy items (b only down to -3) the weakest students run out of
/// items at their level; this is why templates may go down to b = -4.
#[test]
fn a_bank_without_easy_items_is_unfair() {
    let cfg = SimConfig {
        bank_low: -3.0,
        ..small()
    };
    let report = run(&cfg, &FairnessParams::default());
    assert!(
        report.points_per_min_gap > 0.10,
        "gap {}",
        report.points_per_min_gap
    );
}

#[test]
fn simulator_is_deterministic() {
    let cfg = SimConfig {
        students: 50,
        matches: 20,
        ..SimConfig::default()
    };
    let a = run(&cfg, &FairnessParams::default());
    let b = run(&cfg, &FairnessParams::default());
    assert_eq!(a.mean_abs_error_after_items, b.mean_abs_error_after_items);
    assert_eq!(a.points_per_min_gap, b.points_per_min_gap);
}
