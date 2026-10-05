import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { num, wrap } from "../parts";

/** Place names by power of ten: many of a place, and one of it. */
const MANY = {
  en: ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"],
  id: ["satuan", "puluhan", "ratusan", "ribuan", "puluh ribuan", "ratus ribuan", "jutaan"],
};
const ONE = {
  en: ["one", "ten", "hundred", "thousand", "ten thousand", "hundred thousand", "million"],
  id: MANY.id,
};

const COLS = 6;
const COL_W = 120;
const X0 = (W - COLS * COL_W) / 2;
/** The middle of the column for a power of ten, ones on the right. */
const cx = (power: number) => X0 + (COLS - 1 - power) * COL_W + COL_W / 2;
const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const digitsOf = (n: number) => [...String(n)].reverse().map(Number);

/** The column chart: headers, alternate shading and the column being worked lit. */
function chart(g: Ink, lang: Lang, lit: number) {
  for (let p = 0; p < COLS; p++) {
    const x = cx(p) - COL_W / 2;
    g.card(x + 3, 22, COL_W - 6, 344, p === lit ? C.sun : p % 2 ? "#f8efdc" : C.paper, p === lit ? 1 : 0.5);
    wrap(g, MANY[lang][p], COL_W - 16, 18).forEach((l, i, all) => g.text(l, cx(p), 50 + (i - (all.length - 1) / 2) * 20, 18, C.soft));
  }
  g.line(X0 - 50, 286, X0 + COLS * COL_W, 286, C.ink, 4);
}

/** One small paper square, faded by `alpha`. */
function square(g: Ink, x: number, y: number, color: string, alpha = 1) {
  g.c.globalAlpha = alpha;
  g.card(x, y, 24, 24, color, 0.6);
  g.c.globalAlpha = 1;
}

/** Column addition from the ones: ten in a column fold into one that moves to the next column. */
function carry(lang: Lang): Scene {
  let a = 275468;
  let b = 158397;
  let col = 0;
  let start = 0;
  let now = 0;
  const L =
    lang === "id"
      ? { next: "KOLOM BERIKUTNYA", other: "CONTOH LAIN", again: "ULANGI" }
      : { next: "NEXT COLUMN", other: "ANOTHER SUM", again: "START OVER" };
  return {
    press(id) {
      const len = String(a + b).length;
      if (id === "next" && col < len) col += 1;
      if (id === "again") col = 0;
      if (id === "other") {
        a = rnd(10000, 699999);
        b = rnd(10000, Math.min(399999, 999999 - a));
        col = 0;
      }
      start = now;
    },
    draw(g, t) {
      now = t;
      const total = a + b;
      const len = String(total).length;
      const ad = digitsOf(a);
      const bd = digitsOf(b);
      const cin: number[] = [0];
      const sums: number[] = [];
      for (let p = 0; p < len; p++) {
        sums[p] = (ad[p] ?? 0) + (bd[p] ?? 0) + cin[p];
        cin[p + 1] = sums[p] >= 10 ? 1 : 0;
      }
      const j = col - 1;
      chart(g, lang, j);
      ad.forEach((d, p) => g.text(String(d), cx(p), 172, 56, C.cobalt, "center", true));
      bd.forEach((d, p) => g.text(String(d), cx(p), 242, 56, C.teal, "center", true));
      g.text("+", X0 - 28, 242, 56, C.ink, "center", true);

      // Carried ones: the newest flies up from the answer into the next column.
      for (let p = 1; p < len; p++) {
        if (!cin[p] || col < p) continue;
        const k = p === col ? ease(t, start + 0.9, 0.7) : 1;
        const x = lerp(cx(p - 1), cx(p), k);
        const y = lerp(330, 110, k) - Math.sin(Math.PI * k) * 30;
        const flip = Math.abs(Math.cos(Math.PI * k));
        const w = 40 * Math.max(0.15, flip);
        g.card(x - w / 2, y - 20, w, 40, C.coral, 1);
        if (flip > 0.4) g.text("1", x, y, 28, C.paper, "center", true);
      }
      for (let p = 0; p < Math.min(col, len); p++) {
        const k = p === j ? ease(t, start + 0.4, 0.4) : 1;
        g.c.globalAlpha = k;
        g.text(String(sums[p] % 10), cx(p), 330 - 24 * (1 - k), 56, C.plum, "center", true);
        g.c.globalAlpha = 1;
      }

      // Below: what happens in the column being worked.
      g.card(40, 384, W - 80, 146, C.field, 0);
      if (col === 0) {
        g.text(lang === "id" ? "mulai dari satuan, kolom paling kanan" : "start with the ones, the column on the right", W / 2, 457, 28, C.ink, "center", true);
      } else {
        const parts = [ad[j], bd[j], cin[j] || undefined].filter((v) => v !== undefined) as number[];
        const s = sums[j];
        const eq = parts.length > 1 ? `${parts.join(" + ")} = ${s}` : String(s);
        g.text(eq, 70, 412, 30, C.ink, "left", true);
        const say =
          s >= 10
            ? lang === "id"
              ? `tulis ${s % 10}, simpan 1 di ${MANY.id[j + 1]}`
              : `write ${s % 10}, carry 1 to the ${MANY.en[j + 1]}`
            : lang === "id"
              ? `tulis ${s}`
              : `write ${s}`;
        g.text(say, 70 + g.width(eq, 30, true) + 30, 412, 22, C.soft, "left", true);
        // The squares: ten of them slide together into one strip.
        const m = s >= 10 ? ease(t, start + 0.9, 0.5) : 0;
        const colors: string[] = [...Array(ad[j] ?? 0).fill(C.cobalt), ...Array(bd[j] ?? 0).fill(C.teal), ...Array(cin[j]).fill(C.coral)];
        for (let i = 0; i < s; i++) {
          const x = i < 10 ? lerp(70 + i * 28, 70 + i * 24, m) : lerp(70 + i * 28, 70 + 260 + (i - 10) * 28, m);
          const show = ease(t, start + i * 0.03, 0.2);
          square(g, x, 448, m > 0.5 && i < 10 ? C.plum : colors[i], show);
        }
        if (s >= 10) {
          g.c.globalAlpha = m;
          const label = lang === "id" ? `10 ${MANY.id[j]} = 1 ${ONE.id[j + 1]}` : `10 ${MANY.en[j]} = 1 ${ONE.en[j + 1]}`;
          g.text(label, 70, 503, 24, C.plum, "left", true);
          g.c.globalAlpha = 1;
        }
        if (col === len) {
          const k = ease(t, start + 1.4, 0.5);
          g.c.globalAlpha = k;
          g.text(`${num(lang, a)} + ${num(lang, b)} = ${num(lang, total)}`, W - 70, 503, 26, C.ink, "right", true);
          g.c.globalAlpha = 1;
        }
      }
      g.button("again", L.again, 40, 555, 190, 52, C.soft, col > 0);
      g.button("other", L.other, 360, 555, 260, 52, C.teal);
      g.button("next", L.next, 660, 555, 300, 52, C.cobalt, col < len);
    },
  };
}

/** Plan a subtraction column by column: the digits on top after each borrow. */
function plan(a: number, b: number) {
  const len = String(a).length;
  const top = digitsOf(a);
  const bd = digitsOf(b);
  const w = top.slice();
  const states = [w.slice()];
  const steps: { top: number; used: number; take: number; res: number; borrow: boolean; across: boolean }[] = [];
  for (let j = 0; j < len; j++) {
    const before = w[j];
    const take = bd[j] ?? 0;
    const borrow = w[j] < take;
    let across = false;
    if (borrow) {
      let k = j + 1;
      while (w[k] === 0) k++;
      across = k > j + 1;
      w[k] -= 1;
      for (let m = k - 1; m > j; m--) w[m] = 9;
      w[j] += 10;
    }
    steps.push({ top: before, used: w[j], take, res: w[j] - take, borrow, across });
    states.push(w.slice());
  }
  return { len, top, bd, states, steps };
}

/** Column subtraction from the ones: when the top is too small, one of the next place unfolds into ten. */
function borrow(lang: Lang): Scene {
  let a = 52304;
  let b = 18657;
  let col = 0;
  let start = 0;
  let now = 0;
  let P = plan(a, b);
  const L =
    lang === "id"
      ? { next: "KOLOM BERIKUTNYA", other: "CONTOH LAIN", again: "ULANGI" }
      : { next: "NEXT COLUMN", other: "ANOTHER ONE", again: "START OVER" };
  return {
    press(id) {
      if (id === "next" && col < P.len) col += 1;
      if (id === "again") col = 0;
      if (id === "other") {
        a = rnd(100000, 999999);
        if (Math.random() < 0.3) a = Math.floor(a / 10000) * 10000;
        b = rnd(10000, a - 1000);
        P = plan(a, b);
        col = 0;
      }
      start = now;
    },
    draw(g, t) {
      now = t;
      const j = col - 1;
      const st = P.steps[j];
      const rlen = String(a - b).length;
      chart(g, lang, j);
      g.text("−", X0 - 28, 242, 56, C.ink, "center", true);
      const nowState = P.states[col];
      const prevState = P.states[Math.max(0, col - 1)];
      P.top.forEach((d, p) => {
        const changed = nowState[p] !== d;
        g.text(String(d), cx(p), 172, 56, changed ? C.soft : C.cobalt, "center", true);
        if (!changed) return;
        // Fresh crossings this column draw themselves in.
        const fresh = prevState[p] !== nowState[p];
        const k = fresh ? ease(t, start, 0.6) : 1;
        g.line(cx(p) - 22, 192, cx(p) - 22 + 44 * k, 152, C.coral, 4);
        g.c.globalAlpha = k;
        g.text(String(nowState[p]), cx(p), 112, 30, C.coral, "center", true);
        g.c.globalAlpha = 1;
      });
      P.bd.forEach((d, p) => g.text(String(d), cx(p), 242, 56, C.teal, "center", true));
      const late = st?.borrow ? 2 : 1;
      for (let p = 0; p < Math.min(col, rlen); p++) {
        const k = p === j ? ease(t, start + late, 0.4) : 1;
        g.c.globalAlpha = k;
        g.text(String(P.steps[p].res), cx(p), 330 - 24 * (1 - k), 56, C.plum, "center", true);
        g.c.globalAlpha = 1;
      }

      g.card(40, 384, W - 80, 146, C.field, 0);
      if (!st) {
        g.text(lang === "id" ? "mulai dari satuan, kolom paling kanan" : "start with the ones, the column on the right", W / 2, 457, 28, C.ink, "center", true);
      } else {
        const eq = `${st.used} − ${st.take} = ${st.res}`;
        g.text(eq, 70, 412, 30, C.ink, "left", true);
        const say = st.borrow
          ? st.across
            ? lang === "id"
              ? `${st.top} kurang dari ${st.take}: pinjam melewati angka 0`
              : `${st.top} is less than ${st.take}: borrow across the zeros`
            : lang === "id"
              ? `${st.top} kurang dari ${st.take}: pinjam 1 dari ${MANY.id[j + 1]}`
              : `${st.top} is less than ${st.take}: borrow 1 from the ${MANY.en[j + 1]}`
          : lang === "id"
            ? `tulis ${st.res}`
            : `write ${st.res}`;
        g.text(say, 70 + g.width(eq, 30, true) + 30, 412, 22, C.soft, "left", true);
        // The squares on top, a strip of ten that unfolds, and the ones taken away.
        const u = st.borrow ? ease(t, start + 0.8, 0.5) : 0;
        const away = ease(t, start + (st.borrow ? 1.5 : 0.4), 0.5);
        for (let i = 0; i < st.used; i++) {
          const fromStrip = i >= st.top;
          const x = fromStrip ? lerp(70 + st.top * 28 + (i - st.top) * 24 + 10, 70 + i * 28, u) : 70 + i * 28;
          const show = fromStrip ? ease(t, start + 0.3, 0.4) : ease(t, start + i * 0.03, 0.2);
          const gone = i >= st.used - st.take;
          square(g, x, 448, fromStrip ? C.plum : C.cobalt, show * (gone ? 1 - 0.75 * away : 1));
        }
        if (st.borrow) {
          g.c.globalAlpha = ease(t, start + 0.8, 0.4);
          const label = lang === "id" ? `1 ${ONE.id[j + 1]} = 10 ${MANY.id[j]}` : `1 ${ONE.en[j + 1]} = 10 ${MANY.en[j]}`;
          g.text(label, 70, 503, 24, C.plum, "left", true);
          g.c.globalAlpha = 1;
        }
        if (col === P.len) {
          g.c.globalAlpha = ease(t, start + late + 0.5, 0.5);
          g.text(`${num(lang, a)} − ${num(lang, b)} = ${num(lang, a - b)}`, W - 70, 503, 26, C.ink, "right", true);
          g.c.globalAlpha = 1;
        }
      }
      g.button("again", L.again, 40, 555, 190, 52, C.soft, col > 0);
      g.button("other", L.other, 360, 555, 260, 52, C.teal);
      g.button("next", L.next, 660, 555, 300, 52, C.cobalt, col < P.len);
    },
  };
}

const TOTALS = [250000, 600000, 84500, 1000000];

/** One strip for the whole, cut in two: the parts add up to it, and taking one leaves the other. */
function bar(lang: Lang): Scene {
  let i = 0;
  let split = 0.45;
  let held = false;
  let changed = 0;
  let now = 0;
  const x = 80;
  const w = 840;
  const y = 220;
  const h = 96;
  return {
    press() {
      i = (i + 1) % TOTALS.length;
      split = 0.45;
      changed = now;
    },
    down(p) {
      if (Math.abs(p.x - (x + w * split)) < 40 && p.y > y - 20 && p.y < y + h + 40) {
        held = true;
        return true;
      }
    },
    move(p) {
      split = clamp((p.x - x) / w, 0.18, 0.82);
    },
    up() {
      held = false;
    },
    draw(g, t) {
      now = t;
      const T = TOTALS[i];
      const stepOf = T >= 100000 ? 1000 : 500;
      const a = Math.round((T * split) / stepOf) * stepOf;
      const b = T - a;
      const grow = ease(t, changed, 0.8);
      const sx = x + w * split;

      // The whole above, with a brace over the strip.
      g.c.globalAlpha = grow;
      g.text(num(lang, T), W / 2, 150, 40, C.ink, "center", true);
      g.line(x, 196, x, 184, C.ink, 3);
      g.line(x, 184, x + w, 184, C.ink, 3);
      g.line(x + w, 196, x + w, 184, C.ink, 3);
      g.c.globalAlpha = 1;
      g.card(x, y, w * grow, h, C.paper, 1);
      g.c.fillStyle = C.coral;
      g.c.fillRect(x, y, Math.min(sx, x + w * grow) - x, h);
      if (grow > split) {
        g.c.fillStyle = C.teal;
        g.c.fillRect(sx, y, x + w * grow - sx, h);
      }
      g.crease(sx, y, sx, y + h);
      g.handle(sx, y + h + 26, held);

      g.text(num(lang, a), (x + sx) / 2, y + h / 2, 30, C.paper, "center", true);
      g.c.globalAlpha = grow;
      g.text(num(lang, b), (sx + x + w) / 2, y + h / 2, 30, C.paper, "center", true);
      g.c.globalAlpha = 1;

      // The same three numbers, written two ways.
      g.card(150, 384, 700, 146, C.field, 0);
      const row = (yy: number, parts: [string, string][]) => {
        const size = 38;
        const full = parts.map(([s]) => s).join(" ");
        let at = W / 2 - g.width(full, size, true) / 2;
        parts.forEach(([s, color]) => {
          g.text(s, at, yy, size, color, "left", true);
          at += g.width(`${s} `, size, true);
        });
      };
      row(424, [
        [num(lang, a), C.coral],
        ["+", C.ink],
        [num(lang, b), C.teal],
        ["=", C.ink],
        [num(lang, T), C.ink],
      ]);
      row(490, [
        [num(lang, T), C.ink],
        ["−", C.ink],
        [num(lang, a), C.coral],
        ["=", C.ink],
        [num(lang, b), C.teal],
      ]);
      if (t < 4 && !held) g.text(lang === "id" ? "geser batasnya" : "drag the cut", sx, y + h + 56, 20, C.coral, "center", true);
      g.button("next", lang === "id" ? "BILANGAN LAIN" : "ANOTHER WHOLE", W / 2 - 150, 555, 300, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Add column by column from the ones. When a column makes ten or more, ten of them fold into one that is carried to the next column.",
        id: "Jumlahkan kolom demi kolom mulai dari satuan. Bila satu kolom berisi sepuluh atau lebih, sepuluh di antaranya dilipat menjadi satu dan disimpan di kolom berikutnya.",
      },
      scene: carry,
    },
    {
      say: {
        en: "Subtract column by column from the ones. When the top digit is too small, one from the next column unfolds into ten.",
        id: "Kurangkan kolom demi kolom mulai dari satuan. Bila angka atas terlalu kecil, pinjam satu dari kolom berikutnya, lalu buka menjadi sepuluh.",
      },
      scene: borrow,
    },
    {
      say: {
        en: "A whole cut in two parts: the parts add up to the whole, and taking one part away leaves the other. Drag the cut.",
        id: "Satu keseluruhan dipotong menjadi dua bagian: kedua bagian dijumlah menjadi keseluruhannya, dan bila satu bagian diambil, tersisa bagian lainnya. Geser potongannya.",
      },
      scene: bar,
    },
  ],
};
