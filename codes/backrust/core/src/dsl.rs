//! Safe expression language for item templates.
//!
//! Numbers are exact fractions. No JavaScript, no loops, no user functions:
//! only the operators and functions listed in `item-template.schema.json`.
//!
//! Precedence, lowest first: `or`, `and`, `not`, comparison (not chainable),
//! `+ -`, `* / %`, unary `-`.

use std::collections::BTreeMap;
use std::fmt;

use crate::error::{EvalError, ParseError};
use crate::rational::{Rational, gcd};

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Num(Rational),
    Bool(bool),
    Text(String),
}

impl Value {
    pub fn as_num(&self) -> Result<Rational, EvalError> {
        match self {
            Value::Num(r) => Ok(*r),
            _ => Err(EvalError::Type("expected a number")),
        }
    }

    pub fn as_bool(&self) -> Result<bool, EvalError> {
        match self {
            Value::Bool(b) => Ok(*b),
            _ => Err(EvalError::Type("expected true or false")),
        }
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Num(r) => write!(f, "{r}"),
            Value::Bool(b) => write!(f, "{b}"),
            Value::Text(t) => write!(f, "{t}"),
        }
    }
}

pub type Env = BTreeMap<String, Value>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Rem,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    And,
    Or,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Func {
    Frac,
    Dec,
    Round,
    Floor,
    Ceil,
    Min,
    Max,
    Gcd,
    Lcm,
    IsPrime,
    Digit,
    Mixed,
}

impl Func {
    fn lookup(name: &str) -> Option<(Func, usize, usize)> {
        // (function, min args, max args)
        Some(match name {
            "frac" => (Func::Frac, 2, 2),
            "dec" => (Func::Dec, 2, 2),
            "round" => (Func::Round, 1, 2),
            "floor" => (Func::Floor, 1, 1),
            "ceil" => (Func::Ceil, 1, 1),
            "min" => (Func::Min, 2, 8),
            "max" => (Func::Max, 2, 8),
            "gcd" => (Func::Gcd, 2, 2),
            "lcm" => (Func::Lcm, 2, 2),
            "is_prime" => (Func::IsPrime, 1, 1),
            "digit" => (Func::Digit, 2, 2),
            "mixed" => (Func::Mixed, 3, 3),
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Expr {
    Num(Rational),
    Bool(bool),
    Var(String),
    Neg(Box<Expr>),
    Not(Box<Expr>),
    Bin(BinOp, Box<Expr>, Box<Expr>),
    Call(Func, Vec<Expr>),
}

impl Expr {
    /// Every variable name the expression reads, sorted, without duplicates.
    pub fn variables(&self) -> Vec<String> {
        let mut out = Vec::new();
        self.collect_vars(&mut out);
        out.sort();
        out.dedup();
        out
    }

    fn collect_vars(&self, out: &mut Vec<String>) {
        match self {
            Expr::Var(name) => out.push(name.clone()),
            Expr::Neg(e) | Expr::Not(e) => e.collect_vars(out),
            Expr::Bin(_, a, b) => {
                a.collect_vars(out);
                b.collect_vars(out);
            }
            Expr::Call(_, args) => args.iter().for_each(|a| a.collect_vars(out)),
            Expr::Num(_) | Expr::Bool(_) => {}
        }
    }

    pub fn eval(&self, env: &Env) -> Result<Value, EvalError> {
        match self {
            Expr::Num(r) => Ok(Value::Num(*r)),
            Expr::Bool(b) => Ok(Value::Bool(*b)),
            Expr::Var(name) => env
                .get(name)
                .cloned()
                .ok_or_else(|| EvalError::UnknownVariable(name.clone())),
            Expr::Neg(e) => Ok(Value::Num(e.eval(env)?.as_num()?.checked_neg()?)),
            Expr::Not(e) => Ok(Value::Bool(!e.eval(env)?.as_bool()?)),
            Expr::Bin(op, a, b) => eval_bin(*op, a, b, env),
            Expr::Call(func, args) => eval_call(*func, args, env),
        }
    }

    pub fn eval_num(&self, env: &Env) -> Result<Rational, EvalError> {
        self.eval(env)?.as_num()
    }

    pub fn eval_bool(&self, env: &Env) -> Result<bool, EvalError> {
        self.eval(env)?.as_bool()
    }
}

fn eval_bin(op: BinOp, a: &Expr, b: &Expr, env: &Env) -> Result<Value, EvalError> {
    match op {
        BinOp::And => Ok(Value::Bool(a.eval_bool(env)? && b.eval_bool(env)?)),
        BinOp::Or => Ok(Value::Bool(a.eval_bool(env)? || b.eval_bool(env)?)),
        BinOp::Eq | BinOp::Ne => {
            let (x, y) = (a.eval(env)?, b.eval(env)?);
            let same = match (&x, &y) {
                (Value::Num(p), Value::Num(q)) => p == q,
                (Value::Bool(p), Value::Bool(q)) => p == q,
                (Value::Text(p), Value::Text(q)) => p == q,
                _ => return Err(EvalError::Type("cannot compare different kinds of value")),
            };
            Ok(Value::Bool(if op == BinOp::Eq { same } else { !same }))
        }
        _ => {
            let x = a.eval_num(env)?;
            let y = b.eval_num(env)?;
            Ok(match op {
                BinOp::Add => Value::Num(x.checked_add(&y)?),
                BinOp::Sub => Value::Num(x.checked_sub(&y)?),
                BinOp::Mul => Value::Num(x.checked_mul(&y)?),
                BinOp::Div => Value::Num(x.checked_div(&y)?),
                BinOp::Rem => Value::Num(x.checked_rem(&y)?),
                BinOp::Lt => Value::Bool(x < y),
                BinOp::Le => Value::Bool(x <= y),
                BinOp::Gt => Value::Bool(x > y),
                BinOp::Ge => Value::Bool(x >= y),
                BinOp::And | BinOp::Or | BinOp::Eq | BinOp::Ne => unreachable!("handled above"),
            })
        }
    }
}

fn integer(r: Rational, what: &'static str) -> Result<i128, EvalError> {
    if r.is_integer() {
        Ok(r.reduced().num())
    } else {
        Err(EvalError::Domain(what))
    }
}

fn pow10(k: i128) -> Result<Rational, EvalError> {
    if !(-18..=18).contains(&k) {
        return Err(EvalError::Domain("power of ten out of range"));
    }
    let p = Rational::int(10i128.pow(k.unsigned_abs() as u32));
    if k >= 0 {
        Ok(p)
    } else {
        Rational::ONE.checked_div(&p)
    }
}

fn eval_call(func: Func, args: &[Expr], env: &Env) -> Result<Value, EvalError> {
    let num = |i: usize| args[i].eval_num(env);
    let value = match func {
        Func::Frac => {
            let (n, d) = (num(0)?, num(1)?);
            if n.is_integer() && d.is_integer() {
                // Keep the spelling so an unsimplified answer can be shown as written.
                Rational::raw(n.reduced().num(), d.reduced().num())?
            } else {
                n.checked_div(&d)?
            }
        }
        Func::Dec => {
            let k = integer(num(1)?, "dec() needs a whole number of places")?;
            num(0)?.checked_div(&pow10(k)?)?
        }
        Func::Round => {
            let places = if args.len() == 2 {
                integer(num(1)?, "round() needs whole places")?
            } else {
                0
            };
            if !(0..=6).contains(&places) {
                return Err(EvalError::Domain("round() places must be 0 to 6"));
            }
            num(0)?.round_to(places as u32)?
        }
        Func::Floor => Rational::int(num(0)?.floor()),
        Func::Ceil => Rational::int(num(0)?.ceil()),
        Func::Min | Func::Max => {
            let mut best = num(0)?;
            for i in 1..args.len() {
                let v = num(i)?;
                if (func == Func::Min && v < best) || (func == Func::Max && v > best) {
                    best = v;
                }
            }
            best
        }
        Func::Gcd | Func::Lcm => {
            let a = integer(num(0)?, "gcd() and lcm() need whole numbers")?;
            let b = integer(num(1)?, "gcd() and lcm() need whole numbers")?;
            if func == Func::Gcd {
                Rational::int(gcd(a, b))
            } else if a == 0 || b == 0 {
                Rational::ZERO
            } else {
                let g = gcd(a, b);
                Rational::int((a / g).checked_mul(b).ok_or(EvalError::Overflow)?.abs())
            }
        }
        Func::IsPrime => {
            let v = num(0)?;
            return Ok(Value::Bool(v.is_integer() && is_prime(v.reduced().num())));
        }
        Func::Digit => {
            // digit(x, 0) = ones, digit(x, 1) = tens, digit(x, -1) = tenths.
            let pos = integer(num(1)?, "digit() position must be whole")?;
            let x = num(0)?;
            let x = if x.is_negative() { x.checked_neg()? } else { x };
            let shifted = x.checked_div(&pow10(pos)?)?.floor();
            Rational::int(shifted.rem_euclid(10))
        }
        Func::Mixed => {
            let w = integer(num(0)?, "mixed() needs whole numbers")?;
            let n = integer(num(1)?, "mixed() needs whole numbers")?;
            let d = integer(num(2)?, "mixed() needs whole numbers")?;
            if d <= 0 || n < 0 || w < 0 {
                return Err(EvalError::Domain("mixed() needs w >= 0, n >= 0, d > 0"));
            }
            let top = w
                .checked_mul(d)
                .and_then(|x| x.checked_add(n))
                .ok_or(EvalError::Overflow)?;
            Rational::raw(top, d)?
        }
    };
    Ok(Value::Num(value))
}

fn is_prime(n: i128) -> bool {
    if n < 2 {
        return false;
    }
    let mut i = 2i128;
    while i * i <= n {
        if n % i == 0 {
            return false;
        }
        i += 1;
    }
    true
}

// ---------------------------------------------------------------- parsing

#[derive(Clone, Debug, PartialEq)]
enum Tok {
    Num(Rational),
    Ident(String),
    Op(&'static str),
    LParen,
    RParen,
    Comma,
}

const MAX_LEN: usize = 400;
const MAX_DEPTH: usize = 40;

fn tokenize(src: &str) -> Result<Vec<(usize, Tok)>, ParseError> {
    let err = |position: usize, message: &str| ParseError {
        position,
        message: message.to_string(),
    };
    if src.len() > MAX_LEN {
        return Err(err(0, "expression is too long"));
    }
    let bytes = src.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if c.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        let start = i;
        if c.is_ascii_digit()
            || (c == '.' && i + 1 < bytes.len() && (bytes[i + 1] as char).is_ascii_digit())
        {
            while i < bytes.len() && ((bytes[i] as char).is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            let text = &src[start..i];
            let value = Rational::parse_decimal(text).ok_or_else(|| err(start, "bad number"))?;
            out.push((start, Tok::Num(value)));
            continue;
        }
        if c.is_ascii_alphabetic() || c == '_' {
            while i < bytes.len()
                && ((bytes[i] as char).is_ascii_alphanumeric() || bytes[i] == b'_')
            {
                i += 1;
            }
            out.push((start, Tok::Ident(src[start..i].to_string())));
            continue;
        }
        let two = if i + 1 < bytes.len() {
            &src[i..i + 2]
        } else {
            ""
        };
        let op: Option<&'static str> = match two {
            "==" => Some("=="),
            "!=" => Some("!="),
            "<=" => Some("<="),
            ">=" => Some(">="),
            _ => None,
        };
        if let Some(op) = op {
            out.push((start, Tok::Op(op)));
            i += 2;
            continue;
        }
        let tok = match c {
            '+' => Tok::Op("+"),
            '-' => Tok::Op("-"),
            '*' => Tok::Op("*"),
            '/' => Tok::Op("/"),
            '%' => Tok::Op("%"),
            '<' => Tok::Op("<"),
            '>' => Tok::Op(">"),
            '(' => Tok::LParen,
            ')' => Tok::RParen,
            ',' => Tok::Comma,
            _ => return Err(err(start, &format!("unexpected character '{c}'"))),
        };
        out.push((start, tok));
        i += 1;
    }
    Ok(out)
}

struct Parser {
    toks: Vec<(usize, Tok)>,
    pos: usize,
    depth: usize,
    end: usize,
}

pub fn parse(src: &str) -> Result<Expr, ParseError> {
    let toks = tokenize(src)?;
    if toks.is_empty() {
        return Err(ParseError {
            position: 0,
            message: "empty expression".into(),
        });
    }
    let mut p = Parser {
        toks,
        pos: 0,
        depth: 0,
        end: src.len(),
    };
    let expr = p.or()?;
    if p.pos < p.toks.len() {
        return Err(p.error("unexpected text after the expression"));
    }
    Ok(expr)
}

impl Parser {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.pos).map(|(_, t)| t)
    }

    fn here(&self) -> usize {
        self.toks.get(self.pos).map(|(p, _)| *p).unwrap_or(self.end)
    }

    fn error(&self, message: &str) -> ParseError {
        ParseError {
            position: self.here(),
            message: message.to_string(),
        }
    }

    fn eat_word(&mut self, word: &str) -> bool {
        if matches!(self.peek(), Some(Tok::Ident(w)) if w == word) {
            self.pos += 1;
            true
        } else {
            false
        }
    }

    fn eat_op(&mut self, ops: &[&'static str]) -> Option<&'static str> {
        if let Some(Tok::Op(op)) = self.peek()
            && let Some(found) = ops.iter().find(|o| *o == op)
        {
            self.pos += 1;
            return Some(found);
        }
        None
    }

    fn enter(&mut self) -> Result<(), ParseError> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            Err(self.error("expression is nested too deeply"))
        } else {
            Ok(())
        }
    }

    fn or(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.and()?;
        while self.eat_word("or") {
            let right = self.and()?;
            left = Expr::Bin(BinOp::Or, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn and(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.not()?;
        while self.eat_word("and") {
            let right = self.not()?;
            left = Expr::Bin(BinOp::And, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn not(&mut self) -> Result<Expr, ParseError> {
        if self.eat_word("not") {
            self.enter()?;
            let inner = self.not()?;
            self.depth -= 1;
            return Ok(Expr::Not(Box::new(inner)));
        }
        self.comparison()
    }

    fn comparison(&mut self) -> Result<Expr, ParseError> {
        let left = self.additive()?;
        let Some(op) = self.eat_op(&["==", "!=", "<=", ">=", "<", ">"]) else {
            return Ok(left);
        };
        let right = self.additive()?;
        if self.eat_op(&["==", "!=", "<=", ">=", "<", ">"]).is_some() {
            return Err(self.error("comparisons cannot be chained; use 'and'"));
        }
        let op = match op {
            "==" => BinOp::Eq,
            "!=" => BinOp::Ne,
            "<=" => BinOp::Le,
            ">=" => BinOp::Ge,
            "<" => BinOp::Lt,
            _ => BinOp::Gt,
        };
        Ok(Expr::Bin(op, Box::new(left), Box::new(right)))
    }

    fn additive(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.multiplicative()?;
        while let Some(op) = self.eat_op(&["+", "-"]) {
            let right = self.multiplicative()?;
            let op = if op == "+" { BinOp::Add } else { BinOp::Sub };
            left = Expr::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn multiplicative(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.unary()?;
        while let Some(op) = self.eat_op(&["*", "/", "%"]) {
            let right = self.unary()?;
            let op = match op {
                "*" => BinOp::Mul,
                "/" => BinOp::Div,
                _ => BinOp::Rem,
            };
            left = Expr::Bin(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }

    fn unary(&mut self) -> Result<Expr, ParseError> {
        if self.eat_op(&["-"]).is_some() {
            self.enter()?;
            let inner = self.unary()?;
            self.depth -= 1;
            return Ok(Expr::Neg(Box::new(inner)));
        }
        self.primary()
    }

    fn primary(&mut self) -> Result<Expr, ParseError> {
        let Some((_, tok)) = self.toks.get(self.pos).cloned() else {
            return Err(self.error("expression ended too early"));
        };
        self.pos += 1;
        match tok {
            Tok::Num(r) => Ok(Expr::Num(r)),
            Tok::LParen => {
                self.enter()?;
                let inner = self.or()?;
                self.depth -= 1;
                if self.peek() != Some(&Tok::RParen) {
                    return Err(self.error("missing ')'"));
                }
                self.pos += 1;
                Ok(inner)
            }
            Tok::Ident(name) => match name.as_str() {
                "true" => Ok(Expr::Bool(true)),
                "false" => Ok(Expr::Bool(false)),
                "and" | "or" | "not" => {
                    self.pos -= 1;
                    Err(self.error(&format!("'{name}' needs a value before it")))
                }
                _ if self.peek() == Some(&Tok::LParen) => self.call(&name),
                _ => Ok(Expr::Var(name)),
            },
            _ => {
                self.pos -= 1;
                Err(self.error("expected a number, name or '('"))
            }
        }
    }

    fn call(&mut self, name: &str) -> Result<Expr, ParseError> {
        let at = self.pos - 1;
        let Some((func, min, max)) = Func::lookup(name) else {
            self.pos = at;
            return Err(self.error(&format!("unknown function '{name}'")));
        };
        self.pos += 1; // '('
        self.enter()?;
        let mut args = Vec::new();
        if self.peek() != Some(&Tok::RParen) {
            loop {
                args.push(self.or()?);
                if self.peek() == Some(&Tok::Comma) {
                    self.pos += 1;
                } else {
                    break;
                }
            }
        }
        self.depth -= 1;
        if self.peek() != Some(&Tok::RParen) {
            return Err(self.error("missing ')' after arguments"));
        }
        self.pos += 1;
        if args.len() < min || args.len() > max {
            self.pos = at;
            return Err(self.error(&format!(
                "{name}() takes {min} to {max} arguments, got {}",
                args.len()
            )));
        }
        Ok(Expr::Call(func, args))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn num(src: &str, env: &Env) -> Rational {
        parse(src).unwrap().eval_num(env).unwrap()
    }

    fn env(pairs: &[(&str, &str)]) -> Env {
        pairs
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    Value::Num(Rational::parse_decimal(v).unwrap()),
                )
            })
            .collect()
    }

    fn r(n: i128, d: i128) -> Rational {
        Rational::new(n, d).unwrap()
    }

    #[test]
    fn arithmetic_is_exact() {
        let e = Env::new();
        assert_eq!(num("0.1 + 0.2", &e), r(3, 10));
        assert_eq!(num("1 / 3 + 1 / 6", &e), r(1, 2));
        assert_eq!(num("2 + 3 * 4", &e), Rational::int(14));
        assert_eq!(num("(2 + 3) * 4", &e), Rational::int(20));
        assert_eq!(num("-2 * -3", &e), Rational::int(6));
        assert_eq!(num("10 - 4 - 3", &e), Rational::int(3));
        assert_eq!(num("17 % 5", &e), Rational::int(2));
    }

    #[test]
    fn frac_keeps_spelling() {
        let v = num("frac(2, 8)", &Env::new());
        assert_eq!((v.num(), v.den()), (2, 8));
        assert_eq!(v, r(1, 4));
    }

    #[test]
    fn functions() {
        let e = Env::new();
        assert_eq!(num("dec(345, 2)", &e), r(345, 100));
        assert_eq!(num("round(2.345, 2)", &e), r(235, 100));
        assert_eq!(num("round(7.5)", &e), Rational::int(8));
        assert_eq!(num("floor(-1.5)", &e), Rational::int(-2));
        assert_eq!(num("ceil(1.2)", &e), Rational::int(2));
        assert_eq!(num("min(3, 1, 2)", &e), Rational::int(1));
        assert_eq!(num("max(3, 1, 2)", &e), Rational::int(3));
        assert_eq!(num("gcd(12, 18)", &e), Rational::int(6));
        assert_eq!(num("lcm(4, 6)", &e), Rational::int(12));
        assert_eq!(num("digit(4725, 2)", &e), Rational::int(7));
        assert_eq!(num("digit(3.68, -1)", &e), Rational::int(6));
        assert_eq!(num("mixed(1, 3, 8)", &e), r(11, 8));
        assert!(parse("is_prime(97)").unwrap().eval_bool(&e).unwrap());
        assert!(!parse("is_prime(91)").unwrap().eval_bool(&e).unwrap());
    }

    #[test]
    fn booleans_and_comparisons() {
        let e = env(&[("x", "21"), ("k", "7")]);
        let t = |s: &str| parse(s).unwrap().eval_bool(&e).unwrap();
        assert!(t("x % k == 0"));
        assert!(!t("x % k != 0"));
        assert!(t("x > 20 and k < 8"));
        assert!(t("not x < 20 or false"));
        assert!(t("0.45 < 0.5"));
        assert!(t("frac(2, 4) == 0.5"));
    }

    #[test]
    fn template_expressions_from_examples() {
        let e = env(&[("x", "4.7"), ("y", "3.58")]);
        assert_eq!(num("x + y", &e), r(828, 100));
        assert_eq!(
            num("floor(x * 10) % 10 + floor(y * 10) % 10", &e),
            Rational::int(12)
        );
        assert_eq!(num("floor(y * 100) % 10", &e), Rational::int(8));
        assert_eq!(num("x + y / 10", &e), r(5058, 1000));
    }

    #[test]
    fn variables_are_listed() {
        let ex = parse("frac(a + b, d) + max(a, c)").unwrap();
        assert_eq!(ex.variables(), vec!["a", "b", "c", "d"]);
    }

    #[test]
    fn rejects_unsafe_or_malformed_input() {
        for bad in [
            "",
            "1 +",
            "alert(1)",
            "x.y",
            "a = 1",
            "1 < 2 < 3",
            "frac(1)",
            "(1 + 2",
            "\"text\"",
            "a; b",
            "and 1",
            "[1]",
        ] {
            assert!(parse(bad).is_err(), "should reject {bad:?}");
        }
        let deep = format!("{}1{}", "(".repeat(60), ")".repeat(60));
        assert!(parse(&deep).is_err());
    }

    #[test]
    fn runtime_errors_are_reported_not_hidden() {
        let e = Env::new();
        assert_eq!(
            parse("1 / 0").unwrap().eval(&e),
            Err(EvalError::DivisionByZero)
        );
        assert_eq!(
            parse("q + 1").unwrap().eval(&e),
            Err(EvalError::UnknownVariable("q".into()))
        );
        assert!(parse("1 and true").unwrap().eval(&e).is_err());
        assert!(parse("gcd(1.5, 2)").unwrap().eval(&e).is_err());
    }
}
