#!/usr/bin/env sh
# Builds foldlings-core as WebAssembly and writes the JS bindings into xrclient.
# wasm-bindgen CLI must be exactly 0.2.129, the same as the crate:
#   cargo install wasm-bindgen-cli --version 0.2.129 --locked
# or point WASM_BINDGEN at a downloaded release binary.
set -eu
cd "$(dirname "$0")"
WB="${WASM_BINDGEN:-wasm-bindgen}"
test "$("$WB" --version)" = "wasm-bindgen 0.2.129" || { echo "wasm-bindgen 0.2.129 required, found: $("$WB" --version)" >&2; exit 1; }
cargo build -p foldlings-core --target wasm32-unknown-unknown --release --features wasm
"$WB" --target web --out-dir ../xrclient/src/wasm/pkg target/wasm32-unknown-unknown/release/foldlings_core.wasm
ls -la ../xrclient/src/wasm/pkg
