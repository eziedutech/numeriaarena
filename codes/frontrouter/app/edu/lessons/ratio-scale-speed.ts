import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp } from "../ink";
import { dec, num, sum, wrap } from "../parts";

/** A decimal with at most `digits` places and no trailing zeros: 1,5 and 3,75. */
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

type Icon = "cup" | "round";
interface Recipe {
  name: { en: string; id: string };
  a: number;
  b: number;
  A: { en: string; id: string; icon: Icon; color: string };
  B: { en: string; id: string; icon: Icon; color: string };
}

const RECIPES: Recipe[] = [
  {
    name: { en: "Pancakes", id: "Panekuk" },
    a: 3,
    b: 2,
    A: { en: "cups of flour", id: "gelas tepung", icon: "cup", color: C.sand },
    B: { en: "cups of milk", id: "gelas susu", icon: "cup", color: "#f4efe4" },
  },
  {
    name: { en: "Lemonade", id: "Es jeruk" },
    a: 1,
    b: 4,
    A: { en: "lemons", id: "jeruk nipis", icon: "round", color: C.sun },
    B: { en: "glasses of water", id: "gelas air", icon: "cup", color: "#a9c4ee" },
  },
  {
    name: { en: "Sponge cake", id: "Kue bolu" },
    a: 2,
    b: 3,
    A: { en: "eggs", id: "butir telur", icon: "round", color: "#fff6e0" },
    B: { en: "spoons of sugar", id: "sendok gula", icon: "cup", color: "#f7c6c3" },
  },
];

/** One ingredient drawn small: a cup or something round. */
function icon(g: Ink, kind: Icon, x: number, y: number, color: string) {
  if (kind === "round") {
    g.dot(x + 2, y + 4, 16, "rgba(70, 50, 25, 0.22)");
    g.dot(x, y, 16, color);
    g.dot(x - 5, y - 6, 4, "rgba(255, 255, 255, 0.7)");
    return;
  }
  const c = g.c;
  c.fillStyle = "rgba(70, 50, 25, 0.22)";
  c.beginPath();
  c.moveTo(x - 14, y - 16);
  c.lineTo(x + 18, y - 16);
  c.lineTo(x + 13, y + 24);
  c.lineTo(x - 7, y + 24);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x - 16, y - 20);
  c.lineTo(x + 16, y - 20);
  c.lineTo(x + 11, y + 20);
  c.lineTo(x - 11, y + 20);
  c.closePath();
  c.fill();
  c.strokeStyle = C.ink;
  c.lineWidth = 2;
  c.stroke();
}

/** Ingredient cards in equal portions: more portions, bigger numbers, the same simplest ratio. */
function recipe(lang: Lang): Scene {
  let r = 0;
  let k = 2;
  const added = [0, 0, 0, 0];
  let now = 0;
  const gx = (i: number) => 170 + i * 195;
  return {
    press(id) {
      if (id === "more" && k < 4) {
        added[k] = now;
        k += 1;
      }
      if (id === "fewer" && k > 1) k -= 1;
      if (id === "other") {
        r = (r + 1) % RECIPES.length;
        k = 2;
        added.fill(now);
      }
    },
    draw(g, t) {
      now = t;
      const R = RECIPES[r];
      const A = R.A[lang];
      const B = R.B[lang];
      const [aK, bK] = [R.a * k, R.b * k];
      const head: string[] = [num(lang, aK), ":", num(lang, bK)];
      if (k > 1) head.push("=", num(lang, R.a), ":", num(lang, R.b));
      sum(g, head, W / 2, 55, 56, [C.cobalt, C.ink, C.coral, C.ink, C.cobalt, C.ink, C.coral]);
      fit(g, `${R.name[lang]}: ${aK} ${A} ${lang === "id" ? "untuk" : "for"} ${bK} ${B}`, W / 2, 112, 24, 900, C.soft);
      // Row names, then one card for each portion.
      wrap(g, A, 120, 20).forEach((l, i, all) => g.text(l, 95, 205 + (i - (all.length - 1) / 2) * 24, 20, C.cobalt, "center", true));
      wrap(g, B, 120, 20).forEach((l, i, all) => g.text(l, 95, 305 + (i - (all.length - 1) / 2) * 24, 20, C.coral, "center", true));
      for (let i = 0; i < k; i++) {
        const drop = ease(t, added[i], 0.5);
        const x = gx(i);
        const y = 145 - (1 - drop) * 40;
        g.c.globalAlpha = drop;
        g.card(x, y, 180, 215, i % 2 ? "#f8efdc" : C.paper, 1);
        g.crease(x + 10, y + 108, x + 170, y + 108);
        const row = (count: number, cy: number, it: Recipe["A"]) => {
          const w = 40;
          const x0 = x + 90 - ((count - 1) * w) / 2;
          for (let j = 0; j < count; j++) icon(g, it.icon, x0 + j * w, cy, it.color);
        };
        row(R.a, y + 58, R.A);
        row(R.b, y + 162, R.B);
        g.c.globalAlpha = 1;
      }
      const note =
        k > 1
          ? lang === "id"
            ? `Bagi keduanya dengan ${k}: ${aK} : ${bK} = ${R.a} : ${R.b}`
            : `Divide both by ${k}: ${aK} : ${bK} = ${R.a} : ${R.b}`
          : lang === "id"
            ? `Ini bentuk paling sederhana: ${R.a} : ${R.b}`
            : `This is the simplest form: ${R.a} : ${R.b}`;
      fit(g, note, W / 2, 410, 30, 900, C.ink);
      fit(
        g,
        lang === "id" ? `Setiap ${R.a} ${A}, pakai ${R.b} ${B}.` : `For every ${R.a} ${A}, use ${R.b} ${B}.`,
        W / 2,
        462,
        24,
        900,
        C.soft,
      );
      g.button("fewer", lang === "id" ? "KURANGI" : "FEWER", 60, 555, 200, 52, C.coral, k > 1);
      g.button("more", lang === "id" ? "TAMBAH" : "MORE", 280, 555, 200, 52, C.teal, k < 4);
      g.button("other", lang === "id" ? "RESEP LAIN" : "OTHER RECIPE", 680, 555, 260, 52, C.cobalt);
    },
  };
}

/** A classroom plan at 1 : 50: drag a tape across it and every centimetre on paper is half a metre in the room. */
function plan(lang: Lang): Scene {
  const PX = 60;
  const PY = 95;
  const S = 25;
  let a: Pt = { x: 0, y: 12 };
  let b: Pt = { x: 16, y: 12 };
  let from: [Pt, Pt] | null = null;
  let moved = -10;
  let held = false;
  let now = 0;
  const snap = (p: Pt): Pt => ({
    x: clamp(Math.round(((p.x - PX) / S) * 2) / 2, 0, 16),
    y: clamp(Math.round(((p.y - PY) / S) * 2) / 2, 0, 12),
  });
  const presets: Record<string, [Pt, Pt]> = {
    len: [
      { x: 0, y: 12 },
      { x: 16, y: 12 },
    ],
    wid: [
      { x: 16, y: 0 },
      { x: 16, y: 12 },
    ],
    desk: [
      { x: 11, y: 1.5 },
      { x: 14, y: 1.5 },
    ],
  };
  const sx = (v: number) => PX + v * S;
  const sy = (v: number) => PY + v * S;
  return {
    press(id) {
      const p = presets[id];
      if (!p) return;
      from = [a, b];
      a = p[0];
      b = p[1];
      moved = now;
    },
    down(p) {
      if (p.x < PX - 12 || p.x > PX + 16 * S + 12 || p.y < PY - 12 || p.y > PY + 12 * S + 12) return;
      a = snap(p);
      b = a;
      from = null;
      held = true;
      return true;
    },
    move(p) {
      b = snap(p);
    },
    up() {
      held = false;
    },
    draw(g, t) {
      now = t;
      g.text(lang === "id" ? "denah ruang kelas" : "classroom plan", PX, 60, 26, C.ink, "left", true);
      g.card(PX, PY, 16 * S, 12 * S, C.paper, 1);
      for (let i = 1; i < 16; i++) g.line(sx(i), PY, sx(i), PY + 12 * S, "rgba(52, 105, 196, 0.12)", 1);
      for (let j = 1; j < 12; j++) g.line(PX, sy(j), PX + 16 * S, sy(j), "rgba(52, 105, 196, 0.12)", 1);
      // Furniture: the whiteboard, the teacher's desk, twelve pupils' desks.
      g.card(sx(4), sy(0), 8 * S, 0.4 * S, C.soft, 0);
      g.text(lang === "id" ? "papan tulis" : "whiteboard", sx(8), sy(0.4) + 14, 18, C.soft, "center", true);
      g.card(sx(11), sy(1.5), 3 * S, 1.5 * S, C.sand, 0.6);
      g.text(lang === "id" ? "guru" : "teacher", sx(12.5), sy(2.25), 18, C.ink, "center", true);
      for (const x of [2, 5.5, 9, 12.5]) for (const y of [5, 7.2, 9.4]) g.card(sx(x), sy(y), 2 * S, 1 * S, "#d9e5f7", 0.5);
      // Walls, with the door left open on the right.
      g.line(PX, PY, PX + 16 * S, PY, C.ink, 5);
      g.line(PX, PY, PX, PY + 12 * S, C.ink, 5);
      g.line(PX, PY + 12 * S, PX + 16 * S, PY + 12 * S, C.ink, 5);
      g.line(sx(16), PY, sx(16), sy(9), C.ink, 5);
      g.line(sx(16), sy(11), sx(16), sy(12), C.ink, 5);
      g.c.strokeStyle = C.soft;
      g.c.lineWidth = 2;
      g.c.beginPath();
      g.c.arc(sx(16), sy(11), 2 * S, Math.PI, Math.PI * 1.5);
      g.c.stroke();
      g.line(sx(16), sy(11), sx(14), sy(11), C.soft, 3);
      g.text(lang === "id" ? "pintu" : "door", sx(16) - 10, sy(9.6), 18, C.soft, "right", true);

      // The tape, sliding to a chosen length when one is pressed.
      const k = from ? ease(t, moved, 0.6) : 1;
      const pa = from ? { x: lerp(from[0].x, a.x, k), y: lerp(from[0].y, a.y, k) } : a;
      const pb = from ? { x: lerp(from[1].x, b.x, k), y: lerp(from[1].y, b.y, k) } : b;
      const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 10) / 10;
      g.line(sx(pa.x), sy(pa.y), sx(pb.x), sy(pb.y), C.coral, 5);
      g.dot(sx(pa.x), sy(pa.y), 8, C.coral);
      g.dot(sx(pb.x), sy(pb.y), 8, C.coral);
      if (len > 0) {
        const mx = (sx(pa.x) + sx(pb.x)) / 2;
        const my = (sy(pa.y) + sy(pb.y)) / 2;
        const label = `${trim(lang, len, 1)} cm`;
        const w = g.width(label, 22, true) + 20;
        g.card(mx - w / 2, my - 18, w, 36, C.coral, 1);
        g.text(label, mx, my, 22, C.paper, "center", true);
      }
      // A bar showing what 2 cm on the plan stands for.
      g.line(PX, 428, PX + 2 * S, 428, C.ink, 5);
      g.line(PX, 420, PX, 436, C.ink, 3);
      g.line(PX + 2 * S, 420, PX + 2 * S, 436, C.ink, 3);
      g.text("1 m", PX + 2 * S + 12, 428, 18, C.ink, "left", true);
      if (!held) g.text(lang === "id" ? "seret di denah untuk mengukur" : "drag across the plan to measure", sx(16), 428, 18, C.coral, "right", true);

      g.card(500, 95, 450, 120, C.sun, 1);
      g.text(lang === "id" ? "skala 1 : 50" : "scale 1 : 50", 725, 130, 36, C.ink, "center", true);
      fit(g, lang === "id" ? "1 cm di denah = 50 cm di kelas sebenarnya" : "1 cm on the plan = 50 cm in the real room", 725, 180, 20, 420, C.ink);
      g.card(500, 235, 450, 160, C.paper, 1);
      g.text(lang === "id" ? "di denah" : "on the plan", 525, 262, 20, C.soft, "left", true);
      g.text(`${trim(lang, len, 1)} cm`, 725, 295, 40, C.coral, "center", true);
      g.text(lang === "id" ? "sebenarnya" : "in the room", 525, 330, 20, C.soft, "left", true);
      const real = Math.round(len * 50);
      fit(g, `${trim(lang, len, 1)} × 50 = ${num(lang, real)} cm = ${trim(lang, real / 100)} m`, 725, 366, 28, 420, C.cobalt);

      g.button("len", lang === "id" ? "PANJANG KELAS" : "ROOM LENGTH", 60, 555, 270, 52, C.cobalt);
      g.button("wid", lang === "id" ? "LEBAR KELAS" : "ROOM WIDTH", 365, 555, 270, 52, C.cobalt);
      g.button("desk", lang === "id" ? "MEJA GURU" : "TEACHER'S DESK", 670, 555, 270, 52, C.cobalt);
    },
  };
}

const KM = (lang: Lang) => (lang === "id" ? "km/jam" : "km/h");
const HOUR = (lang: Lang) => (lang === "id" ? "jam" : "h");

/** A car on the top lane drawn with its front at x. */
function car(g: Ink, x: number, y: number) {
  g.card(x - 74, y - 34, 74, 26, C.cobalt, 1);
  g.card(x - 58, y - 52, 38, 20, "#8fb0e8", 0.5);
  g.dot(x - 58, y - 6, 9, C.ink);
  g.dot(x - 16, y - 6, 9, C.ink);
  g.dot(x - 58, y - 6, 3, C.paper);
  g.dot(x - 16, y - 6, 3, C.paper);
}

/** A bicycle with its rider, front wheel at x. */
function bike(g: Ink, x: number, y: number, t: number) {
  const c = g.c;
  c.strokeStyle = C.ink;
  c.lineWidth = 3;
  for (const wx of [x - 50, x - 12]) {
    c.beginPath();
    c.arc(wx, y - 14, 13, 0, Math.PI * 2);
    c.stroke();
    g.line(wx, y - 14, wx + 11 * Math.cos(t * 6), y - 14 + 11 * Math.sin(t * 6), C.soft, 2);
  }
  g.line(x - 50, y - 14, x - 32, y - 34, C.coral, 4);
  g.line(x - 32, y - 34, x - 12, y - 14, C.coral, 4);
  g.line(x - 32, y - 34, x - 18, y - 36, C.coral, 4);
  g.line(x - 32, y - 34, x - 36, y - 58, C.plum, 5);
  g.dot(x - 36, y - 66, 8, C.sun);
}

/** Two vehicles side by side, each at its own speed, and the time it takes them over the same road. */
function race(lang: Lang): Scene {
  const v = [60, 20];
  let go: number | null = null;
  let now = 0;
  const X0 = 180;
  const X1 = 900;
  const px = (km: number) => X0 + (km / 120) * (X1 - X0);
  const lanes = [165, 290];
  const names = lang === "id" ? ["mobil", "sepeda"] : ["car", "bike"];
  const div = lang === "id" ? ":" : "÷";
  return {
    press(id) {
      if (id === "go") go = now;
      const m = /^(\d)([+-])$/u.exec(id);
      if (m) {
        const i = Number(m[1]);
        v[i] = clamp(v[i] + (m[2] === "+" ? 10 : -10), 10, 60);
        go = null;
      }
    },
    draw(g, t) {
      now = t;
      const T = go === null ? 0 : Math.min(2, Math.floor((t - go) * 0.4 * 10) / 10);
      fit(g, lang === "id" ? "kecepatan = jarak : waktu" : "speed = distance ÷ time", W / 2, 50, 36, 900, C.ink);
      for (let km = 0; km <= 120; km += 20) {
        g.line(px(km), 100, px(km), 312, "rgba(58, 63, 75, 0.12)", 2);
        g.text(`${km} km`, px(km), 336, 18, C.soft, "center", true);
      }
      lanes.forEach((y, i) => {
        g.card(X0 - 10, y - 66, X1 - X0 + 100, 80, C.field, 0);
        g.c.setLineDash([16, 12]);
        g.line(X0 - 10, y + 6, X1 + 90, y + 6, C.paper, 3);
        g.c.setLineDash([]);
        const d = v[i] * T;
        g.line(X0, y + 6, px(d), y + 6, i ? C.coral : C.cobalt, 5);
        g.text(names[i], 100, y - 38, 22, C.soft, "center", true);
        g.text(`${v[i]} ${KM(lang)}`, 100, y - 8, 22, i ? C.coral : C.cobalt, "center", true);
        if (i === 0) car(g, px(d), y);
        else bike(g, px(d), y, go === null ? 0 : t);
      });
      g.card(W / 2 - 160, 360, 320, 52, C.sun, 1);
      g.text(`${lang === "id" ? "waktu" : "time"}: ${trim(lang, T, 1)} ${lang === "id" ? "jam" : T === 1 ? "hour" : "hours"}`, W / 2, 386, 26, C.ink, "center", true);
      if (T > 0) {
        [0, 1].forEach((i) => {
          const d = Math.round(v[i] * T);
          fit(g, `${names[i]}: ${num(lang, d)} km ${div} ${trim(lang, T, 1)} ${HOUR(lang)} = ${v[i]} ${KM(lang)}`, W / 2, 445 + i * 44, 26, 900, i ? C.coral : C.cobalt);
        });
      } else
        fit(
          g,
          lang === "id" ? "Atur kecepatannya, lalu tekan MULAI." : "Set the speeds, then press GO.",
          W / 2,
          465,
          24,
          900,
          C.soft,
        );
      g.button("0-", "−", 40, 555, 56, 52, C.cobalt, v[0] > 10);
      g.text(names[0], 158, 581, 22, C.cobalt, "center", true);
      g.button("0+", "+", 220, 555, 56, 52, C.cobalt, v[0] < 60);
      g.button("1-", "−", 320, 555, 56, 52, C.coral, v[1] > 10);
      g.text(names[1], 438, 581, 22, C.coral, "center", true);
      g.button("1+", "+", 500, 555, 56, 52, C.coral, v[1] < 60);
      g.button("go", lang === "id" ? "MULAI" : "GO", 640, 555, 300, 52, C.teal);
    },
  };
}

/** Distance against time for the two vehicles: the faster one draws the steeper line. */
function graph(lang: Lang): Scene {
  const v = [40, 20];
  let T = 1.5;
  let held = false;
  let play: number | null = null;
  let drawn = 0;
  const OX = 120;
  const OY = 470;
  const gx = (h: number) => OX + h * 160;
  const gy = (km: number) => OY - km * (380 / 120);
  const names = lang === "id" ? ["mobil", "sepeda"] : ["car", "bike"];
  const colors = [C.cobalt, C.coral];
  return {
    press(id) {
      if (id === "play") play = drawn;
      const m = /^(\d)([+-])$/u.exec(id);
      if (m) {
        const i = Number(m[1]);
        v[i] = clamp(v[i] + (m[2] === "+" ? 10 : -10), 10, 40);
      }
    },
    down(p) {
      if (p.x < OX - 20 || p.x > gx(3) + 20 || p.y < gy(120) - 10 || p.y > OY + 40) return;
      held = true;
      play = null;
      T = clamp(Math.round(((p.x - OX) / 160) * 2) / 2, 0, 3);
      return true;
    },
    move(p) {
      T = clamp(Math.round(((p.x - OX) / 160) * 2) / 2, 0, 3);
    },
    up() {
      held = false;
    },
    draw(g, t) {
      drawn = t;
      if (play !== null) {
        T = Math.min(3, Math.floor((t - play) * 0.6 * 2) / 2);
        if (t - play > 6) play = null;
      }
      // Grid and axes.
      for (let h = 0.5; h <= 3; h += 0.5) g.line(gx(h), OY, gx(h), gy(120), "rgba(58, 63, 75, 0.1)", h % 1 ? 1 : 2);
      for (let km = 20; km <= 120; km += 20) {
        g.line(OX, gy(km), gx(3), gy(km), "rgba(58, 63, 75, 0.1)", 2);
        g.text(String(km), OX - 12, gy(km), 18, C.soft, "right", true);
      }
      g.line(OX, OY, gx(3) + 20, OY, C.ink, 3);
      g.line(OX, OY, OX, gy(120) - 20, C.ink, 3);
      for (let h = 0; h <= 3; h++) g.text(String(h), gx(h), OY + 22, 18, C.soft, "center", true);
      g.text(lang === "id" ? "jarak (km)" : "distance (km)", OX - 50, 50, 20, C.ink, "left", true);
      g.text(lang === "id" ? "waktu (jam)" : "time (h)", gx(3) + 30, OY + 22, 20, C.ink, "left", true);
      v.forEach((s, i) => {
        const k = ease(t, 0.2 + i * 0.4, 1.2);
        g.line(gx(0), gy(0), gx(3 * k), gy(s * 3 * k), colors[i], 5);
        g.text(names[i], gx(3) + 10, gy(s * 3) - (i === 0 && v[0] === v[1] ? 22 : 0), 20, colors[i], "left", true);
      });
      // The time picked, and where each one has got to by then.
      g.c.setLineDash([6, 6]);
      g.line(gx(T), OY, gx(T), gy(Math.max(...v) * T), C.soft, 2);
      v.forEach((s, i) => g.line(OX, gy(s * T), gx(T), gy(s * T), colors[i], 2));
      g.c.setLineDash([]);
      v.forEach((s, i) => g.dot(gx(T), gy(s * T), 9, colors[i]));
      g.handle(gx(T), OY, held);

      const card = (i: number, y: number) => {
        g.card(685, y, 285, 130, C.paper, 1);
        g.text(names[i], 702, y + 26, 22, C.soft, "left", true);
        g.text(`${v[i]} ${KM(lang)}`, 952, y + 26, 22, colors[i], "right", true);
        g.text(`${num(lang, v[i] * T)} km`, 827, y + 70, 40, colors[i], "center", true);
        g.text(lang === "id" ? `dalam ${trim(lang, T, 1)} jam` : `in ${trim(lang, T, 1)} h`, 827, y + 108, 20, C.soft, "center", true);
        g.c.fillStyle = colors[i];
        g.c.fillRect(685, y + 124, 285, 6);
      };
      card(0, 60);
      card(1, 210);
      const note =
        v[0] === v[1]
          ? lang === "id"
            ? "Kecepatannya sama, jadi garisnya berimpit."
            : "The same speed, so the lines lie on top of each other."
          : lang === "id"
            ? "Garis yang lebih curam milik yang lebih cepat."
            : "The steeper line belongs to the faster one.";
      wrap(g, note, 285, 22).forEach((l, i) => g.text(l, 827, 385 + i * 28, 22, C.ink, "center", true));
      g.button("0-", "−", 40, 555, 56, 52, C.cobalt, v[0] > 10);
      g.text(names[0], 158, 581, 22, C.cobalt, "center", true);
      g.button("0+", "+", 220, 555, 56, 52, C.cobalt, v[0] < 40);
      g.button("1-", "−", 320, 555, 56, 52, C.coral, v[1] > 10);
      g.text(names[1], 438, 581, 22, C.coral, "center", true);
      g.button("1+", "+", 500, 555, 56, 52, C.coral, v[1] < 40);
      g.button("play", lang === "id" ? "PUTAR" : "PLAY", 640, 555, 300, 52, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A ratio compares two amounts. Add portions of the recipe: the numbers grow, but divided down they are the same simplest ratio.",
        id: "Perbandingan membandingkan dua banyak benda. Tambah porsi resepnya: bilangannya membesar, tetapi bila disederhanakan perbandingannya tetap sama.",
      },
      scene: recipe,
    },
    {
      say: {
        en: "A plan is drawn to scale. At 1 : 50, every centimetre on the plan is 50 cm in the real room. Drag across the plan to measure.",
        id: "Denah digambar dengan skala. Pada skala 1 : 50, setiap 1 cm di denah sama dengan 50 cm di ruang sebenarnya. Seret di denah untuk mengukur.",
      },
      scene: plan,
    },
    {
      say: {
        en: "Speed tells how far something goes in each hour: speed = distance ÷ time. Set two speeds and let them go side by side.",
        id: "Kecepatan menunjukkan jarak yang ditempuh setiap jam: kecepatan = jarak : waktu. Atur dua kecepatan, lalu jalankan berdampingan.",
      },
      scene: race,
    },
    {
      say: {
        en: "Draw distance against time and each speed becomes a straight line. Drag along the time line to read how far each has gone.",
        id: "Gambar jarak terhadap waktu, maka setiap kecepatan menjadi garis lurus. Geser di sumbu waktu untuk membaca jarak yang sudah ditempuh.",
      },
      scene: graph,
    },
  ],
};
