# Numeria Arena

> A hands-first mixed reality math game for grades 4 to 6: a pop-up paper book opens on the player's real desk, origami creatures carrying numbers wander out, and players fold them home by answering with their hands, while an adaptive engine keeps every child at their own level.

![Immersive Web SDK 1.0](https://img.shields.io/badge/Immersive%20Web%20SDK-1.0-1F2A44)
![Rust 1.98](https://img.shields.io/badge/Rust-1.98-B7410E)
![WebAssembly](https://img.shields.io/badge/WebAssembly-core-654FF0)
![React Router 8.4](https://img.shields.io/badge/React%20Router-8.4-CA4245)
![Bun 1.4](https://img.shields.io/badge/Bun-1.4-C8553D)

Built for the **Meta VR Start Developer Competition 2026** (Devpost), Gaming track, New Experience division.

Status: playable today at **https://numeria.eziedutech.dev** in the Meta Quest browser (WebXR, nothing to install) and in any desktop browser. Practice and robot races also work offline after the first visit.

## Table of Contents

- [What it is](#what-it-is)
  - [Authentic Assessment Based Problem Solving](#authentic-assessment-based-problem-solving-only-for-immersive-environment)
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

Numeria Arena is an **immersive mathematics game** for primary school, grades 4 to 6. It runs in the Meta Quest browser through WebXR, so there is nothing to install. In mixed reality the game lives on the player's own real desk: the headset finds the table, a pop-up paper book opens on it, and every question becomes something to reach for, pinch, poke and place with the hands. The same game also opens in an ordinary browser window for computers and classroom smartboards.

### Math Edu Game

The maths is the action, not a quiz with 3D decoration around it. 29 skills common to most curricula (place value, multiplication and division, fractions, decimals and measurement) come from 222 validated question templates. Every answer is computed by one exact fraction engine, so `0.1 + 0.2` is `0.3`, and no answer is ever typed in by a person or written by an AI model. Everything is in English and Indonesian.

### Learn

Math Lessons offers step-by-step paper lessons for grades 4 to 6, which can also be viewed in VR. Each game opens with a skippable 10-second tutorial in which a paper hand shows the first move without giving the answer away. A wrong answer earns a soft paper "boing" and a second try, never a buzzer. A teacher's report links every weak skill to the matching lesson.

### Play

Origami creatures walk out of the book on the desk, each carrying a problem, and the child answers in space:

- **Orb Forge:** grab two number crystals and merge them into an orb of exactly the right value.
- **Balloon Burst:** poke the balloon that holds the right answer.
- **Factory Sort:** carry each creature from the conveyor to the right gate.
- **Bridge Builder:** lay fraction and decimal planks until the gap is exactly spanned.
- **Balance Gate:** place number weights until the scale balances.
- **Cari & Ukur (Measure Hunt):** measure a shape on the desk, a paper one the game lays down or a real object within reach, and find its perimeter, area, edges, volume or surface. See [Authentic Assessment Based Problem Solving](#authentic-assessment-based-problem-solving-only-for-immersive-environment).

Children can practise alone, race two clearly labelled robot rivals through three timed waves and a final, race their classmates (up to six desks per match, with robots filling empty seats), find a rival of the same grade, or race side by side at one smartboard. Hands work from start to finish, and controllers work too. Play is seated with no artificial movement, so it stays comfortable.

### Authentic Assessment Based Problem Solving, Only for Immersive Environment

Cari & Ukur is the one game that cannot exist outside mixed reality. The child is not shown a question and then a menu of answers. The child is given a problem to solve in the room: how long are all the edges of this box, how much paper covers this top. It is solved with what a person has at a desk, the hands, the eyes and some judgement, on a shape the game lays down or on a real object within reach.

What is assessed is the way the problem is solved, not only its answer:

- **The measuring itself.** The exact fraction engine knows the true size of every paper shape, so it can tell how truly each point was placed on a corner, whether the sides the child chose make the shape the problem needs, and whether the right quantity was found. Real objects are judged by the geometry the points make.
- **Then the answer,** chosen among five, each wrong one tied to a recorded misconception such as perimeter taken for area.
- **The working and the answer agree.** The choices are computed from the lengths the child measured and wrote on the threads, so a teacher's report can show both, and an answer cannot be guessed away from the work.

It needs a real desk, hands in space and objects that can be reached, so on a flat screen it would shrink to a drawing quiz. It is therefore offered in the headset only, and its answers join the same reports, skill stars and Folds as the other games.

### Create

Right answers earn **Folds**, which build the child's own **Fold Town** on the desk. The child pinches one of 214 pieces from a paper shop shelf, from roads and trees to houses, a stadium and an airport, and places it on the land in mixed reality. A finished land (plain, river, hills or coast) opens the next one. Every building carries a maths card fitted to the child's grade, showing area, perimeter, volume and fractions of the land, and a FINISH NOW question completes it at once. Skill landmarks cannot be bought: they grow only from skill stars, so the town tells the story of what the child has learned.

### Accessibility friendly

- **NO TIMER** removes the clock and the speed bonus from every game.
- **BIG NUMBERS**, **HIGH CONTRAST** and **READ ALOUD** (English or Indonesian) help children who see or read less easily.
- **STEADY AIM** smooths shaky hands and controller rays, and every game can be played one-handed.
- Right and wrong are always shown by shape and motion, never by colour alone, and text uses the Atkinson Hyperlegible typeface.

### Fairness and integrity

The **Fairness Engine** gives every child problems they should answer correctly about three times in four, and scores each right answer against that expectation. A strong and a weak student therefore earn points at nearly the same pace (5.8% apart in a 1000-student simulation), so classmates can race each other without prior ability deciding the race. Robots never pretend to be people.

Because every answer is an action on objects in space, each round is **action-based authentic assessment**. Class races are judged by the server against a clock the server keeps, which leaves little room for copied text, instant AI answers or switching to another device. Teachers get a more honest, valid and consistent picture of what each child can actually do.

### AI analysis for teachers

On top of the rule-based report, which always works (STRONG, MIDDLE, NEEDS PRACTICE, NOT ENOUGH DATA), the teacher can ask for an **AI class insight** and an **AI practice plan** for each student, in English or Indonesian. The insight names what the class does well, what needs work and what to do next. The practice plan picks the one to three skills most worth practising first, explains what the answers show, and gives one next step for each.

- The model only sees numbers: seat numbers, skill titles, counts and misconception codes, never a name or any text from a child.
- Every answer is checked against those numbers before the teacher sees it, and it is labelled as made by AI. If a check fails, the rule-based insight is shown instead.
- Children never talk to an AI, and AI never writes questions or answers.
- The admin chooses the provider (any OpenAI-compatible service or Amazon Bedrock). API keys are stored encrypted on the server, and a monthly budget falls back to rule-based text when it runs out.

### Teacher-managed class races

The teacher runs the race, not the game. From the class page the teacher opens a race room and chooses the games, the number of rounds, the seconds per round and the level of the questions (adaptive, easier or harder). The room gets a play code for the children and a watch code for the **class screen** on the projector. Children join from their headsets, press I'M READY, and the teacher starts the match for every desk at once.

- A large class races in groups of six desks, and the class screen calls each group in turn.
- Robots marked BOT fill empty desks, and a robot helper keeps a desk busy if a child steps away, earning no points.
- The class screen shows waves, the boss round, results and highlights, but never a child's question. The teacher can send cheers to every desk.
- With few headsets, the teacher can start a **smartboard race** for up to three children at one touch screen and save the results in the class report.

### Made for the classroom

**MY CLASSES** gives each class up to 100 seats, each with a fixed pseudonym and a picture password, along with printable sign-in cards and groups for taking turns. Reports show each skill and each seat by first tries, the most-missed questions and the most common misconceptions. Leaderboards cover the class and the world, and a class town map shows every student's land. Anyone can open a sample teacher page without an account.

### Safe for children and ready offline

Children never enter a name or an email. Real names stay in the teacher's browser, and camera, room and voice data never leave the device. Practice and robot races keep working offline after the first visit.

## Who it is for

| | |
|---|---|
| Players | Grades 4 to 6, ages 10 to 12 |
| Topics | Place value, multiply and divide, fractions, decimals, measurement: 29 skills common to most curricula |
| Languages | English, Bahasa Indonesia. Decimal point in both, no thousands separator |
| Accounts | None for students: a class seat with a pseudonym and a picture password. Real names stay in the teacher's browser. Teachers sign in with Google, Facebook or email |

## How to test

Open **https://numeria.eziedutech.dev**. No sign-in or test account is needed. The full path takes about five minutes.

1. In the Meta Quest browser, choose **META QUEST (XR)** and sit at a real table. The headset finds the table and a pop-up paper book opens on it. If no table is found, place the book with a pinch.
2. Touch an envelope on the desk to pick a game, for example Balloon Burst, then choose **PRACTICE ON MY OWN**. A paper animal brings a question: reach out and touch the balloon with the right answer. Hands work from start to finish, and controllers work too.
3. Back at the desk, choose **RACE THE ROBOTS** to play three timed waves and a final against two robot rivals, followed by a recap with stars.
4. Open **MY FOLD TOWN**. Pinch a piece from the shop shelf, carry it over your land and let go. Point at a building to see its maths card.
5. For the teacher side, open https://numeria.eziedutech.dev/manage in any browser and press **TRY THE TEACHER PAGE**. It creates a sample teacher with a class of six who have already played, with reports, AI insights, a leaderboard, a class town map and race rooms. It needs no account and is removed after 24 hours.

Without a headset, choose **THIS COMPUTER** on the home page to play the same games in the browser, or run the game in the Immersive Web SDK browser emulator (see [Running locally](#running-locally)). The accessibility options (BIG NUMBERS, NO TIMER, HIGH CONTRAST, READ ALOUD, STEADY AIM) and the language switch (English or Indonesian) are on the home page.

## Architecture

![Numeria Arena architecture: one Rust core runs as WebAssembly in the headset game, natively in the game server and natively in the content tool. The server keeps classes, class races, sync and the class screen; AI providers are an optional layer behind it.](assets/architecture.svg)

Choices worth knowing:

- **One core, three places.** Item generation, the expression language, the number formatter, the Fairness Engine, the race and Fold Town rules are written once in Rust. The headset uses the core as WebAssembly, while the server and the content tool run it natively. The same template and seed give the same item, byte for byte, everywhere.
- **Exact fractions.** Every expression is computed with exact fractions, so `0.1 + 0.2` is `0.3` and `2/8` can still be shown as `2/8` when a skill needs it.
- **Templates are validated before they are used.** 2000 random draws per template check constraints, answers, distractors, prompt length and difficulty, and every failure is named with an example. Distractors that collide are dropped exactly as the game drops them.
- **The server decides class races.** A room runs the core's class match on the server's own clock. Answers are written at the end of every wave, keyed by their event id, so a retry never counts an answer twice. What a player's headset receives never marks the right answer.
- **The headset works without the server.** Practice and robot races run offline from a service worker after the first visit, and answers and town changes wait on the device until they can be synced.
- **Hands first.** Every action works with hands from start to finish, and hand pinch grab is switched on explicitly because the SDK leaves it off by default.

```
codes/
  xrclient/        Immersive Web SDK game in the headset and on a computer (TypeScript, Vite)
  frontrouter/     React Router pages: home, teacher, class screen, smartboard race,
                   Math Lessons, admin, privacy and credits
  backrust/
    core/          exact fractions, expression language, formatter, templates, validator,
                   Fairness Engine, races, class match, Fold Town (native and WebAssembly)
    server/        axum game server: rooms and WebSocket, classes, reports, town sync,
                   leaderboards, AI gateway, PostgreSQL migrations
    content-cli/   validate, instantiate, simulate
  content/         skills, misconceptions, JSON schemas, 222 item templates
  brand/           logo and icons
assets/            diagrams
```

## Running locally

Requires Rust (the toolchain is pinned in `rust-toolchain.toml`), Bun 1.4, Node 24 or newer and PostgreSQL for the server.
For the WebAssembly build also `wasm-bindgen` CLI 0.2.129, exactly the crate version:

```bash
cargo install wasm-bindgen-cli --version 0.2.129 --locked
```

Core and server tests (server tests that need a database run only when `TEST_DATABASE_URL` is set):

```bash
cd codes/backrust && cargo test
```

Template validation and the fairness simulation:

```bash
cd codes/backrust && cargo run --release -p content-cli -- validate ../content/templates/*.json
```

```bash
cd codes/backrust && cargo run --release -p content-cli -- simulate
```

Game server on port 3321 (migrations run on start; `OPEN_ROOMS=1` lets anyone open a room for local tests):

```bash
cd codes/backrust && cargo run -p numeria-server
```

Game, in the browser or the emulator, on port 3322:

```bash
cd codes/backrust && ./build-wasm.sh
```

```bash
cd codes/xrclient && bun install && bun run dev
```

Home and teacher pages on port 3320:

```bash
cd codes/frontrouter && bun install && bun run dev
```

Both dev servers pass `/api` to the game server on 3321.

## Configuration

| Setting | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | server | PostgreSQL connection (required) |
| `FIREBASE_PROJECT_ID` | server | Firebase project whose sign-in tokens the server accepts for adults (required) |
| `ADMIN_EMAILS` | server | verified emails that may open the admin page |
| `AUTO_APPROVE_DOMAINS` | server | email domains whose teachers are approved without the proof form |
| `AI_MASTER_KEY` | server | key that encrypts AI provider keys in the database; without it AI stays off |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO` | server | teacher email |
| `PORT`, `CONTENT_DIR`, `OPEN_ROOMS` | server | port (3321), template folder (`../content`), open rooms for local tests |
| `VITE_FIREBASE_*` | xrclient, frontrouter (`.env.local`) | Firebase web config for adult sign-in, see `codes/xrclient/.env.example` |
| `iwsdk.config.json` | xrclient | XR features, emulator device and room, hand pinch grab |
| `WASM_BINDGEN` | build-wasm.sh | path to a `wasm-bindgen` 0.2.129 binary if it is not on `PATH` |

AI providers, their models and the monthly budget are set on the admin page, not in files.

## Results

Measured, not claimed. Everything below is reproducible with the commands above.

### Tests

| Suite | Result |
|---|---|
| Rust core: unit tests and the class match, examples, fairness simulation, race and session suites | 101 passed, 1 ignored (a report printer run on demand) |
| Rust game server | 75 passed |
| Template validator | 222 of 222 templates pass |
| Game client type check | no errors |

### Template validator

222 templates across the 29 skills (place value, multiplication and division, fractions,
decimals, measurement) all pass `content-cli validate`. All of them are drafts written with
an AI model and still await review by a teacher; the game uses them for now so every skill
can be played. An AI model only wrote the templates: every answer is computed by the core.

The first run failed like-fraction addition: when both numerators are 1, "adding the
denominators" and "multiplying the numerators" give the same wrong answer, in 15.5% of
items. The rule now matches what the game does: a distractor equal to the answer or to
an earlier one is dropped, and at least two different distractors must remain in 90%
of items. For 1/5 + 1/5 the balloons show 2/5, 2/10 and 3/5.

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
| 4 s | 9 / 27 / 64 | 89 / 9 / 2 | 100 / 0 / 0 |
| 6 s | 8 / 20 / 72 | 65 / 27 / 8 | 93 / 7 / 0 |
| 10 s | 2 / 8 / 90 | 24 / 37 / 39 | 64 / 31 / 5 |

- Being right matters most: at any pace, a player right 90% of the time usually wins and a player right half the time usually comes last.
- Speed helps without deciding everything. In an earlier run (with the first ten templates) where the robots did not follow the player's pace, a 10 s player right 75% of the time won only 11 of 100 races and a 4 s player always won.
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

- **No frame rate is claimed yet.** It will be measured on a Meta Quest 3 or 3S before submission; the emulator runs on a desktop GPU.
- Hand tracking and table detection have only been exercised in the emulator, which does not reproduce real tracking noise or real rooms.
- The simulations use synthetic students and template difficulties that are not yet calibrated on real answers. Real students will differ.
- No classroom trial has been run yet, so no learning gain and no integrity effect are claimed; action-based assessment is the design, not a measured result.
- Cari & Ukur has not been tried on a headset. Real objects are judged by the geometry of the points the child places, not by their true size, and the emulator has no real object to measure.
- It is not a curriculum and does not grade students. Skill stars and reports are a guide for teachers.

## Roadmap

Until submission (feature freeze 13 November 2026):

- A real headset test: frame rate, hands-only play from start to end, table detection and passthrough in real rooms.
- A server load test with bot clients.
- The question bank reviewed by a person, with difficulties calibrated from real answers.
- Final audio, polish, the video and the testing instructions.

After the competition:

- **Question bank:** 15 templates per skill, every one reviewed by a person, and content beyond grades 4 to 6.
- **Book Keeper:** students without a headset answer on a tablet or the class screen to send help to headset players.
- **Daily Portal:** the same daily waves for everyone, with the numbers still fitted to each child.
- **Pip, the paper owl coach:** a short recap after each match, made from structured data only.
- **Cari & Ukur** tuned on a headset: real objects found by surface hit-testing, small objects, and shapes beyond the sixteen it starts with.
- A shared class town on the class screen, a classroom local network mode for schools with weak internet, and a guardian role for parents.

## Credits and licenses

- **Immersive Web SDK** (Meta Platforms, MIT) with its emulator, **super-three** and **three.js** (MIT), **@pmndrs/uikit** and **@pmndrs/xr** (MIT), icons from **Lucide** (ISC).
- **React**, **React Router**, **Tailwind CSS**, **Vite** (MIT), **TypeScript** (Apache-2.0), **Bun** (MIT).
- **axum**, **tokio**, **sqlx**, **jsonwebtoken**, **lettre**, **tracing**, **serde**, **sha2**, **ring**, **rustls**, **reqwest**, **wasm-bindgen**, **jsonschema** (MIT, Apache-2.0 or ISC), with **PostgreSQL** (PostgreSQL License).
- **Firebase** JS SDK (Apache-2.0) for adult sign-in, and **MediaPipe Tasks Vision** with the `hand_landmarker.task` model (Apache-2.0) for the optional smartboard camera, which runs on the device only.
- Fonts: **Atkinson Hyperlegible** and **Inter** (SIL Open Font License 1.1).
- **Origami models, the 214 Fold Town pieces, the 2D UI images, the paper glyph atlas and the icons** were made by the project owner for this game and are published as CC0 1.0 in [orimathassets](https://github.com/sayazia/orimathassets). `scripts/sync-assets.mjs` copies them and records the source commit in `public/models/manifest.json`. Crystals, balloons, the portal, stars, badges, the orb and buttons are drawn in code (`src/art/`).
- Sound effects are synthesized at run time with the Web Audio API. The one music track, "Echo", was made by the project owner with an AI music tool.

The full list, with versions, is on the game's credits page.

## How this was built

Parts of this work were produced with the assistance of AI tools, under the direction and
review of the author. Design decisions, measurements and claims were checked by hand
against real runs, and every number in this README comes from a command above.

Findings that changed the design:

- **Grab by hand is off by default in the SDK.** Without switching it on, the game would not be playable with hands alone.
- **The simulator overruled the first load-balancing design.** A fixed spawn pace piled creatures up almost every match.
- **Fairness depends on content, not only on the formula.** The weakest students need easy items to exist, so templates may now go easier than first planned.
- **A wire format can give the answer away.** A balloon's misconception code once travelled to the headset, and the one balloon without a code was the right answer. It now stays on the server, and a test keeps it there.

## License

MIT, see [LICENSE](LICENSE).
