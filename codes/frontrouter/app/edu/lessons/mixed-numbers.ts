import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { frac, num, strip } from "../parts";

/** A sign or word, a fraction [top, bottom], or a mixed number [whole, top, bottom]. */
type Part = string | [string, string] | [string, string, string];

/** A row of parts centred on x; a mixed number keeps its whole close to its fraction. */
function row(g: Ink, parts: Part[], x: number, y: number, size = 44, colors: string[] = []) {
  const gap = size * 0.35;
  const fw = (a: string, b: string) => Math.max(g.width(a, size, true), g.width(b, size, true)) + size * 0.3;
  const widths = parts.map((p) =>
    typeof p === "string" ? g.width(p, size, true) : p.length === 2 ? fw(p[0], p[1]) : g.width(p[0], size * 1.2, true) + size * 0.12 + fw(p[1], p[2]),
  );
  let at = x - (widths.reduce((n, w) => n + w, 0) + gap * (parts.length - 1)) / 2;
  parts.forEach((p, i) => {
    const color = colors[i] ?? C.ink;
    if (typeof p === "string") g.text(p, at + widths[i] / 2, y, size, color, "center", true);
    else if (p.length === 2) frac(g, p[0], p[1], at + widths[i] / 2, y, size, color);
    else {
      const ww = g.width(p[0], size * 1.2, true);
      g.text(p[0], at, y, size * 1.2, color, "left", true);
      frac(g, p[1], p[2], at + ww + size * 0.12 + fw(p[1], p[2]) / 2, y, size, color);
    }
    at += widths[i] + gap;
  });
}

/** n/b written as a mixed number: wholes and what is left, or only one of them when the other is nothing. */
function mixedOf(lang: Lang, n: number, b: number): Part {
  const q = Math.floor(n / b);
  const r = n % b;
  if (r === 0) return num(lang, q);
  if (q === 0) return [num(lang, r), num(lang, b)];
  return [num(lang, q), num(lang, r), num(lang, b)];
}

const NAMES = {
  en: ["", "", "half", "third", "quarter", "fifth", "sixth"],
  enMany: ["", "", "halves", "thirds", "quarters", "fifths", "sixths"],
  id: ["", "", "perdua", "pertiga", "perempat", "perlima", "perenam"],
};

/** "7 quarters = 1 whole and 3 quarters", in words. */
function told(lang: Lang, n: number, b: number) {
  const q = Math.floor(n / b);
  const r = n % b;
  if (lang === "id") {
    const name = NAMES.id[b];
    if (q === 0) return `${num(lang, n)} ${name}, belum sampai 1 utuh`;
    if (r === 0) return `${num(lang, n)} ${name} = ${num(lang, q)} utuh`;
    return `${num(lang, n)} ${name} = ${num(lang, q)} utuh dan ${num(lang, r)} ${name}`;
  }
  const name = (k: number) => (k === 1 ? NAMES.en[b] : NAMES.enMany[b]);
  const wholes = `${num(lang, q)} whole${q === 1 ? "" : "s"}`;
  if (q === 0) return `${num(lang, n)} ${name(n)}, less than 1 whole`;
  if (r === 0) return `${num(lang, n)} ${name(n)} = ${wholes}`;
  return `${num(lang, n)} ${name(n)} = ${wholes} and ${num(lang, r)} ${name(r)}`;
}

/** A minus, a value and a plus in a row with a small name above. */
function stepper(g: Ink, lang: Lang, key: string, x: number, value: number, lo: number, hi: number, color: string, name: string) {
  g.text(name, x + 97, 530, 22, C.soft, "center", true);
  g.button(`${key}-`, "−", x, 555, 64, 52, color, value > lo);
  g.text(num(lang, value), x + 97, 581, 34, color, "center", true);
  g.button(`${key}+`, "+", x + 130, 555, 64, 52, color, value < hi);
}

/** Pieces drop one by one into round wholes; each whole that fills up counts as 1. */
function pies(lang: Lang): Scene {
  let n = 7;
  let b = 4;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "n+") n += 1;
      if (id === "n-") n -= 1;
      if (id === "b+") b = clamp(b + 1, 2, 6);
      if (id === "b-") b = clamp(b - 1, 2, 6);
      n = clamp(n, 1, 4 * b);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const count = Math.ceil(n / b);
      const R = 90;
      const cy = 170;
      const land = (i: number) => changed + 0.3 + 0.28 * i;
      for (let p = 0; p < count; p++) {
        const cx = W / 2 + (p - (count - 1) / 2) * 230;
        g.dot(cx + 3, cy + 5, R, "rgba(70, 50, 25, 0.22)");
        g.dot(cx, cy, R, C.paper);
        const inside = Math.min(b, n - p * b);
        for (let s = 0; s < inside; s++) {
          const k = ease(t, land(p * b + s), 0.35);
          if (k <= 0) continue;
          const a0 = -Math.PI / 2 + (s / b) * Math.PI * 2;
          const a1 = a0 + (Math.PI * 2) / b;
          const oy = (1 - k) * -70;
          g.c.globalAlpha = k;
          g.c.fillStyle = C.coral;
          g.c.beginPath();
          g.c.moveTo(cx, cy + oy);
          g.c.arc(cx, cy + oy, R, a0, a1);
          g.c.closePath();
          g.c.fill();
          g.c.globalAlpha = 1;
        }
        for (let s = 0; s < b; s++) {
          const a = -Math.PI / 2 + (s / b) * Math.PI * 2;
          g.line(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, C.paper, 3);
        }
        g.c.strokeStyle = C.ink;
        g.c.lineWidth = 3;
        g.c.beginPath();
        g.c.arc(cx, cy, R, 0, Math.PI * 2);
        g.c.stroke();
        // Under each pie, what it holds once its last piece is in.
        const shown = ease(t, land(p * b + inside - 1) + 0.35, 0.3);
        g.c.globalAlpha = shown;
        if (inside === b) {
          g.card(cx - 34, 282, 68, 56, C.sun, 1);
          g.text(num(lang, 1), cx, 310, 34, C.ink, "center", true);
        } else frac(g, num(lang, inside), num(lang, b), cx, 310, 30, C.coral);
        g.c.globalAlpha = 1;
      }
      g.c.globalAlpha = ease(t, land(n - 1) + 0.6, 0.4);
      const m = mixedOf(lang, n, b);
      row(g, typeof m === "string" || m.length === 3 ? [[num(lang, n), num(lang, b)], "=", m] : [[num(lang, n), num(lang, b)]], W / 2, 410, 50, [C.coral, C.ink, C.plum]);
      g.text(told(lang, n, b), W / 2, 480, 26, C.soft, "center", true);
      g.c.globalAlpha = 1;
      stepper(g, lang, "n", 40, n, 1, 4 * b, C.coral, lang === "id" ? "pembilang" : "numerator");
      stepper(g, lang, "b", W - 234, b, 2, 6, C.soft, lang === "id" ? "penyebut" : "denominator");
    },
  };
}

const MIXED: [number, number, number][] = [
  [1, 3, 4],
  [2, 1, 3],
  [1, 2, 5],
  [2, 3, 6],
  [1, 1, 2],
  [2, 2, 3],
];

/** The same amount both ways: whole strips cut into pieces and counted, or pieces gathered back into wholes. */
function convert(lang: Lang): Scene {
  let i = 0;
  let cut = true;
  let changed = -10;
  let now = 0;
  return {
    press(id) {
      if (id === "flip") cut = !cut;
      if (id === "next") {
        i = (i + 1) % MIXED.length;
        cut = true;
        changed = -10;
        return;
      }
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [q, r, b] = MIXED[i];
      const n = q * b + r;
      const e = ease(t, changed, 0.8);
      const k = cut ? e : 1 - e;
      const x = 170;
      const w = 660;
      const pw = w / b;
      const strips = q + (r > 0 ? 1 : 0);
      for (let s = 0; s < strips; s++) {
        const y = 50 + s * 80;
        const full = s < q;
        if (full) {
          strip(g, x, y, w, 60, 1, 1, C.coral);
          // The cuts appear across the whole as it turns into pieces.
          g.c.globalAlpha = k;
          strip(g, x, y, w, 60, b, b, C.coral, 0);
          g.c.globalAlpha = 1;
        } else strip(g, x, y, w, 60, b, r, C.coral);
        g.c.globalAlpha = k;
        for (let j = 0; j < (full ? b : r); j++) g.text(num(lang, s * b + j + 1), x + j * pw + pw / 2, y + 30, 24, C.paper, "center", true);
        g.c.globalAlpha = 1 - k;
        if (full) {
          g.card(x - 70, y + 4, 52, 52, C.sun, 1);
          g.text(num(lang, 1), x - 44, y + 30, 30, C.ink, "center", true);
        } else frac(g, num(lang, r), num(lang, b), x - 44, y + 30, 24, C.coral);
        g.c.globalAlpha = 1;
      }
      const A: Part = [num(lang, n), num(lang, b)];
      const M: Part = [num(lang, q), num(lang, r), num(lang, b)];
      row(g, cut ? [M, "=", A] : [A, "=", M], W / 2, 360, 50, [C.ink, C.ink, C.plum]);
      const calc = cut
        ? `${num(lang, q)} × ${num(lang, b)} + ${num(lang, r)} = ${num(lang, n)}`
        : lang === "id"
          ? `${num(lang, n)} : ${num(lang, b)} = ${num(lang, q)} sisa ${num(lang, r)}`
          : `${num(lang, n)} ÷ ${num(lang, b)} = ${num(lang, q)} remainder ${num(lang, r)}`;
      g.c.globalAlpha = ease(t, changed + 0.6, 0.4);
      g.text(calc, W / 2, 445, 30, C.cobalt, "center", true);
      g.c.globalAlpha = 1;
      g.text(told(lang, n, b), W / 2, 490, 22, C.soft, "center", true);
      const label = cut ? (lang === "id" ? "JADIKAN UTUH" : "MAKE WHOLES") : lang === "id" ? "POTONG YANG UTUH" : "CUT THE WHOLES";
      g.button("flip", label, 40, 555, 320, 52, C.cobalt);
      g.button("next", lang === "id" ? "PECAHAN LAIN" : "ANOTHER FRACTION", W - 340, 555, 300, 52, C.soft);
    },
  };
}

/** Drag a point along a line from 0 to 4: wholes as long hops, the pieces left as short ones, and both names. */
function track(lang: Lang): Scene {
  let n = 7;
  let b = 4;
  let held = false;
  const x0 = 80;
  const x1 = 920;
  const y = 330;
  const xs = (v: number) => lerp(x0, x1, v / (4 * b));
  const pick = (px: number) => {
    n = clamp(Math.round(((px - x0) / (x1 - x0)) * 4 * b), 1, 4 * b);
  };
  return {
    press(id) {
      const old = b;
      if (id === "b+") b = clamp(b + 1, 2, 6);
      if (id === "b-") b = clamp(b - 1, 2, 6);
      n = clamp(Math.round((n / old) * b), 1, 4 * b);
    },
    down(p) {
      if (Math.abs(p.y - y) < 50 && p.x > x0 - 30 && p.x < x1 + 30) {
        held = true;
        pick(p.x);
        return true;
      }
    },
    move(p) {
      pick(p.x);
    },
    up() {
      held = false;
    },
    draw(g, t) {
      const q = Math.floor(n / b);
      const r = n % b;
      g.line(x0, y, x1, y, C.ink, 3);
      for (let i = 0; i <= 4 * b; i++) {
        const whole = i % b === 0;
        g.line(xs(i), y - (whole ? 14 : 7), xs(i), y + (whole ? 14 : 7), whole ? C.ink : C.soft, whole ? 3 : 2);
        if (whole) g.text(num(lang, i / b), xs(i), y + 44, 30, C.ink, "center", true);
      }
      const arc = (from: number, to: number, height: number, color: string) => {
        g.c.strokeStyle = color;
        g.c.lineWidth = 4;
        g.c.beginPath();
        g.c.moveTo(xs(from), y);
        g.c.quadraticCurveTo((xs(from) + xs(to)) / 2, y - height * 2, xs(to), y);
        g.c.stroke();
      };
      for (let j = 0; j < q; j++) arc(j * b, (j + 1) * b, 60, C.sun);
      for (let j = 0; j < r; j++) arc(q * b + j, q * b + j + 1, 24, C.coral);
      // The two names of the same point, on a card that follows it.
      const cx = clamp(xs(n), 200, 800);
      g.card(cx - 160, 100, 320, 110, C.paper, 1);
      const m = mixedOf(lang, n, b);
      row(g, typeof m === "string" || m.length === 3 ? [[num(lang, n), num(lang, b)], "=", m] : [[num(lang, n), num(lang, b)]], cx, 155, 44, [C.coral, C.ink, C.plum]);
      g.line(xs(n), 210, xs(n), y - 24, C.fold, 2);
      g.handle(xs(n), y, held);
      g.text(told(lang, n, b), W / 2, 450, 26, C.soft, "center", true);
      if (!held && t < 6) g.text(lang === "id" ? "geser titiknya" : "drag the point", W / 2, 60, 22, C.soft, "center", true);
      stepper(g, lang, "b", W / 2 - 97, b, 2, 6, C.soft, lang === "id" ? "penyebut" : "denominator");
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Pieces fill one whole before the next one starts. 7 quarters fill one whole and leave 3 quarters: 1 and 3 quarters.",
        id: "Potongan mengisi satu utuh dulu, baru utuh berikutnya. 7 perempat mengisi 1 utuh dan sisa 3 perempat: 1 3/4.",
      },
      scene: pies,
    },
    {
      say: {
        en: "Go both ways. Cut the wholes into pieces and count them all, or gather the pieces back into wholes.",
        id: "Ubah ke dua arah. Potong yang utuh menjadi potongan lalu hitung semuanya, atau kumpulkan potongan menjadi utuh lagi.",
      },
      scene: convert,
    },
    {
      say: {
        en: "Drag the point along the number line. Every long hop is one whole; the short hops are the pieces left over.",
        id: "Geser titik pada garis bilangan. Setiap lompatan panjang adalah satu utuh, lompatan pendek adalah potongan sisanya.",
      },
      scene: track,
    },
  ],
};
