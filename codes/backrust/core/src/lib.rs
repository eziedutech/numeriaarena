//! Foldlings core: logic shared by the server, the headset (WASM) and the
//! content validator. No I/O and no async, so the same code runs everywhere.

pub mod dsl;
pub mod error;
pub mod fairness;
pub mod format;
pub mod rational;
pub mod rng;
pub mod session;
pub mod sim;
pub mod squad;
pub mod template;
pub mod validate;

#[cfg(feature = "wasm")]
mod wasm;

pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
