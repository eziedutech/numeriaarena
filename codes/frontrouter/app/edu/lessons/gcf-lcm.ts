import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { gcd, lcm, num } from "../parts";

const factorsOf = (n: number) => [...Array(n).keys()].map((i) => i + 1).filter((i) => n % i === 0);

/** The primes of n, smallest first: 12 gives 2, 2, 3. */
const primesOf = (n: number) => {
  const out: number[] = [];
  let m = n;
  for (let p = 2; m > 1; p++) {
    while (m % p === 0) {
      out.push(p);
      m /= p;
    }
  }
  return out;
};

/** A minus, a value and a plus in a row, the value between the two buttons. */
function stepper(g: Ink, lang: Lang, key: string, x: number, value: number, lo: number, hi: number, color: string) {
  g.button(`${key}-`, "−", x, 555, 64, 52, color, value > lo);
  g.text(num(lang, value), x + 97, 581, 34, color, "center", true);
  g.button(`${key}+`, "+", x + 130, 555, 64, 52, color, value < hi);
}

/** The factors of two numbers in two rows: the ones they share light up, and the biggest of them is the GCF. */
function shared(lang: Lang): Scene {
  let a = 12;
  let b = 18;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "a+") a = clamp(a + 1, 2, 40);
      if (id === "a-") a = clamp(a - 1, 2, 40);
      if (id === "b+") b = clamp(b + 1, 2, 40);
      if (id === "b-") b = clamp(b - 1, 2, 40);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const fa = factorsOf(a);
      const fb = factorsOf(b);
      const common = fa.filter((f) => b % f === 0);
      const top = gcd(a, b);
      const S = 66;
      const gap = 12;
      const x0 = 250;
      const since = t - changed;
      const lit = (f: number) => common.includes(f) && since > 1.2 + 0.3 * common.indexOf(f);
      const best = since > 1.4 + 0.3 * common.length;
      const xOf = (fs: number[], f: number) => x0 + fs.indexOf(f) * (S + gap);
      const row = (fs: number[], y: number, n: number, color: string) => {
        g.text(lang === "id" ? `faktor ${num(lang, n)}` : `factors of ${num(lang, n)}`, 40, y + S / 2, 24, color, "left", true);
        fs.forEach((f, i) => {
          const k = ease(t, changed + 0.07 * i, 0.35);
          const on = lit(f);
          const lift = best && f === top ? 5 * pulse(t) : 0;
          const x = x0 + i * (S + gap);
          const y1 = y - (1 - k) * 24 - lift;
          g.c.globalAlpha = k;
          g.card(x, y1, S, S, on ? C.sun : C.paper, on ? 1.2 : 0.8);
          if (best && f === top) {
            g.c.strokeStyle = C.coral;
            g.c.lineWidth = 4;
            g.c.strokeRect(x - 4, y1 - 4, S + 8, S + 8);
          }
          g.text(num(lang, f), x + S / 2, y1 + S / 2, 28, on ? C.ink : color, "center", true);
          g.c.globalAlpha = 1;
        });
      };
      // Each shared factor is tied to its twin in the other row.
      g.c.setLineDash([6, 6]);
      common.forEach((f) => {
        if (lit(f)) g.line(xOf(fa, f) + S / 2, 70 + S, xOf(fb, f) + S / 2, 200, C.ink, 2);
      });
      g.c.setLineDash([]);
      row(fa, 70, a, C.coral);
      row(fb, 200, b, C.teal);
      g.c.globalAlpha = ease(t, changed + 1.2, 0.4);
      const list = common.map((f) => num(lang, f)).join(", ");
      g.text(lang === "id" ? `faktor persekutuan: ${list}` : `common factors: ${list}`, W / 2, 330, 28, C.ink, "center", true);
      g.c.globalAlpha = best ? 1 : 0;
      g.card(W / 2 - 280, 380, 560, 76, C.sun, 1);
      g.text(lang === "id" ? `FPB ${num(lang, a)} dan ${num(lang, b)} = ${num(lang, top)}` : `GCF of ${num(lang, a)} and ${num(lang, b)} = ${num(lang, top)}`, W / 2, 418, 36, C.ink, "center", true);
      g.c.globalAlpha = 1;
      stepper(g, lang, "a", 40, a, 2, 40, C.coral);
      stepper(g, lang, "b", W - 234, b, 2, 40, C.teal);
    },
  };
}

const PAIRS: [number, number][] = [
  [12, 18],
  [24, 36],
  [20, 30],
  [16, 40],
  [18, 27],
  [28, 42],
];

/** A factor tree that splits off the smallest prime at each level, grown up to `shown` levels. */
function tree(g: Ink, lang: Lang, n: number, mid: number, shown: number, color: string) {
  const ps = primesOf(n);
  const splits = ps.length - 1;
  let x = mid - (55 * (splits - 1)) / 2;
  let y = 60;
  let rest = n;
  g.text(num(lang, n), x, y, 34, color, "center", true);
  for (let i = 0; i < splits; i++) {
    const k = clamp(shown - i, 0, 1);
    if (k <= 0) return;
    const p = ps[i];
    rest /= p;
    const ny = y + 58;
    g.c.globalAlpha = k;
    g.line(x - 8, y + 18, lerp(x, x - 50, k), lerp(y + 18, ny - 22, k), C.soft, 3);
    g.line(x + 8, y + 18, lerp(x, x + 50, k), lerp(y + 18, ny - 22, k), C.soft, 3);
    g.dot(x - 55, ny, 24, color);
    g.text(num(lang, p), x - 55, ny, 26, C.paper, "center", true);
    if (i === splits - 1) {
      g.dot(x + 55, ny, 24, color);
      g.text(num(lang, rest), x + 55, ny, 26, C.paper, "center", true);
    } else g.text(num(lang, rest), x + 55, ny, 30, C.ink, "center", true);
    g.c.globalAlpha = 1;
    x += 55;
    y = ny;
  }
}

/** Two factor trees down to primes; the primes lined up in columns show what both share (GCF) and what covers both (LCM). */
function trees(lang: Lang): Scene {
  let i = 0;
  let changed = 0;
  let now = 0;
  return {
    press() {
      i = (i + 1) % PAIRS.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [a, b] = PAIRS[i];
      const since = t - changed;
      tree(g, lang, a, 250, since / 0.6, C.coral);
      tree(g, lang, b, 750, since / 0.6, C.teal);
      // One column for each prime, as many times as the number using it most.
      const pa = primesOf(a);
      const pb = primesOf(b);
      const cols: { p: number; inA: boolean; inB: boolean }[] = [];
      [...new Set([...pa, ...pb])].sort((x, y) => x - y).forEach((p) => {
        const ca = pa.filter((q) => q === p).length;
        const cb = pb.filter((q) => q === p).length;
        for (let j = 0; j < Math.max(ca, cb); j++) cols.push({ p, inA: j < ca, inB: j < cb });
      });
      const S = 54;
      const step = S + 12;
      const x0 = 360;
      const k = ease(t, changed + 2.2, 0.5);
      const mark = ease(t, changed + 2.9, 0.5);
      g.c.globalAlpha = k;
      g.text(`${num(lang, a)} =`, x0 - 20, 322, 30, C.coral, "right", true);
      g.text(`${num(lang, b)} =`, x0 - 20, 394, 30, C.teal, "right", true);
      cols.forEach((col, j) => {
        const x = x0 + j * step;
        if (col.inA && col.inB) {
          g.c.globalAlpha = k * mark;
          g.card(x - 6, 289, S + 12, 138, C.sun, 0.6);
          g.c.globalAlpha = k;
        }
        if (col.inA) {
          g.card(x, 295, S, S, C.coral, 0.8);
          g.text(num(lang, col.p), x + S / 2, 322, 28, C.paper, "center", true);
        }
        if (col.inB) {
          g.card(x, 367, S, S, C.teal, 0.8);
          g.text(num(lang, col.p), x + S / 2, 394, 28, C.paper, "center", true);
        }
      });
      g.c.globalAlpha = 1;
      const both = cols.filter((c) => c.inA && c.inB).map((c) => num(lang, c.p));
      const all = cols.map((c) => num(lang, c.p));
      g.c.globalAlpha = ease(t, changed + 3.4, 0.5);
      g.text(`${lang === "id" ? "FPB" : "GCF"} = ${both.join(" × ")} = ${num(lang, gcd(a, b))}`, W / 2, 470, 28, C.ink, "center", true);
      g.c.globalAlpha = ease(t, changed + 4, 0.5);
      g.text(`${lang === "id" ? "KPK" : "LCM"} = ${all.join(" × ")} = ${num(lang, lcm(a, b))}`, W / 2, 512, 28, C.plum, "center", true);
      g.c.globalAlpha = 1;
      g.button("next", lang === "id" ? "PASANGAN LAIN" : "ANOTHER PAIR", W / 2 - 140, 555, 280, 52, C.cobalt);
    },
  };
}

const RECTS: [number, number][] = [
  [18, 12],
  [12, 8],
  [24, 16],
  [15, 10],
  [20, 12],
  [12, 9],
];

/** Square tiles laid over a rectangle: a size that fits both sides leaves nothing over, and the biggest is the GCF. */
function tiles(lang: Lang): Scene {
  let i = 0;
  let s = 1;
  let changed = 0;
  let now = 0;
  const fit = new Set<number>();
  return {
    press(id) {
      const [a, b] = RECTS[i];
      if (id === "s+") s = clamp(s + 1, 1, Math.min(a, b));
      if (id === "s-") s = clamp(s - 1, 1, Math.min(a, b));
      if (id === "next") {
        i = (i + 1) % RECTS.length;
        s = 1;
        fit.clear();
      }
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [a, b] = RECTS[i];
      const u = Math.min(520 / a, 400 / b);
      const rw = a * u;
      const rh = b * u;
      const x = 90;
      const y = 70;
      g.card(x, y, rw, rh, C.field, 1);
      for (let n = 1; n < a; n++) g.line(x + n * u, y, x + n * u, y + rh, C.fold, 1);
      for (let n = 1; n < b; n++) g.line(x, y + n * u, x + rw, y + n * u, C.fold, 1);
      const cols = Math.floor(a / s);
      const rows = Math.floor(b / s);
      const total = cols * rows;
      const ok = a % s === 0 && b % s === 0;
      const shown = Math.min(total, Math.floor((t - changed) * Math.max(6, total / 1.4)));
      const done = shown >= total;
      if (ok && done) fit.add(s);
      for (let n = 0; n < shown; n++) {
        const tx = x + (n % cols) * s * u;
        const ty = y + Math.floor(n / cols) * s * u;
        g.card(tx + 2, ty + 2, s * u - 4, s * u - 4, ok ? C.teal : C.cobalt, 0.7);
      }
      if (!ok && done) {
        // What no whole tile can cover.
        g.c.fillStyle = "rgba(242, 113, 107, 0.45)";
        g.c.fillRect(x + cols * s * u, y, rw - cols * s * u, rh);
        g.c.fillRect(x, y + rows * s * u, cols * s * u, rh - rows * s * u);
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(x, y, rw, rh);
      g.text(num(lang, a), x + rw / 2, y - 28, 26, C.ink, "center", true);
      g.text(num(lang, b), x - 32, y + rh / 2, 26, C.ink, "center", true);

      const cx = 810;
      g.text(`${num(lang, a)} × ${num(lang, b)}`, cx, 90, 34, C.ink, "center", true);
      g.text(lang === "id" ? `persegi ${num(lang, s)} × ${num(lang, s)}` : `square tiles ${num(lang, s)} × ${num(lang, s)}`, cx, 145, 24, C.cobalt, "center", true);
      if (done) {
        if (ok) g.text(lang === "id" ? "pas, tanpa sisa" : "they fit, nothing left", cx, 200, 26, C.teal, "center", true);
        else g.text(lang === "id" ? "ada sisa" : "some is left over", cx, 200, 26, C.coral, "center", true);
      }
      const sizes = [...fit].sort((p, q) => p - q);
      if (sizes.length) {
        g.text(lang === "id" ? "yang pas:" : "these fit:", cx, 262, 22, C.soft, "center", true);
        const x1 = cx - (sizes.length * 64 - 8) / 2;
        sizes.forEach((v, j) => {
          g.card(x1 + j * 64, 286, 56, 48, C.paper, 1);
          g.text(num(lang, v), x1 + j * 64 + 28, 310, 26, C.teal, "center", true);
        });
      }
      const top = gcd(a, b);
      if (fit.has(top)) {
        const k = ease(t, changed, 0.5);
        g.c.globalAlpha = s === top ? k : 1;
        g.card(cx - 150, 380, 300, 92, C.sun, 1);
        g.text(lang === "id" ? "persegi terbesar" : "the biggest square", cx, 404, 22, C.ink, "center", true);
        g.text(`${lang === "id" ? "FPB" : "GCF"} = ${num(lang, top)}`, cx, 444, 34, C.ink, "center", true);
        g.c.globalAlpha = 1;
      }
      g.text(lang === "id" ? "sisi persegi" : "tile side", 137, 530, 22, C.soft, "center", true);
      stepper(g, lang, "s", 40, s, 1, Math.min(a, b), C.cobalt);
      g.button("next", lang === "id" ? "UKURAN LAIN" : "ANOTHER SIZE", W - 300, 555, 260, 52, C.soft);
    },
  };
}

/** Two lamps blinking every a and every b minutes: they first blink together again at the LCM. */
function lamps(lang: Lang): Scene {
  let a = 4;
  let b = 6;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "a+") a = clamp(a + 1, 2, 10);
      if (id === "a-") a = clamp(a - 1, 2, 10);
      if (id === "b+") b = clamp(b + 1, 2, 10);
      if (id === "b-") b = clamp(b - 1, 2, 10);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const m = lcm(a, b);
      const end = m * 2;
      // The whole line takes nine seconds, then rests two and starts again.
      const speed = end / 9;
      const minute = Math.min(end, ((t - changed) * speed) % (end + speed * 2));
      const flash = speed * 0.35;
      const litA = minute % a < flash;
      const litB = minute % b < flash;
      const lamp = (x: number, lit: boolean, color: string, every: number) => {
        g.line(x, 120, x, 190, C.soft, 6);
        if (lit) {
          g.c.globalAlpha = 0.35;
          g.dot(x, 100, 72, C.sun);
          g.c.globalAlpha = 1;
        }
        g.dot(x + 3, 105, 46, "rgba(70, 50, 25, 0.22)");
        g.dot(x, 100, 46, lit ? color : C.field);
        g.dot(x - 14, 86, 10, "rgba(255, 255, 255, 0.6)");
        g.text(lang === "id" ? `setiap ${num(lang, every)} menit` : `every ${num(lang, every)} minutes`, x, 220, 24, color, "center", true);
      };
      lamp(250, litA, C.coral, a);
      lamp(750, litB, C.teal, b);
      if (litA && litB) {
        // Both at once: rays around the clock.
        for (let r = 0; r < 12; r++) {
          const ang = (r / 12) * Math.PI * 2 + t;
          g.line(W / 2 + Math.cos(ang) * 80, 120 + Math.sin(ang) * 80, W / 2 + Math.cos(ang) * 104, 120 + Math.sin(ang) * 104, C.sun, 5);
        }
      }
      g.text(num(lang, Math.floor(minute)), W / 2, 110, 56, C.ink, "center", true);
      g.text(lang === "id" ? "menit" : "minute", W / 2, 158, 22, C.soft, "center", true);

      const x0 = 80;
      const x1 = 920;
      const y = 330;
      const xs = (v: number) => lerp(x0, x1, v / end);
      g.line(x0, y, x1, y, C.ink, 3);
      for (let v = 0; v <= end; v += a) g.dot(xs(v), y - 24, 7, v <= minute ? C.coral : C.fold);
      for (let v = 0; v <= end; v += b) g.dot(xs(v), y + 24, 7, v <= minute ? C.teal : C.fold);
      for (let v = 0; v <= end; v += m) {
        const on = v <= minute;
        g.dot(xs(v), y, on ? 12 : 8, on ? C.sun : C.fold);
        if (on) g.text(num(lang, v), xs(v), y + 56, 22, C.ink, "center", true);
      }
      g.line(xs(minute), y - 46, xs(minute), y + 40, C.cobalt, 3);

      const k = minute >= m ? ease(t, changed + m / speed, 0.4) : 0;
      if (k > 0) {
        g.c.globalAlpha = k;
        g.card(W / 2 - 330, 420, 660, 62, C.sun, 1);
        g.text(lang === "id" ? `nyala bersama lagi pada menit ke-${num(lang, m)}` : `they blink together again at minute ${num(lang, m)}`, W / 2, 451, 28, C.ink, "center", true);
        g.text(lang === "id" ? `KPK ${num(lang, a)} dan ${num(lang, b)} = ${num(lang, m)}` : `least common multiple of ${num(lang, a)} and ${num(lang, b)} = ${num(lang, m)}`, W / 2, 512, 26, C.plum, "center", true);
        g.c.globalAlpha = 1;
      }
      stepper(g, lang, "a", 40, a, 2, 10, C.coral);
      g.button("again", lang === "id" ? "ULANGI" : "PLAY AGAIN", W / 2 - 110, 555, 220, 52, C.cobalt);
      stepper(g, lang, "b", W - 234, b, 2, 10, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "List the factors of two numbers. The factors they share light up, and the greatest of them is the greatest common factor.",
        id: "Tuliskan faktor dari dua bilangan. Faktor yang dimiliki keduanya menyala, dan yang terbesar adalah FPB.",
      },
      scene: shared,
    },
    {
      say: {
        en: "Split each number into primes with a factor tree. The primes both share make the GCF; all the primes together make the LCM.",
        id: "Uraikan setiap bilangan menjadi faktor prima dengan pohon faktor. Prima yang sama membentuk FPB, semua prima bersama membentuk KPK.",
      },
      scene: trees,
    },
    {
      say: {
        en: "Cover the rectangle with square tiles. Some sizes fit both sides with nothing left; the biggest square that fits is the GCF.",
        id: "Tutup persegi panjang dengan ubin persegi. Ada ukuran yang pas di kedua sisi tanpa sisa; persegi terbesar yang pas adalah FPB.",
      },
      scene: tiles,
    },
    {
      say: {
        en: "Two lamps blink every few minutes. Watch when they blink together again: that minute is the least common multiple.",
        id: "Dua lampu berkedip setiap beberapa menit. Lihat kapan keduanya menyala bersama lagi: menit itu adalah KPK.",
      },
      scene: lamps,
    },
  ],
};
