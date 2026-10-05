import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W } from "../ink";
import { dec, frac, gcd, strip, sum, wrap } from "../parts";

type Part = string | [number | string, number | string];

/** A decimal with at most `digits` places and no trailing zeros: 0,5 and 0,35. */
const trim = (lang: Lang, v: number, digits = 2) => {
  for (let d = 0; d < digits; d++) if (Math.abs(Math.round(v * 10 ** d) - v * 10 ** d) < 1e-9) return dec(lang, v, d);
  return dec(lang, v, digits);
};

/** Text that shrinks to fit `maxW` instead of running off the sheet. */
function fit(g: Ink, s: string, x: number, y: number, size: number, maxW: number, color: string = C.ink, align: CanvasTextAlign = "center", bold = true) {
  const w = g.width(s, size, bold);
  g.text(s, x, y, w > maxW ? Math.max(18, (size * maxW) / w) : size, color, align, bold);
}

function arrow(g: Ink, x1: number, y1: number, x2: number, y2: number, color: string, width = 3) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.line(x1, y1, x2, y2, color, width);
  g.line(x2, y2, x2 - 12 * Math.cos(a - 0.5), y2 - 12 * Math.sin(a - 0.5), color, width);
  g.line(x2, y2, x2 - 12 * Math.cos(a + 0.5), y2 - 12 * Math.sin(a + 0.5), color, width);
}

/** A grid of a hundred and a strip below it: one amount read as a fraction, a decimal and a percent. */
function grid(lang: Lang): Scene {
  let n = 25;
  let mode: "grid" | "strip" | null = null;
  let changed = -10;
  let now = 0;
  const GX = 60;
  const GY = 40;
  const S = 40;
  const SX = 60;
  const SW = 880;
  const SY = 466;
  const cell = (p: Pt) => {
    const cx = Math.floor((p.x - GX) / S);
    const cy = Math.floor((p.y - GY) / S);
    return cx >= 0 && cx < 10 && cy >= 0 && cy < 10 ? cy * 10 + cx : null;
  };
  const fromStrip = (p: Pt) => clamp(Math.round(((p.x - SX) / SW) * 100), 0, 100);
  const set = (v: number) => {
    if (v !== n) changed = now;
    n = v;
  };
  return {
    down(p) {
      const c = cell(p);
      if (c !== null) {
        mode = "grid";
        set(c + 1);
        return true;
      }
      if (p.y > SY - 20 && p.y < SY + 70 && p.x > SX - 20 && p.x < SX + SW + 20) {
        mode = "strip";
        set(fromStrip(p));
        return true;
      }
    },
    move(p) {
      if (mode === "grid") {
        const c = cell(p);
        if (c !== null) set(c + 1);
      }
      if (mode === "strip") set(fromStrip(p));
    },
    up() {
      mode = null;
    },
    draw(g, t) {
      now = t;
      g.card(GX, GY, S * 10, S * 10, C.paper, 1);
      for (let i = 0; i < n; i++) {
        g.c.fillStyle = Math.floor(i / 10) % 2 ? "#36a28f" : C.teal;
        g.c.fillRect(GX + (i % 10) * S, GY + Math.floor(i / 10) * S, S, S);
      }
      for (let i = 1; i < 10; i++) {
        g.line(GX + i * S, GY, GX + i * S, GY + 10 * S, "rgba(58, 63, 75, 0.25)", 1);
        g.line(GX, GY + i * S, GX + 10 * S, GY + i * S, "rgba(58, 63, 75, 0.4)", 2);
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(GX, GY, S * 10, S * 10);

      // The same amount as a strip from 0 % to 100 %.
      g.card(SX, SY, SW, 44, C.paper, 1);
      g.c.fillStyle = C.coral;
      g.c.fillRect(SX, SY, (SW * n) / 100, 44);
      for (let i = 1; i < 10; i++) g.crease(SX + (SW * i) / 10, SY, SX + (SW * i) / 10, SY + 44);
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 2;
      g.c.strokeRect(SX, SY, SW, 44);
      for (let i = 0; i <= 4; i++) g.text(`${i * 25}%`, SX + (SW * i) / 4, SY + 66, 18, C.soft, "center", true);
      g.handle(SX + (SW * n) / 100, SY + 22, mode === "strip");

      const pop = 1 + 0.06 * (1 - ease(t, changed, 0.35));
      const card = (y: number, h: number, label: string, color: string, body: () => void) => {
        g.card(520, y, 420, h, C.paper, 1);
        g.text(label, 540, y + 20, 18, C.soft, "left", true);
        g.c.save();
        g.c.translate(730, y + h / 2 + 8);
        g.c.scale(pop, pop);
        body();
        g.c.restore();
        g.c.fillStyle = color;
        g.c.fillRect(520, y + h - 6, 420, 6);
      };
      const d = gcd(n, 100) || 1;
      card(40, 140, lang === "id" ? "pecahan" : "fraction", C.coral, () => {
        if (d > 1 && n > 0 && n < 100) {
          frac(g, n, 100, -110, 0, 40, C.coral);
          g.text("=", -10, 0, 40, C.ink, "center", true);
          frac(g, n / d, 100 / d, 90, 0, 40, C.coral);
        } else frac(g, n, 100, 0, 0, 40, C.coral);
      });
      card(195, 110, lang === "id" ? "desimal" : "decimal", C.cobalt, () => {
        g.text(trim(lang, n / 100), 0, 0, 56, C.cobalt, "center", true);
      });
      card(320, 110, lang === "id" ? "persen" : "percent", C.teal, () => {
        g.text(`${n}%`, 0, 0, 56, C.teal, "center", true);
      });
      g.text(lang === "id" ? "usap kotaknya atau geser pita di bawah" : "sweep the grid or drag along the strip", W / 2, 590, 20, C.soft, "center", true);
    },
  };
}

/** One fraction carried step by step to hundredths, to a decimal, to a percent, and back. */
function convert(lang: Lang): Scene {
  const list: [number, number][] = [
    [1, 2],
    [1, 4],
    [3, 4],
    [2, 5],
    [7, 20],
    [3, 25],
  ];
  let pick = 2;
  let picked = 0;
  let now = 0;
  const xs = [60, 300, 540, 780];
  const CW = 160;
  return {
    press(id) {
      pick = Number(id);
      picked = now;
    },
    draw(g, t) {
      now = t;
      const [a, b] = list[pick];
      const k = 100 / b;
      const p = a * k;
      const titles = lang === "id" ? ["pecahan", "perseratus", "desimal", "persen"] : ["fraction", "hundredths", "decimal", "percent"];
      const how =
        lang === "id"
          ? [`pembilang dan penyebut dikali ${k}`, "dua angka di belakang koma", "dikali 100%"]
          : [`× ${k} above and below`, "two places after the point", "× 100%"];
      const colors = [C.coral, C.coral, C.cobalt, C.teal];
      xs.forEach((x, i) => {
        const k1 = ease(t, picked + i * 0.7, 0.5);
        g.c.globalAlpha = k1;
        g.text(titles[i], x + CW / 2, 92, 20, C.soft, "center", true);
        g.card(x, 110 + (1 - k1) * 20, CW, 120, C.paper, 1);
        const cy = 170 + (1 - k1) * 20;
        if (i === 0) frac(g, a, b, x + CW / 2, cy, 46, colors[i]);
        if (i === 1) frac(g, p, 100, x + CW / 2, cy, 46, colors[i]);
        if (i === 2) g.text(trim(lang, a / b), x + CW / 2, cy, 50, colors[i], "center", true);
        if (i === 3) g.text(`${p}%`, x + CW / 2, cy, 50, colors[i], "center", true);
        if (i > 0) {
          const ax = x - 70;
          arrow(g, ax + 6, 170, x - 8, 170, C.plum, 4);
          wrap(g, how[i - 1], 210, 18).forEach((l, j, all) => g.text(l, x - 40, 268 + (j - (all.length - 1) / 2) * 22, 18, C.plum, "center", true));
        }
        g.c.globalAlpha = 1;
      });
      // The way back, from percent to the fraction.
      const back = ease(t, picked + 2.8, 0.6);
      g.c.globalAlpha = back;
      g.text(lang === "id" ? "dan sebaliknya" : "and back again", W / 2, 322, 22, C.soft, "center", true);
      const parts: Part[] = [`${p}%`, "=", [p, 100]];
      if (gcd(p, 100) > 1) parts.push("=", [a, b]);
      sum(g, parts, W / 2, 380, 40, [C.teal, C.ink, C.coral, C.ink, C.coral]);
      g.c.globalAlpha = 1;
      strip(g, 100, 440, 800, 46, b, a, C.coral);
      fit(g, lang === "id" ? `${p}% dari pita diwarnai` : `${p}% of the strip is coloured`, W / 2, 512, 20, 800, C.soft);
      list.forEach(([x, y], i) => g.button(String(i), `${x}/${y}`, 60 + i * 150, 555, 130, 52, i === pick ? C.cobalt : C.soft));
    },
  };
}

interface Way {
  lines: Part[][];
  notes: string[];
}
interface Example {
  start: Part[];
  colors: string[];
  dec: Way;
  frac: Way;
}

/** A sum mixing a fraction, a decimal and a percent, worked line by line after writing all of it in one form. */
function mixed(lang: Lang): Scene {
  const D = (v: number) => trim(lang, v);
  const div = lang === "id" ? ":" : "÷";
  const id = lang === "id";
  const examples: Example[] = [
    {
      start: [[1, 2], "+", D(0.25), "×", "40%"],
      colors: [C.coral, C.ink, C.cobalt, C.ink, C.teal],
      dec: {
        lines: [
          ["=", D(0.5), "+", D(0.25), "×", D(0.4)],
          ["=", D(0.5), "+", D(0.1)],
          ["=", D(0.6), "=", "60%"],
        ],
        notes: id
          ? ["Tulis semuanya sebagai desimal.", `Kalikan dulu: ${D(0.25)} × ${D(0.4)} = ${D(0.1)}`, "Lalu jumlahkan."]
          : ["Write each one as a decimal.", `Multiply first: ${D(0.25)} × ${D(0.4)} = ${D(0.1)}`, "Then add."],
      },
      frac: {
        lines: [
          ["=", [1, 2], "+", [1, 4], "×", [2, 5]],
          ["=", [1, 2], "+", [1, 10]],
          ["=", [5, 10], "+", [1, 10]],
          ["=", [6, 10], "=", [3, 5]],
        ],
        notes: id
          ? ["Tulis semuanya sebagai pecahan.", "Kalikan dulu: 1/4 × 2/5 = 2/20 = 1/10", "Samakan penyebutnya.", `Jumlahkan, lalu sederhanakan: 3/5 = ${D(0.6)} = 60%`]
          : ["Write each one as a fraction.", "Multiply first: 1/4 × 2/5 = 2/20 = 1/10", "Make the denominators the same.", `Add, then simplify: 3/5 = ${D(0.6)} = 60%`],
      },
    },
    {
      start: [[3, 4], "−", "20%", div, D(0.5)],
      colors: [C.coral, C.ink, C.teal, C.ink, C.cobalt],
      dec: {
        lines: [
          ["=", D(0.75), "−", D(0.2), div, D(0.5)],
          ["=", D(0.75), "−", D(0.4)],
          ["=", D(0.35), "=", "35%"],
        ],
        notes: id
          ? ["Tulis semuanya sebagai desimal.", `Bagi dulu: ${D(0.2)} : ${D(0.5)} = ${D(0.4)}`, "Lalu kurangkan."]
          : ["Write each one as a decimal.", `Divide first: ${D(0.2)} ÷ ${D(0.5)} = ${D(0.4)}`, "Then subtract."],
      },
      frac: {
        lines: [
          ["=", [3, 4], "−", [1, 5], div, [1, 2]],
          ["=", [3, 4], "−", [2, 5]],
          ["=", [15, 20], "−", [8, 20]],
          ["=", [7, 20], "=", "35%"],
        ],
        notes: id
          ? ["Tulis semuanya sebagai pecahan.", "Bagi dulu: 1/5 : 1/2 = 1/5 × 2 = 2/5", "Samakan penyebutnya.", "Kurangkan: 7/20 = 35/100 = 35%"]
          : ["Write each one as a fraction.", "Divide first: 1/5 ÷ 1/2 = 1/5 × 2 = 2/5", "Make the denominators the same.", "Subtract: 7/20 = 35/100 = 35%"],
      },
    },
  ];
  let ex = 0;
  let way: "dec" | "frac" = "dec";
  let shown = 0;
  let added = 0;
  let now = 0;
  const L = id
    ? { dec: "SEMUA DESIMAL", frac: "SEMUA PECAHAN", next: "LANJUTKAN", other: "CONTOH LAIN", first: "tiga bentuk dalam satu hitungan" }
    : { dec: "AS DECIMALS", frac: "AS FRACTIONS", next: "NEXT STEP", other: "OTHER EXAMPLE", first: "three forms in one sum" };
  const CX = 320;
  const lineY = (i: number) => 80 + i * 92;
  return {
    press(name) {
      if (name === "dec" || name === "frac") {
        way = name;
        shown = 0;
      }
      if (name === "next" && shown < examples[ex][way].lines.length) {
        shown += 1;
        added = now;
      }
      if (name === "other") {
        ex = (ex + 1) % examples.length;
        shown = 0;
      }
    },
    draw(g, t) {
      now = t;
      const e = examples[ex];
      const w = e[way];
      sum(g, e.start, CX, lineY(0), 36, e.colors);
      g.text(L.first, 600, lineY(0), 20, C.soft, "left", true);
      for (let i = 0; i < shown; i++) {
        const k = i === shown - 1 ? ease(t, added, 0.6) : 1;
        const y = lineY(i + 1);
        g.c.globalAlpha = k;
        if (i === shown - 1) g.card(40, y - 44, 540, 88, "#fff3d1", 0);
        sum(g, w.lines[i], CX - (1 - k) * 40, y, 36, w.lines[i].map((p) => (typeof p === "string" && /^[=+−×÷:]$/u.test(p) ? C.ink : way === "dec" ? C.cobalt : C.coral)));
        wrap(g, w.notes[i], 360, 20).forEach((l, j, all) =>
          g.text(l, 600, y + (j - (all.length - 1) / 2) * 24, 20, i === shown - 1 ? C.ink : C.soft, "left", true),
        );
        g.c.globalAlpha = 1;
      }
      g.crease(590, 50, 590, 500);
      g.button("dec", L.dec, 32, 555, 225, 52, way === "dec" ? C.cobalt : C.soft);
      g.button("frac", L.frac, 269, 555, 225, 52, way === "frac" ? C.coral : C.soft);
      g.button("next", L.next, 506, 555, 225, 52, C.teal, shown < w.lines.length);
      g.button("other", L.other, 743, 555, 225, 52, C.plum);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "One amount can be written three ways: as a fraction, a decimal and a percent. Colour the grid and watch all three change together.",
        id: "Satu nilai bisa ditulis dengan tiga cara: pecahan, desimal, dan persen. Warnai kotaknya dan lihat ketiganya berubah bersama.",
      },
      scene: grid,
    },
    {
      say: {
        en: "To change a fraction, first make it hundredths. Then the decimal and the percent can be read straight off. Pick a fraction.",
        id: "Untuk mengubah pecahan, jadikan dulu perseratus. Setelah itu desimal dan persennya langsung terbaca. Pilih satu pecahan.",
      },
      scene: convert,
    },
    {
      say: {
        en: "When a sum mixes forms, write everything in one form first, then work × and ÷ before + and −. Both ways give the same answer.",
        id: "Bila satu hitungan memakai bentuk yang berbeda, tulis dulu semuanya dalam satu bentuk, lalu kerjakan × dan : sebelum + dan −. Kedua cara memberi hasil yang sama.",
      },
      scene: mixed,
    },
  ],
};
