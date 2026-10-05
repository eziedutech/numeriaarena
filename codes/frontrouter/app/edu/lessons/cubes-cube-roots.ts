import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene } from "../ink";
import { num } from "../parts";

/** Front, top and side faces of a small cube in one colour, lit from the top left. */
const SHADES: [string, string, string][] = [
  [C.cobalt, "#6f97dd", "#24509c"],
  [C.teal, "#7fd3c3", "#2c8a78"],
  [C.coral, "#f7a39e", "#c9524d"],
  [C.plum, "#bf9ce0", "#7a4ea3"],
  [C.sun, "#ffe39e", "#e0ad3a"],
];
/** How far back the depth goes per cube, as a part of the cube's side. */
const DEPTH = 0.45;
/** The column on the right where the sums are written. */
const PX = 760;
const PW = 400;

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  g.text(label, cx, 518, 22, C.soft, "center", true);
  g.button(`${id}-`, "−", cx - 115, 545, 70, 52, color, canDown);
  g.text(value, cx, 571, 28, C.ink, "center", true);
  g.button(`${id}+`, "+", cx + 45, 545, 70, 52, color, canUp);
}

function face(g: Ink, pts: [number, number][], color: string) {
  const c = g.c;
  c.fillStyle = color;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(58, 63, 75, 0.4)";
  c.lineWidth = 1;
  c.stroke();
}

/** A small cube drawn slanted, (x, y) its front bottom left corner. */
function cube(g: Ink, x: number, y: number, s: number, shade: [string, string, string]) {
  const d = s * DEPTH;
  face(g, [[x, y - s], [x + s, y - s], [x + s + d, y - s - d], [x + d, y - s - d]], shade[1]);
  face(g, [[x + s, y], [x + s + d, y - d], [x + s + d, y - s - d], [x + s, y - s]], shade[2]);
  face(g, [[x, y], [x + s, y], [x + s, y - s], [x, y - s]], shade[0]);
}

/**
 * An n by n by n cube of small cubes with its front bottom left corner at
 * (ox, oy). `rise(j)` says how far layer j has dropped in, 0 to 1; layers not
 * yet started are left out. Cubes hidden inside are skipped.
 */
function block(g: Ink, n: number, s: number, ox: number, oy: number, rise: (j: number, i: number, k: number) => number, colour: (j: number) => [string, string, string]) {
  const d = s * DEPTH;
  let top = -1;
  let full = -1;
  for (let j = 0; j < n; j++) {
    if (rise(j, 0, 0) > 0) top = j;
    if (rise(j, n - 1, n - 1) >= 1) full = j;
  }
  for (let k = n - 1; k >= 0; k--) {
    for (let j = 0; j <= top; j++) {
      for (let i = 0; i < n; i++) {
        const e = rise(j, i, k);
        if (e <= 0) continue;
        if (k > 0 && i < n - 1 && j < full) continue;
        g.c.globalAlpha = Math.min(1, e * 2);
        cube(g, ox + i * s + k * d, oy - j * s - k * d - (1 - e) * 90, s, colour(j));
        g.c.globalAlpha = 1;
      }
    }
  }
}

const sizeFor = (n: number, room: number) => Math.min(56, room / ((1 + DEPTH) * n));

/** A cube built layer by layer: each layer is n by n, and n layers make n by n by n. */
function build(lang: Lang): Scene {
  let n = 3;
  let start = 0.3;
  let now = 0;
  const LAYER = 1.1;
  return {
    press(id) {
      if (id === "n+") n = clamp(n + 1, 1, 6);
      if (id === "n-") n = clamp(n - 1, 1, 6);
      start = now + 0.2;
    },
    draw(g, t) {
      now = t;
      const s = sizeFor(n, 400);
      const ox = 280 - ((1 + DEPTH) * n * s) / 2;
      const oy = 470;
      block(g, n, s, ox, oy, (j, i, k) => ease(t, start + j * LAYER + (k * n + i) * (0.5 / (n * n)), 0.35), (j) => SHADES[j % SHADES.length]);

      const sq = n * n;
      const done = clamp(Math.floor((t - start - 0.85) / LAYER) + 1, 0, n);
      g.text(lang === "id" ? "bilangan pangkat tiga" : "cube numbers", PX, 70, 28, C.soft, "center", true);
      for (let j = 0; j < done; j++) {
        const label = lang === "id" ? `lapisan ${num(lang, j + 1)}: ${num(lang, n)} × ${num(lang, n)} = ${num(lang, sq)}` : `layer ${num(lang, j + 1)}: ${num(lang, n)} × ${num(lang, n)} = ${num(lang, sq)}`;
        fit(g, label, PX, 115 + j * 38, PW, 24, SHADES[j % SHADES.length][2]);
      }
      if (done === n) {
        g.c.globalAlpha = ease(t, start + n * LAYER, 0.5);
        fit(g, lang === "id" ? `${num(lang, n)} lapisan × ${num(lang, sq)} = ${num(lang, n * sq)} kubus kecil` : `${num(lang, n)} layers × ${num(lang, sq)} = ${num(lang, n * sq)} small cubes`, PX, 365, PW, 24, C.soft);
        g.card(PX - 190, 395, 380, 76, C.sun, 1);
        fit(g, `${num(lang, n)}³ = ${num(lang, n)} × ${num(lang, n)} × ${num(lang, n)} = ${num(lang, n * sq)}`, PX, 433, 350, 36);
        g.c.globalAlpha = 1;
      }
      stepper(g, lang === "id" ? "rusuk" : "edge", num(lang, n), "n", 280, n > 1, n < 6, C.cobalt);
      g.button("again", lang === "id" ? "BANGUN LAGI" : "BUILD AGAIN", 640, 545, 260, 52, C.teal);
    },
  };
}

/** A cube number built into a cube; counting along one edge gives its cube root. */
function edge(lang: Lang): Scene {
  const NUMS = [1, 8, 27, 64, 125, 216];
  let at = 2;
  let start = 0.2;
  let now = 0;
  return {
    press(id) {
      at = Number(id.slice(1));
      start = now + 0.1;
    },
    draw(g, t) {
      now = t;
      const N = NUMS[at];
      const n = at + 1;
      const s = sizeFor(n, 380);
      const ox = 280 - ((1 + DEPTH) * n * s) / 2;
      const oy = 440;
      const built = start + n * 0.3 + 0.4;
      block(g, n, s, ox, oy, (j) => ease(t, start + j * 0.3, 0.35), (j) => SHADES[j % 2 ? 1 : 0]);
      // The front bottom edge is counted, one cube at a time.
      for (let i = 0; i < n; i++) {
        const k = ease(t, built + i * 0.35, 0.3);
        if (k <= 0) continue;
        g.c.globalAlpha = k;
        g.line(ox + i * s + 3, oy + 10, ox + (i + 1) * s - 3, oy + 10, C.coral, 6);
        g.text(num(lang, i + 1), ox + i * s + s / 2, oy + 32, 22, C.coral, "center", true);
        g.c.globalAlpha = 1;
      }
      const shown = ease(t, built + n * 0.35, 0.5);

      g.text(lang === "id" ? `${num(lang, N)} kubus kecil` : `${num(lang, N)} small cubes`, PX, 90, 36, C.ink, "center", true);
      fit(g, lang === "id" ? "disusun menjadi kubus" : "built into one cube", PX, 140, PW, 24, C.soft);
      g.c.globalAlpha = shown;
      g.card(PX - 150, 185, 300, 100, C.sun, 1);
      g.text(`∛${num(lang, N)} = ${num(lang, n)}`, PX, 235, 56, C.ink, "center", true);
      fit(g, lang === "id" ? `karena ${num(lang, n)} × ${num(lang, n)} × ${num(lang, n)} = ${num(lang, N)}` : `because ${num(lang, n)} × ${num(lang, n)} × ${num(lang, n)} = ${num(lang, N)}`, PX, 325, PW, 28, C.soft);
      fit(g, lang === "id" ? "akar pangkat tiga = panjang rusuk kubus" : "cube root = the edge of the cube", PX, 375, PW, 24, C.coral);
      g.c.globalAlpha = 1;

      const w = 140;
      const gap = 12;
      const x0 = 500 - (NUMS.length * w + (NUMS.length - 1) * gap) / 2;
      NUMS.forEach((v, i) => g.button(`n${i}`, num(lang, v), x0 + i * (w + gap), 545, w, 52, C.cobalt, i !== at));
    },
  };
}

/** The cubes of 1 to 10 in a table beside the cube itself; the table reads both ways. */
function table(lang: Lang): Scene {
  let n = 4;
  let start = 0;
  let now = 0;
  return {
    press(id) {
      n = clamp(n + (id === "n+" ? 1 : -1), 1, 10);
      start = now;
    },
    draw(g, t) {
      now = t;
      const s = sizeFor(n, 340);
      const ox = 270 - ((1 + DEPTH) * n * s) / 2;
      const oy = 440;
      block(g, n, s, ox, oy, (j) => ease(t, start + j * (0.6 / n), 0.3), (j) => SHADES[j % 2 ? 3 : 0]);
      const N = n * n * n;
      fit(g, `${num(lang, n)}³ = ${num(lang, N)}      ∛${num(lang, N)} = ${num(lang, n)}`, 270, 488, 480, 30, C.ink);

      const xs = [610, 760, 905];
      const heads = ["n", "n × n × n", "n³"];
      heads.forEach((h, i) => g.text(h, xs[i], 60, 22, C.soft, "center", true));
      for (let i = 1; i <= 10; i++) {
        const y = 60 + i * 38;
        const on = i === n;
        if (on) g.card(560, y - 17, 400, 34, C.sun, 1);
        const color = on ? C.ink : C.soft;
        g.text(num(lang, i), xs[0], y, 22, on ? C.cobalt : color, "center", true);
        g.text(`${num(lang, i)} × ${num(lang, i)} × ${num(lang, i)}`, xs[1], y, 22, color, "center", true);
        g.text(num(lang, i * i * i), xs[2], y, 22, on ? C.coral : color, "center", true);
      }
      fit(g, lang === "id" ? "kanan ke kiri: akar pangkat tiga" : "right to left: the cube root", 760, 488, 400, 20, C.soft);
      stepper(g, lang === "id" ? "rusuk" : "edge", num(lang, n), "n", 760, n > 1, n < 10, C.plum);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A cube number is a number of small cubes that build one big cube. Watch it grow layer by layer: n × n in each layer, n layers.",
        id: "Bilangan pangkat tiga adalah banyak kubus kecil yang membentuk satu kubus besar. Lihat kubus tumbuh lapis demi lapis: n × n tiap lapisan, sebanyak n lapisan.",
      },
      scene: build,
    },
    {
      say: {
        en: "The cube root goes the other way: build the small cubes into a cube and count along one edge.",
        id: "Akar pangkat tiga adalah kebalikannya: susun kubus kecil menjadi kubus, lalu hitung kubus di sepanjang satu rusuknya.",
      },
      scene: edge,
    },
    {
      say: {
        en: "Here are the cubes of 1 to 10. Read left to right for the cube, right to left for the cube root.",
        id: "Inilah pangkat tiga dari 1 sampai 10. Baca dari kiri ke kanan untuk pangkat tiga, dari kanan ke kiri untuk akar pangkat tiga.",
      },
      scene: table,
    },
  ],
};
