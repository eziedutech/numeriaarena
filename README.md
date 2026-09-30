# Foldlings

> A hands-first mixed reality math game for grades 4 to 6: a pop-up paper book opens on the player's real desk, origami creatures carrying numbers wander out, and players fold them home by answering with their hands, while an adaptive engine keeps every child at their own level.

![Immersive Web SDK 1.0](https://img.shields.io/badge/Immersive%20Web%20SDK-1.0-1F2A44)
![Rust 1.98](https://img.shields.io/badge/Rust-1.98-B7410E)
![WebAssembly](https://img.shields.io/badge/WebAssembly-core-654FF0)
![React Router 8.4](https://img.shields.io/badge/React%20Router-8.4-CA4245)
![Bun 1.4](https://img.shields.io/badge/Bun-1.4-C8553D)

Built for the **Meta VR Start Developer Competition 2026** (Devpost), Gaming track, New Experience division.

Status: early development. No public build yet; the link will be added here when it is deployed.

## Table of Contents

- [What it is](#what-it-is)
- [Who it is for](#who-it-is-for)
- [How to test](#how-to-test)
- [Architecture](#architecture)
- [Running locally](#running-locally)
- [Configuration](#configuration)
- [Results](#results)
- [What it does not claim](#what-it-does-not-claim)
- [Roadmap](#roadmap)
- [Credits and licenses](#credits-and-licenses)
- [How this was built](#how-this-was-built)
- [License](#license)

## What it is

Many schools own headsets that sit unused because there is little math content for
them that fits a lesson. Foldlings is built for that classroom:

1. **The book lands on your desk.** The headset finds the real table and opens a pop-up paper book on it. With no table in view, the player places it with a pinch.
2. **Foldlings wander out.** Each origami creature carries a number. Answering it with the hands (forging number orbs, popping balloons, building fraction bridges, balancing scales, measuring the real table) folds it back into a paper bird that flies home.
3. **Everyone plays at their own level.** The Fairness Engine gives each child problems they should get right about three times in four, so a strong and a weak student earn points at the same pace.
4. **Nobody plays alone.** Two labelled partner bots join a solo player; in class, up to three headsets share one match while students without a headset support them from the classroom screen.

Answers are never typed in by a person or written by an AI model. Every item comes
from a template, and the answer is computed by one piece of code.

## Who it is for

| | |
|---|---|
| Players | Grades 4 to 6, ages 10 to 12 |
| Topics | Place value, multiply and divide, fractions, decimals, measurement: 28 skills common to most curricula |
| Languages | English, Bahasa Indonesia. Decimal point in both, no thousands separator |
| Accounts | None for students. Pseudonyms only; real names stay in the teacher's browser |

## How to test

There is nothing to test in a headset yet. What runs today:

1. Start the game in the browser emulator (see [Running locally](#running-locally)) and open `https://localhost:3322`.
2. Enter XR with hand input on the Meta Quest 3 preset in the `living_room` environment. A test button and a crystal appear on the detected table: poke the button, pinch and move the crystal.
3. The browser console shows the Rust core running as WebAssembly: exact sums such as `0.1 + 0.2 = 0.3`, and one concrete fraction item.
4. Validate the example templates and run the fairness simulation with `content-cli` (commands below).

## Architecture

![Foldlings architecture: one Rust core runs as WebAssembly in the headset game and the classroom pages, natively in the game server and in the content tool. Solid boxes exist today, dashed boxes are planned.](assets/architecture.svg)

Choices worth knowing:

- **One core, four places.** Item generation, the expression language, the number formatter and the Fairness Engine are written once in Rust. The headset and the classroom pages use it as WebAssembly, the server and the content tool natively. The same template and seed give the same item, byte for byte, on both.
- **Exact fractions.** Every expression is computed with exact fractions, so `0.1 + 0.2` is `0.3` and `2/8` can still be shown as `2/8` when a skill needs it.
- **Templates are validated before they are used.** 2000 random draws per template check constraints, answers, distractors, prompt length and difficulty, and every failure is named with an example. Distractors that collide are dropped exactly as the game drops them.
- **The headset is designed to work without the server.** Solo play with bots will run offline, so the game stays playable if the server is down. The core already runs in the browser; the bots come next.
- **Hands first.** Hand pinch grab is switched on explicitly; the SDK leaves it off by default.

```
codes/
  xrclient/        Immersive Web SDK game (TypeScript, Vite)
  frontrouter/     React Router single page app for 2D pages
  backrust/
    core/          exact fractions, expression language, formatter, templates,
                   validator, Fairness Engine, simulator (native and WebAssembly)
    content-cli/   validate, instantiate, simulate
  content/         skills, JSON schemas, example item templates
assets/            diagrams
```

## Running locally

Requires Rust (the toolchain is pinned in `rust-toolchain.toml`), Bun 1.4 and Node 24 or newer.
For the WebAssembly build also `wasm-bindgen` CLI 0.2.129, exactly the crate version:

```bash
cargo install wasm-bindgen-cli --version 0.2.129 --locked
```

Core tests, template validation and the fairness simulation:

```bash
cd codes/backrust && cargo test
```

```bash
cd codes/backrust && cargo run -p content-cli -- validate ../content/contoh/*.json
```

```bash
cd codes/backrust && cargo run --release -p content-cli -- simulate
```

Game in the emulator:

```bash
cd codes/backrust && ./build-wasm.sh
```

```bash
cd codes/xrclient && bun install && bun x iwsdk dev up
```

Classroom pages:

```bash
cd codes/frontrouter && bun install && bun run dev
```

Ports: frontrouter 3320, server 3321 (planned), game 3322.

## Configuration

Nothing to configure yet. Server settings (database, sign-in for adults, AI providers)
will be listed here when the server exists.

| Setting | Where | Purpose |
|---|---|---|
| `iwsdk.config.json` | xrclient | XR features, emulator device and room, hand pinch grab |
| `WASM_BINDGEN` | build-wasm.sh | path to a `wasm-bindgen` 0.2.129 binary if it is not on `PATH` |

## Results

Measured, not claimed. Everything below is reproducible with the commands above.

### Template validator

All four example templates pass: decimal addition, like-fraction addition, multiples
sort (Factory Sort) and table width estimate (Measure Hunt).

The first run failed like-fraction addition: when both numerators are 1, "adding the
denominators" and "multiplying the numerators" give the same wrong answer, in 15.5% of
items. The rule now matches what the game does: a distractor equal to the answer or to
an earlier one is dropped, and at least two different distractors must remain in 90%
of items. For 1/5 + 1/5 the balloons show 2/5, 2/10 and 3/5. That template now keeps
two different distractors in every item.

### Fairness Engine simulation

1000 synthetic students of known ability, 12 candidate items per pick, item difficulties
known to the engine only with noise; 1000 three-desk matches of 8 minutes.
Parameters `fp-2026-09-29.2`.

| Check | Result | Limit |
|---|---|---|
| Ability error after 40 items | 0.307 | under 0.35 |
| Points per minute, strong vs weak student | 5.8% apart | under 15% |
| Points per minute in a first session, strong vs weak | 13.8% apart | under 15% |
| Matches where a desk piles up (12 or more waiting) | 0 | 0 |
| Matches where highlights were not unique for every player | 0 | 0 |

- **Fairness needed easy items, not a new formula.** With item difficulty limited to -3 the weakest students ran out of items at their level and earned 16.0% fewer points per minute. Allowing templates down to -4 closed most of the gap.
- **The first session was the hardest part.** Starting from the grade level, weak students first earned 27.1% fewer points. Eight placement items, a larger step down after a wrong answer and easier items together bring it to 13.8%, which passes, but only just.
- **A first design was wrong and the simulator caught it.** Spawning creatures at a fixed pace piled them up in 983 of 1000 matches; the pace now follows each player's own correct answers.

### Race against two robot rivals

Each player races two clearly labelled robots at their own desks. The race runs on a
clock: three waves of 60 seconds and a 20 second boss round worth double. Creatures keep
arriving at every desk until time is up; a creature still open at the whistle goes home
without points and a late answer is refused. Points use the same formula for everyone, and
before each round the robots are re-drawn near the player's level and pace (the median time
of the player's first tries last round, kept between 3 and 15 s, times 0.85 to 1.15).
100 races per cell, a simulated player right with a fixed chance and a fixed time per answer,
places 1st / 2nd / 3rd:

| Time per answer | right 50% | right 75% | right 90% |
|---|---|---|---|
| 4 s | 10 / 30 / 60 | 84 / 14 / 2 | 100 / 0 / 0 |
| 6 s | 8 / 23 / 69 | 64 / 27 / 9 | 96 / 4 / 0 |
| 10 s | 4 / 10 / 86 | 27 / 37 / 36 | 66 / 28 / 6 |

- Being right matters most: at any pace, a player right 90% of the time usually wins and a player right half the time usually comes last.
- Speed helps without deciding everything. Without the robots following the player's pace, a 10 s player right 75% of the time won only 11 of 100 races and a 4 s player always won.
- A real player who struggles gets easier items and relief after two misses, which this fixed-chance simulation leaves out.
- Every round ends on its clock, no robot answers outside a round, places always follow points, the same seed gives the same race, and every player gets a different highlight (`cargo test --test race`).

### Emulator checks

On the Meta Quest 3 preset with hand input: the table in the synthetic room is detected
(1.30 x 0.75 x 0.79 m), two pokes register exactly twice, and a pinched crystal moves
0.150 m and is released.

A full race played by the emulator test driver with hand pokes and pinches
(`node scripts/emulator/drive.mjs race`): the menu envelope opens, three timed waves
and a boss round, a live scoreboard for all three players, and results with
places, stars and a different highlight each. In the browser preview the same game plays
with a mouse: clicking an envelope, a balloon, or two crystals in turn.

## What it does not claim

- **No frame rate is claimed.** Nothing has been measured on a headset; the emulator runs on a desktop GPU.
- Hand tracking has only been exercised in the emulator, which does not reproduce real tracking noise.
- The simulation uses synthetic students and a synthetic item bank. Real students will differ.
- It is not a curriculum and does not grade students. Skill stars are a guide for teachers.
- The example scene still uses the SDK's starter assets; they will be replaced by the game's own paper art.

## Roadmap

Planned, not built. Nothing here is a result.

- **Two games playable solo with bots:** Orb Forge and Balloon Burst, then Factory Sort, Bridge Builder, Balance Gate and Measure Hunt.
- **Class Match** on a server that decides every answer, with a class screen for the room and Book Keeper for students without a headset.
- **Real item bank:** six templates per skill, including very easy ones, then the simulation run again on real difficulties.
- **Accessibility:** one-handed play, head-gaze and dwell, high contrast, captions, no-timer mode.
- **Pip, the paper owl coach**, as an optional AI layer that only receives structured data.

## Credits and licenses

- **Immersive Web SDK** (Meta Platforms, MIT) with its emulator, and **super-three** (MIT).
- **@pmndrs/uikit** (MIT), icons from **Lucide** (ISC).
- **React Router**, **React**, **Tailwind CSS**, **Vite** (MIT), **TypeScript** (Apache-2.0).
- **serde**, **serde_json**, **sha2**, **wasm-bindgen** (MIT or Apache-2.0), **jsonschema** (MIT).
- **Bun** (MIT) as package manager and script runner.
- **Origami models** (book, portal, paper bird, flag, crystals, balloons, buttons, partner robots, stars, badges) from [orimathassets](https://github.com/sayazia/orimathassets), made by the same owner for this game, CC0 1.0. Copied by `scripts/sync-assets.mjs`, which records the source commit in `public/models/manifest.json`.

## How this was built

A code assistant was used to speed up development and debugging. Design
decisions, measurements and claims were checked by hand against real runs.

Findings that changed the design so far:

- **Grab by hand is off by default in the SDK.** Without switching it on, the game would not be playable with hands alone.
- **The simulator overruled the first load-balancing design.** A fixed spawn pace piled creatures up almost every match.
- **Fairness depends on content, not only on the formula.** The weakest students need easy items to exist, so templates may now go easier than first planned.

## License

MIT, see [LICENSE](LICENSE).
