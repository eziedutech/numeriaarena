import type { Lang } from "../../legal";
import { C, clamp, ease, type Lesson, type Scene, W, lerp } from "../ink";

const factorsOf = (n: number) => [...Array(n).keys()].map((i) => i + 1).filter((i) => n % i === 0);

/** Squares laid in rows: when they make a full rectangle, the number of rows is a factor. */
function rows(lang: Lang): Scene {
  let n = 12;
  let r = 2;
  let changed = 0;
  let now = 0;
  const found = new Set<number>();
  let from: { x: number; y: number; s: number }[] = [];
  // Full rows first; what is left over sticks out in one more column. Squares
  // shrink when a long row or a tall column would not fit.
  const layout = (count: number, rowsOf: number) => {
    const cols = Math.floor(count / rowsOf);
    const wide = cols + (count % rowsOf ? 1 : 0);
    const s = Math.min(34, 580 / wide - 4, 400 / rowsOf - 4);
    const x0 = 330 - (wide * (s + 4)) / 2;
    return [...Array(count).keys()].map((i) => {
      const [col, row] = i < cols * rowsOf ? [i % cols, Math.floor(i / cols)] : [cols, i - cols * rowsOf];
      return { x: x0 + col * (s + 4), y: 70 + row * (s + 4), s };
    });
  };
  let to = layout(n, r);
  const relayout = () => {
    const k = ease(now, changed, 0.6);
    from = to.map((p, i) => (from[i] ? { x: lerp(from[i].x, p.x, k), y: lerp(from[i].y, p.y, k), s: lerp(from[i].s, p.s, k) } : p));
    to = layout(n, r);
    changed = now;
  };
  return {
    press(id) {
      if (id === "r+") r = clamp(r + 1, 1, Math.min(n, 12));
      if (id === "r-") r = clamp(r - 1, 1, n);
      if (id === "n+" || id === "n-") {
        n = clamp(n + (id === "n+" ? 1 : -1), 2, 36);
        r = Math.min(r, n);
        found.clear();
        from = [];
      }
      relayout();
    },
    draw(g, t) {
      now = t;
      const full = n % r === 0;
      if (full) found.add(r);
      const k = ease(t, changed, 0.6);
      const cols = Math.floor(n / r);
      to.forEach((p, i) => {
        const a = from[i] ?? p;
        const x = lerp(a.x, p.x, k);
        const y = lerp(a.y, p.y, k);
        const s = lerp(a.s, p.s, k);
        const odd = i >= cols * r;
        g.card(x, y, s, s, full ? C.teal : odd ? C.coral : C.cobalt, 0.7);
      });
      const cx = 800;
      g.text(lang === "id" ? `${n} kotak, ${r} baris` : `${n} squares, ${r} row${r === 1 ? "" : "s"}`, cx, 90, 30, C.ink, "center", true);
      if (full) {
        g.card(cx - 160, 130, 320, 70, C.sun, 1);
        g.text(`${r} × ${n / r} = ${n}`, cx, 165, 40, C.ink, "center", true);
        g.text(lang === "id" ? `${r} adalah faktor ${n}` : `${r} is a factor of ${n}`, cx, 230, 24, C.teal, "center", true);
      } else {
        g.text(lang === "id" ? `${n % r} kotak tersisa` : `${n % r} left over`, cx, 165, 30, C.coral, "center", true);
        g.text(lang === "id" ? `${r} bukan faktor ${n}` : `${r} is not a factor of ${n}`, cx, 230, 24, C.soft, "center", true);
      }
      // The factors found so far; the rest wait as blank chips.
      const all = factorsOf(n);
      const chipW = 52;
      const x0 = cx - (Math.min(all.length, 5) * (chipW + 8)) / 2;
      all.forEach((f, i) => {
        const x = x0 + (i % 5) * (chipW + 8);
        const y = 290 + Math.floor(i / 5) * 60;
        const on = found.has(f) || found.has(n / f);
        g.card(x, y, chipW, 48, on ? C.paper : C.field, on ? 1 : 0);
        if (on) g.text(String(f), x + chipW / 2, y + 24, 26, C.teal, "center", true);
      });
      g.text(lang === "id" ? "baris" : "rows", 135, 520, 22, C.soft, "center", true);
      g.button("r-", "−", 40, 545, 70, 52, C.cobalt, r > 1);
      g.text(String(r), 135, 571, 34, C.ink, "center", true);
      g.button("r+", "+", 160, 545, 70, 52, C.cobalt, r < Math.min(n, 12));
      g.text(lang === "id" ? "kotak" : "squares", cx, 520, 22, C.soft, "center", true);
      g.button("n-", "−", cx - 110, 545, 70, 52, C.soft, n > 2);
      g.text(String(n), cx, 571, 34, C.ink, "center", true);
      g.button("n+", "+", cx + 40, 545, 70, 52, C.soft, n < 36);
    },
  };
}

/** Factors in a row, each joined by an arc to its partner: they come in pairs. */
function pairs(lang: Lang): Scene {
  const choices = [12, 18, 24, 30, 36, 16, 20];
  let i = 0;
  let changed = 0;
  let now = 0;
  return {
    press() {
      i = (i + 1) % choices.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const n = choices[i];
      const fs = factorsOf(n);
      const gap = Math.min(110, 860 / fs.length);
      const x0 = W / 2 - (gap * (fs.length - 1)) / 2;
      const y = 330;
      const colors = [C.coral, C.teal, C.cobalt, C.plum, "#e0a040"];
      const half = Math.ceil(fs.length / 2);
      for (let j = 0; j < half; j++) {
        const a = x0 + j * gap;
        const b = x0 + (fs.length - 1 - j) * gap;
        const k = ease(t, changed + 0.4 * j, 0.6);
        const color = colors[j % colors.length];
        g.c.strokeStyle = color;
        g.c.lineWidth = 5;
        g.c.beginPath();
        const r = (b - a) / 2;
        if (r > 0) g.c.ellipse((a + b) / 2, y - 36, r, Math.min(r, 200), 0, Math.PI, Math.PI + Math.PI * k);
        g.c.stroke();
        g.c.globalAlpha = k;
        const f = fs[j];
        g.text(r > 0 ? `${f} × ${n / f}` : `${f} × ${f}`, 140 + (j % 3) * 260, 470 + Math.floor(j / 3) * 50, 30, color, "center", true);
        g.c.globalAlpha = 1;
      }
      fs.forEach((f, j) => {
        g.card(x0 + j * gap - 30, y - 30, 60, 60, C.paper, 1);
        g.text(String(f), x0 + j * gap, y, 30, C.ink, "center", true);
      });
      g.text(lang === "id" ? `faktor dari ${n}` : `factors of ${n}`, W / 2, 60, 36, C.ink, "center", true);
      g.button("next", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W / 2 - 140, 565, 280, 52, C.cobalt);
    },
  };
}

/** A chart to 60: the multiples of one number light up, then of a second, and where both meet. */
function chartOf(lang: Lang): Scene {
  let a = 3;
  let b = 4;
  let both = false;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "a+") a = clamp(a + 1, 2, 10);
      if (id === "a-") a = clamp(a - 1, 2, 10);
      if (id === "b+") b = clamp(b + 1, 2, 10);
      if (id === "b-") b = clamp(b - 1, 2, 10);
      if (id === "both") both = !both;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const S = 62;
      const x0 = (W - 10 * (S + 6)) / 2;
      const y0 = 30;
      const lit = Math.floor((t - changed) * 8);
      for (let n = 1; n <= 60; n++) {
        const x = x0 + ((n - 1) % 10) * (S + 6);
        const y = y0 + Math.floor((n - 1) / 10) * (S + 6);
        const isA = n % a === 0 && n / a <= lit;
        const isB = both && n % b === 0 && n / b <= lit;
        const color = isA && isB ? C.sun : isA ? C.coral : isB ? C.teal : C.paper;
        g.card(x, y, S, S, color, isA || isB ? 1 : 0.4);
        g.text(String(n), x + S / 2, y + S / 2, 24, isA !== isB ? C.paper : C.ink, "center", true);
      }
      const line = lang === "id" ? `kelipatan ${a}` : `multiples of ${a}`;
      g.text(line, 140, 470, 24, C.coral, "center", true);
      g.button("a-", "−", 60, 495, 56, 48, C.coral, a > 2);
      g.text(String(a), 140, 519, 30, C.coral, "center", true);
      g.button("a+", "+", 164, 495, 56, 48, C.coral, a < 10);
      if (both) {
        g.text(lang === "id" ? `kelipatan ${b}` : `multiples of ${b}`, W - 140, 470, 24, C.teal, "center", true);
        g.button("b-", "−", W - 220, 495, 56, 48, C.teal, b > 2);
        g.text(String(b), W - 140, 519, 30, C.teal, "center", true);
        g.button("b+", "+", W - 116, 495, 56, 48, C.teal, b < 10);
        const common = [...Array(60).keys()].map((i) => i + 1).filter((n) => n % a === 0 && n % b === 0);
        const said = common.length ? common.join(", ") : "-";
        g.text(lang === "id" ? `kelipatan persekutuan: ${said}` : `common multiples: ${said}`, W / 2, 590, 24, C.ink, "center", true);
      }
      g.button("both", both ? (lang === "id" ? "SATU SAJA" : "ONE ONLY") : lang === "id" ? "TAMBAH SATU LAGI" : "ADD A SECOND", W / 2 - 140, 495, 280, 48, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Lay the squares in rows. When they make a full rectangle with nothing left over, the number of rows is a factor.",
        id: "Susun kotak-kotak itu dalam baris. Bila menjadi persegi panjang penuh tanpa sisa, banyak barisnya adalah faktor.",
      },
      scene: rows,
    },
    {
      say: {
        en: "Factors come in pairs that multiply to the number. The arcs join each factor to its partner.",
        id: "Faktor selalu berpasangan, dan hasil kali pasangannya sama dengan bilangan itu. Busur menghubungkan setiap faktor dengan pasangannya.",
      },
      scene: pairs,
    },
    {
      say: {
        en: "Multiples are what you land on when you count in jumps. Add a second number and see the multiples they share.",
        id: "Kelipatan adalah bilangan tempat kita mendarat saat melompat. Tambahkan bilangan kedua, lalu lihat kelipatan yang sama.",
      },
      scene: chartOf,
    },
  ],
};
