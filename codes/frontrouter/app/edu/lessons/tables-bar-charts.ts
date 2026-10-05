import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, lerp } from "../ink";
import { num, wrap } from "../parts";

const FRUITS = {
  en: ["apple", "banana", "melon", "grapes"],
  id: ["apel", "pisang", "melon", "anggur"],
};
const HUE = [C.coral, C.sun, C.teal, C.plum];
const START = [6, 4, 8, 3];

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A round paper fruit with a stalk; `half` keeps only its left half. */
function fruit(g: Ink, i: number, x: number, y: number, r: number, half = false) {
  const c = g.c;
  c.save();
  if (half) {
    c.beginPath();
    c.rect(x - r - 4, y - r - 12, r + 4, 2 * r + 20);
    c.clip();
  }
  g.dot(x + 2, y + 3, r, "rgba(70, 50, 25, 0.22)");
  g.dot(x, y, r, HUE[i]);
  g.dot(x - r * 0.35, y - r * 0.35, r * 0.22, "rgba(255, 255, 255, 0.55)");
  g.line(x, y - r, x + r * 0.25, y - r - 7, C.ink, 2);
  c.restore();
}

/** Tally marks: four upright, the fifth across them; the newest one is drawn as `k` goes to 1. */
function marks(g: Ink, count: number, x: number, cy: number, k: number) {
  const h = 40;
  let at = x;
  for (let i = 0; i < count; i++) {
    const p = i === count - 1 ? k : 1;
    const inGroup = i % 5;
    if (inGroup < 4) {
      const mx = at + inGroup * 12;
      g.line(mx, cy - h / 2, mx, cy - h / 2 + h * p, C.ink, 4);
    } else {
      g.line(at - 8, cy + h / 2 - 6, lerp(at - 8, at + 44, p), lerp(cy + h / 2 - 6, cy - h / 2 + 6, p), C.coral, 4);
      at += 72;
    }
  }
}

/** A row's − and + buttons. */
function plusMinus(g: Ink, i: number, cy: number, n: number, max: number) {
  g.button(`-${i}`, "−", 832, cy - 23, 52, 46, C.coral, n > 0);
  g.button(`+${i}`, "+", 892, cy - 23, 52, 46, C.teal, n < max);
}

/** A tally table of favourite fruit: + adds a mark, and every fifth mark ties a bundle. */
function tally(lang: Lang): Scene {
  const n = [...START];
  const changed = [-9, -9, -9, -9];
  const grew = [false, false, false, false];
  let now = 0;
  return {
    press(id) {
      const i = Number(id.slice(1));
      const up = id[0] === "+";
      n[i] = clamp(n[i] + (up ? 1 : -1), 0, 20);
      changed[i] = now;
      grew[i] = up;
    },
    draw(g, t) {
      now = t;
      const heads = lang === "id" ? ["buah kesukaan", "turus", "banyak"] : ["fruit", "tally", "frequency"];
      g.card(50, 70, 900, 50, C.field, 0);
      g.text(heads[0], 150, 95, 24, C.ink, "center", true);
      g.text(heads[1], 470, 95, 24, C.ink, "center", true);
      g.text(heads[2], 755, 95, 24, C.ink, "center", true);
      for (let i = 0; i < 4; i++) {
        const y = 130 + i * 74;
        const cy = y + 32;
        g.card(50, y, 900, 64, i % 2 ? C.paper : "#f8efdc", 0.6);
        g.crease(260, y + 6, 260, y + 58);
        g.crease(690, y + 6, 690, y + 58);
        fruit(g, i, 82, cy, 15);
        g.text(FRUITS[lang][i], 110, cy, 26, C.ink, "left", true);
        // Spread the marks out over the first second of the step.
        const shown = Math.min(n[i], Math.floor(t * 8));
        const k = grew[i] ? ease(t, changed[i], 0.3) : 1;
        marks(g, shown, 290, cy, shown === n[i] ? k : 1);
        const pop = 1 + 0.2 * (1 - ease(t, changed[i], 0.35));
        g.c.save();
        g.c.translate(755, cy);
        g.c.scale(pop, pop);
        g.text(num(lang, n[i]), 0, 0, 34, C.cobalt, "center", true);
        g.c.restore();
        plusMinus(g, i, cy, n[i], 20);
      }
      const total = n.reduce((a, b) => a + b, 0);
      g.text(`${lang === "id" ? "jumlah" : "total"}: ${num(lang, total)} ${lang === "id" ? "anak" : "children"}`, 755, 455, 26, C.ink, "center", true);
      marks(g, 5, 70, 530, 1);
      g.text("= 5", 140, 530, 26, C.ink, "left", true);
      fit(g, lang === "id" ? "tekan + untuk menambah satu turus" : "press + to add one tally mark", 950, 530, 640, 22, C.soft, "right");
    },
  };
}

/** The same counts as a pictograph: one fruit for every 2 children, half a fruit for 1. */
function picto(lang: Lang): Scene {
  const n = [...START];
  const changed = [-9, -9, -9, -9];
  let now = 0;
  return {
    press(id) {
      const i = Number(id.slice(1));
      n[i] = clamp(n[i] + (id[0] === "+" ? 1 : -1), 0, 20);
      changed[i] = now;
    },
    draw(g, t) {
      now = t;
      g.card(50, 50, 900, 50, C.field, 0);
      g.text(lang === "id" ? "buah kesukaan" : "fruit", 140, 75, 24, C.ink, "center", true);
      g.text(lang === "id" ? "banyak anak" : "children", 480, 75, 24, C.ink, "center", true);
      for (let i = 0; i < 4; i++) {
        const y = 110 + i * 80;
        const cy = y + 34;
        g.card(50, y, 900, 68, i % 2 ? C.paper : "#f8efdc", 0.6);
        g.crease(230, y + 6, 230, y + 62);
        g.text(FRUITS[lang][i], 140, cy, 26, C.ink, "center", true);
        const icons = Math.ceil(n[i] / 2);
        for (let j = 0; j < icons; j++) {
          // Each picture pops in after the one before it.
          const k = ease(t, Math.max(0.2 + j * 0.12 + i * 0.1, j === icons - 1 ? changed[i] : 0), 0.35);
          if (k <= 0) continue;
          const half = j === icons - 1 && n[i] % 2 === 1;
          fruit(g, i, 266 + j * 48, cy, 19 * (0.4 + 0.6 * k), half);
        }
        g.text(num(lang, n[i]), 790, cy, 28, C.soft, "center", true);
        plusMinus(g, i, cy, n[i], 20);
      }
      g.card(200, 455, 600, 70, C.paper, 1);
      fruit(g, 0, 270, 492, 19);
      g.text(`= 2 ${lang === "id" ? "anak" : "children"}`, 300, 490, 28, C.ink, "left", true);
      fruit(g, 0, 560, 492, 19, true);
      g.text(`= 1 ${lang === "id" ? "anak" : "child"}`, 590, 490, 28, C.ink, "left", true);
      g.text(lang === "id" ? "keterangan" : "key", 500, 548, 22, C.soft, "center", true);
    },
  };
}

interface Chart {
  names: string[];
  colors: string[];
  x0: number;
  x1: number;
  slot: number;
  barW: number;
  max: number;
}

const BASE = 470;
const TALL = 360;

/** Grid lines every `scale`, the axes, and the bars at heights `shown`. */
function drawChart(g: Ink, lang: Lang, o: Chart, shown: number[], scale: number, fade: number, sel: number) {
  const u = TALL / o.max;
  g.c.globalAlpha = fade;
  for (let v = 0; v <= o.max; v += scale) {
    const y = BASE - v * u;
    if (v) g.line(o.x0, y, o.x1, y, "rgba(58, 63, 75, 0.15)", 1);
    g.text(num(lang, v), o.x0 - 14, y, scale * u < 28 ? 18 : 20, C.soft, "right", true);
  }
  g.c.globalAlpha = 1;
  shown.forEach((v, i) => {
    const cx = o.x0 + o.slot * (i + 0.5);
    const h = v * u;
    if (h > 0.5) g.card(cx - o.barW / 2, BASE - h, o.barW, h, o.colors[i], 0.8);
    g.text(num(lang, Math.round(v)), cx, BASE - h - 18, 24, C.ink, "center", true);
    fit(g, o.names[i], cx, 497, o.slot - 10, 22, C.ink);
  });
  // Reading the chosen bar: its top carried straight across to the axis.
  const cx = o.x0 + o.slot * (sel + 0.5);
  const top = BASE - shown[sel] * u;
  g.c.setLineDash([8, 6]);
  g.line(cx - o.barW / 2, top, o.x0, top, C.coral, 2);
  g.c.setLineDash([]);
  g.dot(o.x0, top, 6, C.coral);
  g.line(o.x0, BASE, o.x1, BASE, C.ink, 3);
  g.line(o.x0, BASE, o.x0, BASE - TALL - 14, C.ink, 3);
}

/** Which bar was pressed on, if any. */
function barAt(o: Chart, p: Pt, shown: number[]) {
  const u = TALL / o.max;
  for (let i = 0; i < shown.length; i++) {
    const cx = o.x0 + o.slot * (i + 0.5);
    if (Math.abs(p.x - cx) < o.barW / 2 + 10 && p.y < BASE + 40 && p.y > BASE - shown[i] * u - 40) return i;
  }
  return null;
}

/** The fruit counts as a bar chart with a scale of 1: + makes a bar grow, and its top is read on the axis. */
function bars(lang: Lang): Scene {
  const n = [...START];
  const shown = [0, 0, 0, 0];
  let sel = 2;
  let last = 0;
  const o: Chart = { names: FRUITS[lang], colors: HUE, x0: 140, x1: 950, slot: 200, barW: 100, max: 12 };
  return {
    press(id) {
      const i = Number(id.slice(1));
      n[i] = clamp(n[i] + (id[0] === "+" ? 1 : -1), 0, o.max);
      sel = i;
    },
    down(p) {
      const i = barAt(o, p, shown);
      if (i !== null) sel = i;
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      shown.forEach((v, i) => {
        if (t > 0.4 + i * 0.35) shown[i] = v + (n[i] - v) * (1 - Math.exp(-dt * 5));
      });
      fit(g, lang === "id" ? "buah kesukaan di kelas" : "favourite fruit in the class", 545, 40, 760, 30, C.ink);
      g.text(lang === "id" ? "banyak anak" : "children", o.x0, 85, 20, C.soft, "center", true);
      drawChart(g, lang, o, shown, 1, 1, sel);
      n.forEach((v, i) => {
        const cx = o.x0 + o.slot * (i + 0.5);
        g.button(`-${i}`, "−", cx - 58, 555, 52, 52, C.coral, v > 0);
        g.button(`+${i}`, "+", cx + 6, 555, 52, 52, C.teal, v < o.max);
      });
    },
  };
}

/** Bigger counts on an axis that steps by 2 or by 5; a bar between two lines is read between them. */
function scaled(lang: Lang): Scene {
  const n = [14, 22, 9, 27];
  const shown = [0, 0, 0, 0];
  let scale = 5;
  let changed = -9;
  let sel = 3;
  let last = 0;
  let now = 0;
  const names = lang === "id" ? ["jalan kaki", "sepeda", "motor", "mobil"] : ["walking", "bicycle", "motorbike", "car"];
  const o: Chart = { names, colors: [C.teal, C.cobalt, C.coral, C.plum], x0: 120, x1: 770, slot: 160, barW: 90, max: 30 };
  const PX = 880;
  return {
    press(id) {
      if (id === "s2" || id === "s5") {
        scale = id === "s2" ? 2 : 5;
        changed = now;
        return;
      }
      const i = Number(id.slice(1));
      n[i] = clamp(n[i] + (id[0] === "+" ? 1 : -1), 0, o.max);
      sel = i;
    },
    down(p) {
      const i = barAt(o, p, shown);
      if (i !== null) sel = i;
    },
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      shown.forEach((v, i) => {
        if (t > 0.4 + i * 0.3) shown[i] = v + (n[i] - v) * (1 - Math.exp(-dt * 5));
      });
      fit(g, lang === "id" ? "cara siswa berangkat ke sekolah" : "how pupils get to school", 445, 40, 640, 30, C.ink);
      g.text(lang === "id" ? "banyak siswa" : "pupils", o.x0, 85, 20, C.soft, "center", true);
      drawChart(g, lang, o, shown, scale, ease(t, changed, 0.5), sel);
      n.forEach((v, i) => {
        const cx = o.x0 + o.slot * (i + 0.5);
        g.button(`-${i}`, "−", cx - 58, 555, 52, 52, C.coral, v > 0);
        g.button(`+${i}`, "+", cx + 6, 555, 52, 52, C.teal, v < o.max);
      });

      const word = lang === "id" ? "SKALA" : "SCALE";
      g.button("s2", `${word} 2`, PX - 80, 110, 160, 52, scale === 2 ? C.cobalt : C.soft);
      g.button("s5", `${word} 5`, PX - 80, 175, 160, 52, scale === 5 ? C.cobalt : C.soft);
      fit(g, lang === "id" ? `tiap garis ${scale}` : `each line: ${scale}`, PX, 260, 160, 22, C.soft);
      const v = n[sel];
      g.card(PX - 80, 290, 160, 210, C.paper, 1);
      fit(g, names[sel], PX, 318, 150, 22, o.colors[sel]);
      g.text(num(lang, v), PX, 368, 48, o.colors[sel], "center", true);
      const lo = Math.floor(v / scale) * scale;
      const said =
        v % scale === 0
          ? lang === "id"
            ? `tepat di garis ${num(lang, v)}`
            : `right on the ${num(lang, v)} line`
          : lang === "id"
            ? `di antara ${num(lang, lo)} dan ${num(lang, lo + scale)}`
            : `between ${num(lang, lo)} and ${num(lang, lo + scale)}`;
      wrap(g, said, 140, 20).forEach((line, i) => g.text(line, PX, 420 + i * 26, 20, C.ink, "center"));
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A tally table counts with marks: every fifth mark crosses the four before it. Press + to add a mark.",
        id: "Tabel turus mencatat dengan garis: setiap turus kelima mencoret empat turus sebelumnya. Tekan + untuk menambah turus.",
      },
      scene: tally,
    },
    {
      say: {
        en: "A pictograph shows the same counts with pictures. Here one fruit stands for 2 children, and half a fruit for 1.",
        id: "Piktogram menyajikan data yang sama dengan gambar. Di sini satu buah mewakili 2 anak, dan setengah buah mewakili 1 anak.",
      },
      scene: picto,
    },
    {
      say: {
        en: "In a bar chart the height of each bar shows the count. Press + to make a bar grow, and read its top across to the axis.",
        id: "Pada diagram batang, tinggi setiap batang menunjukkan banyaknya. Tekan + agar batang tumbuh, lalu baca puncaknya lurus ke sumbu.",
      },
      scene: bars,
    },
    {
      say: {
        en: "For bigger numbers each line on the axis can stand for 2 or for 5. A bar that ends between two lines is between their values.",
        id: "Untuk bilangan yang besar, setiap garis pada sumbu bisa bernilai 2 atau 5. Batang yang berakhir di antara dua garis bernilai di antara keduanya.",
      },
      scene: scaled,
    },
  ],
};
