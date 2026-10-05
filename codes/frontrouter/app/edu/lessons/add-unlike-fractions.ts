import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { frac, gcd, lcm, num, strip, sum } from "../parts";

/** Pieces of a strip laid end to end from `x`, cut in `parts` per whole of width `w`. */
function pieces(g: Ink, x: number, y: number, w: number, h: number, count: number, parts: number, color: string) {
  const pw = w / parts;
  for (let i = 0; i < count; i++) {
    g.card(x + i * pw, y, pw, h, color, 0.8);
    g.c.strokeStyle = C.paper;
    g.c.lineWidth = 2;
    g.c.strokeRect(x + i * pw, y, pw, h);
  }
}

/** 1/2 and 1/3: pieces of different sizes cannot be counted together, until both are cut into sixths. */
function sixths(lang: Lang): Scene {
  let stage = 0;
  let changed = 0;
  let now = 0;
  const x = 200;
  const w = 600;
  return {
    press(id) {
      if (id === "go" && stage < 2) stage += 1;
      if (id === "again") stage = 0;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const k = ease(t, changed, 0.8);
      const cut = stage >= 1 ? (stage === 1 ? k : 1) : 0;
      // Half and a third, each on its own whole.
      strip(g, x, 50, w, 70, stage >= 1 ? 6 : 2, stage >= 1 ? 3 : 1, C.coral);
      strip(g, x, 160, w, 70, stage >= 1 ? 6 : 3, stage >= 1 ? 2 : 1, C.teal);
      if (stage === 1) {
        // The new creases appear one by one.
        g.c.fillStyle = `rgba(255, 253, 248, ${0.7 * (1 - cut)})`;
        g.c.fillRect(x, 50, w, 70);
        g.c.fillRect(x, 160, w, 70);
      }
      if (stage === 0) {
        frac(g, 1, 2, 120, 85, 32);
        frac(g, 1, 3, 120, 195, 32);
      } else {
        frac(g, 3, 6, 120, 85, 32, C.coral);
        frac(g, 2, 6, 120, 195, 32, C.teal);
      }
      // Below, the pieces put together on one whole.
      strip(g, x, 300, w, 80, stage >= 1 ? 6 : 1, 0, C.paper);
      const join = stage === 2 ? k : 0;
      if (stage < 2) {
        g.c.globalAlpha = 0.9;
        pieces(g, x, 300, w, 80, 1, 2, C.coral);
        pieces(g, x + w / 2, 300, w, 80, 1, 3, C.teal);
        g.c.globalAlpha = 1;
        g.text("?", x + w + 50, 340, 56, C.coral, "center", true);
      } else {
        pieces(g, x, 300, w, 80, 3, 6, C.coral);
        pieces(g, lerp(x + w, x + w / 2, join), 300, w, 80, 2, 6, C.teal);
      }
      if (stage === 0) {
        sum(g, [[1, 2], "+", [1, 3], "=", "?"], W / 2, 470, 46, [C.coral, C.ink, C.teal]);
        g.text(lang === "id" ? "potongannya beda ukuran, tidak bisa langsung dihitung" : "the pieces are different sizes, so they cannot be counted yet", W / 2, 540, 24, C.soft, "center", true);
      } else if (stage === 1) {
        sum(g, [[1, 2], "+", [1, 3], "=", [3, 6], "+", [2, 6]], W / 2, 470, 46, [C.coral, C.ink, C.teal, C.ink, C.coral, C.ink, C.teal]);
        g.text(lang === "id" ? "potong keduanya menjadi perenam: ukurannya sama" : "cut both into sixths: now every piece is the same size", W / 2, 540, 24, C.soft, "center", true);
      } else {
        sum(g, [[3, 6], "+", [2, 6], "=", [5, 6]], W / 2, 470, 46, [C.coral, C.ink, C.teal, C.ink, C.plum]);
        g.text(lang === "id" ? "3 perenam dan 2 perenam menjadi 5 perenam" : "3 sixths and 2 sixths make 5 sixths", W / 2, 540, 24, C.soft, "center", true);
      }
      g.button("go", stage === 0 ? (lang === "id" ? "POTONG SAMA" : "CUT THE SAME") : lang === "id" ? "GABUNGKAN" : "PUT TOGETHER", W - 300, 565, 260, 52, C.cobalt, stage < 2);
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", 40, 565, 190, 52, C.soft, stage > 0);
    },
  };
}

/** Jumps of 2 and of 3 along a line: where both land first is the size to cut into. */
function meet(lang: Lang): Scene {
  let a = 2;
  let b = 3;
  let changed = 0;
  let now = 0;
  const x0 = 60;
  const x1 = 940;
  const top = 30;
  return {
    press(id) {
      if (id === "a+") a = clamp(a + 1, 2, 8);
      if (id === "a-") a = clamp(a - 1, 2, 8);
      if (id === "b+") b = clamp(b + 1, 2, 8);
      if (id === "b-") b = clamp(b - 1, 2, 8);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const m = lcm(a, b);
      const end = Math.max(24, m);
      const xs = (n: number) => lerp(x0, x1, n / end);
      const lineAt = (y: number, step: number, color: string) => {
        g.line(x0, y, x1, y, C.ink, 2);
        for (let n = 0; n <= end; n++) g.line(xs(n), y - 5, xs(n), y + 5, C.soft, 1);
        const hops = Math.floor(end / step);
        const shown = Math.min(hops, Math.floor((t - changed) * 3));
        for (let j = 0; j < shown; j++) {
          const sx = xs(j * step);
          const ex = xs((j + 1) * step);
          g.c.strokeStyle = color;
          g.c.lineWidth = 3;
          g.c.beginPath();
          g.c.moveTo(sx, y);
          g.c.quadraticCurveTo((sx + ex) / 2, y - 60, ex, y);
          g.c.stroke();
          const land = (j + 1) * step;
          g.dot(ex, y, land % a === 0 && land % b === 0 ? 10 : 6, land % a === 0 && land % b === 0 ? C.sun : color);
          g.text(num(lang, land), ex, y + 24, 18, color, "center", true);
        }
      };
      lineAt(top + 130, a, C.coral);
      lineAt(top + 290, b, C.teal);
      // The first place both land.
      const ready = m / Math.min(a, b) / 3 + 0.3;
      const k = ease(t, changed + ready, 0.4);
      if (k > 0) {
        g.c.setLineDash([8, 8]);
        g.line(xs(m), top + 60, xs(m), top + 350, C.ink, 3);
        g.c.setLineDash([]);
        g.c.globalAlpha = k;
        g.card(xs(m) - 120, top + 370, 240, 60, C.sun, 1);
        g.text(lang === "id" ? `bertemu di ${m}` : `they meet at ${m}`, xs(m), top + 400, 26, C.ink, "center", true);
        g.c.globalAlpha = 1;
      }
      g.text(lang === "id" ? `lompat ${a}` : `jumps of ${a}`, x0, top + 70, 24, C.coral, "left", true);
      g.text(lang === "id" ? `lompat ${b}` : `jumps of ${b}`, x0, top + 230, 24, C.teal, "left", true);
      g.text(lang === "id" ? `KPK ${a} dan ${b} = ${m}: potong menjadi per-${m}` : `least common multiple of ${a} and ${b} is ${m}: cut into ${m}ths`, W / 2, 500, 24, C.ink, "center", true);
      g.button("a-", "−", 60, 555, 56, 52, C.coral, a > 2);
      g.text(String(a), 150, 581, 34, C.coral, "center", true);
      g.button("a+", "+", 184, 555, 56, 52, C.coral, a < 8);
      g.button("b-", "−", W - 240, 555, 56, 52, C.teal, b > 2);
      g.text(String(b), W - 150, 581, 34, C.teal, "center", true);
      g.button("b+", "+", W - 116, 555, 56, 52, C.teal, b < 8);
    },
  };
}

/** Any two fractions, added or taken away, after both are cut to the same size. */
function any(lang: Lang): Scene {
  const f = { a: 1, b: 4, c: 2, d: 3 };
  let minus = false;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      const [key, sign] = [id[0] as keyof typeof f, id[1]];
      if (id === "op") minus = !minus;
      else if (key in f) {
        f[key] += sign === "+" ? 1 : -1;
        f.b = clamp(f.b, 2, 10);
        f.d = clamp(f.d, 2, 10);
        f.a = clamp(f.a, 1, f.b - 1);
        f.c = clamp(f.c, 1, f.d - 1);
      }
      changed = now;
    },
    draw(g, t) {
      now = t;
      // The bigger one first when taking away.
      let [a, b, c, d] = [f.a, f.b, f.c, f.d];
      if (minus && a * d < c * b) [a, b, c, d] = [c, d, a, b];
      const m = lcm(b, d);
      const p = (a * m) / b;
      const q = (c * m) / d;
      const r = minus ? p - q : p + q;
      const k = ease(t, changed + 0.3, 0.7);
      const wholes = r > m ? 2 : 1;
      const w = wholes === 2 ? 400 : 700;
      const x = (W - w * wholes - (wholes - 1) * 20) / 2;
      strip(g, x, 40, w, 56, k > 0.5 ? m : b, k > 0.5 ? p : a, C.coral);
      strip(g, x, 116, w, 56, k > 0.5 ? m : d, k > 0.5 ? q : c, C.teal);
      // The result: added end to end, or the second taken off the first.
      for (let i = 0; i < wholes; i++) strip(g, x + i * (w + 20), 220, w, 70, m, 0, C.paper);
      const pw = w / m;
      for (let n = 0; n < (minus ? p : r); n++) {
        const color = minus ? (n >= r ? "rgba(242, 113, 107, 0.25)" : C.coral) : n < p ? C.coral : C.teal;
        const px = x + (n % m) * pw + Math.floor(n / m) * (w + 20);
        g.card(px, 220, pw, 70, color, 0.6);
        g.c.strokeStyle = C.paper;
        g.c.lineWidth = 2;
        g.c.strokeRect(px, 220, pw, 70);
      }
      if (minus && q > 0) {
        // The pieces taken away lifted off.
        g.c.globalAlpha = k;
        for (let n = r; n < p; n++) {
          const px = x + (n % m) * pw + Math.floor(n / m) * (w + 20);
          g.card(px, 220 - 60 * k, pw, 40, C.teal, 1);
        }
        g.c.globalAlpha = 1;
      }
      const g1 = gcd(r, m);
      const parts: (string | [number, number])[] = [[a, b], minus ? "−" : "+", [c, d], "=", [p, m], minus ? "−" : "+", [q, m], "=", [r, m]];
      const colors = [C.coral, C.ink, C.teal, C.ink, C.coral, C.ink, C.teal, C.ink, C.plum];
      if (g1 > 1 && r > 0) {
        parts.push("=", [r / g1, m / g1]);
        colors.push(C.ink, C.plum);
      }
      sum(g, parts, W / 2, 380, 40, colors);
      // The four numbers and the sign, each with its own buttons.
      const ctl = (key: string, x0: number, y0: number, value: number) => {
        g.button(`${key}-`, "−", x0, y0, 44, 40, C.soft, true);
        g.text(String(value), x0 + 70, y0 + 20, 30, C.ink, "center", true);
        g.button(`${key}+`, "+", x0 + 96, y0, 44, 40, C.soft, true);
      };
      ctl("a", 120, 470, f.a);
      ctl("b", 120, 530, f.b);
      ctl("c", 700, 470, f.c);
      ctl("d", 700, 530, f.d);
      g.line(120, 519, 260, 519, C.ink, 2);
      g.line(700, 519, 840, 519, C.ink, 2);
      g.button("op", minus ? "−" : "+", W / 2 - 50, 490, 100, 70, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A half and a third are pieces of different sizes. Cut both into sixths and they can be counted together.",
        id: "Setengah dan sepertiga potongannya berbeda ukuran. Potong keduanya menjadi perenam, baru bisa dihitung bersama.",
      },
      scene: sixths,
    },
    {
      say: {
        en: "Which size fits both? Jump by each denominator: the first number where both land is the least common multiple.",
        id: "Ukuran apa yang cocok untuk keduanya? Lompat sebesar tiap penyebut: bilangan pertama tempat keduanya mendarat adalah KPK.",
      },
      scene: meet,
    },
    {
      say: {
        en: "Change the fractions and the sign. Both are cut to the same size first, then the pieces are added or taken away.",
        id: "Ubah pecahan dan tandanya. Keduanya dipotong sama besar dulu, lalu potongannya dijumlahkan atau dikurangkan.",
      },
      scene: any,
    },
  ],
};
