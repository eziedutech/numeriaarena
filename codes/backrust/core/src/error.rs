use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EvalError {
    DivisionByZero,
    Overflow,
    UnknownVariable(String),
    Type(&'static str),
    Domain(&'static str),
}

impl fmt::Display for EvalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EvalError::DivisionByZero => write!(f, "division by zero"),
            EvalError::Overflow => write!(f, "number too large"),
            EvalError::UnknownVariable(name) => write!(f, "unknown variable '{name}'"),
            EvalError::Type(msg) => write!(f, "type error: {msg}"),
            EvalError::Domain(msg) => write!(f, "invalid argument: {msg}"),
        }
    }
}

impl std::error::Error for EvalError {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParseError {
    pub position: usize,
    pub message: String,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "at {}: {}", self.position, self.message)
    }
}

impl std::error::Error for ParseError {}
