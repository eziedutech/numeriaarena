// Emulator test driver for Foldlings: drives the IWSDK CLI with hand input.
// Usage (dev server must be up): node scripts/emulator/drive.mjs orb 3
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
  const t = q.components.find((c) => c.componentId === 'Transform').values.position;
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
  for (const dz of [0.08, 0.05, 0.03, 0.02, 0.012, 0.006, 0]) { tip(x, 0.0325, 0.12 + dz); await sleep(0.1); }
  tip(x, 0.2, 0.35); await sleep(2.5);
}

const val = (t) => (t.includes('/') ? t.split('/').map(Number).reduce((a, b) => a / b) : Number(t));

/** Carry what the hand holds (`held` pattern) so it lands on `to`, correcting for the grab offset. */
async function carry(held, from, to) {
  const now = posOf(held);
  glideGrab(from.x + to.x - now.x, from.y + to.y - now.y, from.z + to.z - now.z);
  await sleep(0.2);
}

export async function orbRound() {
  const line = logs('orb_forge', 1)[0];
  const m = /target (\S+) crystals (.*)$/.exec(line);
  const T = val(m[1]);
  const xs = m[2].split(' ').map(val);
  let pair;
  for (let i = 0; i < xs.length && !pair; i++) for (let k = 0; k < xs.length; k++) if (i !== k && Math.abs(xs[i] + xs[k] - T) < 1e-9) { pair = [i, k]; break; }
  if (!pair) return { line, result: 'no exact pair in the log line' };
  const a = posOf(`^crystal-${pair[0]}$`), b = posOf(`^crystal-${pair[1]}$`);
  if (!a || !b) return { line, pair, result: 'crystals not found' };
  grabAt(a.x, a.y, a.z); await sleep(0.3); pinch(1); await sleep(0.4);
  await carry(`^crystal-${pair[0]}$`, a, { x: b.x, y: b.y + 0.005, z: b.z });
  await sleep(0.8); pinch(0); await sleep(0.3);
  const orb = posOf('^orb$');
  if (!orb) return { line, result: 'no orb formed' };
  const parts = orb.comps.find((c) => c.componentId === 'Orb').values;
  grabAt(orb.x, orb.y, orb.z); await sleep(0.3); pinch(1); await sleep(0.4);
  await carry('^orb$', orb, { x: 0, y: 0.05, z: 0.06 });
  await sleep(0.8); pinch(0); tip(0, 0.25, 0.35); await sleep(2.5);
  return { line, pair, orbParts: [parts.first, parts.second], result: logs('orb ', 1)[0] };
}

/** Pokes balloon `i` of `n` from the front. */
export async function popAt(i, n) {
  const x = (i - (n - 1) / 2) * 0.085;
  for (const dz of [0.1, 0.07, 0.05, 0.035, 0.025, 0.015]) { tip(x, 0.175, 0.17 + dz); await sleep(0.1); }
  tip(x, 0.25, 0.4); await sleep(0.6);
}

/** Plays one Balloon Burst creature: a blind first poke, then the right balloon if a retry is offered. */
export async function balloonRound(line) {
  const texts = /balloons (.*?)( \||$)/.exec(line)[1].split(' ');
  await popAt(0, texts.length);
  const first = logs('\\[game\\] balloon ', 1)[0] ?? '';
  const expected = /expected (\S+),/.exec(first)?.[1];
  if (/: wrong,/.test(first) && expected) {
    await sleep(0.8);
    const i = texts.indexOf(expected);
    if (i > 0) await popAt(i, texts.length);
  }
  return logs('\\[game\\] balloon ', 1)[0];
}

/** Plays a whole Solo Squad match from the menu to the recap. */
export async function squadMatch(maxMinutes = 12) {
  const since = Date.now();
  await card(-0.12);
  const failed = cli('browser', 'logs', '--input-json', j({ count: 5, pattern: 'squad\] could not start', since }));
  if ((failed.logs ?? failed).length) throw new Error(`Solo Squad did not start: ${(failed.logs ?? failed)[0].message}`);
  let last = '';
  const end = Date.now() + maxMinutes * 60000;
  while (Date.now() < end) {
    // The log buffer outlives page reloads, so only lines from this match count.
    if (logs('\\[squad\\] recap', 1, since).length) break;
    const line = logs('\\[game\\] offer', 1, since)[0] ?? '';
    const id = /offer (\d+)/.exec(line)?.[1];
    if (!id || line === last) { await sleep(0.5); continue; }
    last = line;
    await sleep(1.4); // walk-in and balloons rising
    const result = line.includes(' orb_forge ') ? (await orbRound()).result : await balloonRound(line);
    console.log(`${line.replace(/^\[game\] /, '')}\n  -> ${result}`);
  }
  const recap = logs('\\[squad\\] recap', 1, since)[0];
  console.log(recap ?? 'no recap before the time limit');
  return recap;
}

if (process.argv[2] === 'squad') {
  await fresh();
  await squadMatch();
}

if (process.argv[2] === 'orb') {
  await fresh();
  await card(0.12);
  for (let r = 0; r < Number(process.argv[3] ?? 3); r++) console.log(JSON.stringify(await orbRound()));
}
