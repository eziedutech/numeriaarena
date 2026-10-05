import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W } from "../ink";
import { num } from "../parts";

/** A grid of 1 cm squares on the left of the sheet; the shapes sit on it. */
const S = 44;
const X0 = 100;
const Y0 = 90;
const MAXA = 9;
const MAXB = 6;
/** The column on the right where the sums are written. */
const PX = 750;
const PW = 400;

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink) {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, "center", true);
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

function sheetGrid(g: Ink) {
  for (let i = 0; i <= MAXA; i++) g.line(X0 + i * S, Y0, X0 + i * S, Y0 + MAXB * S, "rgba(58, 63, 75, 0.1)", 1);
  for (let j = 0; j <= MAXB; j++) g.line(X0, Y0 + j * S, X0 + MAXA * S, Y0 + j * S, "rgba(58, 63, 75, 0.1)", 1);
}

/** The length written over the top side, the width beside the left side. */
function sides(g: Ink, lang: Lang, a: number, b: number) {
  g.text(`${num(lang, Math.round(a))} cm`, X0 + (a * S) / 2, Y0 - 24, 24, C.cobalt, "center", true);
  g.text(`${num(lang, Math.round(b))} cm`, X0 - 14, Y0 + (b * S) / 2, 24, C.teal, "right", true);
}

function outline(g: Ink, a: number, b: number, color: string, width: number) {
  g.c.strokeStyle = color;
  g.c.lineWidth = width;
  g.c.strokeRect(X0, Y0, a * S, b * S);
}

/** Where a walker is after `d` cm clockwise from the top left corner, and which way it faces. */
function along(a: number, b: number, d: number) {
  const legs: [number, number, number, number, number][] = [
    [0, 0, 1, 0, a],
    [a, 0, 0, 1, b],
    [a, b, -1, 0, a],
    [0, b, 0, -1, b],
  ];
  for (const [x, y, dx, dy, len] of legs) {
    if (d <= len) return { x: X0 + (x + dx * d) * S, y: Y0 + (y + dy * d) * S, dx, dy };
    d -= len;
  }
  return { x: X0, y: Y0, dx: 0, dy: -1 };
}

/** A small ink ant facing (dx, dy); its legs wiggle while it walks. */
function ant(g: Ink, x: number, y: number, dx: number, dy: number, t: number, walking: boolean) {
  const wig = walking ? Math.sin(t * 18) * 4 : 0;
  const nx = -dy;
  const ny = dx;
  for (const k of [-6, 0, 6]) {
    const lx = x + dx * k;
    const ly = y + dy * k;
    g.line(lx - nx * 12 + dx * wig, ly - ny * 12 + dy * wig, lx + nx * 12 - dx * wig, ly + ny * 12 - dy * wig, C.ink, 2);
  }
  g.dot(x - dx * 12, y - dy * 12, 8, C.ink);
  g.dot(x, y, 6, C.ink);
  g.dot(x + dx * 10, y + dy * 10, 6, C.ink);
}

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  g.text(label, cx, 518, 22, C.soft, "center", true);
  g.button(`${id}-`, "−", cx - 115, 545, 70, 52, color, canDown);
  g.text(value, cx, 571, 28, C.ink, "center", true);
  g.button(`${id}+`, "+", cx + 45, 545, 70, 52, color, canUp);
}

/** An ant walks once around the rectangle; the sides it has walked add up to the perimeter. */
function walk(lang: Lang): Scene {
  let a = 6;
  let b = 4;
  let start = 0.5;
  let now = 0;
  const SPEED = 2.5;
  return {
    press(id) {
      if (id === "a+") a = clamp(a + 1, 1, MAXA);
      if (id === "a-") a = clamp(a - 1, 1, MAXA);
      if (id === "b+") b = clamp(b + 1, 1, MAXB);
      if (id === "b-") b = clamp(b - 1, 1, MAXB);
      start = now + 0.3;
    },
    draw(g, t) {
      now = t;
      sheetGrid(g);
      const per = 2 * (a + b);
      const d = clamp((t - start) * SPEED, 0, per);
      const done = d >= per;
      g.c.fillStyle = "rgba(241, 227, 196, 0.5)";
      g.c.fillRect(X0, Y0, a * S, b * S);
      outline(g, a, b, "rgba(58, 63, 75, 0.35)", 2);
      const lens = [a, b, a, b];
      const colors = [C.cobalt, C.teal, C.cobalt, C.teal];
      // The trail the ant leaves, a colour for each side.
      g.c.lineCap = "round";
      let before = 0;
      lens.forEach((len, i) => {
        const walked = clamp(d - before, 0, len);
        if (walked > 0) {
          const p = along(a, b, before);
          const q = along(a, b, before + walked);
          g.line(p.x, p.y, q.x, q.y, colors[i], 8);
        }
        before += len;
      });
      g.c.lineCap = "butt";
      for (let k = 1; k <= Math.floor(d); k++) {
        const p = along(a, b, k);
        g.dot(p.x, p.y, 3.5, C.paper);
      }
      const p = along(a, b, d);
      ant(g, p.x, p.y, p.dx, p.dy, t, d > 0 && !done);
      if (d > 0 && !done) g.text(num(lang, Math.floor(d)), p.x - p.dy * 28, p.y + p.dx * 28, 22, C.coral, "center", true);
      sides(g, lang, a, b);

      g.text(lang === "id" ? "keliling" : "perimeter", PX, 110, 30, C.soft, "center", true);
      const parts: [string, string][] = [];
      before = 0;
      lens.forEach((len, i) => {
        const walked = clamp(d - before, 0, len);
        if (walked > 0) {
          if (parts.length) parts.push(["+", C.soft]);
          parts.push(walked >= len ? [num(lang, len), colors[i]] : [num(lang, Math.floor(walked)), C.soft]);
        }
        before += len;
      });
      if (done) parts.push(["=", C.ink], [num(lang, per), C.coral]);
      if (parts.length) pieces(g, parts, PX, 180, PW, 40);
      if (done) {
        g.c.globalAlpha = ease(t, start + per / SPEED, 0.5);
        g.card(PX - 190, 240, 380, 70, C.sun, 1);
        fit(g, `${lang === "id" ? "keliling" : "perimeter"} = ${num(lang, per)} cm`, PX, 275, 350, 34);
        fit(g, lang === "id" ? "K = 2 × (p + l)" : "P = 2 × (l + w)", PX, 360, PW, 30, C.ink);
        fit(g, `= 2 × (${num(lang, a)} + ${num(lang, b)}) = ${num(lang, per)} cm`, PX, 405, PW, 28, C.soft);
        g.c.globalAlpha = 1;
      }
      stepper(g, lang === "id" ? "panjang" : "length", `${num(lang, a)} cm`, "a", 170, a > 1, a < MAXA, C.cobalt);
      stepper(g, lang === "id" ? "lebar" : "width", `${num(lang, b)} cm`, "b", 440, b > 1, b < MAXB, C.teal);
      g.button("again", lang === "id" ? "JALAN LAGI" : "WALK AGAIN", 700, 545, 260, 52, C.coral);
    },
  };
}

/** Unit squares drop in row by row; the rows add up, and length times width says the same. */
function fill(lang: Lang): Scene {
  let a = 6;
  let b = 3;
  let start = 0.4;
  let now = 0;
  const ROW = 0.8;
  const GAP = 0.07;
  return {
    press(id) {
      if (id === "a+") a = clamp(a + 1, 1, MAXA);
      if (id === "a-") a = clamp(a - 1, 1, MAXA);
      if (id === "b+") b = clamp(b + 1, 1, MAXB);
      if (id === "b-") b = clamp(b - 1, 1, MAXB);
      start = now + 0.2;
    },
    draw(g, t) {
      now = t;
      sheetGrid(g);
      for (let j = 0; j < b; j++) {
        for (let i = 0; i < a; i++) {
          const k = ease(t, start + j * ROW + i * GAP, 0.3);
          if (k <= 0) continue;
          const s = (S - 4) * (0.3 + 0.7 * k);
          const cx = X0 + i * S + S / 2;
          const cy = Y0 + j * S + S / 2;
          g.card(cx - s / 2, cy - s / 2, s, s, j % 2 ? "#5cc4b0" : C.teal, 0.5 * k);
          if (k > 0.8) g.text(num(lang, j * a + i + 1), cx, cy, 18, C.paper, "center", true);
        }
      }
      outline(g, a, b, C.ink, 3);
      sides(g, lang, a, b);

      const n = a * b;
      const rowsDone = clamp(Math.floor((t - start - (a - 1) * GAP - 0.3) / ROW) + 1, 0, b);
      g.text(lang === "id" ? "luas" : "area", PX, 110, 30, C.soft, "center", true);
      if (rowsDone > 0) {
        const parts: [string, string][] = [];
        for (let j = 0; j < rowsDone; j++) {
          if (j) parts.push(["+", C.soft]);
          parts.push([num(lang, a), j % 2 ? "#2f9a86" : C.teal]);
        }
        if (rowsDone === b) parts.push(["=", C.ink], [num(lang, n), C.coral]);
        pieces(g, parts, PX, 180, PW, 38);
        const rowsSaid = lang === "id" ? `${num(lang, rowsDone)} baris, tiap baris ${num(lang, a)} kotak` : `${num(lang, rowsDone)} row${rowsDone === 1 ? "" : "s"} of ${num(lang, a)} squares`;
        fit(g, rowsSaid, PX, 230, PW, 24, C.soft);
      }
      if (rowsDone === b) {
        g.c.globalAlpha = ease(t, start + (b - 1) * ROW + (a - 1) * GAP + 0.6, 0.5);
        g.card(PX - 190, 270, 380, 70, C.sun, 1);
        fit(g, `${lang === "id" ? "luas" : "area"} = ${num(lang, a)} × ${num(lang, b)} = ${num(lang, n)} cm²`, PX, 305, 350, 32);
        fit(g, lang === "id" ? "L = p × l" : "A = l × w", PX, 385, PW, 30, C.ink);
        g.c.globalAlpha = 1;
      }
      fit(g, lang === "id" ? "1 kotak = 1 cm²" : "1 square = 1 cm²", PX, 440, PW, 22, C.soft);
      stepper(g, lang === "id" ? "panjang" : "length", `${num(lang, a)} cm`, "a", 170, a > 1, a < MAXA, C.cobalt);
      stepper(g, lang === "id" ? "lebar" : "width", `${num(lang, b)} cm`, "b", 440, b > 1, b < MAXB, C.teal);
      g.button("again", lang === "id" ? "ISI LAGI" : "FILL AGAIN", 700, 545, 260, 52, C.teal);
    },
  };
}

/** A rectangle whose corner is dragged; its perimeter and area follow, and equal sides make a square. */
function resize(lang: Lang): Scene {
  let a = 5;
  let b = 3;
  let sa = a;
  let sb = b;
  let held = false;
  let last = 0;
  const corner = () => ({ x: X0 + sa * S, y: Y0 + sb * S });
  return {
    down(p) {
      const c = corner();
      if (Math.hypot(p.x - c.x, p.y - c.y) < 50) {
        held = true;
        return true;
      }
    },
    move(p) {
      a = clamp(Math.round((p.x - X0) / S), 1, MAXA);
      b = clamp(Math.round((p.y - Y0) / S), 1, MAXB);
    },
    up() {
      held = false;
    },
    press(id) {
      if (id === "square") {
        const s = Math.min(Math.max(a, b), MAXB);
        a = s;
        b = s;
      }
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      const k = 1 - Math.exp(-dt * 14);
      sa += (a - sa) * k;
      sb += (b - sb) * k;
      sheetGrid(g);
      g.c.fillStyle = "rgba(63, 182, 160, 0.3)";
      g.c.fillRect(X0, Y0, sa * S, sb * S);
      outline(g, sa, sb, C.coral, 6);
      sides(g, lang, sa, sb);
      const c = corner();
      g.handle(c.x, c.y, held);
      if (t < 5 && !held) g.text(lang === "id" ? "geser sudutnya" : "drag the corner", X0 + (MAXA * S) / 2, Y0 + MAXB * S + 50, 22, C.coral, "center", true);

      const sq = a === b;
      if (sq) {
        g.card(PX - 150, 80, 300, 60, C.sun, 1);
        g.text(lang === "id" ? "persegi" : "a square", PX, 110, 32, C.ink, "center", true);
        fit(g, lang === "id" ? "semua sisinya sama panjang" : "all four sides are equal", PX, 172, PW, 22, C.soft);
      } else g.text(lang === "id" ? "persegi panjang" : "a rectangle", PX, 110, 30, C.soft, "center", true);
      const per = 2 * (a + b);
      g.text(lang === "id" ? "keliling" : "perimeter", PX, 235, 24, C.coral, "center", true);
      fit(g, sq ? `4 × ${num(lang, a)} = ${num(lang, per)} cm` : `2 × (${num(lang, a)} + ${num(lang, b)}) = ${num(lang, per)} cm`, PX, 275, PW, 34, C.coral);
      g.text(lang === "id" ? "luas" : "area", PX, 335, 24, C.teal, "center", true);
      fit(g, `${num(lang, a)} × ${num(lang, b)} = ${num(lang, a * b)} cm²`, PX, 375, PW, 34, "#2f9a86");
      g.button("square", lang === "id" ? "JADIKAN PERSEGI" : "MAKE A SQUARE", W / 2 - 160, 555, 320, 52, C.cobalt, !sq);
    },
  };
}

/** A square of any side: its border is walked, then filled, and a table grows beside it. */
function square(lang: Lang): Scene {
  let s = 3;
  let start = 0.3;
  let now = 0;
  const xs = [600, 750, 895];
  return {
    press(id) {
      s = clamp(s + (id === "s+" ? 1 : -1), 1, MAXB);
      start = now + 0.1;
    },
    draw(g, t) {
      now = t;
      sheetGrid(g);
      const d = clamp((t - start) * 8, 0, 4 * s);
      const filled = start + (4 * s) / 8;
      for (let j = 0; j < s; j++) {
        for (let i = 0; i < s; i++) {
          const k = ease(t, filled + (j * s + i) * 0.04, 0.25);
          if (k <= 0) continue;
          const w = (S - 4) * (0.3 + 0.7 * k);
          g.card(X0 + i * S + S / 2 - w / 2, Y0 + j * S + S / 2 - w / 2, w, w, j % 2 ? "#5cc4b0" : C.teal, 0.5 * k);
        }
      }
      outline(g, s, s, "rgba(58, 63, 75, 0.35)", 2);
      g.c.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const walked = clamp(d - i * s, 0, s);
        if (walked <= 0) continue;
        const p = along(s, s, i * s);
        const q = along(s, s, i * s + walked);
        g.line(p.x, p.y, q.x, q.y, C.coral, 7);
      }
      g.c.lineCap = "butt";
      g.text(`${num(lang, s)} cm`, X0 + (s * S) / 2, Y0 - 24, 24, C.coral, "center", true);
      g.text(`${num(lang, s)} cm`, X0 - 14, Y0 + (s * S) / 2, 24, C.coral, "right", true);

      const heads = lang === "id" ? ["sisi", "keliling", "luas"] : ["side", "perimeter", "area"];
      heads.forEach((h, i) => g.text(h, xs[i], 100, 22, C.soft, "center", true));
      for (let i = 1; i <= MAXB; i++) {
        const y = 150 + (i - 1) * 44;
        if (i === s) g.card(545, y - 20, 415, 40, C.sun, 1);
        const color = i === s ? C.ink : C.soft;
        g.text(`${num(lang, i)} cm`, xs[0], y, 22, color, "center", true);
        g.text(`4 × ${num(lang, i)} = ${num(lang, 4 * i)}`, xs[1], y, 22, i === s ? C.coral : color, "center", true);
        g.text(`${num(lang, i)} × ${num(lang, i)} = ${num(lang, i * i)}`, xs[2], y, 22, i === s ? "#2f9a86" : color, "center", true);
      }
      g.card(560, 420, 390, 64, C.field, 0);
      g.text(lang === "id" ? "K = 4 × s" : "P = 4 × s", 660, 452, 28, C.coral, "center", true);
      g.text(lang === "id" ? "L = s × s" : "A = s × s", 850, 452, 28, "#2f9a86", "center", true);
      stepper(g, lang === "id" ? "sisi" : "side", `${num(lang, s)} cm`, "s", 300, s > 1, s < MAXB, C.coral);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "The perimeter is the whole way around the edge. Follow the ant: its four sides add up to the perimeter.",
        id: "Keliling adalah panjang jalan mengelilingi tepi bangun. Ikuti semutnya: keempat sisi dijumlahkan menjadi keliling.",
      },
      scene: walk,
    },
    {
      say: {
        en: "The area is how many unit squares cover the shape. Row after row fills it: length times width.",
        id: "Luas adalah banyaknya persegi satuan yang menutupi bangun. Baris demi baris terisi: panjang dikali lebar.",
      },
      scene: fill,
    },
    {
      say: {
        en: "Drag the corner and watch the perimeter and the area change. When all four sides are equal, it is a square.",
        id: "Geser sudutnya, lalu lihat keliling dan luasnya berubah. Bila keempat sisinya sama panjang, bangun itu persegi.",
      },
      scene: resize,
    },
    {
      say: {
        en: "A square has four equal sides: its perimeter is 4 times the side, its area is side times side.",
        id: "Persegi punya empat sisi sama panjang: kelilingnya 4 kali sisi, luasnya sisi kali sisi.",
      },
      scene: square,
    },
  ],
};
