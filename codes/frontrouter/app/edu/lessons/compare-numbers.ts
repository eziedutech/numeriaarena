import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { num, wrap } from "../parts";

const PLACES = {
  en: ["hundred thousands", "ten thousands", "thousands", "hundreds", "tens", "ones"],
  id: ["ratus ribuan", "puluh ribuan", "ribuan", "ratusan", "puluhan", "satuan"],
};

/** Column headers on two lines at most. */
function header(g: Ink, s: string, x: number, y: number, width: number) {
  wrap(g, s, width, 18).forEach((l, i, all) => g.text(l, x, y + (i - (all.length - 1) / 2) * 20, 18, C.soft));
}

const sign = (a: number, b: number) => (a < b ? "<" : a > b ? ">" : "=");

const PAIRS: [number, number][] = [
  [482305, 481970],
  [73512, 73521],
  [95000, 905000],
  [264181, 264118],
  [350999, 351000],
  [618240, 618240],
];

/** Two numbers in the same columns, looked at from the left until a digit differs. */
function columns(lang: Lang): Scene {
  let i = 0;
  let changed = 0;
  let now = 0;
  const colW = 130;
  const x0 = (W - colW * 6) / 2;
  return {
    press() {
      i = (i + 1) % PAIRS.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [a, b] = PAIRS[i];
      const da = String(a).padStart(6, "0");
      const db = String(b).padStart(6, "0");
      const leadA = 6 - String(a).length;
      const leadB = 6 - String(b).length;
      let diff = -1;
      for (let j = 0; j < 6; j++) {
        if (da[j] !== db[j]) {
          diff = j;
          break;
        }
      }
      const stop = diff >= 0 ? diff : 5;
      const scan = Math.floor((t - changed - 0.5) / 0.6);
      const cur = clamp(scan, -1, stop);
      const done = scan > stop;
      for (let j = 0; j < 6; j++) {
        const x = x0 + j * colW;
        const deciding = j === diff && j <= cur;
        g.card(x + 4, 100, colW - 8, 330, deciding ? C.sun : j % 2 ? C.paper : "#f8efdc", deciding ? 1.2 : 0.6);
        if (j <= cur && !deciding) {
          g.c.fillStyle = "rgba(63, 182, 160, 0.16)";
          g.c.fillRect(x + 4, 100, colW - 8, 330);
        }
        if (j === cur && !done) {
          g.c.strokeStyle = C.coral;
          g.c.lineWidth = 3 + 2 * pulse(t, 0.6);
          g.c.strokeRect(x + 4, 100, colW - 8, 330);
        }
        header(g, PLACES[lang][j], x + colW / 2, 132, colW - 20);
        const drop = ease(t, changed + 0.05 * j, 0.4);
        g.c.globalAlpha = drop * (j < leadA ? 0.3 : 1);
        g.text(da[j], x + colW / 2, 210, 72, j < leadA ? C.soft : C.cobalt, "center", true);
        g.c.globalAlpha = drop * (j < leadB ? 0.3 : 1);
        g.text(db[j], x + colW / 2, 360, 72, j < leadB ? C.soft : C.teal, "center", true);
        g.c.globalAlpha = 1;
        if (j <= cur) {
          if (j === diff) g.text(`${da[j]} ${sign(Number(da[j]), Number(db[j]))} ${db[j]}`, x + colW / 2, 285, 34, C.coral, "center", true);
          else g.text("=", x + colW / 2, 285, 36, C.teal, "center", true);
        }
      }
      const k = done ? ease(t, changed + 0.5 + 0.6 * (stop + 1), 0.6) : 0;
      g.c.globalAlpha = k;
      const s = sign(a, b);
      g.text(s, W / 2, 478, 48, C.coral, "center", true);
      g.text(num(lang, a), W / 2 - 40, 478, 48, C.cobalt, "right", true);
      g.text(num(lang, b), W / 2 + 40, 478, 48, C.teal, "left", true);
      const why =
        diff < 0
          ? lang === "id"
            ? "semua angkanya sama, jadi kedua bilangan sama besar"
            : "every digit is the same, so the numbers are equal"
          : lang === "id"
            ? `angka pertama yang berbeda ada di ${PLACES.id[diff]}`
            : `the first different digit is in the ${PLACES.en[diff]}`;
      g.text(why, W / 2, 522, 24, C.soft, "center", true);
      g.c.globalAlpha = 1;
      g.button("next", lang === "id" ? "PASANGAN LAIN" : "ANOTHER PAIR", W / 2 - 140, 555, 280, 52, C.cobalt);
    },
  };
}

/** Two pins on a number line from 300,000 to 400,000: the one further right is greater. */
function line(lang: Lang): Scene {
  const lo = 300000;
  const hi = 400000;
  const X0 = 100;
  const X1 = 900;
  const Y = 330;
  const vals = [338000, 371000];
  let held: number | null = null;
  let tilt = 1;
  let last = 0;
  const xOf = (v: number) => lerp(X0, X1, (v - lo) / (hi - lo));
  const tipY = [Y - 72, Y + 72];
  return {
    down(p) {
      for (let k = 0; k < 2; k++) {
        if (Math.hypot(p.x - xOf(vals[k]), p.y - tipY[k]) < 50) {
          held = k;
          return true;
        }
      }
    },
    move(p) {
      if (held === null) return;
      const v = lerp(lo, hi, clamp((p.x - X0) / (X1 - X0), 0, 1));
      vals[held] = Math.round(v / 1000) * 1000;
    },
    up() {
      held = null;
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      const [a, b] = vals;
      const dir = a < b ? 1 : a > b ? -1 : 0;
      if (dir !== 0) tilt += (dir - tilt) * Math.min(1, dt * 8);

      // The two numbers with the sign between them, the sign turning as they swap.
      g.text(num(lang, a), W / 2 - 60, 66, 48, C.coral, "right", true);
      g.text(num(lang, b), W / 2 + 60, 66, 48, C.teal, "left", true);
      if (dir === 0) g.text("=", W / 2, 66, 52, C.ink, "center", true);
      else {
        const tipX = W / 2 - tilt * 22;
        const endX = W / 2 + tilt * 22;
        g.line(tipX, 66, endX, 42, C.ink, 6);
        g.line(tipX, 66, endX, 90, C.ink, 6);
      }
      const words =
        lang === "id" ? (dir > 0 ? "kurang dari" : dir < 0 ? "lebih dari" : "sama dengan") : dir > 0 ? "is less than" : dir < 0 ? "is greater than" : "is equal to";
      g.text(words, W / 2, 124, 24, C.soft, "center", true);

      // The line with a tick every ten thousand.
      g.line(X0 - 30, Y, X1 + 30, Y, C.ink, 3);
      for (let v = lo; v <= hi; v += 10000) {
        const x = xOf(v);
        const big = (v - lo) % 20000 === 0;
        g.line(x, Y - (big ? 12 : 7), x, Y + (big ? 12 : 7), C.ink, 2);
        if (big) g.text(num(lang, v), x, Y + 30, 18, C.soft, "center", true);
      }
      g.text(lang === "id" ? "lebih kecil" : "smaller", X0 - 20, Y - 30, 20, C.soft, "left", true);
      g.text(lang === "id" ? "lebih besar" : "greater", X1 + 20, Y - 30, 20, C.soft, "right", true);

      // A pin above the line and one below it, each with its number on a card.
      [0, 1].forEach((k) => {
        const x = xOf(vals[k]);
        const color = k === 0 ? C.coral : C.teal;
        const up = k === 0 ? -1 : 1;
        g.line(x, Y, x, tipY[k], color, 4);
        g.dot(x, Y, 7, color);
        g.handle(x, tipY[k], held === k);
        const label = num(lang, vals[k]);
        const w = g.width(label, 30, true) + 30;
        const cx = clamp(x, w / 2 + 20, W - w / 2 - 20);
        const cy = Y + up * 135;
        g.card(cx - w / 2, cy - 26, w, 52, color, 1);
        g.text(label, cx, cy, 30, C.paper, "center", true);
      });
      const msg =
        dir === 0
          ? lang === "id"
            ? "di titik yang sama: sama besar"
            : "the same point: they are equal"
          : lang === "id"
            ? "makin ke kanan, makin besar"
            : "further right on the line means greater";
      g.text(msg, W / 2, 560, 28, C.ink, "center", true);
      if (t < 4 && held === null) g.text(lang === "id" ? "geser jarumnya" : "drag the pins", W / 2, 596, 20, C.coral, "center", true);
    },
  };
}

const SETS = [
  [352140, 325410, 352401, 35214],
  [708090, 780900, 709800, 78900],
  [41500, 415000, 401500, 145000],
  [99999, 100000, 909090, 199999],
];

/** Four number cards that slide into order, smallest first or largest first. */
function order(lang: Lang): Scene {
  let set = 0;
  let mode = 0;
  let changed = -10;
  let now = 0;
  const slots = [0, 1, 2, 3];
  let from = [0, 1, 2, 3];
  const sx = (s: number) => 42 + s * 240;
  const at = (i: number) => lerp(sx(from[i]), sx(slots[i]), ease(now, changed + i * 0.1, 0.7));
  const arrange = (m: number) => {
    from = slots.map((_, i) => (at(i) - 42) / 240);
    const nums = SETS[set];
    const idx = [0, 1, 2, 3].sort((p, q) => (m === 2 ? nums[q] - nums[p] : nums[p] - nums[q]));
    if (m === 0) [0, 1, 2, 3].forEach((i) => (slots[i] = i));
    else idx.forEach((card, s) => (slots[card] = s));
    mode = m;
    changed = now;
  };
  return {
    press(id) {
      if (id === "up") arrange(1);
      if (id === "down") arrange(2);
      if (id === "new") {
        set = (set + 1) % SETS.length;
        [0, 1, 2, 3].forEach((i) => (slots[i] = i));
        from = [0, 1, 2, 3];
        mode = 0;
        changed = now - 10;
      }
    },
    draw(g, t) {
      now = t;
      const nums = SETS[set];
      const title =
        mode === 0
          ? lang === "id"
            ? "empat bilangan, belum urut"
            : "four numbers, mixed up"
          : mode === 1
            ? lang === "id"
              ? "dari yang terkecil ke yang terbesar"
              : "from smallest to largest"
            : lang === "id"
              ? "dari yang terbesar ke yang terkecil"
              : "from largest to smallest";
      g.text(title, W / 2, 110, 36, C.ink, "center", true);
      nums.forEach((n, i) => {
        const k = ease(t, changed + i * 0.1, 0.7);
        const lift = Math.sin(Math.PI * k) * 30;
        const x = at(i);
        g.card(x, 220 - lift, 196, 100, [C.cobalt, C.teal, C.coral, C.plum][i], 1 + lift / 30);
        g.text(num(lang, n), x + 98, 270 - lift, 38, C.paper, "center", true);
        const len = String(n).length;
        g.text(lang === "id" ? `${len} angka` : `${len} digits`, x + 98, 350, 20, C.soft, "center", true);
      });
      if (mode > 0) {
        const settle = ease(t, changed + 1.1, 0.5);
        g.c.globalAlpha = settle;
        const s = mode === 1 ? "<" : ">";
        for (let k = 0; k < 3; k++) g.text(s, sx(k) + 196 + 22, 270, 40, C.ink, "center", true);
        const first = mode === 1 ? (lang === "id" ? "terkecil" : "smallest") : lang === "id" ? "terbesar" : "largest";
        const end = mode === 1 ? (lang === "id" ? "terbesar" : "largest") : lang === "id" ? "terkecil" : "smallest";
        g.text(first, sx(0) + 98, 392, 24, C.coral, "center", true);
        g.text(end, sx(3) + 98, 392, 24, C.coral, "center", true);
        const sorted = [...nums].sort((p, q) => (mode === 1 ? p - q : q - p));
        g.card(70, 432, W - 140, 64, C.field, 0);
        g.text(sorted.map((n) => num(lang, n)).join(`  ${s}  `), W / 2, 464, 28, C.ink, "center", true);
        g.c.globalAlpha = 1;
      } else {
        g.text(lang === "id" ? "lebih sedikit angkanya, lebih kecil bilangannya" : "fewer digits means a smaller number", W / 2, 464, 24, C.soft, "center", true);
      }
      g.button("up", lang === "id" ? "DARI TERKECIL" : "SMALLEST FIRST", 50, 555, 280, 52, mode === 1 ? C.cobalt : C.soft);
      g.button("down", lang === "id" ? "DARI TERBESAR" : "LARGEST FIRST", 360, 555, 280, 52, mode === 2 ? C.cobalt : C.soft);
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER SET", 670, 555, 280, 52, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Line the numbers up in place value columns and look from the left. The first digit that differs decides which number is greater.",
        id: "Susun kedua bilangan menurut nilai tempatnya, lalu periksa dari kiri. Angka pertama yang berbeda menentukan bilangan mana yang lebih besar.",
      },
      scene: columns,
    },
    {
      say: {
        en: "On a number line, the greater number is further right. Drag the pins and watch the sign turn.",
        id: "Pada garis bilangan, bilangan yang lebih besar ada di sebelah kanan. Geser jarumnya, lalu lihat tandanya berbalik.",
      },
      scene: line,
    },
    {
      say: {
        en: "Compare them two by two and the cards slide into order. The sign opens towards the greater number.",
        id: "Bandingkan dua-dua, kartunya bergeser menjadi urut. Bagian tanda yang terbuka selalu menghadap bilangan yang lebih besar.",
      },
      scene: order,
    },
  ],
};
