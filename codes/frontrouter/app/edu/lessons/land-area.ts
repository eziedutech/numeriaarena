import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp } from "../ink";
import { dec, num, wrap } from "../parts";

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

function arrow(g: Ink, x1: number, y1: number, x2: number, y2: number, color: string) {
  g.line(x1, y1, x2, y2, color, 4);
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.line(x2, y2, x2 - 18 * Math.cos(a - 0.5), y2 - 18 * Math.sin(a - 0.5), color, 4);
  g.line(x2, y2, x2 - 18 * Math.cos(a + 0.5), y2 - 18 * Math.sin(a + 0.5), color, 4);
}

/** A number with no more decimals than it needs, up to `most`. */
function nice(lang: Lang, v: number, most = 4) {
  for (let d = 0; d < most; d++) {
    const k = 10 ** d;
    if (Math.abs(v * k - Math.round(v * k)) < 1e-6) return dec(lang, v, d);
  }
  return dec(lang, v, most);
}

/** A label turned to run up the left side of a shape. */
function sideways(g: Ink, s: string, x: number, y: number, size: number, color: string) {
  g.c.save();
  g.c.translate(x, y);
  g.c.rotate(-Math.PI / 2);
  g.text(s, 0, 0, size, color, "center", true);
  g.c.restore();
}

/** A simple drawn child standing with feet at (x, floor), `tall` sheet units high. */
function child(g: Ink, x: number, floor: number, tall: number, t: number) {
  const head = tall * 0.075;
  const neck = floor - tall + head * 2;
  const hip = floor - tall * 0.47;
  const shoulder = neck + tall * 0.05;
  const wave = Math.sin(t * 3) * 0.08;
  g.c.lineCap = "round";
  g.line(x, hip, x - tall * 0.08, floor - 2, C.cobalt, Math.max(2, tall * 0.05));
  g.line(x, hip, x + tall * 0.08, floor - 2, C.cobalt, Math.max(2, tall * 0.05));
  g.line(x, neck + 2, x, hip, C.plum, Math.max(3, tall * 0.11));
  g.line(x, shoulder, x + tall * 0.14, shoulder + tall * 0.24, C.plum, Math.max(2, tall * 0.04));
  g.line(x, shoulder, x - tall * (0.16 + wave), shoulder - tall * (0.12 + wave), C.plum, Math.max(2, tall * 0.04));
  g.c.lineCap = "butt";
  g.dot(x, floor - tall + head, Math.max(3, head), C.sun);
}

/** A field of 10 m by 10 m: a child walks one side metre by metre, and square metres fill it to 100. */
function are(lang: Lang): Scene {
  let fillStart = -1;
  let walkStart = 0.6;
  let now = 0;
  const X = 90;
  const Y = 50;
  const S = 36;
  const L = S * 10;
  const PX = 740;
  return {
    press(id) {
      if (id === "fill") fillStart = fillStart >= 0 ? -1 : now;
      if (id === "walk") walkStart = now;
    },
    draw(g, t) {
      now = t;
      g.card(X, Y, L, L, "#d9f0ea", 1);
      const count = fillStart >= 0 ? clamp(Math.floor((t - fillStart) / 0.03) + 1, 0, 100) : 0;
      for (let i = 0; i < count; i++) {
        const col = i % 10;
        const row = Math.floor(i / 10);
        g.c.fillStyle = (row + col) % 2 ? "#5cc4b0" : C.teal;
        g.c.fillRect(X + col * S, Y + row * S, S, S);
      }
      for (let i = 1; i < 10; i++) {
        g.line(X + i * S, Y, X + i * S, Y + L, "rgba(58, 63, 75, 0.18)", 1);
        g.line(X, Y + i * S, X + L, Y + i * S, "rgba(58, 63, 75, 0.18)", 1);
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(X, Y, L, L);
      sideways(g, "10 m", X - 24, Y + L / 2, 22, C.cobalt);
      if (count > 0) g.text("1 m²", X + S / 2, Y + S / 2, 18, C.paper, "center", true);

      // The child walks the bottom side, and each metre passed is marked.
      const k = clamp((t - walkStart) / 5, 0, 1);
      const metres = Math.floor(k * 10 + 1e-6);
      for (let i = 1; i <= metres; i++) {
        g.line(X + i * S, Y + L, X + i * S, Y + L + 12, C.coral, 3);
        g.text(num(lang, i), X + i * S, Y + L + 28, 18, C.coral, "center", true);
      }
      const walking = k > 0 && k < 1;
      const bob = walking ? Math.abs(Math.sin(t * 9)) * 3 : 0;
      child(g, X + L * k, Y + L + 100 - bob, 1.5 * S, t);
      g.line(X - 20, Y + L + 100, X + L + 40, Y + L + 100, "rgba(58, 63, 75, 0.3)", 2);

      g.text("1 are", PX, 90, 56, C.cobalt, "center", true);
      fit(g, lang === "id" ? "persegi 10 m × 10 m" : "a square 10 m by 10 m", PX, 148, 400, 26, C.soft);
      fit(g, `${lang === "id" ? "sisi yang dilalui" : "side walked"}: ${num(lang, metres)} m`, PX, 205, 400, 26, C.coral);
      if (count > 0) g.text(`= ${num(lang, count)} m²`, PX, 265, 36, "#2f9a86", "center", true);
      if (count === 100) {
        g.c.globalAlpha = ease(t, fillStart + 3.1, 0.5);
        g.card(PX - 160, 300, 320, 66, C.sun, 1);
        fit(g, "1 are = 100 m²", PX, 333, 300, 32, C.ink);
        g.c.globalAlpha = 1;
      }
      const note =
        lang === "id"
          ? `Tinggi anak itu kira-kira ${dec(lang, 1.5, 1)} m. Ladang 1 are jauh lebih besar dari dirinya.`
          : `The child is about ${dec(lang, 1.5, 1)} m tall. A field of 1 are is much bigger.`;
      wrap(g, note, 380, 22).forEach((line, i) => g.text(line, PX, 410 + i * 30, 22, C.soft, "center"));
      g.button("walk", lang === "id" ? "JALAN DI SISINYA" : "WALK ONE SIDE", 40, 555, 300, 52, C.coral);
      g.button("fill", fillStart >= 0 ? (lang === "id" ? "KOSONGKAN" : "EMPTY IT") : lang === "id" ? "ISI DENGAN m²" : "FILL WITH m²", W - 340, 555, 300, 52, C.teal);
    },
  };
}

/** A square of 100 m by 100 m filled are by are, with a football pitch laid on it for size. */
function hectare(lang: Lang): Scene {
  let fillStart = -1;
  let pitch = false;
  let pitchAt = -9;
  let now = 0;
  const X = 70;
  const Y = 60;
  const K = 4.2;
  const L = 100 * K;
  const S = 10 * K;
  const PX = 760;
  return {
    press(id) {
      if (id === "fill") fillStart = fillStart >= 0 ? -1 : now;
      if (id === "pitch") {
        pitch = !pitch;
        pitchAt = now;
      }
    },
    draw(g, t) {
      now = t;
      g.card(X, Y, L, L, "#d9f0ea", 1);
      const count = fillStart >= 0 ? clamp(Math.floor((t - fillStart) / 0.04) + 1, 0, 100) : 0;
      for (let i = 0; i < count; i++) {
        const col = i % 10;
        const row = Math.floor(i / 10);
        g.c.fillStyle = (row + col) % 2 ? "#8fd6c8" : "#b5e4da";
        g.c.fillRect(X + col * S, Y + row * S, S, S);
      }
      for (let i = 1; i < 10; i++) {
        g.line(X + i * S, Y, X + i * S, Y + L, "rgba(58, 63, 75, 0.25)", 1);
        g.line(X, Y + i * S, X + L, Y + i * S, "rgba(58, 63, 75, 0.25)", 1);
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(X, Y, L, L);
      g.c.strokeStyle = C.coral;
      g.c.strokeRect(X, Y, S, S);
      g.text("1 a", X + S / 2, Y + S / 2, 18, C.coral, "center", true);
      g.text("100 m", X + L / 2, Y - 22, 22, C.cobalt, "center", true);
      sideways(g, "100 m", X - 24, Y + L / 2, 22, C.cobalt);

      // A football pitch, about 105 m by 68 m, fades in over the hectare.
      const k = pitch ? ease(t, pitchAt, 0.6) : 1 - ease(t, pitchAt, 0.4);
      if (k > 0) {
        const pw = 105 * K;
        const ph = 68 * K;
        const px = X + L / 2 - pw / 2;
        const py = Y + L / 2 - ph / 2;
        const c = g.c;
        c.globalAlpha = 0.85 * k;
        c.fillStyle = "#2f9a86";
        c.fillRect(px, py, pw, ph);
        c.strokeStyle = C.paper;
        c.lineWidth = 2;
        c.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
        c.beginPath();
        c.moveTo(px + pw / 2, py + 4);
        c.lineTo(px + pw / 2, py + ph - 4);
        c.stroke();
        c.beginPath();
        c.arc(px + pw / 2, py + ph / 2, 9.15 * K, 0, Math.PI * 2);
        c.stroke();
        const bw = 16.5 * K;
        const bh = 40.3 * K;
        c.strokeRect(px + 4, py + ph / 2 - bh / 2, bw, bh);
        c.strokeRect(px + pw - 4 - bw, py + ph / 2 - bh / 2, bw, bh);
        c.globalAlpha = 1;
        g.dot(px + pw / 2 + 60 * Math.sin(t * 1.3), py + ph / 2 + 30 * Math.sin(t * 2.1), 6, C.paper);
      }

      g.text("1 ha", PX, 90, 56, C.cobalt, "center", true);
      fit(g, "100 m × 100 m", PX, 148, 360, 28, C.soft);
      if (count > 0) g.text(`= ${num(lang, count)} are`, PX, 210, 36, "#2f9a86", "center", true);
      if (count === 100) {
        g.c.globalAlpha = ease(t, fillStart + 4.1, 0.5);
        g.card(PX - 170, 245, 340, 64, C.sun, 1);
        fit(g, "1 ha = 100 are", PX, 277, 320, 32, C.ink);
        fit(g, `1 ha = ${num(lang, 10000)} m²`, PX, 340, 340, 28, C.ink);
        g.c.globalAlpha = 1;
      }
      if (k > 0) {
        g.c.globalAlpha = k;
        const said =
          lang === "id"
            ? `Lapangan sepak bola kira-kira 105 m × 68 m, hampir ${dec(lang, 0.7, 1)} ha.`
            : `A football pitch is about 105 m by 68 m, nearly ${dec(lang, 0.7, 1)} ha.`;
        wrap(g, said, 360, 22).forEach((line, i) => g.text(line, PX, 400 + i * 30, 22, C.ink, "center", true));
        g.c.globalAlpha = 1;
      }
      g.button("fill", fillStart >= 0 ? (lang === "id" ? "KOSONGKAN" : "EMPTY IT") : lang === "id" ? "ISI DENGAN ARE" : "FILL WITH ARE", 40, 555, 300, 52, C.teal);
      const pl = pitch ? (lang === "id" ? "TUTUP LAPANGAN" : "HIDE THE PITCH") : lang === "id" ? "LAPANGAN SEPAK BOLA" : "FOOTBALL PITCH";
      g.button("pitch", pl, W - 380, 555, 340, 52, C.cobalt);
    },
  };
}

/** m times 10 to the power e, written without stray zeros. */
function amount(lang: Lang, m: number, e: number) {
  while (e < 0 && m % 10 === 0) {
    m /= 10;
    e += 1;
  }
  return e >= 0 ? num(lang, m * 10 ** e) : dec(lang, m / 10 ** -e, -e);
}

const NAMES = ["km²", "ha", "are", "m²"];
const ALSO = ["", "hm²", "dam²", ""];
const STARTS: [number, number][] = [
  [3, 0],
  [7, 1],
  [450, 2],
  [25000, 3],
  [15, 1],
];

/** The staircase of land units: a hop down multiplies by 100, a hop up divides by 100. */
function stairs(lang: Lang): Scene {
  let pick = 0;
  let [m, from] = STARTS[0];
  let at = from;
  let hop = { a: at, b: at, start: -9 };
  let now = 0;
  const n = NAMES.length;
  const x0 = 100;
  const sw = 200;
  const top = 200;
  const dh = 60;
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
      NAMES.forEach((u, i) => {
        const p = pos(i);
        g.card(x0 + i * sw + 6, p.y, sw - 12, 70, i === at ? C.sun : i % 2 ? C.paper : "#f8efdc", 1);
        g.text(u, p.x, p.y + (ALSO[i] ? 26 : 35), 32, C.ink, "center", true);
        if (ALSO[i]) g.text(`(${ALSO[i]})`, p.x, p.y + 54, 18, C.soft, "center", true);
      });
      const a1 = on(0.05, -70);
      const a2 = on(0.95, -70);
      arrow(g, a1.x, a1.y, a2.x, a2.y, C.teal);
      const b1 = on(0.9, 130);
      const b2 = on(0.1, 130);
      arrow(g, b1.x, b1.y, b2.x, b2.y, C.coral);
      fit(g, lang === "id" ? "turun 1 tangga, dikali 100" : "1 step down: × 100", 950, 175, 330, 24, C.teal, "right");
      fit(g, lang === "id" ? "naik 1 tangga, dibagi 100" : "1 step up: ÷ 100", 50, 470, 330, 24, C.coral, "left");

      const k = ease(t, hop.start, 0.5);
      const pa = pos(hop.a);
      const pb = pos(hop.b);
      const bx = lerp(pa.x, pb.x, k);
      const by = lerp(pa.y, pb.y, k) - 20 - 50 * Math.sin(Math.PI * k);
      g.dot(bx + 2, by + 4, 18, "rgba(70, 50, 25, 0.25)");
      g.dot(bx, by, 18, C.coral);

      const e = (at - from) * 2;
      fit(g, `${amount(lang, m, 0)} ${NAMES[from]} = ${amount(lang, m, e)} ${NAMES[at]}`, W / 2, 56, 900, 44, C.cobalt);
      const steps = at - from;
      if (steps !== 0) {
        const many = Math.abs(steps);
        const times = num(lang, 10 ** (many * 2));
        const said =
          lang === "id"
            ? `${steps > 0 ? "turun" : "naik"} ${many} tangga, ${steps > 0 ? "dikali" : "dibagi"} ${times}`
            : `${many} step${many === 1 ? "" : "s"} ${steps > 0 ? "down, times" : "up, divided by"} ${times}`;
        fit(g, said, W / 2, 106, 600, 24, steps > 0 ? C.teal : C.coral);
      }
      g.button("up", lang === "id" ? "NAIK" : "UP", 40, 555, 160, 52, C.coral, at > 0);
      g.button("down", lang === "id" ? "TURUN" : "DOWN", 220, 555, 160, 52, C.teal, at < n - 1);
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W - 320, 555, 280, 52, C.cobalt);
    },
  };
}

/** A rice field the learner pulls to any size by its corner, its area read in m², are and ha. */
function sawah(lang: Lang): Scene {
  let a = 120;
  let b = 80;
  let sa = 20;
  let sb = 20;
  let held = false;
  let last = 0;
  const X = 70;
  const Y = 70;
  const K = 2.4;
  const PX = 770;
  const set = (p: Pt) => {
    a = clamp(Math.round((p.x - X) / K / 10) * 10, 10, 200);
    b = clamp(Math.round((p.y - Y) / K / 10) * 10, 10, 150);
  };
  return {
    press(id) {
      if (id === "a1") [a, b] = [10, 10];
      if (id === "h1") [a, b] = [100, 100];
      if (id === "h2") [a, b] = [200, 100];
    },
    down(p) {
      const near = Math.abs(p.x - (X + sa * K)) < 40 && Math.abs(p.y - (Y + sb * K)) < 40;
      if (!near) return;
      held = true;
      return true;
    },
    move(p) {
      if (held) set(p);
    },
    up() {
      held = false;
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      sa += (a - sa) * (1 - Math.exp(-dt * 10));
      sb += (b - sb) * (1 - Math.exp(-dt * 10));
      const w = sa * K;
      const h = sb * K;
      g.card(X, Y, w, h, "#d6e3f5", 1);
      // Rows of young rice, swaying a little, as one path.
      const c = g.c;
      c.save();
      c.beginPath();
      c.rect(X, Y, w, h);
      c.clip();
      c.beginPath();
      for (let y = Y + 10; y < Y + h; y += 12) {
        for (let x = X + 7; x < X + w; x += 12) {
          const s = Math.sin(t * 2 + x * 0.04 + y * 0.02) * 1.5;
          c.moveTo(x, y + 4);
          c.lineTo(x - 3 + s, y - 4);
          c.moveTo(x, y + 4);
          c.lineTo(x + s, y - 6);
          c.moveTo(x, y + 4);
          c.lineTo(x + 3 + s, y - 4);
        }
      }
      c.strokeStyle = C.teal;
      c.lineWidth = 2;
      c.stroke();
      c.restore();
      // Earth banks between the plots, every 50 m.
      for (let m = 50; m < sa; m += 50) g.line(X + m * K, Y, X + m * K, Y + h, "#c9ab62", 5);
      for (let m = 50; m < sb; m += 50) g.line(X, Y + m * K, X + w, Y + m * K, "#c9ab62", 5);
      c.strokeStyle = C.sand;
      c.lineWidth = 7;
      c.strokeRect(X, Y, w, h);
      // One hectare and one are, dashed, to compare with.
      c.setLineDash([9, 7]);
      c.strokeStyle = C.cobalt;
      c.lineWidth = 2;
      c.strokeRect(X, Y, 100 * K, 100 * K);
      c.strokeStyle = C.coral;
      c.strokeRect(X, Y, 10 * K, 10 * K);
      c.setLineDash([]);
      g.text("1 ha", X + 100 * K - 8, Y + 100 * K - 16, 18, C.cobalt, "right", true);
      g.text(`${num(lang, a)} m`, X + w / 2, Y - 22, 22, C.ink, "center", true);
      sideways(g, `${num(lang, b)} m`, X - 24, Y + h / 2, 22, C.ink);
      g.handle(X + w, Y + h, held);

      const m2 = a * b;
      fit(g, `${num(lang, a)} m × ${num(lang, b)} m`, PX, 90, 360, 32, C.ink);
      fit(g, `= ${num(lang, m2)} m²`, PX, 150, 360, 40, "#2f9a86");
      const by = lang === "id" ? ": 100" : "÷ 100";
      g.text(by, PX, 195, 22, C.soft, "center", true);
      fit(g, `= ${num(lang, m2 / 100)} are`, PX, 240, 360, 40, C.cobalt);
      g.text(by, PX, 285, 22, C.soft, "center", true);
      fit(g, `= ${nice(lang, m2 / 10000)} ha`, PX, 330, 360, 40, C.plum);
      const hint = lang === "id" ? "Tarik sudut sawah untuk mengubah ukurannya. Kotak putus-putus biru adalah 1 ha." : "Drag the corner of the rice field to change its size. The dashed blue square is 1 ha.";
      wrap(g, hint, 360, 22).forEach((line, i) => g.text(line, PX, 400 + i * 30, 22, C.soft, "center"));
      g.button("a1", "1 ARE", 40, 555, 160, 52, C.coral);
      g.button("h1", "1 HA", 220, 555, 160, 52, C.cobalt);
      g.button("h2", "2 HA", 400, 555, 160, 52, C.plum);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Land is measured in are. A field of 10 m by 10 m is 1 are, which is 100 m². Walk one side, then fill it with square metres.",
        id: "Luas tanah diukur dengan are. Ladang 10 m × 10 m luasnya 1 are, yaitu 100 m². Jalani satu sisinya, lalu isi dengan meter persegi.",
      },
      scene: are,
    },
    {
      say: {
        en: "A square of 100 m by 100 m is 1 hectare: 100 are fit inside it. A football pitch is nearly that big.",
        id: "Persegi 100 m × 100 m luasnya 1 hektare: 100 are muat di dalamnya. Lapangan sepak bola hampir sebesar itu.",
      },
      scene: hectare,
    },
    {
      say: {
        en: "On the staircase, ha is hm² and are is dam². Each step down is times 100, each step up is divided by 100.",
        id: "Pada tangga satuan, ha sama dengan hm² dan are sama dengan dam². Turun satu tangga dikali 100, naik satu tangga dibagi 100.",
      },
      scene: stairs,
    },
    {
      say: {
        en: "Pull the corner of the rice field to make it bigger or smaller, and watch its area in m², are and ha.",
        id: "Tarik sudut sawah agar lebih besar atau lebih kecil, lalu perhatikan luasnya dalam m², are, dan ha.",
      },
      scene: sawah,
    },
  ],
};
