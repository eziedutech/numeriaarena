import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, lerp } from "../ink";
import { num, wrap } from "../parts";

type V3 = [number, number, number];

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A palette colour made lighter (k above 0) or darker (k below 0). */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

/** A palette colour seen through, `a` from 0 to 1. */
function tone(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** A closed outline through the points, filled and inked as asked. */
function poly(g: Ink, pts: Pt[], fill: string | null, stroke: string | null, width = 2) {
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

/** The corners of a box a by b by c: bit 1 picks the length, bit 2 the height, bit 4 the depth. */
const corner = (i: number, a: number, b: number, c: number): V3 => [(i & 1) * a, ((i >> 1) & 1) * b, ((i >> 2) & 1) * c];

/** The six faces as four corners in turn: front, back, bottom, top, left, right. */
const FACES = [
  [0, 1, 3, 2],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 3, 7, 6],
  [0, 2, 6, 4],
  [1, 3, 7, 5],
];
const NORMALS: V3[] = [
  [0, 0, -1],
  [0, 0, 1],
  [0, -1, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [1, 0, 0],
];
/** Opposite faces share a colour. */
const FACE_COLOR = [C.sun, C.sun, C.teal, C.teal, C.coral, C.coral];

/** The twelve edges, four along the length, then four up, then four into the depth. */
const EDGES: [number, number][] = [1, 2, 4].flatMap((bit) =>
  [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => !(i & bit)).map((i): [number, number] => [i, i | bit]),
);
const EDGE_COLOR: Record<number, string> = { 1: C.cobalt, 2: C.coral, 4: C.teal };

const CUBE: V3 = [3, 3, 3];
const CUBOID: V3 = [4.6, 2.4, 3];

const NAMES = {
  en: { cube: "cube", cuboid: "cuboid", faces: "faces", edges: "edges", corners: "vertices" },
  id: { cube: "kubus", cuboid: "balok", faces: "sisi", edges: "rusuk", corners: "titik sudut" },
};

type Kind = "faces" | "edges" | "corners";

/** The box drawn on paper as seen a little from above and the right; its faces, edges or vertices light up one at a time and are counted. */
function parts(lang: Lang): Scene {
  let kind: Kind = "faces";
  let cube = false;
  let from = CUBOID;
  let to = CUBOID;
  let morph = -9;
  let start = 0.4;
  let now = 0;
  const S = 56;
  const DX = 0.42;
  const DY = 0.34;
  const PX = 800;
  const FACE_ORDER = [0, 1, 3, 2, 5, 4];
  const GAP: Record<Kind, number> = { faces: 0.8, edges: 0.4, corners: 0.4 };
  const KIND_COLOR: Record<Kind, string> = { faces: C.teal, edges: C.cobalt, corners: C.plum };
  const dims = (): V3 => {
    const k = ease(now, morph, 0.6);
    return [lerp(from[0], to[0], k), lerp(from[1], to[1], k), lerp(from[2], to[2], k)];
  };
  return {
    press(id) {
      if (id === "shape") {
        from = dims();
        cube = !cube;
        to = cube ? CUBE : CUBOID;
        morph = now;
        start = now + 0.7;
      } else {
        kind = id as Kind;
        start = now + 0.2;
      }
    },
    draw(g, t) {
      now = t;
      const [a, b, c] = dims();
      const w = a * S + c * S * DX;
      const h = b * S + c * S * DY;
      const ox = 320 - w / 2;
      const oy = 290 + h / 2;
      const P = (i: number): Pt => {
        const v = corner(i, a, b, c);
        return { x: ox + v[0] * S + v[2] * S * DX, y: oy - v[1] * S - v[2] * S * DY };
      };
      const mid = (ids: number[]) => {
        const ps = ids.map(P);
        return { x: ps.reduce((n, p) => n + p.x, 0) / ps.length, y: ps.reduce((n, p) => n + p.y, 0) / ps.length };
      };
      const centre = mid([0, 1, 2, 3, 4, 5, 6, 7]);
      const total = kind === "faces" ? 6 : kind === "edges" ? 12 : 8;
      const gap = GAP[kind];
      const shown = (n: number) => ease(t, start + n * gap, 0.35);
      const count = clamp(Math.floor((t - start) / gap) + 1, 0, total);
      const lit = (f: number) => (kind === "faces" ? shown(FACE_ORDER.indexOf(f)) : 0);

      // The floor shadow, then the faces behind, then the paper faces in front.
      g.c.fillStyle = "rgba(70, 50, 25, 0.1)";
      g.c.beginPath();
      g.c.ellipse(centre.x + 10, oy + 6 - (c * S * DY) / 2, w / 2 + 30, 26, 0, 0, Math.PI * 2);
      g.c.fill();
      for (const f of [1, 2, 4]) {
        const k = lit(f);
        if (k > 0) poly(g, FACES[f].map(P), tone(FACE_COLOR[f], 0.45 * k), null);
      }
      const base: Record<number, string> = { 0: "rgba(248, 239, 220, 0.6)", 3: "rgba(255, 253, 248, 0.6)", 5: "rgba(241, 227, 196, 0.6)" };
      for (const f of [0, 3, 5]) {
        poly(g, FACES[f].map(P), base[f], null);
        const k = lit(f);
        if (k > 0) poly(g, FACES[f].map(P), tone(FACE_COLOR[f], 0.6 * k), null);
      }
      for (const [i, j] of EDGES) {
        const p = P(i);
        const q = P(j);
        if (i === 4 || j === 4) {
          g.c.setLineDash([8, 7]);
          g.line(p.x, p.y, q.x, q.y, "rgba(58, 63, 75, 0.45)", 2);
          g.c.setLineDash([]);
        } else g.line(p.x, p.y, q.x, q.y, C.ink, 3);
      }

      if (kind === "faces") {
        FACE_ORDER.forEach((f, n) => {
          const k = shown(n);
          if (k <= 0) return;
          const m = mid(FACES[f]);
          g.c.globalAlpha = k;
          g.dot(m.x, m.y, 17, C.paper);
          g.text(num(lang, n + 1), m.x, m.y, 22, shade(FACE_COLOR[f], -0.45), "center", true);
          g.c.globalAlpha = 1;
        });
      }
      if (kind === "edges") {
        g.c.lineCap = "round";
        EDGES.forEach(([i, j], n) => {
          const k = shown(n);
          if (k <= 0) return;
          const p = P(i);
          const q = P(j);
          const color = EDGE_COLOR[i ^ j];
          if (i === 4) g.c.setLineDash([10, 9]);
          g.line(p.x, p.y, lerp(p.x, q.x, k), lerp(p.y, q.y, k), color, i === 4 ? 5 : 7);
          g.c.setLineDash([]);
          if (k >= 1) {
            const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
            g.dot(m.x, m.y, 13, C.paper);
            g.text(num(lang, n + 1), m.x, m.y, 18, color, "center", true);
          }
        });
        g.c.lineCap = "butt";
      }
      if (kind === "corners") {
        for (let i = 0; i < 8; i++) {
          const k = shown(i);
          if (k <= 0) continue;
          const p = P(i);
          if (i === 4) {
            g.c.strokeStyle = C.plum;
            g.c.lineWidth = 4;
            g.c.beginPath();
            g.c.arc(p.x, p.y, 10 * k, 0, Math.PI * 2);
            g.c.stroke();
          } else g.dot(p.x, p.y, 11 * k, C.plum);
          const dx = p.x - centre.x;
          const dy = p.y - centre.y;
          const len = Math.hypot(dx, dy) || 1;
          g.c.globalAlpha = k;
          g.text(num(lang, i + 1), p.x + (dx / len) * 30, p.y + (dy / len) * 30, 22, C.plum, "center", true);
          g.c.globalAlpha = 1;
        }
      }

      const nm = NAMES[lang];
      const color = KIND_COLOR[kind];
      g.text(cube ? nm.cube : nm.cuboid, PX, 90, 48, C.ink, "center", true);
      g.text(num(lang, count), PX, 200, 96, color, "center", true);
      fit(g, nm[kind], PX, 278, 300, 36, color);
      if (count === total) {
        const notes: Record<Kind, [string, string]> = {
          faces: cube
            ? ["6 faces, all of them equal squares.", "6 sisi, semuanya persegi yang sama besar."]
            : ["6 faces; opposite faces are equal rectangles.", "6 sisi; sisi yang berhadapan sama besar."],
          edges: cube
            ? ["12 edges, all of them equally long.", "12 rusuk, semuanya sama panjang."]
            : ["12 edges: 4 long, 4 tall and 4 going back.", "12 rusuk: 4 panjang, 4 tinggi, dan 4 lebar."],
          corners: ["8 vertices; at each one 3 edges meet.", "8 titik sudut; di setiap titik sudut bertemu 3 rusuk."],
        };
        const note = notes[kind][lang === "id" ? 1 : 0];
        g.c.globalAlpha = ease(t, start + (total - 1) * gap + 0.4, 0.5);
        g.card(PX - 170, 320, 340, 120, C.field, 0);
        wrap(g, note, 300, 24).forEach((l, i, all) => g.text(l, PX, 380 + (i - (all.length - 1) / 2) * 32, 24, C.ink, "center", true));
        g.c.globalAlpha = 1;
      }
      g.text(lang === "id" ? "garis putus-putus: rusuk di belakang" : "dashed lines: edges at the back", PX, 480, 18, C.soft, "center");

      const id = lang === "id";
      g.button("faces", id ? "SISI" : "FACES", 40, 555, 190, 52, C.teal);
      g.button("edges", id ? "RUSUK" : "EDGES", 250, 555, 190, 52, C.cobalt);
      g.button("corners", id ? "TITIK SUDUT" : "VERTICES", 460, 555, 230, 52, C.plum);
      g.button("shape", cube ? (id ? "JADI BALOK" : "MAKE A CUBOID") : id ? "JADI KUBUS" : "MAKE A CUBE", 720, 555, 240, 52, C.coral);
    },
  };
}

/** The box turned in space by dragging: its corners really turn in three dimensions and are then drawn on the paper. */
function turn(lang: Lang): Scene {
  let yaw = 0.6;
  let pitch = -0.45;
  let spin = true;
  let see = false;
  let cube = false;
  let touched = false;
  let held: Pt | null = null;
  let from = CUBOID;
  let to = CUBOID;
  let morph = -9;
  let now = 0;
  let last = 0;
  const K = 66;
  const D = 14;
  const CX = 320;
  const CY = 280;
  const PX = 800;
  const dims = (): V3 => {
    const k = ease(now, morph, 0.6);
    return [lerp(from[0], to[0], k), lerp(from[1], to[1], k), lerp(from[2], to[2], k)];
  };
  return {
    press(id) {
      if (id === "shape") {
        from = dims();
        cube = !cube;
        to = cube ? CUBE : CUBOID;
        morph = now;
      }
      if (id === "spin") spin = !spin;
      if (id === "see") see = !see;
    },
    down(p) {
      if (p.x < 640 && p.y < 530) {
        held = p;
        touched = true;
        spin = false;
        return true;
      }
    },
    move(p) {
      if (!held) return;
      yaw += (p.x - held.x) * 0.012;
      pitch = clamp(pitch - (p.y - held.y) * 0.012, -1.45, 1.45);
      held = p;
    },
    up() {
      held = null;
    },
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (spin && !held) yaw += dt * 0.5;
      const [a, b, c] = dims();
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const rot = (v: V3): V3 => {
        const x = v[0] * cy + v[2] * sy;
        const z = -v[0] * sy + v[2] * cy;
        return [x, v[1] * cp - z * sp, v[1] * sp + z * cp];
      };
      const R = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const v = corner(i, a, b, c);
        return rot([v[0] - a / 2, v[1] - b / 2, v[2] - c / 2]);
      });
      const P = R.map((v) => {
        const f = D / (D + v[2]);
        return { x: CX + v[0] * K * f, y: CY - v[1] * K * f };
      });
      const visible = FACES.map((f, n) => {
        const nn = rot(NORMALS[n]);
        const m = [0, 1, 2].map((ax) => f.reduce((s, i) => s + R[i][ax], 0) / 4);
        return nn[0] * m[0] + nn[1] * m[1] + nn[2] * (m[2] + D) < 0;
      });
      const facesOf = (ids: number[]) => FACES.map((f, n) => (ids.every((i) => f.includes(i)) ? n : -1)).filter((n) => n >= 0);

      g.c.fillStyle = "rgba(70, 50, 25, 0.1)";
      g.c.beginPath();
      g.c.ellipse(CX, 495, 200, 24, 0, 0, Math.PI * 2);
      g.c.fill();
      if (see) {
        for (const [i, j] of EDGES) {
          if (facesOf([i, j]).some((n) => visible[n])) continue;
          g.c.setLineDash([8, 7]);
          g.line(P[i].x, P[i].y, P[j].x, P[j].y, "rgba(58, 63, 75, 0.5)", 2);
          g.c.setLineDash([]);
        }
      }
      const light: V3 = [-0.4, 0.7, -0.6];
      FACES.forEach((f, n) => {
        if (!visible[n]) return;
        const nn = rot(NORMALS[n]);
        const l = (nn[0] * light[0] + nn[1] * light[1] + nn[2] * light[2]) / Math.hypot(...light);
        const fill = shade(FACE_COLOR[n], clamp(0.25 + 0.4 * l, -0.15, 0.7));
        if (see) g.c.globalAlpha = 0.45;
        poly(g, f.map((i) => P[i]), fill, null);
        g.c.globalAlpha = 1;
      });
      g.c.lineCap = "round";
      for (const [i, j] of EDGES) {
        if (!facesOf([i, j]).some((n) => visible[n])) continue;
        g.line(P[i].x, P[i].y, P[j].x, P[j].y, C.ink, 3);
      }
      g.c.lineCap = "butt";
      for (let i = 0; i < 8; i++) {
        if (facesOf([i]).some((n) => visible[n])) g.dot(P[i].x, P[i].y, 6, C.plum);
        else if (see) {
          g.c.strokeStyle = C.plum;
          g.c.lineWidth = 2;
          g.c.beginPath();
          g.c.arc(P[i].x, P[i].y, 6, 0, Math.PI * 2);
          g.c.stroke();
        }
      }
      if (!touched) g.text(lang === "id" ? "seret untuk memutar" : "drag to turn it", CX, 528, 22, C.coral, "center", true);

      const nm = NAMES[lang];
      g.text(cube ? nm.cube : nm.cuboid, PX, 90, 48, C.ink, "center", true);
      const rows: [number, string, string][] = [
        [6, nm.faces, "#2f9a86"],
        [12, nm.edges, C.cobalt],
        [8, nm.corners, C.plum],
      ];
      rows.forEach(([n, word, color], i) => {
        const y = 175 + i * 66;
        g.card(PX - 150, y - 28, 300, 56, i % 2 ? C.paper : "#f8efdc", 1);
        g.text(num(lang, n), PX - 80, y, 36, color, "right", true);
        fit(g, word, PX - 60, y, 200, 28, color, "left");
      });
      const note =
        lang === "id"
          ? cube
            ? "Kubus: 6 sisinya persegi dan 12 rusuknya sama panjang."
            : "Balok: sisi yang berhadapan sama besar dan sejajar."
          : cube
            ? "A cube: its 6 faces are squares and its 12 edges are equal."
            : "A cuboid: opposite faces are equal and face each other.";
      wrap(g, note, 320, 22).forEach((l, i) => g.text(l, PX, 400 + i * 30, 22, C.soft, "center"));

      const id = lang === "id";
      g.button("shape", cube ? (id ? "JADI BALOK" : "MAKE A CUBOID") : id ? "JADI KUBUS" : "MAKE A CUBE", 40, 555, 260, 52, C.coral);
      g.button("spin", spin ? (id ? "BERHENTI" : "STOP") : id ? "PUTAR" : "SPIN", 320, 555, 220, 52, C.cobalt);
      g.button("see", see ? (id ? "PADAT" : "SOLID") : id ? "TEMBUS PANDANG" : "SEE THROUGH", 560, 555, 280, 52, C.teal);
    },
  };
}

type Cell = [number, number];
interface Hinge {
  vertical: boolean;
  at: number;
  side: number;
}

/** Five of the eleven cube nets, each with the square that stays on the table. */
const NETS: { cells: Cell[]; root: number }[] = [
  { cells: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]], root: 2 },
  { cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2], [1, 3]], root: 3 },
  { cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]], root: 2 },
  { cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2]], root: 2 },
  { cells: [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1], [4, 1]], root: 2 },
];
const NET_COLOR = [C.sun, C.teal, C.coral, C.cobalt, C.plum, C.sand];

/** Which square each square of a net hangs from, and the crease it turns on. */
function tree(cells: Cell[], root: number) {
  const parent = cells.map(() => -1);
  const hinge: Hinge[] = cells.map(() => ({ vertical: true, at: 0, side: 1 }));
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const p = queue.shift() as number;
    cells.forEach((cell, i) => {
      if (seen.has(i)) return;
      const dx = cell[0] - cells[p][0];
      const dy = cell[1] - cells[p][1];
      if (Math.abs(dx) + Math.abs(dy) !== 1) return;
      seen.add(i);
      queue.push(i);
      parent[i] = p;
      hinge[i] = dx !== 0 ? { vertical: true, at: Math.max(cell[0], cells[p][0]), side: dx } : { vertical: false, at: Math.max(cell[1], cells[p][1]), side: dy };
    });
  }
  return { parent, hinge };
}

/** A point of square `i` once every crease between it and the table has turned by `th`. */
function folded(v0: V3, i: number, parent: number[], hinge: Hinge[], th: number): V3 {
  let v = v0;
  for (let f = i; parent[f] >= 0; f = parent[f]) {
    const h = hinge[f];
    const a = h.side * th;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (h.vertical) {
      const d = v[0] - h.at;
      v = [h.at + d * ca - v[2] * sa, v[1], d * sa + v[2] * ca];
    } else {
      const d = v[1] - h.at;
      v = [v[0], h.at + d * ca - v[2] * sa, d * sa + v[2] * ca];
    }
  }
  return v;
}

/** A cube net folds up into a cube and opens flat again; other nets are picked from the small pictures. */
function nets(lang: Lang): Scene {
  let pick = 0;
  let built = tree(NETS[0].cells, NETS[0].root);
  let fromK = 0;
  let toK = 0;
  let start = -9;
  let now = 0;
  let yaw = 0;
  let touched = false;
  let held: Pt | null = null;
  const U = 70;
  const CX = 320;
  const CY = 285;
  const PX = 815;
  const thumbs = NETS.map((_, i) => ({ x: 675 + (i % 3) * 96, y: 330 + Math.floor(i / 3) * 82, w: 86, h: 72 }));
  const foldK = () => lerp(fromK, toK, ease(now, start, 2.2));
  const choose = (i: number) => {
    pick = i;
    built = tree(NETS[i].cells, NETS[i].root);
    fromK = 0;
    toK = 1;
    start = now + 0.8;
  };
  return {
    press(id) {
      if (id === "fold") {
        fromK = foldK();
        toK = toK > 0.5 ? 0 : 1;
        start = now;
      }
      if (id === "next") choose((pick + 1) % NETS.length);
    },
    down(p) {
      const at = thumbs.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      if (at >= 0) {
        choose(at);
        return;
      }
      if (p.x < 640 && p.y < 530) {
        held = p;
        touched = true;
        return true;
      }
    },
    move(p) {
      if (!held) return;
      yaw += (p.x - held.x) * 0.012;
      held = p;
    },
    up() {
      held = null;
    },
    draw(g, t) {
      now = t;
      const k = foldK();
      const th = (k * Math.PI) / 2;
      const net = NETS[pick];
      const quads = net.cells.map((c, i) =>
        (
          [
            [c[0], c[1], 0],
            [c[0] + 1, c[1], 0],
            [c[0] + 1, c[1] + 1, 0],
            [c[0], c[1] + 1, 0],
          ] as V3[]
        ).map((v) => folded(v, i, built.parent, built.hinge, th)),
      );
      const all = quads.flat();
      const centre = [0, 1, 2].map((ax) => all.reduce((s, v) => s + v[ax], 0) / all.length);
      const al = 0.6 * k;
      const be = yaw + 0.55 * k;
      const view = (v: V3): V3 => {
        const x = v[0] - centre[0];
        const y = v[1] - centre[1];
        const z = v[2] - centre[2];
        const y1 = y * Math.cos(al) - z * Math.sin(al);
        const z1 = y * Math.sin(al) + z * Math.cos(al);
        return [x * Math.cos(be) + z1 * Math.sin(be), y1, -x * Math.sin(be) + z1 * Math.cos(be)];
      };
      const seen = quads.map((q, i) => {
        const vq = q.map(view);
        const depth = vq.reduce((s, v) => s + v[2], 0) / 4;
        const e1 = [vq[1][0] - vq[0][0], vq[1][1] - vq[0][1], vq[1][2] - vq[0][2]];
        const e2 = [vq[3][0] - vq[0][0], vq[3][1] - vq[0][1], vq[3][2] - vq[0][2]];
        const nz = e1[0] * e2[1] - e1[1] * e2[0];
        return { i, vq, depth, facing: Math.abs(nz) };
      });
      seen.sort((p, q) => p.depth - q.depth);

      g.c.fillStyle = "rgba(70, 50, 25, 0.1)";
      g.c.beginPath();
      g.c.ellipse(CX, 470, 220, 26, 0, 0, Math.PI * 2);
      g.c.fill();
      for (const f of seen) {
        const pts = f.vq.map((v) => ({ x: CX + v[0] * U, y: CY + v[1] * U }));
        poly(g, pts, shade(NET_COLOR[f.i], -0.25 + 0.45 * f.facing), C.ink, 2);
        if (f.facing > 0.45) {
          const m = { x: pts.reduce((s, p) => s + p.x, 0) / 4, y: pts.reduce((s, p) => s + p.y, 0) / 4 };
          g.dot(m.x, m.y, 15, C.paper);
          g.text(num(lang, f.i + 1), m.x, m.y, 20, C.ink, "center", true);
        }
      }
      if (!touched && k > 0.98) g.text(lang === "id" ? "seret untuk memutar" : "drag to turn it", CX, 528, 22, C.coral, "center", true);

      fit(g, lang === "id" ? "jaring-jaring kubus" : "a cube net", PX, 80, 300, 36, C.ink);
      fit(g, lang === "id" ? "6 persegi yang sama besar" : "6 equal squares", PX, 125, 300, 22, C.soft);
      const state =
        k > 0.98
          ? lang === "id"
            ? "sudah menjadi kubus"
            : "now it is a cube"
          : k < 0.02
            ? lang === "id"
              ? "masih terbuka"
              : "still open and flat"
            : lang === "id"
              ? "sedang dilipat..."
              : "folding...";
      fit(g, state, PX, 190, 300, 30, C.coral);
      fit(g, `${lang === "id" ? "jaring-jaring" : "net"} ${num(lang, pick + 1)} / ${num(lang, NETS.length)}`, PX, 240, 300, 22, C.soft);
      g.text(lang === "id" ? "pilih jaring-jaring lain:" : "pick another net:", PX, 305, 20, C.soft, "center", true);
      thumbs.forEach((r, i) => {
        const cells = NETS[i].cells;
        const cols = Math.max(...cells.map((c) => c[0])) + 1;
        const rows = Math.max(...cells.map((c) => c[1])) + 1;
        const cs = Math.min((r.w - 14) / cols, (r.h - 14) / rows);
        const x0 = r.x + (r.w - cs * cols) / 2;
        const y0 = r.y + (r.h - cs * rows) / 2;
        const hover = g.over(r.x, r.y, r.w, r.h);
        g.card(r.x, r.y - (hover ? 2 : 0), r.w, r.h, i === pick ? C.sun : C.paper, hover ? 1.4 : 1);
        cells.forEach((c) => poly(g, [
          { x: x0 + c[0] * cs, y: y0 + c[1] * cs - (hover ? 2 : 0) },
          { x: x0 + (c[0] + 1) * cs, y: y0 + c[1] * cs - (hover ? 2 : 0) },
          { x: x0 + (c[0] + 1) * cs, y: y0 + (c[1] + 1) * cs - (hover ? 2 : 0) },
          { x: x0 + c[0] * cs, y: y0 + (c[1] + 1) * cs - (hover ? 2 : 0) },
        ], i === pick ? C.paper : C.field, C.ink, 1));
      });

      const id = lang === "id";
      g.button("fold", toK > 0.5 ? (id ? "BUKA" : "UNFOLD") : id ? "LIPAT" : "FOLD", 40, 555, 240, 52, C.coral);
      g.button("next", id ? "JARING-JARING LAIN" : "ANOTHER NET", 300, 555, 320, 52, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A cuboid has faces, edges and vertices. Light up one kind at a time and count them: 6 faces, 12 edges, 8 vertices.",
        id: "Balok punya sisi, rusuk, dan titik sudut. Nyalakan satu per satu, lalu hitung: 6 sisi, 12 rusuk, 8 titik sudut.",
      },
      scene: parts,
    },
    {
      say: {
        en: "Drag to turn the solid and look at it from every side. A cube is a cuboid whose edges are all equal.",
        id: "Seret untuk memutar bangun ruang dan lihat dari segala arah. Kubus adalah balok yang semua rusuknya sama panjang.",
      },
      scene: turn,
    },
    {
      say: {
        en: "A net is a solid cut open and laid flat. Fold the six squares and they close into a cube; a cube has many different nets.",
        id: "Jaring-jaring adalah bangun ruang yang dibuka dan dibentangkan. Lipat keenam perseginya hingga menjadi kubus; jaring-jaring kubus ada banyak macam.",
      },
      scene: nets,
    },
  ],
};
