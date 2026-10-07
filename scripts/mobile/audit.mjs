// Checks the site (codes/frontrouter) on phone, tablet and laptop widths
// without screenshots: for every page it lists what sticks out sideways
// (wider than the screen and not inside something that scrolls sideways)
// and the buttons and links too small for a finger. /manage is checked as
// the sample teacher (TRY THE TEACHER PAGE), so the backend must run too.
//
//   node scripts/mobile/audit.mjs [base url, default http://localhost:3320] [widths, default 360,390,768,1366]
//
// Run from the repository root.

import { chromium } from '../../codes/xrclient/node_modules/playwright/index.mjs';

const BASE = process.argv[2] ?? 'http://localhost:3320';
const WIDTHS = (process.argv[3] ?? '360,390,768,1366').split(',').map(Number);
const HEIGHT = { 360: 800, 390: 844, 768: 1024, 1366: 768 };
const PUBLIC = ['/about', '/how-to-play', '/privacy', '/terms', '/data-deletion', '/credits', '/edu', '/manage', '/screen'];

/** Runs in the page: what sticks out, and what is too small to tap. */
function inspect() {
  const vw = document.documentElement.clientWidth;
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    if (typeof el.className === 'string' && el.className.trim()) s += `.${el.className.trim().split(/\s+/).join('.')}`;
    return s;
  };
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) parts.unshift(name(e));
    return parts.join(' > ');
  };
  const clipped = (el) => {
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const o = getComputedStyle(e).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
    }
    return false;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
      // Only the outermost: a child of something already listed is the same problem.
      if (out.some((o) => o.el.contains(el))) continue;
      out.push({ el, text: `${path(el)} [${Math.round(r.left)}..${Math.round(r.right)} of ${vw}] "${(el.textContent ?? '').trim().slice(0, 40)}"` });
    }
  }
  const small = [];
  for (const el of document.body.querySelectorAll('a, button, input, select, [role=button], summary')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    // Links inside running text are fine; standalone ones and buttons want room for a finger.
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
    if (el.closest("label")) continue;
    if (r.height < 32 || r.width < 32) small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 24)}"`);
  }
  const tables = [...document.querySelectorAll('table')].filter(visible).map((t) => {
    const r = t.getBoundingClientRect();
    return r.width > vw ? `${name(t)} ${Math.round(r.width)} wide, scrolls: ${clipped(t)}` : null;
  }).filter(Boolean);
  return { wideCard: !!document.querySelector(".wide-only"), overflow: document.documentElement.scrollWidth - vw, sticks: out.map((o) => o.text), small, tables };
}

function report(width, page, r) {
  const bad = r.overflow > 0 || r.sticks.length > 0;
  console.log(`${bad ? 'XX' : 'ok'} ${String(width).padStart(4)} ${page}  page wider by ${r.overflow}px, sticking out ${r.sticks.length}, small taps ${r.small.length}${r.wideCard ? ", WIDE SCREEN CARD" : ""}`);
  for (const s of r.sticks.slice(0, 8)) console.log(`        out   ${s}`);
  for (const t of r.tables) console.log(`        table ${t}`);
  if (width < 768) for (const s of [...new Set(r.small)].slice(0, 6)) console.log(`        small ${s}`);
}

const browser = await chromium.launch();
for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT[width] ?? 900 }, hasTouch: width < 1024, isMobile: width < 768 });
  const page = await context.newPage();
  for (const path of PUBLIC) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    report(width, path, await page.evaluate(inspect));
  }
  // A lesson page, the first one listed.
  const lesson = await page.goto(`${BASE}/edu`, { waitUntil: 'networkidle' }).then(() => page.$$eval('a[href^="/edu/"]', (as) => as[0]?.getAttribute('href')));
  if (lesson) {
    await page.goto(BASE + lesson, { waitUntil: 'networkidle' });
    report(width, lesson, await page.evaluate(inspect));
  }
  // The sample teacher, made once per width.
  await page.goto(`${BASE}/manage`, { waitUntil: 'networkidle' });
  const sample = page.getByRole('button', { name: /TRY THE TEACHER PAGE|COBA HALAMAN GURU/ });
  if (await sample.count()) {
    await sample.click();
    await page.waitForSelector('a[href*="/manage/class/"]', { timeout: 30000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle');
    report(width, '/manage (teacher)', await page.evaluate(inspect));
    const classes = await page.$$eval('a[href*="/manage/class/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
    let rooms = [];
    if (await page.locator('#tab-rooms').count()) {
      await page.locator('#tab-rooms').click();
      await page.waitForLoadState('networkidle');
      report(width, '/manage (teacher) rooms', await page.evaluate(inspect));
      rooms = await page.$$eval('a[href*="/manage/room/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
    }
    for (const c of classes.slice(0, 1)) {
      await page.goto(BASE + c, { waitUntil: 'networkidle' });
      const tabs = await page.$$eval('main [role=tab]', (bs) => bs.map((b) => b.textContent.trim()));
      for (const tab of tabs) {
        await page.locator('main [role=tab]', { hasText: tab }).first().click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);
        report(width, `${c} ${tab}`, await page.evaluate(inspect));
      }
      // The sample has no rooms: open one for this class, which lands on its page.
      if (!rooms.length) {
        await page.goto(BASE + c, { waitUntil: 'networkidle' });
        const race = page.getByRole('button', { name: /NEW RACE ROOM FOR THIS CLASS/ });
        if (await race.count()) {
          await race.first().click();
          await page.waitForURL(/\/manage\/room\//, { timeout: 15000 }).catch(() => undefined);
          const at = new URL(page.url()).pathname;
          if (at.includes('/manage/room/')) rooms = [at];
        }
      }
      for (const room of rooms.slice(0, 1)) {
        await page.goto(BASE + room, { waitUntil: 'networkidle' });
        const roomTabs = await page.$$eval('main [role=tab]', (bs) => bs.map((b) => b.textContent.trim()));
        for (const tab of roomTabs) {
          await page.locator('main [role=tab]', { hasText: tab }).first().click();
          await page.waitForLoadState('networkidle');
          report(width, `${room} ${tab}`, await page.evaluate(inspect));
        }
      }
    }
  } else {
    console.log(`   ${width} no sample button on /manage`);
  }
  await context.close();
}
await browser.close();
