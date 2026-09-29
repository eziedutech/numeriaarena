//! Browser bindings. JSON strings cross the boundary so the TypeScript side
//! stays thin; typed bindings come with the protocol types.

use wasm_bindgen::prelude::*;

use crate::dsl::{Env, parse};
use crate::format::format_auto;
use crate::template::{CompiledTemplate, ItemTemplate};

#[wasm_bindgen(js_name = coreVersion)]
pub fn core_version() -> String {
    crate::CORE_VERSION.to_string()
}

/// Evaluates a DSL expression without variables and returns the formatted value.
#[wasm_bindgen(js_name = evaluate)]
pub fn evaluate(expr: &str) -> Result<String, JsError> {
    let value = parse(expr)
        .map_err(|e| JsError::new(&e.to_string()))?
        .eval(&Env::new())
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(match value {
        crate::dsl::Value::Num(r) => format_auto(&r),
        other => other.to_string(),
    })
}

/// Builds one concrete item from a template (JSON) and a seed; returns the item as JSON.
#[wasm_bindgen(js_name = instantiateItem)]
pub fn instantiate_item(template_json: &str, seed: u32) -> Result<String, JsError> {
    let template =
        ItemTemplate::from_json(template_json).map_err(|e| JsError::new(&e.to_string()))?;
    let compiled = CompiledTemplate::compile(template).map_err(|issues| {
        JsError::new(
            &issues
                .iter()
                .map(|i| i.message.as_str())
                .collect::<Vec<_>>()
                .join("; "),
        )
    })?;
    let item = compiled
        .instantiate(u64::from(seed))
        .map_err(|e| JsError::new(&e.to_string()))?;
    serde_json::to_string(&item).map_err(|e| JsError::new(&e.to_string()))
}
