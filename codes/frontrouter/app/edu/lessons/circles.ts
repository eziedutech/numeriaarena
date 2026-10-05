import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, lerp, pulse } from "../ink";
import { dec, num, wrap } from "../parts";

const TAU = Math.PI * 2;

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** Lines wrapped for bold text, drawn from `y` down. */
function para(g: Ink, s: string, x: number, y: number, width: number, size: number, color: string) {
  wrap(g, s, width - 24, size).forEach((l, i) => g.text(l, x, y + i * (size + 10), size, color, "left", true));
}

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  g.text(label, cx, 518, 22, C.soft, "center", true);
  g.button(`${id}-`, "−", cx - 115, 545, 70, 52, color, canDown);
  g.text(value, cx, 571, 28, C.ink, "center", true);
  g.button(`${id}+`, "+", cx + 45, 545, 70, 52, color, canUp);
}

/** A circle cut from paper, its shadow under it. */
function disc(g: Ink, x: number, y: number, r: number, color: string = C.field) {
  g.dot(x + 4, y + 6, r, "rgba(70, 50, 25, 0.2)");
  g.dot(x, y, r, color);
}

const PARTS = {
  en: ["CENTRE", "RADIUS", "DIAMETER", "CHORD", "ARC", "SECTOR"],
  id: ["PUSAT", "JARI-JARI", "DIAMETER", "TALI BUSUR", "BUSUR", "JURING"],
};
const NAMES = {
  en: ["centre", "radius", "diameter", "chord", "arc", "sector"],
  id: ["titik pusat", "jari-jari", "diameter", "tali busur", "busur", "juring"],
};
const ABOUT = {
  en: [
    "The point right in the middle. Every point on the circle is the same distance from it.",
    "A line from the centre to the circle. Every radius of a circle is the same length.",
    "A line across the circle through the centre. It is two radii long.",
    "A line joining two points on the circle. The diameter is the longest chord.",
    "A piece of the circle itself, the curved part between two points.",
    "A slice like a piece of cake, between two radii and an arc.",
  ],
  id: [
    "Titik tepat di tengah lingkaran. Setiap titik pada lingkaran sama jauhnya dari titik ini.",
    "Garis dari titik pusat ke lingkaran. Semua jari-jari pada satu lingkaran sama panjang.",
    "Garis yang melintasi lingkaran melalui titik pusat. Panjangnya dua kali jari-jari.",
    "Garis yang menghubungkan dua titik pada lingkaran. Diameter adalah tali busur terpanjang.",
    "Bagian dari lingkaran itu sendiri, lengkungan di antara dua titik.",
    "Daerah seperti potongan kue, dibatasi dua jari-jari dan satu busur.",
  ],
};
const SIGN = ["O", "r", "d = 2 × r", "", "", ""];
const PART_COLOR = [C.coral, C.cobalt, C.teal, C.coral, C.plum, C.teal];

/** A circle with a part picked below; points on the circle are dragged to change the radius, chord, arc or sector. */
function parts(lang: Lang): Scene {
  let mode = 1;
  let a = -0.6;
  let b = 2.1;
  let held: "a" | "b" | null = null;
  let changed = 0;
  let now = 0;
  const ox = 290;
  const oy = 285;
  const R = 195;
  const at = (q: number) => ({ x: ox + Math.cos(q) * R, y: oy + Math.sin(q) * R });
  const usesB = () => mode >= 3;
  return {
    press(id) {
      mode = Number(id.slice(1));
      changed = now;
    },
    down(p) {
      const pa = at(a);
      const pb = at(b);
      if (Math.hypot(p.x - pa.x, p.y - pa.y) < 36) held = "a";
      else if (usesB() && Math.hypot(p.x - pb.x, p.y - pb.y) < 36) held = "b";
      else return false;
      return true;
    },
    move(p) {
      const q = Math.atan2(p.y - oy, p.x - ox);
      if (held === "a") a = q;
      if (held === "b") b = q;
    },
    up() {
      held = null;
    },
    draw(g, t) {
      now = t;
      const c = g.c;
      const k = ease(t, changed, 0.5);
      disc(g, ox, oy, R);
      c.strokeStyle = C.ink;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(ox, oy, R, 0, TAU);
      c.stroke();
      const pa = at(a);
      const pb = at(b);
      const color = PART_COLOR[mode];
      c.lineCap = "round";
      if (mode === 0) {
        // Several radii in a faint fan, all the same length.
        for (let i = 0; i < 8; i++) {
          const q = a + (i * TAU) / 8;
          const e = ease(t, changed + i * 0.08, 0.4);
          g.line(ox, oy, lerp(ox, at(q).x, e), lerp(oy, at(q).y, e), "rgba(242, 113, 107, 0.45)", 3);
        }
      }
      if (mode === 1) g.line(ox, oy, lerp(ox, pa.x, k), lerp(oy, pa.y, k), color, 7);
      if (mode === 2) {
        const pc = at(a + Math.PI);
        g.line(ox, oy, lerp(ox, pa.x, k), lerp(oy, pa.y, k), color, 7);
        g.line(ox, oy, lerp(ox, pc.x, k), lerp(oy, pc.y, k), "#2c8a78", 7);
        g.text("r", (ox + pa.x) / 2 + 18, (oy + pa.y) / 2 - 18, 26, "#2c8a78", "center", true);
        g.text("r", (ox + pc.x) / 2 + 18, (oy + pc.y) / 2 - 18, 26, "#2c8a78", "center", true);
        g.dot(pc.x, pc.y, 8, "#2c8a78");
      }
      if (mode === 3) g.line(pa.x, pa.y, lerp(pa.x, pb.x, k), lerp(pa.y, pb.y, k), color, 7);
      // The arc and the sector run from A to B the short way round.
      let from = a;
      let span = (((b - a) % TAU) + TAU) % TAU;
      if (span > Math.PI) {
        from = b;
        span = TAU - span;
      }
      if (mode === 4) {
        c.strokeStyle = color;
        c.lineWidth = 10;
        c.beginPath();
        c.arc(ox, oy, R, from, from + span * k);
        c.stroke();
      }
      if (mode === 5) {
        c.fillStyle = "rgba(63, 182, 160, 0.55)";
        c.beginPath();
        c.moveTo(ox, oy);
        c.arc(ox, oy, R, from, from + span * k);
        c.closePath();
        c.fill();
        g.line(ox, oy, pa.x, pa.y, "#2c8a78", 5);
        g.line(ox, oy, pb.x, pb.y, "#2c8a78", 5);
      }
      c.lineCap = "butt";
      g.dot(ox, oy, mode === 0 ? 8 + 3 * pulse(t) : 6, mode === 0 ? C.coral : C.ink);
      g.text("O", ox - 22, oy + 20, 22, C.ink, "center", true);
      g.handle(pa.x, pa.y, held === "a");
      if (usesB()) g.handle(pb.x, pb.y, held === "b");
      if (t < 5 && !held) g.text(lang === "id" ? "geser titik merahnya" : "drag the red points", ox, 40, 22, C.coral, "center", true);

      const px = 580;
      const pw = 390;
      fit(g, NAMES[lang][mode], px + pw / 2, 110, pw, 52, color);
      para(g, ABOUT[lang][mode], px, 180, pw, 24, C.soft);
      if (SIGN[mode]) {
        g.card(px + 70, 360, pw - 140, 64, C.sun, 1);
        g.text(SIGN[mode], px + pw / 2, 392, 34, C.ink, "center", true);
      }

      const labels = PARTS[lang];
      const ws = labels.map((l) => g.width(l, 24, true) + 30);
      const gap = clamp((940 - ws.reduce((x, y) => x + y, 0)) / 5, 4, 16);
      let x = 500 - (ws.reduce((m, y) => m + y, 0) + gap * 5) / 2;
      labels.forEach((l, i) => {
        g.button(`m${i}`, l, x, 545, ws[i], 52, PART_COLOR[i], i !== mode);
        x += ws[i] + gap;
      });
    },
  };
}

/** A wheel rolls one full turn along a line; the line it covers is a little more than 3 diameters long. */
function roll(lang: Lang): Scene {
  let d = 3;
  let start = 0.6;
  let now = 0;
  const U = 55;
  const X0 = 130;
  const GROUND = 420;
  const TURN = 4;
  return {
    press(id) {
      if (id === "d+") d = clamp(d + 1, 2, 4);
      if (id === "d-") d = clamp(d - 1, 2, 4);
      start = now + 0.3;
    },
    draw(g, t) {
      now = t;
      const c = g.c;
      const r = (d * U) / 2;
      const circ = Math.PI * d * U;
      const q = ease(t, start, TURN) * TAU;
      const cx = X0 + r * q;
      const cy = GROUND - r;
      g.line(30, GROUND, 970, GROUND, C.ink, 3);
      g.line(X0, GROUND - 14, X0, GROUND + 14, C.ink, 3);
      // The rim's paint is laid down on the line as the wheel turns.
      c.lineCap = "round";
      if (q > 0) g.line(X0, GROUND, cx, GROUND, C.coral, 7);
      disc(g, cx, cy, r, C.paper);
      c.strokeStyle = "rgba(58, 63, 75, 0.35)";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy, r, 0, TAU);
      c.stroke();
      if (q < TAU) {
        c.strokeStyle = C.coral;
        c.lineWidth = 7;
        c.beginPath();
        c.arc(cx, cy, r, Math.PI / 2 + q, Math.PI / 2 + TAU);
        c.stroke();
      }
      c.lineCap = "butt";
      for (let i = 0; i < 6; i++) {
        const s = Math.PI / 2 + q + (i * TAU) / 6;
        g.line(cx, cy, cx + Math.cos(s) * r * 0.85, cy + Math.sin(s) * r * 0.85, "rgba(58, 63, 75, 0.25)", 2);
      }
      // The diameter of the wheel, upright.
      g.line(cx, cy - r, cx, cy + r, C.cobalt, 4);
      g.text("d", cx + 16, cy - r / 2, 24, C.cobalt, "center", true);
      g.dot(cx, cy, 6, C.ink);
      const m = { x: cx + Math.cos(Math.PI / 2 + q) * r, y: cy + Math.sin(Math.PI / 2 + q) * r };
      g.dot(m.x, m.y, 10, C.coral);
      g.dot(m.x, m.y, 4, C.paper);

      const end = start + TURN;
      // Diameters laid along the painted line: three fit, and a little is left.
      const seg = d * U;
      for (let i = 0; i < 4; i++) {
        const e = ease(t, end + 0.3 + i * 0.5, 0.4);
        if (e <= 0) continue;
        const x = X0 + i * seg;
        const w = i < 3 ? seg : circ - 3 * seg;
        c.globalAlpha = e;
        g.card(x + 1, GROUND + 22, w - 2, 22, i === 3 ? C.plum : i % 2 ? C.teal : C.cobalt, 0.6);
        if (i < 3) g.text(`${num(lang, i + 1)} d`, x + seg / 2, GROUND + 66, 22, C.cobalt, "center", true);
        else g.text(dec(lang, 0.14, 2), x + w / 2 + 14, GROUND + 66, 20, C.plum, "center", true);
        c.globalAlpha = 1;
      }
      const said = ease(t, end + 2.3, 0.5);
      g.text(lang === "id" ? `diameter ${num(lang, d)} cm` : `diameter ${num(lang, d)} cm`, 500, 50, 28, C.cobalt, "center", true);
      c.globalAlpha = said;
      fit(g, lang === "id" ? "keliling = π × d" : "circumference = π × d", 500, 100, 600, 32, C.ink);
      fit(g, `π ≈ ${dec(lang, 3.14, 2)}   ${lang === "id" ? "jadi" : "so"}   ${dec(lang, 3.14, 2)} × ${num(lang, d)} = ${dec(lang, 3.14 * d, 2)} cm`, 500, 145, 700, 26, C.soft);
      c.globalAlpha = 1;
      stepper(g, "diameter", `${num(lang, d)} cm`, "d", 260, d > 2, d < 4, C.cobalt);
      g.button("go", lang === "id" ? "GULIRKAN LAGI" : "ROLL AGAIN", 620, 545, 300, 52, C.coral);
    },
  };
}

/** A circle cut into sectors that lay themselves top to tail into a shape that looks more like a rectangle the more there are. */
function slices(lang: Lang): Scene {
  const COUNTS = [4, 6, 8, 12, 16, 24, 36];
  let at = 2;
  let laid = false;
  let changed = -2;
  let now = 0;
  const ox = 220;
  const oy = 255;
  const R = 130;
  const SX = 460;
  const SY = 190;
  return {
    press(id) {
      if (id === "n+") at = clamp(at + 1, 0, COUNTS.length - 1);
      if (id === "n-") at = clamp(at - 1, 0, COUNTS.length - 1);
      if (id === "lay") laid = !laid;
      else laid = false;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const c = g.c;
      const n = COUNTS[at];
      const step = TAU / n;
      const w = (Math.PI * R) / (n / 2);
      c.strokeStyle = "rgba(58, 63, 75, 0.25)";
      c.lineWidth = 2;
      c.setLineDash([8, 8]);
      c.beginPath();
      c.arc(ox, oy, R, 0, TAU);
      c.stroke();
      c.setLineDash([]);
      let done = true;
      for (let i = 0; i < n; i++) {
        const e = ease(t, changed + i * (0.9 / n), 0.8);
        if (e < 1) done = false;
        const k = laid ? e : 1 - e;
        const j = Math.floor(i / 2);
        const down = i % 2 === 0;
        // In the circle each sector points out from the centre; in the row they take turns pointing down and up.
        const fromAng = -Math.PI / 2 + (i + 0.5) * step;
        const base = down ? Math.PI / 2 : -Math.PI / 2;
        const toAng = base + TAU * Math.round((fromAng - base) / TAU);
        const tx = down ? SX + j * w + w / 2 : SX + (j + 1) * w;
        const ty = down ? SY : SY + R;
        const x = lerp(ox, tx, k);
        const y = lerp(oy, ty, k);
        const ang = lerp(fromAng, toAng, k);
        c.fillStyle = "rgba(70, 50, 25, 0.18)";
        c.beginPath();
        c.moveTo(x + 3, y + 5);
        c.arc(x + 3, y + 5, R, ang - step / 2, ang + step / 2);
        c.closePath();
        c.fill();
        c.fillStyle = down ? C.teal : C.cobalt;
        c.beginPath();
        c.moveTo(x, y);
        c.arc(x, y, R, ang - step / 2, ang + step / 2);
        c.closePath();
        c.fill();
        c.strokeStyle = C.paper;
        c.lineWidth = 1.5;
        c.stroke();
      }
      if (laid && done) {
        const right = SX + (n / 2) * w + w / 2;
        g.line(SX, SY + R + 26, right, SY + R + 26, C.coral, 3);
        g.line(SX, SY + R + 16, SX, SY + R + 36, C.coral, 3);
        g.line(right, SY + R + 16, right, SY + R + 36, C.coral, 3);
        fit(g, lang === "id" ? "setengah keliling = π × r" : "half the circumference = π × r", (SX + right) / 2, SY + R + 58, 480, 24, C.coral);
        g.line(SX - 22, SY, SX - 22, SY + R, C.plum, 3);
        g.text("r", SX - 40, SY + R / 2, 28, C.plum, "center", true);
        g.c.globalAlpha = ease(t, changed + 1.8, 0.5);
        g.card(500 - 230, 410, 460, 66, C.sun, 1);
        fit(g, lang === "id" ? "luas = π × r × r" : "area = π × r × r", 500, 443, 420, 34);
        g.c.globalAlpha = 1;
      } else {
        g.text("r", ox + R / 2, oy - 14, 26, C.plum, "center", true);
        g.line(ox, oy, ox + R, oy, C.plum, 3);
        fit(g, lang === "id" ? `${num(lang, n)} juring` : `${num(lang, n)} sectors`, 700, 120, 400, 36, C.ink);
      }
      stepper(g, lang === "id" ? "juring" : "sectors", num(lang, n), "n", 220, at > 0, at < COUNTS.length - 1, C.cobalt);
      g.button("lay", laid ? (lang === "id" ? "KEMBALIKAN" : "BACK TO A CIRCLE") : lang === "id" ? "SUSUN JURINGNYA" : "LAY THE SECTORS OUT", 520, 545, 400, 52, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Pick a part of the circle below and drag the red points to see it change.",
        id: "Pilih salah satu unsur lingkaran di bawah, lalu geser titik merahnya untuk melihat perubahannya.",
      },
      scene: parts,
    },
    {
      say: {
        en: "Roll the wheel one full turn: the line it paints is its circumference, a little more than 3 diameters. That number is π, about 3.14.",
        id: "Gulirkan roda satu putaran penuh: garis yang dilukisnya adalah kelilingnya, sedikit lebih dari 3 kali diameter. Bilangan itu adalah π, kira-kira 3,14.",
      },
      scene: roll,
    },
    {
      say: {
        en: "Cut the circle into sectors and lay them top to tail. The more sectors, the more it looks like a rectangle π × r long and r tall.",
        id: "Potong lingkaran menjadi juring-juring, lalu susun berselang-seling. Makin banyak juringnya, makin mirip persegi panjang dengan panjang π × r dan lebar r.",
      },
      scene: slices,
    },
  ],
};
