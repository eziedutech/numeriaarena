import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, lerp, pulse } from "../ink";
import { dec, wrap } from "../parts";

const RAD = Math.PI / 180;
const COLORS = [C.coral, C.teal, C.cobalt];

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** Lines wrapped and centred on x, drawn from `y` down. */
function para(g: Ink, s: string, x: number, y: number, width: number, size: number, color: string) {
  wrap(g, s, width - 24, size).forEach((l, i) => g.text(l, x, y + i * (size + 8), size, color, "center", true));
}

/** The direction from a to b in degrees, turning left from the right as on paper. */
const dir = (a: Pt, b: Pt) => Math.atan2(-(b.y - a.y), b.x - a.x) / RAD;

/** The corner at v between the sides to p and q: where it starts (degrees) and how wide it is. */
function corner(v: Pt, p: Pt, q: Pt) {
  const a1 = dir(v, p);
  const a2 = dir(v, q);
  const d = (((a2 - a1) % 360) + 360) % 360;
  return d <= 180 ? { from: a1, size: d } : { from: a2, size: 360 - d };
}

/** The three angles of a triangle in degrees, whole numbers that add to exactly 180. */
function angles(p: Pt[]) {
  const raw = p.map((v, i) => corner(v, p[(i + 1) % 3], p[(i + 2) % 3]).size);
  const r = raw.map((a) => Math.floor(a));
  const order = raw.map((a, i) => [a - Math.floor(a), i]).sort((x, y) => y[0] - x[0]);
  let left = 180 - r.reduce((a, b) => a + b, 0);
  for (const [, i] of order) if (left-- > 0) r[i] += 1;
  return r;
}

/** A paper wedge at c from `from` degrees, `size` wide. */
function wedge(g: Ink, c: Pt, r: number, from: number, size: number, color: string, lift = 0) {
  const k = g.c;
  if (lift > 0) {
    k.fillStyle = `rgba(70, 50, 25, ${0.2 * lift})`;
    k.beginPath();
    k.moveTo(c.x + 3 * lift, c.y + 5 * lift);
    k.arc(c.x + 3 * lift, c.y + 5 * lift, r, -from * RAD, -(from + size) * RAD, true);
    k.closePath();
    k.fill();
  }
  k.fillStyle = color;
  k.beginPath();
  k.moveTo(c.x, c.y);
  k.arc(c.x, c.y, r, -from * RAD, -(from + size) * RAD, true);
  k.closePath();
  k.fill();
}

function shape(g: Ink, p: Pt[], color: string, lift = 1) {
  const c = g.c;
  c.fillStyle = `rgba(70, 50, 25, ${0.2 * lift})`;
  c.beginPath();
  p.forEach((q, i) => (i ? c.lineTo(q.x + 4, q.y + 6) : c.moveTo(q.x + 4, q.y + 6)));
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  p.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
  c.closePath();
  c.fill();
  c.strokeStyle = C.ink;
  c.lineWidth = 4;
  c.stroke();
}

/** A label for each angle, just inside its corner. */
function labels(g: Ink, p: Pt[], a: number[], dist = 58) {
  p.forEach((v, i) => {
    const k = corner(v, p[(i + 1) % 3], p[(i + 2) % 3]);
    const m = (k.from + k.size / 2) * RAD;
    const d = k.size < 40 ? dist + 26 : dist;
    g.text(`${a[i]}°`, v.x + Math.cos(m) * d, v.y - Math.sin(m) * d, 24, C.ink, "center", true);
  });
}

/** A random triangle whose angles are all at least 30°, in the top of the sheet. */
function randomTriangle(): Pt[] {
  for (;;) {
    const p = [
      { x: 130 + Math.random() * 200, y: 290 + Math.random() * 40 },
      { x: 620 + Math.random() * 240, y: 270 + Math.random() * 60 },
      { x: 300 + Math.random() * 400, y: 70 + Math.random() * 40 },
    ];
    if (angles(p).every((a) => a >= 30)) return p;
  }
}

/** Tear the three corners off a paper triangle and lay them side by side: they make a straight line. */
function tear(lang: Lang): Scene {
  let tri: Pt[] = [
    { x: 200, y: 310 },
    { x: 760, y: 310 },
    { x: 430, y: 80 },
  ];
  let torn = false;
  let at = -10;
  let now = 0;
  const R = 62;
  const meet = { x: 320, y: 470 };
  return {
    press(id) {
      if (id === "tear" && !torn) {
        torn = true;
        at = now;
      }
      if (id === "back" && torn) {
        torn = false;
        at = now;
      }
      if (id === "new") {
        tri = randomTriangle();
        torn = false;
        at = -10;
      }
    },
    draw(g, t) {
      now = t;
      const a = angles(tri);
      const cs = tri.map((v, i) => corner(v, tri[(i + 1) % 3], tri[(i + 2) % 3]));
      // Laid on the line: the first corner on the left, the next beside it, the last on the right.
      const sizes = cs.map((c) => c.size);
      const goal = [180 - sizes[0], 180 - sizes[0] - sizes[1], 0];
      g.line(80, meet.y, 560, meet.y, C.ink, 4);
      g.dot(meet.x, meet.y, 6, C.ink);
      shape(g, tri, C.paper, 1);
      // Where the corners came from shows as paler paper.
      cs.forEach((c, i) => wedge(g, tri[i], R, c.from, c.size, torn || t - at < 1.6 ? C.field : COLORS[i]));
      if (!torn) labels(g, tri, a, 84);
      cs.forEach((c, i) => {
        const k = torn ? ease(t, at + i * 0.45, 1.1) : 1 - ease(t, at, 0.8);
        if (k <= 0) return;
        const p = { x: lerp(tri[i].x, meet.x, k), y: lerp(tri[i].y, meet.y, k) - Math.sin(Math.PI * k) * 60 };
        // Turn the short way round.
        const spin = ((((goal[i] - c.from) % 360) + 540) % 360) - 180;
        wedge(g, p, R, c.from + spin * k, c.size, COLORS[i], 0.6 + Math.sin(Math.PI * k));
        if (k >= 1) {
          const m = (goal[i] + c.size / 2) * RAD;
          g.text(`${a[i]}°`, meet.x + Math.cos(m) * (R + 26), meet.y - Math.sin(m) * (R + 26), 22, COLORS[i], "center", true);
        }
      });
      const done = torn ? ease(t, at + 2.2, 0.5) : 0;
      g.c.globalAlpha = done;
      fit(g, `${a[0]}° + ${a[1]}° + ${a[2]}° = 180°`, 780, 420, 380, 34, C.ink);
      fit(g, lang === "id" ? "sudut lurus = 180°" : "a straight angle = 180°", 780, 470, 380, 24, C.soft);
      g.c.globalAlpha = 1;
      const id = lang === "id";
      g.button("tear", id ? "SOBEK SUDUTNYA" : "TEAR THE CORNERS", 40, 545, 290, 52, C.coral, !torn);
      g.button("back", id ? "KEMBALIKAN" : "PUT BACK", 350, 545, 220, 52, C.soft, torn);
      g.button("new", id ? "SEGITIGA LAIN" : "ANOTHER TRIANGLE", 690, 545, 270, 52, C.cobalt);
    },
  };
}

/** A triangle with three corners to drag: its angles change, and a half circle of the three always closes. */
function drag(lang: Lang): Scene {
  let tri: Pt[] = [
    { x: 110, y: 430 },
    { x: 540, y: 400 },
    { x: 260, y: 110 },
  ];
  let held: number | null = null;
  return {
    down(p) {
      const i = tri.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 34);
      if (i >= 0) {
        held = i;
        return true;
      }
    },
    move(p) {
      if (held === null) return;
      tri = tri.map((q, i) => (i === held ? { x: clamp(p.x, 50, 580), y: clamp(p.y, 60, 480) } : q));
    },
    up() {
      held = null;
    },
    draw(g, t) {
      const a = angles(tri);
      const cs = tri.map((v, i) => corner(v, tri[(i + 1) % 3], tri[(i + 2) % 3]));
      shape(g, tri, C.paper, 1);
      cs.forEach((c, i) => wedge(g, tri[i], 44, c.from, c.size, COLORS[i]));
      labels(g, tri, a, 70);
      tri.forEach((p, i) => g.handle(p.x, p.y, held === i));
      if (t < 5 && held === null) fit(g, lang === "id" ? "geser tab merah" : "drag a red tab", tri[2].x, tri[2].y - 40, 240, 20, C.coral);

      // The same three angles side by side always make a half circle.
      const px = 620;
      const pw = 340;
      const c = { x: px + pw / 2, y: 260 };
      g.card(px, 70, pw, 420, C.paper, 1);
      g.line(c.x - 150, c.y, c.x + 150, c.y, C.ink, 3);
      let from = 180;
      a.forEach((v, i) => {
        from -= v;
        wedge(g, c, 130, from, v, COLORS[i], 0.4);
        const m = (from + v / 2) * RAD;
        if (v >= 12) g.text(`${v}°`, c.x + Math.cos(m) * 88, c.y - Math.sin(m) * 88, 22, C.paper, "center", true);
      });
      g.dot(c.x, c.y, 6, C.ink);
      fit(g, `${a[0]}° + ${a[1]}° + ${a[2]}°`, c.x, 320, pw - 30, 32, C.ink);
      g.c.globalAlpha = 0.75 + 0.25 * pulse(t, 2);
      fit(g, "= 180°", c.x, 366, pw - 30, 44, C.coral);
      g.c.globalAlpha = 1;
      para(g, lang === "id" ? "Bentuknya berubah, jumlahnya tetap 180°." : "The shape changes, the sum stays 180°.", c.x, 420, pw, 22, C.soft);
    },
  };
}

const ANGLE_KINDS = {
  en: ["acute triangle", "right triangle", "obtuse triangle"],
  id: ["segitiga lancip", "segitiga siku-siku", "segitiga tumpul"],
};
const ANGLE_ABOUT = {
  en: ["All three angles are smaller than 90°.", "One angle is exactly 90°.", "One angle is bigger than 90°."],
  id: ["Ketiga sudutnya kurang dari 90°.", "Satu sudutnya tepat 90°.", "Satu sudutnya lebih dari 90°."],
};
const SIDE_KINDS = {
  en: ["equilateral triangle", "isosceles triangle", "scalene triangle"],
  id: ["segitiga sama sisi", "segitiga sama kaki", "segitiga sembarang"],
};
const SIDE_ABOUT = {
  en: ["All three sides are the same length, and all three angles are 60°.", "Two sides are the same length, and the two angles at their ends are equal.", "All three sides have different lengths."],
  id: ["Ketiga sisinya sama panjang, dan ketiga sudutnya 60°.", "Dua sisinya sama panjang, dan dua sudut di ujungnya sama besar.", "Ketiga sisinya berbeda panjang."],
};

/** One centimetre on the sheet, for the side lengths. */
const CM = 40;
const BA = { x: 110, y: 440 };
const BB = { x: 510, y: 440 };

/** A triangle whose top corner moves: by itself when a kind is chosen, or dragged, and it snaps onto the special ones. */
function morph(lang: Lang, bySides: boolean): Scene {
  const base = BB.x - BA.x;
  const h = (base * Math.sqrt(3)) / 2;
  const presets: Pt[] = bySides
    ? [
        { x: (BA.x + BB.x) / 2, y: BA.y - h },
        { x: (BA.x + BB.x) / 2, y: BA.y - 260 },
        { x: 220, y: 200 },
      ]
    : [
        { x: 340, y: 150 },
        { x: BA.x, y: 160 },
        { x: 40 + 30, y: 300 },
      ];
  let apex = { ...presets[bySides ? 2 : 0] };
  let anim: { from: Pt; to: Pt; start: number } | null = null;
  let held = false;
  let now = 0;
  const snap = (p: Pt): Pt => {
    const m = (BA.x + BB.x) / 2;
    if (bySides) {
      if (Math.hypot(p.x - m, p.y - (BA.y - h)) < 16) return { x: m, y: BA.y - h };
      if (Math.abs(p.x - m) < 10) return { x: m, y: p.y };
      // On a circle around a base corner the slanted side is as long as the base.
      for (const c of [BA, BB]) {
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (Math.abs(d - base) < 10) return { x: c.x + ((p.x - c.x) / d) * base, y: c.y + ((p.y - c.y) / d) * base };
      }
      return p;
    }
    for (const c of [BA, BB]) if (Math.abs(p.x - c.x) < 10) return { x: c.x, y: p.y };
    // On the half circle over the base the top angle is a right angle.
    const d = Math.hypot(p.x - m, p.y - BA.y);
    if (Math.abs(d - base / 2) < 10) return { x: m + ((p.x - m) / d) * (base / 2), y: BA.y + ((p.y - BA.y) / d) * (base / 2) };
    return p;
  };
  return {
    press(id) {
      anim = { from: { ...apex }, to: presets[Number(id)], start: now };
    },
    down(p) {
      if (Math.hypot(p.x - apex.x, p.y - apex.y) < 36) {
        held = true;
        anim = null;
        return true;
      }
    },
    move(p) {
      if (held) apex = snap({ x: clamp(p.x, 50, 590), y: clamp(p.y, 70, 400) });
    },
    up() {
      held = false;
    },
    draw(g, t) {
      now = t;
      if (anim) {
        const k = ease(t, anim.start, 0.9);
        apex = { x: lerp(anim.from.x, anim.to.x, k), y: lerp(anim.from.y, anim.to.y, k) };
        if (k >= 1) anim = null;
      }
      const tri = [BA, BB, apex];
      const a = angles(tri);
      const cs = tri.map((v, i) => corner(v, tri[(i + 1) % 3], tri[(i + 2) % 3]));
      const lens = [
        Math.round((Math.hypot(BB.x - BA.x, BB.y - BA.y) / CM) * 10) / 10,
        Math.round((Math.hypot(apex.x - BB.x, apex.y - BB.y) / CM) * 10) / 10,
        Math.round((Math.hypot(apex.x - BA.x, apex.y - BA.y) / CM) * 10) / 10,
      ];
      const big = Math.max(...a);
      const kind = bySides
        ? lens[0] === lens[1] && lens[1] === lens[2]
          ? 0
          : lens[0] === lens[1] || lens[1] === lens[2] || lens[0] === lens[2]
            ? 1
            : 2
        : big < 90
          ? 0
          : big === 90
            ? 1
            : 2;
      shape(g, tri, C.paper, 1);
      if (bySides) {
        // Sides of the same length get the same colour and the same number of ticks.
        const sides: [Pt, Pt][] = [
          [BA, BB],
          [BB, apex],
          [apex, BA],
        ];
        const groups = lens.map((l) => lens.filter((m) => m === l).length);
        sides.forEach(([p, q], i) => {
          const same = groups[i] > 1;
          const color = same ? C.coral : [C.cobalt, C.teal, C.plum][i];
          g.line(p.x, p.y, q.x, q.y, color, 6);
          const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
          const nx = -u.y;
          const ny = u.x;
          if (same) for (const o of groups[i] === 3 ? [-6, 6] : [0]) g.line(m.x + u.x * o - nx * 12, m.y + u.y * o - ny * 12, m.x + u.x * o + nx * 12, m.y + u.y * o + ny * 12, C.ink, 3);
          // The length outside the triangle.
          const c = { x: (BA.x + BB.x + apex.x) / 3, y: (BA.y + BB.y + apex.y) / 3 };
          const out = (m.x - c.x) * nx + (m.y - c.y) * ny > 0 ? 1 : -1;
          g.text(`${dec(lang, len / CM, 1)} cm`, m.x + nx * 34 * out, m.y + ny * 34 * out, 22, color, "center", true);
        });
      } else {
        cs.forEach((c, i) => {
          const color = a[i] === big && kind > 0 ? (kind === 1 ? C.coral : C.plum) : C.teal;
          if (a[i] === 90) {
            const u = { x: Math.cos(c.from * RAD), y: -Math.sin(c.from * RAD) };
            const w = { x: Math.cos((c.from + 90) * RAD), y: -Math.sin((c.from + 90) * RAD) };
            const v = tri[i];
            g.c.fillStyle = color;
            g.c.beginPath();
            g.c.moveTo(v.x, v.y);
            g.c.lineTo(v.x + u.x * 30, v.y + u.y * 30);
            g.c.lineTo(v.x + (u.x + w.x) * 30, v.y + (u.y + w.y) * 30);
            g.c.lineTo(v.x + w.x * 30, v.y + w.y * 30);
            g.c.fill();
          } else wedge(g, tri[i], 40, c.from, c.size, color);
        });
        labels(g, tri, a, 66);
        shape(g, tri, "rgba(0, 0, 0, 0)", 0);
      }
      g.handle(apex.x, apex.y, held);
      if (t < 5 && !held) fit(g, lang === "id" ? "geser tab merah" : "drag the red tab", apex.x, apex.y - 40, 240, 20, C.coral);

      const px = 630;
      const pw = 330;
      const names = bySides ? SIDE_KINDS[lang] : ANGLE_KINDS[lang];
      const about = bySides ? SIDE_ABOUT[lang] : ANGLE_ABOUT[lang];
      const color = [C.teal, C.coral, C.plum][kind];
      g.card(px, 80, pw, 90, color, 1);
      fit(g, names[kind], px + pw / 2, 125, pw - 30, 34, C.paper);
      para(g, about[kind], px + pw / 2, 220, pw, 24, C.ink);
      const list = bySides ? lens.map((l) => `${dec(lang, l, 1)} cm`).join(", ") : a.map((v) => `${v}°`).join(" + ") + " = 180°";
      fit(g, list, px + pw / 2, 400, pw - 20, 26, C.soft);

      names.forEach((name, i) => {
        const label = name.replace(/^segitiga /u, "").replace(/ triangle$/u, "").toUpperCase();
        g.button(String(i), label, 40 + i * 220, 545, 200, 52, kind === i ? color : C.soft);
      });
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Tear the three corners off a paper triangle and lay them side by side: together they make a straight line, 180°.",
        id: "Sobek ketiga sudut segitiga kertas, lalu jajarkan: bersama-sama membentuk garis lurus, 180°.",
      },
      scene: tear,
    },
    {
      say: {
        en: "Drag the corners of the triangle. The angles change, but they always add up to 180°.",
        id: "Geser titik-titik sudut segitiga. Besar sudutnya berubah, tetapi jumlahnya selalu 180°.",
      },
      scene: drag,
    },
    {
      say: {
        en: "By its angles a triangle is acute, right or obtuse. Drag the top corner or press a kind to watch it change.",
        id: "Menurut sudutnya, segitiga ada yang lancip, siku-siku, dan tumpul. Geser sudut atasnya atau tekan salah satu jenis.",
      },
      scene: (lang) => morph(lang, false),
    },
    {
      say: {
        en: "By its sides a triangle is equilateral, isosceles or scalene. Sides of the same length are marked the same.",
        id: "Menurut sisinya, segitiga ada yang sama sisi, sama kaki, dan sembarang. Sisi yang sama panjang diberi tanda yang sama.",
      },
      scene: (lang) => morph(lang, true),
    },
  ],
};
