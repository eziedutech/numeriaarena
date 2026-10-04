// Plays a Class Match through the game's own ClassRace (src/game/class-race.ts)
// against a running server, the way the desk does: two classmates (the third
// seat a bot), seat 0 starts, both answer what they are offered, and each must
// end with a recap that puts itself first and agrees with its verdicts. Seat 1
// drops once and comes back with its token. A watcher counts the messages.
// Needs a server started with OPEN_ROOMS=1.
//   node scripts/class-smoke.mjs [http://127.0.0.1:3321]
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.argv[2] ?? 'http://127.0.0.1:3321';
const url = new URL(base);
globalThis.location = { protocol: url.protocol, host: url.host };

const out = join(tmpdir(), `class-race-${process.pid}.mjs`);
await build({ entryPoints: ['src/game/class-race.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'error' });
const { ClassRace } = await import(pathToFileURL(out).href);

const res = await fetch(`${base}/api/rooms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ seats: 3 }),
});
const room = await res.json();
if (!res.ok) throw new Error(`open room: ${res.status} ${JSON.stringify(room)}`);
console.log('room', room.play_code, 'watch', room.watch_code);

let watched = 0;
const watcher = new WebSocket(`${base.replace(/^http/, 'ws')}/api/ws`);
watcher.addEventListener('open', () => watcher.send(JSON.stringify({ type: 'hello', code: room.watch_code })));
watcher.addEventListener('message', () => (watched += 1));

// A wrong code and a watch code are refused at the join.
for (const [code, want] of [
  ['ZZZZZZ', 'room_not_found'],
  [room.watch_code, 'watch_code'],
]) {
  const got = await ClassRace.join(code).then(
    () => 'joined',
    (e) => e.message,
  );
  if (got !== want) throw new Error(`join ${code}: ${got}, wanted ${want}`);
}

const seats = [await ClassRace.join(room.play_code), await ClassRace.join(room.play_code)];
await new Promise((r) => setTimeout(r, 300));
console.log('seats', seats.map((s) => `${s.seat}:${s.name}`).join(', '), 'lobby', JSON.stringify(seats[0].lobby));
seats[0].start();
await Promise.all(seats.map((s) => s.whenStarted()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function play(race, dropAt) {
  let points = 0;
  let verdicts = 0;
  let events = 0;
  let ended = false;
  let dropped = false;
  const t0 = Date.now();
  while (!ended) {
    for (const ev of race.tick(Date.now())) {
      events += 1;
      if (ev.type === 'match_end') ended = true;
    }
    if (dropAt && !dropped && Date.now() - t0 > dropAt) {
      // Drop the socket as a flaky network would; the race reconnects on its own.
      dropped = true;
      race.ws.close();
      console.log(`seat ${race.seat} dropped`);
    }
    const offer = race.playerNext();
    if (offer) {
      await sleep(1500);
      let v;
      try {
        v =
          offer.game === 'balloon_burst'
            ? await race.answerBalloon(offer.offer_id, 0)
            : await race.answerOrb(offer.offer_id, [0]);
        if (!v.correct && v.retry_allowed) {
          points += v.race_points;
          verdicts += 1;
          v =
            offer.game === 'balloon_burst'
              ? await race.answerBalloon(offer.offer_id, 1)
              : await race.answerOrb(offer.offer_id, [1]);
        }
        points += v.race_points;
        verdicts += 1;
      } catch (e) {
        console.log(`seat ${race.seat} answer refused: ${e.message}`);
      }
    }
    await sleep(100);
  }
  await sleep(1500);
  const recap = race.recap();
  const view = race.view();
  console.log(
    `seat ${race.seat}: verdicts ${verdicts}, points ${points}, events ${events}, rivals ${JSON.stringify(race.rivalSeats())}`,
  );
  console.log(`  recap ${JSON.stringify(recap.players.map((p) => [p.name, p.bot, p.points, p.place, p.stars]))}`);
  if (recap.players[0]?.name !== race.name) throw new Error(`seat ${race.seat}: recap does not start with itself`);
  if (recap.players[0].points !== points) throw new Error(`seat ${race.seat}: recap ${recap.players[0].points} != verdicts ${points}`);
  if (view.desks[0]?.points !== points) throw new Error(`seat ${race.seat}: view ${view.desks[0]?.points} != verdicts ${points}`);
  if (recap.players.length !== 3) throw new Error(`seat ${race.seat}: ${recap.players.length} players`);
}

await Promise.all([play(seats[0]), play(seats[1], 40000)]);
console.log('watcher messages', watched);
for (const s of seats) s.free();
watcher.close();
console.log('ok');
