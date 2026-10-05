import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { dec, num, wrap } from "../parts";

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

function arrow(g: Ink, x1: number, y1: number, x2: number, y2: number, color: string) {
  g.line(x1, y1, x2, y2, color, 4);
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.line(x2, y2, x2 - 18 * Math.cos(a - 0.5), y2 - 18 * Math.sin(a - 0.5), color, 4);
  g.line(x2, y2, x2 - 18 * Math.cos(a + 0.5), y2 - 18 * Math.sin(a + 0.5), color, 4);
}

/** m times 10 to the power e, written without stray zeros. */
function amount(lang: Lang, m: number, e: number) {
  while (e < 0 && m % 10 === 0) {
    m /= 10;
    e += 1;
  }
  return e >= 0 ? num(lang, m * 10 ** e) : dec(lang, m / 10 ** -e, -e);
}

/** A square of 1 dm (or 1 cm) is cut ten by ten, and the small squares are counted to 100. */
function cut(lang: Lang): Scene {
  let mode: "dm" | "cm" = "dm";
  let start = 0;
  let now = 0;
  const X = 110;
  const Y = 80;
  const L = 400;
  const s = 40;
  const PX = 770;
  return {
    press(id) {
      if (id === "zoom") mode = mode === "dm" ? "cm" : "dm";
      start = now;
    },
    draw(g, t) {
      now = t;
      const big = mode;
      const small = mode === "dm" ? "cm" : "mm";
      // The square grows out of one small square, as if seen through a lens.
      const z = ease(t, start, 0.7);
      const size = lerp(s, L, z);
      g.card(X, Y, size, size, C.paper, 1);
      const T0 = start + 0.8;
      const T1 = T0 + 2.3;
      const count = clamp(Math.floor((t - T1) / 0.035), 0, 100);
      for (let i = 0; i < count; i++) {
        const cx = X + (i % 10) * s;
        const cy = Y + Math.floor(i / 10) * s;
        g.c.fillStyle = Math.floor(i / 10) % 2 ? "#5cc4b0" : C.teal;
        g.c.fillRect(cx, cy, s, s);
        g.text(num(lang, i + 1), cx + s / 2, cy + s / 2, 18, C.paper, "center", true);
      }
      for (let i = 1; i < 10; i++) {
        const kv = ease(t, T0 + i * 0.1, 0.25);
        if (kv > 0) g.line(X + i * s, Y, X + i * s, Y + L * kv, "rgba(58, 63, 75, 0.45)", 2);
        const kh = ease(t, T0 + 1.1 + i * 0.1, 0.25);
        if (kh > 0) g.line(X, Y + i * s, X + L * kh, Y + i * s, "rgba(58, 63, 75, 0.45)", 2);
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(X, Y, size, size);
      if (z >= 1) {
        const side = `1 ${big} = 10 ${small}`;
        g.text(side, X + L / 2, Y - 26, 24, C.cobalt, "center", true);
        g.c.save();
        g.c.translate(X - 26, Y + L / 2);
        g.c.rotate(-Math.PI / 2);
        g.text(side, 0, 0, 24, C.cobalt, "center", true);
        g.c.restore();
      }

      g.text(`1 ${big}²`, PX, 110, 56, C.cobalt, "center", true);
      if (count > 0) g.text(`= ${num(lang, count)} ${small}²`, PX, 180, 36, "#2f9a86", "center", true);
      if (count === 100) {
        g.c.globalAlpha = ease(t, T1 + 3.6, 0.5);
        g.text("10 × 10 = 100", PX, 245, 32, C.ink, "center", true);
        g.card(PX - 170, 285, 340, 70, C.sun, 1);
        fit(g, `1 ${big}² = 100 ${small}²`, PX, 320, 310, 34, C.ink);
        g.c.globalAlpha = 1;
      }
      const why = lang === "id" ? "Sisinya 10 kali lebih panjang, jadi luasnya 10 × 10 = 100 kali." : "Each side is 10 times longer, so the area is 10 × 10 = 100 times bigger.";
      wrap(g, why, 360, 22).forEach((line, i) => g.text(line, PX, 410 + i * 30, 22, C.soft, "center"));
      g.button("again", lang === "id" ? "POTONG LAGI" : "CUT AGAIN", 40, 555, 240, 52, C.teal);
      const zoom = mode === "dm" ? (lang === "id" ? "INTIP 1 cm²" : "LOOK INSIDE 1 cm²") : lang === "id" ? "KEMBALI KE 1 dm²" : "BACK TO 1 dm²";
      g.button("zoom", zoom, W - 380, 555, 340, 52, C.cobalt);
    },
  };
}

const UNITS = ["km²", "hm²", "dam²", "m²", "dm²", "cm²", "mm²"];
const STARTS: [number, number][] = [
  [3, 3],
  [1, 0],
  [5, 4],
  [250, 5],
  [2, 1],
  [40, 2],
];

/** The staircase of area units: a hop down multiplies by 100, a hop up divides by 100. */
function stairs(lang: Lang): Scene {
  let pick = 0;
  let [m, from] = STARTS[0];
  let at = from;
  let hop = { a: at, b: at, start: -9 };
  let now = 0;
  const n = UNITS.length;
  const x0 = 60;
  const sw = 125;
  const top = 150;
  const dh = 42;
  const alias = lang === "id" ? ["", "(ha)", "(are)", "", "", "", ""] : ["", "(ha)", "(a)", "", "", "", ""];
  const pos = (i: number) => ({ x: x0 + (i + 0.5) * sw, y: top + i * dh });
  const on = (u: number, off: number) => {
    const i = u * (n - 1);
    return { x: x0 + (i + 0.5) * sw, y: top + i * dh + off };
  };
  return {
    press(id) {
      if (id === "down" && at < n - 1) {
        hop = { a: at, b: at + 1, start: now };
        at += 1;
      }
      if (id === "up" && at > 0) {
        hop = { a: at, b: at - 1, start: now };
        at -= 1;
      }
      if (id === "new") {
        pick = (pick + 1) % STARTS.length;
        [m, from] = STARTS[pick];
        hop = { a: at, b: from, start: now };
        at = from;
      }
    },
    draw(g, t) {
      now = t;
      UNITS.forEach((u, i) => {
        const p = pos(i);
        g.card(x0 + i * sw + 4, p.y, sw - 8, 56, i === at ? C.sun : i % 2 ? C.paper : "#f8efdc", 1);
        g.text(u, p.x, p.y + (alias[i] ? 22 : 28), 28, C.ink, "center", true);
        if (alias[i]) g.text(alias[i], p.x, p.y + 46, 18, C.soft, "center", true);
      });
      const a1 = on(0.05, -(dh / 2 + 40));
      const a2 = on(0.95, -(dh / 2 + 40));
      arrow(g, a1.x, a1.y, a2.x, a2.y, C.teal);
      const b1 = on(0.9, dh / 2 + 90);
      const b2 = on(0.1, dh / 2 + 90);
      arrow(g, b1.x, b1.y, b2.x, b2.y, C.coral);
      g.text(lang === "id" ? "turun 1 tangga, dikali 100" : "1 step down: × 100", 935, 140, 24, C.teal, "right", true);
      g.text(lang === "id" ? "naik 1 tangga, dibagi 100" : "1 step up: ÷ 100", 50, 440, 24, C.coral, "left", true);

      const k = ease(t, hop.start, 0.5);
      const pa = pos(hop.a);
      const pb = pos(hop.b);
      const bx = lerp(pa.x, pb.x, k);
      const by = lerp(pa.y, pb.y, k) - 20 - 50 * Math.sin(Math.PI * k);
      g.dot(bx + 2, by + 4, 18, "rgba(70, 50, 25, 0.25)");
      g.dot(bx, by, 18, C.coral);

      const e = (at - from) * 2;
      pieces(
        g,
        [
          [`${amount(lang, m, 0)} ${UNITS[from]}`, C.ink],
          ["=", C.soft],
          [`${amount(lang, m, e)} ${UNITS[at]}`, C.cobalt],
        ],
        W / 2,
        56,
        900,
        40,
      );
      const steps = at - from;
      if (steps !== 0) {
        const many = Math.abs(steps);
        const times = num(lang, 10 ** (many * 2));
        const said =
          lang === "id"
            ? `${steps > 0 ? "turun" : "naik"} ${many} tangga, ${steps > 0 ? "dikali" : "dibagi"} ${times}`
            : `${many} step${many === 1 ? "" : "s"} ${steps > 0 ? "down, times" : "up, divided by"} ${times}`;
        fit(g, said, W / 2, 104, 480, 24, steps > 0 ? C.teal : C.coral);
      }
      g.button("up", lang === "id" ? "NAIK" : "UP", 40, 555, 160, 52, C.coral, at > 0);
      g.button("down", lang === "id" ? "TURUN" : "DOWN", 220, 555, 160, 52, C.teal, at < n - 1);
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W - 320, 555, 280, 52, C.cobalt);
    },
  };
}

/** A simple drawn child standing with feet at (x, floor), `tall` sheet units high. */
function child(g: Ink, x: number, floor: number, tall: number, t: number) {
  const head = tall * 0.075;
  const neck = floor - tall + head * 2;
  const hip = floor - tall * 0.47;
  const shoulder = neck + tall * 0.05;
  const wave = Math.sin(t * 3) * 0.08;
  g.c.lineCap = "round";
  g.line(x, hip, x - tall * 0.08, floor - 4, C.cobalt, tall * 0.045);
  g.line(x, hip, x + tall * 0.08, floor - 4, C.cobalt, tall * 0.045);
  g.line(x, neck + 6, x, hip, C.plum, tall * 0.1);
  g.line(x, shoulder, x + tall * 0.14, shoulder + tall * 0.24, C.plum, tall * 0.035);
  g.line(x, shoulder, x - tall * (0.16 + wave), shoulder - tall * (0.12 + wave), C.plum, tall * 0.035);
  g.c.lineCap = "butt";
  const hy = floor - tall + head;
  g.dot(x, hy, head, C.sun);
  g.dot(x - head * 0.35, hy - head * 0.1, Math.max(2, head * 0.1), C.ink);
  g.dot(x + head * 0.35, hy - head * 0.1, Math.max(2, head * 0.1), C.ink);
  g.c.strokeStyle = C.ink;
  g.c.lineWidth = 2;
  g.c.beginPath();
  g.c.arc(x, hy + head * 0.2, head * 0.4, 0.2 * Math.PI, 0.8 * Math.PI);
  g.c.stroke();
}

/** A square metre drawn beside a child of the learner's height, filled with square decimetres. */
function metre(lang: Lang): Scene {
  let h = 135;
  let fillStart = -1;
  let now = 0;
  const FLOOR = 520;
  const M = 280;
  const SX = 90;
  const D = M / 10;
  const PX = 810;
  return {
    press(id) {
      if (id === "h+") h = clamp(h + 5, 110, 170);
      if (id === "h-") h = clamp(h - 5, 110, 170);
      if (id === "fill") fillStart = fillStart >= 0 ? -1 : now;
    },
    draw(g, t) {
      now = t;
      g.line(40, FLOOR, 640, FLOOR, C.ink, 3);
      g.card(SX, FLOOR - M, M, M, C.paper, 1);
      const count = fillStart >= 0 ? clamp(Math.floor((t - fillStart) / 0.03) + 1, 0, 100) : 1;
      for (let i = 0; i < count; i++) {
        const col = i % 10;
        const row = Math.floor(i / 10);
        g.c.fillStyle = (row + col) % 2 ? "#5cc4b0" : C.teal;
        g.c.fillRect(SX + col * D, FLOOR - (row + 1) * D, D, D);
      }
      if (fillStart >= 0) {
        for (let i = 1; i < 10; i++) {
          g.line(SX + i * D, FLOOR - M, SX + i * D, FLOOR, "rgba(255, 255, 255, 0.5)", 1);
          g.line(SX, FLOOR - i * D, SX + M, FLOOR - i * D, "rgba(255, 255, 255, 0.5)", 1);
        }
      } else g.text("1 dm²", SX + D + 10, FLOOR - D / 2, 20, "#2f9a86", "left", true);
      g.c.strokeStyle = C.cobalt;
      g.c.lineWidth = 4;
      g.c.strokeRect(SX, FLOOR - M, M, M);
      g.text("1 m = 100 cm", SX + M / 2, FLOOR - M - 22, 22, C.cobalt, "center", true);
      g.text("1 m", SX - 10, FLOOR - M / 2, 22, C.cobalt, "right", true);

      // How tall the child is, against the top of the square metre.
      const tall = (h * M) / 100;
      const cx = 510;
      g.c.setLineDash([8, 7]);
      g.line(SX + M, FLOOR - M, 590, FLOOR - M, "rgba(52, 105, 196, 0.6)", 2);
      g.line(cx - 40, FLOOR - tall, 600, FLOOR - tall, C.coral, 2);
      g.c.setLineDash([]);
      child(g, cx, FLOOR, tall, t);
      g.text(`${num(lang, h)} cm`, 600, FLOOR - tall, 22, C.coral, "left", true);

      g.text("1 m²", PX, 90, 56, C.cobalt, "center", true);
      fit(g, lang === "id" ? "persegi bersisi 1 m" : "a square with 1 m sides", PX, 150, 250, 24, C.soft);
      if (fillStart >= 0) {
        g.text(`= ${num(lang, count)} dm²`, PX, 215, 34, "#2f9a86", "center", true);
        if (count === 100) {
          g.c.globalAlpha = ease(t, fillStart + 3.2, 0.5);
          g.card(PX - 150, 255, 300, 62, C.sun, 1);
          fit(g, "1 m² = 100 dm²", PX, 286, 280, 30, C.ink);
          fit(g, `= ${num(lang, 10000)} cm²`, PX, 350, 300, 30, C.ink);
          g.c.globalAlpha = 1;
        }
      }
      const said = lang === "id" ? `Tinggimu ${num(lang, h)} cm, lebih dari sisi 1 m.` : `You are ${num(lang, h)} cm tall, more than the 1 m side.`;
      wrap(g, said, 300, 22).forEach((line, i) => g.text(line, PX, 410 + i * 30, 22, C.soft, "center"));
      g.text(`${lang === "id" ? "tinggimu" : "your height"}: ${num(lang, h)} cm`, PX, 518, 22, C.soft, "center", true);
      g.button("h-", "−", PX - 80, 545, 70, 52, C.coral, h > 110);
      g.button("h+", "+", PX + 10, 545, 70, 52, C.coral, h < 170);
      g.button("fill", fillStart >= 0 ? (lang === "id" ? "KOSONGKAN" : "EMPTY IT") : lang === "id" ? "ISI DENGAN dm²" : "FILL WITH dm²", 40, 555, 300, 52, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Cut a square of 1 dm by 1 dm into squares of 1 cm: 10 along each side, so 100 in all.",
        id: "Potong persegi 1 dm × 1 dm menjadi persegi 1 cm: 10 di setiap sisi, jadi seluruhnya 100.",
      },
      scene: cut,
    },
    {
      say: {
        en: "Area units stand on a staircase too, but each step down is times 100 and each step up is divided by 100.",
        id: "Satuan luas juga tersusun seperti tangga, tetapi turun satu tangga dikali 100 dan naik satu tangga dibagi 100.",
      },
      scene: stairs,
    },
    {
      say: {
        en: "A square metre is a square with 1 m sides. Set your height and compare yourself with it.",
        id: "Satu meter persegi adalah persegi bersisi 1 m. Atur tinggimu, lalu bandingkan dirimu dengannya.",
      },
      scene: metre,
    },
  ],
};
