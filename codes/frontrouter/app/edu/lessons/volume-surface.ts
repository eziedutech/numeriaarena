import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene } from "../ink";
import { dec, num } from "../parts";

/** Points in space: x to the right, y up, z toward the learner. */
type V3 = [number, number, number];
type P2 = [number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const mean = (ps: V3[]): V3 => mul(ps.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / ps.length);
const smooth = (k: number) => k * k * (3 - 2 * k);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const LIGHT = unit([-0.35, 0.55, 0.75]);
const PI = 3.14;
const PX = 790;

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
const project = (p: V3, v: View) => screen(turn(p, v), v);

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

function outline(g: Ink, pts: Pt[], color: string, width: number) {
  const c = g.c;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineJoin = "round";
  c.stroke();
}

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A number with no more decimals than it needs: 6, 7,5 or 12,56 in Indonesian. */
function nice(lang: Lang, x: number) {
  const r = Math.round(x * 100) / 100;
  if (Number.isInteger(r)) return num(lang, r);
  return Number.isInteger(Math.round(r * 100) / 10) ? dec(lang, r, 1) : dec(lang, r, 2);
}

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  g.text(label, cx, 522, 20, C.soft, "center", true);
  g.button(`${id}-`, "−", cx - 100, 545, 60, 52, color, canDown);
  fit(g, value, cx, 571, 76, 26);
  g.button(`${id}+`, "+", cx + 40, 545, 60, 52, color, canUp);
}

/** Dragging anywhere above the buttons turns the view. */
function turner(view: View, right = 590) {
  let last: Pt | null = null;
  return {
    get held() {
      return last !== null;
    },
    down(p: Pt) {
      if (p.y > 505 || p.x > right) return false;
      last = p;
      return true;
    },
    move(p: Pt) {
      if (!last) return;
      view.yaw += (p.x - last.x) * 0.012;
      view.pitch = clamp(view.pitch + (p.y - last.y) * 0.012, 0.1, 1.45);
      last = p;
    },
    up() {
      last = null;
    },
  };
}

/** One upright block: a base polygon (x, z) from height y0 to y1, lit, with its far faces hidden. */
interface Block {
  base: P2[];
  y0: number;
  y1: number;
  color: string;
  pale: number;
  curved: boolean;
  alpha: number;
}

function drawBlock(g: Ink, b: Block, v: View) {
  const n = b.base.length;
  const lo = b.base.map((p) => turn([p[0], b.y0, p[1]], v));
  const hi = b.base.map((p) => turn([p[0], b.y1, p[1]], v));
  const mid = mean([...lo, ...hi]);
  const S0 = lo.map((q) => screen(q, v));
  const S1 = hi.map((q) => screen(q, v));
  const facing = (ps: V3[]) => {
    let nn = newell(ps);
    if (dot(nn, add(mean(ps), mul(mid, -1))) < 0) nn = mul(nn, -1);
    return nn;
  };
  const light = (nn: V3) => tone(b.color, 0.62 + 0.45 * Math.max(0, dot(nn, LIGHT)), b.pale);
  g.c.globalAlpha = b.alpha;
  const sides = range(n).map((i) => {
    const j = (i + 1) % n;
    const nn = facing([lo[i], lo[j], hi[j], hi[i]]);
    return { i, j, nn, front: nn[2] > 1e-3 };
  });
  const bottom = facing(lo);
  if (bottom[2] > 1e-3) {
    shape(g, S0, light(bottom));
    outline(g, S0, C.ink, 1.5);
  }
  for (const sd of sides) {
    if (!sd.front) continue;
    const pts = [S0[sd.i], S0[sd.j], S1[sd.j], S1[sd.i]];
    shape(g, pts, light(sd.nn), b.curved);
    if (!b.curved) outline(g, pts, C.ink, 1.5);
    else g.line(S0[sd.i].x, S0[sd.i].y, S0[sd.j].x, S0[sd.j].y, C.ink, 2);
  }
  if (b.curved) {
    sides.forEach((sd, k) => {
      const prev = sides[(k - 1 + n) % n];
      if (sd.front !== prev.front) g.line(S0[sd.i].x, S0[sd.i].y, S1[sd.i].x, S1[sd.i].y, C.ink, 2);
    });
  }
  const top = facing(hi);
  if (top[2] > 1e-3) {
    shape(g, S1, light(top));
    outline(g, S1, C.ink, b.curved ? 2 : 1.5);
  }
  g.c.globalAlpha = 1;
}

/** Blocks drawn far to near. */
function drawBlocks(g: Ink, blocks: Block[], v: View) {
  blocks
    .map((b) => {
      const c = b.base.reduce((s, p) => [s[0] + p[0] / b.base.length, s[1] + p[1] / b.base.length] as P2, [0, 0] as P2);
      return { b, z: turn([c[0], (b.y0 + b.y1) / 2, c[1]], v)[2] };
    })
    .sort((a, b) => a.z - b.z)
    .forEach(({ b }) => drawBlock(g, b, v));
}

/** The base drawn on the table, with a crease every unit when `grid` is given. */
function floorShape(g: Ink, poly: P2[], y: number, v: View, k: number, grid?: [number, number]) {
  const S = poly.map((p) => project([p[0], y, p[1]], v));
  g.c.globalAlpha = k;
  shape(g, S, tone(C.sun, 1, 0.35));
  if (grid) {
    const [a, b] = grid;
    for (let i = 1; i < a; i++) {
      const p = project([-a / 2 + i, y, -b / 2], v);
      const q = project([-a / 2 + i, y, b / 2], v);
      g.line(p.x, p.y, q.x, q.y, "rgba(58, 63, 75, 0.3)", 1.5);
    }
    for (let j = 1; j < b; j++) {
      const p = project([-a / 2, y, -b / 2 + j], v);
      const q = project([a / 2, y, -b / 2 + j], v);
      g.line(p.x, p.y, q.x, q.y, "rgba(58, 63, 75, 0.3)", 1.5);
    }
  }
  outline(g, S, C.ink, 2.5);
  g.c.globalAlpha = 1;
}

/** A length written beside the middle of a segment, pushed away from the solid's middle. */
function tag(g: Ink, s: string, a: V3, b: V3, v: View, color: string) {
  const p = project(mul(add(a, b), 0.5), v);
  const dx = p.x - v.cx;
  const dy = p.y - v.cy;
  const l = Math.hypot(dx, dy) || 1;
  const x = p.x + (dx / l) * 30;
  const y = p.y + (dy / l) * 30;
  const w = g.width(s, 22, true) + 16;
  g.card(x - w / 2, y - 15, w, 30, C.paper, 0.5);
  g.text(s, x, y + 1, 22, color, "center", true);
}

/** When the layers fall, from `start`: the base shows, then one layer every `gap` seconds. */
const GAP = 0.7;
const landed = (t: number, start: number, layers: number) => clamp(Math.floor((t - start - 0.6 - 0.5) / GAP) + 1, 0, layers);
const drop = (t: number, start: number, j: number) => ease(t, start + 0.6 + j * GAP, 0.5);

/**
 * The column of sums: the base area, the layers added up as they land, and
 * the volume as base area times height once the last one is down.
 */
function volumeColumn(g: Ink, lang: Lang, t: number, start: number, layers: number, baseSum: string, area: number, unitWord: string) {
  const id = lang === "id";
  g.text(id ? "luas alas" : "base area", PX, 80, 24, C.soft, "center", true);
  fit(g, `${baseSum} = ${nice(lang, area)} cm²`, PX, 120, 370, 30, "#2f9a86");
  const n = landed(t, start, layers);
  g.text(id ? `${num(lang, n)} lapisan` : `${num(lang, n)} layer${n === 1 ? "" : "s"}`, PX, 175, 24, C.soft, "center", true);
  if (n > 0) {
    let s = range(n)
      .map(() => nice(lang, area))
      .join(" + ");
    if (n === layers) s += ` = ${nice(lang, area * layers)}`;
    if (g.width(s, 20, true) > 370) s = `${num(lang, n)} × ${nice(lang, area)}${n === layers ? ` = ${nice(lang, area * layers)}` : ""}`;
    fit(g, s, PX, 212, 370, 28, C.ink);
  }
  fit(g, id ? `tiap lapisan setebal 1 cm berisi ${nice(lang, area)} ${unitWord}` : `each layer 1 cm thick holds ${nice(lang, area)} ${unitWord}`, PX, 250, 370, 20, C.soft);
  if (n === layers) {
    g.c.globalAlpha = ease(t, start + 0.6 + (layers - 1) * GAP + 0.6, 0.5);
    g.card(PX - 185, 285, 370, 70, C.sun, 1);
    fit(g, `V = ${nice(lang, area)} × ${num(lang, layers)} = ${nice(lang, area * layers)} cm³`, PX, 320, 340, 32);
    fit(g, id ? "V = luas alas × tinggi" : "V = base area × height", PX, 395, 370, 28, C.ink);
    g.c.globalAlpha = 1;
  }
}

/** Unit cubes fill the base in one layer, then layer after layer stacks up to the height. */
function cuboid(lang: Lang): Scene {
  const view: View = { yaw: 0.6, pitch: 0.5, s: 50, cx: 300, cy: 280 };
  const drag = turner(view);
  let p = 4;
  let l = 3;
  let h = 3;
  let start = 0.3;
  let now = 0;
  return {
    press(id) {
      const d = id.endsWith("+") ? 1 : -1;
      if (id[0] === "p") p = clamp(p + d, 1, 6);
      if (id[0] === "l") l = clamp(l + d, 1, 5);
      if (id[0] === "h") h = clamp(h + d, 1, 5);
      start = now + 0.1;
    },
    down: (pt) => drag.down(pt),
    move: (pt) => drag.move(pt),
    up: () => drag.up(),
    draw(g, t) {
      now = t;
      view.s = Math.min(62, 300 / Math.hypot(p, l, h));
      const y0 = -h / 2;
      floorShape(g, [[-p / 2, -l / 2], [p / 2, -l / 2], [p / 2, l / 2], [-p / 2, l / 2]], y0, view, ease(t, start, 0.5), [p, l]);
      const blocks: Block[] = [];
      for (let j = 0; j < h; j++) {
        const k = drop(t, start, j);
        if (k <= 0) continue;
        const y = y0 + j + 2.5 * (1 - k);
        for (let i = 0; i < p; i++)
          for (let m = 0; m < l; m++) {
            const x = -p / 2 + i;
            const z = -l / 2 + m;
            blocks.push({ base: [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]], y0: y, y1: y + 1, color: C.teal, pale: j % 2 ? 0.3 : 0, curved: false, alpha: k });
          }
      }
      drawBlocks(g, blocks, view);
      tag(g, `${num(lang, p)} cm`, [-p / 2, y0, l / 2], [p / 2, y0, l / 2], view, C.cobalt);
      tag(g, `${num(lang, l)} cm`, [p / 2, y0, -l / 2], [p / 2, y0, l / 2], view, C.cobalt);
      if (landed(t, start, h) === h) tag(g, `${num(lang, h)} cm`, [p / 2, y0, l / 2], [p / 2, -y0, l / 2], view, C.coral);

      const id = lang === "id";
      volumeColumn(g, lang, t, start, h, `${num(lang, p)} × ${num(lang, l)}`, p * l, id ? "kubus" : "cubes");
      fit(g, id ? "1 kubus kecil = 1 cm³" : "1 small cube = 1 cm³", PX, 450, 370, 22, C.soft);
      stepper(g, id ? "panjang" : "length", `${num(lang, p)} cm`, "p", 110, p > 1, p < 6, C.cobalt);
      stepper(g, id ? "lebar" : "width", `${num(lang, l)} cm`, "l", 330, l > 1, l < 5, C.cobalt);
      stepper(g, id ? "tinggi" : "height", `${num(lang, h)} cm`, "h", 550, h > 1, h < 5, C.coral);
      g.button("again", id ? "TUMPUK LAGI" : "STACK AGAIN", 700, 545, 260, 52, C.teal);
    },
  };
}

/** A triangular prism: its triangle base is half a rectangle, and slabs of that triangle stack up. */
function triangular(lang: Lang): Scene {
  const view: View = { yaw: 0.5, pitch: 0.5, s: 50, cx: 300, cy: 280 };
  const drag = turner(view);
  let a = 4;
  let b = 3;
  let h = 4;
  let start = 0.3;
  let now = 0;
  return {
    press(id) {
      const d = id.endsWith("+") ? 1 : -1;
      if (id[0] === "a") a = clamp(a + d, 2, 6);
      if (id[0] === "b") b = clamp(b + d, 2, 6);
      if (id[0] === "h") h = clamp(h + d, 1, 6);
      start = now + 0.1;
    },
    down: (pt) => drag.down(pt),
    move: (pt) => drag.move(pt),
    up: () => drag.up(),
    draw(g, t) {
      now = t;
      view.s = Math.min(62, 300 / Math.hypot(a, b, h));
      const y0 = -h / 2;
      const tri: P2[] = [[-a / 2, b / 2], [a / 2, b / 2], [-a / 2, -b / 2]];
      const k0 = ease(t, start, 0.5);
      // The rectangle the triangle is half of, as a dashed outline.
      const rect = [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]].map((q) => project([q[0], y0, q[1]], view));
      g.c.globalAlpha = k0;
      g.c.setLineDash([9, 7]);
      outline(g, rect, C.soft, 2);
      g.c.setLineDash([]);
      g.c.globalAlpha = 1;
      floorShape(g, tri, y0, view, k0);
      const blocks: Block[] = [];
      for (let j = 0; j < h; j++) {
        const k = drop(t, start, j);
        if (k <= 0) continue;
        const y = y0 + j + 2.5 * (1 - k);
        blocks.push({ base: tri, y0: y, y1: y + 1, color: C.plum, pale: j % 2 ? 0.3 : 0, curved: false, alpha: k });
      }
      drawBlocks(g, blocks, view);
      tag(g, `${num(lang, a)} cm`, [-a / 2, y0, b / 2], [a / 2, y0, b / 2], view, C.cobalt);
      tag(g, `${num(lang, b)} cm`, [-a / 2, y0, -b / 2], [-a / 2, y0, b / 2], view, C.cobalt);
      if (landed(t, start, h) === h) tag(g, `${num(lang, h)} cm`, [a / 2, y0, b / 2], [a / 2, -y0, b / 2], view, C.coral);

      const id = lang === "id";
      volumeColumn(g, lang, t, start, h, `${num(lang, a)} × ${num(lang, b)} : 2`, (a * b) / 2, "cm³");
      fit(g, id ? "segitiga = setengah persegi panjang" : "the triangle is half a rectangle", PX, 450, 370, 22, C.soft);
      stepper(g, id ? "alas segitiga" : "triangle base", `${num(lang, a)} cm`, "a", 110, a > 2, a < 6, C.cobalt);
      stepper(g, id ? "tinggi segitiga" : "triangle height", `${num(lang, b)} cm`, "b", 330, b > 2, b < 6, C.cobalt);
      stepper(g, id ? "tinggi prisma" : "prism height", `${num(lang, h)} cm`, "h", 550, h > 1, h < 6, C.coral);
      g.button("again", id ? "TUMPUK LAGI" : "STACK AGAIN", 700, 545, 260, 52, C.teal);
    },
  };
}

const circle = (r: number, n = 40): P2[] => range(n).map((i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as P2);

/** A cylinder the same way: discs as thick as 1 cm with a circle for the base stack up. */
function cylinder(lang: Lang): Scene {
  const view: View = { yaw: 0.3, pitch: 0.55, s: 50, cx: 300, cy: 280 };
  const drag = turner(view);
  let r = 2;
  let h = 3;
  let start = 0.3;
  let now = 0;
  return {
    press(id) {
      const d = id.endsWith("+") ? 1 : -1;
      if (id[0] === "r") r = clamp(r + d, 1, 5);
      if (id[0] === "h") h = clamp(h + d, 1, 6);
      start = now + 0.1;
    },
    down: (pt) => drag.down(pt),
    move: (pt) => drag.move(pt),
    up: () => drag.up(),
    draw(g, t) {
      now = t;
      view.s = Math.min(62, 300 / Math.hypot(2 * r, h));
      const y0 = -h / 2;
      const base = circle(r);
      floorShape(g, base, y0, view, ease(t, start, 0.5));
      const centre = project([0, y0, 0], view);
      const edge = project([r, y0, 0], view);
      g.c.globalAlpha = ease(t, start, 0.5);
      g.line(centre.x, centre.y, edge.x, edge.y, C.coral, 3);
      g.dot(centre.x, centre.y, 5, C.ink);
      g.c.globalAlpha = 1;
      const blocks: Block[] = [];
      for (let j = 0; j < h; j++) {
        const k = drop(t, start, j);
        if (k <= 0) continue;
        const y = y0 + j + 2.5 * (1 - k);
        blocks.push({ base, y0: y, y1: y + 1, color: C.cobalt, pale: j % 2 ? 0.3 : 0, curved: true, alpha: k });
      }
      drawBlocks(g, blocks, view);
      const done = landed(t, start, h) === h;
      const yr = done ? -y0 : y0;
      const c2 = project([0, yr, 0], view);
      const e2 = project([r, yr, 0], view);
      g.line(c2.x, c2.y, e2.x, e2.y, C.coral, 3);
      tag(g, `r = ${num(lang, r)} cm`, [0, yr, 0], [r, yr, 0], view, C.coral);
      if (done) tag(g, `${num(lang, h)} cm`, [-r, y0, 0], [-r, -y0, 0], view, C.ink);

      const id = lang === "id";
      volumeColumn(g, lang, t, start, h, `${dec(lang, PI, 2)} × ${num(lang, r)} × ${num(lang, r)}`, PI * r * r, "cm³");
      fit(g, id ? "luas lingkaran = π × r × r, dengan π ≈ 3,14" : "circle area = π × r × r, with π ≈ 3.14", PX, 450, 370, 22, C.soft);
      stepper(g, id ? "jari-jari" : "radius", `${num(lang, r)} cm`, "r", 140, r > 1, r < 5, C.coral);
      stepper(g, id ? "tinggi" : "height", `${num(lang, h)} cm`, "h", 390, h > 1, h < 6, C.cobalt);
      g.button("again", id ? "TUMPUK LAGI" : "STACK AGAIN", 640, 545, 300, 52, C.teal);
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

interface Piece {
  pts: V3[];
  out: V3;
  color: string;
  lines: [number, number][];
  /** Which named face of the solid this piece belongs to. */
  face: number;
}

const loop = (n: number) => range(n).map((i) => [i, (i + 1) % n] as [number, number]);
const flat = (f: Frame, poly: P2[], color: string, face: number): Piece => ({ pts: poly.map((p) => at(f, p)), out: mul(f.m, -1), color, lines: loop(poly.length), face });

/** Faces in the order they are added up: base, top, front, back, left, right. */
function boxNet(p: number, l: number, h: number, fold: number): Piece[] {
  const base: P2[] = [[-p / 2, -l / 2], [p / 2, -l / 2], [p / 2, l / 2], [-p / 2, l / 2]];
  const walls = smooth(clamp(2 * fold, 0, 1));
  const lid = smooth(clamp(2 * fold - 1, 0, 1));
  const names = [2, 5, 3, 4];
  const colors = [C.teal, C.cobalt, C.teal, C.cobalt];
  const out = [flat(FLOOR, base, C.sun, 0)];
  base.forEach((A, i) => {
    const B = base[(i + 1) % 4];
    const L = i % 2 ? l : p;
    const rect: P2[] = [[0, 0], [L, 0], [L, h], [0, h]];
    const side = hinge(FLOOR, base, A, B, (Math.PI / 2) * walls);
    out.push(flat(side, rect, colors[i], names[i]));
    if (i === 2) {
      const top: P2[] = [[0, 0], [p, 0], [p, l], [0, l]];
      out.push(flat(hinge(side, rect, [0, h], [L, h], (Math.PI / 2) * lid), top, C.sun, 1));
    }
  });
  return out;
}

/** The cylinder's lid swings open, its wall unrolls into a rectangle, then lies down. Faces: base, top, wall. */
function canNet(r: number, h: number, fold: number): Piece[] {
  const N = 40;
  const u = 1 - fold;
  const lidK = smooth(clamp(u / 0.3, 0, 1));
  const rollK = smooth(clamp((u - 0.3) / 0.35, 0, 1));
  const layK = smooth(clamp((u - 0.65) / 0.35, 0, 1));
  const cs = Math.cos((layK * Math.PI) / 2);
  const sn = Math.sin((layK * Math.PI) / 2);
  const layV = (d: V3): V3 => [d[0], d[1] * cs - d[2] * sn, d[1] * sn + d[2] * cs];
  const lay = (q: V3): V3 => add(layV([q[0], q[1], q[2] - r]), [0, 0, r]);
  const bend = (1 - rollK) / r;
  const wall = (s: number, y: number): V3 => {
    if (bend < 1e-4) return lay([s, y, r]);
    const R = 1 / bend;
    return lay([R * Math.sin(s / R), y, r - R + R * Math.cos(s / R)]);
  };
  const ring = (c: V3, a: V3, b: V3) => range(N).map((i) => add(c, add(mul(a, r * Math.cos((2 * Math.PI * i) / N)), mul(b, r * Math.sin((2 * Math.PI * i) / N)))));
  const out: Piece[] = [{ pts: ring([0, 0, 0], [1, 0, 0], [0, 0, 1]), out: [0, -1, 0], color: C.sun, lines: loop(N), face: 0 }];
  const w = 2 * Math.PI * r;
  for (let i = 0; i < N; i++) {
    const s0 = -w / 2 + (w * i) / N;
    const s1 = s0 + w / N;
    const sm = (s0 + s1) / 2;
    const lines: [number, number][] = [[0, 1], [2, 3]];
    if (i === 0) lines.push([3, 0]);
    if (i === N - 1) lines.push([1, 2]);
    out.push({ pts: [wall(s0, 0), wall(s1, 0), wall(s1, h), wall(s0, h)], out: layV([Math.sin(sm * bend), 0, Math.cos(sm * bend)]), color: C.cobalt, lines, face: 2 });
  }
  const th = (Math.PI / 2) * (1 - lidK);
  const d = layV([0, 1, 0]);
  const mIn = layV([0, 0, -1]);
  const vv = add(mul(d, Math.cos(th)), mul(mIn, Math.sin(th)));
  const inward = add(mul(d, -Math.sin(th)), mul(mIn, Math.cos(th)));
  const o = lay([0, h, r]);
  out.push({ pts: ring(add(o, mul(vv, r)), [1, 0, 0], vv), out: mul(inward, -1), color: C.sun, lines: loop(N), face: 1 });
  return out;
}

/** Pieces sorted far to near, the face being added glowing; returns each face's middle on the sheet. */
function drawPieces(g: Ink, pieces: Piece[], v: View, shift: V3, hot: number) {
  const items = pieces
    .map((pc) => {
      const P = pc.pts.map((q) => turn(add(q, shift), v));
      return { pc, P, S: P.map((q) => screen(q, v)), z: mean(P)[2] };
    })
    .sort((a, b) => a.z - b.z);
  const middles = new Map<number, V3[]>();
  for (const { pc, P, S } of items) {
    const o = turn(pc.out, v);
    const outside = o[2] >= 0;
    const k = 0.68 + 0.38 * Math.max(0, dot(outside ? o : mul(o, -1), LIGHT));
    shape(g, S, tone(pc.color, k, outside ? 0 : 0.45), true);
    if (pc.face === hot) shape(g, S, "rgba(255, 209, 102, 0.55)", true);
    g.c.lineCap = "round";
    for (const [a, b] of pc.lines) g.line(S[a].x, S[a].y, S[b].x, S[b].y, C.ink, 2.5);
    g.c.lineCap = "butt";
    const list = middles.get(pc.face) ?? [];
    list.push(...P);
    middles.set(pc.face, list);
  }
  const at2 = new Map<number, Pt>();
  middles.forEach((ps, f) => at2.set(f, screen(mean(ps), v)));
  return at2;
}

/** Surface area: the solid opens into its net, then each face's area is written on it and added up. */
function surface(lang: Lang): Scene {
  const view: View = { yaw: 0.3, pitch: 0.85, s: 30, cx: 300, cy: 265 };
  const drag = turner(view);
  let can = false;
  let p = 4;
  let l = 3;
  let h = 2;
  let r = 2;
  let fold = 1;
  let goal = 0;
  let wait = 0.8;
  let flatAt = -1;
  let now = 0;
  let last = 0;
  const reopen = () => {
    fold = 1;
    goal = 0;
    wait = now + 0.4;
    flatAt = -1;
  };
  return {
    press(id) {
      const d = id.endsWith("+") ? 1 : -1;
      if (id === "box" || id === "can") {
        can = id === "can";
        reopen();
      } else if (id === "fold") {
        goal = goal === 0 ? 1 : 0;
        wait = now;
        flatAt = -1;
      } else {
        if (id[0] === "p") p = clamp(p + d, 1, 5);
        if (id[0] === "l") l = clamp(l + d, 1, 5);
        if (id[0] === "h") h = clamp(h + d, 1, 5);
        if (id[0] === "r") r = clamp(r + d, 1, 3);
        reopen();
      }
    },
    down: (pt) => drag.down(pt),
    move: (pt) => drag.move(pt),
    up: () => drag.up(),
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (t >= wait) fold = goal > fold ? Math.min(goal, fold + dt * 0.4) : Math.max(goal, fold - dt * 0.4);
      if (fold === 0 && goal === 0 && flatAt < 0) flatAt = t;
      const id = lang === "id";
      const build = (f: number) => (can ? canNet(r, h, f) : boxNet(p, l, h, f));
      const open = build(0);
      const xs = open.flatMap((pc) => pc.pts.map((q) => q[0]));
      const zs = open.flatMap((pc) => pc.pts.map((q) => q[2]));
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      view.s = Math.min(48, 470 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)));

      const pi = dec(lang, PI, 2);
      const rows: { name: string; how: string; area: number; color: string }[] = can
        ? [
            { name: id ? "alas" : "base", how: `${pi} × ${num(lang, r)} × ${num(lang, r)}`, area: PI * r * r, color: C.sun },
            { name: id ? "tutup" : "top", how: "", area: PI * r * r, color: C.sun },
            { name: id ? "selimut" : "wall", how: `2 × ${pi} × ${num(lang, r)} × ${num(lang, h)}`, area: 2 * PI * r * h, color: C.cobalt },
          ]
        : [
            { name: id ? "alas" : "base", how: `${num(lang, p)} × ${num(lang, l)}`, area: p * l, color: C.sun },
            { name: id ? "tutup" : "top", how: "", area: p * l, color: C.sun },
            { name: id ? "depan" : "front", how: `${num(lang, p)} × ${num(lang, h)}`, area: p * h, color: C.teal },
            { name: id ? "belakang" : "back", how: "", area: p * h, color: C.teal },
            { name: id ? "kiri" : "left", how: `${num(lang, l)} × ${num(lang, h)}`, area: l * h, color: C.cobalt },
            { name: id ? "kanan" : "right", how: "", area: l * h, color: C.cobalt },
          ];
      const shown = flatAt < 0 ? 0 : clamp(Math.floor((t - flatAt) / 0.7) + 1, 0, rows.length);
      const hot = shown > 0 && shown <= rows.length && t - flatAt < rows.length * 0.7 ? shown - 1 : -1;
      const mids = drawPieces(g, build(fold), view, [-(1 - fold) * cx, (-fold * h) / 2, -(1 - fold) * cz], hot);
      if (fold < 0.05)
        rows.slice(0, shown).forEach((row, i) => {
          const m = mids.get(i);
          if (!m) return;
          const s = nice(lang, row.area);
          const w = g.width(s, 22, true) + 16;
          g.card(m.x - w / 2, m.y - 15, w, 30, C.paper, 0.5);
          g.text(s, m.x, m.y + 1, 22, C.ink, "center", true);
        });
      if (t < 6 && !drag.held) fit(g, id ? "geser untuk memutar" : "drag to turn it", view.cx, 495, 400, 22, C.coral);

      g.text(id ? "luas permukaan" : "surface area", PX, 78, 26, C.soft, "center", true);
      const gap = can ? 52 : 40;
      rows.slice(0, shown).forEach((row, i) => {
        const y = 120 + i * gap;
        g.card(PX - 190, y - 11, 22, 22, row.color, 0.5);
        g.text(row.name, PX - 158, y, 22, i === hot ? C.coral : C.ink, "left", true);
        const tail = row.how ? `${row.how} = ${nice(lang, row.area)}` : nice(lang, row.area);
        const room = 334 - g.width(row.name, 22, true);
        let k = 22;
        while (k > 18 && g.width(tail, k, true) > room) k -= 1;
        g.text(tail, PX + 190, y, k, C.ink, "right", true);
      });
      if (shown === rows.length) {
        const total = rows.reduce((s, row) => s + row.area, 0);
        g.c.globalAlpha = ease(t, flatAt + rows.length * 0.7, 0.5);
        g.card(PX - 190, 365, 380, 74, C.sun, 1);
        fit(g, `${id ? "jumlah" : "total"} = ${nice(lang, total)} cm²`, PX, 402, 350, 32);
        g.c.globalAlpha = 1;
      } else if (fold > 0.05) fit(g, id ? "buka jaring-jaringnya" : "open out the net", PX, 300, 370, 24, C.soft);

      g.button("box", id ? "BALOK" : "CUBOID", 30, 545, 140, 52, can ? C.cobalt : C.coral);
      g.button("can", id ? "TABUNG" : "CYLINDER", 180, 545, 140, 52, can ? C.coral : C.cobalt);
      if (can) {
        stepper(g, id ? "jari-jari" : "radius", `${num(lang, r)} cm`, "r", 450, r > 1, r < 3, C.coral);
        stepper(g, id ? "tinggi" : "height", `${num(lang, h)} cm`, "h", 650, h > 1, h < 5, C.coral);
      } else {
        stepper(g, id ? "panjang" : "length", `${num(lang, p)} cm`, "p", 450, p > 1, p < 5, C.coral);
        stepper(g, id ? "lebar" : "width", `${num(lang, l)} cm`, "l", 650, l > 1, l < 5, C.coral);
        stepper(g, id ? "tinggi" : "height", `${num(lang, h)} cm`, "h", 850, h > 1, h < 5, C.coral);
      }
      const closed = goal === 1;
      g.button("fold", closed ? (id ? "BUKA" : "UNFOLD") : id ? "LIPAT" : "FOLD UP", can ? 770 : PX - 130, can ? 545 : 455, can ? 190 : 260, 52, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "The volume of a cuboid: one layer of 1 cm cubes covers the base, and the layers stack up to the height. Change the sizes and watch it fill.",
        id: "Volume balok: satu lapisan kubus 1 cm menutupi alas, lalu lapisan bertumpuk setinggi balok. Ubah ukurannya dan lihat balok terisi.",
      },
      scene: cuboid,
    },
    {
      say: {
        en: "Every prism works the same way, even with a triangle for its base: volume = base area × height.",
        id: "Semua prisma sama caranya, walaupun alasnya segitiga: volume = luas alas × tinggi.",
      },
      scene: triangular,
    },
    {
      say: {
        en: "A cylinder is like a prism with a circle for its base: circle layers stack up, so volume = π × r × r × height.",
        id: "Tabung seperti prisma beralas lingkaran: lapisan lingkaran bertumpuk, jadi volume = π × r × r × tinggi.",
      },
      scene: cylinder,
    },
    {
      say: {
        en: "The surface area is the area of the whole net. Open it out and watch every face's area added up.",
        id: "Luas permukaan adalah luas seluruh jaring-jaringnya. Buka jaring-jaringnya, lalu lihat luas setiap sisi dijumlahkan.",
      },
      scene: surface,
    },
  ],
};
