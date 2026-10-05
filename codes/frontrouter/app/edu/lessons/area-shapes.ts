import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene } from "../ink";
import { dec, num, wrap } from "../parts";

/** One centimetre on the sheet. */
const S = 40;
const Y0 = 450;
/** The column on the right where the sums are written. */
const PX = 650;
const PW = 310;

const LIGHT = { teal: "#a6ded3", plum: "#cfb6e6", cobalt: "#a9c1ea", sun: "#ffe19a" };

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A number of cm, with a decimal comma or point only when it needs one. */
const cm = (lang: Lang, v: number) => dec(lang, v, Number.isInteger(v) ? 0 : 1);

/** Faint dots on every centimetre, lined up with the shape's left corner. */
function dots(g: Ink, x0: number) {
  for (let x = x0 - S; x <= 630; x += S) for (let y = Y0; y >= 60; y -= S) g.dot(x, y, 2, "rgba(58, 63, 75, 0.18)");
}

/** A paper piece cut to the points, lifted by its shadow. */
function piece(g: Ink, pts: Pt[], color: string, lift = 1) {
  const c = g.c;
  if (lift > 0) {
    c.fillStyle = `rgba(70, 50, 25, ${0.2 * lift})`;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x + 3 * lift, p.y + 5 * lift) : c.moveTo(p.x + 3 * lift, p.y + 5 * lift)));
    c.fill();
  }
  c.fillStyle = color;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(58, 63, 75, 0.55)";
  c.lineWidth = 2;
  c.stroke();
}

function dashed(g: Ink, a: Pt, b: Pt, color: string, width = 3) {
  g.c.setLineDash([9, 7]);
  g.line(a.x, a.y, b.x, b.y, color, width);
  g.c.setLineDash([]);
}

/** Points turned by `a` radians around `m`. */
const turn = (pts: Pt[], m: Pt, a: number) =>
  pts.map((p) => ({ x: m.x + Math.cos(a) * (p.x - m.x) - Math.sin(a) * (p.y - m.y), y: m.y + Math.sin(a) * (p.x - m.x) + Math.cos(a) * (p.y - m.y) }));
const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const near = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) < 32;

/** The card on the right: the name, the lengths, the rule and its sum. */
function panel(g: Ink, title: string, rows: [string, string, string][], rule: string, result: string, note: string, noteK: number) {
  g.card(PX, 60, PW, 430, C.paper, 1);
  fit(g, title, PX + PW / 2, 100, PW - 30, 36, C.ink);
  rows.forEach(([label, value, color], i) => {
    const y = 160 + i * 44;
    fit(g, label, PX + 20, y, 150, 22, C.soft, "left");
    fit(g, value, PX + PW - 20, y, 130, 28, color, "right");
  });
  g.crease(PX + 20, 288, PX + PW - 20, 288);
  wrap(g, rule, PW - 40, 22).forEach((l, i) => fit(g, l, PX + PW / 2, 316 + i * 28, PW - 24, 22, C.soft));
  fit(g, result, PX + PW / 2, 390, PW - 24, 32, C.ink);
  g.c.globalAlpha = noteK;
  wrap(g, note, PW - 40, 20).forEach((l, i) => fit(g, l, PX + PW / 2, 432 + i * 26, PW - 24, 20, C.teal));
  g.c.globalAlpha = 1;
}

/** Whether a fold or cut is shown, and how far along it is. */
function motion() {
  let on = false;
  let at = -10;
  return {
    get on() {
      return on;
    },
    go(v: boolean, now: number) {
      if (v === on) return;
      on = v;
      at = now;
    },
    reset() {
      on = false;
      at = -10;
    },
    k: (t: number, len = 1.2) => (on ? ease(t, at, len) : 1 - ease(t, at, 0.8)),
    after: (t: number, delay: number) => (on ? ease(t, at + delay, 0.5) : 0),
  };
}

/** A parallelogram: cut the triangle off one end, slide it to the other and it is a rectangle of the same base and height. */
function parallelogram(lang: Lang): Scene {
  let b = 6;
  let h = 4;
  let s = 2;
  let held: "top" | "base" | null = null;
  const cut = motion();
  let now = 0;
  const x0 = 80;
  return {
    press(id) {
      cut.go(id === "cut", now);
    },
    down(p) {
      if (near(p, { x: x0 + s * S, y: Y0 - h * S })) held = "top";
      else if (near(p, { x: x0 + b * S, y: Y0 })) held = "base";
      if (held) {
        cut.reset();
        return true;
      }
    },
    move(p) {
      if (held === "top") {
        s = clamp(Math.round((p.x - x0) / S), 0, Math.min(b, 4));
        h = clamp(Math.round((Y0 - p.y) / S), 1, 8);
      } else if (held === "base") {
        b = clamp(Math.round((p.x - x0) / S), 2, 9);
        s = Math.min(s, b);
      }
    },
    up() {
      held = null;
    },
    draw(g, t) {
      now = t;
      dots(g, x0);
      const k = cut.k(t);
      const P0 = { x: x0, y: Y0 };
      const P1 = { x: x0 + b * S, y: Y0 };
      const P2 = { x: x0 + (b + s) * S, y: Y0 - h * S };
      const P3 = { x: x0 + s * S, y: Y0 - h * S };
      const F = { x: P3.x, y: Y0 };
      piece(g, [F, P1, P2, P3], LIGHT.cobalt, 1);
      // The cut-off triangle slides across, lifted a little on the way.
      const dx = k * b * S;
      const dy = -Math.sin(Math.PI * k) * 24;
      if (s > 0) piece(g, [P0, F, P3].map((p) => ({ x: p.x + dx, y: p.y + dy })), LIGHT.sun, 1 + Math.sin(Math.PI * k));
      // Once it is a rectangle, its centimetre squares show.
      const sq = cut.after(t, 1.3);
      if (sq > 0) {
        g.c.globalAlpha = sq;
        for (let i = 1; i < b; i++) g.line(F.x + i * S, Y0, F.x + i * S, Y0 - h * S, "rgba(255, 255, 255, 0.85)", 2);
        for (let j = 1; j < h; j++) g.line(F.x, Y0 - j * S, F.x + b * S, Y0 - j * S, "rgba(255, 255, 255, 0.85)", 2);
        g.c.globalAlpha = 1;
      }
      dashed(g, P3, F, C.teal);
      g.line(P0.x, Y0, P1.x, Y0, C.cobalt, 5);
      fit(g, `${num(lang, b)} cm`, (P0.x + P1.x) / 2, Y0 + 26, 200, 24, C.cobalt);
      fit(g, `${num(lang, h)} cm`, F.x + 10, Y0 - (h * S) / 2, 90, 24, C.teal, "left");
      if (!cut.on) {
        g.handle(P3.x, P3.y, held === "top");
        g.handle(P1.x, P1.y, held === "base");
      }
      if (t < 5 && !held) fit(g, lang === "id" ? "geser tab merah" : "drag the red tabs", P3.x, P3.y - 40, 240, 20, C.coral);

      const id = lang === "id";
      panel(
        g,
        id ? "jajargenjang" : "parallelogram",
        [
          [id ? "alas" : "base", `${num(lang, b)} cm`, C.cobalt],
          [id ? "tinggi" : "height", `${num(lang, h)} cm`, C.teal],
        ],
        id ? "luas = alas × tinggi" : "area = base × height",
        `${b} × ${h} = ${num(lang, b * h)} cm²`,
        id ? `menjadi persegi panjang ${b} × ${h}` : `it becomes a ${b} by ${h} rectangle`,
        cut.after(t, 1.2),
      );
      g.button("cut", id ? "POTONG DAN GESER" : "CUT AND SLIDE", 40, 545, 300, 52, C.teal, !cut.on);
      g.button("back", id ? "KEMBALIKAN" : "PUT BACK", 360, 545, 220, 52, C.soft, cut.on);
    },
  };
}

/** A triangle and its copy turned half way round: together they make a parallelogram, so the triangle is half of it. */
function triangle(lang: Lang): Scene {
  let b = 6;
  let h = 4;
  let s = 2;
  let held: "top" | "base" | null = null;
  const copy = motion();
  let now = 0;
  const x0 = 60;
  return {
    press(id) {
      copy.go(id === "copy", now);
    },
    down(p) {
      if (near(p, { x: x0 + s * S, y: Y0 - h * S })) held = "top";
      else if (near(p, { x: x0 + b * S, y: Y0 })) held = "base";
      if (held) {
        copy.reset();
        return true;
      }
    },
    move(p) {
      if (held === "top") {
        s = clamp(Math.round((p.x - x0) / S), 0, b);
        h = clamp(Math.round((Y0 - p.y) / S), 1, 8);
      } else if (held === "base") {
        b = clamp(Math.round((p.x - x0) / S), 2, 7);
        s = Math.min(s, b);
      }
    },
    up() {
      held = null;
    },
    draw(g, t) {
      now = t;
      dots(g, x0);
      const k = copy.k(t, 1.4);
      const A = { x: x0, y: Y0 };
      const B = { x: x0 + b * S, y: Y0 };
      const P = { x: x0 + s * S, y: Y0 - h * S };
      const tri = [A, B, P];
      piece(g, tri, LIGHT.teal, 1);
      if (k > 0) {
        g.c.globalAlpha = Math.min(1, k * 4);
        piece(g, turn(tri, mid(B, P), Math.PI * k), LIGHT.plum, 1 + Math.sin(Math.PI * k));
        g.c.globalAlpha = 1;
      }
      dashed(g, P, { x: P.x, y: Y0 }, C.teal);
      g.line(A.x, Y0, B.x, Y0, C.cobalt, 5);
      fit(g, `${num(lang, b)} cm`, (A.x + B.x) / 2, Y0 + 26, 200, 24, C.cobalt);
      fit(g, `${num(lang, h)} cm`, P.x - 10, Y0 - (h * S) / 2, 90, 24, C.teal, "right");
      if (!copy.on) {
        g.handle(P.x, P.y, held === "top");
        g.handle(B.x, B.y, held === "base");
      }
      if (t < 5 && !held) fit(g, lang === "id" ? "geser tab merah" : "drag the red tabs", P.x, P.y - 40, 240, 20, C.coral);

      const id = lang === "id";
      const area = (b * h) / 2;
      panel(
        g,
        id ? "segitiga" : "triangle",
        [
          [id ? "alas" : "base", `${num(lang, b)} cm`, C.cobalt],
          [id ? "tinggi" : "height", `${num(lang, h)} cm`, C.teal],
        ],
        id ? "luas = alas × tinggi : 2" : "area = base × height ÷ 2",
        `${b} × ${h} ${id ? ":" : "÷"} 2 = ${cm(lang, area)} cm²`,
        id ? `dua segitiga = jajargenjang ${b} × ${h}, jadi satu segitiga setengahnya` : `two triangles make a ${b} by ${h} parallelogram, so one is half of it`,
        copy.after(t, 1.4),
      );
      g.button("copy", id ? "SALIN DAN PUTAR" : "COPY AND TURN", 40, 545, 300, 52, C.plum, !copy.on);
      g.button("back", id ? "KEMBALIKAN" : "PUT BACK", 360, 545, 220, 52, C.soft, copy.on);
    },
  };
}

/** A trapezoid and its copy turned half way round: a parallelogram whose base is the two parallel sides together. */
function trapezoid(lang: Lang): Scene {
  let a = 6;
  let c = 3;
  let h = 4;
  let held: "top" | "base" | null = null;
  const copy = motion();
  let now = 0;
  const x0 = 60;
  return {
    press(id) {
      copy.go(id === "copy", now);
    },
    down(p) {
      const s = (a - c) / 2;
      if (near(p, { x: x0 + (s + c) * S, y: Y0 - h * S })) held = "top";
      else if (near(p, { x: x0 + a * S, y: Y0 })) held = "base";
      if (held) {
        copy.reset();
        return true;
      }
    },
    move(p) {
      if (held === "top") {
        c = clamp(Math.round((2 * (p.x - x0)) / S - a), 1, a - 1);
        h = clamp(Math.round((Y0 - p.y) / S), 1, 8);
      } else if (held === "base") {
        a = clamp(Math.round((p.x - x0) / S), 3, 7);
        c = Math.min(c, a - 1);
      }
    },
    up() {
      held = null;
    },
    draw(g, t) {
      now = t;
      dots(g, x0);
      const k = copy.k(t, 1.4);
      const s = (a - c) / 2;
      const A = { x: x0, y: Y0 };
      const B = { x: x0 + a * S, y: Y0 };
      const Q = { x: x0 + (s + c) * S, y: Y0 - h * S };
      const P = { x: x0 + s * S, y: Y0 - h * S };
      const shape = [A, B, Q, P];
      piece(g, shape, LIGHT.teal, 1);
      if (k > 0) {
        g.c.globalAlpha = Math.min(1, k * 4);
        piece(g, turn(shape, mid(B, Q), Math.PI * k), LIGHT.plum, 1 + Math.sin(Math.PI * k));
        g.c.globalAlpha = 1;
      }
      dashed(g, P, { x: P.x, y: Y0 }, C.teal);
      g.line(A.x, Y0, B.x, Y0, C.cobalt, 5);
      g.line(P.x, P.y, Q.x, Q.y, C.coral, 5);
      fit(g, `${num(lang, a)} cm`, (A.x + B.x) / 2, Y0 + 26, 200, 24, C.cobalt);
      fit(g, `${num(lang, c)} cm`, (P.x + Q.x) / 2, P.y - 22, 200, 24, C.coral);
      fit(g, `${num(lang, h)} cm`, P.x - 10, Y0 - (h * S) / 2, 90, 24, C.teal, "right");
      if (k > 0.98) {
        // The long base of the parallelogram: the bottom of one and the top of the copy.
        const e = { x: B.x + c * S, y: Y0 };
        g.line(B.x, Y0, e.x, Y0, C.coral, 5);
        g.c.globalAlpha = copy.after(t, 1.4);
        fit(g, `${num(lang, a)} + ${num(lang, c)}`, (A.x + e.x) / 2, Y0 + 54, 300, 24, C.ink);
        g.c.globalAlpha = 1;
      }
      if (!copy.on) {
        g.handle(Q.x, Q.y, held === "top");
        g.handle(B.x, B.y, held === "base");
      }
      if (t < 5 && !held) fit(g, lang === "id" ? "geser tab merah" : "drag the red tabs", Q.x, Q.y - 50, 240, 20, C.coral);

      const id = lang === "id";
      panel(
        g,
        id ? "trapesium" : "trapezoid",
        [
          [id ? "sisi bawah" : "bottom", `${num(lang, a)} cm`, C.cobalt],
          [id ? "sisi atas" : "top", `${num(lang, c)} cm`, C.coral],
          [id ? "tinggi" : "height", `${num(lang, h)} cm`, C.teal],
        ],
        id ? "luas = (sisi bawah + sisi atas) × tinggi : 2" : "area = (bottom + top) × height ÷ 2",
        `(${a} + ${c}) × ${h} ${id ? ":" : "÷"} 2 = ${cm(lang, ((a + c) * h) / 2)} cm²`,
        id ? `dua trapesium = jajargenjang dengan alas ${a} + ${c}` : `two trapezoids make a parallelogram with base ${a} + ${c}`,
        copy.after(t, 1.4),
      );
      g.button("copy", id ? "SALIN DAN PUTAR" : "COPY AND TURN", 40, 545, 300, 52, C.plum, !copy.on);
      g.button("back", id ? "KEMBALIKAN" : "PUT BACK", 360, 545, 220, 52, C.soft, copy.on);
    },
  };
}

/** A kite or rhombus in the rectangle around its diagonals: the four corners fold over and cover it exactly, so it is half. */
function kite(lang: Lang): Scene {
  let isKite = true;
  let d1 = 6;
  let top = 2;
  let bottom = 5;
  let held: "r" | "t" | "b" | null = null;
  const fold = motion();
  let now = 0;
  const O = { x: 330, y: 260 };
  return {
    press(id) {
      if (id === "kite" || id === "rhombus") {
        isKite = id === "kite";
        fold.reset();
        if (isKite) [d1, top, bottom] = [6, 2, 5];
        else [d1, top, bottom] = [8, 3, 3];
        return;
      }
      fold.go(id === "fold", now);
    },
    down(p) {
      if (near(p, { x: O.x + (d1 / 2) * S, y: O.y })) held = "r";
      else if (near(p, { x: O.x, y: O.y - top * S })) held = "t";
      else if (near(p, { x: O.x, y: O.y + bottom * S })) held = "b";
      if (held) {
        fold.reset();
        return true;
      }
    },
    move(p) {
      if (held === "r") d1 = clamp(Math.round((2 * (p.x - O.x)) / S), 2, 10);
      else if (!isKite && held) {
        const d2 = clamp(Math.round((2 * Math.abs(p.y - O.y)) / S), 2, 8);
        top = bottom = d2 / 2;
      } else if (held === "t") top = clamp(Math.round((O.y - p.y) / S), 1, 4);
      else if (held === "b") bottom = clamp(Math.round((p.y - O.y) / S), 1, 5);
    },
    up() {
      held = null;
    },
    draw(g, t) {
      now = t;
      const d2 = top + bottom;
      const half = (d1 / 2) * S;
      const T = { x: O.x, y: O.y - top * S };
      const B = { x: O.x, y: O.y + bottom * S };
      const L = { x: O.x - half, y: O.y };
      const R = { x: O.x + half, y: O.y };
      // The rectangle around the diagonals.
      g.c.fillStyle = "rgba(241, 227, 196, 0.6)";
      g.c.fillRect(L.x, T.y, 2 * half, B.y - T.y);
      g.c.setLineDash([9, 7]);
      g.c.strokeStyle = C.soft;
      g.c.lineWidth = 2;
      g.c.strokeRect(L.x, T.y, 2 * half, B.y - T.y);
      g.c.setLineDash([]);
      piece(g, [T, R, B, L], LIGHT.teal, 1);
      dashed(g, L, R, C.cobalt);
      dashed(g, T, B, C.coral);
      // Each corner of the rectangle turns over its edge onto the shape.
      const corners: [Pt, Pt, Pt][] = [
        [T, { x: R.x, y: T.y }, R],
        [R, { x: R.x, y: B.y }, B],
        [B, { x: L.x, y: B.y }, L],
        [L, { x: L.x, y: T.y }, T],
      ];
      corners.forEach(([p, q, r], i) => {
        const k = fold.k(t - (fold.on ? i * 0.25 : 0), 0.9);
        piece(g, turn([p, q, r], mid(p, r), Math.PI * k), LIGHT.sun, 0.6 + Math.sin(Math.PI * k));
      });
      fit(g, `d1 = ${num(lang, d1)} cm`, L.x - 12, O.y, L.x - 24, 22, C.cobalt, "right");
      fit(g, `d2 = ${cm(lang, d2)} cm`, O.x + 12, B.y + 26, 200, 22, C.coral, "left");
      if (!fold.on) {
        g.handle(R.x, R.y, held === "r");
        g.handle(T.x, T.y, held === "t");
        g.handle(B.x, B.y, held === "b");
      }
      if (t < 5 && !held) fit(g, lang === "id" ? "geser tab merah" : "drag the red tabs", T.x, T.y - 32, 240, 20, C.coral);

      const id = lang === "id";
      const name = isKite ? (id ? "layang-layang" : "kite") : id ? "belah ketupat" : "rhombus";
      panel(
        g,
        name,
        [
          ["diagonal 1", `${num(lang, d1)} cm`, C.cobalt],
          ["diagonal 2", `${cm(lang, d2)} cm`, C.coral],
        ],
        id ? "luas = d1 × d2 : 2" : "area = d1 × d2 ÷ 2",
        `${num(lang, d1)} × ${cm(lang, d2)} ${id ? ":" : "÷"} 2 = ${cm(lang, (d1 * d2) / 2)} cm²`,
        id ? `pojok-pojok persegi panjang ${d1} × ${cm(lang, d2)} menutupi ${name} tepat, jadi luasnya setengah` : `the corners of the ${d1} by ${cm(lang, d2)} rectangle cover the ${name} exactly, so it is half`,
        fold.after(t, 1.8),
      );
      g.button("kite", id ? "LAYANG-LAYANG" : "KITE", 40, 545, 220, 52, isKite ? C.cobalt : C.soft);
      g.button("rhombus", id ? "BELAH KETUPAT" : "RHOMBUS", 275, 545, 230, 52, isKite ? C.soft : C.cobalt);
      g.button("fold", id ? "LIPAT" : "FOLD IN", 520, 545, 210, 52, C.teal, !fold.on);
      g.button("back", id ? "KEMBALIKAN" : "PUT BACK", 745, 545, 215, 52, C.soft, fold.on);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Cut the triangle off a parallelogram and slide it to the other end: it becomes a rectangle, so its area is base × height.",
        id: "Potong segitiga di ujung jajargenjang, lalu geser ke ujung lainnya: jadilah persegi panjang, jadi luasnya alas × tinggi.",
      },
      scene: parallelogram,
    },
    {
      say: {
        en: "A triangle and a copy turned round make a parallelogram, so the triangle is half of it. Drag the tabs and watch the area.",
        id: "Segitiga dan salinannya yang diputar membentuk jajargenjang, jadi luas segitiga setengahnya. Geser tabnya dan lihat luasnya.",
      },
      scene: triangle,
    },
    {
      say: {
        en: "Two copies of a trapezoid make a parallelogram whose base is the two parallel sides together.",
        id: "Dua trapesium yang sama membentuk jajargenjang yang alasnya adalah jumlah kedua sisi sejajarnya.",
      },
      scene: trapezoid,
    },
    {
      say: {
        en: "A kite or a rhombus fits in the rectangle around its diagonals. Fold the corners in: they cover it exactly, so it is half.",
        id: "Layang-layang atau belah ketupat pas di dalam persegi panjang yang dibentuk diagonalnya. Lipat pojok-pojoknya: menutupi bangunnya tepat, jadi luasnya setengah.",
      },
      scene: kite,
    },
  ],
};
