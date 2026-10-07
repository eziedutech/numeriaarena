// Measures the game's loading screen (codes/xrclient/index.html) against a
// production build, without a headset and without screenshots: a local server
// serves codes/xrclient/dist at /play/ with a capped speed, and headless
// Chromium records the percentage the loading screen shows every 50 ms.
//
//   node scripts/loading/measure.mjs [KB per second, default 1000]
//
// Three visits in one browser profile:
//   first  no service worker yet
//   cached the worker holds every file
//   deploy the worker is there but the main code is not in its cache, as
//          after a new build (new file name) before the new worker has it
// Prints, per visit, when the screen first left 0%, reached 70% and
// how the percentage moved in between. Run from the repository root.

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

import { chromium } from '../../codes/xrclient/node_modules/playwright/index.mjs';

const DIST = resolve('codes/xrclient/dist');
const RATE = Number(process.argv[2] ?? 1000) * 1024;
const PORT = 3399;
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary', '.css': 'text/css', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };

// One shared pipe, like one school connection: every response takes turns.
let busyUntil = 0;
function send(res, path) {
  const chunk = 16 * 1024;
  const stream = createReadStream(path, { highWaterMark: chunk });
  stream.on('data', (buf) => {
    stream.pause();
    const now = Date.now();
    busyUntil = Math.max(busyUntil, now) + (buf.length / RATE) * 1000;
    setTimeout(() => {
      res.write(buf);
      stream.resume();
    }, busyUntil - now);
  });
  stream.on('end', () => setTimeout(() => res.end(), Math.max(0, busyUntil - Date.now())));
}

// Every request, and a mark the worker's version gets to pose as a new build.
const asked = [];
let build = '';
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  asked.push(url.pathname);
  if (!url.pathname.startsWith('/play/')) return res.writeHead(404).end();
  let rel = url.pathname.slice('/play/'.length) || 'index.html';
  let path = join(DIST, rel);
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(DIST, 'index.html');
  const headers = { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream', 'Content-Length': statSync(path).size };
  if (rel.startsWith('assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else headers['Cache-Control'] = 'no-cache';
  if (rel === 'sw.js' && build) {
    const code = readFileSync(path, 'utf8').replace(/const VERSION = "([^"]+)"/, `const VERSION = "$1${build}"`);
    headers['Content-Length'] = Buffer.byteLength(code);
    res.writeHead(200, headers);
    return res.end(code);
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  send(res, path);
});

const RECORD = `
  window.__log = [];
  const t0 = performance.now();
  let last = null;
  setInterval(() => {
    const el = document.getElementById('boot-pct');
    const v = el ? el.textContent : null;
    const w = window.numeriaBooted ? 'up' : v;
    if (w !== last) { window.__log.push([Math.round(performance.now() - t0), w]); last = w; }
  }, 50);
`;

async function visit(page, name) {
  visiting = name;
  await page.goto(`http://localhost:${PORT}/play/`, { waitUntil: 'commit' });
  const t = Date.now();
  while (Date.now() - t < 60000) {
    const log = await page.evaluate(() => window.__log).catch(() => null);
    if (log?.some(([, v]) => v && parseInt(v) >= 70)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const log = await page.evaluate(() => window.__log);
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  const at = (p) => log.find(([, v]) => v && parseInt(v) >= p)?.[0];
  const steps = log.filter(([, v]) => v && parseInt(v) > 0 && parseInt(v) < 70).length;
  console.log(`${name.padEnd(7)} worker=${controlled ? 'yes' : 'no '}  left 0% at ${at(1) ?? '-'} ms  70% at ${at(70) ?? '-'} ms  values between 1 and 69: ${steps}`);
  if (name === 'cached') {
    const u = Date.now();
    while (Date.now() - u < 60000 && !(await page.evaluate(() => window.numeriaBooted === true))) await new Promise((r) => setTimeout(r, 200));
    const up = (await page.evaluate(() => window.__log)).find(([, v]) => v === 'up')?.[0];
    console.log(`        game up at ${up ?? '-'} ms`);
  }
  console.log(`        ${log.map(([ms, v]) => `${ms}:${v}`).join(' ')}`);
}

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(RECORD);
const page = await context.newPage();
const problems = [];
let visiting = '';
page.on('console', (m) => m.type() === 'error' && problems.push(`${visiting}: ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => problems.push(`${visiting}: pageerror ${e.message.slice(0, 200)}`));
page.on('requestfailed', (r) => problems.push(`${visiting}: failed ${r.url().slice(-60)} ${r.failure()?.errorText}`));
const entry = JSON.parse(/window\.NUMERIA_BOOT = (\{[^}]+\})/.exec(await (await fetch(`http://localhost:${PORT}/play/`)).text())[1]);
console.log(`rate ${RATE / 1024} KB/s, main code ${entry.src} ${entry.bytes} bytes`);

await visit(page, 'first');
// Wait for the worker to keep every file.
const t = Date.now();
while (Date.now() - t < 180000) {
  const kept = await page.evaluate(async (src) => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.active) return false;
    for (const name of await caches.keys()) if (await (await caches.open(name)).match(new URL(src, location.href).href)) return true;
    return false;
  }, entry.src);
  if (kept) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 3000));
// Only the worker's copy may help: the browser's own cache is emptied.
const cdp = await context.newCDPSession(page);
await cdp.send('Network.clearBrowserCache');
await visit(page, 'cached');
await page.evaluate(async (src) => {
  for (const name of await caches.keys()) await (await caches.open(name)).delete(new URL(src, location.href).href);
}, entry.src);
await cdp.send('Network.clearBrowserCache');
await visit(page, 'deploy');
// A new build whose files are all the same: its worker should fetch none of them.
const upAt = Date.now();
while (Date.now() - upAt < 60000 && !(await page.evaluate(() => window.numeriaBooted === true))) await new Promise((r) => setTimeout(r, 200));
console.log(`game up in this browser: ${await page.evaluate(() => window.numeriaBooted === true)}`);
build = 'b';
asked.length = 0;
await page.goto(`http://localhost:${PORT}/play/`, { waitUntil: 'commit' });
// A browser checks sw.js on navigation, but not again so soon after: asked here.
await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update()).catch(() => undefined);
const w = Date.now();
let waiting = false;
while (Date.now() - w < 120000 && !(waiting = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting).catch(() => false))) await new Promise((r) => setTimeout(r, 500));
const files = asked.filter((p) => !['/play/', '/play/sw.js', '/play/version.json'].includes(p) && !p.startsWith('/play/api/'));
console.log(`sw.js asked ${asked.filter((p) => p === '/play/sw.js').length} times, state`, await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { installing: r?.installing?.state, waiting: r?.waiting?.state, active: r?.active?.state, up: window.numeriaBooted }; }));
console.log(`new build worker installed: ${waiting} after ${Date.now() - w} ms, files fetched from the server meanwhile: ${files.length} (the page's own included)`);
console.log(`console errors and warnings (${problems.length}):`);
for (const p of [...new Set(problems)]) console.log(`  ${p}`);
await browser.close();
server.close();
