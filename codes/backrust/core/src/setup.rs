//! How a race room is set up by whoever opens it: which games are raced, how
//! many rounds of how many seconds, and how hard the items are aimed.
//!
//! The level never changes how a rating moves, only which items are picked:
//! EASIER aims at a higher chance of being right, HARDER at a lower one.

use serde::{Deserialize, Serialize};

use crate::fairness::{FairnessParams, GameType};
use crate::race::WaveSpec;

/// Games a room may race; Measure Hunt is still a beta.
pub const ROOM_GAMES: [GameType; 5] = [
    GameType::BalloonBurst,
    GameType::OrbForge,
    GameType::FactorySort,
    GameType::BridgeBuilder,
    GameType::BalanceGate,
];
pub const MIN_ROUNDS: u8 = 1;
pub const MAX_ROUNDS: u8 = 8;
pub const MIN_SECONDS: u16 = 30;
pub const MAX_SECONDS: u16 = 180;
/// Longest race, counting every round but not the final one.
pub const MAX_TOTAL_SECONDS: u32 = 15 * 60;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    /// Each player's items aim at their own level.
    #[default]
    Adaptive,
    Easier,
    Harder,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoomSetup {
    /// Raced in this order, again from the first when rounds are left.
    pub games: Vec<GameType>,
    pub rounds: u8,
    /// How long each round lasts.
    pub seconds: u16,
    #[serde(default)]
    pub level: Level,
}

impl Default for RoomSetup {
    /// The usual race: Balloon Burst, Orb Forge, Balloon Burst, a minute each.
    fn default() -> Self {
        RoomSetup {
            games: vec![GameType::BalloonBurst, GameType::OrbForge],
            rounds: 3,
            seconds: 60,
            level: Level::Adaptive,
        }
    }
}

impl RoomSetup {
    /// What is wrong with it, as an error code; None when it can be raced.
    pub fn problem(&self) -> Option<&'static str> {
        if self.games.is_empty() || self.games.iter().any(|g| !ROOM_GAMES.contains(g)) {
            return Some("setup_games");
        }
        if self
            .games
            .iter()
            .enumerate()
            .any(|(i, g)| self.games[..i].contains(g))
        {
            return Some("setup_games");
        }
        if !(MIN_ROUNDS..=MAX_ROUNDS).contains(&self.rounds)
            || !(MIN_SECONDS..=MAX_SECONDS).contains(&self.seconds)
        {
            return Some("setup_time");
        }
        if u32::from(self.rounds) * u32::from(self.seconds) > MAX_TOTAL_SECONDS {
            return Some("setup_time");
        }
        None
    }

    /// The rounds, the chosen games taking turns.
    pub fn waves(&self) -> Vec<WaveSpec> {
        (0..self.rounds as usize)
            .map(|i| WaveSpec {
                game: self.games[i % self.games.len()],
                seconds: f64::from(self.seconds),
            })
            .collect()
    }

    /// The fairness values the room's items are picked with. The version
    /// names the level, so every answer says how it was aimed.
    pub fn params(&self, base: FairnessParams) -> FairnessParams {
        let (target, low, high, explore, tag) = match self.level {
            Level::Adaptive => return base,
            Level::Easier => (0.85, 0.72, 0.97, 0.05, "easier"),
            Level::Harder => (0.62, 0.48, 0.78, 0.15, "harder"),
        };
        FairnessParams {
            version: format!("{}+{tag}", base.version),
            target_p: target,
            accept_low: low,
            accept_high: high,
            explore_rate: explore,
            ..base
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_usual_setup_is_the_usual_race() {
        let s = RoomSetup::default();
        assert_eq!(s.problem(), None);
        let waves = s.waves();
        assert_eq!(waves.len(), 3);
        assert_eq!(waves[0].game, GameType::BalloonBurst);
        assert_eq!(waves[1].game, GameType::OrbForge);
        assert_eq!(waves[2].game, GameType::BalloonBurst);
        assert_eq!(
            s.params(FairnessParams::default()),
            FairnessParams::default()
        );
    }

    #[test]
    fn a_setup_out_of_bounds_is_refused() {
        let bad = |f: fn(&mut RoomSetup)| {
            let mut s = RoomSetup::default();
            f(&mut s);
            s.problem()
        };
        assert_eq!(bad(|s| s.games.clear()), Some("setup_games"));
        assert_eq!(
            bad(|s| s.games = vec![GameType::MeasureHunt]),
            Some("setup_games")
        );
        assert_eq!(
            bad(|s| s.games = vec![GameType::OrbForge, GameType::OrbForge]),
            Some("setup_games")
        );
        assert_eq!(bad(|s| s.rounds = 0), Some("setup_time"));
        assert_eq!(bad(|s| s.seconds = 10), Some("setup_time"));
        assert_eq!(
            bad(|s| {
                s.rounds = 8;
                s.seconds = 180;
            }),
            Some("setup_time")
        );
    }

    #[test]
    fn levels_move_the_aim_not_the_rest() {
        let base = FairnessParams::default();
        let mut s = RoomSetup {
            level: Level::Easier,
            ..RoomSetup::default()
        };
        let easy = s.params(base.clone());
        s.level = Level::Harder;
        let hard = s.params(base.clone());
        assert!(easy.target_p > base.target_p && hard.target_p < base.target_p);
        assert!(easy.version.ends_with("+easier") && hard.version.ends_with("+harder"));
        assert_eq!(easy.k_min, base.k_min);
        assert_eq!(hard.relief_p, base.relief_p);
    }
}
