// Emulator test driver for Numeria Arena: drives the IWSDK runtime with hand input.
// Usage (dev server must be up): node scripts/emulator/drive.mjs race | orb 3 | balloon 3 | quit
// Offsets below were measured in the IWER emulator (metaQuest3, living_room).
//
// Commands go straight to the dev server's runtime bridge through the CLI's own
// transport (a few milliseconds each) instead of starting `iwsdk` once per
// command (about a second each, which let a race run out before the results).
// Waits that used to hide inside that second are written out where a move
// needs them.
import { pathToFileURL } from 'node:url';

// xrclient folder, resolved from this script's location (scripts/emulator/).
const CWD = new URL('../../codes/xrclient/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const { sendRuntimeCommand } = await import(pathToFileURL(`${CWD}node_modules/@iwsdk/cli/dist/index.js`).href);
const PORT = 3322;
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** CLI command names to runtime methods (the CLI's RUNTIME_TOOL_TO_METHOD). */
const METHOD = {
  'xr enter': 'accept_session',
  'xr exit': 'end_session',
  'xr set-transform': 'set_transform',
  'xr look-at': 'look_at',
  'xr animate-to': 'animate_to',
  'xr set-input-mode': 'set_input_mode',
  'xr set-select-value': 'set_select_value',
  'ecs find': 'ecs_find_entities',
  'ecs query': 'ecs_query_entity',
  'browser logs': 'get_console_logs',
  'browser reload': 'reload_page',
  'browser interact': 'browser_interact',
};

/**
 * Runs one runtime command, named as on the CLI, and returns its result.
 * While the page reloads the bridge is briefly away, so a failed send is
 * retried for up to 15 s.
 */
async function cli(group, action, params = {}) {
  const method = METHOD[`${group} ${action}`];
  if (!method) throw new Error(`no runtime method for ${group} ${action}`);
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await sendRuntimeCommand({ port: PORT, method, params, timeoutMs: 20000 });
      // A refused command (for example entering XR twice) still answers.
      return r.result ?? r;
    } catch (e) {
      if (attempt >= 30) throw e;
      await sleep(0.5);
    }
  }
}

let D; // desk pose
export async function desk() {
  const e = (await cli('ecs', 'find', { namePattern: '^desk-root$' })).entities[0].entityIndex;
  const t = (await cli('ecs', 'query', { entityIndex: e })).components.find((c) => c.componentId === 'Transform').values;
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
export const tip = (x, y, z) => cli('xr', 'set-transform', { device: 'hand-right', position: wristFor(w(x, y, z)), orientation: ID });
const tipForGrab = (x, y, z) => { const g = w(x, y, z); return { x: g.x - GRAB.x, y: g.y - GRAB.y, z: g.z - GRAB.z }; };
export const grabAt = (x, y, z) => cli('xr', 'set-transform', { device: 'hand-right', position: wristFor(tipForGrab(x, y, z)), orientation: ID });
export const glideGrab = (x, y, z, d = 0.6) =>
  cli('xr', 'animate-to', { device: 'hand-right', position: wristFor(tipForGrab(x, y, z)), orientation: ID, duration: d });
export const pinch = (v) => cli('xr', 'set-select-value', { device: 'hand-right', value: v });

export async function find(pattern) {
  return (await cli('ecs', 'find', { namePattern: pattern })).entities ?? [];
}
export async function posOf(pattern) {
  const e = (await find(pattern))[0];
  if (!e) return null;
  const q = await cli('ecs', 'query', { entityIndex: e.entityIndex });
  // The entity can disappear between the two queries (a popped balloon).
  const tr = q?.components?.find?.((c) => c.componentId === 'Transform');
  if (!tr) return null;
  const t = tr.values.position;
  return { x: t[0], y: t[1], z: t[2], comps: q.components };
}
export async function logs(pattern, n = 1, since = undefined) {
  const r = await cli('browser', 'logs', { count: 200, pattern, since });
  const list = Array.isArray(r) ? r : (r.logs ?? []);
  const msgs = [...new Set(list.map((l) => l.message))];
  return msgs.slice(-n);
}
/** The newest log line matching `pattern`, or undefined. */
const lastLog = async (pattern) => (await logs(pattern, 1))[0];

export async function fresh() {
  await cli('browser', 'reload'); await sleep(7);
  await seat();
  await allowPokes();
}

/**
 * Balloons ignore hand touches in the emulator unless Y switches them on;
 * this driver pokes with the hand, so it turns them on after each reload.
 */
export async function allowPokes() {
  await cli('browser', 'interact', { steps: [{ action: 'press', key: 'y' }] });
}

/** Enters XR, waits for the book to land, and seats the head in front of it. */
export async function seat() {
  await cli('xr', 'enter'); await sleep(5);
  await cli('xr', 'set-input-mode', { mode: 'hand' });
  // The book may take up to about 9 s to land (table search, then pinch wait).
  for (let i = 0; i < 30; i++) {
    const p = await posOf('^desk-root$');
    if (p?.comps.find((c) => c.componentId === 'DeskRoot')?.values.placed) break;
    await sleep(0.5);
  }
  await desk();
  await cli('xr', 'set-transform', { device: 'headset', position: w(0, 0.42, 0.45) });
  await cli('xr', 'look-at', { device: 'headset', target: w(0, 0.06, 0) });
}

export async function card(x) {
  // Tapped from above and in front: menu envelopes lean back on the table.
  for (const k of [1, 0.7, 0.45, 0.3, 0.2, 0.1, 0]) { await tip(x, 0.012 + 0.06 * k, 0.16 + 0.05 * k); await sleep(0.15); }
  await sleep(0.3);
  await tip(x, 0.2, 0.35); await sleep(2.5);
}

/** Reads a shown number: "3/8", "2 1/4", "0.25", or "16 cm" (the unit is dropped). */
const val = (text) => {
  const t = text.replace(/\s*[a-z]+$/i, '');
  if (t.includes(' ')) return t.split(' ').map(val).reduce((a, b) => a + b);
  return t.includes('/') ? t.split('/').map(Number).reduce((a, b) => a / b) : Number(t);
};

/** Carry what the hand holds (`held` pattern) so it lands on `to`, correcting for the grab offset. */
async function carry(held, from, to) {
  const now = await posOf(held);
  // Gone already: the round ran out of time while the hand was on its way.
  if (!now) return;
  await glideGrab(from.x + to.x - now.x, from.y + to.y - now.y, from.z + to.z - now.z);
  // The glide takes 0.6 s and the command returns at once.
  await sleep(0.8);
}

export async function orbRound() {
  // Only the offer line: "[menu] pressed orb_forge" mentions the game too.
  const line = await lastLog('\\[game\\] offer \\d+ orb_forge');
  const m = /target (.+?) crystals (.*)$/.exec(line);
  const T = val(m[1]);
  const xs = m[2].split(', ').map(val);
  let pair;
  for (let i = 0; i < xs.length && !pair; i++) for (let k = 0; k < xs.length; k++) if (i !== k && Math.abs(xs[i] + xs[k] - T) < 1e-9) { pair = [i, k]; break; }
  if (!pair) return { line, result: 'no exact pair in the log line' };
  // The crystals may still be landing on the desk when the offer is logged.
  let a, b;
  for (let tries = 0; tries < 30 && !(a && b); tries++) {
    a = await posOf(`^crystal-${pair[0]}$`);
    b = await posOf(`^crystal-${pair[1]}$`);
    if (!(a && b)) await sleep(0.1);
  }
  if (!a || !b) return { line, pair, result: 'crystals gone (the wave clock likely ran out)' };
  const before = await lastLog('orb ');
  await grabAt(a.x, a.y, a.z); await sleep(0.3); await pinch(1); await sleep(0.4);
  await carry(`^crystal-${pair[0]}$`, a, { x: b.x, y: b.y + 0.005, z: b.z });
  // Held beside its partner, the pair joins and is given as the answer by itself.
  await sleep(0.8); await pinch(0); await tip(0, 0.25, 0.35); await sleep(4);
  const after = await lastLog('orb ');
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
    b = await posOf(`^balloon-${i}$`);
    // Rising (not waiting on the table) and low enough to reach.
    if (b && b.y > 0.002 && b.y < 0.2) break;
    b = undefined;
    await sleep(0.1);
  }
  if (!b) return;
  // The envelope's middle is about 7 cm above the basket (the origin).
  const x = b.x, y = b.y + 0.07 + RISE * LEAD;
  await tip(x, y, b.z + 0.07); await sleep(0.3);
  await cli('xr', 'animate-to', { device: 'hand-right', position: wristFor(w(x, y, b.z - 0.01)), orientation: ID, duration: 0.3 });
  // The push takes 0.3 s and the command returns at once: let it land.
  await sleep(0.45);
  await tip(x, y, b.z + 0.07); await sleep(0.15);
  await tip(0, 0.25, 0.4); await sleep(0.3);
}

/** Plays one Balloon Burst creature: a blind first poke, then the right balloon if a retry is offered. */
export async function balloonRound(line) {
  const texts = /balloons (.*?)( \||$)/.exec(line)[1].split(', ');
  // The log buffer outlives reloads: only a line that changed is this
  // creature's, and only if the popped number is one of its balloons (a
  // creature that ran out of time is followed at once by the next one).
  const before = await lastLog('\\[game\\] balloon ');
  const newLine = async () => {
    const l = await lastLog('\\[game\\] balloon ');
    const popped = /balloon \d+ (.+?): /.exec(l ?? '')?.[1];
    return l !== before && popped !== undefined && texts.includes(popped) ? l : undefined;
  };
  // Still this creature at the desk: the newest offer is the one being played.
  const current = async () => (await lastLog('\\[game\\] offer')) === line;
  for (let tries = 0; tries < 3 && !(await newLine()) && (await current()); tries++) await popAt(0);
  const first = (await newLine()) ?? '';
  const expected = /expected (.+?), [+]/.exec(first)?.[1];
  if (/: wrong,/.test(first) && expected) {
    await sleep(0.8);
    const i = texts.indexOf(expected);
    for (let tries = 0; tries < 3 && i > 0 && (await lastLog('\\[game\\] balloon ')) === first && (await current()); tries++) await popAt(i);
  }
  return (await newLine()) ?? ((await current()) ? 'no balloon popped' : 'moved on: the next creature came first');
}

/** Plays a whole race from the menu to the results. */
export async function raceMatch(maxMinutes = 12) {
  // The log buffer outlives page reloads, and browser log timestamps do not
  // follow this machine's clock, so compare with the last lines seen before
  // the race instead of filtering by time.
  const oldRecap = await lastLog('\\[race\\] recap');
  const oldFail = await lastLog('race\\] could not start');
  let last = (await lastLog('\\[game\\] offer')) ?? '';
  await card(-0.135);
  const fail = await lastLog('race\\] could not start');
  if (fail && fail !== oldFail) throw new Error(`The race did not start: ${fail}`);
  let recap;
  const end = Date.now() + maxMinutes * 60000;
  while (Date.now() < end) {
    recap = await lastLog('\\[race\\] recap');
    if (recap && recap !== oldRecap) break;
    recap = undefined;
    const line = (await lastLog('\\[game\\] offer')) ?? '';
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

const mode = process.argv[2];
const t0 = Date.now();

if (mode === 'race') {
  await fresh();
  await raceMatch();
}

if (mode === 'orb') {
  await fresh();
  await card(0.135);
  for (let r = 0; r < Number(process.argv[3] ?? 3); r++) console.log(JSON.stringify(await orbRound()));
}

if (mode === 'balloon') {
  await fresh();
  let last = (await lastLog('\\[game\\] offer')) ?? '';
  await card(0);
  for (let r = 0; r < Number(process.argv[3] ?? 3); r++) {
    let line = '';
    for (let k = 0; k < 20 && (!line || line === last); k++) { line = (await lastLog('\\[game\\] offer')) ?? ''; await sleep(0.5); }
    last = line;
    await sleep(1.4);
    console.log(`${line.replace(/^\[game\] /, '')}\n  -> ${await balloonRound(line)}`);
  }
}

// Starts a race, then leaves it with the QUIT card (two presses) and checks the desk menu is back.
if (mode === 'quit') {
  await fresh();
  const oldFail = await lastLog('race\\] could not start');
  await card(-0.135);
  await sleep(3);
  const fail = await lastLog('race\\] could not start');
  if (fail && fail !== oldFail) throw new Error(`The race did not start: ${fail}`);
  const quit = await posOf('^menu-quit$');
  console.log(quit ? `QUIT card at ${quit.x.toFixed(3)}, ${quit.y.toFixed(3)}, ${quit.z.toFixed(3)}` : 'no QUIT card');
  const oldQuit = await lastLog('\\[game\\] quit from the desk');
  await card(0.39);
  console.log('after one press:', (await logs('\\[menu\\] pressed quit', 1))[0] ?? 'no press logged');
  await card(0.39);
  const done = await lastLog('\\[game\\] quit from the desk');
  console.log(done && done !== oldQuit ? done : 'did not quit');
  console.log((await find('^menu-race$')).length > 0 ? 'desk menu is back' : 'no desk menu');
}

// A finished run leaves no XR session behind: an idle emulated session keeps
// rendering the room and the game for both eyes and loads the machine.
if (['race', 'orb', 'balloon', 'quit'].includes(mode)) {
  await cli('xr', 'exit');
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`);
}
