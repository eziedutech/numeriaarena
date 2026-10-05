import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, pulse } from "../ink";
import { num } from "../parts";

type P2 = [number, number];

/** The grid on the left of the sheet: its origin, one unit in pixels, and how far each axis runs. */
const OX = 300;
const OY = 285;
const U = 26;
const XM = 8;
const YM = 7;
/** The middle of the column on the right. */
const PX = 770;

const toS = (x: number, y: number): Pt => ({ x: OX + x * U, y: OY - y * U });
const fromS = (p: Pt): P2 => [(p.x - OX) / U, (OY - p.y) / U];

/** A whole number with a true minus sign: −3. */
const sg = (lang: Lang, n: number) => (n < 0 ? `−${num(lang, -n)}` : num(lang, n));
const pair = (lang: Lang, p: P2) => `(${sg(lang, p[0])}, ${sg(lang, p[1])})`;
const ROMAN = ["", "I", "II", "III", "IV"];
const quadrant = (p: P2) => (p[0] > 0 && p[1] > 0 ? 1 : p[0] < 0 && p[1] > 0 ? 2 : p[0] < 0 && p[1] < 0 ? 3 : p[0] > 0 && p[1] < 0 ? 4 : 0);
const TINT = ["", "63, 182, 160", "52, 105, 196", "155, 107, 196", "255, 209, 102"];

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

function arrow(g: Ink, a: Pt, b: Pt, color: string, width = 4) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 2) return;
  const head = Math.min(16, len * 0.5);
  g.c.lineCap = "round";
  g.line(a.x, a.y, b.x - Math.cos(ang) * head * 0.6, b.y - Math.sin(ang) * head * 0.6, color, width);
  g.c.lineCap = "butt";
  const c = g.c;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(b.x, b.y);
  c.lineTo(b.x - head * Math.cos(ang - 0.45), b.y - head * Math.sin(ang - 0.45));
  c.lineTo(b.x - head * Math.cos(ang + 0.45), b.y - head * Math.sin(ang + 0.45));
  c.closePath();
  c.fill();
}

function dashed(g: Ink, a: Pt, b: Pt, color: string, width = 2) {
  g.c.setLineDash([7, 6]);
  g.line(a.x, a.y, b.x, b.y, color, width);
  g.c.setLineDash([]);
}

/** The four-quadrant grid: tinted quarters (one brighter), creases every unit, axes with numbers. */
function plane(g: Ink, lang: Lang, bright = 0) {
  const quarters: [number, number, number][] = [
    [1, 0, -YM],
    [2, -XM, -YM],
    [3, -XM, 0],
    [4, 0, 0],
  ];
  for (const [q, x, y] of quarters) {
    const p = toS(x, -y);
    g.c.fillStyle = `rgba(${TINT[q]}, ${q === bright ? 0.28 : 0.08})`;
    g.c.fillRect(p.x, p.y, XM * U, YM * U);
  }
  for (let i = -XM; i <= XM; i++) g.line(toS(i, -YM).x, toS(i, -YM).y, toS(i, YM).x, toS(i, YM).y, "rgba(58, 63, 75, 0.1)", 1);
  for (let j = -YM; j <= YM; j++) g.line(toS(-XM, j).x, toS(-XM, j).y, toS(XM, j).x, toS(XM, j).y, "rgba(58, 63, 75, 0.1)", 1);
  arrow(g, toS(-XM - 0.5, 0), toS(XM + 0.7, 0), C.ink, 3);
  arrow(g, toS(0, -YM - 0.5), toS(0, YM + 0.7), C.ink, 3);
  g.text("x", toS(XM + 0.7, 0).x + 4, OY - 18, 22, C.ink, "left", true);
  g.text("y", OX + 16, toS(0, YM + 0.7).y + 4, 22, C.ink, "left", true);
  for (let i = -XM + 2; i <= XM - 2; i += 2) if (i) g.text(sg(lang, i), toS(i, 0).x, OY + 16, 18, C.soft, "center", true);
  for (let j = -YM + 1; j <= YM - 1; j += 2) if (j) g.text(sg(lang, j), OX - 8, toS(0, j).y, 18, C.soft, "right", true);
  g.text("0", OX - 8, OY + 14, 18, C.soft, "right", true);
  for (let q = 1; q <= 4; q++) {
    const p = toS(q === 1 || q === 4 ? 6 : -6, q <= 2 ? 6 : -6);
    g.c.globalAlpha = q === bright ? 1 : 0.55;
    g.text(ROMAN[q], p.x, p.y - 8, 26, C.ink, "center", true);
    g.text(["", "(+, +)", "(−, +)", "(−, −)", "(+, −)"][q], p.x, p.y + 18, 18, C.soft, "center", true);
    g.c.globalAlpha = 1;
  }
}

/** A shape on the grid with its corners lettered; `prime` adds the ' of an image. */
function figure(g: Ink, pts: P2[], names: string[], color: string, alpha: number, prime = false) {
  if (pts.length < 3) return;
  const S = pts.map((p) => toS(p[0], p[1]));
  const c = g.c;
  c.globalAlpha = alpha;
  c.beginPath();
  S.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fillStyle = color;
  c.globalAlpha = alpha * 0.45;
  c.fill();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.lineJoin = "round";
  c.stroke();
  const mx = S.reduce((s, p) => s + p.x, 0) / S.length;
  const my = S.reduce((s, p) => s + p.y, 0) / S.length;
  S.forEach((p, i) => {
    g.dot(p.x, p.y, 5, C.ink);
    const dx = p.x - mx;
    const dy = p.y - my;
    const l = Math.hypot(dx, dy) || 1;
    g.text(names[i] + (prime ? "'" : ""), p.x + (dx / l) * 18, p.y + (dy / l) * 18, 20, C.ink, "center", true);
  });
  c.globalAlpha = 1;
}

/** The corners before and after, one row each. */
function corners(g: Ink, lang: Lang, names: string[], before: P2[], after: P2[] | null, y0: number) {
  const id = lang === "id";
  g.text(id ? "sebelum" : "before", PX - 95, y0, 20, C.soft, "center", true);
  if (after) g.text(id ? "sesudah" : "after", PX + 105, y0, 20, C.soft, "center", true);
  before.forEach((p, i) => {
    const y = y0 + 38 + i * 38;
    fit(g, `${names[i]}${pair(lang, p)}`, PX - 95, y, 165, 24, C.cobalt);
    if (after) {
      g.text("→", PX + 8, y, 24, C.soft, "center", true);
      fit(g, `${names[i]}'${pair(lang, after[i])}`, PX + 105, y, 165, 24, C.coral);
    }
  });
}

const inside = (p: Pt, pts: P2[]) => {
  const S = pts.map((q) => toS(q[0], q[1]));
  let hit = false;
  for (let i = 0, j = S.length - 1; i < S.length; j = i++) {
    if (S[i].y > p.y !== S[j].y > p.y && p.x < ((S[j].x - S[i].x) * (p.y - S[i].y)) / (S[j].y - S[i].y) + S[i].x) hit = !hit;
  }
  return hit || S.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 22);
};

/** A shape dragged across the grid in whole units, kept where it and its images fit. */
function mover(base: P2[], lim = YM) {
  let off: P2 = [0, 0];
  let grab: { at: P2; from: P2 } | null = null;
  const pts = () => base.map((p) => [p[0] + off[0], p[1] + off[1]] as P2);
  return {
    pts,
    get held() {
      return grab !== null;
    },
    down(p: Pt) {
      if (p.y > 500 || !inside(p, pts())) return false;
      grab = { at: fromS(p), from: off };
      return true;
    },
    move(p: Pt) {
      if (!grab) return;
      const q = fromS(p);
      const xs = base.map((b) => b[0]);
      const ys = base.map((b) => b[1]);
      off = [
        clamp(Math.round(grab.from[0] + q[0] - grab.at[0]), -lim - Math.min(...xs), lim - Math.max(...xs)),
        clamp(Math.round(grab.from[1] + q[1] - grab.at[1]), -lim - Math.min(...ys), lim - Math.max(...ys)),
      ];
    },
    up() {
      grab = null;
    },
  };
}

/** A point dragged anywhere on the four-quadrant grid; its pair, its walk from 0 and its quadrant are named. */
function quadrants(lang: Lang): Scene {
  let P: P2 = [3, 2];
  let shown: P2 = [3, 2];
  let held = false;
  let walked = 0.4;
  let now = 0;
  let last = 0;
  return {
    down(p) {
      const s = toS(shown[0], shown[1]);
      if (Math.hypot(p.x - s.x, p.y - s.y) < 40) {
        held = true;
        return true;
      }
    },
    move(p) {
      const q = fromS(p);
      const next: P2 = [clamp(Math.round(q[0]), -XM, XM), clamp(Math.round(q[1]), -YM, YM)];
      if (next[0] !== P[0] || next[1] !== P[1]) walked = now + 0.3;
      P = next;
    },
    up() {
      held = false;
    },
    press(id) {
      const q = Number(id.slice(1));
      const ax = Math.abs(P[0]) || 3;
      const ay = Math.abs(P[1]) || 2;
      P = [q === 1 || q === 4 ? ax : -ax, q <= 2 ? ay : -ay];
      walked = now + 0.4;
    },
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      const k = 1 - Math.exp(-dt * 12);
      shown = [shown[0] + (P[0] - shown[0]) * k, shown[1] + (P[1] - shown[1]) * k];
      const q = quadrant(P);
      plane(g, lang, q);
      // The walk from 0: along the x axis first, then up or down.
      const kx = ease(t, walked, 0.5);
      const ky = ease(t, walked + 0.5, 0.5);
      const o = toS(0, 0);
      const ex = toS(P[0] * kx, 0);
      g.c.lineCap = "round";
      if (P[0]) g.line(o.x, o.y, ex.x, ex.y, C.cobalt, 6);
      if (P[1] && ky > 0) g.line(toS(P[0], 0).x, toS(P[0], 0).y, toS(P[0], P[1] * ky).x, toS(P[0], P[1] * ky).y, C.teal, 6);
      g.c.lineCap = "butt";
      const s = toS(shown[0], shown[1]);
      dashed(g, s, toS(shown[0], 0), "rgba(58, 63, 75, 0.45)");
      dashed(g, s, toS(0, shown[1]), "rgba(58, 63, 75, 0.45)");
      g.handle(s.x, s.y, held);
      g.text("P", s.x + 22, s.y - 24, 24, C.coral, "center", true);
      if (t < 6 && !held) g.text(lang === "id" ? "geser titik P" : "drag point P", OX, 500, 22, C.coral, "center", true);

      const id = lang === "id";
      g.text(id ? "titik P" : "point P", PX, 85, 24, C.soft, "center", true);
      fit(g, pair(lang, P), PX, 140, 370, 56, C.coral);
      const xs = P[0] === 0 ? (id ? "x = 0: tidak ke kiri atau ke kanan" : "x = 0: not left or right") : `x = ${sg(lang, P[0])}: ${num(lang, Math.abs(P[0]))} ${id ? `langkah ke ${P[0] > 0 ? "kanan" : "kiri"}` : `step${Math.abs(P[0]) === 1 ? "" : "s"} ${P[0] > 0 ? "right" : "left"}`}`;
      const ys = P[1] === 0 ? (id ? "y = 0: tidak ke atas atau ke bawah" : "y = 0: not up or down") : `y = ${sg(lang, P[1])}: ${num(lang, Math.abs(P[1]))} ${id ? `langkah ke ${P[1] > 0 ? "atas" : "bawah"}` : `step${Math.abs(P[1]) === 1 ? "" : "s"} ${P[1] > 0 ? "up" : "down"}`}`;
      fit(g, xs, PX, 205, 370, 24, C.cobalt);
      fit(g, ys, PX, 245, 370, 24, "#2f9a86");
      g.card(PX - 170, 290, 340, 70, C.sun, 1);
      const where = q
        ? `${id ? "kuadran" : "quadrant"} ${ROMAN[q]}`
        : P[0] === 0 && P[1] === 0
          ? id ? "titik asal" : "the origin"
          : P[1] === 0
            ? id ? "pada sumbu x" : "on the x axis"
            : id ? "pada sumbu y" : "on the y axis";
      fit(g, where, PX, 325, 320, 36);
      const sign = (n: number) => (id ? (n > 0 ? "positif" : n < 0 ? "negatif" : "nol") : n > 0 ? "positive" : n < 0 ? "negative" : "zero");
      fit(g, `x ${sign(P[0])}, y ${sign(P[1])}`, PX, 395, 370, 24, C.soft);
      g.c.globalAlpha = 0.6 + 0.4 * pulse(t, 2);
      fit(g, id ? "(x, y): ke kanan atau kiri dulu, lalu ke atas atau bawah" : "(x, y): first right or left, then up or down", PX, 445, 380, 20, C.soft);
      g.c.globalAlpha = 1;

      for (let i = 1; i <= 4; i++) g.button(`q${i}`, `${id ? "KUADRAN" : "QUADRANT"} ${ROMAN[i]}`, 52 + (i - 1) * 227, 555, 215, 52, i === q ? C.coral : C.cobalt);
    },
  };
}

const TRI_NAMES = ["A", "B", "C"];

/** A shape slides along an arrow you set: every corner moves the same steps right or left, up or down. */
function translation(lang: Lang): Scene {
  const base: P2[] = [
    [-6, -3],
    [-3, -3],
    [-6, 0],
  ];
  let v: P2 = [6, 4];
  let held = false;
  let slideAt = -1;
  let now = 0;
  const tip = () => toS(base[0][0] + v[0], base[0][1] + v[1]);
  return {
    down(p) {
      const s = tip();
      if (Math.hypot(p.x - s.x, p.y - s.y) < 40) {
        held = true;
        return true;
      }
    },
    move(p) {
      const q = fromS(p);
      const xs = base.map((b) => b[0]);
      const ys = base.map((b) => b[1]);
      const next: P2 = [
        clamp(Math.round(q[0] - base[0][0]), -XM - Math.min(...xs), XM - Math.max(...xs)),
        clamp(Math.round(q[1] - base[0][1]), -YM - Math.min(...ys), YM - Math.max(...ys)),
      ];
      if (next[0] !== v[0] || next[1] !== v[1]) slideAt = -1;
      v = next;
    },
    up() {
      held = false;
    },
    press(id) {
      if (id === "slide") slideAt = now + 0.1;
      if (id === "reset") slideAt = -1;
    },
    draw(g, t) {
      now = t;
      plane(g, lang);
      const k = slideAt < 0 ? 0 : ease(t, slideAt, 1.4);
      const image = base.map((p) => [p[0] + v[0], p[1] + v[1]] as P2);
      figure(g, base, TRI_NAMES, C.cobalt, slideAt < 0 ? 1 : 0.5);
      if (k >= 1) base.forEach((p, i) => dashed(g, toS(p[0], p[1]), toS(image[i][0], image[i][1]), "rgba(242, 113, 107, 0.6)"));
      if (slideAt >= 0 && t >= slideAt)
        figure(
          g,
          base.map((p) => [p[0] + v[0] * k, p[1] + v[1] * k] as P2),
          TRI_NAMES,
          C.coral,
          1,
          k >= 1,
        );
      const a = toS(base[0][0], base[0][1]);
      arrow(g, a, tip(), C.plum, 5);
      g.handle(tip().x, tip().y, held);
      if (t < 6 && !held && slideAt < 0) g.text(lang === "id" ? "geser ujung panah" : "drag the arrow's tip", OX, 500, 22, C.coral, "center", true);

      const id = lang === "id";
      g.text(id ? "pergeseran (translasi)" : "translation", PX, 80, 26, C.soft, "center", true);
      const steps = (n: number, pos: string, neg: string) => `${num(lang, Math.abs(n))} ${n >= 0 ? pos : neg}`;
      fit(
        g,
        id ? `${steps(v[0], "ke kanan", "ke kiri")}, ${steps(v[1], "ke atas", "ke bawah")}` : `${steps(v[0], "right", "left")}, ${steps(v[1], "up", "down")}`,
        PX,
        125,
        380,
        28,
        C.plum,
      );
      const plus = (n: number) => (n < 0 ? `− ${num(lang, -n)}` : `+ ${num(lang, n)}`);
      fit(g, `(x, y) → (x ${plus(v[0])}, y ${plus(v[1])})`, PX, 172, 380, 28, C.ink);
      corners(g, lang, TRI_NAMES, base, k >= 1 ? image : null, 230);
      if (k >= 1) fit(g, id ? "bentuk dan ukurannya tetap sama" : "same shape, same size", PX, 400, 380, 22, C.soft);

      g.button("slide", id ? "GESER" : "SLIDE", 300, 555, 220, 52, C.coral);
      g.button("reset", id ? "ULANG" : "BACK", 540, 555, 180, 52, C.cobalt, slideAt >= 0);
    },
  };
}

/** A shape folds over the x axis or the y axis like paper and lands as its mirror image. */
function reflection(lang: Lang): Scene {
  const shape = mover([
    [2, 1],
    [6, 2],
    [3, 5],
  ]);
  let axis: "x" | "y" | null = null;
  let at = 0;
  let now = 0;
  return {
    down(p) {
      if (shape.down(p)) {
        axis = null;
        return true;
      }
      return false;
    },
    move: (p) => shape.move(p),
    up: () => shape.up(),
    press(id) {
      if (id === "x" || id === "y") {
        axis = id;
        at = now + 0.1;
      }
      if (id === "reset") axis = null;
    },
    draw(g, t) {
      now = t;
      plane(g, lang);
      const pts = shape.pts();
      const k = axis ? ease(t, at, 1.4) : 0;
      if (axis) {
        const glow = 0.5 + 0.5 * pulse(t, 1.4);
        g.c.globalAlpha = glow;
        if (axis === "x") g.line(toS(-XM, 0).x, OY, toS(XM, 0).x, OY, C.coral, 6);
        else g.line(OX, toS(0, YM).y, OX, toS(0, -YM).y, C.coral, 6);
        g.c.globalAlpha = 1;
      }
      const mirror = (p: P2): P2 => (axis === "x" ? [p[0], -p[1]] : [-p[0], p[1]]);
      figure(g, pts, TRI_NAMES, C.cobalt, axis ? 0.55 : 1);
      if (axis && t >= at) {
        const c = Math.cos(Math.PI * k);
        const moving = pts.map((p) => (axis === "x" ? [p[0], p[1] * c] : [p[0] * c, p[1]]) as P2);
        figure(g, moving, TRI_NAMES, k > 0.5 ? C.coral : C.cobalt, 1, k >= 1);
        if (k >= 1) pts.forEach((p, i) => dashed(g, toS(p[0], p[1]), toS(mirror(p)[0], mirror(p)[1]), "rgba(242, 113, 107, 0.5)"));
      }
      if (t < 6 && !shape.held && !axis) g.text(lang === "id" ? "bangunnya bisa digeser" : "you can drag the shape", OX, 500, 22, C.coral, "center", true);

      const id = lang === "id";
      g.text(id ? "pencerminan (refleksi)" : "reflection", PX, 80, 26, C.soft, "center", true);
      if (axis) {
        fit(g, id ? `cermin: sumbu ${axis}` : `mirror: the ${axis} axis`, PX, 122, 380, 28, C.coral);
        fit(g, axis === "x" ? "(x, y) → (x, −y)" : "(x, y) → (−x, y)", PX, 168, 380, 30, C.ink);
      } else fit(g, id ? "pilih cerminnya" : "pick a mirror", PX, 140, 380, 26, C.soft);
      corners(g, lang, TRI_NAMES, pts, k >= 1 ? pts.map(mirror) : null, 225);
      if (k >= 1)
        fit(
          g,
          axis === "x" ? (id ? "x tetap, tanda y berganti" : "x stays, y changes sign") : id ? "y tetap, tanda x berganti" : "y stays, x changes sign",
          PX,
          395,
          380,
          22,
          C.soft,
        );
      if (k >= 1) fit(g, id ? "jarak ke cermin tetap sama" : "each corner is as far from the mirror", PX, 430, 380, 22, C.soft);

      g.button("x", id ? "CERMIN SUMBU X" : "REFLECT IN X AXIS", 40, 555, 300, 52, axis === "x" ? C.coral : C.cobalt);
      g.button("y", id ? "CERMIN SUMBU Y" : "REFLECT IN Y AXIS", 355, 555, 300, 52, axis === "y" ? C.coral : C.cobalt);
      g.button("reset", id ? "ULANG" : "BACK", 700, 555, 220, 52, C.teal, axis !== null);
    },
  };
}

/** A shape turns around the origin by 90 or 180 degrees against the clock, its corners swept along arcs. */
function rotation(lang: Lang): Scene {
  const shape = mover([
    [2, 1],
    [6, 1],
    [2, 4],
  ]);
  let turn = 0;
  let at = 0;
  let now = 0;
  return {
    down(p) {
      if (shape.down(p)) {
        turn = 0;
        return true;
      }
      return false;
    },
    move: (p) => shape.move(p),
    up: () => shape.up(),
    press(id) {
      if (id === "r90") turn = 90;
      if (id === "r180") turn = 180;
      if (id === "reset") turn = 0;
      at = now + 0.1;
    },
    draw(g, t) {
      now = t;
      plane(g, lang);
      const pts = shape.pts();
      const k = turn ? ease(t, at, 1.6) : 0;
      const ang = ((turn * Math.PI) / 180) * k;
      const spin = (p: P2, a: number): P2 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
      const exact = (p: P2): P2 => (turn === 90 ? [-p[1], p[0]] : [-p[0], -p[1]]);
      figure(g, pts, TRI_NAMES, C.cobalt, turn ? 0.55 : 1);
      if (turn && t >= at) {
        // Arcs swept by each corner around the origin.
        pts.forEach((p) => {
          const r = Math.hypot(p[0], p[1]) * U;
          const a0 = Math.atan2(p[1], p[0]);
          g.c.strokeStyle = "rgba(155, 107, 196, 0.6)";
          g.c.lineWidth = 2.5;
          g.c.setLineDash([7, 6]);
          g.c.beginPath();
          g.c.arc(OX, OY, r, -a0, -a0 - ang, true);
          g.c.stroke();
          g.c.setLineDash([]);
        });
        const lead = spin(pts[0], ang);
        g.line(OX, OY, toS(pts[0][0], pts[0][1]).x, toS(pts[0][0], pts[0][1]).y, "rgba(155, 107, 196, 0.6)", 2.5);
        g.line(OX, OY, toS(lead[0], lead[1]).x, toS(lead[0], lead[1]).y, C.plum, 3);
        figure(
          g,
          pts.map((p) => (k >= 1 ? exact(p) : spin(p, ang))),
          TRI_NAMES,
          C.coral,
          1,
          k >= 1,
        );
      }
      g.dot(OX, OY, 8, C.plum);
      g.dot(OX, OY, 3, C.paper);
      if (t < 6 && !shape.held && !turn) g.text(lang === "id" ? "bangunnya bisa digeser" : "you can drag the shape", OX, 500, 22, C.coral, "center", true);

      const id = lang === "id";
      g.text(id ? "perputaran (rotasi)" : "rotation", PX, 80, 26, C.soft, "center", true);
      fit(g, id ? "pusat O(0, 0), berlawanan arah jarum jam" : "about O(0, 0), against the clock", PX, 118, 380, 22, C.soft);
      if (turn) {
        fit(g, `${num(lang, Math.round(turn * k))}°`, PX, 160, 380, 36, C.plum);
        fit(g, turn === 90 ? "(x, y) → (−y, x)" : "(x, y) → (−x, −y)", PX, 205, 380, 30, C.ink);
      } else fit(g, id ? "pilih besar putarannya" : "pick how far to turn", PX, 180, 380, 26, C.soft);
      corners(g, lang, TRI_NAMES, pts, k >= 1 ? pts.map(exact) : null, 250);
      if (k >= 1) fit(g, id ? "bentuk dan ukurannya tetap sama" : "same shape, same size", PX, 425, 380, 22, C.soft);

      g.button("r90", id ? "PUTAR 90°" : "TURN 90°", 120, 555, 230, 52, turn === 90 ? C.coral : C.cobalt);
      g.button("r180", id ? "PUTAR 180°" : "TURN 180°", 370, 555, 230, 52, turn === 180 ? C.coral : C.cobalt);
      g.button("reset", id ? "ULANG" : "BACK", 620, 555, 220, 52, C.teal, turn !== 0);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "The two axes cut the plane into four quadrants. Drag point P: the first number walks right or left, the second up or down.",
        id: "Kedua sumbu membagi bidang menjadi empat kuadran. Geser titik P: bilangan pertama melangkah ke kanan atau kiri, bilangan kedua ke atas atau bawah.",
      },
      scene: quadrants,
    },
    {
      say: {
        en: "In a translation every corner slides the same way. Set the arrow, then slide the shape.",
        id: "Pada pergeseran (translasi), setiap titik sudut bergeser sama jauh dan searah. Atur panahnya, lalu geser bangunnya.",
      },
      scene: translation,
    },
    {
      say: {
        en: "In a reflection the shape flips over a mirror line. Choose the x axis or the y axis and watch which number changes sign.",
        id: "Pada pencerminan (refleksi), bangun dibalik terhadap garis cermin. Pilih sumbu x atau sumbu y, lalu lihat tanda bilangan mana yang berubah.",
      },
      scene: reflection,
    },
    {
      say: {
        en: "In a rotation the shape turns around the origin. Turn it by 90 or 180 degrees and compare the corners.",
        id: "Pada perputaran (rotasi), bangun berputar mengelilingi titik asal. Putar 90° atau 180°, lalu bandingkan titik sudutnya.",
      },
      scene: rotation,
    },
  ],
};
