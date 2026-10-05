import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp, pulse } from "../ink";
import { num, words, wrap } from "../parts";

const PLACES = {
  en: ["hundred billions", "ten billions", "billions", "hundred millions", "ten millions", "millions", "hundred thousands", "ten thousands", "thousands", "hundreds", "tens", "ones"],
  id: ["ratusan miliar", "puluhan miliar", "miliaran", "ratusan juta", "puluhan juta", "jutaan", "ratusan ribu", "puluhan ribu", "ribuan", "ratusan", "puluhan", "satuan"],
};

const GROUPS = { en: ["billions", "millions", "thousands", "ones"], id: ["miliar", "juta", "ribu", "satuan"] };
const TINTS = [C.plum, C.coral, C.teal, C.cobalt];

/** A whole number up to hundreds of billions read aloud, one group of three at a time. */
function aloud(lang: Lang, n: number) {
  if (n === 0) return words(lang, 0);
  const names = lang === "id" ? ["miliar", "juta", "ribu", ""] : ["billion", "million", "thousand", ""];
  const out: string[] = [];
  [1e9, 1e6, 1e3, 1].forEach((u, i) => {
    const part = Math.floor(n / u) % 1000;
    if (!part) return;
    if (lang === "id" && i === 2 && part === 1) out.push("seribu");
    else out.push(names[i] ? `${words(lang, part)} ${names[i]}` : words(lang, part));
  });
  return out.join(" ");
}

/** Text shrunk until it fits `maxW`, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, maxW: number, size: number, color: string, align: CanvasTextAlign = "center", bold = true) {
  let z = size;
  while (z > 18 && g.width(s, z, bold) > maxW) z -= 1;
  g.text(s, x, y, z, color, align, bold);
}

/** Twelve digit cards in four groups of three, each group named; a tapped digit changes and tells its place. */
function groups(lang: Lang): Scene {
  const d = [0, 0, 2, 4, 0, 6, 1, 5, 3, 9, 8, 7];
  let sel = 2;
  let changed = -10;
  let now = 0;
  const S = 60;
  const xOf = (i: number) => 71 + i * (S + 6) + Math.floor(i / 3) * 24;
  const value = () => d.reduce((n, k) => n * 10 + k, 0);
  const at = (p: Pt) => d.findIndex((_, i) => p.x >= xOf(i) && p.x <= xOf(i) + S && p.y >= 110 && p.y <= 215);
  return {
    down(p) {
      const i = at(p);
      if (i < 0) return;
      d[i] = (d[i] + 1) % 10;
      sel = i;
      changed = now;
      return true;
    },
    press(id) {
      if (id !== "new") return;
      const lead = Math.floor(Math.random() * 4);
      d.forEach((_, i) => (d[i] = i < lead ? 0 : i === lead ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10)));
      sel = lead;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const n = value();
      g.text(num(lang, n), W / 2, 62, 52, C.ink, "center", true);
      const first = d.findIndex((v) => v > 0);
      d.forEach((v, i) => {
        const x = xOf(i);
        const drop = ease(t, 0.05 * i, 0.5);
        const pop = i === sel ? 6 * (1 - ease(t, changed, 0.4)) : 0;
        const y = 120 - (1 - drop) * 20 - pop;
        g.c.globalAlpha = drop;
        g.card(x, y, S, 90, i === sel ? C.sun : C.paper, i === sel ? 1.3 : 1);
        g.text(String(v), x + S / 2, y + 45, 50, first < 0 || i < first ? C.soft : TINTS[Math.floor(i / 3)], "center", true);
        g.c.globalAlpha = 1;
      });
      // A bracket under each group of three, with its name.
      const k = ease(t, 0.6, 0.6);
      g.c.globalAlpha = k;
      for (let j = 0; j < 4; j++) {
        const x1 = xOf(3 * j);
        const x2 = xOf(3 * j + 2) + S;
        g.line(x1, 222, x1, 232, TINTS[j], 4);
        g.line(x1, 232, x2, 232, TINTS[j], 4);
        g.line(x2, 222, x2, 232, TINTS[j], 4);
        g.text(GROUPS[lang][j], (x1 + x2) / 2, 260, 24, TINTS[j], "center", true);
      }
      g.c.globalAlpha = 1;
      const worth = d[sel] * 10 ** (11 - sel);
      g.card(130, 298, 740, 60, C.field, 0);
      fit(g, `${PLACES[lang][sel]}: ${num(lang, worth)}`, W / 2, 328, 700, 28, C.ink);
      // The whole number read aloud, shrunk to three lines at most.
      let size = 28;
      let lines = wrap(g, aloud(lang, n), 880, size);
      while (lines.length > 3 && size > 18) {
        size -= 2;
        lines = wrap(g, aloud(lang, n), 880, size);
      }
      lines.forEach((s, i) => g.text(s, W / 2, 400 + i * (size + 10), size, C.cobalt, "center", true));
      if (t - changed > 4 && t < 12) g.text(lang === "id" ? "ketuk angka untuk mengubahnya" : "tap a digit to change it", W / 2, 522, 20, C.coral, "center", true);
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W / 2 - 140, 555, 280, 52, C.cobalt);
    },
  };
}

const UNITS = [1000, 10000, 100000, 1000000];

/** A number drawn digit by digit: the rounding place in blue, the digit after it in coral. */
function marked(g: Ink, lang: Lang, n: number, u: number, x: number, y: number, size: number) {
  const s = num(lang, n);
  const total = g.width(s, size, true);
  let at = x - total / 2;
  let fromRight = 0;
  const chars = [...s];
  const place = [] as number[];
  for (let i = chars.length - 1; i >= 0; i--) {
    place[i] = /\d/u.test(chars[i]) ? fromRight++ : -1;
  }
  const up = Math.round(Math.log10(u));
  chars.forEach((ch, i) => {
    const w = g.width(ch, size, true);
    const color = place[i] === up ? C.cobalt : place[i] === up - 1 ? C.coral : C.ink;
    g.text(ch, at + w / 2, y, size, color, "center", true);
    at += w;
  });
}

/** A number line between two neighbouring multiples, zooming as the place changes; the number rolls to the nearer end. */
function rounding(lang: Lang): Scene {
  let n = 4738215;
  let u = 100000;
  let prev = { lo: 4700000, hi: 4800000 };
  let cur = prev;
  let zoom = -10;
  let changed = 0;
  let held = false;
  let now = 0;
  const x0 = 90;
  const x1 = 910;
  const y = 250;
  const target = () => {
    const lo = Math.floor(n / u) * u;
    return { lo, hi: lo + u };
  };
  const xs = (v: number) => lerp(x0, x1, (v - cur.lo) / (cur.hi - cur.lo));
  const refocus = () => {
    prev = cur;
    zoom = now;
    changed = now;
  };
  const drag = (p: Pt) => {
    const { lo } = target();
    const step = u / 100;
    n = lo + Math.round((clamp((p.x - x0) / (x1 - x0), 0, 0.99) * u) / step) * step + (n % step);
  };
  return {
    press(id) {
      if (id === "new") n = 1000000 + Math.floor(Math.random() * 9000000);
      else u = Number(id);
      refocus();
    },
    down(p) {
      if (ease(now, zoom, 0.9) < 1) return;
      if (Math.abs(p.y - y) < 50 && p.x > x0 - 30 && p.x < x1 + 30) {
        held = true;
        drag(p);
        return true;
      }
    },
    move(p) {
      if (held) drag(p);
    },
    up() {
      held = false;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const tg = target();
      const k = ease(t, zoom, 0.9);
      cur = { lo: lerp(prev.lo, tg.lo, k), hi: lerp(prev.hi, tg.hi, k) };
      marked(g, lang, n, u, W / 2, 70, 64);
      g.c.save();
      g.c.beginPath();
      g.c.rect(x0 - 40, 140, x1 - x0 + 80, 180);
      g.c.clip();
      g.line(x0 - 40, y, x1 + 40, y, C.ink, 4);
      let step = u / 10;
      while ((step / (cur.hi - cur.lo)) * (x1 - x0) < 6) step *= 10;
      for (let v = Math.ceil((cur.lo - u) / step) * step; v <= cur.hi + u; v += step) {
        const big = v % u === 0;
        const mid = !big && v % (u / 2) === 0;
        g.line(xs(v), y - (big ? 18 : mid ? 14 : 8), xs(v), y + (big ? 18 : mid ? 14 : 8), mid ? "#d9a520" : C.ink, big ? 4 : mid ? 3 : 2);
      }
      g.c.restore();
      if (k >= 1) {
        g.text(num(lang, tg.lo), x0, y + 46, 22, C.ink, "center", true);
        g.text(num(lang, tg.hi), x1, y + 46, 22, C.ink, "center", true);
        g.text(num(lang, tg.lo + u / 2), W / 2, y + 46, 20, "#b8860b", "center", true);
      }
      const r = n - tg.lo >= u / 2 ? tg.hi : tg.lo;
      const next = Math.floor(n / (u / 10)) % 10;
      const roll = held ? 0 : ease(t, Math.max(changed, zoom + 0.9) + 0.5, 0.9);
      // The ball rolls off the marker towards the nearer multiple.
      const bx = lerp(xs(n), xs(r), roll);
      g.dot(bx, y - 34 - Math.sin(roll * Math.PI) * 26, 14, C.cobalt);
      g.handle(xs(n), y, held);
      g.c.globalAlpha = roll;
      g.card(W / 2 - 280, 345, 560, 72, C.sun, 1);
      g.text(`${num(lang, n)} ≈ ${num(lang, r)}`, W / 2, 381, 40, C.ink, "center", true);
      const why =
        lang === "id"
          ? `angka sesudahnya ${next}, ${next >= 5 ? "5 atau lebih: bulatkan ke atas" : "kurang dari 5: bulatkan ke bawah"}`
          : `the next digit is ${next}: ${next >= 5 ? "5 or more, round up" : "less than 5, round down"}`;
      fit(g, why, W / 2, 448, 880, 26, next >= 5 ? C.coral : C.teal);
      g.c.globalAlpha = 1;
      g.text(lang === "id" ? "bulatkan ke kelipatan terdekat dari" : "round to the nearest", 60, 528, 20, C.soft, "left", true);
      UNITS.forEach((v, i) => g.button(String(v), num(lang, v), 60 + i * 162, 555, 150, 52, v === u ? C.cobalt : C.soft, v !== u));
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", 720, 555, 230, 52, C.teal);
      if (t < 6 && !held && k >= 1) g.text(lang === "id" ? "geser penandanya" : "drag the marker", clamp(xs(n), x0 + 90, x1 - 90), y + 80, 20, C.coral, "center", true);
    },
  };
}

const SUMS: [number, number][] = [
  [4872, 3149],
  [6518, 2795],
  [3460, 4580],
  [12305, 7891],
  [28740, 41205],
];
const PRODUCTS: [number, number][] = [
  [48, 31],
  [62, 19],
  [395, 21],
  [78, 52],
  [207, 49],
];

/** Rounded to its first digit: 4.872 becomes 5.000, 395 becomes 400. */
const lead = (n: number) => {
  const p = 10 ** (String(n).length - 1);
  return Math.round(n / p) * p;
};

/** Two numbers rounded, worked out quickly in the head, then set beside the exact answer. */
function estimate(lang: Lang): Scene {
  let times = false;
  let i = 0;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "add") times = false;
      if (id === "mul") times = true;
      if (id === "new") i = (i + 1) % SUMS.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const s = t - changed;
      const [a, b] = (times ? PRODUCTS : SUMS)[i];
      const ra = lead(a);
      const rb = lead(b);
      const op = times ? "×" : "+";
      const est = times ? ra * rb : ra + rb;
      const exact = times ? a * b : a + b;
      const X = [270, 410, 550, 680, 820];
      const k0 = ease(s, 0, 0.5);
      g.c.globalAlpha = k0;
      g.text(num(lang, a), X[0], 110, 48, C.ink, "center", true);
      g.text(op, X[1], 110, 48, C.soft, "center", true);
      g.text(num(lang, b), X[2], 110, 48, C.ink, "center", true);
      g.c.globalAlpha = 1;
      // Arrows down to the rounded numbers.
      const k1 = ease(s, 0.6, 0.6);
      [X[0], X[2]].forEach((x) => {
        g.line(x, 150, x, lerp(150, 205, k1), C.cobalt, 3);
        if (k1 > 0.9) {
          g.line(x, 205, x - 8, 195, C.cobalt, 3);
          g.line(x, 205, x + 8, 195, C.cobalt, 3);
        }
      });
      g.c.globalAlpha = k1;
      g.text(lang === "id" ? "bulatkan" : "round", X[0] - 110, 178, 20, C.cobalt, "center", true);
      g.text(num(lang, ra), X[0], 250, 48, C.cobalt, "center", true);
      g.text(op, X[1], 250, 48, C.soft, "center", true);
      g.text(num(lang, rb), X[2], 250, 48, C.cobalt, "center", true);
      g.c.globalAlpha = ease(s, 1.4, 0.5);
      g.text("=", X[3], 250, 48, C.soft, "center", true);
      g.text(num(lang, est), X[4], 250, 48, C.plum, "center", true);
      g.c.globalAlpha = 1;
      // Bars: the estimate first, then the exact answer grows beside it.
      const max = Math.max(est, exact) * 1.08;
      const bw = 600;
      const bx = 250;
      const ke = ease(s, 1.9, 0.7);
      const kx = ease(s, 2.7, 0.9);
      g.c.globalAlpha = ke;
      g.text(lang === "id" ? "perkiraan" : "estimate", bx - 16, 340, 22, C.plum, "right", true);
      g.card(bx, 318, (bw * est * ke) / max, 44, C.plum, 0.8);
      g.text(num(lang, est), bx + (bw * est * ke) / max + 12, 340, 24, C.plum, "left", true);
      g.c.globalAlpha = kx;
      g.text(lang === "id" ? "hasil tepat" : "exact", bx - 16, 400, 22, C.teal, "right", true);
      g.card(bx, 378, (bw * exact * kx) / max, 44, C.teal, 0.8);
      g.text(num(lang, exact), bx + (bw * exact * kx) / max + 12, 400, 24, C.teal, "left", true);
      g.c.globalAlpha = ease(s, 3.6, 0.6);
      fit(g, lang === "id" ? "perkiraan dihitung cepat dan hasilnya dekat dengan hasil tepat" : "the estimate is quick to work out and close to the exact answer", W / 2, 470, 900, 26, C.ink);
      g.c.globalAlpha = 1;
      g.button("add", "+", 250, 555, 100, 52, C.coral, times);
      g.button("mul", "×", 370, 555, 100, 52, C.coral, !times);
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "OTHER NUMBERS", 500, 555, 260, 52, C.cobalt);
      if (s > 4.5) {
        const glow = pulse(t, 2);
        g.dot(bx + (bw * est) / max, 340, 4 + 3 * glow, C.sun);
      }
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Big numbers are read in groups of three from the left: billions, millions, thousands, then the rest. Tap any digit to change it.",
        id: "Bilangan besar dibaca per kelompok tiga angka dari kiri: miliar, juta, ribu, lalu sisanya. Ketuk angka mana saja untuk mengubahnya.",
      },
      scene: groups,
    },
    {
      say: {
        en: "To round, look at the digit just after the place you round to. 5 or more rolls up to the next multiple; less than 5 rolls down.",
        id: "Untuk membulatkan, lihat angka tepat sesudah tempat pembulatan. 5 atau lebih dibulatkan ke atas; kurang dari 5 dibulatkan ke bawah.",
      },
      scene: rounding,
    },
    {
      say: {
        en: "Round each number first, then add or multiply in your head. The estimate lands close to the exact answer.",
        id: "Bulatkan dulu setiap bilangan, lalu jumlahkan atau kalikan di kepala. Hasil perkiraannya dekat dengan hasil yang tepat.",
      },
      scene: estimate,
    },
  ],
};
