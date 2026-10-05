import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { num, wrap } from "../parts";

const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const divSign = (lang: Lang) => (lang === "id" ? ":" : "÷");

/** A rectangle a wide and b tall, cut at the tens: four parts whose areas add to a × b. */
function area(lang: Lang): Scene {
  let a = 34;
  let b = 26;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "a+") a = clamp(a + 1, 12, 49);
      if (id === "a-") a = clamp(a - 1, 12, 49);
      if (id === "b+") b = clamp(b + 1, 12, 39);
      if (id === "b-") b = clamp(b - 1, 12, 39);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const RX = 90;
      const RY = 80;
      const s = Math.min(500 / a, 380 / b);
      const aT = Math.floor(a / 10) * 10;
      const ao = a % 10;
      const bT = Math.floor(b / 10) * 10;
      const bo = b % 10;
      const parts = [
        { x: 0, y: 0, w: aT, h: bT, color: C.cobalt },
        { x: aT, y: 0, w: ao, h: bT, color: C.teal },
        { x: 0, y: bT, w: aT, h: bo, color: C.coral },
        { x: aT, y: bT, w: ao, h: bo, color: C.plum },
      ].filter((p) => p.w > 0 && p.h > 0);
      g.card(RX, RY, a * s, b * s, C.field, 1);
      parts.forEach((p, i) => {
        const k = ease(t, changed + 0.3 * i, 0.5);
        const x = RX + p.x * s;
        const y = RY + p.y * s;
        g.c.globalAlpha = k;
        g.c.fillStyle = p.color;
        g.c.fillRect(x, y, p.w * s * k, p.h * s);
        g.c.globalAlpha = 1;
        g.c.strokeStyle = C.paper;
        g.c.lineWidth = 3;
        g.c.strokeRect(x, y, p.w * s, p.h * s);
        const label = num(lang, p.w * p.h);
        if (k > 0.9 && g.width(label, 24, true) < p.w * s - 8 && p.h * s > 30) g.text(label, x + (p.w * s) / 2, y + (p.h * s) / 2, 24, C.paper, "center", true);
      });
      // Creases every ten, so the tens can be counted.
      for (let u = 10; u < aT; u += 10) g.crease(RX + u * s, RY, RX + u * s, RY + b * s);
      for (let u = 10; u < bT; u += 10) g.crease(RX, RY + u * s, RX + a * s, RY + u * s);
      g.text(String(aT), RX + (aT * s) / 2, RY - 24, 26, C.ink, "center", true);
      if (ao) g.text(String(ao), RX + aT * s + (ao * s) / 2, RY - 24, 26, C.ink, "center", true);
      g.text(String(bT), RX - 34, RY + (bT * s) / 2, 26, C.ink, "center", true);
      if (bo) g.text(String(bo), RX - 34, RY + bT * s + (bo * s) / 2, 26, C.ink, "center", true);

      // The four parts written as a sum, each in its part's colour.
      const px = 800;
      g.text(`${a} × ${b}`, px, 90, 48, C.ink, "center", true);
      parts.forEach((p, i) => {
        g.c.globalAlpha = ease(t, changed + 0.3 * i, 0.5);
        g.text(`${p.w} × ${p.h} = ${num(lang, p.w * p.h)}`, px, 160 + i * 48, 28, p.color, "center", true);
        g.c.globalAlpha = 1;
      });
      const k = ease(t, changed + 0.3 * parts.length, 0.5);
      g.c.globalAlpha = k;
      g.line(px - 150, 160 + parts.length * 48 - 18, px + 150, 160 + parts.length * 48 - 18, C.ink, 3);
      g.text(parts.map((p) => num(lang, p.w * p.h)).join(" + "), px, 160 + parts.length * 48 + 14, 24, C.soft, "center", true);
      g.text(`= ${num(lang, a * b)}`, px, 160 + parts.length * 48 + 62, 44, C.ink, "center", true);
      g.c.globalAlpha = 1;

      g.button("a-", "−", 250, 555, 60, 52, C.cobalt, a > 12);
      g.text(String(a), 350, 581, 36, C.ink, "center", true);
      g.button("a+", "+", 390, 555, 60, 52, C.cobalt, a < 49);
      g.text("×", 500, 581, 36, C.ink, "center", true);
      g.button("b-", "−", 550, 555, 60, 52, C.coral, b > 12);
      g.text(String(b), 650, 581, 36, C.ink, "center", true);
      g.button("b+", "+", 690, 555, 60, 52, C.coral, b < 39);
    },
  };
}

const PAIRS: [number, number][] = [
  [34, 26],
  [148, 23],
  [257, 36],
  [63, 45],
];

/** The column method beside the area: one row for the ones, one for the tens, then their sum. */
function column(lang: Lang): Scene {
  let i = 0;
  let stage = 0;
  let changed = 0;
  let now = 0;
  const RX = 380;
  const CW = 38;
  /** A number written right to left from the column edge, its digits dropping in. */
  const write = (g: Ink, s: string, y: number, color: string, from: number, softZero = false) => {
    [...s].reverse().forEach((d, k) => {
      const e = ease(now, from + k * 0.12, 0.3);
      g.c.globalAlpha = e;
      g.text(d, RX - k * CW - CW / 2, y - 16 * (1 - e), 50, softZero && k === 0 ? C.soft : color, "center", true);
      g.c.globalAlpha = 1;
    });
  };
  return {
    press(id) {
      if (id === "next" && stage < 3) stage += 1;
      if (id === "again") stage = 0;
      if (id === "other") {
        i = (i + 1) % PAIRS.length;
        stage = 0;
      }
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [a, b] = PAIRS[i];
      const bT = Math.floor(b / 10) * 10;
      const bo = b % 10;
      const p1 = a * bo;
      const p2 = a * bT;
      const left = RX - 5 * CW - 10;
      const at = (s: number) => (stage === s ? changed : -10);
      write(g, String(a), 100, C.ink, -10);
      write(g, String(b), 165, C.ink, -10);
      g.text("×", left, 165, 50, C.ink, "center", true);
      g.line(left - 24, 202, RX + 6, 202, C.ink, 4);
      if (stage >= 1) {
        write(g, String(p1), 245, C.teal, at(1));
        g.text(`${a} × ${bo}`, RX + 40, 245, 24, C.teal, "left", true);
      }
      if (stage >= 2) {
        write(g, String(p2), 310, C.coral, at(2), true);
        g.text("+", left, 310, 50, C.ink, "center", true);
        g.text(`${a} × ${bT}`, RX + 40, 310, 24, C.coral, "left", true);
      }
      if (stage >= 3) {
        g.line(left - 24, 347, RX + 6, 347, C.ink, 4);
        write(g, String(p1 + p2), 395, C.plum, at(3));
      }

      // The same product as a strip a wide, cut into b's tens and ones.
      const SX = 640;
      const SW = 310;
      const SY = 90;
      const SH = 300;
      const hT = (SH * bT) / b;
      g.text(String(a), SX + SW / 2, SY - 26, 26, C.ink, "center", true);
      g.text(String(bT), SX - 30, SY + hT / 2, 26, C.ink, "center", true);
      g.text(String(bo), SX - 30, SY + hT + (SH - hT) / 2, 26, C.ink, "center", true);
      const kT = stage >= 2 ? ease(t, stage === 2 ? changed : -10, 0.5) : 0;
      const kO = stage >= 1 ? ease(t, stage === 1 ? changed : -10, 0.5) : 0;
      g.card(SX, SY, SW, SH, C.field, 1);
      g.c.fillStyle = C.coral;
      g.c.fillRect(SX, SY, SW * kT, hT);
      g.c.fillStyle = C.teal;
      g.c.fillRect(SX, SY + hT, SW * kO, SH - hT);
      g.crease(SX, SY + hT, SX + SW, SY + hT);
      if (kT > 0.9) g.text(`${a} × ${bT} = ${num(lang, p2)}`, SX + SW / 2, SY + hT / 2, 24, C.paper, "center", true);
      if (kO > 0.9) g.text(`${a} × ${bo} = ${num(lang, p1)}`, SX + SW / 2, SY + hT + (SH - hT) / 2, 24, C.paper, "center", true);

      const say = [
        lang === "id" ? `pecah ${b} menjadi ${bT} dan ${bo}` : `split ${b} into ${bT} and ${bo}`,
        lang === "id" ? `${a} × ${bo} = ${num(lang, p1)}: baris satuan` : `${a} × ${bo} = ${num(lang, p1)}: the ones row`,
        lang === "id" ? `${a} × ${bT} = ${num(lang, p2)}: tulis 0 dulu karena puluhan` : `${a} × ${bT} = ${num(lang, p2)}: write the 0 first, it is tens`,
        lang === "id"
          ? `jumlahkan kedua baris: ${num(lang, p1)} + ${num(lang, p2)} = ${num(lang, p1 + p2)}`
          : `add the two rows: ${num(lang, p1)} + ${num(lang, p2)} = ${num(lang, p1 + p2)}`,
      ][stage];
      g.card(60, 440, W - 120, 72, C.field, 0);
      g.text(say, W / 2, 476, 26, C.ink, "center", true);
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", 40, 555, 190, 52, C.soft, stage > 0);
      g.button("other", lang === "id" ? "CONTOH LAIN" : "ANOTHER PAIR", 360, 555, 260, 52, C.teal);
      g.button("next", lang === "id" ? "BARIS BERIKUTNYA" : "NEXT ROW", 660, 555, 300, 52, C.cobalt, stage < 3);
    },
  };
}

type Spot = { x: number; y: number };

/** Tens strips and ones shared among groups: tens first, leftover tens unfold into ones. */
function share(lang: Lang): Scene {
  let n = 95;
  let k = 4;
  let phase = 0;
  let changed = 0;
  let now = 0;
  let snap = new Map<string, Spot>();
  const drawn = new Map<string, Spot>();
  const sums = () => {
    const T = Math.floor(n / 10);
    const O = n % 10;
    const q1 = Math.floor(T / k);
    const r1 = T % k;
    const O2 = O + 10 * r1;
    return { T, O, q1, r1, O2, q2: Math.floor(O2 / k), r2: O2 % k };
  };
  const pw = () => (900 - (k - 1) * 20) / k;
  const px = (p: number) => 50 + p * (pw() + 20);
  /** Where every piece belongs in a phase. */
  const layout = () => {
    const { T, O, q1, r1, q2 } = sums();
    const out: { id: string; ten: boolean; to: Spot; from?: Spot }[] = [];
    for (let i = 0; i < T; i++) {
      const dealt = phase >= 1 && i < k * q1;
      if (phase >= 2 && !dealt) continue;
      const to = dealt ? { x: px(i % k) + 14 + Math.floor(i / k) * 20, y: 270 } : { x: 60 + i * 20, y: 64 };
      out.push({ id: `t${i}`, ten: true, to });
    }
    const ones: { id: string; from?: Spot }[] = [];
    for (let i = 0; i < O; i++) ones.push({ id: `o${i}` });
    if (phase >= 2) {
      for (let i = k * q1; i < k * q1 + r1; i++) {
        const strip = snap.get(`t${i}`) ?? { x: 60 + i * 20, y: 64 };
        for (let m = 0; m < 10; m++) ones.push({ id: `u${i}_${m}`, from: { x: strip.x, y: strip.y + m * 13 } });
      }
    }
    ones.forEach((o, idx) => {
      const dealt = phase >= 3 && idx < k * q2;
      const left = phase >= 3 ? idx - k * q2 : idx;
      const to = dealt
        ? { x: px(idx % k) + pw() - 14 - 3 * 16 + (Math.floor(idx / k) % 3) * 16, y: 270 + Math.floor(Math.floor(idx / k) / 3) * 16 }
        : { x: 300 + (left % 10) * 16, y: 64 + Math.floor(left / 10) * 16 };
      out.push({ id: o.id, ten: false, to, from: o.from });
    });
    return out;
  };
  const reset = () => {
    phase = 0;
    snap = new Map();
    changed = now - 10;
  };
  return {
    press(id) {
      const { r1 } = sums();
      if (id === "k+" || id === "k-") {
        k = clamp(k + (id === "k+" ? 1 : -1), 2, 5);
        reset();
        return;
      }
      if (id === "other") {
        n = rnd(40, 99);
        reset();
        return;
      }
      if (id === "next") {
        if (phase === 3) {
          reset();
          return;
        }
        snap = new Map(drawn);
        phase = phase === 1 && r1 === 0 ? 3 : phase + 1;
        changed = now;
      }
    },
    draw(g, t) {
      now = t;
      const { T, O, q1, r1, q2, r2 } = sums();
      for (let p = 0; p < k; p++) {
        g.card(px(p), 240, pw(), 230, C.field, 0.6);
        const value = (phase >= 1 ? q1 * 10 : 0) + (phase >= 3 ? q2 : 0);
        g.text(num(lang, value), px(p) + pw() / 2, 440, 30, value ? C.ink : C.soft, "center", true);
      }
      drawn.clear();
      let moving = 0;
      layout().forEach((piece) => {
        const from = snap.get(piece.id) ?? piece.from ?? piece.to;
        const still = from.x === piece.to.x && from.y === piece.to.y;
        const e = still ? 1 : ease(t, changed + Math.min(moving++ * 0.05, 1.5), 0.5);
        const x = lerp(from.x, piece.to.x, e);
        const y = lerp(from.y, piece.to.y, e) - Math.sin(Math.PI * e) * 20;
        drawn.set(piece.id, { x, y });
        if (piece.ten) {
          g.card(x, y, 14, 130, C.cobalt, 0.7);
          for (let m = 1; m < 10; m++) g.line(x, y + m * 13, x + 14, y + m * 13, "rgba(255,255,255,0.7)", 1);
        } else g.card(x, y, 13, 13, piece.id[0] === "u" ? C.plum : C.coral, 0.5);
      });

      // What is happening, beside the pile.
      const sign = divSign(lang);
      const eq =
        phase === 3
          ? `${n} ${sign} ${k} = ${q1 * 10 + q2}${r2 ? (lang === "id" ? ` sisa ${r2}` : ` r ${r2}`) : ""}`
          : `${n} ${sign} ${k}`;
      g.text(eq, 780, 84, 34, C.ink, "center", true);
      const msg = [
        lang === "id" ? `${T} puluhan dan ${O} satuan dibagi ke ${k} kelompok` : `${T} tens and ${O} ones shared among ${k} groups`,
        lang === "id"
          ? `setiap kelompok mendapat ${q1} puluhan${r1 ? `, sisa ${r1}` : ""}`
          : `each group gets ${q1} tens${r1 ? `, ${r1} left over` : ""}`,
        lang === "id" ? `${r1} puluhan sisa dibuka menjadi ${r1 * 10} satuan` : `the ${r1} tens left over unfold into ${r1 * 10} ones`,
        lang === "id"
          ? `setiap kelompok mendapat ${q2} satuan${r2 ? `, sisa ${r2}` : ""}`
          : `each group gets ${q2} ones${r2 ? `, ${r2} left over` : ""}`,
      ][phase];
      wrap(g, msg, 360, 22).forEach((l, i) => g.text(l, 780, 132 + i * 28, 22, C.soft, "center", true));

      const nextLabel =
        phase === 0
          ? lang === "id"
            ? "BAGIKAN PULUHAN"
            : "SHARE THE TENS"
          : phase === 1 && r1 > 0
            ? lang === "id"
              ? "BUKA PULUHAN"
              : "UNFOLD THE TENS"
            : phase < 3
              ? lang === "id"
                ? "BAGIKAN SATUAN"
                : "SHARE THE ONES"
              : lang === "id"
                ? "ULANGI"
                : "START OVER";
      g.text(lang === "id" ? "kelompok" : "groups", 40, 581, 22, C.soft, "left", true);
      g.button("k-", "−", 160, 555, 56, 52, C.cobalt, k > 2);
      g.text(String(k), 246, 581, 34, C.ink, "center", true);
      g.button("k+", "+", 276, 555, 56, 52, C.cobalt, k < 5);
      g.button("other", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", 356, 555, 260, 52, C.teal);
      g.button("next", nextLabel, 640, 555, 320, 52, phase === 3 ? C.soft : C.cobalt);
    },
  };
}

/** Long division with the bracket: one place at a time from the left, bringing the next digit down. */
function long(lang: Lang): Scene {
  let n = 7452;
  let d = 6;
  let step = 0;
  let changed = 0;
  let now = 0;
  const DX = 210;
  const CW = 36;
  const ROW = 44;
  const TOP = 112;
  const plan = () => {
    const D = [...String(n)].map(Number);
    const out: { i: number; cur: number; q: number; prod: number; r: number }[] = [];
    let r = 0;
    D.forEach((digit, i) => {
      const cur = r * 10 + digit;
      const q = Math.floor(cur / d);
      if (!out.length && q === 0 && i < D.length - 1) {
        r = cur;
        return;
      }
      out.push({ i, cur, q, prod: q * d, r: cur - q * d });
      r = cur - q * d;
    });
    return { D, out };
  };
  /** A number whose last digit sits in column `col`. */
  const write = (g: Ink, s: string, col: number, y: number, color: string) => {
    [...s].reverse().forEach((c, k) => g.text(c, DX + (col - k) * CW, y, 40, color, "center", true));
  };
  return {
    press(id) {
      const { out } = plan();
      if (id === "next" && step < out.length) step += 1;
      if (id === "d+" || id === "d-") {
        d = clamp(d + (id === "d+" ? 1 : -1), 2, 9);
        step = 0;
      }
      if (id === "other") {
        n = rnd(1000, 9999);
        step = 0;
      }
      changed = now;
    },
    draw(g, t) {
      now = t;
      const { D, out } = plan();
      const s = step - 1;
      const cur = out[s];
      const at = (j: number, delay: number) => (j === s ? ease(t, changed + delay, 0.4) : 1);

      // The bracket: divisor on the left, the line over the number.
      const right = DX + (D.length - 1) * CW + CW / 2 + 10;
      g.text(String(d), DX - 64, TOP, 40, C.coral, "center", true);
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 4;
      g.c.beginPath();
      g.c.moveTo(right, TOP - 30);
      g.c.lineTo(DX - 32, TOP - 30);
      g.c.quadraticCurveTo(DX - 18, TOP, DX - 34, TOP + 26);
      g.c.stroke();
      if (cur) {
        // The number being worked now, lit behind.
        const y = s === 0 ? TOP : TOP + 2 * s * ROW;
        const len = String(cur.cur).length;
        g.card(DX + (cur.i - len + 1) * CW - CW / 2 - 4, y - 24, len * CW + 8, 48, C.sun, 0);
      }
      D.forEach((digit, i) => g.text(String(digit), DX + i * CW, TOP, 40, C.cobalt, "center", true));

      out.slice(0, step).forEach((o, j) => {
        g.c.globalAlpha = at(j, 0);
        g.text(String(o.q), DX + o.i * CW, TOP - 56, 40, C.plum, "center", true);
        g.c.globalAlpha = at(j, 0.6);
        const py = TOP + (2 * j + 1) * ROW;
        write(g, String(o.prod), o.i, py, C.teal);
        const plen = String(o.prod).length;
        g.text("−", DX + (o.i - plen) * CW, py, 36, C.ink, "center", true);
        g.c.globalAlpha = at(j, 1.2);
        g.line(DX + (o.i - plen + 1) * CW - CW / 2, py + 22, DX + o.i * CW + CW / 2, py + 22, C.ink, 3);
        const ry = py + ROW;
        const next = D[o.i + 1];
        if (next === undefined || o.r > 0) write(g, String(o.r), o.i, ry, C.ink);
        g.c.globalAlpha = 1;
        if (next !== undefined) {
          const e = at(j, 1.8);
          g.c.globalAlpha = e;
          g.text(String(next), DX + (o.i + 1) * CW, lerp(TOP, ry, e), 40, C.cobalt, "center", true);
          g.c.globalAlpha = 1;
        }
      });

      // What each move says, line by line.
      g.card(540, 140, 420, 330, C.field, 0);
      const sign = divSign(lang);
      if (!cur) {
        const intro =
          lang === "id"
            ? `bagi ${num(lang, n)} menjadi ${d} bagian sama besar, mulai dari angka paling kiri`
            : `share ${num(lang, n)} into ${d} equal parts, starting with the digit on the left`;
        wrap(g, intro, 380, 26).forEach((l, i) => g.text(l, 750, 260 + i * 36, 26, C.ink, "center", true));
      } else {
        const first = s === 0 && cur.i > 0;
        const lines: [string, string, number][] = [
          [
            first
              ? lang === "id"
                ? `${D[0]} lebih kecil dari ${d}, pakai ${cur.cur}`
                : `${D[0]} is less than ${d}, so use ${cur.cur}`
              : lang === "id"
                ? `${d} masuk ke ${cur.cur} sebanyak ${cur.q} kali`
                : `${d} goes into ${cur.cur} ${cur.q} times`,
            C.plum,
            0,
          ],
          [`${cur.q} × ${d} = ${cur.prod}`, C.teal, 0.6],
          [`${cur.cur} − ${cur.prod} = ${cur.r}`, C.ink, 1.2],
        ];
        if (first) lines.splice(1, 0, [lang === "id" ? `${d} masuk ke ${cur.cur} sebanyak ${cur.q} kali` : `${d} goes into ${cur.cur} ${cur.q} times`, C.plum, 0]);
        const next = D[cur.i + 1];
        if (next !== undefined) lines.push([lang === "id" ? `turunkan ${next}` : `bring down the ${next}`, C.cobalt, 1.8]);
        else {
          const Q = Math.floor(n / d);
          const R = n % d;
          const rest = R ? (lang === "id" ? ` sisa ${R}` : ` r ${R}`) : "";
          lines.push([`${num(lang, n)} ${sign} ${d} = ${num(lang, Q)}${rest}`, C.ink, 1.8]);
        }
        lines.forEach(([text, color, delay], i) => {
          g.c.globalAlpha = ease(t, changed + delay, 0.4);
          g.text(text, 750, 186 + i * 64, g.width(text, 26, true) > 390 ? 22 : 26, color, "center", true);
          g.c.globalAlpha = 1;
        });
      }

      g.text(lang === "id" ? "pembagi" : "divisor", 40, 581, 22, C.soft, "left", true);
      g.button("d-", "−", 160, 555, 56, 52, C.coral, d > 2);
      g.text(String(d), 246, 581, 34, C.ink, "center", true);
      g.button("d+", "+", 276, 555, 56, 52, C.coral, d < 9);
      g.button("other", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", 356, 555, 260, 52, C.teal);
      g.button("next", lang === "id" ? "LANGKAH BERIKUTNYA" : "NEXT STEP", 640, 555, 320, 52, C.cobalt, step < out.length);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Draw 34 × 26 as a rectangle and cut both sides at the tens. The four parts are easy to multiply, and together they make the whole product.",
        id: "Gambar 34 × 26 sebagai persegi panjang, lalu potong kedua sisinya di puluhan. Keempat bagian mudah dikalikan, dan jumlahnya sama dengan hasil kali seluruhnya.",
      },
      scene: area,
    },
    {
      say: {
        en: "The column method does the same: one row for the ones, one row for the tens, then add the rows.",
        id: "Perkalian bersusun melakukan hal yang sama: satu baris untuk satuan, satu baris untuk puluhan, lalu jumlahkan kedua baris.",
      },
      scene: column,
    },
    {
      say: {
        en: "To divide, share the tens first. Tens that are left over unfold into ones, and then the ones are shared.",
        id: "Untuk membagi, bagikan puluhannya dulu. Puluhan yang tersisa dibuka menjadi satuan, lalu satuannya dibagikan.",
      },
      scene: share,
    },
    {
      say: {
        en: "Long division writes that sharing down: divide, multiply, subtract, then bring the next digit down.",
        id: "Pembagian bersusun panjang mencatat pembagian itu: bagi, kalikan, kurangkan, lalu turunkan angka berikutnya.",
      },
      scene: long,
    },
  ],
};
