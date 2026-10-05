import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene } from "../ink";
import { num } from "../parts";

/** Points in space: x to the right, y up, z toward the learner. */
type V3 = [number, number, number];
type P2 = [number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const mean = (ps: V3[]): V3 => mul(ps.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / ps.length);
const smooth = (k: number) => k * k * (3 - 2 * k);

const LIGHT = unit([-0.35, 0.55, 0.75]);

/** How the solid is seen: turned by `yaw` around the upright axis, tipped by `pitch`, `s` pixels a unit. */
interface View {
  yaw: number;
  pitch: number;
  s: number;
  cx: number;
  cy: number;
}

function turn(p: V3, v: View): V3 {
  const cy = Math.cos(v.yaw);
  const sy = Math.sin(v.yaw);
  const cp = Math.cos(v.pitch);
  const sp = Math.sin(v.pitch);
  const x = p[0] * cy + p[2] * sy;
  const z = -p[0] * sy + p[2] * cy;
  return [x, p[1] * cp - z * sp, p[1] * sp + z * cp];
}

const screen = (q: V3, v: View): Pt => ({ x: v.cx + q[0] * v.s, y: v.cy - q[1] * v.s });

/** The normal of a flat polygon, steady even when two corners meet. */
function newell(ps: V3[]): V3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  });
  return unit([nx, ny, nz]);
}

/** A palette colour made paler by `pale` (0 to 1), then darker or lighter by `k`. */
function tone(hex: string, k: number, pale = 0) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => {
    const p = c + (255 - c) * pale;
    return Math.round(clamp(k <= 1 ? p * k : p + (255 - p) * (k - 1), 0, 255));
  };
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function shape(g: Ink, pts: Pt[], fill: string, seam = false) {
  const c = g.c;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (seam) {
    c.strokeStyle = fill;
    c.lineWidth = 1.2;
    c.stroke();
  }
}

function edgeLine(g: Ink, a: Pt, b: Pt, color: string, width: number, hidden: boolean) {
  g.c.lineCap = "round";
  if (hidden) {
    g.c.setLineDash([8, 7]);
    g.c.globalAlpha = 0.45;
  }
  g.line(a.x, a.y, b.x, b.y, color, width);
  g.c.setLineDash([]);
  g.c.globalAlpha = 1;
  g.c.lineCap = "butt";
}

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** Bold lines wrapped to `width` from `y` down; returns the y under the last line. */
function para(g: Ink, s: string, x: number, y: number, width: number, size: number, color: string) {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (g.width(next, size, true) > width - 20 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => g.text(l, x, y + i * (size + 8), size, color, "left", true));
  return y + lines.length * (size + 8);
}

/** A numbered paper tab; faint when what it counts is round the back. */
function chip(g: Ink, s: string, p: Pt, seen: boolean) {
  g.c.globalAlpha = seen ? 1 : 0.45;
  g.dot(p.x, p.y, 16, C.paper);
  g.text(s, p.x, p.y + 1, 20, C.coral, "center", true);
  g.c.globalAlpha = 1;
}

interface Face {
  at: number[];
  curved: boolean;
}

interface Mesh {
  v: V3[];
  f: Face[];
  corners: number[];
  edges: { a: number; b: number; f: number[] }[];
  color: string;
}

function mesh(v: V3[], f: Face[], corners: number[], color: string): Mesh {
  const seen = new Map<string, { a: number; b: number; f: number[] }>();
  const edges: { a: number; b: number; f: number[] }[] = [];
  f.forEach((face, i) =>
    face.at.forEach((a, k) => {
      const b = face.at[(k + 1) % face.at.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      let e = seen.get(key);
      if (!e) {
        e = { a, b, f: [] };
        seen.set(key, e);
        edges.push(e);
      }
      e.f.push(i);
    }),
  );
  return { v, f, corners, edges, color };
}

/** `n` points round a circle of radius `r` at height `y`, a flat side facing the learner. */
function ring(n: number, r: number, y: number): V3[] {
  const a0 = Math.PI / 2 - Math.PI / n;
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (2 * Math.PI * i) / n;
    return [r * Math.cos(a), y, r * Math.sin(a)] as V3;
  });
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A prism on an n-sided base; with many sides and a curved wall it is a cylinder. */
function prism(n: number, r: number, h: number, color: string, curved = false): Mesh {
  const v = [...ring(n, r, -h / 2), ...ring(n, r, h / 2)];
  const f: Face[] = [
    { at: range(n).reverse(), curved: false },
    { at: range(n).map((i) => n + i), curved: false },
    ...range(n).map((i) => ({ at: [i, (i + 1) % n, n + ((i + 1) % n), n + i], curved })),
  ];
  return mesh(v, f, curved ? [] : range(2 * n), color);
}

/** A pyramid on an n-sided base; with many sides and a curved wall it is a cone. */
function pyramid(n: number, r: number, h: number, color: string, curved = false): Mesh {
  const v = [...ring(n, r, -h / 2), [0, h / 2, 0] as V3];
  const f: Face[] = [{ at: range(n).reverse(), curved: false }, ...range(n).map((i) => ({ at: [i, (i + 1) % n, n], curved }))];
  return mesh(v, f, curved ? [n] : range(n + 1), color);
}

function sphere(r: number, color: string): Mesh {
  const R = 14;
  const N = 28;
  const v: V3[] = [[0, r, 0]];
  for (let j = 1; j < R; j++) {
    const a = (Math.PI * j) / R;
    v.push(...ring(N, r * Math.sin(a), r * Math.cos(a)));
  }
  v.push([0, -r, 0]);
  const bottom = v.length - 1;
  const f: Face[] = [];
  for (let i = 0; i < N; i++) f.push({ at: [0, 1 + i, 1 + ((i + 1) % N)], curved: true });
  for (let j = 0; j < R - 2; j++) {
    const a = 1 + j * N;
    const b = a + N;
    for (let i = 0; i < N; i++) f.push({ at: [a + i, a + ((i + 1) % N), b + ((i + 1) % N), b + i], curved: true });
  }
  const last = 1 + (R - 2) * N;
  for (let i = 0; i < N; i++) f.push({ at: [last + ((i + 1) % N), last + i, bottom], curved: true });
  return mesh(v, f, [], color);
}

interface Mark {
  kind: "f" | "e" | "v";
  upto: number;
}

/**
 * A solid drawn with its far faces hidden, near faces lit, edges behind dashed
 * and corners dotted; `mark` numbers the first faces, edges or corners.
 */
function drawMesh(g: Ink, lang: Lang, m: Mesh, v: View, mark: Mark | null = null) {
  const P = m.v.map((p) => turn(p, v));
  const S = P.map((q) => screen(q, v));
  const info = m.f.map((face) => {
    const ps = face.at.map((i) => P[i]);
    const c = mean(ps);
    let n = newell(ps);
    if (dot(n, c) < 0) n = mul(n, -1);
    return { n, c, front: n[2] > 1e-3 };
  });
  m.f.forEach((face, i) => {
    const fi = info[i];
    if (!fi.front) return;
    const pts = face.at.map((j) => S[j]);
    shape(g, pts, tone(m.color, 0.62 + 0.45 * Math.max(0, dot(fi.n, LIGHT))), face.curved);
    if (mark?.kind === "f" && i < mark.upto) shape(g, pts, "rgba(255, 209, 102, 0.6)");
  });
  m.edges.forEach((e, i) => {
    const fr = e.f.map((k) => info[k].front);
    const any = fr.some((x) => x);
    if (e.f.every((k) => m.f[k].curved)) {
      // Between two curved facets only the outline of the solid is drawn.
      if (any && !fr.every((x) => x)) edgeLine(g, S[e.a], S[e.b], C.ink, 3, false);
      return;
    }
    const hot = mark?.kind === "e" && i < mark.upto;
    edgeLine(g, S[e.a], S[e.b], hot ? C.coral : C.ink, hot ? 6 : 3, !any);
  });
  const seen = (j: number) => m.f.some((face, k) => info[k].front && face.at.includes(j));
  m.corners.forEach((j, i) => {
    const hot = mark?.kind === "v" && i < mark.upto;
    g.c.globalAlpha = seen(j) ? 1 : 0.4;
    g.dot(S[j].x, S[j].y, hot ? 9 : 5, hot ? C.coral : C.ink);
    g.c.globalAlpha = 1;
  });
  if (!mark) return;
  const away = (p: Pt, d: number): Pt => {
    const dx = p.x - v.cx;
    const dy = p.y - v.cy;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / l) * d, y: p.y + (dy / l) * d };
  };
  if (mark.kind === "f") info.slice(0, mark.upto).forEach((fi, i) => chip(g, num(lang, i + 1), screen(fi.c, v), fi.front));
  if (mark.kind === "e")
    m.edges.slice(0, mark.upto).forEach((e, i) => {
      const mid = { x: (S[e.a].x + S[e.b].x) / 2, y: (S[e.a].y + S[e.b].y) / 2 };
      chip(g, num(lang, i + 1), away(mid, 20), e.f.some((k) => info[k].front));
    });
  if (mark.kind === "v") m.corners.slice(0, mark.upto).forEach((j, i) => chip(g, num(lang, i + 1), away(S[j], 26), seen(j)));
}

/** Dragging anywhere above the buttons turns the solid. */
function turner(view: View, top = 515) {
  let last: Pt | null = null;
  return {
    get held() {
      return last !== null;
    },
    down(p: Pt) {
      if (p.y > top) return false;
      last = p;
      return true;
    },
    move(p: Pt) {
      if (!last) return;
      view.yaw += (p.x - last.x) * 0.012;
      view.pitch = clamp(view.pitch + (p.y - last.y) * 0.012, -0.35, 1.5);
      last = p;
    },
    up() {
      last = null;
    },
  };
}

const PX = 790;

interface Kind {
  en: string;
  id: string;
  make: () => Mesh;
  f: number;
  e: number;
  v: number;
  note: { en: string; id: string };
  button: { en: string; id: string };
}

const SOLIDS: Kind[] = [
  {
    en: "triangular prism",
    id: "prisma segitiga",
    make: () => prism(3, 1.35, 2.2, C.teal),
    f: 5,
    e: 9,
    v: 6,
    note: { en: "Two equal triangles as bases, joined by rectangles. All its faces are flat.", id: "Dua alas segitiga yang sama, dihubungkan oleh persegi panjang. Semua sisinya datar." },
    button: { en: "PRISM", id: "PRISMA" },
  },
  {
    en: "cylinder",
    id: "tabung",
    make: () => prism(48, 1.1, 2.3, C.cobalt, true),
    f: 3,
    e: 2,
    v: 0,
    note: { en: "Two flat circles and one curved surface. Its two edges are circles.", id: "Dua lingkaran datar dan satu selimut lengkung. Kedua rusuknya berbentuk lingkaran." },
    button: { en: "CYLINDER", id: "TABUNG" },
  },
  {
    en: "square pyramid",
    id: "limas segi empat",
    make: () => pyramid(4, 1.45, 2.3, C.sun),
    f: 5,
    e: 8,
    v: 5,
    note: { en: "One square base and four triangles that meet at the top. All its faces are flat.", id: "Satu alas persegi dan empat segitiga yang bertemu di puncak. Semua sisinya datar." },
    button: { en: "PYRAMID", id: "LIMAS" },
  },
  {
    en: "cone",
    id: "kerucut",
    make: () => pyramid(48, 1.2, 2.4, C.coral, true),
    f: 2,
    e: 1,
    v: 0,
    note: { en: "One flat circle and one curved surface that narrows to a point: the apex.", id: "Satu lingkaran datar dan satu selimut lengkung yang meruncing ke satu titik puncak." },
    button: { en: "CONE", id: "KERUCUT" },
  },
  {
    en: "sphere",
    id: "bola",
    make: () => sphere(1.35, C.plum),
    f: 1,
    e: 0,
    v: 0,
    note: { en: "One curved surface all the way round, with no edges and no corners.", id: "Satu sisi lengkung di seluruh permukaannya, tanpa rusuk dan tanpa titik sudut." },
    button: { en: "SPHERE", id: "BOLA" },
  },
];

/** Five solids to pick and turn; the panel counts the faces, edges and vertices of each. */
function gallery(lang: Lang): Scene {
  const view: View = { yaw: 0.5, pitch: 0.4, s: 82, cx: 300, cy: 270 };
  const drag = turner(view);
  let pick = 0;
  let shown = SOLIDS[0].make();
  let since = 0;
  let now = 0;
  let last = 0;
  return {
    press(id) {
      const i = Number(id.slice(1));
      if (id[0] !== "s" || i === pick) return;
      pick = i;
      shown = SOLIDS[i].make();
      since = now;
    },
    down: (p) => drag.down(p),
    move: (p) => drag.move(p),
    up: () => drag.up(),
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (!drag.held) view.yaw += dt * 0.4;
      const k = ease(t, since, 0.45);
      const s = view.s;
      view.s = s * (0.55 + 0.45 * k);
      g.c.fillStyle = "rgba(70, 50, 25, 0.12)";
      g.c.beginPath();
      g.c.ellipse(view.cx, 400, 150 * k, 22 * k, 0, 0, Math.PI * 2);
      g.c.fill();
      drawMesh(g, lang, shown, view);
      view.s = s;
      if (t < 6 && !drag.held) fit(g, lang === "id" ? "geser untuk memutar" : "drag to turn it", view.cx, 480, 400, 22, C.coral);

      const it = SOLIDS[pick];
      fit(g, lang === "id" ? it.id : it.en, PX, 95, 360, 40);
      const rows: [string, number][] = lang === "id"
        ? [["sisi", it.f], ["rusuk", it.e], ["titik sudut", it.v]]
        : [["faces", it.f], ["edges", it.e], ["vertices", it.v]];
      rows.forEach(([label, n], i) => {
        const y = 150 + i * 66;
        g.card(PX - 180, y, 360, 54, C.field, 0.6);
        g.text(label, PX - 160, y + 27, 26, C.soft, "left", true);
        g.text(num(lang, n), PX + 160, y + 27, 32, C.coral, "right", true);
      });
      para(g, lang === "id" ? it.note.id : it.note.en, PX - 180, 375, 380, 22, C.ink);

      const bw = 172;
      SOLIDS.forEach((sd, i) => g.button(`s${i}`, lang === "id" ? sd.button.id : sd.button.en, 46 + i * (bw + 12), 555, bw, 52, i === pick ? C.coral : C.cobalt));
    },
  };
}

const SIDES_ID = ["", "", "", "segitiga", "segi empat", "segi lima", "segi enam"];
const PRISM_EN = ["", "", "", "triangular prism", "square prism", "pentagonal prism", "hexagonal prism"];
const PYRAMID_EN = ["", "", "", "triangular pyramid", "square pyramid", "pentagonal pyramid", "hexagonal pyramid"];

/** A prism or pyramid with 3 to 6 base sides; its faces, edges or vertices are numbered one by one. */
function counting(lang: Lang): Scene {
  const view: View = { yaw: 0.45, pitch: 0.42, s: 82, cx: 300, cy: 255 };
  const drag = turner(view, 505);
  let pyr = false;
  let n = 5;
  let m = prism(n, 1.35, 2.2, C.teal);
  let mode: Mark["kind"] | null = null;
  let start = 0;
  let done = new Set<string>();
  let now = 0;
  let last = 0;
  const STEP = 0.5;
  const rebuild = () => {
    m = pyr ? pyramid(n, 1.45, 2.4, C.sun) : prism(n, 1.35, 2.2, C.teal);
    mode = null;
    done = new Set();
  };
  const totals = () => (pyr ? { f: n + 1, e: 2 * n, v: n + 1 } : { f: n + 2, e: 3 * n, v: 2 * n });
  return {
    press(id) {
      if (id === "prism" || id === "pyr") {
        pyr = id === "pyr";
        rebuild();
      }
      if (id === "n-" || id === "n+") {
        n = clamp(n + (id === "n+" ? 1 : -1), 3, 6);
        rebuild();
      }
      if (id === "f" || id === "e" || id === "v") {
        mode = id;
        start = now + 0.2;
      }
    },
    down: (p) => drag.down(p),
    move: (p) => drag.move(p),
    up: () => drag.up(),
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (!drag.held) view.yaw += dt * 0.25;
      const tot = totals();
      let mark: Mark | null = null;
      if (mode) {
        const upto = clamp(Math.floor((t - start) / STEP) + 1, 0, tot[mode]);
        mark = { kind: mode, upto };
        if (upto === tot[mode]) done.add(mode);
      }
      drawMesh(g, lang, m, view, mark);
      if (t < 6 && !drag.held) fit(g, lang === "id" ? "geser untuk memutar" : "drag to turn it", view.cx, 488, 400, 22, C.coral);

      fit(g, lang === "id" ? `${pyr ? "limas" : "prisma"} ${SIDES_ID[n]}` : (pyr ? PYRAMID_EN : PRISM_EN)[n], PX, 80, 360, 36);
      const labels = lang === "id" ? ["SISI", "RUSUK", "TITIK SUDUT"] : ["FACES", "EDGES", "VERTICES"];
      const ways = pyr ? [`${num(lang, n)} + 1`, `2 × ${num(lang, n)}`, `${num(lang, n)} + 1`] : [`${num(lang, n)} + 2`, `3 × ${num(lang, n)}`, `2 × ${num(lang, n)}`];
      (["f", "e", "v"] as const).forEach((key, i) => {
        const y = 125 + i * 72;
        g.button(key, labels[i], PX - 190, y, 200, 52, mode === key ? C.coral : C.cobalt);
        if (mark && mode === key && !done.has(key)) g.text(num(lang, mark.upto), PX + 105, y + 26, 34, C.coral, "center", true);
        else if (done.has(key)) fit(g, `${ways[i]} = ${num(lang, tot[key])}`, PX + 105, y + 26, 170, 28, C.ink);
      });
      const base = lang === "id" ? `alas: ${SIDES_ID[n]} (${num(lang, n)} sisi)` : `base: ${num(lang, n)} sides`;
      fit(g, base, PX, 362, 380, 24, C.soft);
      const parts = lang === "id"
        ? pyr
          ? `1 alas dan ${num(lang, n)} sisi tegak segitiga yang bertemu di puncak.`
          : `2 alas yang sama dan ${num(lang, n)} sisi tegak persegi panjang.`
        : pyr
          ? `1 base and ${num(lang, n)} triangles that meet at the top.`
          : `2 equal bases and ${num(lang, n)} rectangles round the side.`;
      para(g, parts, PX - 190, 405, 390, 22, C.ink);

      g.button("prism", lang === "id" ? "PRISMA" : "PRISM", 40, 545, 190, 52, pyr ? C.cobalt : C.coral);
      g.button("pyr", lang === "id" ? "LIMAS" : "PYRAMID", 245, 545, 190, 52, pyr ? C.coral : C.cobalt);
      g.text(lang === "id" ? "sisi alas" : "base sides", 640, 522, 20, C.soft, "center", true);
      g.button("n-", "−", 520, 545, 70, 52, C.teal, n > 3);
      g.text(num(lang, n), 640, 571, 30, C.ink, "center", true);
      g.button("n+", "+", 690, 545, 70, 52, C.teal, n < 6);
    },
  };
}

/** A face's own flat frame: origin, two directions along it, and the normal pointing into the solid. */
interface Frame {
  o: V3;
  u: V3;
  v: V3;
  m: V3;
}

const FLOOR: Frame = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], m: [0, 1, 0] };
const at = (f: Frame, p: P2): V3 => add(f.o, add(mul(f.u, p[0]), mul(f.v, p[1])));
const middle = (poly: P2[]): P2 => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

/**
 * The frame of a face hinged on the edge A to B of a parent face. At `angle`
 * 0 it lies flat beside the parent; as the angle grows it folds up toward the
 * inside of the solid. Its own x runs along the hinge and y away from it.
 */
function hinge(f: Frame, poly: P2[], A: P2, B: P2, angle: number): Frame {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ex = (B[0] - A[0]) / L;
  const ey = (B[1] - A[1]) / L;
  let dx = ey;
  let dy = -ex;
  const c = middle(poly);
  if ((c[0] - A[0]) * dx + (c[1] - A[1]) * dy > 0) {
    dx = -dx;
    dy = -dy;
  }
  const u = add(mul(f.u, ex), mul(f.v, ey));
  const d = add(mul(f.u, dx), mul(f.v, dy));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { o: at(f, A), u, v: add(mul(d, cos), mul(f.m, sin)), m: add(mul(d, -sin), mul(f.m, cos)) };
}

/** A polygon written along its edge `i` (x) and inward from it (y). */
function fromEdge(poly: P2[], i: number): P2[] {
  const A = poly[i];
  const B = poly[(i + 1) % poly.length];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ex = (B[0] - A[0]) / L;
  const ey = (B[1] - A[1]) / L;
  let ix = -ey;
  let iy = ex;
  const c = middle(poly);
  if ((c[0] - A[0]) * ix + (c[1] - A[1]) * iy < 0) {
    ix = -ix;
    iy = -iy;
  }
  return poly.map((q) => [(q[0] - A[0]) * ex + (q[1] - A[1]) * ey, (q[0] - A[0]) * ix + (q[1] - A[1]) * iy] as P2);
}

/** A regular polygon with sides of `side`, one edge toward the learner. */
function regular(n: number, side: number): P2[] {
  const R = side / (2 * Math.sin(Math.PI / n));
  const a0 = -Math.PI / 2 - Math.PI / n;
  return range(n).map((i) => [R * Math.cos(a0 + (2 * Math.PI * i) / n), R * Math.sin(a0 + (2 * Math.PI * i) / n)] as P2);
}

interface Piece {
  pts: V3[];
  out: V3;
  color: string;
  lines: [number, number][];
}

const loop = (n: number) => range(n).map((i) => [i, (i + 1) % n] as [number, number]);
const flat = (f: Frame, poly: P2[], color: string): Piece => ({ pts: poly.map((p) => at(f, p)), out: mul(f.m, -1), color, lines: loop(poly.length) });

/** The prism's net at `fold` (1 closed, 0 flat): the lid opens first, then the walls lie down. */
function prismNet(fold: number): Piece[] {
  const L = 2.2;
  const h = 2.5;
  const base = regular(3, L);
  const rect: P2[] = [[0, 0], [L, 0], [L, h], [0, h]];
  const walls = smooth(clamp(2 * fold, 0, 1));
  const lid = smooth(clamp(2 * fold - 1, 0, 1));
  const out = [flat(FLOOR, base, C.sun)];
  base.forEach((A, i) => {
    const side = hinge(FLOOR, base, A, base[(i + 1) % 3], (Math.PI / 2) * walls);
    out.push(flat(side, rect, C.teal));
    if (i === 0) out.push(flat(hinge(side, rect, [0, h], [L, h], (Math.PI / 2) * lid), fromEdge(base, 0), C.sun));
  });
  return out;
}

function pyramidNet(fold: number): Piece[] {
  const L = 2.5;
  const H = 2.3;
  const base = regular(4, L);
  const slant = Math.hypot(H, L / 2);
  const tri: P2[] = [[0, 0], [L, 0], [L / 2, slant]];
  const up = (Math.PI - Math.atan2(H, L / 2)) * smooth(fold);
  return [flat(FLOOR, base, C.sun), ...base.map((A, i) => flat(hinge(FLOOR, base, A, base[(i + 1) % 4], up), tri, C.coral))];
}

/**
 * The cylinder's net: the lid swings open, the curved wall unrolls into a
 * rectangle as its bend relaxes, then the rectangle lies down on the table.
 */
function cylinderNet(fold: number): Piece[] {
  const r = 1.1;
  const h = 2.4;
  const N = 40;
  const u = 1 - fold;
  const lidK = smooth(clamp(u / 0.3, 0, 1));
  const rollK = smooth(clamp((u - 0.3) / 0.35, 0, 1));
  const layK = smooth(clamp((u - 0.65) / 0.35, 0, 1));
  const cs = Math.cos((layK * Math.PI) / 2);
  const sn = Math.sin((layK * Math.PI) / 2);
  const layV = (d: V3): V3 => [d[0], d[1] * cs - d[2] * sn, d[1] * sn + d[2] * cs];
  const lay = (p: V3): V3 => add(layV([p[0], p[1], p[2] - r]), [0, 0, r]);
  const bend = (1 - rollK) / r;
  const wall = (s: number, y: number): V3 => {
    if (bend < 1e-4) return lay([s, y, r]);
    const R = 1 / bend;
    return lay([R * Math.sin(s / R), y, r - R + R * Math.cos(s / R)]);
  };
  const circle = (c: V3, a: V3, b: V3) => range(N).map((i) => add(c, add(mul(a, r * Math.cos((2 * Math.PI * i) / N)), mul(b, r * Math.sin((2 * Math.PI * i) / N)))));
  const out: Piece[] = [{ pts: circle([0, 0, 0], [1, 0, 0], [0, 0, 1]), out: [0, -1, 0], color: C.sun, lines: loop(N) }];
  const w = 2 * Math.PI * r;
  for (let i = 0; i < N; i++) {
    const s0 = -w / 2 + (w * i) / N;
    const s1 = s0 + w / N;
    const sm = (s0 + s1) / 2;
    const lines: [number, number][] = [[0, 1], [2, 3]];
    if (i === 0) lines.push([3, 0]);
    if (i === N - 1) lines.push([1, 2]);
    out.push({
      pts: [wall(s0, 0), wall(s1, 0), wall(s1, h), wall(s0, h)],
      out: layV([Math.sin(sm * bend), 0, Math.cos(sm * bend)]),
      color: C.cobalt,
      lines,
    });
  }
  const th = (Math.PI / 2) * (1 - lidK);
  const d = layV([0, 1, 0]);
  const mIn = layV([0, 0, -1]);
  const vv = add(mul(d, Math.cos(th)), mul(mIn, Math.sin(th)));
  const inward = add(mul(d, -Math.sin(th)), mul(mIn, Math.cos(th)));
  const o = lay([0, h, r]);
  out.push({ pts: circle(add(o, mul(vv, r)), [1, 0, 0], vv), out: mul(inward, -1), color: C.sun, lines: loop(N) });
  return out;
}

/** Pieces sorted far to near; the outside of each in its colour, the inside paler. */
function drawPieces(g: Ink, pieces: Piece[], v: View, shift: V3) {
  const items = pieces
    .map((pc) => {
      const P = pc.pts.map((p) => turn(add(p, shift), v));
      return { pc, S: P.map((q) => screen(q, v)), z: mean(P)[2] };
    })
    .sort((a, b) => a.z - b.z);
  for (const { pc, S } of items) {
    const o = turn(pc.out, v);
    const outside = o[2] >= 0;
    const k = 0.68 + 0.38 * Math.max(0, dot(outside ? o : mul(o, -1), LIGHT));
    shape(g, S, tone(pc.color, k, outside ? 0 : 0.5), true);
    g.c.lineCap = "round";
    for (const [a, b] of pc.lines) g.line(S[a].x, S[a].y, S[b].x, S[b].y, C.ink, 2.5);
    g.c.lineCap = "butt";
  }
}

interface NetKind {
  build: (fold: number) => Piece[];
  tall: number;
  en: string;
  id: string;
  button: { en: string; id: string };
  parts: { color: string; en: string; id: string }[];
  note?: { en: string; id: string };
}

const NETS: NetKind[] = [
  {
    build: prismNet,
    tall: 2.5,
    en: "triangular prism",
    id: "prisma segitiga",
    button: { en: "PRISM", id: "PRISMA" },
    parts: [
      { color: C.sun, en: "2 triangles: the bases", id: "2 segitiga: alas dan tutup" },
      { color: C.teal, en: "3 rectangles: the sides", id: "3 persegi panjang: sisi tegak" },
    ],
  },
  {
    build: cylinderNet,
    tall: 2.4,
    en: "cylinder",
    id: "tabung",
    button: { en: "CYLINDER", id: "TABUNG" },
    parts: [
      { color: C.sun, en: "2 circles: the bases", id: "2 lingkaran: alas dan tutup" },
      { color: C.cobalt, en: "1 rectangle: the curved wall", id: "1 persegi panjang: selimut" },
    ],
    note: { en: "The rectangle is as long as the circle's circumference.", id: "Panjang persegi panjang sama dengan keliling lingkaran." },
  },
  {
    build: pyramidNet,
    tall: 2.3,
    en: "square pyramid",
    id: "limas segi empat",
    button: { en: "PYRAMID", id: "LIMAS" },
    parts: [
      { color: C.sun, en: "1 square: the base", id: "1 persegi: alas" },
      { color: C.coral, en: "4 triangles: the sides", id: "4 segitiga: sisi tegak" },
    ],
  },
];

/** A prism, a cylinder or a pyramid opens out into its net on the table and folds back up. */
function nets(lang: Lang): Scene {
  const view: View = { yaw: 0.35, pitch: 0.8, s: 50, cx: 300, cy: 265 };
  const drag = turner(view, 505);
  let pick = 0;
  let fold = 1;
  let goal = 0;
  let wait = 0.8;
  let now = 0;
  let last = 0;
  return {
    press(id) {
      if (id === "fold") {
        goal = goal === 0 ? 1 : 0;
        wait = now;
      }
      if (id[0] === "n") {
        pick = Number(id.slice(1));
        fold = 1;
        goal = 0;
        wait = now + 0.6;
      }
    },
    down: (p) => drag.down(p),
    move: (p) => drag.move(p),
    up: () => drag.up(),
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (t >= wait) fold = goal > fold ? Math.min(goal, fold + dt * 0.4) : Math.max(goal, fold - dt * 0.4);
      const kind = NETS[pick];
      const open = kind.build(0);
      const xs = open.flatMap((pc) => pc.pts.map((p) => p[0]));
      const zs = open.flatMap((pc) => pc.pts.map((p) => p[2]));
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      drawPieces(g, kind.build(fold), view, [-(1 - fold) * cx, (-fold * kind.tall) / 2, -(1 - fold) * cz]);
      if (t < 6 && !drag.held) fit(g, lang === "id" ? "geser untuk memutar" : "drag to turn it", view.cx, 495, 400, 22, C.coral);

      g.text(lang === "id" ? "jaring-jaring" : "the net of a", PX, 90, 26, C.soft, "center", true);
      fit(g, lang === "id" ? kind.id : kind.en, PX, 132, 360, 38);
      let y = 200;
      kind.parts.forEach((p) => {
        g.card(PX - 185, y - 14, 28, 28, p.color, 0.6);
        y = para(g, lang === "id" ? p.id : p.en, PX - 145, y, 335, 24, C.ink) + 18;
      });
      if (kind.note) para(g, lang === "id" ? kind.note.id : kind.note.en, PX - 185, y + 10, 375, 22, C.soft);

      NETS.forEach((nk, i) => g.button(`n${i}`, lang === "id" ? nk.button.id : nk.button.en, 40 + i * 200, 555, 185, 52, i === pick ? C.coral : C.cobalt));
      const closing = goal === 1;
      g.button("fold", closing ? (lang === "id" ? "BUKA" : "UNFOLD") : lang === "id" ? "LIPAT" : "FOLD UP", 700, 555, 260, 52, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Here are five solids. Pick one and drag it to turn it: look at its flat faces, curved surfaces, edges and vertices.",
        id: "Ini lima bangun ruang. Pilih satu dan geser untuk memutarnya: amati sisi datar, sisi lengkung, rusuk, dan titik sudutnya.",
      },
      scene: gallery,
    },
    {
      say: {
        en: "A prism has two equal bases; a pyramid has one base and a point at the top. Press a button to see them counted one by one.",
        id: "Prisma punya dua alas yang sama; limas punya satu alas dan satu puncak. Tekan tombolnya untuk melihat penghitungan satu per satu.",
      },
      scene: counting,
    },
    {
      say: {
        en: "A net is a solid cut open and laid flat. Watch it unfold, then fold it back up.",
        id: "Jaring-jaring adalah bangun ruang yang dibuka lalu direbahkan. Lihat bangunnya terbuka, lalu lipat kembali.",
      },
      scene: nets,
    },
  ],
};
