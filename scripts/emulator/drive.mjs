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
  const out = execFileSync(BUN, ['x', 'iwsdk', ...args, '--raw'], { cwd: CWD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
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
const GRAB_X = 0.075; // grab point sits this far toward -X (desk frame) from the index tip
const wristFor = (p) => ({ x: p.x - TIP.x, y: p.y - TIP.y, z: p.z - TIP.z });
const ID = { x: 0, y: 0, z: 0, w: 1 };
export const tip = (x, y, z) => cli('xr', 'set-transform', '--input-json', j({ device: 'hand-right', position: wristFor(w(x, y, z)), orientation: ID }));
export const grabAt = (x, y, z) => tip(x + GRAB_X, y, z);
export const glideGrab = (x, y, z, d = 0.6) =>
  cli('xr', 'animate-to', '--input-json', j({ device: 'hand-right', position: wristFor(w(x + GRAB_X, y, z)), orientation: ID, duration: d }));
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
export function logs(pattern, n = 1) {
  const r = cli('browser', 'logs', '--input-json', j({ count: 200, pattern }));
  const msgs = [...new Set((r.logs ?? r).map((l) => l.message))];
  return msgs.slice(-n);
}

export async function fresh() {
  cli('browser', 'reload'); await sleep(7);
  cli('xr', 'enter'); await sleep(5);
  cli('xr', 'set-input-mode', '--input-json', j({ mode: 'hand' })); await sleep(1.5);
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
  const a = posOf(`^crystal-${pair[0]}$`), b = posOf(`^crystal-${pair[1]}$`);
  grabAt(a.x, a.y, a.z); await sleep(0.3); pinch(1); await sleep(0.4);
  await carry(`^crystal-${pair[0]}$`, a, { x: b.x, y: b.y + 0.005, z: b.z });
  await sleep(0.8); pinch(0); await sleep(0.3);
  const orb = posOf('^orb$');
  if (!orb) return { line, result: 'no orb formed' };
  const parts = orb.comps.find((c) => c.componentId === 'Orb').values;
  grabAt(orb.x, orb.y, orb.z); await sleep(0.3); pinch(1); await sleep(0.4);
  await carry('^orb$', orb, { x: 0, y: 0.05, z: 0.035 });
  await sleep(0.8); pinch(0); tip(0, 0.25, 0.35); await sleep(2.5);
  return { line, pair, orbParts: [parts.first, parts.second], result: logs('orb ', 1)[0] };
}

if (process.argv[2] === 'orb') {
  await fresh();
  await card(0.1);
  for (let r = 0; r < Number(process.argv[3] ?? 3); r++) console.log(JSON.stringify(await orbRound()));
}
