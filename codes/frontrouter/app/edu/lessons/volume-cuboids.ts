import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene } from "../ink";
import { num, words, wrap } from "../parts";

/** How far the depth of a solid leans right and up on the paper, per unit. */
const DX = 0.42;
const DY = 0.34;
const PX = 800;
const LAYER = [C.teal, C.sun, C.coral, C.cobalt, C.plum];

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

/** A palette colour made lighter (k above 0) or darker (k below 0). */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

function poly(g: Ink, pts: Pt[], fill: string | null, stroke: string | null, width = 1.5) {
  const c = g.c;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.lineJoin = "round";
    c.stroke();
  }
}

/** A box w wide, h tall and d deep seen a little from above and the right; (x, y) is its front bottom left corner. */
function box(g: Ink, x: number, y: number, w: number, h: number, d: number, front: string, top: string, side: string, line: string | null = "rgba(58, 63, 75, 0.5)") {
  const ox = d * DX;
  const oy = d * DY;
  poly(g, [{ x, y }, { x: x + w, y }, { x: x + w, y: y - h }, { x, y: y - h }], front, line);
  poly(g, [{ x, y: y - h }, { x: x + w, y: y - h }, { x: x + w + ox, y: y - h - oy }, { x: x + ox, y: y - h - oy }], top, line);
  poly(g, [{ x: x + w, y }, { x: x + w + ox, y: y - oy }, { x: x + w + ox, y: y - h - oy }, { x: x + w, y: y - h }], side, line);
}

/** One unit cube of a stack whose front bottom left corner is at (ox, oy): i along, j up, d back; `grow` swells it from its middle. */
function unit(g: Ink, ox: number, oy: number, s: number, i: number, j: number, d: number, color: string, grow = 1, drop = 0) {
  const cx = ox + i * s + d * s * DX + (s + s * DX) / 2;
  const cy = oy - j * s - d * s * DY - (s + s * DY) / 2 - drop;
  const z = s * grow;
  box(g, cx - (z + z * DX) / 2, cy + (z + z * DY) / 2, z, z, z, color, shade(color, 0.35), shade(color, -0.2));
}

/** The three sides of a stack named beside its edges. */
function sides(g: Ink, lang: Lang, ox: number, oy: number, s: number, p: number, l: number, t: number, unitName = "") {
  const id = lang === "id";
  const u = unitName ? ` ${unitName}` : "";
  g.text(`${id ? "p" : "l"} = ${num(lang, p)}${u}`, ox + (p * s) / 2, oy + 24, 24, C.cobalt, "center", true);
  g.text(`${id ? "l" : "w"} = ${num(lang, l)}${u}`, ox + p * s + (l * s * DX) / 2 + 14, oy - (l * s * DY) / 2 + 8, 24, "#2f9a86", "left", true);
  g.text(`${id ? "t" : "h"} = ${num(lang, t)}${u}`, ox - 14, oy - (t * s) / 2, 24, C.coral, "right", true);
}

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  fit(g, label, cx, 518, 230, 22, C.soft);
  g.button(`${id}-`, "−", cx - 115, 545, 70, 52, color, canDown);
  g.text(value, cx, 571, 28, C.ink, "center", true);
  g.button(`${id}+`, "+", cx + 45, 545, 70, 52, color, canUp);
}

/** Cubes that came into the stack since the last frame swell in, one after another. */
class Births {
  born = new Map<string, number>();
  grow(keys: string[], t: number, gap: number) {
    const now = new Set(keys);
    for (const k of [...this.born.keys()]) if (!now.has(k)) this.born.delete(k);
    let fresh = 0;
    for (const k of keys) if (!this.born.has(k)) this.born.set(k, t + gap * fresh++);
    return (k: string) => ease(t, this.born.get(k) ?? t, 0.3);
  }
}

/** The order cubes are drawn so nearer ones cover farther ones: back rows first, bottom up, left to right. */
function each(p: number, l: number, h: number, fn: (i: number, j: number, d: number) => void) {
  for (let d = l - 1; d >= 0; d--) for (let j = 0; j < h; j++) for (let i = 0; i < p; i++) fn(i, j, d);
}

/** One layer of unit cubes is laid cube by cube, then more layers drop onto it until the stack is as tall as asked. */
function layers(lang: Lang): Scene {
  const p = 4;
  const l = 3;
  let h = 3;
  let start = 0.4;
  let now = 0;
  const S = 52;
  const OX = 190;
  const OY = 465;
  const ONE = 0.1;
  const first = p * l * ONE + 0.3;
  const landAt = (j: number) => (j === 0 ? start + first : start + first + 0.2 + (j - 1) * 0.9 + 0.6);
  return {
    press(id) {
      if (id === "h+") h = clamp(h + 1, 1, 5);
      if (id === "h-") h = clamp(h - 1, 1, 5);
      start = now + 0.2;
    },
    draw(g, t) {
      now = t;
      each(p, l, h, (i, j, d) => {
        const color = LAYER[j];
        if (j === 0) {
          const n = (l - 1 - d) * p + i;
          const k = ease(t, start + n * ONE, 0.3);
          if (k <= 0) return;
          g.c.globalAlpha = clamp(k * 2, 0, 1);
          unit(g, OX, OY, S, i, j, d, color, 1, (1 - k) * 40);
        } else {
          const k = ease(t, landAt(j) - 0.6, 0.6);
          if (k <= 0) return;
          g.c.globalAlpha = clamp(k * 2, 0, 1);
          unit(g, OX, OY, S, i, j, d, color, 1, (1 - k) * 160);
        }
        g.c.globalAlpha = 1;
      });
      sides(g, lang, OX, OY, S, p, l, h);

      const id = lang === "id";
      const landed = [0, 1, 2, 3, 4].filter((j) => j < h && t >= landAt(j)).length;
      g.text("volume", PX, 90, 30, C.soft, "center", true);
      for (let j = 0; j < landed; j++) {
        const y = 140 + j * 34;
        fit(g, `${id ? "lapisan" : "layer"} ${num(lang, j + 1)}: ${num(lang, p)} × ${num(lang, l)} = ${num(lang, p * l)}`, PX, y, 320, 24, shade(LAYER[j], -0.35));
      }
      if (landed === h) {
        const n = p * l * h;
        g.c.globalAlpha = ease(t, landAt(h - 1) + 0.2, 0.5);
        g.card(PX - 165, 320, 330, 70, C.sun, 1);
        fit(g, `V = ${num(lang, p)} × ${num(lang, l)} × ${num(lang, h)} = ${num(lang, n)}`, PX, 355, 300, 32, C.ink);
        fit(g, id ? `${num(lang, n)} kubus satuan` : `${num(lang, n)} unit cubes`, PX, 420, 320, 26, C.ink);
        fit(g, id ? "V = p × l × t" : "V = l × w × h", PX, 465, 320, 26, C.soft);
        g.c.globalAlpha = 1;
      }
      stepper(g, id ? "banyak lapisan" : "layers", num(lang, h), "h", 170, h > 1, h < 5, C.coral);
      g.button("again", id ? "SUSUN LAGI" : "BUILD AGAIN", 340, 545, 260, 52, C.teal);
    },
  };
}

/** A cuboid of unit cubes whose length, width and height change with + and −; new cubes swell in and the count follows. */
function build(lang: Lang): Scene {
  let p = 5;
  let l = 3;
  let h = 2;
  const births = new Births();
  const S = 46;
  const OX = 125;
  const OY = 465;
  return {
    press(id) {
      if (id === "p+") p = clamp(p + 1, 1, 6);
      if (id === "p-") p = clamp(p - 1, 1, 6);
      if (id === "l+") l = clamp(l + 1, 1, 4);
      if (id === "l-") l = clamp(l - 1, 1, 4);
      if (id === "h+") h = clamp(h + 1, 1, 5);
      if (id === "h-") h = clamp(h - 1, 1, 5);
    },
    draw(g, t) {
      const keys: string[] = [];
      each(p, l, h, (i, j, d) => keys.push(`${i},${j},${d}`));
      const grown = births.grow(keys, t, 0.03);
      each(p, l, h, (i, j, d) => {
        const k = grown(`${i},${j},${d}`);
        if (k > 0) unit(g, OX, OY, S, i, j, d, j % 2 ? "#5cc4b0" : C.teal, 0.3 + 0.7 * k);
      });
      sides(g, lang, OX, OY, S, p, l, h, "cm");

      const id = lang === "id";
      const n = p * l * h;
      fit(g, id ? "V = p × l × t" : "V = l × w × h", PX, 90, 320, 30, C.soft);
      pieces(
        g,
        [
          ["V", C.ink],
          ["=", C.soft],
          [num(lang, p), C.cobalt],
          ["×", C.soft],
          [num(lang, l), "#2f9a86"],
          ["×", C.soft],
          [num(lang, h), C.coral],
        ],
        PX,
        160,
        320,
        44,
      );
      g.card(PX - 150, 205, 300, 76, C.sun, 1);
      fit(g, `= ${num(lang, n)} cm³`, PX, 243, 280, 44, C.ink);
      fit(g, id ? "1 kubus satuan = 1 cm³" : "1 unit cube = 1 cm³", PX, 320, 320, 22, C.soft);
      if (p === l && l === h) {
        g.card(PX - 150, 360, 300, 90, C.field, 0);
        fit(g, id ? "ini kubus!" : "this is a cube!", PX, 390, 280, 28, C.coral);
        fit(g, id ? "semua rusuknya sama panjang" : "all its edges are equal", PX, 425, 280, 20, C.soft);
      }
      stepper(g, id ? "panjang" : "length", `${num(lang, p)} cm`, "p", 150, p > 1, p < 6, C.cobalt);
      stepper(g, id ? "lebar" : "width", `${num(lang, l)} cm`, "l", 400, l > 1, l < 4, C.teal);
      stepper(g, id ? "tinggi" : "height", `${num(lang, h)} cm`, "h", 650, h > 1, h < 5, C.coral);
    },
  };
}

/** A cube built of s by s by s unit cubes; s times s times s is written s³, and a table of cubes grows beside it. */
function cube(lang: Lang): Scene {
  let s = 3;
  const births = new Births();
  const S = 54;
  const OX = 140;
  const OY = 470;
  return {
    press(id) {
      s = clamp(s + (id === "s+" ? 1 : -1), 1, 5);
    },
    draw(g, t) {
      const keys: string[] = [];
      each(s, s, s, (i, j, d) => keys.push(`${i},${j},${d}`));
      const grown = births.grow(keys, t, Math.min(0.06, 1.6 / keys.length));
      each(s, s, s, (i, j, d) => {
        const k = grown(`${i},${j},${d}`);
        if (k > 0) unit(g, OX, OY, S, i, j, d, LAYER[j], 0.3 + 0.7 * k);
      });
      const id = lang === "id";
      g.text(`s = ${num(lang, s)} cm`, OX + (s * S) / 2, OY + 24, 24, C.cobalt, "center", true);

      const n = s * s * s;
      fit(g, "V = s × s × s = s³", PX, 80, 320, 30, C.soft);
      g.card(PX - 160, 110, 320, 76, C.sun, 1);
      fit(g, `${num(lang, s)} × ${num(lang, s)} × ${num(lang, s)} = ${num(lang, n)} cm³`, PX, 148, 300, 36, C.ink);
      const read = id ? `${num(lang, s)}³ dibaca "${words(lang, s)} pangkat tiga"` : `${num(lang, s)}³ is read "${words(lang, s)} cubed"`;
      fit(g, read, PX, 215, 330, 22, C.soft);
      for (let i = 1; i <= 5; i++) {
        const y = 265 + (i - 1) * 42;
        if (i === s) g.card(PX - 160, y - 19, 320, 38, C.field, 1);
        const color = i === s ? C.ink : C.soft;
        g.text(`${num(lang, i)}³`, PX - 110, y, 24, i === s ? C.coral : color, "center", true);
        g.text(`= ${num(lang, i)} × ${num(lang, i)} × ${num(lang, i)}`, PX - 70, y, 22, color, "left", true);
        g.text(`= ${num(lang, i * i * i)}`, PX + 150, y, 22, color, "right", true);
      }
      stepper(g, id ? "panjang rusuk" : "edge length", `${num(lang, s)} cm`, "s", 300, s > 1, s < 5, C.cobalt);
    },
  };
}

/** The twelve edges of a box as glass: the three meeting at the hidden back corner are dashed. */
function wire(g: Ink, x: number, y: number, w: number, h: number, d: number, color: string) {
  const ox = d * DX;
  const oy = d * DY;
  const P = (a: number, b: number, c: number): Pt => ({ x: x + a * w + c * ox, y: y - b * h - c * oy });
  const edges: [Pt, Pt, boolean][] = [];
  for (const [a, b, c] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]) {
    const hiddenCorner = (u: number, v: number, z: number) => u === 0 && v === 0 && z === 1;
    if (a === 0) edges.push([P(a, b, c), P(1, b, c), hiddenCorner(a, b, c)]);
    if (b === 0) edges.push([P(a, b, c), P(a, 1, c), hiddenCorner(a, b, c)]);
    if (c === 0) edges.push([P(a, b, c), P(a, b, 1), hiddenCorner(a, b, 1)]);
  }
  for (const [p, q, hidden] of edges) {
    if (hidden) g.c.setLineDash([8, 7]);
    g.line(p.x, p.y, q.x, q.y, hidden ? "rgba(58, 63, 75, 0.45)" : color, hidden ? 2 : 3);
    g.c.setLineDash([]);
  }
}

/** A glass cube of 1 dm is filled with 1 cm³ cubes, a row, a layer and ten layers, or with water: 1 dm³ is 1 litre. */
function litre(lang: Lang): Scene {
  let mode: "stack" | "pour" = "stack";
  let start = 0.4;
  let now = 0;
  const L = 250;
  const u = L / 10;
  const OX = 130;
  const OY = 470;
  return {
    press(id) {
      mode = id === "pour" ? "pour" : "stack";
      start = now + 0.2;
    },
    draw(g, t) {
      now = t;
      const id = lang === "id";
      const T2 = start + 1.3;
      const T3 = T2 + 1.5;
      let count = 0;
      g.c.fillStyle = "rgba(70, 50, 25, 0.1)";
      g.c.beginPath();
      g.c.ellipse(OX + (L + L * DX) / 2, OY - 10, 240, 28, 0, 0, Math.PI * 2);
      g.c.fill();
      if (mode === "stack") {
        const ones = clamp(Math.floor((t - start) / 0.12) + 1, 0, 10);
        const rows = clamp(Math.floor((t - T2) / 0.15) + 2, 1, 10);
        const slabs = clamp(Math.floor((t - T3) / 0.45) + 2, 1, 10);
        const landed = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((j) => t >= T3 + (j - 1) * 0.45 + 0.35).length;
        count = t < T2 ? ones : t < T3 ? rows * 10 : (landed + 1) * 100;
        if (t >= T2) {
          for (let d = rows - 1; d >= 1; d--) {
            box(g, OX + d * u * DX, OY - d * u * DY, L, u, u, d % 2 ? "#5cc4b0" : C.teal, shade(C.teal, 0.35), shade(C.teal, -0.2));
            for (let i = 1; i < 10; i++) g.line(OX + d * u * DX + i * u, OY - d * u * DY, OX + d * u * DX + i * u, OY - d * u * DY - u, "rgba(58, 63, 75, 0.3)", 1);
          }
        }
        if (t < T2) for (let i = 0; i < ones; i++) unit(g, OX, OY, u, i, 0, 0, C.teal, ease(t, start + i * 0.12, 0.25));
        else {
          box(g, OX, OY, L, u, u, C.teal, shade(C.teal, 0.35), shade(C.teal, -0.2));
          for (let i = 1; i < 10; i++) g.line(OX + i * u, OY, OX + i * u, OY - u, "rgba(58, 63, 75, 0.3)", 1);
        }
        if (t >= T3) {
          for (let j = 1; j < slabs; j++) {
            const k = ease(t, T3 + (j - 1) * 0.45, 0.35);
            const y = OY - j * u - (1 - k) * 60;
            const color = j % 2 ? "#5cc4b0" : C.teal;
            g.c.globalAlpha = clamp(k * 2, 0, 1);
            box(g, OX, y, L, u, L, color, shade(color, 0.35), shade(color, -0.2));
            for (let i = 1; i < 10; i++) {
              g.line(OX + i * u, y, OX + i * u, y - u, "rgba(58, 63, 75, 0.3)", 1);
              g.line(OX + i * u, y - u, OX + i * u + L * DX, y - u - L * DY, "rgba(58, 63, 75, 0.25)", 1);
              g.line(OX + i * u * DX, y - u - i * u * DY, OX + L + i * u * DX, y - u - i * u * DY, "rgba(58, 63, 75, 0.25)", 1);
            }
            g.c.globalAlpha = 1;
          }
        }
      } else {
        const level = ease(t, start + 0.4, 3.5);
        count = Math.round(level * 100) * 10;
        if (level > 0 && level < 1) {
          const sx = OX + L / 2 + (L * DX) / 2;
          const wob = Math.sin(t * 20) * 2;
          g.line(sx + wob, 70, sx - wob, OY - L * level - (L * DY) / 2, "rgba(52, 105, 196, 0.6)", 10);
        }
        if (level > 0) box(g, OX, OY, L, L * level, L, "rgba(52, 105, 196, 0.35)", "rgba(52, 105, 196, 0.5)", "rgba(52, 105, 196, 0.25)", null);
      }
      wire(g, OX, OY, L, L, L, C.ink);
      for (let i = 1; i < 10; i++) g.line(OX - 8, OY - i * u, OX, OY - i * u, C.soft, 2);
      g.text("1 dm = 10 cm", OX + L / 2, OY + 26, 24, C.cobalt, "center", true);

      if (mode === "stack") {
        g.text(`${num(lang, count)} cm³`, PX, 90, 48, "#2f9a86", "center", true);
        const lines = [
          [T2, id ? "1 baris: 10 kubus" : "1 row: 10 cubes"],
          [T3, id ? "1 lapisan: 10 × 10 = 100" : "1 layer: 10 × 10 = 100"],
          [T3 + 4.2, id ? "10 lapisan: 10 × 10 × 10" : "10 layers: 10 × 10 × 10"],
        ] as const;
        lines.forEach(([at, s], i) => {
          g.c.globalAlpha = ease(t, at, 0.4);
          fit(g, s, PX, 160 + i * 40, 320, 24, C.soft);
          g.c.globalAlpha = 1;
        });
        g.c.globalAlpha = ease(t, T3 + 4.4, 0.5);
        g.card(PX - 160, 300, 320, 70, C.sun, 1);
        fit(g, `1 dm³ = ${num(lang, 1000)} cm³`, PX, 335, 290, 34, C.ink);
        g.c.globalAlpha = 1;
      } else {
        g.text(`${num(lang, count)} ml`, PX, 90, 48, C.cobalt, "center", true);
        const full = count >= 1000;
        g.c.globalAlpha = full ? ease(t, start + 4, 0.5) : 0;
        g.card(PX - 160, 140, 320, 70, C.sun, 1);
        fit(g, id ? "1 dm³ = 1 liter" : "1 dm³ = 1 litre", PX, 175, 290, 34, C.ink);
        fit(g, id ? `1 liter = ${num(lang, 1000)} ml` : `1 litre = ${num(lang, 1000)} ml`, PX, 250, 320, 26, C.ink);
        fit(g, "1 cm³ = 1 ml", PX, 295, 320, 26, C.ink);
        g.c.globalAlpha = 1;
      }
      const k = num(lang, 1000);
      const why = id ? `Kubus kecil 1 cm³ memuat 1 ml air, jadi ${k} cm³ memuat ${k} ml.` : `A small 1 cm³ cube holds 1 ml of water, so ${k} cm³ hold ${k} ml.`;
      wrap(g, why, 330, 22).forEach((line, i) => g.text(line, PX, 400 + i * 30, 22, C.soft, "center"));
      g.button("stack", id ? "SUSUN KUBUS 1 cm³" : "STACK 1 cm³ CUBES", 40, 555, 330, 52, C.teal);
      g.button("pour", id ? "TUANG AIR" : "POUR WATER", 390, 555, 260, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Volume is how many unit cubes fill a solid. Lay one layer of length × width cubes, then stack layers up to the height.",
        id: "Volume adalah banyaknya kubus satuan yang mengisi bangun ruang. Susun satu lapisan panjang × lebar, lalu tumpuk lapisannya setinggi balok.",
      },
      scene: layers,
    },
    {
      say: {
        en: "Change the length, width and height with + and −. The volume of a cuboid is length × width × height.",
        id: "Ubah panjang, lebar, dan tinggi dengan tombol + dan −. Volume balok adalah panjang × lebar × tinggi.",
      },
      scene: build,
    },
    {
      say: {
        en: "A cube is a cuboid with all edges equal, so its volume is s × s × s, written s³.",
        id: "Kubus adalah balok yang semua rusuknya sama panjang, jadi volumenya s × s × s, ditulis s³.",
      },
      scene: cube,
    },
    {
      say: {
        en: "A cube with 1 dm edges holds 10 × 10 × 10 = 1,000 cubes of 1 cm³, and exactly 1 litre of water.",
        id: "Kubus dengan rusuk 1 dm memuat 10 × 10 × 10 = 1.000 kubus 1 cm³, dan tepat 1 liter air.",
      },
      scene: litre,
    },
  ],
};
