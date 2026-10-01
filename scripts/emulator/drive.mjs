// Emulator test driver for Numeria Arena: drives the IWSDK CLI with hand input.
// Usage (dev server must be up): node scripts/emulator/drive.mjs race | orb 3 | balloon 3
// Offsets below were measured in the IWER emulator (metaQuest3, living_room).
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

const BUN = `${homedir()}/.bun/bin/bun.exe`;
// xrclient folder, resolved from this script's location (scripts/emulator/).
const CWD = new URL('../../codes/xrclient/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

function cli(...args) {
  let out;
  try {
    out = execFileSync(BUN, ['x', 'iwsdk', ...args, '--raw'], { cwd: CWD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    // A refused command (for example entering XR twice) still prints its JSON reply.
    out = error.stdout ?? '';
  }
  try { return JSON.parse(out); } catch { return out; }
}
const j = (o) => JSON.stringify(o);

let D; // desk pose
export function desk() {
  const e = cli('ecs', 'find', '--input-json', j({ namePattern: '^desk-root$' })).entities[0].entityIndex;
  const t = cli('ecs', 'query', '--input-json', j({ entityIndex: e })).components.find((c) => c.componentId === 'Transform').values;
  const [qx, qy, qz, qw] = t.orientation;
  D = { p: t.position, yaw: Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx)) };
  return D;
}
export const w = (x, y, z) => {
  const c = Math.cos(D.yaw), s = Math.sin(D.yaw);
  return { x: D.p[0] + x * c + z * s, y: D.p[1] + y, z: D.p[2] - x * s + z * c };
};
const TIP = { x: -0.034, y: 0.064, z: -0.033 }; // index tip relative to hand-right, identity orientation
// Hand grab point relative to the index tip, in WORLD axes (hand kept at identity orientation).
const GRAB = { x: 0, y: 0, z: 0.075 };
const wristFor = (p) => ({ x: p.x - TIP.x, y: p.y - TIP.y, z: p.z - TIP.z });
const ID = { x: 0, y: 0, z: 0, w: 1 };
export const tip = (x, y, z) => cli('xr', 'set-transform', '--input-json', j({ device: 'hand-right', position: wristFor(w(x, y, z)), orientation: ID }));
const tipForGrab = (x, y, z) => { const g = w(x, y, z); return { x: g.x - GRAB.x, y: g.y - GRAB.y, z: g.z - GRAB.z }; };
export const grabAt = (x, y, z) => cli('xr', 'set-transform', '--input-json', j({ device: 'hand-right', position: wristFor(tipForGrab(x, y, z)), orientation: ID }));
export const glideGrab = (x, y, z, d = 0.6) =>
  cli('xr', 'animate-to', '--input-json', j({ device: 'hand-right', position: wristFor(tipForGrab(x, y, z)), orientation: ID, duration: d }));
export const pinch = (v) => cli('xr', 'set-select-value', '--input-json', j({ device: 'hand-right', value: v }));

export function find(pattern) {
  return cli('ecs', 'find', '--input-json', j({ namePattern: pattern })).entities ?? [];
}
export function posOf(pattern) {
  const e = find(pattern)[0];
  if (!e) return null;
  const q = cli('ecs', 'query', '--input-json', j({ entityIndex: e.entityIndex }));
  // The entity can disappear between the two queries (a popped balloon).
  const tr = q?.components?.find?.((c) => c.componentId === 'Transform');
  if (!tr) return null;
  const t = tr.values.position;
  return { x: t[0], y: t[1], z: t[2], comps: q.components };
}
export function logs(pattern, n = 1, since = undefined) {
  const r = cli('browser', 'logs', '--input-json', j({ count: 200, pattern, since }));
  const msgs = [...new Set((r.logs ?? r).map((l) => l.message))];
  return msgs.slice(-n);
}

export async function fresh() {
  cli('browser', 'reload'); await sleep(7);
  await seat();
  allowPokes();
}

/**
 * Balloons ignore hand touches in the emulator unless Y switches them on;
 * this driver pokes with the hand, so it turns them on after each reload.
 */
export function allowPokes() {
  execFileSync(BUN, ['x', 'iwsdk', 'browser', 'interact', '--input-json', j({ steps: [{ action: 'press', key: 'y' }] }), '--raw'], {
    cwd: CWD,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Enters XR, waits for the book to land, and seats the head in front of it. */
export async function seat() {
  cli('xr', 'enter'); await sleep(5);
  cli('xr', 'set-input-mode', '--input-json', j({ mode: 'hand' }));
  // The book may take up to about 9 s to land (table search, then pinch wait).
  for (let i = 0; i < 30; i++) {
    const p = posOf('^desk-root$');
    if (p?.comps.find((c) => c.componentId === 'DeskRoot')?.values.placed) break;
    await sleep(0.5);
  }
  desk();
  cli('xr', 'set-transform', '--input-json', j({ device: 'headset', position: w(0, 0.42, 0.45) }));
  cli('xr', 'look-at', '--input-json', j({ device: 'headset', target: w(0, 0.06, 0) }));
}

export async function card(x) {
  // Tapped from above and in front: menu envelopes lean back on the table.
  for (const k of [1, 0.7, 0.45, 0.3, 0.2, 0.1, 0]) { tip(x, 0.012 + 0.06 * k, 0.16 + 0.05 * k); await sleep(0.1); }
  tip(x, 0.2, 0.35); await sleep(2.5);
}

/** Reads a shown number: "3/8", "2 1/4", "0.25", or "16 cm" (the unit is dropped). */
const val = (text) => {
  const t = text.replace(/\s*[a-z]+$/i, '');
  if (t.includes(' ')) return t.split(' ').map(val).reduce((a, b) => a + b);
  return t.includes('/') ? t.split('/').map(Number).reduce((a, b) => a / b) : Number(t);
};

/** Carry what the hand holds (`held` pattern) so it lands on `to`, correcting for the grab offset. */
async function carry(held, from, to) {
  const now = posOf(held);
  // Gone already: the round ran out of time while the hand was on its way.
  if (!now) return;
  glideGrab(from.x + to.x - now.x, from.y + to.y - now.y, from.z + to.z - now.z);
  await sleep(0.2);
}

export async function orbRound() {
  const line = logs('orb_forge', 1)[0];
  const m = /target (.+?) crystals (.*)$/.exec(line);
  const T = val(m[1]);
  const xs = m[2].split(', ').map(val);
  let pair;
  for (let i = 0; i < xs.length && !pair; i++) for (let k = 0; k < xs.length; k++) if (i !== k && Math.abs(xs[i] + xs[k] - T) < 1e-9) { pair = [i, k]; break; }
  if (!pair) return { line, result: 'no exact pair in the log line' };
  const a = posOf(`^crystal-${pair[0]}$`), b = posOf(`^crystal-${pair[1]}$`);
  if (!a || !b) return { line, pair, result: 'crystals not found' };
  const before = logs('orb ', 1)[0];
  grabAt(a.x, a.y, a.z); await sleep(0.3); pinch(1); await sleep(0.4);
  await carry(`^crystal-${pair[0]}$`, a, { x: b.x, y: b.y + 0.005, z: b.z });
  // Held beside its partner, the pair joins and is given as the answer by itself.
  await sleep(0.8); pinch(0); tip(0, 0.25, 0.35); await sleep(4);
  const after = logs('orb ', 1)[0];
  return { line, pair, result: after !== before ? after : 'no orb given' };
}

/**
 * Balloons hold still while a fingertip is near (poke hover reaches 20 cm),
 * so the hand aims at where the balloon is, not where it would rise to.
 */
const RISE = 0;
const LEAD = 0;

/**
 * Pokes balloon `i` straight from the front. The game only counts a finger
 * pushed into a balloon, and its hand velocity is smoothed over about 0.1 s,
 * so a hand that jumps sideways to the balloon and then steps in reads as a
 * sideways brush. Park in front first, wait for the hand to settle, then push
 * along the desk's forward axis, aimed where the rising balloon will be.
 */
export async function popAt(i) {
  let b;
  for (let tries = 0; tries < 20; tries++) {
    b = posOf(`^balloon-${i}$`);
    // Rising (not waiting on the table) and low enough to reach.
    if (b && b.y > 0.002 && b.y < 0.2) break;
    b = undefined;
    await sleep(0.1);
  }
  if (!b) return;
  // The envelope's middle is about 7 cm above the basket (the origin).
  const x = b.x, y = b.y + 0.07 + RISE * LEAD;
  tip(x, y, b.z + 0.07); await sleep(0.3);
  cli('xr', 'animate-to', '--input-json', j({ device: 'hand-right', position: wristFor(w(x, y, b.z - 0.01)), orientation: ID, duration: 0.3 }));
  tip(x, y, b.z + 0.07);
  tip(0, 0.25, 0.4); await sleep(0.3);
}

/** Plays one Balloon Burst creature: a blind first poke, then the right balloon if a retry is offered. */
export async function balloonRound(line) {
  const texts = /balloons (.*?)( \||$)/.exec(line)[1].split(', ');
  // The log buffer outlives reloads: only a line that changed is this creature's.
  const before = logs('\\[game\\] balloon ', 1)[0];
  const newLine = () => {
    const l = logs('\\[game\\] balloon ', 1)[0];
    return l !== before ? l : undefined;
  };
  for (let tries = 0; tries < 3 && !newLine(); tries++) await popAt(0);
  const first = newLine() ?? '';
  const expected = /expected (.+?), [+]/.exec(first)?.[1];
  if (/: wrong,/.test(first) && expected) {
    await sleep(0.8);
    const i = texts.indexOf(expected);
    for (let tries = 0; tries < 3 && i > 0 && logs('\\[game\\] balloon ', 1)[0] === first; tries++) await popAt(i);
  }
  return newLine() ?? 'no balloon popped';
}

/** Plays a whole race from the menu to the results. */
export async function raceMatch(maxMinutes = 12) {
  // The log buffer outlives page reloads, and browser log timestamps do not
  // follow this machine's clock, so compare with the last lines seen before
  // the race instead of filtering by time.
  const oldRecap = logs('\\[race\\] recap', 1)[0];
  const oldFail = logs('race\\] could not start', 1)[0];
  let last = logs('\\[game\\] offer', 1)[0] ?? '';
  await card(-0.135);
  const fail = logs('race\\] could not start', 1)[0];
  if (fail && fail !== oldFail) throw new Error(`The race did not start: ${fail}`);
  let recap;
  const end = Date.now() + maxMinutes * 60000;
  while (Date.now() < end) {
    recap = logs('\\[race\\] recap', 1)[0];
    if (recap && recap !== oldRecap) break;
    recap = undefined;
    const line = logs('\\[game\\] offer', 1)[0] ?? '';
    const id = /offer (\d+)/.exec(line)?.[1];
    if (!id || line === last) { await sleep(0.5); continue; }
    last = line;
    await sleep(1.4); // walk-in and balloons rising
    const result = line.includes(' orb_forge ') ? (await orbRound()).result : await balloonRound(line);
    console.log(`${line.replace(/^\[game\] /, '')}\n  -> ${result}`);
  }
  console.log(recap ?? 'no recap before the time limit');
  return recap;
}

if (process.argv[2] === 'race') {
  await fresh();
  await raceMatch();
}

if (process.argv[2] === 'orb') {
  await fresh();
  await card(0.135);
  for (let r = 0; r < Number(process.argv[3] ?? 3); r++) console.log(JSON.stringify(await orbRound()));
}

if (process.argv[2] === 'balloon') {
  await fresh();
  let last = logs('\\[game\\] offer', 1)[0] ?? '';
  await card(0);
  for (let r = 0; r < Number(process.argv[3] ?? 3); r++) {
    let line = '';
    for (let k = 0; k < 20 && (!line || line === last); k++) { line = logs('\\[game\\] offer', 1)[0] ?? ''; await sleep(0.5); }
    last = line;
    await sleep(1.4);
    console.log(`${line.replace(/^\[game\] /, '')}\n  -> ${await balloonRound(line)}`);
  }
}
