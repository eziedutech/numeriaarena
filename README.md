# Foldlings

A hands-first mixed reality math game for grades 4 to 6. A pop-up paper book opens on the player's real desk; origami creatures carrying numbers wander out, and players fold them home by answering with their hands. Built with WebXR (Immersive Web SDK) for Meta Quest.

Status: early development for the Meta VR Start Developer Competition 2026.

## Layout

| Folder | What | Stack |
|---|---|---|
| `codes/xrclient` | The VR/MR game (`/play`) | Immersive Web SDK, TypeScript, Vite |
| `codes/frontrouter` | 2D pages: landing, class screen, teacher and admin pages | React Router (SPA), React, Tailwind |
| `codes/backrust` | `core`: exact-fraction expression language, number formatter, item templates, validator, Fairness Engine and simulator (native and WebAssembly). `content-cli`: validates templates and runs the simulator | Rust |
| `codes/content` | Skill list, JSON schemas, example item templates | JSON |

The same Rust `core` runs on the server, in the headset (WebAssembly) and in the content validator, so an answer is always computed by one piece of code.

## Development

Ports: frontrouter 3320, backrust 3321, xrclient 3322.

```bash
# Rust core: tests, template validation, fairness simulation
cd codes/backrust
cargo test
cargo run -p content-cli -- validate ../content/contoh/*.json
cargo run --release -p content-cli -- simulate

# WebAssembly bindings for the game (needs wasm-bindgen CLI 0.2.129)
./build-wasm.sh

# Game in the IWER emulator
cd ../xrclient
bun install
bun run dev
```

## Notes

- Answers are never written by hand or by an AI model: templates are validated and every answer is computed by the core.
- Decimal point in every language, no thousands separator.
- Development used a Code Assistant for acceleration and debugging.

## License

MIT, see `LICENSE`. Third-party packages keep their own licenses.
