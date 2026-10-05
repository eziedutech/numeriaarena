import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { frac, gcd, num, strip, sum } from "../parts";

type Part = string | [number | string, number | string];

/** A minus, a value and a plus in a row with a small name above. */
function stepper(g: Ink, key: string, x: number, y: number, value: string, name: string, on: [boolean, boolean], color: string) {
  if (name) g.text(name, x + 97, y - 18, 18, C.soft, "center", true);
  g.button(`${key}-`, "−", x, y, 64, 52, color, on[0]);
  g.text(value, x + 97, y + 26, 34, color, "center", true);
  g.button(`${key}+`, "+", x + 130, y, 64, 52, color, on[1]);
}

/** p/q written as a whole, a mixed number or a fraction, ready for `sum`. */
function mixed(p: number, q: number): Part[] {
  const w = Math.floor(p / q);
  const r = p % q;
  if (r === 0) return [String(w)];
  const k = gcd(r, q);
  return w > 0 ? [String(w), [r / k, q / k]] : [[r / k, q / k]];
}

/** n strips of a/b each; their pieces fly one by one into wholes, and n × a/b is counted there. */
function repeat(lang: Lang): Scene {
  const f = { a: 2, b: 3, n: 4 };
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      const key = id[0] as keyof typeof f;
      f[key] += id[1] === "+" ? 1 : -1;
      f.b = clamp(f.b, 2, 6);
      f.a = clamp(f.a, 1, f.b - 1);
      f.n = clamp(f.n, 1, 5);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const { a, b, n } = f;
      const total = n * a;
      const wholes = Math.ceil(total / b);
      const lw = 300;
      const rw = 400;
      const h = 40;
      const rowY = (i: number) => 60 + i * 62;
      const when = (k: number) => changed + 0.6 + 0.18 * k;
      for (let i = 0; i < n; i++) {
        strip(g, 60, rowY(i), lw, h, b, 0, C.paper, 0.8);
        frac(g, a, b, 400, rowY(i) + h / 2, 20, C.coral);
      }
      for (let j = 0; j < wholes; j++) {
        strip(g, 480, rowY(j), rw, h, b, 0, C.paper, 0.8);
        g.text(String(j + 1), 912, rowY(j) + h / 2, 22, C.soft, "center", true);
      }
      // Each piece leaves its strip and lands in the next free part of a whole.
      for (let k = 0; k < total; k++) {
        const i = Math.floor(k / a);
        const sx = 60 + (k % a) * (lw / b);
        const sy = rowY(i);
        const ex = 480 + (k % b) * (rw / b);
        const ey = rowY(Math.floor(k / b));
        const m = ease(t, when(k), 0.5);
        if (m < 1) {
          g.c.fillStyle = m > 0 ? "rgba(242, 113, 107, 0.25)" : C.coral;
          g.c.fillRect(sx + 1, sy + 1, lw / b - 2, h - 2);
        }
        if (m > 0) {
          const x = lerp(sx, ex, m);
          const y = lerp(sy, ey, m) - Math.sin(m * Math.PI) * 40;
          const w = lerp(lw / b, rw / b, m);
          g.card(x + 1, y + 1, w - 2, h - 2, k < b * Math.floor(total / b) ? C.coral : "#f59a95", m < 1 ? 1.4 : 0.4);
        }
      }
      const shown = clamp(Math.floor((t - changed - 0.6) / 0.18) + 1, 0, total);
      g.text(lang === "id" ? `${shown} bagian` : `${shown} part${shown === 1 ? "" : "s"}`, 670, 60 + wholes * 62 + 14, 22, C.coral, "center", true);
      const k = ease(t, when(total) + 0.3, 0.5);
      const parts: Part[] = [[a, b], "×", String(n), "=", [total, b]];
      const colors = [C.coral, C.soft, C.cobalt, C.soft, C.coral];
      if (total >= b || gcd(total, b) > 1) {
        parts.push("=", ...mixed(total, b));
        colors.push(C.soft, C.plum, C.plum);
      }
      g.c.globalAlpha = 0.35 + 0.65 * k;
      sum(g, parts, W / 2, 440, 40, colors);
      g.c.globalAlpha = 1;
      stepper(g, "a", 110, 555, String(a), lang === "id" ? "pembilang" : "numerator", [a > 1, a < b - 1], C.coral);
      stepper(g, "b", 400, 555, String(b), lang === "id" ? "penyebut" : "denominator", [b > 2, b < 6], C.coral);
      stepper(g, "n", 690, 555, String(n), lang === "id" ? "dikali" : "times", [n > 1, n < 5], C.cobalt);
    },
  };
}

const TOTALS = [20, 12, 24, 30];
const divisors = (n: number) => [2, 3, 4, 5, 6].filter((d) => n % d === 0);

/** Sweets dealt one by one onto b plates; a of the plates light up as a/b of all the sweets. */
function share(lang: Lang): Scene {
  let ti = 0;
  let b = 4;
  let a = 3;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      const total = TOTALS[ti];
      if (id === "total") {
        ti = (ti + 1) % TOTALS.length;
        const ds = divisors(TOTALS[ti]);
        if (!ds.includes(b)) b = ds[ds.length - 1];
      } else if (id === "b+" || id === "b-") {
        const ds = divisors(total);
        b = ds[clamp(ds.indexOf(b) + (id === "b+" ? 1 : -1), 0, ds.length - 1)];
      } else if (id === "a+") a += 1;
      else if (id === "a-") a -= 1;
      a = clamp(a, 1, b);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const total = TOTALS[ti];
      const m = total / b;
      const gap = 16;
      const pw = (880 - (b - 1) * gap) / b;
      const py = 150;
      const ph = 230;
      const cols = Math.min(m, Math.floor((pw - 16) / 36));
      const rows = Math.ceil(m / cols);
      const dealt = changed + 0.4 + 0.05 * total + 0.6;
      const lit = ease(t, dealt + 0.2, 0.5);
      for (let j = 0; j < b; j++) {
        const x = 60 + j * (pw + gap);
        const on = j < a && lit > 0;
        g.card(x, py - (on ? 4 * pulse(t) * lit : 0), pw, ph, on ? "#fff0c4" : C.field, 0.8);
        frac(g, 1, b, x + pw / 2, py + ph + 36, 22, on ? C.coral : C.soft);
      }
      for (let i = 0; i < total; i++) {
        const j = i % b;
        const slot = Math.floor(i / b);
        const hx = 500 + Math.sin(i * 12.9898) * 70;
        const hy = 82 + Math.cos(i * 4.1414) * 22;
        const px = 60 + j * (pw + gap) + pw / 2 + ((slot % cols) - (cols - 1) / 2) * 36;
        const pyy = py + ph / 2 + (Math.floor(slot / cols) - (rows - 1) / 2) * 36;
        const k = ease(t, changed + 0.4 + 0.05 * i, 0.6);
        const x = lerp(hx, px, k);
        const y = lerp(hy, pyy, k) - Math.sin(k * Math.PI) * 30;
        const color = j < a && lit > 0.5 ? C.coral : C.plum;
        g.dot(x + 1.5, y + 3, 13, "rgba(70, 50, 25, 0.22)");
        g.dot(x, y, 13, color);
        g.dot(x - 4, y - 4, 4, "rgba(255, 255, 255, 0.6)");
      }
      const div = lang === "id" ? ":" : "÷";
      const res = m * a;
      g.c.globalAlpha = 0.35 + 0.65 * lit;
      sum(
        g,
        [[a, b], lang === "id" ? "dari" : "of", num(lang, total), "=", `${num(lang, total)} ${div} ${b} × ${a}`, "=", num(lang, res)],
        W / 2,
        488,
        34,
        [C.coral, C.soft, C.plum, C.soft, C.ink, C.soft, C.coral],
      );
      g.c.globalAlpha = 1;
      g.button("total", lang === "id" ? `${total} PERMEN` : `${total} SWEETS`, 60, 555, 210, 52, C.plum);
      stepper(g, "a", 400, 555, String(a), lang === "id" ? "pembilang" : "numerator", [a > 1, a < b], C.coral);
      const ds = divisors(total);
      stepper(g, "b", 680, 555, String(b), lang === "id" ? "penyebut" : "denominator", [ds.indexOf(b) > 0, ds.indexOf(b) < ds.length - 1], C.coral);
    },
  };
}

/** A square cut one way for the first fraction and across for the second; where both overlap is the product. */
function area(lang: Lang): Scene {
  const f = { a: 2, b: 3, c: 3, d: 4 };
  const shown = { w: 2 / 3, h: 3 / 4 };
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      const key = id[0] as keyof typeof f;
      f[key] += id[1] === "+" ? 1 : -1;
      f.b = clamp(f.b, 2, 6);
      f.d = clamp(f.d, 2, 6);
      f.a = clamp(f.a, 1, f.b);
      f.c = clamp(f.c, 1, f.d);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const { a, b, c, d } = f;
      shown.w += (a / b - shown.w) * 0.15;
      shown.h += (c / d - shown.h) * 0.15;
      const x = 90;
      const y = 100;
      const S = 380;
      g.card(x, y, S, S, C.paper, 1);
      g.c.fillStyle = "rgba(52, 105, 196, 0.32)";
      g.c.fillRect(x, y, S * shown.w, S);
      g.c.fillStyle = "rgba(242, 113, 107, 0.32)";
      g.c.fillRect(x, y, S, S * shown.h);
      const glow = 0.55 + 0.35 * pulse(t, 2);
      g.c.fillStyle = `rgba(155, 107, 196, ${glow})`;
      g.c.fillRect(x, y, S * shown.w, S * shown.h);
      for (let i = 1; i < b; i++) g.line(x + (S * i) / b, y, x + (S * i) / b, y + S, "rgba(52, 105, 196, 0.8)", 2);
      for (let j = 1; j < d; j++) g.line(x, y + (S * j) / d, x + S, y + (S * j) / d, "rgba(242, 113, 107, 0.9)", 2);
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(x, y, S, S);
      frac(g, a, b, x + (S * shown.w) / 2, 56, 24, C.cobalt);
      frac(g, c, d, 50, y + (S * shown.h) / 2, 24, C.coral);
      // The overlap counted: pieces inside it over pieces in the whole square.
      const cx = 740;
      const k = ease(t, changed + 0.5, 0.5);
      sum(g, [[a, b], "×", [c, d], "=", [a * c, b * d]], cx, 100, 44, [C.cobalt, C.soft, C.coral, C.soft, C.plum]);
      g.c.globalAlpha = k;
      const over = lang === "id" ? `yang bertumpuk: ${a} × ${c} = ${a * c} kotak` : `overlap: ${a} × ${c} = ${a * c} pieces`;
      const all = lang === "id" ? `seluruhnya: ${b} × ${d} = ${b * d} kotak` : `whole square: ${b} × ${d} = ${b * d} pieces`;
      let z = 26;
      while (z > 18 && Math.max(g.width(over, z, true), g.width(all, z, true)) > 420) z -= 1;
      g.text(over, cx, 200, z, C.plum, "center", true);
      g.text(all, cx, 240, z, C.ink, "center", true);
      g.c.globalAlpha = 1;
      const top = lang === "id" ? "pembilang" : "numerator";
      const bottom = lang === "id" ? "penyebut" : "denominator";
      stepper(g, "a", 530, 330, String(a), top, [a > 1, a < b], C.cobalt);
      stepper(g, "b", 760, 330, String(b), bottom, [b > 2, b < 6], C.cobalt);
      stepper(g, "c", 530, 440, String(c), top, [c > 1, c < d], C.coral);
      stepper(g, "d", 760, 440, String(d), bottom, [d > 2, d < 6], C.coral);
      g.text(lang === "id" ? "geser garis dengan tombol di atas" : "the buttons move the cuts", 280, 540, 20, C.soft, "center", true);
    },
  };
}

const DIVISORS: [number, number][] = [
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
  [2, 3],
  [3, 4],
];

/** Pieces of a/b hop along w wholes, counted as they land; the count matches w times b/a. */
function fits(lang: Lang): Scene {
  let w = 3;
  let di = 2;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "w+") w = clamp(w + 1, 1, 4);
      if (id === "w-") w = clamp(w - 1, 1, 4);
      if (id === "f+") di = clamp(di + 1, 0, DIVISORS.length - 1);
      if (id === "f-") di = clamp(di - 1, 0, DIVISORS.length - 1);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [a, b] = DIVISORS[di];
      const L = 210;
      const x0 = 80;
      const pl = (L * a) / b;
      const q = Math.floor((w * b) / a);
      const r = (w * b) % a;
      const iv = Math.min(0.5, 6 / q);
      const start = changed + 0.6;
      for (let i = 0; i < w; i++) strip(g, x0 + i * L, 110, L, 60, b, b, "#f8efdc", 0.8);
      for (let i = 0; i <= w; i++) g.text(String(i), x0 + i * L, 92, 22, C.soft, "center", true);
      let landed = 0;
      for (let i = 0; i < q; i++) {
        const k = clamp((t - (start + i * iv)) / iv, 0, 1);
        if (k <= 0) continue;
        if (k >= 1) landed += 1;
        const sx = i === 0 ? x0 : x0 + (i - 1) * pl;
        const x = lerp(sx, x0 + i * pl, ease(k));
        const y = 200 - Math.sin(k * Math.PI) * 60;
        g.card(x + 1, y, pl - 2, 46, i % 2 ? C.teal : C.cobalt, k < 1 ? 1.5 : 0.7);
        if (k >= 1 && pl > 24) g.text(String(i + 1), x + pl / 2, y + 23, pl > 40 ? 22 : 18, C.paper, "center", true);
      }
      const tail = ease(t, start + q * iv, 0.5);
      if (r > 0 && tail > 0) {
        // What is left over is a part of one more piece.
        const x = x0 + q * pl;
        g.c.globalAlpha = tail;
        g.card(x + 1, 200, (pl * r) / a - 2, 46, C.sun, 0.7);
        g.c.setLineDash([6, 5]);
        g.c.strokeStyle = C.ink;
        g.c.lineWidth = 2;
        g.c.strokeRect(x + 1, 200, pl - 2, 46);
        g.c.setLineDash([]);
        const kk = gcd(r, a);
        frac(g, r / kk, a / kk, x + pl / 2, 280, 20, C.ink);
        g.c.globalAlpha = 1;
      }
      const piece = lang === "id" ? "potongan yang muat" : "pieces that fit";
      g.text(`${piece}: ${landed}`, W / 2, 330, 30, C.cobalt, "center", true);
      const div = lang === "id" ? ":" : "÷";
      const parts: Part[] = [String(w), div, [a, b], "=", String(w), "×", [b, a], "=", ...mixed(w * b, a)];
      const colors = [C.ink, C.soft, C.cobalt, C.soft, C.ink, C.soft, C.coral, C.soft, C.plum, C.plum];
      g.c.globalAlpha = 0.3 + 0.7 * tail;
      sum(g, parts, W / 2, 420, 40, colors);
      g.text(lang === "id" ? "membagi dengan pecahan = mengalikan dengan kebalikannya" : "dividing by a fraction = multiplying by it flipped", W / 2, 490, 22, C.soft, "center", true);
      g.c.globalAlpha = 1;
      stepper(g, "w", 170, 555, String(w), lang === "id" ? "bilangan bulat" : "wholes", [w > 1, w < 4], C.ink);
      const fx = 600;
      g.text(lang === "id" ? "pembagi" : "divide by", fx + 97, 537, 18, C.soft, "center", true);
      g.button("f-", "−", fx, 555, 64, 52, C.cobalt, di > 0);
      frac(g, a, b, fx + 97, 581, 22, C.cobalt);
      g.button("f+", "+", fx + 130, 555, 64, 52, C.cobalt, di < DIVISORS.length - 1);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A fraction times a whole number is the same fraction added again and again. Watch the pieces gather into wholes.",
        id: "Pecahan dikali bilangan bulat sama dengan pecahan itu dijumlahkan berulang kali. Lihat potongannya terkumpul menjadi utuh.",
      },
      scene: repeat,
    },
    {
      say: {
        en: "To find 3/4 of 20 sweets, share them onto 4 plates, then take 3 of the plates.",
        id: "Untuk mencari 3/4 dari 20 permen, bagikan ke 4 piring, lalu ambil 3 piring.",
      },
      scene: share,
    },
    {
      say: {
        en: "Shade one fraction down and the other across. Where the two overlap is the product: multiply the tops and the bottoms.",
        id: "Arsir satu pecahan ke bawah dan yang lain ke samping. Bagian yang bertumpuk adalah hasil kalinya: kalikan pembilang dan penyebutnya.",
      },
      scene: area,
    },
    {
      say: {
        en: "Dividing by a fraction counts how many pieces fit: 1/4 fits into 3 twelve times. That is 3 × 4, the fraction flipped.",
        id: "Membagi dengan pecahan berarti menghitung berapa potongan yang muat: 1/4 muat 12 kali dalam 3. Itu sama dengan 3 × 4, pecahannya dibalik.",
      },
      scene: fits,
    },
  ],
};
