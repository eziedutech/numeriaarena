//! Exact rational numbers.
//!
//! A value keeps the numerator and denominator it was built with, so
//! `frac(2, 8)` can still be shown as `2/8` when a template asks for an
//! unsimplified answer. Every arithmetic result is reduced. Equality and
//! ordering compare values, not spellings.

use std::cmp::Ordering;
use std::fmt;

use crate::error::EvalError;

#[derive(Clone, Copy, Debug)]
pub struct Rational {
    num: i128,
    den: i128,
}

pub fn gcd(a: i128, b: i128) -> i128 {
    let (mut a, mut b) = (a.abs(), b.abs());
    while b != 0 {
        (a, b) = (b, a % b);
    }
    a
}

impl Rational {
    pub const ZERO: Rational = Rational { num: 0, den: 1 };
    pub const ONE: Rational = Rational { num: 1, den: 1 };

    pub fn int(n: i128) -> Self {
        Rational { num: n, den: 1 }
    }

    /// Builds `num/den` exactly as written (sign moved to the numerator).
    pub fn raw(num: i128, den: i128) -> Result<Self, EvalError> {
        if den == 0 {
            return Err(EvalError::DivisionByZero);
        }
        if den < 0 {
            let num = num.checked_neg().ok_or(EvalError::Overflow)?;
            let den = den.checked_neg().ok_or(EvalError::Overflow)?;
            return Ok(Rational { num, den });
        }
        Ok(Rational { num, den })
    }

    pub fn new(num: i128, den: i128) -> Result<Self, EvalError> {
        Ok(Self::raw(num, den)?.reduced())
    }

    pub fn num(&self) -> i128 {
        self.num
    }

    pub fn den(&self) -> i128 {
        self.den
    }

    pub fn reduced(&self) -> Self {
        let g = gcd(self.num, self.den);
        if g <= 1 {
            return *self;
        }
        Rational {
            num: self.num / g,
            den: self.den / g,
        }
    }

    pub fn is_integer(&self) -> bool {
        self.num % self.den == 0
    }

    pub fn is_reduced(&self) -> bool {
        gcd(self.num, self.den) == 1
    }

    pub fn is_negative(&self) -> bool {
        self.num < 0
    }

    /// Parses a plain decimal literal such as `12`, `0.25` or `-3.5`.
    pub fn parse_decimal(text: &str) -> Option<Self> {
        let (negative, body) = match text.strip_prefix('-') {
            Some(rest) => (true, rest),
            None => (false, text),
        };
        let (whole, frac) = match body.split_once('.') {
            Some((w, f)) => (w, f),
            None => (body, ""),
        };
        if whole.is_empty() && frac.is_empty() {
            return None;
        }
        if !whole.chars().all(|c| c.is_ascii_digit()) || !frac.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        if frac.len() > 18 {
            return None;
        }
        let digits = format!("{whole}{frac}");
        let mut num: i128 = if digits.is_empty() {
            0
        } else {
            digits.parse().ok()?
        };
        if negative {
            num = -num;
        }
        let den = 10i128.checked_pow(frac.len() as u32)?;
        Rational::new(num, den).ok()
    }

    /// Converts a JSON number. Uses the shortest round-trip spelling of the
    /// float, so `0.1` becomes exactly 1/10, not the binary approximation.
    pub fn from_f64(value: f64) -> Option<Self> {
        if !value.is_finite() {
            return None;
        }
        let text = format!("{value}");
        if text.contains('e') || text.contains('E') {
            return None;
        }
        Self::parse_decimal(&text)
    }

    pub fn to_f64(&self) -> f64 {
        self.num as f64 / self.den as f64
    }

    pub fn checked_add(&self, other: &Self) -> Result<Self, EvalError> {
        let num = self
            .num
            .checked_mul(other.den)
            .and_then(|a| {
                other
                    .num
                    .checked_mul(self.den)
                    .and_then(|b| a.checked_add(b))
            })
            .ok_or(EvalError::Overflow)?;
        let den = self.den.checked_mul(other.den).ok_or(EvalError::Overflow)?;
        Rational::new(num, den)
    }

    pub fn checked_sub(&self, other: &Self) -> Result<Self, EvalError> {
        self.checked_add(&other.checked_neg()?)
    }

    pub fn checked_neg(&self) -> Result<Self, EvalError> {
        Ok(Rational {
            num: self.num.checked_neg().ok_or(EvalError::Overflow)?,
            den: self.den,
        })
    }

    pub fn checked_mul(&self, other: &Self) -> Result<Self, EvalError> {
        let a = self.reduced();
        let b = other.reduced();
        let num = a.num.checked_mul(b.num).ok_or(EvalError::Overflow)?;
        let den = a.den.checked_mul(b.den).ok_or(EvalError::Overflow)?;
        Rational::new(num, den)
    }

    pub fn checked_div(&self, other: &Self) -> Result<Self, EvalError> {
        if other.num == 0 {
            return Err(EvalError::DivisionByZero);
        }
        let inverse = Rational::raw(other.den, other.num)?;
        self.checked_mul(&inverse)
    }

    /// Remainder with the sign of the divisor, so `-1 % 3 == 2`.
    pub fn checked_rem(&self, other: &Self) -> Result<Self, EvalError> {
        if other.num == 0 {
            return Err(EvalError::DivisionByZero);
        }
        let quotient = self.checked_div(other)?.floor();
        self.checked_sub(&other.checked_mul(&Rational::int(quotient))?)
    }

    pub fn floor(&self) -> i128 {
        self.num.div_euclid(self.den)
    }

    pub fn ceil(&self) -> i128 {
        -((-self.num).div_euclid(self.den))
    }

    /// Rounds to `places` decimal places, halves away from zero.
    pub fn round_to(&self, places: u32) -> Result<Self, EvalError> {
        let scale = 10i128.checked_pow(places).ok_or(EvalError::Overflow)?;
        let scaled = self.checked_mul(&Rational::int(scale))?;
        let twice = scaled.num.checked_mul(2).ok_or(EvalError::Overflow)?;
        let den2 = scaled.den.checked_mul(2).ok_or(EvalError::Overflow)?;
        let rounded = if scaled.num >= 0 {
            (twice + scaled.den).div_euclid(den2)
        } else {
            -((-twice + scaled.den).div_euclid(den2))
        };
        Rational::new(rounded, scale)
    }

    /// True when the value has a finite decimal expansion of at most `places` digits.
    pub fn fits_decimal_places(&self, places: u32) -> bool {
        match self.round_to(places) {
            Ok(r) => r == *self,
            Err(_) => false,
        }
    }
}

impl PartialEq for Rational {
    fn eq(&self, other: &Self) -> bool {
        let a = self.reduced();
        let b = other.reduced();
        a.num == b.num && a.den == b.den
    }
}

impl Eq for Rational {}

impl PartialOrd for Rational {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Rational {
    fn cmp(&self, other: &Self) -> Ordering {
        let a = self.reduced();
        let b = other.reduced();
        // Denominators are positive, so cross multiplication keeps the order.
        match (a.num.checked_mul(b.den), b.num.checked_mul(a.den)) {
            (Some(x), Some(y)) => x.cmp(&y),
            _ => a.to_f64().total_cmp(&b.to_f64()),
        }
    }
}

impl std::hash::Hash for Rational {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        let r = self.reduced();
        r.num.hash(state);
        r.den.hash(state);
    }
}

impl fmt::Display for Rational {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.den == 1 {
            write!(f, "{}", self.num)
        } else {
            write!(f, "{}/{}", self.num, self.den)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(n: i128, d: i128) -> Rational {
        Rational::new(n, d).unwrap()
    }

    #[test]
    fn keeps_raw_spelling_until_arithmetic() {
        let raw = Rational::raw(2, 8).unwrap();
        assert_eq!((raw.num(), raw.den()), (2, 8));
        assert_eq!(raw, r(1, 4));
        let sum = raw.checked_add(&Rational::raw(2, 8).unwrap()).unwrap();
        assert_eq!((sum.num(), sum.den()), (1, 2));
    }

    #[test]
    fn decimal_literals_are_exact() {
        assert_eq!(Rational::parse_decimal("0.1").unwrap(), r(1, 10));
        assert_eq!(Rational::from_f64(0.1).unwrap(), r(1, 10));
        assert_eq!(Rational::from_f64(9.9).unwrap(), r(99, 10));
        assert_eq!(Rational::parse_decimal("-3.50").unwrap(), r(-7, 2));
        assert!(Rational::parse_decimal("1.2.3").is_none());
        let sum = Rational::from_f64(0.1)
            .unwrap()
            .checked_add(&Rational::from_f64(0.2).unwrap())
            .unwrap();
        assert_eq!(sum, r(3, 10));
    }

    #[test]
    fn floor_ceil_rem_follow_math_not_truncation() {
        assert_eq!(r(-7, 2).floor(), -4);
        assert_eq!(r(-7, 2).ceil(), -3);
        assert_eq!(r(7, 2).floor(), 3);
        assert_eq!(
            Rational::int(-1).checked_rem(&Rational::int(3)).unwrap(),
            Rational::int(2)
        );
        assert_eq!(
            Rational::int(14).checked_rem(&Rational::int(7)).unwrap(),
            Rational::ZERO
        );
    }

    #[test]
    fn rounding_halves_away_from_zero() {
        assert_eq!(r(5, 2).round_to(0).unwrap(), Rational::int(3));
        assert_eq!(r(-5, 2).round_to(0).unwrap(), Rational::int(-3));
        assert_eq!(r(1, 3).round_to(2).unwrap(), r(33, 100));
        assert_eq!(r(2, 3).round_to(2).unwrap(), r(67, 100));
        assert!(r(1, 4).fits_decimal_places(2));
        assert!(!r(1, 8).fits_decimal_places(2));
        assert!(!r(1, 3).fits_decimal_places(3));
    }

    #[test]
    fn division_by_zero_is_an_error() {
        assert_eq!(Rational::new(1, 0), Err(EvalError::DivisionByZero));
        assert_eq!(
            Rational::ONE.checked_div(&Rational::ZERO),
            Err(EvalError::DivisionByZero)
        );
    }

    #[test]
    fn ordering_compares_values() {
        assert!(r(1, 2) > r(45, 100));
        assert!(Rational::raw(3, 6).unwrap() == r(1, 2));
    }
}
