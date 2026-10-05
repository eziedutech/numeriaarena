import type { Lang } from "../../legal";
import { C, clamp, ease, type Lesson, type Scene, W, lerp } from "../ink";
import { dec, frac, strip, sum } from "../parts";

/** A strip cut in ten: each tenth coloured is 0.1 more. */
function tenths(lang: Lang): Scene {
  let n = 3;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      n = clamp(n + (id === "+" ? 1 : -1), 0, 10);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const x = 100;
      const w = 800;
      strip(g, x, 110, w, 120, 10, n, C.coral);
      for (let i = 1; i <= 10; i++) g.text(dec(lang, i / 10, 1), x + (w * i) / 10, 260, 18, i <= n ? C.coral : C.soft, "center", true);
      g.text("0", x, 260, 18, C.soft, "center", true);
      const pop = 1 + 0.08 * (1 - ease(t, changed, 0.4));
      g.c.save();
      g.c.translate(W / 2, 400);
      g.c.scale(pop, pop);
      frac(g, n, 10, -220, 0, 64, C.coral);
      g.text("=", -90, 0, 64, C.ink, "center", true);
      g.text(dec(lang, n / 10, 1), 80, 0, 88, C.cobalt, "center", true);
      g.c.restore();
      const said = lang === "id" ? `${n} persepuluh` : `${n} tenth${n === 1 ? "" : "s"}`;
      g.text(said, W / 2, 490, 28, C.soft, "center", true);
      g.button("-", "−", W / 2 - 150, 555, 80, 52, C.coral, n > 0);
      g.button("+", "+", W / 2 + 70, 555, 80, 52, C.teal, n < 10);
    },
  };
}

/** A square of a hundred: colour by ones and tens, and see 0.3 and 0.30 cover the same. */
function hundredths(lang: Lang): Scene {
  let n = 30;
  let painting: boolean | null = null;
  let now = 0;
  let changed = 0;
  const x = 60;
  const y = 40;
  const s = 50;
  const cell = (p: { x: number; y: number }) => {
    const cx = Math.floor((p.x - x) / s);
    const cy = Math.floor((p.y - y) / s);
    return cx >= 0 && cx < 10 && cy >= 0 && cy < 10 ? cy * 10 + cx : null;
  };
  // Cells fill row by row, so the count is how many are coloured.
  const paint = (p: { x: number; y: number }) => {
    const c = cell(p);
    if (c !== null) n = c + 1;
  };
  return {
    press(id) {
      if (id === "+1") n = clamp(n + 1, 0, 100);
      if (id === "-1") n = clamp(n - 1, 0, 100);
      if (id === "+10") n = clamp(n + 10, 0, 100);
      if (id === "-10") n = clamp(n - 10, 0, 100);
      changed = now;
    },
    down(p) {
      if (cell(p) === null) return;
      painting = true;
      paint(p);
      return true;
    },
    move(p) {
      if (painting) paint(p);
    },
    up() {
      painting = null;
      changed = now;
    },
    draw(g, t) {
      now = t;
      g.card(x, y, s * 10, s * 10, C.paper, 1);
      for (let i = 0; i < 100; i++) {
        const cx = x + (i % 10) * s;
        const cy = y + Math.floor(i / 10) * s;
        if (i < n) {
          g.c.fillStyle = Math.floor(i / 10) % 2 ? "#e9625c" : C.coral;
          g.c.fillRect(cx, cy, s, s);
        }
      }
      for (let i = 1; i < 10; i++) {
        g.line(x + i * s, y, x + i * s, y + 10 * s, "rgba(58, 63, 75, 0.25)", 1);
        g.line(x, y + i * s, x + 10 * s, y + i * s, "rgba(58, 63, 75, 0.45)", 2);
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(x, y, s * 10, s * 10);

      const cx = 800;
      frac(g, n, 100, cx - 130, 130, 52, C.coral);
      g.text("=", cx - 20, 130, 52, C.ink, "center", true);
      g.text(dec(lang, n / 100, 2), cx + 110, 130, 64, C.cobalt, "center", true);
      if (n % 10 === 0) {
        // A whole number of rows is also a number of tenths.
        const k = ease(t, changed, 0.5);
        g.c.globalAlpha = k;
        g.card(cx - 200, 220, 400, 140, C.sun, 1);
        g.text("=", cx - 140, 290, 44, C.ink, "center", true);
        frac(g, n / 10, 10, cx - 60, 290, 44, C.coral);
        g.text("=", cx + 20, 290, 44, C.ink, "center", true);
        g.text(dec(lang, n / 10, 1), cx + 110, 290, 56, C.cobalt, "center", true);
        g.c.globalAlpha = 1;
      }
      g.text(lang === "id" ? `${n} perseratus` : `${n} hundredth${n === 1 ? "" : "s"}`, cx, 400, 26, C.soft, "center", true);
      g.button("-10", "−10", 620, 450, 80, 48, C.coral, n >= 10);
      g.button("-1", "−1", 710, 450, 70, 48, C.coral, n > 0);
      g.button("+1", "+1", 820, 450, 70, 48, C.teal, n < 100);
      g.button("+10", "+10", 900, 450, 80, 48, C.teal, n <= 90);
      g.text(lang === "id" ? "atau usap kotaknya" : "or sweep across the square", cx, 540, 22, C.soft, "center", true);
    },
  };
}

/** Ones, a decimal point, tenths and hundredths: a digit's column tells its worth. */
function chart(lang: Lang): Scene {
  const d = [2, 4, 5];
  const changed = [-1, -1, -1];
  let now = 0;
  const names = lang === "id" ? ["satuan", "persepuluhan", "perseratusan"] : ["ones", "tenths", "hundredths"];
  return {
    press(id) {
      const i = Number(id.slice(1));
      d[i] = clamp(d[i] + (id[0] === "+" ? 1 : -1), 0, 9);
      changed[i] = now;
    },
    draw(g, t) {
      now = t;
      const colW = 230;
      const xs = [110, 110 + colW + 60, 110 + 2 * colW + 60];
      xs.forEach((x, i) => {
        const flash = changed[i] >= 0 ? 1 - ease(t, changed[i], 0.6) : 0;
        g.card(x, 60, colW, 300, i === 0 ? "#f8efdc" : C.paper, 1);
        if (flash > 0) {
          g.c.fillStyle = `rgba(255, 209, 102, ${0.6 * flash})`;
          g.c.fillRect(x, 60, colW, 300);
        }
        g.text(names[i], x + colW / 2, 95, 22, C.soft, "center", true);
        g.text(String(d[i]), x + colW / 2, 200, 100, [C.ink, C.coral, C.teal][i], "center", true);
        g.button(`-${i}`, "−", x + 20, 290, 56, 48, C.coral, d[i] > 0);
        g.button(`+${i}`, "+", x + colW - 76, 290, 56, 48, C.teal, d[i] < 9);
      });
      // The decimal point between ones and tenths.
      g.dot(110 + colW + 30, 240, 12, C.ink);
      g.text(lang === "id" ? "koma" : "point", 110 + colW + 30, 390, 20, C.soft, "center", true);

      const value = d[0] + d[1] / 10 + d[2] / 100;
      g.text(dec(lang, value, 2), W / 2, 450, 56, C.cobalt, "center", true);
      sum(g, [String(d[0]), "+", [d[1], 10], "+", [d[2], 100]], W / 2, 545, 38, [C.ink, C.soft, C.coral, C.soft, C.teal]);
    },
  };
}

/** A line from 0 to 1, and a lens on the tenth the marker is in, cut in hundredths. */
function line(lang: Lang): Scene {
  let v = 0.37;
  let held = false;
  const x0 = 80;
  const x1 = 920;
  const y = 170;
  const ly = 430;
  const xs = (u: number) => lerp(x0, x1, u);
  return {
    down(p) {
      if (Math.abs(p.x - xs(v)) < 40 && Math.abs(p.y - y) < 60) {
        held = true;
        return true;
      }
      if (Math.abs(p.y - y) < 40 && p.x >= x0 && p.x <= x1) {
        v = Math.round(((p.x - x0) / (x1 - x0)) * 100) / 100;
        held = true;
        return true;
      }
    },
    move(p) {
      v = clamp(Math.round(((p.x - x0) / (x1 - x0)) * 100) / 100, 0, 1);
    },
    up() {
      held = false;
    },
    draw(g) {
      g.line(x0, y, x1, y, C.ink, 4);
      for (let i = 0; i <= 10; i++) {
        g.line(xs(i / 10), y - 14, xs(i / 10), y + 14, C.ink, 3);
        g.text(dec(lang, i / 10, i % 10 ? 1 : 0), xs(i / 10), y + 40, 20, C.soft, "center", true);
      }
      for (let i = 0; i <= 100; i++) g.line(xs(i / 100), y - 5, xs(i / 100), y + 5, "rgba(58, 63, 75, 0.35)", 1);
      // The tenth that holds the marker, opened wide below.
      const lo = Math.min(0.9, Math.floor(v * 10 + 1e-9) / 10);
      g.c.fillStyle = "rgba(255, 209, 102, 0.35)";
      g.c.beginPath();
      g.c.moveTo(xs(lo), y + 16);
      g.c.lineTo(xs(lo + 0.1), y + 16);
      g.c.lineTo(x1, ly - 20);
      g.c.lineTo(x0, ly - 20);
      g.c.closePath();
      g.c.fill();
      g.line(x0, ly, x1, ly, C.ink, 4);
      for (let i = 0; i <= 10; i++) {
        const u = lo + i / 100;
        g.line(lerp(x0, x1, i / 10), ly - (i % 10 ? 10 : 16), lerp(x0, x1, i / 10), ly + (i % 10 ? 10 : 16), C.ink, i % 10 ? 2 : 3);
        g.text(dec(lang, u, 2), lerp(x0, x1, i / 10), ly + 38, 18, C.soft, "center", true);
      }
      const lensX = lerp(x0, x1, clamp((v - lo) * 10, 0, 1));
      g.dot(lensX, ly, 12, C.coral);
      g.handle(xs(v), y, held);
      g.text(dec(lang, v, 2), xs(v), y - 50, 36, C.coral, "center", true);
      g.card(W / 2 - 160, 520, 320, 80, C.field, 0);
      sum(g, [[Math.round(v * 100), 100], "=", dec(lang, v, 2)], W / 2, 560, 34, [C.coral, C.ink, C.cobalt]);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Cut one whole into ten equal parts. One part is one tenth, written 0.1. Colour more and count the tenths.",
        id: "Potong satu utuh menjadi sepuluh bagian sama besar. Satu bagian adalah sepersepuluh, ditulis 0,1. Warnai lagi dan hitung persepuluhannya.",
      },
      scene: tenths,
    },
    {
      say: {
        en: "Cut it into a hundred and each square is 0.01. Three whole rows are 30 hundredths, the same as 3 tenths: 0.30 = 0.3.",
        id: "Potong menjadi seratus, tiap kotak 0,01. Tiga baris penuh adalah 30 perseratus, sama dengan 3 persepuluh: 0,30 = 0,3.",
      },
      scene: hundredths,
    },
    {
      say: {
        en: "After the decimal point come the tenths, then the hundredths. Each column to the right is worth ten times less.",
        id: "Setelah koma ada persepuluhan, lalu perseratusan. Setiap kolom ke kanan bernilai sepersepuluh kolom sebelumnya.",
      },
      scene: chart,
    },
    {
      say: {
        en: "Decimals live on the number line between whole numbers. Move the marker; the lens below opens its tenth into hundredths.",
        id: "Desimal berada di garis bilangan di antara bilangan bulat. Geser penandanya; kaca di bawah membuka persepuluhannya menjadi perseratusan.",
      },
      scene: line,
    },
  ],
};
