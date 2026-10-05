import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { num, sum } from "../parts";

/** An integer with a true minus sign: −7. */
const int = (lang: Lang, n: number) => (n < 0 ? `−${num(lang, -n)}` : num(lang, n));
/** A negative number written after a sign goes in brackets: 3 − (−4). */
const br = (lang: Lang, n: number) => (n < 0 ? `(${int(lang, n)})` : int(lang, n));
const tone = (n: number) => (n < 0 ? C.cobalt : n > 0 ? C.coral : C.ink);

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

/** An integer line from -range to range across the sheet, centred on x = 500. */
function numberLine(g: Ink, lang: Lang, y: number, range: number, step: number, size = 20) {
  arrow(g, 500, y, 500 + range * step + 34, y, C.ink, 4);
  arrow(g, 500, y, 500 - range * step - 34, y, C.ink, 4);
  for (let n = -range; n <= range; n++) {
    const x = 500 + n * step;
    g.line(x, y - (n === 0 ? 18 : 11), x, y + (n === 0 ? 18 : 11), C.ink, n === 0 ? 4 : 2);
    g.text(int(lang, n), x, y + 36, size, tone(n), "center", true);
  }
}

/** A paper walker standing at x with feet at y; `facing` runs from 1 (right) to −1 (left). */
function walker(g: Ink, x: number, y: number, facing: number, stride: number) {
  const c = g.c;
  c.save();
  c.translate(x, y);
  c.scale(facing, 1);
  const s = Math.sin(stride) * 10;
  g.line(0, -40, s, 0, C.ink, 5);
  g.line(0, -40, -s, 0, C.ink, 5);
  g.line(0, -72, 14 + s * 0.4, -52, C.ink, 4);
  g.card(-14, -86, 28, 48, C.teal, 1);
  g.dot(0, -102, 16, C.sun);
  g.dot(8, -105, 3, C.ink);
  g.line(14, -100, 20, -98, C.ink, 3);
  c.restore();
}

/** A walker on the number line: face right to add, turn around to subtract, walk backwards for a negative number. */
function walk(lang: Lang): Scene {
  const list: [number, "+" | "−", number][] = [
    [2, "+", 3],
    [-3, "+", 5],
    [4, "−", 6],
    [-2, "+", -4],
    [3, "−", -4],
    [-5, "−", -2],
  ];
  let pick = 0;
  let start: number | null = null;
  let now = 0;
  const step = 42;
  const y = 360;
  const xs = (n: number) => 500 + n * step;
  const STEP_LEN = 0.55;
  const L =
    lang === "id"
      ? { walk: "JALAN", other: "CONTOH LAIN", plus: "+ : hadap kanan,  − : balik badan", neg: "bilangan negatif: jalan mundur" }
      : { walk: "WALK", other: "ANOTHER EXAMPLE", plus: "+ : face right,  − : turn around", neg: "a negative number: walk backwards" };
  return {
    press(id) {
      if (id === "walk") start = now;
      if (id === "other") {
        pick = (pick + 1) % list.length;
        start = null;
      }
    },
    draw(g, t) {
      now = t;
      const [a, op, b] = list[pick];
      const turnEnd = op === "−" ? 1.1 : 0.3;
      const s = start === null ? -1 : t - start;
      const facing = op === "−" && s > 0 ? lerp(1, -1, ease(s, 0.3, 0.7)) : 1;
      const f = op === "+" ? 1 : -1;
      const dir = f * Math.sign(b);
      const walked = clamp((s - turnEnd) / STEP_LEN, 0, Math.abs(b));
      const done = s > turnEnd + Math.abs(b) * STEP_LEN + 0.2;
      const pos = a + dir * walked;
      const u = walked % 1;
      const hop = walked > 0 && walked < Math.abs(b) ? Math.sin(u * Math.PI) * 16 : 0;

      numberLine(g, lang, y, 10, step);
      // The hops walked so far.
      for (let i = 0; i < Math.ceil(walked); i++) {
        const from = a + dir * i;
        const k = Math.min(1, walked - i);
        g.c.strokeStyle = C.plum;
        g.c.lineWidth = 3;
        g.c.beginPath();
        for (let j = 0; j <= 16 * k; j++) {
          const q = j / 16;
          const px = xs(from + dir * q);
          const py = y - 8 - Math.sin(q * Math.PI) * 26;
          if (j === 0) g.c.moveTo(px, py);
          else g.c.lineTo(px, py);
        }
        g.c.stroke();
      }
      g.dot(xs(a), y, 9, C.plum);
      walker(g, xs(pos), y - 12 - hop, Math.abs(facing) < 0.08 ? 0.08 * Math.sign(facing || 1) : facing, walked * Math.PI);
      if (Math.abs(facing) > 0.3) arrow(g, xs(pos), y - 150 - hop, xs(pos) + 34 * Math.sign(facing), y - 150 - hop, C.teal, 4);
      if (done) g.dot(xs(a + f * b), y, 10, C.coral);

      const parts = [int(lang, a), op, br(lang, b)];
      if (done) parts.push("=", int(lang, a + f * b));
      sum(g, parts, W / 2, 70, 56, [tone(a), C.ink, tone(b), C.ink, C.coral]);
      const absb = Math.abs(b);
      let line: string;
      if (s < 0.3) line = lang === "id" ? `Mulai di ${int(lang, a)}, menghadap ke kanan.` : `Start at ${int(lang, a)}, facing right.`;
      else if (s < turnEnd) line = lang === "id" ? "Pengurangan: balik badan." : "Subtracting: turn around.";
      else if (!done)
        line =
          b > 0
            ? lang === "id"
              ? `Maju ${absb} langkah.`
              : `Walk ${absb} step${absb === 1 ? "" : "s"} forwards.`
            : lang === "id"
              ? `${int(lang, b)} negatif: mundur ${absb} langkah.`
              : `${int(lang, b)} is negative: walk ${absb} step${absb === 1 ? "" : "s"} backwards.`;
      else line = lang === "id" ? `Berhenti di ${int(lang, a + f * b)}.` : `You stop at ${int(lang, a + f * b)}.`;
      fit(g, line, W / 2, 145, 30, 880, C.ink);

      g.card(80, 445, 410, 64, C.field, 0);
      fit(g, L.plus, 285, 477, 22, 380, C.ink);
      g.card(510, 445, 410, 64, C.field, 0);
      fit(g, L.neg, 715, 477, 22, 380, C.ink);
      const busy = start !== null && !done;
      g.button("other", L.other, W / 2 - 330, 555, 300, 52, C.soft, !busy);
      g.button("walk", L.walk, W / 2 + 30, 555, 300, 52, C.cobalt, !busy);
    },
  };
}

/** Positive and negative counters: each plus with a minus makes a zero pair, and the pairs fold away. */
function counters(lang: Lang): Scene {
  let p = 5;
  let n = 3;
  let start: number | null = null;
  let now = 0;
  const sx = (i: number) => 140 + i * 78;
  const PY = 220;
  const NY = 340;
  const MID = 280;
  const counter = (g: Ink, x: number, y: number, plus: boolean, r = 28) => {
    g.dot(x + 2, y + 4, r, "rgba(70, 50, 25, 0.22)");
    g.dot(x, y, r, plus ? C.teal : C.coral);
    g.text(plus ? "+" : "−", x, y - 2, r * 1.3, C.paper, "center", true);
  };
  const L =
    lang === "id"
      ? { add: "TAMBAH +1", sub: "TAMBAH −1", pair: "PASANGKAN", clear: "KOSONGKAN", pos: "keping positif", neg: "keping negatif", zero: "pasangan nol" }
      : { add: "ADD +1", sub: "ADD −1", pair: "PAIR UP", clear: "CLEAR", pos: "positive counters", neg: "negative counters", zero: "a zero pair" };
  return {
    press(id) {
      if (start !== null) return;
      if (id === "+") p = Math.min(10, p + 1);
      if (id === "-") n = Math.min(10, n + 1);
      if (id === "pair" && Math.min(p, n) > 0) start = now;
      if (id === "clear") p = n = 0;
    },
    draw(g, t) {
      now = t;
      const m = Math.min(p, n);
      if (start !== null && t - start > 1.7) {
        p -= m;
        n -= m;
        start = null;
      }
      const pairing = start !== null;
      g.text(L.pos, 60, PY - 48, 20, C.teal, "left", true);
      g.text(L.neg, 60, NY + 48, 20, C.coral, "left", true);
      for (let i = 0; i < Math.max(p, n); i++) {
        const k = pairing && i < m ? ease(t, (start as number) + i * 0.06, 0.7) : 0;
        const fade = pairing && i < m ? ease(t, (start as number) + 0.85, 0.6) : 0;
        g.c.globalAlpha = 1 - fade;
        if (i < p) counter(g, sx(i), lerp(PY, MID - 30, k), true);
        if (i < n) counter(g, sx(i), lerp(NY, MID + 30, k), false);
        g.c.globalAlpha = 1;
        if (fade > 0) g.text("0", sx(i), MID, 40 * (0.6 + 0.4 * fade), C.soft, "center", true);
      }
      // The sum the counters show.
      const parts = p === 0 && n === 0 ? ["0"] : n === 0 ? [int(lang, p)] : p === 0 ? [int(lang, -n)] : [int(lang, p), "+", br(lang, -n), "=", int(lang, p - n)];
      sum(g, parts, W / 2, 75, 56, parts.length > 1 ? [C.teal, C.ink, C.coral, C.ink, tone(p - n)] : [tone(p - n)]);

      g.card(280, 412, 440, 72, C.field, 0);
      counter(g, 330, 448, true, 20);
      counter(g, 385, 448, false, 20);
      g.text(`= 0  ${L.zero}`, 420, 448, 26, C.ink, "left", true);

      g.button("+", L.add, 40, 555, 210, 52, C.teal, !pairing && p < 10);
      g.button("-", L.sub, 265, 555, 210, 52, C.coral, !pairing && n < 10);
      g.button("pair", L.pair, 490, 555, 240, 52, C.cobalt, !pairing && m > 0);
      g.button("clear", L.clear, 745, 555, 215, 52, C.soft, !pairing);
    },
  };
}

/** Multiplication as equal jumps from zero: 3 × (−2) is three jumps of −2. */
function jumps(lang: Lang): Scene {
  let a = 3;
  let b = -2;
  let start = 0.4;
  let now = 0;
  const step = 35;
  const y = 380;
  const xs = (v: number) => 500 + v * step;
  const L = lang === "id" ? { jump: "LOMPAT", times: "kali", of: "lompat" } : { jump: "JUMP", times: "times", of: "jump" };
  return {
    press(id) {
      if (id === "a-") a = Math.max(1, a - 1);
      if (id === "a+") a = Math.min(4, a + 1);
      if (id === "b-") b = b - 1 === 0 ? -1 : Math.max(-3, b - 1);
      if (id === "b+") b = b + 1 === 0 ? 1 : Math.min(3, b + 1);
      start = now;
    },
    draw(g, t) {
      now = t;
      numberLine(g, lang, y, 12, step, 18);
      const each = 0.7;
      let pos = 0;
      for (let i = 0; i < a; i++) {
        const k = ease(t, start + i * each, each * 0.85);
        if (k <= 0) break;
        const from = i * b;
        g.c.strokeStyle = tone(b);
        g.c.lineWidth = 4;
        g.c.beginPath();
        for (let j = 0; j <= 24 * k; j++) {
          const q = j / 24;
          const px = xs(from + b * q);
          const py = y - 10 - Math.sin(q * Math.PI) * (40 + 18 * Math.abs(b));
          if (j === 0) g.c.moveTo(px, py);
          else g.c.lineTo(px, py);
        }
        g.c.stroke();
        if (k >= 1) g.text(int(lang, b), xs(from + b / 2), y - 30 - (40 + 18 * Math.abs(b)), 22, tone(b), "center", true);
        pos = from + b * k;
      }
      // The frog that makes the jumps.
      const lift = (() => {
        const q = ((t - start) / each) % 1;
        return t - start < a * each && t > start ? Math.sin(Math.min(1, q / 0.85) * Math.PI) * (40 + 18 * Math.abs(b)) : 0;
      })();
      g.dot(xs(pos), y - 22 - lift, 16, C.plum);
      g.dot(xs(pos) + 6 * Math.sign(b), y - 28 - lift, 5, C.paper);
      g.dot(xs(pos) + 7 * Math.sign(b), y - 28 - lift, 2, C.ink);

      const done = t > start + a * each;
      const parts = [String(a), "×", br(lang, b), "=", int(lang, a * b)];
      sum(g, parts, W / 2, 65, 56, [C.ink, C.ink, tone(b), C.ink, tone(a * b)]);
      const again = Array.from({ length: a }, () => br(lang, b)).join(" + ");
      g.c.globalAlpha = done ? ease(t, start + a * each, 0.5) : 0.35;
      fit(g, `${again} = ${int(lang, a * b)}`, W / 2, 135, 32, 880, C.soft);
      g.c.globalAlpha = 1;

      g.button("a-", "−", 40, 555, 56, 52, C.soft, a > 1);
      g.text(`${a} ${L.times}`, 168, 581, 24, C.ink, "center", true);
      g.button("a+", "+", 240, 555, 56, 52, C.soft, a < 4);
      g.button("b-", "−", 340, 555, 56, 52, C.cobalt, b > -3);
      g.text(`${L.of} ${int(lang, b)}`, 478, 581, 24, tone(b), "center", true);
      g.button("b+", "+", 560, 555, 56, 52, C.coral, b < 3);
      g.button("jump", L.jump, 680, 555, 280, 52, C.teal);
    },
  };
}

/** A table where the first number goes down by one each row: the answers keep their pattern past zero, and the sign rules appear. */
function pattern(lang: Lang): Scene {
  let f = -2;
  let rows = 4;
  let added = -10;
  let now = 0;
  const rowY = (i: number) => 92 + i * 56;
  const RULES = ["(+) × (+) = (+)", "(+) × (−) = (−)", "(−) × (+) = (−)", "(−) × (−) = (+)"];
  const L =
    lang === "id"
      ? { next: "BARIS BERIKUTNYA", again: "ULANGI", rules: "aturan tanda" }
      : { next: "NEXT ROW", again: "START OVER", rules: "sign rules" };
  return {
    press(id) {
      if (id === "next" && rows < 7) {
        rows += 1;
        added = now;
      }
      if (id === "again") rows = 4;
      if (id === "swap") {
        f = -f;
        rows = 4;
      }
    },
    draw(g, t) {
      now = t;
      for (let i = 0; i < rows; i++) {
        const a = 3 - i;
        const y = rowY(i);
        const k = i === rows - 1 && rows > 4 ? ease(t, added, 0.6) : ease(t, i * 0.3, 0.6);
        const dx = (1 - k) * -60;
        g.c.globalAlpha = k;
        g.card(60 + dx, y - 25, 440, 50, a < 0 ? "#fff3d1" : C.paper, 0.8);
        g.text(`${int(lang, a)} × ${br(lang, f)}`, 300 + dx, y, 32, C.ink, "right", true);
        g.text("=", 330 + dx, y, 32, C.ink, "center", true);
        g.text(int(lang, a * f), 360 + dx, y, 36, tone(a * f), "left", true);
        if (i > 0) {
          // Each row the answer changes by the same amount.
          g.c.strokeStyle = C.plum;
          g.c.lineWidth = 3;
          g.c.beginPath();
          g.c.arc(500, y - 28, 22, -Math.PI / 2, Math.PI / 2);
          g.c.stroke();
          g.line(500, y - 6, 510, y - 14, C.plum, 3);
          g.line(500, y - 6, 510, y + 2, C.plum, 3);
          g.text(f < 0 ? "+2" : "−2", 532, y - 28, 22, C.plum, "left", true);
        }
        g.c.globalAlpha = 1;
      }
      // The sign rules the table has shown so far.
      g.card(640, 70, 310, 360, C.paper, 1);
      g.text(L.rules, 795, 105, 26, C.soft, "center", true);
      const seen = new Set<number>();
      for (let i = 0; i < rows; i++) {
        const a = 3 - i;
        if (a === 0) continue;
        seen.add((a > 0 ? 0 : 2) + (f > 0 ? 0 : 1));
      }
      const newest = 3 - (rows - 1);
      const fresh = newest === 0 ? -1 : (newest > 0 ? 0 : 2) + (f > 0 ? 0 : 1);
      RULES.forEach((r, i) => {
        const y = 165 + i * 70;
        if (seen.has(i)) {
          const glow = i === fresh && t - added < 3 ? pulse(t) : 0;
          g.card(660, y - 26, 270, 52, i === 3 || i === 0 ? "#ffe9b8" : "#d6e4f7", 0.6 + glow * 0.6);
        }
        g.text(r, 795, y, 30, seen.has(i) ? C.ink : "rgba(93, 98, 112, 0.35)", "center", true);
      });
      g.button("next", L.next, 40, 555, 320, 52, C.cobalt, rows < 7);
      g.button("again", L.again, 380, 555, 230, 52, C.soft, rows > 4);
      g.button("swap", f < 0 ? `× ${int(lang, 2)}` : `× ${br(lang, -2)}`, 630, 555, 200, 52, C.teal);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Adding is walking on the number line. Face right for +, turn around for −, and walk backwards when the number is negative.",
        id: "Menjumlah sama dengan berjalan di garis bilangan. Hadap kanan untuk +, balik badan untuk −, dan jalan mundur bila bilangannya negatif.",
      },
      scene: walk,
    },
    {
      say: {
        en: "A positive and a negative counter together make zero. Put in counters, then pair them up and see what is left.",
        id: "Satu keping positif dan satu keping negatif bersama-sama bernilai nol. Masukkan keping, lalu pasangkan dan lihat sisanya.",
      },
      scene: counters,
    },
    {
      say: {
        en: "Multiplying is making equal jumps from zero. Three jumps of −2 land on −6, so 3 × (−2) = −6.",
        id: "Perkalian adalah lompatan yang sama besar dari nol. Tiga lompatan −2 berhenti di −6, jadi 3 × (−2) = −6.",
      },
      scene: jumps,
    },
    {
      say: {
        en: "Follow the pattern row by row. Past zero the answers keep changing by the same step, and that shows the sign rules.",
        id: "Ikuti polanya baris demi baris. Melewati nol, hasilnya tetap berubah dengan langkah yang sama, dan dari situ terlihat aturan tandanya.",
      },
      scene: pattern,
    },
  ],
};
