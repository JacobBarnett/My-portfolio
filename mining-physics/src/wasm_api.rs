//! The wasm boundary for the tool layer: one generic entry point.

use wasm_bindgen::prelude::*;

/// Call any tool by name. Input and output are JSON strings, so adding a tool
/// never changes this binding.
#[wasm_bindgen]
pub fn call_tool(name: &str, input_json: &str) -> String {
    crate::tools::call(name, input_json)
}

/// The tool names this build supports, as a JSON array.
#[wasm_bindgen]
pub fn tool_names() -> String {
    serde_json::to_string(&crate::tools::TOOL_NAMES).unwrap_or_else(|_| "[]".to_string())
}
