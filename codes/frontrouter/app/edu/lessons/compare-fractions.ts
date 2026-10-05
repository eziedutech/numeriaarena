import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { frac, lcm, num, strip, sum } from "../parts";

/** A value that glides toward its target, so strips and points move instead of jumping. */
function glide(start: number) {
  let v = start;
  let last = 0;
  return (target: number, t: number) => {
    const dt = clamp(t - last, 0, 0.1);
    last = t;
    v += (target - v) * (1 - Math.exp(-dt * 7));
    return v;
  };
}

/** The sign between a/b and c/d. */
const sign = (a: number, b: number, c: number, d: number) => (a * d < c * b ? "<" : a * d > c * b ? ">" : "=");

/** A minus, a value and a plus in a row with a small name above. */
function stepper(g: Ink, lang: Lang, key: string, x: number, value: number, lo: number, hi: number, color: string, name: string) {
  g.text(name, x + 97, 530, 22, C.soft, "center", true);
  g.button(`${key}-`, "−", x, 555, 64, 52, color, value > lo);
  g.text(num(lang, value), x + 97, 581, 34, color, "center", true);
  g.button(`${key}+`, "+", x + 130, 555, 64, 52, color, value < hi);
}

/** A dashed line down from where a coloured part ends. */
function edge(g: Ink, x: number, y1: number, y2: number, color: string) {
  g.c.setLineDash([8, 7]);
  g.line(x, y1, x, y2, color, 3);
  g.c.setLineDash([]);
}

/** Same denominator: the pieces are the same size, so the longer coloured part is the bigger fraction. */
function sameDen(lang: Lang): Scene {
  let a = 2;
  let c = 4;
  let b = 5;
  const ga = glide(a);
  const gc = glide(c);
  return {
    press(id) {
      if (id === "a+") a += 1;
      if (id === "a-") a -= 1;
      if (id === "c+") c += 1;
      if (id === "c-") c -= 1;
      if (id === "b+") b = clamp(b + 1, 2, 10);
      if (id === "b-") b = clamp(b - 1, 2, 10);
      a = clamp(a, 1, b);
      c = clamp(c, 1, b);
    },
    draw(g, t) {
      const x = 200;
      const w = 600;
      const sa = ga(a, t);
      const sc = gc(c, t);
      strip(g, x, 60, w, 80, b, sa, C.coral);
      strip(g, x, 190, w, 80, b, sc, C.teal);
      frac(g, num(lang, a), num(lang, b), 110, 100, 36, C.coral);
      frac(g, num(lang, c), num(lang, b), 110, 230, 36, C.teal);
      edge(g, x + (w * sa) / b, 50, 300, C.coral);
      edge(g, x + (w * sc) / b, 50, 300, C.teal);
      const s = sign(a, b, c, b);
      sum(g, [[num(lang, a), num(lang, b)], s, [num(lang, c), num(lang, b)]], W / 2, 375, 56, [C.coral, C.ink, C.teal]);
      g.text(
        lang === "id" ? `penyebut sama: bandingkan pembilangnya, ${num(lang, a)} ${s} ${num(lang, c)}` : `same denominator: compare the numerators, ${num(lang, a)} ${s} ${num(lang, c)}`,
        W / 2,
        462,
        26,
        C.soft,
        "center",
        true,
      );
      const top = lang === "id" ? "pembilang" : "numerator";
      stepper(g, lang, "a", 40, a, 1, b, C.coral, top);
      stepper(g, lang, "b", W / 2 - 97, b, 2, 10, C.soft, lang === "id" ? "penyebut" : "denominator");
      stepper(g, lang, "c", W - 234, c, 1, b, C.teal, top);
    },
  };
}

/** Same numerator: the same number of pieces, but fewer cuts make bigger pieces. */
function sameNum(lang: Lang): Scene {
  let n = 2;
  let b = 3;
  let d = 5;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "n+") n += 1;
      if (id === "n-") n -= 1;
      if (id === "b+") b = clamp(b + 1, 2, 10);
      if (id === "b-") b = clamp(b - 1, 2, 10);
      if (id === "d+") d = clamp(d + 1, 2, 10);
      if (id === "d-") d = clamp(d - 1, 2, 10);
      n = clamp(n, 1, Math.min(b, d));
      changed = now;
    },
    draw(g, t) {
      now = t;
      const x = 200;
      const w = 600;
      const row = (y: number, parts: number, color: string) => {
        strip(g, x, y, w, 80, parts, 0, C.paper);
        const pw = w / parts;
        // The coloured pieces drop in one by one.
        for (let i = 0; i < n; i++) {
          const k = ease(t, changed + 0.15 * i, 0.4);
          g.c.globalAlpha = k;
          g.card(x + i * pw + 2, y + 2 - (1 - k) * 30, pw - 4, 76, color, 0.8);
          g.c.globalAlpha = 1;
        }
        // How big one piece is.
        g.line(x, y - 14, x + pw, y - 14, color, 3);
        g.line(x, y - 22, x, y - 6, color, 3);
        g.line(x + pw, y - 22, x + pw, y - 6, color, 3);
        frac(g, "1", num(lang, parts), x + pw + 36, y - 30, 22, color);
        edge(g, x + n * pw, y - 4, 330, color);
      };
      row(90, b, C.coral);
      row(240, d, C.teal);
      frac(g, num(lang, n), num(lang, b), 110, 130, 36, C.coral);
      frac(g, num(lang, n), num(lang, d), 110, 280, 36, C.teal);
      const s = sign(n, b, n, d);
      sum(g, [[num(lang, n), num(lang, b)], s, [num(lang, n), num(lang, d)]], W / 2, 400, 56, [C.coral, C.ink, C.teal]);
      const line =
        b === d
          ? lang === "id"
            ? "penyebutnya sama, jadi kedua pecahan sama besar"
            : "the denominators match, so the fractions are equal"
          : lang === "id"
            ? "pembilang sama: penyebut lebih kecil, potongan lebih besar"
            : "same numerator: the smaller denominator has the bigger pieces";
      g.text(line, W / 2, 478, 24, C.soft, "center", true);
      const low = lang === "id" ? "penyebut" : "denominator";
      stepper(g, lang, "b", 40, b, 2, 10, C.coral, low);
      stepper(g, lang, "n", W / 2 - 97, n, 1, Math.min(b, d), C.cobalt, lang === "id" ? "pembilang" : "numerator");
      stepper(g, lang, "d", W - 234, d, 2, 10, C.teal, low);
    },
  };
}

const PAIRS: [number, number, number, number][] = [
  [2, 3, 3, 5],
  [3, 4, 5, 6],
  [1, 2, 3, 5],
  [2, 5, 1, 3],
  [5, 8, 3, 4],
  [4, 6, 2, 3],
];

/** Different numerators and denominators: cut both strips into the same pieces, then count. */
function cutSame(lang: Lang): Scene {
  let i = 0;
  let cut = false;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "go") cut = true;
      if (id === "next") {
        i = (i + 1) % PAIRS.length;
        cut = false;
      }
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [a, b, c, d] = PAIRS[i];
      const m = lcm(b, d);
      const p = (a * m) / b;
      const q = (c * m) / d;
      const k = cut ? ease(t, changed, 0.9) : 0;
      const x = 200;
      const w = 560;
      strip(g, x, 60, w, 80, b, a, C.coral);
      strip(g, x, 190, w, 80, d, c, C.teal);
      if (k > 0) {
        // The finer cuts fade in over the old ones.
        g.c.globalAlpha = k;
        strip(g, x, 60, w, 80, m, p, C.coral, 0);
        strip(g, x, 190, w, 80, m, q, C.teal, 0);
        g.c.globalAlpha = 1;
      }
      frac(g, num(lang, a), num(lang, b), 110, 100, 36, C.coral);
      frac(g, num(lang, c), num(lang, d), 110, 230, 36, C.teal);
      edge(g, x + (w * a) / b, 50, 300, C.coral);
      edge(g, x + (w * c) / d, 50, 300, C.teal);
      if (k > 0) {
        g.c.globalAlpha = k;
        g.text("=", 810, 100, 40, C.ink, "center", true);
        g.text("=", 810, 230, 40, C.ink, "center", true);
        frac(g, num(lang, p), num(lang, m), 880, 100, 36, C.coral);
        frac(g, num(lang, q), num(lang, m), 880, 230, 36, C.teal);
        g.c.globalAlpha = 1;
      }
      const s = sign(a, b, c, d);
      const A: [string, string] = [num(lang, a), num(lang, b)];
      const B: [string, string] = [num(lang, c), num(lang, d)];
      if (!cut) {
        sum(g, [A, lang === "id" ? "dan" : "and", B], W / 2, 370, 50, [C.coral, C.soft, C.teal]);
        g.text(lang === "id" ? "potongannya beda ukuran, potong sama besar dulu" : "the pieces are different sizes: cut them the same first", W / 2, 455, 24, C.soft, "center", true);
      } else {
        sum(g, [A, "=", [num(lang, p), num(lang, m)], s, [num(lang, q), num(lang, m)], "=", B], W / 2, 370, 50, [C.coral, C.ink, C.coral, C.ink, C.teal, C.ink, C.teal]);
        g.c.globalAlpha = k;
        g.text(lang === "id" ? `sekarang potongannya sama: ${num(lang, p)} ${s} ${num(lang, q)}` : `now the pieces match: ${num(lang, p)} ${s} ${num(lang, q)}`, W / 2, 455, 26, C.soft, "center", true);
        g.c.globalAlpha = 1;
      }
      g.button("next", lang === "id" ? "PASANGAN LAIN" : "ANOTHER PAIR", 40, 555, 280, 52, C.soft);
      g.button("go", lang === "id" ? "POTONG SAMA" : "CUT THE SAME", W - 300, 555, 260, 52, C.cobalt, !cut);
    },
  };
}

/** Two fractions on one line from 0 to 1, strips above it: the one further right is bigger. */
function line(lang: Lang): Scene {
  const f = { a: 2, b: 3, c: 3, d: 4 };
  const ga = glide(f.a / f.b);
  const gc = glide(f.c / f.d);
  return {
    press(id) {
      const key = id[0] as keyof typeof f;
      if (key in f) f[key] += id[1] === "+" ? 1 : -1;
      f.b = clamp(f.b, 2, 10);
      f.d = clamp(f.d, 2, 10);
      f.a = clamp(f.a, 1, f.b - 1);
      f.c = clamp(f.c, 1, f.d - 1);
    },
    draw(g, t) {
      const x0 = 100;
      const x1 = 900;
      const w = x1 - x0;
      const y = 300;
      const va = ga(f.a / f.b, t);
      const vc = gc(f.c / f.d, t);
      strip(g, x0, 50, w, 56, f.b, va * f.b, C.coral);
      strip(g, x0, 140, w, 56, f.d, vc * f.d, C.teal);
      frac(g, num(lang, f.a), num(lang, f.b), 50, 78, 26, C.coral);
      frac(g, num(lang, f.c), num(lang, f.d), 50, 168, 26, C.teal);
      edge(g, lerp(x0, x1, va), 106, y, C.coral);
      edge(g, lerp(x0, x1, vc), 196, y, C.teal);
      g.line(x0, y, x1, y, C.ink, 3);
      for (let i = 0; i <= f.b; i++) g.line(lerp(x0, x1, i / f.b), y - 10, lerp(x0, x1, i / f.b), y, C.coral, 2);
      for (let i = 0; i <= f.d; i++) g.line(lerp(x0, x1, i / f.d), y, lerp(x0, x1, i / f.d), y + 10, C.teal, 2);
      g.text(num(lang, 0), x0, y + 32, 26, C.ink, "center", true);
      g.text(num(lang, 1), x1, y + 32, 26, C.ink, "center", true);
      // Each fraction's name on a scrap of paper beside its point.
      const tag = (v: number, ty: number, a: number, b: number, color: string) => {
        const x = lerp(x0, x1, v);
        g.card(x - 26, ty - 32, 52, 64, C.paper, 0.6);
        frac(g, num(lang, a), num(lang, b), x, ty, 26, color);
      };
      tag(va, 250, f.a, f.b, C.coral);
      tag(vc, 352, f.c, f.d, C.teal);
      g.dot(lerp(x0, x1, va), y, 10, C.coral);
      g.dot(lerp(x0, x1, vc), y, 10, C.teal);
      const s = sign(f.a, f.b, f.c, f.d);
      sum(g, [[num(lang, f.a), num(lang, f.b)], s, [num(lang, f.c), num(lang, f.d)]], W / 2, 450, 44, [C.coral, C.ink, C.teal]);
      g.text(lang === "id" ? "yang lebih ke kanan lebih besar" : "further right is bigger", W / 2, 530, 22, C.soft, "center", true);
      // Top and bottom of each fraction, each with its own buttons.
      const ctl = (key: string, x: number, yy: number, value: number, color: string) => {
        g.button(`${key}-`, "−", x, yy, 44, 40, color, true);
        g.text(num(lang, value), x + 70, yy + 20, 30, color, "center", true);
        g.button(`${key}+`, "+", x + 96, yy, 44, 40, color, true);
      };
      ctl("a", 60, 470, f.a, C.coral);
      ctl("b", 60, 535, f.b, C.coral);
      g.line(60, 522, 200, 522, C.ink, 2);
      ctl("c", 800, 470, f.c, C.teal);
      ctl("d", 800, 535, f.d, C.teal);
      g.line(800, 522, 940, 522, C.ink, 2);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "When the denominators are the same, every piece is the same size. The fraction with more coloured pieces is bigger.",
        id: "Bila penyebutnya sama, setiap potongan sama besar. Pecahan dengan lebih banyak potongan berwarna lebih besar.",
      },
      scene: sameDen,
    },
    {
      say: {
        en: "When the numerators are the same, look at the size of the pieces. Fewer cuts make bigger pieces.",
        id: "Bila pembilangnya sama, lihat ukuran potongannya. Makin sedikit potongan, makin besar setiap potongnya.",
      },
      scene: sameNum,
    },
    {
      say: {
        en: "When both are different, cut both strips into the same size of pieces. Then just count the coloured pieces.",
        id: "Bila keduanya berbeda, potong kedua pita menjadi potongan yang sama besar. Lalu cukup hitung potongan yang berwarna.",
      },
      scene: cutSame,
    },
    {
      say: {
        en: "Put both fractions on a number line from 0 to 1. The one further to the right is the bigger fraction.",
        id: "Letakkan kedua pecahan pada garis bilangan dari 0 sampai 1. Pecahan yang letaknya lebih ke kanan lebih besar.",
      },
      scene: line,
    },
  ],
};
