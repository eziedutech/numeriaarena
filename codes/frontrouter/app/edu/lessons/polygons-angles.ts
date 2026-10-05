import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, lerp } from "../ink";
import { wrap } from "../parts";

const NAMES = {
  en: ["triangle", "quadrilateral", "pentagon", "hexagon", "heptagon", "octagon"],
  id: ["segitiga", "segi empat", "segi lima", "segi enam", "segi tujuh", "segi delapan"],
};

const RAD = Math.PI / 180;

/** Text that shrinks until it fits `max`, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center", bold = true) {
  let z = size;
  while (z > 18 && g.width(s, z, bold) > max) z -= 1;
  g.text(s, x, y, z, color, align, bold);
}

/** Lines wrapped for bold text, drawn from `y` down. */
function para(g: Ink, s: string, x: number, y: number, width: number, size: number, color: string, align: CanvasTextAlign = "left") {
  wrap(g, s, width - 24, size).forEach((l, i) => g.text(l, x, y + i * (size + 8), size, color, align, true));
}

/** A shape with `n` sides: its sides drawn one by one and numbered; drag a corner to make it irregular. */
function sides(lang: Lang): Scene {
  let n = 5;
  let pts: Pt[] = [];
  let regular = true;
  let held: number | null = null;
  let changed = 0;
  let now = 0;
  const cx = 320;
  const cy = 295;
  const make = (wobble: boolean) => {
    pts = [...Array(n).keys()].map((i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / n + (wobble ? (Math.random() - 0.5) * (1.4 / n) : 0);
      const r = wobble ? 120 + Math.random() * 75 : 190;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
    regular = !wobble;
    changed = now;
  };
  make(false);
  return {
    press(id) {
      if (id === "n+") n = clamp(n + 1, 3, 8);
      if (id === "n-") n = clamp(n - 1, 3, 8);
      make(id === "odd");
    },
    down(p) {
      const i = pts.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 34);
      if (i >= 0) {
        held = i;
        return true;
      }
    },
    move(p) {
      if (held === null) return;
      pts[held] = { x: clamp(p.x, 50, 590), y: clamp(p.y, 50, 495) };
      regular = false;
    },
    up() {
      held = null;
    },
    draw(g, t) {
      now = t;
      const k = (i: number) => ease(t, changed + 0.18 * i, 0.3);
      const c = g.c;
      // The paper inside appears once every side is drawn.
      c.globalAlpha = k(n);
      c.fillStyle = "rgba(70, 50, 25, 0.18)";
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x + 4, p.y + 6) : c.moveTo(p.x + 4, p.y + 6)));
      c.fill();
      c.fillStyle = C.field;
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.fill();
      c.globalAlpha = 1;
      const mid = pts.reduce((m, p) => ({ x: m.x + p.x / n, y: m.y + p.y / n }), { x: 0, y: 0 });
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % n];
        const e = k(i);
        if (e <= 0) return;
        g.line(a.x, a.y, lerp(a.x, b.x, e), lerp(a.y, b.y, e), C.cobalt, 6);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const d = Math.hypot(mx - mid.x, my - mid.y) || 1;
        c.globalAlpha = e;
        g.text(String(i + 1), mx + ((mx - mid.x) / d) * 26, my + ((my - mid.y) / d) * 26, 24, C.cobalt, "center", true);
        c.globalAlpha = 1;
      });
      pts.forEach((p, i) => g.handle(p.x, p.y, held === i));

      const px = 620;
      const pw = 350;
      const name = NAMES[lang][n - 3];
      fit(g, name, px + pw / 2, 120, pw, 52, C.ink);
      g.text(lang === "id" ? `${n} sisi, ${n} titik sudut` : `${n} sides, ${n} corners`, px + pw / 2, 190, 28, C.cobalt, "center", true);
      g.card(px, 230, pw, 56, regular ? C.sun : C.field, 1);
      g.text(regular ? (lang === "id" ? "beraturan" : "regular") : lang === "id" ? "tidak beraturan" : "irregular", px + pw / 2, 258, 28, C.ink, "center", true);
      const about = regular
        ? lang === "id"
          ? "Semua sisinya sama panjang dan semua sudutnya sama besar."
          : "All its sides are the same length and all its angles are equal."
        : lang === "id"
          ? `Sisi dan sudutnya tidak sama semua, tetapi tetap ${name} karena sisinya ${n}.`
          : `Its sides and angles are not all the same, but it is still a ${name}: it has ${n} sides.`;
      para(g, about, px, 320, pw, 22, C.soft);
      g.text(lang === "id" ? "geser salah satu sudutnya" : "drag a corner", px + pw / 2, 470, 22, C.coral, "center", true);

      g.text(lang === "id" ? "sisi" : "sides", 130, 520, 22, C.soft, "center", true);
      g.button("n-", "−", 40, 545, 60, 52, C.cobalt, n > 3);
      g.text(String(n), 130, 571, 34, C.ink, "center", true);
      g.button("n+", "+", 160, 545, 60, 52, C.cobalt, n < 8);
      g.button("even", lang === "id" ? "BERATURAN" : "REGULAR", 470, 545, 200, 52, C.teal);
      g.button("odd", lang === "id" ? "TIDAK BERATURAN" : "IRREGULAR", 690, 545, 270, 52, C.plum);
    },
  };
}

type Kind = 0 | 1 | 2 | 3 | 4;
const kindOf = (a: number): Kind => (a < 90 ? 0 : a === 90 ? 1 : a < 180 ? 2 : a === 180 ? 3 : 4);
const KIND_COLOR = [C.teal, C.coral, C.cobalt, C.plum, "#e0a040"];
const KINDS = {
  en: ["acute angle", "right angle", "obtuse angle", "straight angle", "reflex angle"],
  id: ["sudut lancip", "sudut siku-siku", "sudut tumpul", "sudut lurus", "sudut refleks"],
};
const ABOUT = {
  en: [
    "Smaller than a right angle.",
    "Exactly a square corner, 90°. The little square marks it.",
    "Bigger than a right angle, smaller than a straight line.",
    "The two arms make one straight line, 180°.",
    "Bigger than a straight line: more than half a turn.",
  ],
  id: [
    "Lebih kecil dari sudut siku-siku.",
    "Tepat seperti pojok persegi, 90°. Kotak kecil menandainya.",
    "Lebih besar dari siku-siku, lebih kecil dari garis lurus.",
    "Kedua kakinya membentuk satu garis lurus, 180°.",
    "Lebih besar dari garis lurus: lebih dari setengah putaran.",
  ],
};

/** The mark inside an angle at vertex v from direction `from` (degrees, turning left) by `a`. */
function mark(g: Ink, v: Pt, from: number, a: number, r: number, color: string) {
  const c = g.c;
  if (a === 90) {
    const u = { x: Math.cos(from * RAD), y: -Math.sin(from * RAD) };
    const w = { x: Math.cos((from + 90) * RAD), y: -Math.sin((from + 90) * RAD) };
    const s = r * 0.6;
    c.fillStyle = color;
    c.globalAlpha = 0.35;
    c.beginPath();
    c.moveTo(v.x, v.y);
    c.lineTo(v.x + u.x * s, v.y + u.y * s);
    c.lineTo(v.x + (u.x + w.x) * s, v.y + (u.y + w.y) * s);
    c.lineTo(v.x + w.x * s, v.y + w.y * s);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.stroke();
    return;
  }
  c.fillStyle = color;
  c.globalAlpha = 0.3;
  c.beginPath();
  c.moveTo(v.x, v.y);
  c.arc(v.x, v.y, r, -from * RAD, -(from + a) * RAD, true);
  c.closePath();
  c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(v.x, v.y, r, -from * RAD, -(from + a) * RAD, true);
  c.stroke();
}

/** One arm turns around the vertex: the angle opens from acute through right and obtuse to straight and reflex. */
function turn(lang: Lang): Scene {
  let a = 50;
  let held = false;
  let anim: { from: number; to: number; start: number } | null = null;
  let now = 0;
  const v = { x: 330, y: 325 };
  const R = 185;
  const tip = () => ({ x: v.x + Math.cos(a * RAD) * R, y: v.y - Math.sin(a * RAD) * R });
  const PRESETS = [45, 90, 135, 180, 250];
  return {
    press(id) {
      anim = { from: a, to: PRESETS[Number(id)], start: now };
    },
    down(p) {
      const q = tip();
      if (Math.hypot(p.x - q.x, p.y - q.y) < 40) {
        held = true;
        anim = null;
        return true;
      }
    },
    move(p) {
      let d = Math.atan2(-(p.y - v.y), p.x - v.x) / RAD;
      if (d < 0) d += 360;
      // No jumping across the fixed arm.
      if (a > 270 && d < 90) d = 359;
      if (a < 90 && d > 270) d = 1;
      d = Math.round(d);
      for (const snap of [90, 180]) if (Math.abs(d - snap) < 4) d = snap;
      a = clamp(d, 1, 359);
    },
    up() {
      held = false;
    },
    draw(g, t) {
      now = t;
      if (anim) {
        const k = ease(t, anim.start, 0.9);
        a = Math.round(lerp(anim.from, anim.to, k));
        if (k >= 1) anim = null;
      }
      const kind = kindOf(a);
      const color = KIND_COLOR[kind];
      mark(g, v, 0, a, 62, color);
      g.line(v.x, v.y, v.x + R, v.y, C.ink, 6);
      const q = tip();
      g.line(v.x, v.y, q.x, q.y, C.ink, 6);
      g.dot(v.x, v.y, 8, C.ink);
      const half = (a / 2) * RAD;
      g.text(`${a}°`, v.x + Math.cos(half) * 100, v.y - Math.sin(half) * 100, 26, C.ink, "center", true);
      g.handle(q.x, q.y, held);
      if (t < 4 && !held) g.text(lang === "id" ? "geser tab merah" : "drag the red tab", q.x, q.y - 40, 20, C.coral, "center", true);

      const px = 610;
      const pw = 360;
      g.card(px, 90, pw, 90, color, 1);
      fit(g, KINDS[lang][kind], px + pw / 2, 135, pw - 30, 42, C.paper);
      g.text(`${a}°`, px + pw / 2, 240, 64, C.ink, "center", true);
      para(g, ABOUT[lang][kind], px, 310, pw, 24, C.soft);

      KINDS[lang].forEach((name, i) => {
        const label = name.replace(/^(sudut |angle )/u, "").replace(/ angle$/u, "").toUpperCase();
        g.button(String(i), label, 46 + i * 184, 555, 172, 52, kind === i ? KIND_COLOR[i] : C.soft);
      });
    },
  };
}

const SETS: { a: number; rot: number }[][] = [
  [
    { a: 60, rot: 5 },
    { a: 90, rot: 20 },
    { a: 125, rot: 0 },
    { a: 90, rot: -10 },
  ],
  [
    { a: 90, rot: 0 },
    { a: 80, rot: 15 },
    { a: 150, rot: -5 },
    { a: 95, rot: 25 },
  ],
  [
    { a: 110, rot: 10 },
    { a: 35, rot: 0 },
    { a: 90, rot: 30 },
    { a: 85, rot: -15 },
  ],
];

/** A paper corner laid on each angle: inside it, exactly on it, or past it. */
function tester(lang: Lang): Scene {
  let set = 0;
  let corner: Pt = { x: 450, y: 175 };
  let rot = 0;
  let on: number | null = null;
  let held: Pt | null = null;
  const tried = new Set<number>();
  const xs = [90, 340, 590, 840];
  const vy = 430;
  const S = 100;
  const centre = () => {
    const u = rot * RAD;
    return { x: corner.x + (Math.cos(u) - Math.sin(u)) * (S / 2), y: corner.y - (Math.sin(u) + Math.cos(u)) * (S / 2) };
  };
  return {
    press() {
      set = (set + 1) % SETS.length;
      tried.clear();
      corner = { x: 450, y: 175 };
      rot = 0;
      on = null;
    },
    down(p) {
      const m = centre();
      if (Math.hypot(p.x - m.x, p.y - m.y) < 70) {
        held = { x: corner.x - p.x, y: corner.y - p.y };
        return true;
      }
    },
    move(p) {
      if (!held) return;
      const free = { x: clamp(p.x + held.x, 20, 880), y: clamp(p.y + held.y, 120, 600) };
      const i = xs.findIndex((x) => Math.hypot(free.x - x, free.y - vy) < 45);
      if (i >= 0) {
        corner = { x: xs[i], y: vy };
        rot = SETS[set][i].rot;
        on = i;
      } else {
        corner = free;
        rot = 0;
        on = null;
      }
    },
    up() {
      held = null;
      if (on !== null) tried.add(on);
    },
    draw(g, t) {
      const c = g.c;
      SETS[set].forEach((s, i) => {
        const v = { x: xs[i], y: vy };
        const k = tried.has(i) || on === i ? kindOf(Math.abs(s.a - 90) <= 2 ? 90 : s.a) : null;
        if (k !== null) mark(g, v, s.rot, k === 1 ? 90 : s.a, 40, KIND_COLOR[k]);
        const r1 = s.rot * RAD;
        const r2 = (s.rot + s.a) * RAD;
        g.line(v.x, v.y, v.x + Math.cos(r1) * 120, v.y - Math.sin(r1) * 120, C.ink, 5);
        g.line(v.x, v.y, v.x + Math.cos(r2) * 120, v.y - Math.sin(r2) * 120, C.ink, 5);
        g.dot(v.x, v.y, 7, C.ink);
        if (k !== null) fit(g, KINDS[lang][k], v.x + 30, 490, 230, 24, KIND_COLOR[k]);
      });

      // The paper corner, see-through so the angle shows under it.
      const u = { x: Math.cos(rot * RAD), y: -Math.sin(rot * RAD) };
      const w = { x: -u.y, y: u.x };
      const up = { x: -w.x, y: -w.y };
      const p0 = corner;
      const p1 = { x: p0.x + u.x * S, y: p0.y + u.y * S };
      const p2 = { x: p1.x + up.x * S, y: p1.y + up.y * S };
      const p3 = { x: p0.x + up.x * S, y: p0.y + up.y * S };
      const lift = held ? 6 : 3;
      c.fillStyle = "rgba(70, 50, 25, 0.22)";
      c.beginPath();
      [p0, p1, p2, p3].forEach((p, i) => (i ? c.lineTo(p.x + lift, p.y + lift * 1.5) : c.moveTo(p.x + lift, p.y + lift * 1.5)));
      c.fill();
      c.globalAlpha = 0.72;
      c.fillStyle = C.sun;
      c.beginPath();
      [p0, p1, p2, p3].forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.fill();
      c.globalAlpha = 1;
      g.crease(p1.x, p1.y, p3.x, p3.y);
      const m = 22;
      c.strokeStyle = C.ink;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(p0.x + u.x * m, p0.y + u.y * m);
      c.lineTo(p0.x + (u.x + up.x) * m, p0.y + (u.y + up.y) * m);
      c.lineTo(p0.x + up.x * m, p0.y + up.y * m);
      c.stroke();

      const msg =
        on === null
          ? lang === "id"
            ? "geser pojok kertas ke salah satu sudut"
            : "drag the paper corner onto an angle"
          : (() => {
              const a = SETS[set][on].a;
              const k = kindOf(Math.abs(a - 90) <= 2 ? 90 : a);
              if (k === 0) return lang === "id" ? "Sudutnya lebih kecil dari pojok kertas: sudut lancip." : "The angle is smaller than the paper corner: acute.";
              if (k === 1) return lang === "id" ? "Sudutnya pas dengan pojok kertas: sudut siku-siku." : "The angle fits the paper corner exactly: a right angle.";
              return lang === "id" ? "Sudutnya lebih besar dari pojok kertas: sudut tumpul." : "The angle is bigger than the paper corner: obtuse.";
            })();
      g.card(40, 30, 920, 64, on === null ? C.field : C.paper, on === null ? 0 : 1);
      fit(g, msg, 500, 62, 890, 28, C.ink);
      g.button("next", lang === "id" ? "SUDUT LAIN" : "OTHER ANGLES", 350, 555, 300, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A polygon is named by how many sides it has. Change the number of sides, and drag a corner: the name stays the same.",
        id: "Segi banyak diberi nama menurut banyak sisinya. Ubah banyak sisinya, lalu geser satu sudut: namanya tetap sama.",
      },
      scene: sides,
    },
    {
      say: {
        en: "Turn the arm and watch the angle open: acute, right, obtuse, straight, then reflex.",
        id: "Putar kakinya dan lihat sudutnya membuka: lancip, siku-siku, tumpul, lurus, lalu refleks.",
      },
      scene: turn,
    },
    {
      say: {
        en: "The corner of a sheet of paper is a right angle. Lay it on an angle to see if the angle is smaller, the same or bigger.",
        id: "Pojok selembar kertas adalah sudut siku-siku. Letakkan pada sebuah sudut untuk melihat apakah sudutnya lebih kecil, sama, atau lebih besar.",
      },
      scene: tester,
    },
  ],
};
