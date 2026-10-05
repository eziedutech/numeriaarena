import type { Lang } from "../../legal";
import { C, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp } from "../ink";
import { num } from "../parts";

const NOTES = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
const COINS = [100, 200, 500, 1000];
const NOTE_COLOR: Record<number, string> = {
  1000: C.sun,
  2000: C.soft,
  5000: C.sand,
  10000: C.plum,
  20000: C.teal,
  50000: C.cobalt,
  100000: C.coral,
};

const rp = (lang: Lang, n: number) => `Rp${num(lang, n)}`;

/** Text that shrinks until it fits `max`, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center", bold = true) {
  let z = size;
  while (z > 18 && g.width(s, z, bold) > max) z -= 1;
  g.text(s, x, y, z, color, align, bold);
}

/** A paper note: its colour by value, a pale watermark and the amount. */
function note(g: Ink, lang: Lang, v: number, x: number, y: number, w: number, h: number, lift = 1) {
  const color = NOTE_COLOR[v] ?? C.cobalt;
  g.card(x, y, w, h, color, lift);
  g.dot(x + w - h * 0.4, y + h / 2, h * 0.32, "rgba(255, 255, 255, 0.22)");
  g.dot(x + h * 0.4, y + h / 2, h * 0.18, "rgba(255, 255, 255, 0.16)");
  const dark = color === C.sun || color === C.sand;
  fit(g, rp(lang, v), x + w / 2, y + h / 2, w - 14, Math.min(26, h * 0.42), dark ? C.ink : C.paper);
}

/** A coin: a paper disc with a ring and its value. */
function coin(g: Ink, lang: Lang, v: number, x: number, y: number, r: number, lift = 1) {
  g.dot(x + 3 * lift, y + 5 * lift, r, "rgba(70, 50, 25, 0.25)");
  g.dot(x, y, r, v >= 500 ? C.sun : "#dfe2e6");
  g.c.strokeStyle = "rgba(58, 63, 75, 0.25)";
  g.c.lineWidth = 2;
  g.c.beginPath();
  g.c.arc(x, y, r - 6, 0, Math.PI * 2);
  g.c.stroke();
  g.text("Rp", x, y - r * 0.36, 18, C.soft, "center", true);
  fit(g, num(lang, v), x, y + r * 0.24, r * 1.5, 22, C.ink);
}

const isCoin = (v: number, asCoin: boolean) => asCoin || v < 1000;

/** How wide a piece is drawn at scale `s`. */
const pieceW = (coinPiece: boolean, s: number) => (coinPiece ? 68 * s : 124 * s);

/** A note or a coin centred at (x, y). */
function piece(g: Ink, lang: Lang, v: number, coinPiece: boolean, x: number, y: number, s = 1, lift = 1) {
  if (coinPiece) coin(g, lang, v, x, y, 34 * s, lift);
  else note(g, lang, v, x - 62 * s, y - 31 * s, 124 * s, 62 * s, lift);
}

interface Item {
  v: number;
  coin: boolean;
  from: Pt;
  slot: number;
  born: number;
}

/** Notes and coins pressed on the tray fly into the purse while the total counts up. */
function purse(lang: Lang): Scene {
  const items: Item[] = [];
  let prev = 0;
  let total = 0;
  let added = -10;
  let last = 0;
  let now = 0;
  const notes = () => items.filter((i) => !i.coin).length;
  const coins = () => items.filter((i) => i.coin).length;
  const noteAt = (i: number) => ({ x: 80 + (i % 3) * 140 + 62, y: 250 + Math.floor(i / 3) * 40 + 31 });
  const coinAt = (i: number) => ({ x: 560 + (i % 2) * 80, y: 268 + Math.floor(i / 2) * 72 });
  const trayNote = (i: number) => ({ x: 43 + i * 132, y: 28 });
  const trayCoin = (i: number) => ({ x: W / 2 - 135 + i * 90, y: 150 });
  return {
    press(id) {
      if (id === "empty") {
        items.length = 0;
        prev = total;
        total = 0;
        added = now;
        last = 0;
        return;
      }
      const coinPiece = id[0] === "c";
      const v = Number(id.slice(1));
      const from = coinPiece ? trayCoin(COINS.indexOf(v)) : { x: trayNote(NOTES.indexOf(v)).x + 61, y: trayNote(NOTES.indexOf(v)).y + 31 };
      if (coinPiece ? coins() >= 8 : notes() >= 18) return;
      items.push({ v, coin: coinPiece, from, slot: coinPiece ? coins() : notes(), born: now });
      prev = lerp(prev, total, ease(now, added, 0.8));
      total += v;
      added = now;
      last = v;
    },
    draw(g, t) {
      now = t;
      // The tray: every note and coin, each one a button.
      NOTES.forEach((v, i) => {
        const p = trayNote(i);
        const on = notes() < 18;
        const hover = on && g.over(p.x, p.y, 122, 62);
        g.c.globalAlpha = on ? 1 : 0.4;
        note(g, lang, v, p.x, p.y - (hover ? 3 : 0), 122, 62, hover ? 1.5 : 1);
        g.c.globalAlpha = 1;
        if (on) g.hits.push({ id: `n${v}`, x: p.x, y: p.y, w: 122, h: 62 });
      });
      COINS.forEach((v, i) => {
        const p = trayCoin(i);
        const on = coins() < 8;
        const hover = on && g.over(p.x - 34, p.y - 34, 68, 68);
        g.c.globalAlpha = on ? 1 : 0.4;
        coin(g, lang, v, p.x, p.y - (hover ? 3 : 0), 34, hover ? 1.5 : 1);
        g.c.globalAlpha = 1;
        if (on) g.hits.push({ id: `c${v}`, x: p.x - 34, y: p.y - 34, w: 68, h: 68 });
      });
      if (!items.length) g.text(lang === "id" ? "tekan uang kertas atau koin" : "press a note or a coin", W / 2, 202, 22, C.coral, "center", true);

      // The purse, its flap a crease along the top.
      g.card(50, 222, 650, 300, C.field, 0.6);
      g.crease(50, 236, 700, 236);
      items.forEach((it) => {
        const to = it.coin ? coinAt(it.slot) : noteAt(it.slot);
        const k = ease(t, it.born, 0.6);
        const x = lerp(it.from.x, to.x, k);
        const y = lerp(it.from.y, to.y, k) - Math.sin(Math.PI * k) * 40;
        piece(g, lang, it.v, it.coin, x, y, 1, k < 1 ? 1.8 : 0.8);
      });

      // The total counts up to the new amount.
      const shown = Math.round(lerp(prev, total, ease(t, added, 0.8)) / 100) * 100;
      g.text(lang === "id" ? "jumlah" : "total", 840, 270, 26, C.soft, "center", true);
      g.card(725, 300, 235, 84, C.paper, 1);
      fit(g, rp(lang, shown), 842, 342, 215, 40, C.ink);
      if (last > 0) {
        const k = 1 - ease(t, added + 0.9, 0.8);
        g.c.globalAlpha = k;
        g.card(760, 410, 165, 56, C.sun, 1);
        fit(g, `+${rp(lang, last)}`, 842, 438, 150, 28, C.ink);
        g.c.globalAlpha = 1;
      }
      g.button("empty", lang === "id" ? "KOSONGKAN DOMPET" : "EMPTY THE PURSE", 40, 555, 300, 52, C.soft, items.length > 0);
    },
  };
}

type Way = { v: number; coin?: boolean }[];

const WAYS: [number, Way[]][] = [
  [
    10000,
    [
      [{ v: 10000 }],
      [{ v: 5000 }, { v: 5000 }],
      [{ v: 5000 }, { v: 2000 }, { v: 2000 }, { v: 1000 }],
      [{ v: 2000 }, { v: 2000 }, { v: 2000 }, { v: 2000 }, { v: 2000 }],
    ],
  ],
  [
    1000,
    [
      [{ v: 1000 }],
      [{ v: 1000, coin: true }],
      [{ v: 500 }, { v: 500 }],
      [{ v: 500 }, { v: 200 }, { v: 200 }, { v: 100 }],
    ],
  ],
  [
    20000,
    [
      [{ v: 20000 }],
      [{ v: 10000 }, { v: 10000 }],
      [{ v: 10000 }, { v: 5000 }, { v: 5000 }],
      [{ v: 10000 }, { v: 5000 }, { v: 2000 }, { v: 2000 }, { v: 1000 }],
    ],
  ],
  [
    5000,
    [
      [{ v: 5000 }],
      [{ v: 2000 }, { v: 2000 }, { v: 1000 }],
      [{ v: 2000 }, { v: 1000, coin: true }, { v: 1000, coin: true }, { v: 500 }, { v: 500 }],
      [{ v: 1000 }, { v: 1000 }, { v: 1000 }, { v: 1000 }, { v: 1000 }],
    ],
  ],
  [
    50000,
    [
      [{ v: 50000 }],
      [{ v: 20000 }, { v: 20000 }, { v: 10000 }],
      [{ v: 20000 }, { v: 10000 }, { v: 10000 }, { v: 5000 }, { v: 5000 }],
      [{ v: 10000 }, { v: 10000 }, { v: 10000 }, { v: 10000 }, { v: 10000 }],
    ],
  ],
];

/** One amount made in four ways: each row is counted piece by piece to the same total. */
function ways(lang: Lang): Scene {
  let i = 0;
  let changed = 0;
  let now = 0;
  return {
    press() {
      i = (i + 1) % WAYS.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [amount, rows] = WAYS[i];
      g.text(rp(lang, amount), W / 2, 44, 44, C.ink, "center", true);
      const s = 0.85;
      const gap = 34;
      rows.forEach((row, r) => {
        const y = 125 + r * 110;
        const start = changed + 0.3 + r * 1.2;
        const widths = row.map((p) => pieceW(isCoin(p.v, Boolean(p.coin)), s));
        let x = 400 - (widths.reduce((n, w) => n + w, 0) + gap * (row.length - 1)) / 2;
        let counted = 0;
        row.forEach((p, j) => {
          const k = ease(t, start + 0.22 * j, 0.35);
          if (k > 0) {
            counted += p.v;
            g.c.globalAlpha = k;
            piece(g, lang, p.v, isCoin(p.v, Boolean(p.coin)), x + widths[j] / 2 + (1 - k) * 60, y, s, 0.9);
            if (j > 0) g.text("+", x - gap / 2, y, 28, C.soft, "center", true);
            g.c.globalAlpha = 1;
          }
          x += widths[j] + gap;
        });
        if (counted > 0) fit(g, `= ${rp(lang, counted)}`, 800, y, 175, 30, counted === amount ? C.teal : C.soft, "left");
      });
      g.button("next", lang === "id" ? "JUMLAH LAIN" : "ANOTHER AMOUNT", W / 2 - 150, 555, 300, 52, C.cobalt);
    },
  };
}

const SALES: [number, number][] = [
  [7500, 10000],
  [36500, 50000],
  [2700, 5000],
  [68000, 100000],
  [8800, 20000],
];
const ALL = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

/** Count up from the price: each time the biggest piece that lands on a rounder amount. */
function countUp(price: number, paid: number) {
  const jumps: number[] = [];
  let at = price;
  while (at < paid) {
    const d = [...ALL].reverse().find((v) => v <= paid - at && at % v === 0) ?? 100;
    jumps.push(d);
    at += d;
  }
  return jumps;
}

/** Change found by counting up from the price to the money paid, in jumps on a number line. */
function change(lang: Lang): Scene {
  let i = 0;
  let done = 0;
  let stepped = -10;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "up") {
        done += 1;
        stepped = now;
      }
      if (id === "next") {
        i = (i + 1) % SALES.length;
        done = 0;
        changed = now;
      }
    },
    draw(g, t) {
      now = t;
      const [price, paid] = SALES[i];
      const jumps = countUp(price, paid);
      const drop = ease(t, changed, 0.5);
      g.c.globalAlpha = drop;
      g.card(60, 40, 380, 100, C.sun, 1);
      g.text(lang === "id" ? "harga" : "price", 84, 66, 22, C.ink, "left", true);
      fit(g, rp(lang, price), 84, 106, 330, 40, C.ink, "left");
      g.card(560, 40, 380, 100, C.field, 1);
      g.text(lang === "id" ? "dibayar dengan" : "paid with", 584, 66, 22, C.soft, "left", true);
      fit(g, rp(lang, paid), 584, 106, 190, 36, C.ink, "left");
      note(g, lang, paid, 790, 64, 130, 64, 0.8);
      g.c.globalAlpha = 1;

      // The number line: one stop for every amount reached.
      const x0 = 90;
      const x1 = 910;
      const y = 330;
      const xs = jumps.map((_, j) => lerp(x0, x1, j / jumps.length)).concat(x1);
      g.line(x0 - 30, y, x1 + 30, y, C.ink, 3);
      let at = price;
      const stops = [price];
      jumps.forEach((d) => stops.push((at += d)));
      stops.forEach((v, j) => {
        const reached = j === 0 || j === stops.length - 1 || j <= done;
        g.line(xs[j], y - 10, xs[j], y + 10, C.ink, 3);
        if (reached) fit(g, rp(lang, v), xs[j], y + 34, 190, 22, j <= done ? C.ink : C.soft);
      });
      jumps.forEach((d, j) => {
        if (j >= done) return;
        const k = j === done - 1 ? ease(t, stepped, 0.6) : 1;
        const a = xs[j];
        const b = xs[j + 1];
        const mid = (a + b) / 2;
        g.c.strokeStyle = C.coral;
        g.c.lineWidth = 4;
        g.c.beginPath();
        for (let s = 0; s <= 30 * k; s++) {
          const u = s / 30;
          const px = lerp(a, b, u);
          const py = y - 4 - Math.sin(Math.PI * u) * 70;
          if (s) g.c.lineTo(px, py);
          else g.c.moveTo(px, py);
        }
        g.c.stroke();
        g.c.globalAlpha = k;
        fit(g, `+${rp(lang, d)}`, mid, y - 96, b - a - 8, 24, C.coral);
        piece(g, lang, d, d < 1000, mid, lerp(250, 440, k), 0.9, 1);
        g.c.globalAlpha = 1;
      });

      // The change: the pieces counted, added up.
      const given = jumps.slice(0, done);
      if (given.length) {
        const sumUp = given.reduce((n, d) => n + d, 0);
        const word = lang === "id" ? "kembalian" : "change";
        const line = `${word}: ${given.map((d) => rp(lang, d)).join(" + ")} = ${rp(lang, sumUp)}`;
        const full = done >= jumps.length;
        if (full) g.card(60, 482, 880, 50, C.sun, ease(t, stepped + 0.6, 0.4));
        fit(g, line, W / 2, 507, 860, 26, C.ink);
      }
      g.button("up", lang === "id" ? "HITUNG MAJU" : "COUNT UP", 40, 555, 240, 52, C.coral, done < jumps.length);
      g.button("next", lang === "id" ? "HARGA LAIN" : "ANOTHER PRICE", W - 300, 555, 260, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Press notes and coins to put them in the purse. The total counts up with every piece.",
        id: "Tekan uang kertas dan koin untuk memasukkannya ke dompet. Jumlahnya bertambah setiap kali uang masuk.",
      },
      scene: purse,
    },
    {
      say: {
        en: "The same amount of money can be made in different ways. Count each row: they all reach the same total.",
        id: "Nilai uang yang sama bisa dibentuk dengan cara berbeda. Hitung setiap baris: semuanya mencapai jumlah yang sama.",
      },
      scene: ways,
    },
    {
      say: {
        en: "To give change, count up from the price to the money paid. The pieces you count on are the change.",
        id: "Untuk memberi kembalian, hitung maju dari harga sampai uang yang dibayarkan. Uang yang dipakai untuk menghitung maju itulah kembaliannya.",
      },
      scene: change,
    },
  ],
};
