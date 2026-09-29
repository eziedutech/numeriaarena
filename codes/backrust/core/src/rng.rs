//! Deterministic random numbers (SplitMix64).
//!
//! Same seed, same sequence on the server, in the headset (WASM) and in the
//! validator. Not for security.

#[derive(Clone, Debug)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng { state: seed }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform integer in `0..n` without modulo bias. `n` must be positive.
    pub fn below(&mut self, n: u64) -> u64 {
        assert!(n > 0, "Rng::below needs a positive bound");
        let zone = u64::MAX - (u64::MAX % n);
        loop {
            let v = self.next_u64();
            if v < zone {
                return v % n;
            }
        }
    }

    /// Uniform integer in `lo..=hi`. Returns `None` when the range is empty or too wide.
    pub fn int_between(&mut self, lo: i128, hi: i128) -> Option<i128> {
        if lo > hi {
            return None;
        }
        let span = u64::try_from(hi - lo).ok()?.checked_add(1)?;
        Some(lo + self.below(span) as i128)
    }

    /// Uniform float in `[0, 1)`.
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_sequence() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn known_first_value_is_stable_across_platforms() {
        // Reference value of SplitMix64 for seed 0; a change here breaks replays.
        assert_eq!(Rng::new(0).next_u64(), 0xE220_A839_7B1D_CDAF);
    }

    #[test]
    fn int_between_covers_the_whole_range() {
        let mut rng = Rng::new(7);
        let mut seen = [false; 6];
        for _ in 0..500 {
            let v = rng.int_between(3, 8).unwrap();
            seen[(v - 3) as usize] = true;
        }
        assert!(seen.iter().all(|s| *s));
        assert_eq!(rng.int_between(5, 4), None);
        assert_eq!(rng.int_between(5, 5), Some(5));
    }
}
