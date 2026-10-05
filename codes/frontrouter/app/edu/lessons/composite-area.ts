import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, lerp, pulse } from "../ink";
import { dec, num } from "../parts";

/**
 * A known shape, in grid units: a rectangle (x, y, w, h), a triangle (three
 * corners), or a half or whole circle (centre, radius, and for a half the
 * way its round side faces). `dx, dy` is where it slides when the shape is
 * split. A hole is taken away (`minus`).
 */
type Piece =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "tri"; p: [number, number][] }
  | { kind: "half"; cx: number; cy: number; r: number; face: number }
  | { kind: "circle"; cx: number; cy: number; r: number };
type Part = Piece & { dx: number; dy: number; minus?: boolean; color: string; area: number; how: string; labels?: [string, number, number][] };

interface Shape {
  /** Grid unit in sheet units, and where grid (0, 0) is. */
  s: number;
  ox: number;
  oy: number;
  unit: string;
  parts: Part[];
  /** A note under the sums, such as the value used for π. */
  note?: string;
}

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

/** A number with as few decimal places as it needs, at most two. */
function val(lang: Lang, x: number) {
  const s = (Math.round(x * 100) / 100).toFixed(2).replace(/\.?0+$/u, "");
  return dec(lang, x, s.includes(".") ? s.split(".")[1].length : 0);
}

/** π as a class would use it: 22/7 when the radius is a multiple of 7, else 3.14. */
const piFor = (r: number) => (r % 7 === 0 ? 22 / 7 : 3.14);
const piSay = (lang: Lang, r: number) => (r % 7 === 0 ? "22/7" : dec(lang, 3.14, 2));

const darker: Record<string, string> = {
  [C.cobalt]: "#24509c",
  [C.teal]: "#2c8a78",
  [C.coral]: "#c9524d",
  [C.plum]: "#7a4ea3",
  [C.sun]: "#b8862a",
};

/** The outline of a piece as a path, slid by `k` of the way to its split place. */
function path(g: Ink, sh: Shape, p: Part, k: number, lift = 0) {
  const c = g.c;
  const X = (u: number) => sh.ox + (u + p.dx * k) * sh.s + lift * 0.6;
  const Y = (v: number) => sh.oy + (v + p.dy * k) * sh.s + lift;
  c.beginPath();
  if (p.kind === "rect") c.rect(X(p.x), Y(p.y), p.w * sh.s, p.h * sh.s);
  if (p.kind === "tri") {
    p.p.forEach(([u, v], i) => (i ? c.lineTo(X(u), Y(v)) : c.moveTo(X(u), Y(v))));
    c.closePath();
  }
  if (p.kind === "half") {
    c.arc(X(p.cx), Y(p.cy), p.r * sh.s, p.face - Math.PI / 2, p.face + Math.PI / 2);
    c.closePath();
  }
  if (p.kind === "circle") c.arc(X(p.cx), Y(p.cy), p.r * sh.s, 0, Math.PI * 2);
}

/** Where a piece's area is written: the middle of it, slid with it. */
function middle(sh: Shape, p: Part, k: number) {
  let u = 0;
  let v = 0;
  if (p.kind === "rect") [u, v] = [p.x + p.w / 2, p.y + p.h / 2];
  if (p.kind === "tri") [u, v] = [p.p.reduce((m, q) => m + q[0], 0) / 3, p.p.reduce((m, q) => m + q[1], 0) / 3];
  if (p.kind === "half") [u, v] = [p.cx + Math.cos(p.face) * p.r * 0.42, p.cy + Math.sin(p.face) * p.r * 0.42];
  if (p.kind === "circle") [u, v] = [p.cx, p.cy];
  return { x: sh.ox + (u + p.dx * k) * sh.s, y: sh.oy + (v + p.dy * k) * sh.s };
}

/**
 * The shape whole when `k` is 0: one sheet of paper with faint creases where
 * it will be cut. As `k` grows the pieces slide apart, take their colours and
 * show their areas; a hole slides out of its piece as a coral cut-out.
 */
function drawShape(g: Ink, lang: Lang, sh: Shape, k: number, t: number) {
  const c = g.c;
  const plus = sh.parts.filter((p) => !p.minus);
  const minus = sh.parts.filter((p) => p.minus);
  for (const p of plus) {
    path(g, sh, p, k, 5);
    c.fillStyle = "rgba(70, 50, 25, 0.2)";
    c.fill();
  }
  for (const p of plus) {
    path(g, sh, p, k);
    c.fillStyle = C.field;
    c.fill();
    c.globalAlpha = k;
    c.fillStyle = p.color;
    c.fill();
    c.globalAlpha = 1;
  }
  for (const p of minus) {
    // While whole the hole is bare paper; split, it is a cut-out laid beside.
    path(g, sh, p, k, 5 * k);
    c.fillStyle = `rgba(70, 50, 25, ${0.2 * k})`;
    c.fill();
    path(g, sh, p, k);
    c.fillStyle = C.paper;
    c.fill();
    c.globalAlpha = k;
    c.fillStyle = p.color;
    c.fill();
    c.globalAlpha = 1;
    c.setLineDash([7, 6]);
    c.strokeStyle = C.coral;
    c.lineWidth = 2;
    path(g, sh, p, 0);
    c.stroke();
    c.setLineDash([]);
  }
  for (const p of sh.parts) {
    path(g, sh, p, k);
    c.strokeStyle = `rgba(58, 63, 75, ${0.25 + 0.35 * k})`;
    c.lineWidth = 2;
    c.stroke();
  }
  for (const p of sh.parts) {
    for (const [s, u, v] of p.labels ?? []) {
      g.text(s, sh.ox + (u + p.dx * k) * sh.s, sh.oy + (v + p.dy * k) * sh.s, 20, C.soft, "center", true);
    }
    const m = middle(sh, p, k);
    c.globalAlpha = clamp(k * 2 - 1, 0, 1);
    g.text(`${p.minus ? "− " : ""}${val(lang, p.area)}`, m.x, m.y, 26, C.paper, "center", true);
    c.globalAlpha = 1;
  }
  if (k === 0) {
    c.globalAlpha = 0.4 + 0.4 * pulse(t);
    for (const p of sh.parts) {
      path(g, sh, p, 0);
      c.setLineDash([6, 6]);
      c.strokeStyle = C.coral;
      c.lineWidth = 2;
      c.stroke();
      c.setLineDash([]);
    }
    c.globalAlpha = 1;
  }
}

/** The sums under the shape: each piece's area, then the total, each in its colour. */
function sums(g: Ink, lang: Lang, sh: Shape, k: number) {
  const total = sh.parts.reduce((m, p) => m + (p.minus ? -p.area : p.area), 0);
  const show = clamp(k * 2 - 1, 0, 1);
  g.c.globalAlpha = show;
  const hows: [string, string][] = [];
  const vals: [string, string][] = [];
  sh.parts.forEach((p, i) => {
    const sign = p.minus ? "−" : "+";
    if (i > 0 || p.minus) {
      hows.push([sign, C.soft]);
      vals.push([sign, C.soft]);
    }
    hows.push([`(${p.how})`, darker[p.color] ?? p.color]);
    vals.push([val(lang, p.area), darker[p.color] ?? p.color]);
  });
  vals.push(["=", C.ink], [`${val(lang, total)} ${sh.unit}²`, C.ink]);
  pieces(g, hows, 500, 432, 900, 26);
  g.card(500 - 300, 455, 600, 54, C.sun, 0.8);
  pieces(g, vals, 500, 482, 570, 32);
  if (sh.note) fit(g, sh.note, 980, 432 - 34, 300, 18, C.soft, "right");
  g.c.globalAlpha = 1;
}

type Label = [string, number, number];

/** A rectangle piece; its sides are written over the top and beside the left unless `labels` says where. */
const rect = (x: number, y: number, w: number, h: number, dx: number, dy: number, color: string, unit: string, minus = false, labels?: Label[]): Part => ({
  kind: "rect",
  x,
  y,
  w,
  h,
  dx,
  dy,
  color,
  minus,
  area: w * h,
  how: `${w} × ${h}`,
  labels: labels ?? [
    [`${w} ${unit}`, x + w / 2, y - 0.45],
    [`${h} ${unit}`, x - 0.7, y + h / 2],
  ],
});

/** A slider of how far apart the pieces are, eased toward split or whole. */
function splitter() {
  let apart = false;
  let changed = -5;
  return {
    get apart() {
      return apart;
    },
    reset() {
      apart = false;
      changed = -5;
    },
    flip(now: number, to = !apart) {
      if (to === apart) return;
      apart = to;
      changed = now;
    },
    k(t: number) {
      const e = ease(t, changed, 0.8);
      return apart ? e : 1 - e;
    },
  };
}

/** An L shape cut down, cut across, or seen as a big rectangle with a corner taken away; the total comes out the same. */
function lshape(lang: Lang): Scene {
  const u = "cm";
  const ways = (w: number): Part[] =>
    w === 0
      ? [
          rect(0, 0, 3, 6, -0.8, 0, C.cobalt, u, false, [["3 cm", 1.5, -0.45], ["6 cm", -0.75, 3]]),
          rect(3, 3, 5, 3, 0.8, 0, C.teal, u, false, [["5 cm", 5.5, 6.5], ["3 cm", 8.75, 4.5]]),
        ]
      : w === 1
        ? [
            rect(0, 0, 3, 3, 0, -0.8, C.cobalt, u, false, [["3 cm", 1.5, -0.45], ["3 cm", -0.75, 1.5]]),
            rect(0, 3, 8, 3, 0, 0.6, C.teal, u, false, [["8 cm", 4, 6.5], ["3 cm", -0.75, 4.5]]),
          ]
        : [
            rect(0, 0, 8, 6, -1.5, 0, C.cobalt, u, false, [["8 cm", 4, 6.5], ["6 cm", -0.75, 3]]),
            rect(3, 0, 5, 3, 5.5, 0, C.coral, u, true, [["5 cm", 5.5, -0.45], ["3 cm", 8.75, 1.5]]),
          ];
  let way = 0;
  const sp = splitter();
  let now = 0;
  return {
    press(id) {
      if (id === "join") sp.flip(now);
      else {
        way = Number(id.slice(1));
        sp.flip(now, false);
        sp.flip(now + 0.01, true);
      }
    },
    draw(g, t) {
      now = t;
      const k = sp.k(t);
      const sh: Shape = { s: 40, ox: way === 2 ? 270 : 340, oy: 90, unit: u, parts: ways(way) };
      drawShape(g, lang, sh, k, t);
      sums(g, lang, sh, k);
      const labels = lang === "id" ? ["POTONG TEGAK", "POTONG DATAR", "KURANGI"] : ["CUT DOWN", "CUT ACROSS", "TAKE AWAY"];
      labels.forEach((l, i) => g.button(`w${i}`, l, 30 + i * 240, 545, 225, 52, [C.cobalt, C.teal, C.coral][i], !(sp.apart && way === i)));
      g.button("join", sp.apart ? (lang === "id" ? "SATUKAN" : "JOIN") : lang === "id" ? "PISAHKAN" : "SPLIT", 760, 545, 210, 52, C.plum);
    },
  };
}

/** A house: a rectangle and a triangle roof whose top is dragged; the roof is half of the rectangle around it. */
function house(lang: Lang): Scene {
  const sp = splitter();
  let top = 3;
  let roof = 3;
  let held = false;
  let now = 0;
  let kk = 0;
  const S = 36;
  const OX = 392;
  const OY = 50;
  const shape = (): Shape => {
    const y0 = 4 - roof;
    return {
      s: S,
      ox: OX,
      oy: OY,
      unit: "m",
      parts: [
        {
          kind: "tri",
          p: [
            [0, 4],
            [6, 4],
            [top, y0],
          ],
          dx: 0,
          dy: -0.6,
          color: C.coral,
          area: (6 * roof) / 2,
          how: `½ × 6 × ${roof}`,
          labels: [[`${roof} m`, 6.9, 4 - roof / 2]],
        },
        { ...rect(0, 4, 6, 4, 0, 0.5, C.cobalt, "m"), labels: [["6 m", 3, 8.55], ["4 m", -0.75, 6]] },
      ],
    };
  };
  const apex = () => ({ x: OX + top * S, y: OY + (4 - roof - 0.6 * kk) * S });
  return {
    down(p) {
      const a = apex();
      if (Math.hypot(p.x - a.x, p.y - a.y) < 40) {
        held = true;
        return true;
      }
    },
    move(p) {
      top = clamp(Math.round((p.x - OX) / S), 0, 6);
      roof = clamp(Math.round(4 - (p.y - OY) / S - 0.6 * kk), 1, 4);
    },
    up() {
      held = false;
    },
    press() {
      sp.flip(now);
    },
    draw(g, t) {
      now = t;
      const k = sp.k(t);
      kk = k;
      const sh = shape();
      // The box the roof sits in: the roof always fills half of it.
      if (k > 0) {
        g.c.globalAlpha = k;
        g.c.setLineDash([6, 6]);
        g.c.strokeStyle = C.coral;
        g.c.lineWidth = 2;
        g.c.strokeRect(OX, OY + (4 - roof - 0.6 * k) * S, 6 * S, roof * S);
        g.c.setLineDash([]);
        g.c.globalAlpha = 1;
      }
      drawShape(g, lang, sh, k, t);
      // The roof's height, from its base up to its top.
      const a = apex();
      g.c.setLineDash([4, 5]);
      g.line(a.x, a.y, a.x, OY + (4 - 0.6 * k) * S, "rgba(58, 63, 75, 0.5)", 2);
      g.c.setLineDash([]);
      g.handle(a.x, a.y, held);
      if (t < 5 && !held) g.text(lang === "id" ? "geser puncak atapnya" : "drag the top of the roof", 820, 70, 22, C.coral, "center", true);
      if (k > 0.9) fit(g, lang === "id" ? "segitiga = setengah persegi panjang" : "triangle = half the rectangle", 160, 150, 300, 22, C.coral);
      sums(g, lang, sh, k);
      g.button("split", sp.apart ? (lang === "id" ? "SATUKAN" : "JOIN") : lang === "id" ? "PISAHKAN" : "SPLIT", 500 - 150, 545, 300, 52, C.plum);
    },
  };
}

/** A running track: a rectangle with a half circle at each end; the two halves slide together into one whole circle. */
function track(lang: Lang): Scene {
  const sp = splitter();
  let len = 14;
  let now = 0;
  const S = 14;
  const r = 7;
  return {
    press(id) {
      if (id === "split") sp.flip(now);
      if (id === "l+") len = clamp(len + 7, 7, 28);
      if (id === "l-") len = clamp(len - 7, 7, 28);
    },
    draw(g, t) {
      now = t;
      const k = sp.k(t);
      const whole = 2 * r + len;
      const apartW = len + 4 + 2 * r;
      const left = 500 - (whole * S) / 2;
      // Split, the rectangle moves left and the halves meet as a circle at its right.
      const rx = (500 - (apartW * S) / 2 - left) / S - r;
      const cc = rx + r + len + 4 + r;
      const pi = piFor(r);
      const half = (pi * r * r) / 2;
      const sh: Shape = {
        s: S,
        ox: left,
        oy: 80,
        unit: "m",
        note: `π ≈ ${piSay(lang, r)}`,
        parts: [
          { kind: "half", cx: r, cy: r, r, face: Math.PI, dx: cc - r, dy: 1.5, color: C.teal, area: half, how: `½ × π × ${r} × ${r}`, labels: [[`r = ${r} m`, r - r / 2, r - 0.7]] },
          { ...rect(r, 0, len, 2 * r, rx, 1.5, C.cobalt, "m"), labels: [[`${len} m`, r + len / 2, -1.1], [`${2 * r} m`, r + len / 2, 2 * r + 1.1]] },
          { kind: "half", cx: r + len, cy: r, r, face: 0, dx: cc - r - len, dy: 1.5, color: "#5cc4b0", area: half, how: `½ × π × ${r} × ${r}` },
        ],
      };
      drawShape(g, lang, sh, k, t);
      // The lane the runners use, drawn round the whole track.
      if (k < 0.05) {
        const c = g.c;
        c.strokeStyle = "rgba(255, 253, 248, 0.9)";
        c.lineWidth = 3;
        c.setLineDash([10, 8]);
        c.beginPath();
        c.arc(left + r * S, 80 + r * S, (r - 1.5) * S, Math.PI / 2, (3 * Math.PI) / 2);
        c.lineTo(left + (r + len) * S, 80 + 1.5 * S);
        c.arc(left + (r + len) * S, 80 + r * S, (r - 1.5) * S, -Math.PI / 2, Math.PI / 2);
        c.closePath();
        c.stroke();
        c.setLineDash([]);
      }
      if (k > 0.9) fit(g, lang === "id" ? "dua setengah lingkaran = satu lingkaran" : "two half circles = one whole circle", 500, 340, 600, 22, "#2c8a78");
      sums(g, lang, sh, k);
      g.text(lang === "id" ? "panjang" : "length", 200, 518, 22, C.soft, "center", true);
      g.button("l-", "−", 85, 545, 70, 52, C.cobalt, len > 7);
      g.text(`${len} m`, 200, 571, 28, C.ink, "center", true);
      g.button("l+", "+", 245, 545, 70, 52, C.cobalt, len < 28);
      g.button("split", sp.apart ? (lang === "id" ? "SATUKAN" : "JOIN") : lang === "id" ? "PISAHKAN" : "SPLIT", 560, 545, 300, 52, C.plum);
    },
  };
}

/** A few more shapes, each split into known pieces or seen with a hole taken away. */
function more(lang: Lang): Scene {
  const sp = splitter();
  let at = 0;
  let now = 0;
  const NAMES = {
    en: ["a picture frame", "a window with an arch", "a garden with a round pond", "an arrow"],
    id: ["bingkai foto", "jendela berbentuk lengkung", "taman dengan kolam bundar", "tanda panah"],
  };
  const shapes = (): Shape[] => [
    {
      s: 34,
      ox: 330,
      oy: 70,
      unit: "cm",
      parts: [rect(0, 0, 10, 8, -1.5, 0, C.cobalt, "cm"), { ...rect(2, 2, 6, 4, 9.5, 0, C.coral, "cm", true), labels: [["6 cm", 5, 1.55], ["4 cm", 2.75, 4]] }],
    },
    {
      s: 34,
      ox: 360,
      oy: 60,
      unit: "dm",
      note: `π ≈ ${dec(lang, 3.14, 2)}`,
      parts: [
        { kind: "half", cx: 4, cy: 4, r: 4, face: -Math.PI / 2, dx: 0, dy: -0.6, color: C.plum, area: (3.14 * 16) / 2, how: "½ × π × 4 × 4", labels: [["r = 4 dm", 4, 2.7]] },
        { ...rect(0, 4, 8, 5, 0, 0.5, C.cobalt, "dm"), labels: [["8 dm", 4, 9.5], ["5 dm", -0.85, 6.5]] },
      ],
    },
    {
      s: 30,
      ox: 260,
      oy: 70,
      unit: "m",
      note: `π ≈ 22/7`,
      parts: [
        { ...rect(0, 0, 14, 9, -1, 0, C.teal, "m"), labels: [["14 m", 7, -0.5], ["9 m", -0.8, 4.5]] },
        { kind: "circle", cx: 9.5, cy: 4.5, r: 3.5, dx: 8, dy: 0, minus: true, color: C.cobalt, area: (22 / 7) * 3.5 * 3.5, how: `π × ${dec(lang, 3.5, 1)} × ${dec(lang, 3.5, 1)}`, labels: [[`r = ${dec(lang, 3.5, 1)} m`, 9.5, 8.5]] },
      ],
    },
    {
      s: 36,
      ox: 290,
      oy: 70,
      unit: "cm",
      parts: [
        { ...rect(0, 2, 6, 4, -0.8, 0, C.cobalt, "cm"), labels: [["6 cm", 3, 6.5], ["4 cm", -0.8, 4]] },
        {
          kind: "tri",
          p: [
            [6, 0],
            [10, 4],
            [6, 8],
          ],
          dx: 0.8,
          dy: 0,
          color: C.coral,
          area: (8 * 4) / 2,
          how: "½ × 8 × 4",
          labels: [
            ["8 cm", 5.3, 1],
            ["4 cm", 8, 7],
          ],
        },
      ],
    },
  ];
  return {
    press(id) {
      if (id === "split") sp.flip(now);
      if (id === "next") {
        at = (at + 1) % 4;
        sp.reset();
      }
    },
    draw(g, t) {
      now = t;
      const k = sp.k(t);
      const sh = shapes()[at];
      fit(g, NAMES[lang][at], 30, 36, 300, 24, C.soft, "left");
      drawShape(g, lang, sh, k, t);
      sums(g, lang, sh, k);
      g.button("split", sp.apart ? (lang === "id" ? "SATUKAN" : "JOIN") : lang === "id" ? "PISAHKAN" : "SPLIT", 160, 545, 300, 52, C.plum);
      g.button("next", lang === "id" ? "BANGUN LAIN" : "ANOTHER SHAPE", 540, 545, 300, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A combined shape is split into shapes we know. Cut this L shape down, across, or take a corner away: the area comes out the same.",
        id: "Bangun gabungan dipotong menjadi bangun yang sudah kita kenal. Potong bangun L ini tegak, mendatar, atau kurangi satu pojoknya: luasnya tetap sama.",
      },
      scene: lshape,
    },
    {
      say: {
        en: "A house is a rectangle with a triangle roof. Drag the top of the roof: the triangle is always half of the rectangle around it.",
        id: "Rumah ini terdiri atas persegi panjang dan atap segitiga. Geser puncak atapnya: segitiga selalu setengah dari persegi panjang di sekelilingnya.",
      },
      scene: house,
    },
    {
      say: {
        en: "A running track is a rectangle with a half circle at each end. Split it: the two halves make one whole circle.",
        id: "Lintasan lari terdiri atas persegi panjang dan setengah lingkaran di kedua ujungnya. Pisahkan: kedua setengah lingkaran membentuk satu lingkaran utuh.",
      },
      scene: track,
    },
    {
      say: {
        en: "Some shapes have a hole: find the whole area, then take the hole away. Try another shape.",
        id: "Ada bangun yang berlubang: hitung luas seluruhnya, lalu kurangi luas lubangnya. Coba bangun yang lain.",
      },
      scene: more,
    },
  ],
};
