import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp, pulse } from "../ink";
import { num, wrap } from "../parts";

/** The grid: origin O, the size of one step, and how many steps each axis has. */
const OX = 90;
const OY = 480;
const U = 38;
const N = 10;
/** The column on the right where pairs and words are written. */
const PX = 750;

const at = (x: number, y: number): Pt => ({ x: OX + x * U, y: OY - y * U });
const snap = (p: Pt) => ({ x: clamp(Math.round((p.x - OX) / U), 0, N), y: clamp(Math.round((OY - p.y) / U), 0, N) });
const onGrid = (p: Pt) => p.x > OX - 30 && p.x < OX + N * U + 30 && p.y > OY - N * U - 30 && p.y < OY + 30;

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** Coloured pieces in one line centred on x, shrunk together to fit. */
function pieces(g: Ink, parts: [string, string][], x: number, y: number, max: number, size: number) {
  let k = size;
  while (k > 18 && g.width(parts.map((p) => p[0]).join(""), k, true) > max) k -= 1;
  const ws = parts.map(([s]) => g.width(s, k, true));
  let a = x - ws.reduce((m, n) => m + n, 0) / 2;
  parts.forEach(([s, color], i) => {
    g.text(s, a, y, k, color, "left", true);
    a += ws[i];
  });
}

/** The pair (x, y) with x in blue and y in red. */
function pair(lang: Lang, x: number, y: number): [string, string][] {
  return [
    ["(", C.ink],
    [num(lang, x), C.cobalt],
    [", ", C.ink],
    [num(lang, y), C.coral],
    [")", C.ink],
  ];
}

function arrowHead(g: Ink, x: number, y: number, ang: number, color: string) {
  g.line(x, y, x - 14 * Math.cos(ang - 0.5), y - 14 * Math.sin(ang - 0.5), color, 3);
  g.line(x, y, x - 14 * Math.cos(ang + 0.5), y - 14 * Math.sin(ang + 0.5), color, 3);
}

/** The first quadrant: the grid, both axes with their numbers and names, and O; the numbers at `hx` and `hy` stand out. */
function plane(g: Ink, lang: Lang, hx = -1, hy = -1) {
  for (let i = 0; i <= N; i++) {
    g.line(OX + i * U, OY, OX + i * U, OY - N * U, "rgba(58, 63, 75, 0.12)", 1);
    g.line(OX, OY - i * U, OX + N * U, OY - i * U, "rgba(58, 63, 75, 0.12)", 1);
  }
  g.line(OX, OY, OX + N * U + 24, OY, C.ink, 3);
  arrowHead(g, OX + N * U + 24, OY, 0, C.ink);
  g.line(OX, OY, OX, OY - N * U - 24, C.ink, 3);
  arrowHead(g, OX, OY - N * U - 24, -Math.PI / 2, C.ink);
  for (let i = 1; i <= N; i++) {
    g.text(num(lang, i), OX + i * U, OY + 18, i === hx ? 22 : 18, i === hx ? C.cobalt : C.soft, "center", i === hx);
    g.text(num(lang, i), OX - 12, OY - i * U, i === hy ? 22 : 18, i === hy ? C.coral : C.soft, "right", i === hy);
  }
  g.text("O", OX - 12, OY + 18, 20, C.ink, "center", true);
  g.text("x", OX + N * U + 40, OY, 26, C.cobalt, "center", true);
  g.text(lang === "id" ? "sumbu-x" : "x-axis", OX + N * U + 40, OY + 26, 18, C.cobalt, "center", true);
  g.text("y", OX, OY - N * U - 42, 26, C.coral, "center", true);
  g.text(lang === "id" ? "sumbu-y" : "y-axis", OX + 18, OY - N * U - 42, 18, C.coral, "left", true);
}

/** Dashed lines from a point down to the x-axis and across to the y-axis. */
function guides(g: Ink, x: number, y: number, alpha = 1) {
  const p = at(x, y);
  g.c.globalAlpha = alpha;
  g.c.setLineDash([8, 6]);
  g.line(p.x, p.y, p.x, OY, C.cobalt, 3);
  g.line(p.x, p.y, OX, p.y, C.coral, 3);
  g.c.setLineDash([]);
  g.dot(p.x, OY, 6, C.cobalt);
  g.dot(OX, p.y, 6, C.coral);
  g.c.globalAlpha = 1;
}

/** A small walker standing with its feet at (x, y); its legs swing while it walks. */
function walker(g: Ink, x: number, y: number, t: number, moving: boolean) {
  const sw = moving ? Math.sin(t * 14) * 6 : 0;
  g.c.lineCap = "round";
  g.line(x, y - 16, x - 6 + sw, y - 2, C.ink, 4);
  g.line(x, y - 16, x + 6 - sw, y - 2, C.ink, 4);
  g.line(x, y - 20, x, y - 36, C.plum, 11);
  g.line(x, y - 32, x + 9 + sw / 2, y - 22, C.plum, 4);
  g.line(x, y - 32, x - 9 - sw / 2, y - 22, C.plum, 4);
  g.c.lineCap = "butt";
  g.dot(x, y - 46, 9, C.sun);
  g.dot(x - 3, y - 47, 1.6, C.ink);
  g.dot(x + 3, y - 47, 1.6, C.ink);
}

/** A point dragged over the grid snaps to the crossings; its pair and the dashed lines to the axes follow it. */
function point(lang: Lang): Scene {
  let q = { x: 3, y: 5 };
  let sx = 3;
  let sy = 5;
  let held = false;
  let touched = false;
  let last = 0;
  return {
    down(p) {
      if (!onGrid(p)) return;
      held = true;
      touched = true;
      q = snap(p);
      return true;
    },
    move(p) {
      q = snap(p);
    },
    up() {
      held = false;
    },
    press() {
      let x = q.x;
      let y = q.y;
      while (x === q.x && y === q.y) {
        x = 1 + Math.floor(Math.random() * (N - 1));
        y = 1 + Math.floor(Math.random() * (N - 1));
      }
      q = { x, y };
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      const k = 1 - Math.exp(-dt * 14);
      sx += (q.x - sx) * k;
      sy += (q.y - sy) * k;
      plane(g, lang, q.x, q.y);
      const p = { x: OX + sx * U, y: OY - sy * U };
      g.c.globalAlpha = 1;
      g.c.setLineDash([8, 6]);
      g.line(p.x, p.y, p.x, OY, C.cobalt, 3);
      g.line(p.x, p.y, OX, p.y, C.coral, 3);
      g.c.setLineDash([]);
      g.dot(p.x, OY, 6, C.cobalt);
      g.dot(OX, p.y, 6, C.coral);
      g.handle(p.x, p.y, held);
      const lx = q.x > 7 ? p.x - 34 : p.x + 34;
      const ly = q.y > 8 ? p.y + 30 : p.y - 30;
      g.card(lx - 42, ly - 18, 84, 36, C.paper, 1);
      pieces(g, pair(lang, q.x, q.y), lx, ly, 80, 22);
      if (!touched) g.text(lang === "id" ? "geser titiknya" : "drag the point", OX + (N * U) / 2, 528, 22, C.coral, "center", true);

      const id = lang === "id";
      pieces(g, pair(lang, q.x, q.y), PX, 100, 380, 72);
      g.text(`x = ${num(lang, q.x)}`, PX, 190, 32, C.cobalt, "center", true);
      fit(g, id ? `${num(lang, q.x)} langkah ke kanan dari O` : `${num(lang, q.x)} steps to the right of O`, PX, 228, 380, 22, C.soft);
      g.text(`y = ${num(lang, q.y)}`, PX, 290, 32, C.coral, "center", true);
      fit(g, id ? `${num(lang, q.y)} langkah ke atas` : `${num(lang, q.y)} steps up`, PX, 328, 380, 22, C.soft);
      g.card(PX - 190, 380, 380, 90, C.field, 0);
      const note = id ? "Pasangan berurutan: tulis x dulu, baru y." : "An ordered pair: write x first, then y.";
      wrap(g, note, 340, 24).forEach((l, i, all) => g.text(l, PX, 425 + (i - (all.length - 1) / 2) * 32, 24, C.ink, "center", true));
      g.button("other", id ? "TITIK LAIN" : "ANOTHER POINT", W - 330, 555, 290, 52, C.cobalt);
    },
  };
}

/** A walker goes from O along the corridor, x steps to the right, then up the stairs, y steps up. */
function walk(lang: Lang): Scene {
  let x = 4;
  let y = 3;
  let start = 0.6;
  let now = 0;
  const SPEED = 2.5;
  return {
    press(id) {
      if (id === "x+") x = clamp(x + 1, 0, N);
      if (id === "x-") x = clamp(x - 1, 0, N);
      if (id === "y+") y = clamp(y + 1, 0, N);
      if (id === "y-") y = clamp(y - 1, 0, N);
      start = now + 0.2;
    },
    draw(g, t) {
      now = t;
      const d = clamp((t - start) * SPEED, 0, x + y);
      const done = d >= x + y;
      plane(g, lang, done ? x : -1, done ? y : -1);
      // The corridor along the x-axis and the stairs going up at x.
      g.c.fillStyle = "rgba(224, 199, 128, 0.35)";
      g.c.fillRect(OX, OY - 10, x * U, 20);
      for (let k = 1; k <= y; k++) {
        const p = at(x, k);
        g.line(p.x - 14, p.y, p.x + 14, p.y, C.sand, 5);
      }
      if (y > 0) {
        g.line(at(x, 0).x - 14, OY, at(x, y).x - 14, at(x, y).y, "rgba(224, 199, 128, 0.8)", 2);
        g.line(at(x, 0).x + 14, OY, at(x, y).x + 14, at(x, y).y, "rgba(224, 199, 128, 0.8)", 2);
      }
      g.c.lineCap = "round";
      const along = Math.min(d, x);
      if (along > 0) g.line(OX, OY, OX + along * U, OY, C.cobalt, 7);
      if (d > x) g.line(OX + x * U, OY, OX + x * U, OY - (d - x) * U, C.coral, 7);
      g.c.lineCap = "butt";
      for (let k = 1; k <= Math.floor(along); k++) g.text(num(lang, k), OX + k * U, OY - 24, 18, C.cobalt, "center", true);
      for (let k = 1; k <= Math.floor(d - x); k++) g.text(num(lang, k), OX + x * U + 26, OY - k * U, 18, C.coral, "left", true);
      const target = at(x, y);
      g.dot(target.x, target.y, 9 + 3 * pulse(t), done ? C.coral : "rgba(242, 113, 107, 0.4)");
      const w = d <= x ? at(d, 0) : at(x, d - x);
      walker(g, w.x, w.y, t, d > 0 && !done);
      if (done) {
        g.card(target.x + (x > 7 ? -110 : 22), target.y - 54, 88, 34, C.paper, 1);
        pieces(g, pair(lang, x, y), target.x + (x > 7 ? -66 : 66), target.y - 37, 84, 22);
      }

      const id = lang === "id";
      pieces(g, pair(lang, x, y), PX, 95, 380, 64);
      const first = id ? `1. jalan di lorong: ${num(lang, x)} langkah ke kanan` : `1. along the corridor: ${num(lang, x)} steps right`;
      const second = id ? `2. naik tangga: ${num(lang, y)} langkah ke atas` : `2. up the stairs: ${num(lang, y)} steps up`;
      fit(g, first, PX, 170, 400, 24, d > 0 && d <= x ? C.cobalt : C.soft);
      fit(g, second, PX, 215, 400, 24, d > x && !done ? C.coral : C.soft);
      const row = (label: string, value: number, key: string, yy: number, color: string) => {
        g.text(label, 590, yy + 26, 30, color, "center", true);
        g.button(`${key}-`, "−", 640, yy, 70, 52, color, value > 0);
        g.text(num(lang, value), 760, yy + 26, 34, C.ink, "center", true);
        g.button(`${key}+`, "+", 810, yy, 70, 52, color, value < N);
      };
      row("x", x, "x", 280, C.cobalt);
      row("y", y, "y", 360, C.coral);
      fit(g, id ? "Mulai dari O, ke kanan dulu, baru ke atas." : "Start at O, go right first, then up.", PX, 460, 400, 22, C.soft);
      g.button("go", id ? "JALAN LAGI" : "WALK AGAIN", W - 330, 555, 290, 52, C.teal);
    },
  };
}

const SHAPES: { en: string; id: string; pts: [number, number][] }[] = [
  { en: "a house", id: "rumah", pts: [[2, 1], [8, 1], [8, 5], [5, 8], [2, 5]] },
  { en: "a kite", id: "layang-layang", pts: [[5, 1], [8, 6], [5, 9], [2, 6]] },
  { en: "a triangle", id: "segitiga", pts: [[1, 1], [9, 1], [5, 8]] },
  { en: "a rectangle", id: "persegi panjang", pts: [[2, 2], [8, 2], [8, 6], [2, 6]] },
];
const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Points are plotted one by one and joined in order into a shape; any point can then be dragged to a new place. */
function shapes(lang: Lang): Scene {
  let pick = 0;
  let pts = SHAPES[0].pts.map((p): [number, number] => [p[0], p[1]]);
  let start = 0.5;
  let now = 0;
  let held = -1;
  let changed = false;
  const PLOT = 0.8;
  const JOIN = 0.35;
  const ready = () => now > start + pts.length * (PLOT + JOIN);
  return {
    press(id) {
      if (id === "next") {
        pick = (pick + 1) % SHAPES.length;
        pts = SHAPES[pick].pts.map((p): [number, number] => [p[0], p[1]]);
        changed = false;
      }
      start = now + 0.2;
    },
    down(p) {
      if (!ready()) return;
      const i = pts.findIndex(([x, y]) => Math.hypot(at(x, y).x - p.x, at(x, y).y - p.y) < 28);
      if (i < 0) return;
      held = i;
      return true;
    },
    move(p) {
      if (held < 0) return;
      const s = snap(p);
      if (s.x !== pts[held][0] || s.y !== pts[held][1]) {
        pts[held] = [s.x, s.y];
        changed = true;
      }
    },
    up() {
      held = -1;
    },
    draw(g, t) {
      now = t;
      const n = pts.length;
      plane(g, lang, held >= 0 ? pts[held][0] : -1, held >= 0 ? pts[held][1] : -1);
      const joinAt = start + n * PLOT;
      const all = ease(t, joinAt + n * JOIN, 0.5);
      if (all > 0) {
        g.c.fillStyle = `rgba(63, 182, 160, ${0.25 * all})`;
        g.c.beginPath();
        pts.forEach(([x, y], i) => (i ? g.c.lineTo(at(x, y).x, at(x, y).y) : g.c.moveTo(at(x, y).x, at(x, y).y)));
        g.c.closePath();
        g.c.fill();
      }
      g.c.lineCap = "round";
      pts.forEach(([x, y], i) => {
        const k = ease(t, joinAt + i * JOIN, JOIN);
        if (k <= 0) return;
        const a = at(x, y);
        const b = at(pts[(i + 1) % n][0], pts[(i + 1) % n][1]);
        g.line(a.x, a.y, lerp(a.x, b.x, k), lerp(a.y, b.y, k), C.cobalt, 5);
      });
      g.c.lineCap = "butt";
      const cx = pts.reduce((m, p) => m + p[0], 0) / n;
      const cy = pts.reduce((m, p) => m + p[1], 0) / n;
      pts.forEach(([x, y], i) => {
        const k = ease(t, start + i * PLOT, 0.4);
        if (k <= 0) return;
        const plotting = t < start + (i + 1) * PLOT;
        if (plotting || held === i) guides(g, x, y, plotting ? 1 - ease(t, start + (i + 0.6) * PLOT, 0.2) : 1);
        const a = at(x, y);
        const near = ready() && g.over(a.x - 20, a.y - 20, 40, 40);
        if (ready()) g.handle(a.x, a.y, held === i || near);
        else g.dot(a.x, a.y, 9 * k, C.coral);
        const dx = x - cx;
        const dy = cy - y;
        const len = Math.hypot(dx, dy) || 1;
        g.c.globalAlpha = k;
        g.text(LETTERS[i], a.x + (dx / len) * 30, a.y + (dy / len) * 30, 24, C.plum, "center", true);
        g.c.globalAlpha = 1;
      });
      if (ready() && !changed && held < 0) g.text(lang === "id" ? "geser sebuah titik" : "drag a point", OX + (N * U) / 2, 528, 22, C.coral, "center", true);

      const id = lang === "id";
      const name = changed ? (id ? "bentukmu sendiri" : "your own shape") : SHAPES[pick][lang];
      fit(g, name, PX, 90, 380, 40, C.ink);
      pts.forEach(([x, y], i) => {
        const k = ease(t, start + i * PLOT, 0.4);
        if (k <= 0) return;
        const yy = 160 + i * 52;
        g.c.globalAlpha = k;
        g.card(PX - 130, yy - 22, 260, 44, held === i ? C.sun : i % 2 ? C.paper : "#f8efdc", 1);
        g.text(LETTERS[i], PX - 70, yy, 28, C.plum, "center", true);
        pieces(g, pair(lang, x, y), PX + 30, yy, 150, 28);
        g.c.globalAlpha = 1;
      });
      g.button("again", id ? "GAMBAR LAGI" : "DRAW AGAIN", 560, 555, 180, 52, C.teal);
      g.button("next", id ? "BENTUK LAIN" : "NEXT SHAPE", 760, 555, 200, 52, C.cobalt);
    },
  };
}

type Kind = "home" | "school" | "park" | "market" | "library";
const PLACES: { kind: Kind; x: number; y: number; en: string; id: string; enSay: string; idSay: string }[] = [
  { kind: "home", x: 2, y: 1, en: "HOME", id: "RUMAH", enSay: "Home", idSay: "Rumah" },
  { kind: "school", x: 7, y: 6, en: "SCHOOL", id: "SEKOLAH", enSay: "The school", idSay: "Sekolah" },
  { kind: "park", x: 3, y: 7, en: "PARK", id: "TAMAN", enSay: "The park", idSay: "Taman" },
  { kind: "market", x: 8, y: 2, en: "MARKET", id: "PASAR", enSay: "The market", idSay: "Pasar" },
  { kind: "library", x: 5, y: 9, en: "LIBRARY", id: "PERPUSTAKAAN", enSay: "The library", idSay: "Perpustakaan" },
];

/** A small drawing of a place on the map, centred at (x, y). */
function icon(g: Ink, kind: Kind, x: number, y: number) {
  const c = g.c;
  if (kind === "home") {
    g.card(x - 13, y - 6, 26, 20, C.coral, 0.6);
    c.fillStyle = C.cobalt;
    c.beginPath();
    c.moveTo(x - 17, y - 6);
    c.lineTo(x, y - 20);
    c.lineTo(x + 17, y - 6);
    c.closePath();
    c.fill();
    c.fillStyle = C.paper;
    c.fillRect(x - 4, y + 3, 8, 11);
  }
  if (kind === "school") {
    g.card(x - 18, y - 8, 36, 22, C.sun, 0.6);
    c.fillStyle = C.ink;
    for (const dx of [-12, 6]) c.fillRect(x + dx, y - 3, 6, 6);
    c.fillRect(x - 3, y + 4, 6, 10);
    g.line(x, y - 8, x, y - 26, C.ink, 2);
    c.fillStyle = C.coral;
    c.fillRect(x + 1, y - 26, 12, 4);
    c.fillStyle = C.paper;
    c.fillRect(x + 1, y - 22, 12, 4);
  }
  if (kind === "park") {
    c.fillStyle = C.ink;
    c.fillRect(x - 2, y, 4, 14);
    g.dot(x, y - 6, 13, C.teal);
    g.dot(x - 6, y - 10, 6, "#5cc4b0");
  }
  if (kind === "market") {
    g.card(x - 16, y - 4, 32, 18, C.paper, 0.6);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? C.paper : C.coral;
      c.fillRect(x - 18 + i * 9, y - 14, 9, 10);
    }
    c.fillStyle = C.sun;
    c.fillRect(x - 10, y + 4, 20, 6);
  }
  if (kind === "library") {
    g.card(x - 15, y - 12, 14, 24, C.plum, 0.6);
    g.card(x + 1, y - 12, 14, 24, C.plum, 0.6);
    g.line(x - 11, y - 5, x - 5, y - 5, C.paper, 2);
    g.line(x + 5, y - 5, x + 11, y - 5, C.paper, 2);
  }
}

/** A little map on the grid: choosing a place sends the walker from O to it, right first, then up. */
function map(lang: Lang): Scene {
  let goal = 1;
  let start = 0.6;
  let now = 0;
  const SPEED = 3.5;
  return {
    press(id) {
      goal = Number(id.slice(1));
      start = now + 0.15;
    },
    draw(g, t) {
      now = t;
      // Two roads drawn under the grid, as on a town map.
      g.c.fillStyle = C.field;
      g.c.fillRect(OX, OY - 4 * U - 9, N * U, 18);
      g.c.fillRect(OX + 6 * U - 9, OY - N * U, 18, N * U);
      g.c.setLineDash([10, 10]);
      g.line(OX, OY - 4 * U, OX + N * U, OY - 4 * U, C.paper, 2);
      g.line(OX + 6 * U, OY, OX + 6 * U, OY - N * U, C.paper, 2);
      g.c.setLineDash([]);
      const place = PLACES[goal];
      const d = clamp((t - start) * SPEED, 0, place.x + place.y);
      const done = d >= place.x + place.y;
      plane(g, lang, done ? place.x : -1, done ? place.y : -1);
      g.c.lineCap = "round";
      const along = Math.min(d, place.x);
      if (along > 0) g.line(OX, OY, OX + along * U, OY, C.cobalt, 6);
      if (d > place.x) g.line(OX + place.x * U, OY, OX + place.x * U, OY - (d - place.x) * U, C.coral, 6);
      g.c.lineCap = "butt";
      PLACES.forEach((pl, i) => {
        const p = at(pl.x, pl.y);
        if (i === goal) g.dot(p.x, p.y, 24 + 3 * pulse(t), "rgba(255, 209, 102, 0.7)");
        icon(g, pl.kind, p.x, p.y);
      });
      if (done) guides(g, place.x, place.y, 0.8);
      const w = d <= place.x ? at(d, 0) : at(place.x, d - place.x);
      walker(g, w.x + (done ? 22 : 0), w.y + (done ? 14 : 0), t, d > 0 && !done);

      const id = lang === "id";
      PLACES.forEach((pl, i) => {
        const y = 80 + i * 66;
        g.button(`p${i}`, id ? pl.id : pl.en, 560, y, 270, 52, i === goal ? C.coral : C.cobalt);
        pieces(g, pair(lang, pl.x, pl.y), 900, y + 26, 110, 26);
      });
      if (done) {
        const said = id
          ? `${place.idSay} ada di (${num(lang, place.x)}, ${num(lang, place.y)}): ${num(lang, place.x)} ke kanan, lalu ${num(lang, place.y)} ke atas.`
          : `${place.enSay} is at (${num(lang, place.x)}, ${num(lang, place.y)}): ${num(lang, place.x)} to the right, then ${num(lang, place.y)} up.`;
        g.c.globalAlpha = ease(t, start + (place.x + place.y) / SPEED, 0.4);
        wrap(g, said, 380, 22).forEach((l, i) => g.text(l, PX, 440 + i * 30, 22, C.ink, "center", true));
        g.c.globalAlpha = 1;
      }
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "The x-axis goes across and the y-axis goes up. Drag the point: its pair (x, y) tells how far right and how far up it is.",
        id: "Sumbu-x mendatar dan sumbu-y tegak. Geser titiknya: pasangan (x, y) menunjukkan seberapa jauh ke kanan dan ke atas.",
      },
      scene: point,
    },
    {
      say: {
        en: "To reach a point from O, walk along the corridor first, then climb the stairs: x steps right, then y steps up.",
        id: "Untuk sampai ke sebuah titik dari O, jalan dulu di lorong, lalu naik tangga: x langkah ke kanan, kemudian y langkah ke atas.",
      },
      scene: walk,
    },
    {
      say: {
        en: "Plot the points one by one and join them in order to draw a shape. Drag a point to change the shape.",
        id: "Gambar titik-titiknya satu per satu, lalu hubungkan berurutan menjadi sebuah bangun. Geser sebuah titik untuk mengubah bangunnya.",
      },
      scene: shapes,
    },
    {
      say: {
        en: "On a map every place has its own coordinates. Pick a place and follow the way there from O.",
        id: "Pada denah, setiap tempat punya koordinatnya sendiri. Pilih sebuah tempat, lalu ikuti jalan ke sana dari O.",
      },
      scene: map,
    },
  ],
};
