import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { num } from "../parts";

/** A hill between two round numbers: a ball on it rolls down to the nearer one. */
const X0 = 110;
const X1 = 890;
const BASE = 440;
const TALL = 190;
const at = (u: number) => ({ x: lerp(X0, X1, u), y: BASE - TALL * Math.sin(Math.PI * u) });

function hill(g: Ink, lo: string, mid: string, hi: string, ticks: number) {
  const c = g.c;
  c.fillStyle = C.field;
  c.beginPath();
  c.moveTo(X0, BASE);
  for (let i = 0; i <= 60; i++) {
    const p = at(i / 60);
    c.lineTo(p.x, p.y);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = C.ink;
  c.lineWidth = 3;
  c.beginPath();
  for (let i = 0; i <= 60; i++) {
    const p = at(i / 60);
    if (i) c.lineTo(p.x, p.y);
    else c.moveTo(p.x, p.y);
  }
  c.stroke();
  g.crease(at(0.5).x, at(0.5).y + 6, at(0.5).x, BASE);
  g.line(X0 - 30, BASE, X1 + 30, BASE, C.ink, 3);
  for (let i = 0; i <= ticks; i++) {
    const x = lerp(X0, X1, i / ticks);
    g.line(x, BASE, x, BASE + (i % ticks === 0 ? 16 : 9), C.ink, 2);
  }
  g.text(lo, X0, BASE + 44, 32, C.cobalt, "center", true);
  g.text(mid, at(0.5).x, BASE + 44, 24, C.soft, "center", true);
  g.text(hi, X1, BASE + 44, 32, C.cobalt, "center", true);
}

function ball(g: Ink, u: number, label: string, lift: boolean) {
  const p = at(u);
  const y = p.y - 30;
  g.dot(p.x + 3, y + 6, 26, "rgba(70, 50, 25, 0.25)");
  g.dot(p.x, y - (lift ? 4 : 0), lift ? 28 : 26, C.coral);
  g.text(label, p.x, y - 62, 30, C.coral, "center", true);
}

/** Drag the ball along a hill from 40 to 50 and let go: it rolls to the nearer ten. */
function roll(lang: Lang): Scene {
  let lo = 40;
  let u = 0.3;
  let held = false;
  let rolling: { from: number; to: number; start: number } | null = null;
  let landed: number | null = null;
  let picked = 0;
  let now = 0;
  const value = () => lo + Math.round(u * 10);
  return {
    press(id) {
      lo = clamp(lo + (id === "up" ? 10 : -10), 0, 90);
      rolling = null;
      landed = null;
      u = 0.3;
    },
    down(p) {
      const b = at(u);
      if (Math.hypot(p.x - b.x, p.y - (b.y - 30)) < 60) {
        held = true;
        rolling = null;
        landed = null;
        return true;
      }
    },
    move(p) {
      u = clamp((p.x - X0) / (X1 - X0), 0, 1);
    },
    up() {
      held = false;
      const v = Math.round(u * 10);
      u = v / 10;
      picked = lo + v;
      rolling = { from: u, to: v >= 5 ? 1 : 0, start: now };
    },
    draw(g, t) {
      now = t;
      if (rolling) {
        const k = ease(t, rolling.start + 0.35, 0.8);
        if (k >= 1) {
          landed = rolling.to === 1 ? lo + 10 : lo;
          u = rolling.to;
          rolling = null;
        } else u = lerp(rolling.from, rolling.to, k);
      }
      hill(g, num(lang, lo), num(lang, lo + 5), num(lang, lo + 10), 10);
      const shown = rolling ? lo + Math.round(rolling.from * 10) : value();
      ball(g, u, num(lang, landed ?? shown), held);
      if (landed !== null) {
        g.card(W / 2 - 260, 50, 520, 70, C.sun, 1);
        g.text(lang === "id" ? `${num(lang, picked)} dibulatkan ke ${num(lang, landed)}` : `${num(lang, picked)} rounds to ${num(lang, landed)}`, W / 2, 85, 36, C.ink, "center", true);
      } else if (!rolling) {
        g.text(lang === "id" ? "geser bolanya, lalu lepaskan" : "drag the ball, then let go", W / 2, 85, 30, C.soft, "center", true);
      }
      g.text(lang === "id" ? "5 tepat di puncak: bola turun ke depan" : "5 sits right on top: it rolls forward", W / 2, 180, 22, C.soft, "center");
      g.button("down", "−10", 40, 555, 100, 52, C.teal, lo > 0);
      g.button("up", "+10", W - 140, 555, 100, 52, C.teal, lo < 90);
    },
  };
}

const PLACE = {
  en: ["ten", "hundred", "thousand"],
  id: ["puluhan", "ratusan", "ribuan"],
};

/** One number on hills of three sizes: look at the digit right of the place, and roll. */
function places(lang: Lang): Scene {
  let n = 3476;
  let p = 1;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "new") n = 1000 + Math.floor(Math.random() * 9000);
      else p = Number(id);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const step = 10 ** p;
      const lo = Math.floor(n / step) * step;
      const up = n - lo >= step / 2;
      const to = up ? lo + step : lo;
      const k = ease(t, changed + 0.8, 0.8);
      hill(g, num(lang, lo), num(lang, lo + step / 2), num(lang, lo + step), 10);
      ball(g, lerp((n - lo) / step, up ? 1 : 0, k), num(lang, n), false);

      // The number with its place underlined and the digit that decides circled.
      const s = String(n);
      const size = 64;
      const cw = g.width("0", size, true);
      const x = W / 2 - 170 - (s.length * cw) / 2;
      [...s].forEach((d, i) => {
        const cx = x + i * cw + cw / 2;
        const from = s.length - 1 - i;
        if (from === p) g.line(cx - cw / 2 + 4, 108, cx + cw / 2 - 4, 108, C.cobalt, 5);
        if (from === p - 1) {
          g.c.strokeStyle = C.coral;
          g.c.lineWidth = 4;
          g.c.beginPath();
          g.c.arc(cx, 72, size * 0.55, 0, Math.PI * 2);
          g.c.stroke();
        }
        g.text(d, cx, 72, size, from === p ? C.cobalt : from === p - 1 ? C.coral : C.ink, "center", true);
      });
      const digit = Math.floor(n / 10 ** (p - 1)) % 10;
      const why = lang === "id" ? `${digit} ${up ? "≥ 5: naik" : "< 5: turun"}` : `${digit} ${up ? "≥ 5: up" : "< 5: down"}`;
      g.text(why, x - 20, 150, 24, C.coral, "left", true);
      g.c.globalAlpha = k;
      g.card(W / 2 + 40, 40, 380, 70, C.sun, 1);
      g.text(`≈ ${num(lang, to)}`, W / 2 + 230, 75, 44, C.ink, "center", true);
      g.c.globalAlpha = 1;
      PLACE[lang].forEach((name, i) => g.button(String(i + 1), name, 40 + i * 190, 555, 175, 52, i + 1 === p ? C.cobalt : C.soft));
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W - 290, 555, 250, 52, C.teal);
    },
  };
}

const PAIRS = [
  [398, 517],
  [612, 289],
  [1490, 2515],
  [745, 162],
];

/** Rounding first makes a sum easy to see in the head; the exact sum is close. */
function estimate(lang: Lang): Scene {
  let i = 0;
  let changed = 0;
  let now = 0;
  return {
    press() {
      i = (i + 1) % PAIRS.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [a, b] = PAIRS[i];
      const step = a >= 1000 || b >= 1000 ? 1000 : 100;
      const ra = Math.round(a / step) * step;
      const rb = Math.round(b / step) * step;
      const k = ease(t, changed + 0.6, 0.9);
      const row = (y: number, x: number, from: number, to: number, color: string) => {
        g.card(x - 110, y - 46, 220, 92, C.paper, 1);
        g.text(num(lang, from), x, lerp(y, y - 10, k), 48, C.ink, "center", true);
        g.c.globalAlpha = k;
        g.card(x - 110, y + 70, 220, 92, color, 1);
        g.text(num(lang, to), x, y + 116, 48, C.paper, "center", true);
        g.c.globalAlpha = 1;
        g.text("↓", x, y + 60, 30, C.soft, "center", true);
      };
      row(150, 290, a, ra, C.cobalt);
      g.text("+", W / 2 - 40, 150, 48, C.ink, "center", true);
      row(150, 650, b, rb, C.teal);
      g.c.globalAlpha = k;
      g.text("+", W / 2 - 40, 266, 48, C.ink, "center", true);
      g.text(`= ${num(lang, ra + rb)}`, 775, 266, 40, C.ink, "left", true);
      g.c.globalAlpha = ease(t, changed + 1.6, 0.6);
      g.card(W / 2 - 300, 400, 600, 90, C.field, 0);
      g.text(lang === "id" ? `jumlah tepatnya ${num(lang, a + b)}, dekat dengan ${num(lang, ra + rb)}` : `the exact sum is ${num(lang, a + b)}, close to ${num(lang, ra + rb)}`, W / 2, 445, 28, C.ink, "center", true);
      g.c.globalAlpha = 1;
      g.button("next", lang === "id" ? "PASANGAN LAIN" : "ANOTHER PAIR", W / 2 - 140, 555, 280, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Between two tens stands a hill. A number is a ball on it: it rolls down to the ten it is nearer to.",
        id: "Di antara dua puluhan ada bukit. Bilangan adalah bola di atasnya: bola menggelinding ke puluhan yang lebih dekat.",
      },
      scene: roll,
    },
    {
      say: {
        en: "To round to a place, look only at the digit just to its right: 5 or more goes up, less than 5 goes down.",
        id: "Untuk membulatkan ke suatu tempat, lihat angka tepat di kanannya saja: 5 atau lebih naik, kurang dari 5 turun.",
      },
      scene: places,
    },
    {
      say: {
        en: "Round first and a sum is easy to see in your head. The rounded sum is close to the exact one.",
        id: "Bulatkan dulu, jumlahnya mudah dihitung di kepala. Hasil pembulatan dekat dengan jumlah tepatnya.",
      },
      scene: estimate,
    },
  ],
};
