import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, lerp, pulse } from "../ink";
import { dec, num, wrap } from "../parts";

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A number with no more decimals than it needs, up to two. */
function nice(lang: Lang, v: number) {
  for (let d = 0; d < 2; d++) {
    const k = 10 ** d;
    if (Math.abs(v * k - Math.round(v * k)) < 1e-6) return dec(lang, v, d);
  }
  return dec(lang, v, 2);
}

const exact = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const HUE = [C.coral, C.cobalt, C.teal, C.plum, C.sun, "#e9625c"];
const SETS = [
  [6, 2, 5, 3],
  [7, 1, 3, 5],
  [2, 8, 5],
  [5, 1, 6, 3, 5],
];

/** One paper cube with its top left corner at (x, y). */
function cube(g: Ink, x: number, y: number, s: number, color: string, lift = 0.6) {
  g.card(x + 2, y + 2, s - 4, s - 4, color, lift);
  g.c.fillStyle = "rgba(255, 255, 255, 0.28)";
  g.c.fillRect(x + 2, y + 2, s - 4, (s - 4) * 0.25);
}

/** A dashed line across the towers at the mean, with its label and value at the right end. */
function meanLine(g: Ink, lang: Lang, x0: number, x1: number, y: number, mean: number, alpha: number) {
  g.c.globalAlpha = alpha;
  g.c.setLineDash([10, 7]);
  g.line(x0, y, x1, y, C.coral, 3);
  g.c.setLineDash([]);
  g.text(lang === "id" ? "rata-rata" : "mean", x1 + 8, y - 14, 22, C.coral, "left", true);
  g.text(`${exact(mean) ? "" : "≈ "}${nice(lang, mean)}`, x1 + 8, y + 14, 22, C.coral, "left", true);
  g.c.globalAlpha = 1;
}

/** Towers of cubes levelled out: a cube moves from the tallest to the shortest, by itself or by hand. */
function level(lang: Lang): Scene {
  let pick = 0;
  let towers: string[][] = [];
  let flying: { color: string; from: Pt; to: number; start: number } | null = null;
  let held: { color: string; from: number; at: Pt } | null = null;
  let auto = false;
  let now = 0;
  const S = 40;
  const BASE = 490;
  const X0 = 60;
  const X1 = 560;
  const PX = 830;
  const load = () => {
    towers = SETS[pick].map((h, i) => Array.from({ length: h }, () => HUE[i]));
    flying = null;
    held = null;
    auto = false;
  };
  load();
  const cx = (i: number) => X0 + ((X1 - X0) / towers.length) * (i + 0.5);
  const topOf = (i: number, h = towers[i].length) => ({ x: cx(i) - S / 2, y: BASE - (h + 1) * S });
  const total = () => towers.reduce((a, b) => a + b.length, 0);
  const towerAt = (x: number) => clamp(Math.floor(((x - X0) / (X1 - X0)) * towers.length), 0, towers.length - 1);
  return {
    press(id) {
      if (id === "level") auto = true;
      if (id === "again") load();
      if (id === "other") {
        pick = (pick + 1) % SETS.length;
        load();
      }
    },
    down(p) {
      if (flying) return;
      for (let i = 0; i < towers.length; i++) {
        const h = towers[i].length;
        if (!h) continue;
        const top = topOf(i, h - 1);
        if (p.x >= top.x - 6 && p.x <= top.x + S + 6 && p.y >= top.y - 10 && p.y <= top.y + S + 6) {
          const color = towers[i].pop() as string;
          held = { color, from: i, at: { x: p.x - S / 2, y: p.y - S / 2 } };
          auto = false;
          return true;
        }
      }
    },
    move(p) {
      if (held) held.at = { x: p.x - S / 2, y: p.y - S / 2 };
    },
    up() {
      if (!held) return;
      const to = held.at.y < BASE + 20 ? towerAt(held.at.x + S / 2) : held.from;
      towers[to].push(held.color);
      held = null;
    },
    draw(g, t) {
      now = t;
      // A finished flight lands; the next automatic move starts after a pause.
      if (flying && t >= flying.start + 0.6) {
        towers[flying.to].push(flying.color);
        flying = null;
      }
      const hs = towers.map((c) => c.length);
      const mean = total() / towers.length + (held || flying ? 1 / towers.length : 0);
      if (auto && !flying && !held && t > 0.3) {
        const hi = hs.indexOf(Math.max(...hs));
        const lo = hs.indexOf(Math.min(...hs));
        if (hs[hi] - hs[lo] > 1) {
          const from = topOf(hi, hs[hi] - 1);
          const color = towers[hi].pop() as string;
          flying = { color, from, to: lo, start: t + 0.15 };
        } else auto = false;
      }
      g.line(X0 - 10, BASE, X1 + 10, BASE, C.ink, 3);
      towers.forEach((c, i) => {
        c.forEach((color, j) => cube(g, cx(i) - S / 2, BASE - (j + 1) * S, S, color));
        g.text(num(lang, c.length + (flying && flying.to === i && t >= flying.start + 0.6 ? 1 : 0)), cx(i), BASE + 22, 22, C.ink, "center", true);
      });
      if (flying) {
        const k = ease(t, flying.start, 0.6);
        const to = topOf(flying.to);
        const x = lerp(flying.from.x, to.x, k);
        const y = lerp(flying.from.y, to.y, k) - Math.sin(Math.PI * k) * 80;
        cube(g, x, y, S, flying.color, 1.4);
      }
      if (held) cube(g, held.at.x, held.at.y, S, held.color, 1.8);
      const even = !flying && !held && Math.max(...hs) === Math.min(...hs);
      meanLine(g, lang, X0 - 10, X1 + 10, BASE - mean * S, mean, even ? 1 : 0.5 + 0.3 * pulse(t));

      fit(g, lang === "id" ? "tinggi menara" : "tower heights", PX, 80, 240, 24, C.soft);
      fit(g, hs.map((h) => num(lang, h)).join(", "), PX, 125, 240, 36, C.ink);
      fit(g, `${lang === "id" ? "jumlah kubus" : "cubes in all"}: ${num(lang, total() + (held || flying ? 1 : 0))}`, PX, 180, 240, 24, C.cobalt);
      if (even) {
        g.card(PX - 120, 220, 240, 120, C.sun, 1);
        const said = lang === "id" ? `Semua menara sama tinggi: ${num(lang, hs[0])} kubus. Itulah rata-ratanya.` : `All towers are the same: ${num(lang, hs[0])} cubes high. That is the mean.`;
        wrap(g, said, 220, 22).forEach((line, i) => g.text(line, PX, 250 + i * 28, 22, C.ink, "center", true));
      } else {
        const said = lang === "id" ? "Geser kubus paling atas dari menara tinggi ke menara pendek." : "Drag a top cube from a tall tower to a short one.";
        wrap(g, said, 230, 22).forEach((line, i) => g.text(line, PX, 250 + i * 28, 22, C.soft, "center"));
      }
      g.button("level", lang === "id" ? "RATAKAN" : "LEVEL THEM", 40, 555, 220, 52, C.teal, !even && !auto);
      g.button("again", lang === "id" ? "ULANGI" : "START AGAIN", 280, 555, 220, 52, C.coral);
      g.button("other", lang === "id" ? "MENARA LAIN" : "OTHER TOWERS", 680, 555, 280, 52, C.cobalt);
    },
  };
}

/** Every cube goes into one long line, the line is cut into equal parts, and each part stands up as a tower. */
function share(lang: Lang): Scene {
  let pick = 0;
  let T0 = 0;
  let now = 0;
  const S = 36;
  const BASE = 500;
  const LINE = 132;
  const GAP = 22;
  const X0 = 80;
  const X1 = 800;
  return {
    press(id) {
      if (id === "other") pick = (pick + 1) % SETS.length;
      T0 = now;
    },
    draw(g, t) {
      now = t;
      const hs = SETS[pick];
      const n = hs.length;
      const sum = hs.reduce((a, b) => a + b, 0);
      const m = sum / n;
      const cx = (i: number) => X0 + ((X1 - X0) / n) * (i + 0.5);
      const T1 = T0 + 0.8 + sum * 0.12 + 0.6;
      const T2 = T1 + 1.8;
      const lineW = sum * S;
      const cutW = lineW + (n - 1) * GAP;
      g.line(X0 - 10, BASE, X1 + 10, BASE, C.ink, 3);
      let k = 0;
      hs.forEach((h, i) => {
        for (let j = 0; j < h; j++, k++) {
          const part = Math.floor(k / m);
          const q = k % m;
          let x = cx(i) - S / 2;
          let y = BASE - (j + 1) * S;
          const k1 = ease(t, T0 + 0.8 + k * 0.12, 0.6);
          x = lerp(x, 500 - lineW / 2 + k * S, k1);
          y = lerp(y, LINE - S / 2, k1) - Math.sin(Math.PI * k1) * 40;
          const k2 = ease(t, T1 + 0.5, 0.6);
          x = lerp(x, 500 - cutW / 2 + k * S + part * GAP, k2);
          const k3 = ease(t, T2 + part * 0.3, 0.8);
          x = lerp(x, cx(part) - S / 2, k3);
          y = lerp(y, BASE - (q + 1) * S, k3);
          cube(g, x, y, S, HUE[i]);
        }
      });
      // The scissors' cuts between the equal parts.
      const cut = ease(t, T1 + 0.5, 0.6) * (1 - ease(t, T2, 0.3));
      if (cut > 0) {
        for (let p = 1; p < n; p++) {
          const x = 500 - cutW / 2 + p * m * S + (p - 0.5) * GAP;
          g.c.globalAlpha = cut;
          g.c.setLineDash([6, 5]);
          g.line(x, LINE - 34, x, LINE + 34, C.coral, 3);
          g.c.setLineDash([]);
          g.c.globalAlpha = 1;
        }
      }
      const parts = hs.map((h) => num(lang, h)).join(" + ");
      g.c.globalAlpha = ease(t, T1 - 0.4, 0.5);
      fit(g, lang === "id" ? "semua kubus dalam satu barisan" : "all the cubes in one line", 500, 30, 600, 22, C.soft);
      fit(g, `${parts} = ${num(lang, sum)}`, 500, 74, 880, 36, C.ink);
      g.c.globalAlpha = ease(t, T1 + 0.6, 0.5);
      const by = lang === "id" ? ":" : "÷";
      fit(g, `${num(lang, sum)} ${by} ${num(lang, n)} = ${nice(lang, m)}`, 500, 205, 600, 44, C.cobalt);
      fit(g, lang === "id" ? `dipotong menjadi ${num(lang, n)} bagian sama panjang` : `cut into ${num(lang, n)} equal parts`, 500, 250, 700, 22, C.soft);
      g.c.globalAlpha = 1;
      const done = ease(t, T2 + n * 0.3 + 0.6, 0.5);
      if (done > 0) {
        meanLine(g, lang, X0 - 10, X1 + 10, BASE - m * S, m, done);
        for (let p = 0; p < n; p++) {
          g.c.globalAlpha = done;
          g.text(num(lang, m), cx(p), BASE + 22, 22, C.ink, "center", true);
          g.c.globalAlpha = 1;
        }
      } else if (t < T0 + 0.8 + 0.3) {
        hs.forEach((h, i) => g.text(num(lang, h), cx(i), BASE + 22, 22, C.ink, "center", true));
      }
      g.button("play", lang === "id" ? "PUTAR LAGI" : "PLAY AGAIN", 40, 555, 260, 52, C.teal);
      g.button("other", lang === "id" ? "MENARA LAIN" : "OTHER TOWERS", 680, 555, 280, 52, C.cobalt);
    },
  };
}

/** Towers the learner raises and lowers with + and −; the mean line follows, and what sticks out above it fills the gaps below. */
function adjust(lang: Lang): Scene {
  const hs = [5, 2, 6, 3];
  let shownMean = 4;
  let last = 0;
  const S = 36;
  const BASE = 500;
  const X0 = 50;
  const X1 = 560;
  const PX = 830;
  return {
    press(id) {
      if (id === "add" && hs.length < 6) hs.push(4);
      else if (id === "drop" && hs.length > 2) hs.pop();
      else if (id[0] === "+" || id[0] === "-") {
        const i = Number(id.slice(1));
        hs[i] = clamp(hs[i] + (id[0] === "+" ? 1 : -1), 0, 9);
      }
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      const n = hs.length;
      const sum = hs.reduce((a, b) => a + b, 0);
      const m = sum / n;
      shownMean += (m - shownMean) * (1 - Math.exp(-dt * 8));
      const slot = (X1 - X0) / n;
      const cx = (i: number) => X0 + slot * (i + 0.5);
      const my = BASE - shownMean * S;
      g.line(X0 - 10, BASE, X1 + 10, BASE, C.ink, 3);
      hs.forEach((h, i) => {
        for (let j = 0; j < h; j++) cube(g, cx(i) - S / 2, BASE - (j + 1) * S, S, HUE[i]);
        // Above the mean line: the part to give away; below it: the gap to fill.
        const top = BASE - h * S;
        if (top < my) {
          g.c.fillStyle = "rgba(255, 255, 255, 0.45)";
          g.c.fillRect(cx(i) - S / 2 + 2, top + 2, S - 4, my - top - 2);
        } else if (top > my) {
          g.c.fillStyle = "rgba(63, 182, 160, 0.18)";
          g.c.fillRect(cx(i) - S / 2 + 2, my, S - 4, top - my);
          g.c.setLineDash([5, 4]);
          g.c.strokeStyle = C.teal;
          g.c.lineWidth = 2;
          g.c.strokeRect(cx(i) - S / 2 + 2, my, S - 4, top - my);
          g.c.setLineDash([]);
        }
        g.text(num(lang, h), cx(i), BASE + 22, 22, C.ink, "center", true);
        g.button(`-${i}`, "−", cx(i) - 40, 555, 38, 52, C.coral, h > 0);
        g.button(`+${i}`, "+", cx(i) + 2, 555, 38, 52, C.teal, h < 9);
      });
      meanLine(g, lang, X0 - 10, X1 + 10, my, m, 1);

      const by = lang === "id" ? ":" : "÷";
      fit(g, `(${hs.map((h) => num(lang, h)).join(" + ")}) ${by} ${num(lang, n)}`, PX, 70, 240, 28, C.ink);
      fit(g, `= ${num(lang, sum)} ${by} ${num(lang, n)}`, PX, 118, 240, 28, C.ink);
      fit(g, `= ${exact(m) ? "" : "≈ "}${nice(lang, m)}`, PX, 178, 240, 52, C.coral);
      const over = hs.reduce((a, h) => a + Math.max(0, h - m), 0);
      const said =
        lang === "id"
          ? `Bagian di atas garis (${nice(lang, over)} kubus) tepat mengisi celah di bawahnya.`
          : `What sticks out above the line (${nice(lang, over)} cubes) just fills the gaps below it.`;
      wrap(g, said, 240, 20).forEach((line, i) => g.text(line, PX, 240 + i * 27, 20, C.soft, "center"));
      g.button("add", lang === "id" ? "TAMBAH MENARA" : "ADD A TOWER", PX - 120, 380, 240, 52, C.cobalt, n < 6);
      g.button("drop", lang === "id" ? "KURANGI MENARA" : "REMOVE A TOWER", PX - 120, 445, 240, 52, C.plum, n > 2);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "The mean makes things level. Move cubes from the tall towers to the short ones until every tower is the same height.",
        id: "Rata-rata membuat semuanya sama rata. Pindahkan kubus dari menara yang tinggi ke menara yang pendek sampai semua menara sama tinggi.",
      },
      scene: level,
    },
    {
      say: {
        en: "Another way: put all the cubes in one line, which is the sum, then cut it into as many equal parts as there are towers.",
        id: "Cara lain: jajarkan semua kubus dalam satu barisan, itulah jumlahnya, lalu potong menjadi bagian sama panjang sebanyak menaranya.",
      },
      scene: share,
    },
    {
      say: {
        en: "Mean = sum of the data ÷ number of data. Press + or − on a tower and watch the mean line move.",
        id: "Rata-rata = jumlah data : banyak data. Tekan + atau − pada menara dan lihat garis rata-rata bergeser.",
      },
      scene: adjust,
    },
  ],
};
