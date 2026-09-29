//! The only number formatter in Foldlings.
//!
//! - Decimal separator is always a point, in every language: `2.5`.
//! - No thousands separator: `12500`, `1000000`.
//! - Fractions `3/8`, mixed numbers `1 3/8`.
//! - Negative numbers use an ASCII hyphen-minus.
//!
//! Templates never format numbers themselves.

use std::fmt;

use crate::rational::Rational;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Unit {
    Mm,
    Cm,
    M,
}

impl Unit {
    pub fn symbol(self) -> &'static str {
        match self {
            Unit::Mm => "mm",
            Unit::Cm => "cm",
            Unit::M => "m",
        }
    }

    pub fn parse(text: &str) -> Option<Unit> {
        match text {
            "mm" => Some(Unit::Mm),
            "cm" => Some(Unit::Cm),
            "m" => Some(Unit::M),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumberFormat {
    Int,
    /// `simplify: false` shows the fraction exactly as the template built it.
    Fraction {
        simplify: bool,
    },
    Mixed {
        simplify: bool,
    },
    /// At most `places` digits after the point; trailing zeros are dropped.
    Decimal {
        places: u32,
    },
    Percent {
        places: u32,
    },
    Measure {
        unit: Unit,
        places: u32,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FormatError {
    NotWhole(String),
    TooManyDecimalPlaces { value: String, places: u32 },
}

impl fmt::Display for FormatError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FormatError::NotWhole(v) => write!(f, "{v} is not a whole number"),
            FormatError::TooManyDecimalPlaces { value, places } => {
                write!(
                    f,
                    "{value} cannot be written exactly with {places} decimal places"
                )
            }
        }
    }
}

impl std::error::Error for FormatError {}

pub fn format_number(value: &Rational, format: NumberFormat) -> Result<String, FormatError> {
    match format {
        NumberFormat::Int => {
            if !value.is_integer() {
                return Err(FormatError::NotWhole(value.to_string()));
            }
            Ok(value.reduced().num().to_string())
        }
        NumberFormat::Fraction { simplify } => Ok(fraction(value, simplify)),
        NumberFormat::Mixed { simplify } => Ok(mixed(value, simplify)),
        NumberFormat::Decimal { places } => decimal(value, places),
        NumberFormat::Percent { places } => {
            let hundred = value
                .checked_mul(&Rational::int(100))
                .map_err(|_| FormatError::NotWhole(value.to_string()))?;
            Ok(format!("{}%", decimal(&hundred, places)?))
        }
        NumberFormat::Measure { unit, places } => {
            Ok(format!("{} {}", decimal(value, places)?, unit.symbol()))
        }
    }
}

/// Default spelling for prompt placeholders: whole numbers as integers,
/// short terminating decimals as decimals, everything else as a fraction
/// in the spelling it was built with.
pub fn format_auto(value: &Rational) -> String {
    if value.is_integer() {
        return value.reduced().num().to_string();
    }
    if value.den() != value.reduced().den() {
        // Built by frac() with a deliberate spelling, e.g. 2/8.
        return fraction(value, false);
    }
    match decimal(value, 3) {
        Ok(text) => text,
        Err(_) => fraction(value, true),
    }
}

fn fraction(value: &Rational, simplify: bool) -> String {
    let v = if simplify { value.reduced() } else { *value };
    if v.den() == 1 {
        v.num().to_string()
    } else {
        format!("{}/{}", v.num(), v.den())
    }
}

fn mixed(value: &Rational, simplify: bool) -> String {
    let v = if simplify { value.reduced() } else { *value };
    let negative = v.num() < 0;
    let n = v.num().abs();
    let d = v.den();
    let whole = n / d;
    let rest = n % d;
    let body = match (whole, rest) {
        (w, 0) => w.to_string(),
        (0, r) => format!("{r}/{d}"),
        (w, r) => format!("{w} {r}/{d}"),
    };
    if negative { format!("-{body}") } else { body }
}

fn decimal(value: &Rational, places: u32) -> Result<String, FormatError> {
    if !value.fits_decimal_places(places) {
        return Err(FormatError::TooManyDecimalPlaces {
            value: value.to_string(),
            places,
        });
    }
    let v = value.reduced();
    let negative = v.num() < 0;
    let scale = 10i128.pow(places);
    // Exact because the value fits `places`.
    let scaled = (v.num().abs() * scale) / v.den();
    let whole = scaled / scale;
    let mut frac = format!("{:0width$}", scaled % scale, width = places as usize);
    while frac.ends_with('0') {
        frac.pop();
    }
    let body = if frac.is_empty() {
        whole.to_string()
    } else {
        format!("{whole}.{frac}")
    };
    Ok(if negative && body != "0" {
        format!("-{body}")
    } else {
        body
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(n: i128, d: i128) -> Rational {
        Rational::new(n, d).unwrap()
    }

    #[test]
    fn no_thousands_separator_and_point_decimal() {
        assert_eq!(
            format_number(&Rational::int(12500), NumberFormat::Int).unwrap(),
            "12500"
        );
        assert_eq!(
            format_number(&Rational::int(1000000), NumberFormat::Int).unwrap(),
            "1000000"
        );
        assert_eq!(
            format_number(&r(5, 2), NumberFormat::Decimal { places: 2 }).unwrap(),
            "2.5"
        );
        assert_eq!(
            format_number(&r(1234567, 100), NumberFormat::Decimal { places: 2 }).unwrap(),
            "12345.67"
        );
        assert_eq!(
            format_number(&r(-1, 20), NumberFormat::Decimal { places: 2 }).unwrap(),
            "-0.05"
        );
        assert_eq!(
            format_number(&Rational::int(3), NumberFormat::Decimal { places: 2 }).unwrap(),
            "3"
        );
    }

    #[test]
    fn decimals_that_do_not_fit_are_errors() {
        assert!(matches!(
            format_number(&r(1, 3), NumberFormat::Decimal { places: 3 }),
            Err(FormatError::TooManyDecimalPlaces { .. })
        ));
        assert!(format_number(&r(1, 2), NumberFormat::Int).is_err());
    }

    #[test]
    fn fractions_and_mixed_numbers() {
        let raw = Rational::raw(6, 8).unwrap();
        assert_eq!(
            format_number(&raw, NumberFormat::Fraction { simplify: false }).unwrap(),
            "6/8"
        );
        assert_eq!(
            format_number(&raw, NumberFormat::Fraction { simplify: true }).unwrap(),
            "3/4"
        );
        assert_eq!(
            format_number(&r(11, 8), NumberFormat::Mixed { simplify: true }).unwrap(),
            "1 3/8"
        );
        assert_eq!(
            format_number(&r(-11, 8), NumberFormat::Mixed { simplify: true }).unwrap(),
            "-1 3/8"
        );
        assert_eq!(
            format_number(&r(3, 8), NumberFormat::Mixed { simplify: true }).unwrap(),
            "3/8"
        );
        assert_eq!(
            format_number(&Rational::int(2), NumberFormat::Mixed { simplify: true }).unwrap(),
            "2"
        );
    }

    #[test]
    fn percent_and_measure() {
        assert_eq!(
            format_number(&r(1, 4), NumberFormat::Percent { places: 0 }).unwrap(),
            "25%"
        );
        assert_eq!(
            format_number(&r(125, 1000), NumberFormat::Percent { places: 1 }).unwrap(),
            "12.5%"
        );
        let m = NumberFormat::Measure {
            unit: Unit::M,
            places: 2,
        };
        assert_eq!(format_number(&r(13, 10), m).unwrap(), "1.3 m");
    }

    #[test]
    fn auto_format_for_placeholders() {
        assert_eq!(format_auto(&Rational::int(42)), "42");
        assert_eq!(format_auto(&r(1, 10)), "0.1");
        assert_eq!(format_auto(&r(358, 100)), "3.58");
        assert_eq!(format_auto(&r(1, 3)), "1/3");
        assert_eq!(format_auto(&Rational::raw(2, 8).unwrap()), "2/8");
    }
}
