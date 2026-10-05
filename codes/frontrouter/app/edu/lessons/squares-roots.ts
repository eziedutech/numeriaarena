import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, lerp, pulse } from "../ink";
import { dec, num } from "../parts";

/** The tile grid on the left of the sheet. */
const S = 40;
const X0 = 90;
const Y0 = 70;
/** The column on the right where the sums are written. */
const PX = 760;
const PW = 400;
const RING = [C.cobalt, C.teal, C.coral, C.plum, "#e0a040"];

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** Coloured pieces in one line centred on x, shrunk together to fit. */
function pieces(g: Ink, parts: [string, string][], x: number, y: number, max: number, size: number) {
  let k = size;
  while (k > 18 && g.width(parts.map((p) => p[0]).join(" "), k, true) > max) k -= 1;
  const space = g.width(" ", k, true);
  const ws = parts.map(([s]) => g.width(s, k, true));
  let at = x - (ws.reduce((a, b) => a + b, 0) + space * (parts.length - 1)) / 2;
  parts.forEach(([s, color], i) => {
    g.text(s, at, y, k, color, "left", true);
    at += ws[i] + space;
  });
}

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  g.text(label, cx, 518, 22, C.soft, "center", true);
  g.button(`${id}-`, "−", cx - 115, 545, 70, 52, color, canDown);
  g.text(value, cx, 571, 28, C.ink, "center", true);
  g.button(`${id}+`, "+", cx + 45, 545, 70, 52, color, canUp);
}

function faintGrid(g: Ink) {
  for (let i = 0; i <= 10; i++) {
    g.line(X0 + i * S, Y0, X0 + i * S, Y0 + 10 * S, "rgba(58, 63, 75, 0.08)", 1);
    g.line(X0, Y0 + i * S, X0 + 10 * S, Y0 + i * S, "rgba(58, 63, 75, 0.08)", 1);
  }
}

/** One tile of the grid, grown from its middle by `k`. */
function tile(g: Ink, i: number, j: number, k: number, color: string) {
  if (k <= 0) return;
  const s = (S - 4) * (0.3 + 0.7 * k);
  g.card(X0 + i * S + S / 2 - s / 2, Y0 + j * S + S / 2 - s / 2, s, s, color, 0.5 * k);
}

/** A square of tiles that grows by a new row and column folded around it; the square numbers line up beside it. */
function grow(lang: Lang): Scene {
  let n = 3;
  let prev = 2;
  let changed = 0;
  let now = 0;
  let playing = false;
  let next = 0;
  const set = (m: number) => {
    prev = n;
    n = clamp(m, 1, 10);
    changed = now;
  };
  return {
    press(id) {
      playing = false;
      if (id === "n+") set(n + 1);
      if (id === "n-") set(n - 1);
      if (id === "play") {
        playing = true;
        n = 0;
        set(1);
        next = now + 1.1;
      }
    },
    draw(g, t) {
      now = t;
      if (playing && t >= next) {
        if (n < 10) {
          set(n + 1);
          next = t + 1.1;
        } else playing = false;
      }
      faintGrid(g);
      const growing = n > prev;
      const keep = Math.min(n, prev);
      const most = Math.max(n, prev);
      for (let j = 0; j < most; j++) {
        for (let i = 0; i < most; i++) {
          const r = Math.max(i, j);
          if (r < keep) tile(g, i, j, 1, r % 2 ? "#5cc4b0" : C.teal);
          else if (growing) tile(g, i, j, ease(t, changed + 0.05 + (i + j) * 0.03, 0.35), C.coral);
          else {
            g.c.globalAlpha = 1 - ease(t, changed, 0.35);
            tile(g, i, j, 1, C.coral);
            g.c.globalAlpha = 1;
          }
        }
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(X0, Y0, n * S, n * S);
      g.text(num(lang, n), X0 + (n * S) / 2, Y0 - 22, 24, C.cobalt, "center", true);
      g.text(num(lang, n), X0 - 14, Y0 + (n * S) / 2, 24, C.cobalt, "right", true);

      const sq = n * n;
      g.text(lang === "id" ? "bilangan kuadrat" : "square numbers", PX, 90, 30, C.soft, "center", true);
      g.card(PX - 190, 125, 380, 72, C.sun, 1);
      fit(g, `${num(lang, n)}² = ${num(lang, n)} × ${num(lang, n)} = ${num(lang, sq)}`, PX, 161, 350, 40);
      if (growing && n > 1) {
        g.c.globalAlpha = ease(t, changed + 0.3, 0.4);
        pieces(g, [[num(lang, prev * prev), "#2f9a86"], ["+", C.soft], [num(lang, sq - prev * prev), C.coral], ["=", C.soft], [num(lang, sq), C.ink]], PX, 235, PW, 30);
        fit(g, lang === "id" ? `${num(lang, sq - prev * prev)} ubin baru di sekeliling` : `${num(lang, sq - prev * prev)} new tiles around it`, PX, 272, PW, 22, C.coral);
        g.c.globalAlpha = 1;
      }
      // The first ten square numbers, the one on the sheet lit.
      for (let m = 1; m <= 10; m++) {
        const x = 580 + ((m - 1) % 5) * 76;
        const y = 315 + Math.floor((m - 1) / 5) * 84;
        const on = m === n;
        g.card(x, y, 68, 70, on ? C.sun : C.field, on ? 1.2 : 0.4);
        g.text(`${num(lang, m)}²`, x + 34, y + 20, 18, C.soft, "center", true);
        g.text(num(lang, m * m), x + 34, y + 48, 26, on ? C.ink : C.soft, "center", true);
      }
      stepper(g, lang === "id" ? "sisi" : "side", num(lang, n), "n", 290, n > 1, n < 10, C.cobalt);
      g.button("play", lang === "id" ? "TUMBUH DARI 1" : "GROW FROM 1", 620, 545, 300, 52, C.coral, !playing);
    },
  };
}

/** Odd numbers laid as L-shaped layers, each one wrapping the square before it into a bigger square. */
function stairs(lang: Lang): Scene {
  let n = 3;
  let changed = -1;
  let now = 0;
  return {
    press(id) {
      if (id === "add") n = clamp(n + 1, 1, 10);
      if (id === "off") n = clamp(n - 1, 1, 10);
      if (id === "again") n = 1;
      changed = now;
    },
    draw(g, t) {
      now = t;
      faintGrid(g);
      for (let r = 0; r < n; r++) {
        // Only the newest layer slides in; the others are already there.
        const k = r === n - 1 ? ease(t, changed + 0.1, 0.5) : 1;
        const off = (1 - k) * 60;
        const color = RING[r % RING.length];
        g.c.globalAlpha = k;
        for (let q = 0; q <= 2 * r; q++) {
          const [i, j] = q <= r ? [q, r] : [r, 2 * r - q];
          const s = S - 4;
          g.card(X0 + i * S + 2 + off, Y0 + j * S + 2 + off, s, s, color, 0.5);
        }
        g.text(num(lang, 2 * r + 1), X0 + r * S + S / 2 + off, Y0 + r * S + S / 2 + off, 18, C.paper, "center", true);
        g.c.globalAlpha = 1;
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(X0, Y0, n * S, n * S);

      g.text(lang === "id" ? "bilangan ganjil" : "odd numbers", PX, 90, 30, C.soft, "center", true);
      const terms: [string, string][][] = [[], []];
      for (let r = 0; r < n; r++) {
        const row = terms[r < 5 ? 0 : 1];
        if (r > 0) row.push(["+", C.soft]);
        row.push([num(lang, 2 * r + 1), RING[r % RING.length]]);
      }
      pieces(g, terms[0], PX, 150, PW, 34);
      if (terms[1].length) pieces(g, terms[1], PX, 200, PW, 34);
      g.card(PX - 190, 250, 380, 72, C.sun, 1);
      fit(g, `= ${num(lang, n * n)} = ${num(lang, n)}²`, PX, 286, 350, 40);
      fit(g, lang === "id" ? `${num(lang, n)} bilangan ganjil pertama` : `the first ${num(lang, n)} odd numbers`, PX, 350, PW, 24, C.soft);
      fit(g, lang === "id" ? `membentuk persegi ${num(lang, n)} × ${num(lang, n)}` : `make a ${num(lang, n)} by ${num(lang, n)} square`, PX, 385, PW, 24, C.soft);

      g.button("add", lang === "id" ? "TAMBAH LAPISAN" : "ADD A LAYER", 60, 545, 280, 52, C.teal, n < 10);
      g.button("off", lang === "id" ? "AMBIL LAPISAN" : "TAKE A LAYER OFF", 360, 545, 300, 52, C.plum, n > 1);
      g.button("again", lang === "id" ? "ULANGI" : "START AGAIN", 680, 545, 260, 52, C.coral, n > 1);
    },
  };
}

/** A hash of `i` in 0 to 1, so a pile looks the same every frame. */
const rnd = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** A loose pile of tiles slides into rows until it makes a square; its side is the square root. */
function root(lang: Lang): Scene {
  const NUMS = [4, 9, 16, 25, 36, 49, 64, 81, 100];
  let at = 5;
  let square = false;
  let changed = -1;
  let now = 0;
  return {
    press(id) {
      if (id === "arrange") square = !square;
      if (id === "next") {
        at = (at + 1) % NUMS.length;
        square = false;
      }
      changed = now;
    },
    draw(g, t) {
      now = t;
      const N = NUMS[at];
      const m = Math.round(Math.sqrt(N));
      const s = Math.min(40, 400 / m);
      const gx = 290 - (m * s) / 2;
      const gy = 270 - (m * s) / 2;
      const c = g.c;
      let done = true;
      for (let i = 0; i < N; i++) {
        const px = 290 + (rnd(i, 1) - 0.5) * 360 * (1 - rnd(i, 2) * 0.55);
        const py = 450 - rnd(i, 2) * 170 - rnd(i, 4) * 30;
        const pr = (rnd(i, 3) - 0.5) * 1.4;
        const qx = gx + (i % m) * s + s / 2;
        const qy = gy + Math.floor(i / m) * s + s / 2;
        const e = ease(t, changed + i * (0.9 / N), 0.6);
        if (e < 1) done = false;
        const k = square ? e : 1 - e;
        const x = lerp(px, qx, k);
        const y = lerp(py, qy, k);
        c.save();
        c.translate(x, y);
        c.rotate(pr * (1 - k));
        g.card(-(s - 4) / 2, -(s - 4) / 2, s - 4, s - 4, Math.floor(i / m) % 2 ? "#5cc4b0" : C.teal, 0.6);
        c.restore();
      }
      if (square && done) {
        c.strokeStyle = C.coral;
        c.lineWidth = 4;
        c.strokeRect(gx, gy, m * s, m * s);
        for (let i = 0; i < m; i++) g.text(num(lang, i + 1), gx + i * s + s / 2, gy - 18, 18, C.coral, "center", true);
        g.text(num(lang, m), gx - 14, gy + (m * s) / 2, 26, C.coral, "right", true);
      }

      g.text(lang === "id" ? `${num(lang, N)} ubin` : `${num(lang, N)} tiles`, PX, 100, 40, C.ink, "center", true);
      if (square && done) {
        g.card(PX - 150, 160, 300, 100, C.sun, 1);
        g.text(`√${num(lang, N)} = ${num(lang, m)}`, PX, 210, 60, C.ink, "center", true);
        fit(g, lang === "id" ? `karena ${num(lang, m)} × ${num(lang, m)} = ${num(lang, N)}` : `because ${num(lang, m)} × ${num(lang, m)} = ${num(lang, N)}`, PX, 300, PW, 28, C.soft);
        fit(g, lang === "id" ? "akar kuadrat = panjang sisi persegi" : "square root = the side of the square", PX, 350, PW, 24, C.coral);
      } else if (!square) {
        fit(g, lang === "id" ? "masih berserakan" : "still in a loose pile", PX, 160, PW, 26, C.soft);
        g.c.globalAlpha = 0.5 + 0.5 * pulse(t);
        fit(g, lang === "id" ? "susun jadi persegi" : "arrange them into a square", PX, 210, PW, 24, C.coral);
        g.c.globalAlpha = 1;
      }
      g.button("arrange", square ? (lang === "id" ? "ACAK LAGI" : "PILE UP AGAIN") : lang === "id" ? "SUSUN JADI PERSEGI" : "MAKE A SQUARE", 60, 545, 360, 52, C.teal);
      g.button("next", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", 600, 545, 340, 52, C.cobalt);
    },
  };
}

/** Squares on one line and their roots on another: a number dragged on top shows its root falling between two whole numbers. */
function estimate(lang: Lang): Scene {
  let v = 40;
  let held = false;
  const L = 80;
  const R = 920;
  const TOP = 190;
  const LOW = 360;
  const xTop = (n: number) => L + (n / 100) * (R - L);
  const xLow = (r: number) => L + (r / 10) * (R - L);
  return {
    down(p) {
      if (Math.abs(p.x - xTop(v)) < 40 && Math.abs(p.y - TOP) < 40) {
        held = true;
        return true;
      }
    },
    move(p) {
      v = clamp(Math.round(((p.x - L) / (R - L)) * 100), 1, 100);
    },
    up() {
      held = false;
    },
    press(id) {
      v = clamp(v + (id === "v+" ? 1 : -1), 1, 100);
    },
    draw(g, t) {
      const r = Math.sqrt(v);
      const a = Math.floor(r + 1e-9);
      const exact = a * a === v;
      const b = exact ? a : a + 1;
      g.text(lang === "id" ? "bilangan" : "numbers", L, TOP - 125, 22, C.soft, "left", true);
      g.text(lang === "id" ? "akar kuadrat" : "square roots", L, LOW + 70, 22, C.soft, "left", true);
      // The stretch between the two squares, and between their roots.
      if (!exact) {
        g.c.fillStyle = "rgba(255, 209, 102, 0.6)";
        g.c.fillRect(xTop(a * a), TOP - 12, xTop(b * b) - xTop(a * a), 24);
        g.c.fillRect(xLow(a), LOW - 12, xLow(b) - xLow(a), 24);
      }
      for (let k = 0; k <= 10; k++) {
        const lit = k === a || k === b;
        g.line(xTop(k * k), TOP, xLow(k), LOW, lit ? "rgba(52, 105, 196, 0.6)" : "rgba(58, 63, 75, 0.15)", lit ? 3 : 2);
      }
      g.line(L, TOP, R, TOP, C.ink, 3);
      g.line(L, LOW, R, LOW, C.ink, 3);
      for (let k = 0; k <= 10; k++) {
        const x = xTop(k * k);
        g.line(x, TOP - 12, x, TOP + 12, C.cobalt, 3);
        // 0 and 1 sit close together, so 0 goes under the line.
        if (k === 0) g.text("0", x, TOP + 30, 20, C.cobalt, "center", true);
        else g.text(num(lang, k * k), x, TOP - 30, k * k >= 4 ? 22 : 20, C.cobalt, "center", true);
        g.line(xLow(k), LOW - 12, xLow(k), LOW + 12, C.teal, 3);
        g.text(num(lang, k), xLow(k), LOW + 32, 24, "#2f9a86", "center", true);
      }
      g.line(xTop(v), TOP, xLow(r), LOW, C.coral, 4);
      g.dot(xLow(r), LOW, 10, C.coral);
      g.handle(xTop(v), TOP, held);
      g.card(xTop(v) - 32, TOP - 84, 64, 36, C.coral, 1);
      g.text(num(lang, v), xTop(v), TOP - 66, 24, C.paper, "center", true);
      if (t < 5 && !held) g.text(lang === "id" ? "geser titiknya" : "drag the point", xTop(v), TOP + 52, 22, C.coral, "center", true);

      if (exact) {
        fit(g, `√${num(lang, v)} = ${num(lang, a)}`, 500, 455, 600, 40, C.ink);
        fit(g, lang === "id" ? `${num(lang, v)} bilangan kuadrat: ${num(lang, a)} × ${num(lang, a)}` : `${num(lang, v)} is a square number: ${num(lang, a)} × ${num(lang, a)}`, 500, 493, 700, 22, C.soft);
      } else {
        pieces(
          g,
          [
            [num(lang, a * a), C.cobalt],
            ["<", C.soft],
            [num(lang, v), C.coral],
            ["<", C.soft],
            [num(lang, b * b), C.cobalt],
            [lang === "id" ? "  jadi  " : "  so  ", C.soft],
            [num(lang, a), "#2f9a86"],
            ["<", C.soft],
            [`√${num(lang, v)}`, C.coral],
            ["<", C.soft],
            [num(lang, b), "#2f9a86"],
          ],
          500,
          455,
          860,
          34,
        );
        const near = r - a < 0.5 ? a : b;
        fit(g, lang === "id" ? `√${num(lang, v)} ≈ ${dec(lang, r, 1)}, lebih dekat ke ${num(lang, near)}` : `√${num(lang, v)} ≈ ${dec(lang, r, 1)}, closer to ${num(lang, near)}`, 500, 493, 700, 22, C.soft);
      }
      stepper(g, lang === "id" ? "bilangan" : "number", num(lang, v), "v", 500, v > 1, v < 100, C.coral);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A square number is a number of tiles that make a square: side times side. Make the side longer and watch a new row and column wrap around.",
        id: "Bilangan kuadrat adalah banyak ubin yang membentuk persegi: sisi dikali sisi. Tambah sisinya dan lihat baris dan kolom baru melingkupinya.",
      },
      scene: grow,
    },
    {
      say: {
        en: "Add the odd numbers in order: 1, then 3, then 5. Each one is an L-shaped layer, and together they always make a square.",
        id: "Jumlahkan bilangan ganjil berurutan: 1, lalu 3, lalu 5. Masing-masing satu lapisan berbentuk L, dan bersama-sama selalu membentuk persegi.",
      },
      scene: stairs,
    },
    {
      say: {
        en: "The square root goes the other way: arrange the tiles into a square, and its side is the square root.",
        id: "Akar kuadrat adalah kebalikannya: susun ubin menjadi persegi, maka panjang sisinya adalah akar kuadrat.",
      },
      scene: root,
    },
    {
      say: {
        en: "Most numbers sit between two square numbers. Drag along the line: the square root sits between two whole numbers too.",
        id: "Kebanyakan bilangan terletak di antara dua bilangan kuadrat. Geser di sepanjang garis: akar kuadratnya juga terletak di antara dua bilangan cacah.",
      },
      scene: estimate,
    },
  ],
};
