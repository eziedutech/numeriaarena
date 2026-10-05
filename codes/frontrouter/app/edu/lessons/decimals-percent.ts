import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp, pulse } from "../ink";
import { dec, gcd, num, sum } from "../parts";

/** How many digits a number has after its decimal point, as written. */
const places = (v: number) => (String(v).split(".")[1] ?? "").length;

/** The digit of v in the column worth 10^p, for p from 1 down to -3. */
const digit = (v: number, p: number) => Math.floor(Math.round(v * 1000) / 10 ** (p + 3)) % 10;

/** Text shrunk until it fits `maxW`, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, maxW: number, size: number, color: string) {
  let z = size;
  while (z > 18 && g.width(s, z, true) > maxW) z -= 1;
  g.text(s, x, y, z, color, "center", true);
}

const PAIRS: [number, number, number, number][] = [
  [0.7, 1, 0.65, 2],
  [2.45, 2, 2.5, 1],
  [1.08, 2, 1.8, 1],
  [0.305, 3, 0.35, 2],
  [3.2, 1, 3.2, 2],
  [0.9, 1, 0.899, 3],
];

/** Two decimals in a place value chart, compared column by column from the left until one digit is bigger. */
function compare(lang: Lang): Scene {
  let i = 0;
  let changed = 0;
  let now = 0;
  const names = lang === "id" ? ["satuan", "persepuluhan", "perseratusan", "perseribuan"] : ["ones", "tenths", "hundredths", "thousandths"];
  const colX = [220, 390, 520, 650];
  const cw = 124;
  return {
    press() {
      i = (i + 1) % PAIRS.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [A, da, B, db] = PAIRS[i];
      const pa = [0, -1, -2, -3].map((p) => digit(A, p));
      const pb = [0, -1, -2, -3].map((p) => digit(B, p));
      const at = pa.findIndex((d, c) => d !== pb[c]);
      const last = at < 0 ? 3 : at;
      const sweep = (c: number) => changed + 1 + 0.8 * c;
      const decided = sweep(last) + 0.5;
      colX.forEach((x, c) => {
        g.text(names[c], x + cw / 2, 100, 18, C.soft, "center", false);
        const on = t >= sweep(c) && (c === last || t < sweep(c + 1)) && c <= last;
        g.card(x, 125, cw, 190, on ? (c === at && t > decided ? C.sun : "#fff0c4") : c === 0 ? "#f8efdc" : C.paper, on ? 1.3 : 0.8);
        const row = (ds: number[], d: number, y: number, other: number[]) => {
          const filler = c > d;
          const k = filler ? ease(t, changed + 0.4, 0.5) : 1;
          if (filler && k <= 0) return;
          const big = c === at && t > decided && ds[c] > other[c];
          g.c.globalAlpha = filler ? 0.4 * k : 1;
          g.text(String(ds[c]), x + cw / 2, y, big ? 64 : 54, big ? C.coral : c === 0 ? C.ink : C.cobalt, "center", true);
          g.c.globalAlpha = 1;
        };
        row(pa, da, 175, pb);
        row(pb, db, 265, pa);
      });
      g.dot(colX[0] + cw + 23, 195, 8, C.ink);
      g.dot(colX[0] + cw + 23, 285, 8, C.ink);
      const sign = at < 0 ? "=" : pa[at] > pb[at] ? ">" : "<";
      const k = ease(t, decided, 0.5);
      g.c.globalAlpha = k;
      g.text(sign, 860, 220, 90 + 10 * pulse(t), C.coral, "center", true);
      g.text(`${dec(lang, A, da)} ${sign} ${dec(lang, B, db)}`, W / 2, 380, 48, C.ink, "center", true);
      const why =
        at < 0
          ? lang === "id"
            ? "semua nilai tempat sama: keduanya sama besar"
            : "every place is the same: they are equal"
          : `${names[at]}: ${pa[at]} ${sign} ${pb[at]}`;
      fit(g, why, W / 2, 440, 880, 28, C.coral);
      g.c.globalAlpha = 1;
      if (t - changed < 1) g.text(lang === "id" ? "tempat kosong boleh diisi 0" : "an empty place can be filled with 0", W / 2, 440, 22, C.soft, "center", true);
      g.button("new", lang === "id" ? "PASANGAN LAIN" : "ANOTHER PAIR", W / 2 - 140, 555, 280, 52, C.cobalt);
    },
  };
}

const ADDS: [number, number][] = [
  [3.5, 12.47],
  [0.75, 2.6],
  [4.08, 1.95],
  [15.3, 0.825],
  [7.46, 2.7],
];

/** Two decimals written carelessly, slid until their commas line up, gaps filled with 0, then added from the right. */
function add(lang: Lang): Scene {
  let i = 0;
  let changed = 0;
  let now = 0;
  const cx = (p: number) => (p >= 0 ? 440 - p * 60 : 530 + (-p - 1) * 60);
  const commaX = 485;
  return {
    press(id) {
      if (id === "new") i = (i + 1) % ADDS.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const s = t - changed;
      const [A, B] = ADDS[i];
      const dA = places(A);
      const dB = places(B);
      const md = Math.max(dA, dB);
      const R = A + B;
      const slide = ease(s, 0.8, 1);
      const fill = ease(s, 2, 0.5);
      // The comma column, once both commas sit in it.
      g.c.globalAlpha = slide;
      g.c.setLineDash([6, 6]);
      g.line(commaX, 110, commaX, 360, C.coral, 2);
      g.c.setLineDash([]);
      g.c.globalAlpha = 1;
      const row = (v: number, d: number, y: number) => {
        const str = dec(lang, v, d);
        const ni = str.length - (d ? d + 1 : 0);
        [...str].forEach((ch, j) => {
          const end = j < ni ? cx(ni - 1 - j) : j === ni ? commaX : cx(-(j - ni));
          const x = lerp(360 + j * 60, end, slide);
          g.text(ch, x, y, 54, j === ni ? C.coral : C.ink, "center", true);
        });
        for (let p = -d - 1; p >= -md; p--) {
          g.c.globalAlpha = 0.45 * fill;
          g.text("0", cx(p), y, 54, C.soft, "center", true);
          g.c.globalAlpha = 1;
        }
      };
      row(A, dA, 160);
      row(B, dB, 240);
      g.text("+", 300, 240, 54, C.soft, "center", true);
      g.line(290, 282, 720, 282, C.ink, 4);
      // Column by column from the right, carrying a ten to the left.
      const a = Math.round(A * 1000);
      const b = Math.round(B * 1000);
      const top = R >= 10 ? 1 : 0;
      let carry = 0;
      for (let p = -md, c = 0; p <= top; p++, c++) {
        const at = 2.8 + 0.8 * c;
        const total = Math.floor(a / 10 ** (p + 3)) % 10 + (Math.floor(b / 10 ** (p + 3)) % 10) + carry;
        const k = ease(s, at, 0.4);
        if (k > 0) {
          g.c.fillStyle = `rgba(255, 209, 102, ${0.4 * (1 - ease(s, at + 0.5, 0.4))})`;
          g.c.fillRect(cx(p) - 28, 120, 56, 240);
          g.c.globalAlpha = k;
          g.text(String(total % 10), cx(p), 330 - (1 - k) * 16, 54, C.cobalt, "center", true);
          g.c.globalAlpha = 1;
        }
        if (p === 0 && k > 0) {
          g.c.globalAlpha = k;
          g.text(lang === "id" ? "," : ".", commaX, 330, 54, C.coral, "center", true);
          g.c.globalAlpha = 1;
        }
        carry = total >= 10 ? 1 : 0;
        if (carry && p < top) {
          const kc = ease(s, at + 0.3, 0.4);
          g.c.globalAlpha = kc;
          g.text("1", lerp(cx(p), cx(p + 1), kc), lerp(330, 108, kc), 26, C.coral, "center", true);
          g.c.globalAlpha = 1;
        }
      }
      const doneAt = 2.8 + 0.8 * (top + md + 1);
      g.c.globalAlpha = ease(s, doneAt, 0.5);
      g.card(W / 2 - 270, 384, 540, 66, C.sun, 1);
      g.text(`${dec(lang, A, dA)} + ${dec(lang, B, dB)} = ${dec(lang, R, md)}`, W / 2, 417, 36, C.ink, "center", true);
      g.c.globalAlpha = 1;
      fit(
        g,
        lang === "id" ? "luruskan komanya, isi tempat kosong dengan 0, lalu jumlahkan dari kanan" : "line up the commas, fill the gaps with 0, then add from the right",
        W / 2,
        490,
        900,
        24,
        C.soft,
      );
      g.button("again", lang === "id" ? "ULANGI" : "AGAIN", W / 2 - 250, 555, 220, 52, C.soft);
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "OTHER NUMBERS", W / 2 + 30, 555, 240, 52, C.cobalt);
    },
  };
}

const MANTISSA: [number, number][] = [
  [345, -2],
  [27, -1],
  [1608, -3],
  [5, 0],
  [72, -2],
];
const OPS = [10, 100, 1000];

/** Digits slide past a fixed comma: one column left for each × 10, one right for each : 10. */
function shift(lang: Lang): Scene {
  let mi = 0;
  let [m, e] = MANTISSA[0];
  let from = e;
  let last: { op: string; f: number; old: number } | null = null;
  let changed = -10;
  let now = 0;
  const cw = 92;
  const x0 = 71;
  const colX = (p: number) => (p >= 0 ? x0 + (4 - p) * cw + cw / 2 : x0 + 5 * cw + 30 + (-p - 1) * cw + cw / 2);
  const value = (ee: number) => m * 10 ** ee;
  const show = (ee: number) => dec(lang, value(ee), Math.max(0, -ee));
  return {
    press(id) {
      if (id === "new") {
        mi = (mi + 1) % MANTISSA.length;
        [m, e] = MANTISSA[mi];
        from = e;
        last = null;
        changed = now;
        return;
      }
      const f = Number(id.slice(1));
      const k = Math.round(Math.log10(f));
      const old = e;
      from = e;
      e += id[0] === "x" ? k : -k;
      last = { op: id[0], f, old };
      changed = now;
    },
    draw(g, t) {
      now = t;
      const nd = String(m).length;
      const k = ease(t, changed, 0.8);
      for (let p = 4; p >= -4; p--) {
        const x = colX(p) - cw / 2;
        g.card(x + 3, 70, cw - 6, 250, p >= 0 ? "#f8efdc" : C.paper, 0.6);
        const label = p >= 0 ? num(lang, 10 ** p) : dec(lang, 10 ** p, -p);
        g.text(label, colX(p), 96, 20, C.soft, "center", true);
      }
      // The comma never moves; it glows while the digits pass it.
      const comma = x0 + 5 * cw + 15;
      g.dot(comma, 232, 10 + 4 * (k < 1 ? pulse(t, 0.5) : 0), C.coral);
      // Zeros that hold the empty places, shown once the digits settle.
      const hi = e + nd - 1;
      const kz = ease(t, changed + 0.8, 0.4);
      g.c.globalAlpha = 0.45 * kz;
      for (let p = 0; p < e; p++) g.text("0", colX(p), 200, 64, C.soft, "center", true);
      if (hi < 0) for (let p = 0; p > hi; p--) g.text("0", colX(p), 200, 64, C.soft, "center", true);
      g.c.globalAlpha = 1;
      [...String(m)].forEach((ch, j) => {
        const pNew = e + nd - 1 - j;
        const pOld = from + nd - 1 - j;
        const x = lerp(colX(pOld), colX(pNew), k);
        g.card(x - 34, 152 - 6 * Math.sin(k * Math.PI), 68, 96, C.cobalt, k < 1 ? 1.6 : 1);
        g.text(ch, x, 200 - 6 * Math.sin(k * Math.PI), 64, C.paper, "center", true);
      });
      const div = lang === "id" ? ":" : "÷";
      if (last) {
        const sign = last.op === "x" ? "×" : div;
        g.c.globalAlpha = ease(t, changed + 0.6, 0.4);
        g.text(`${show(last.old)} ${sign} ${num(lang, last.f)} = ${show(e)}`, W / 2, 380, 44, C.ink, "center", true);
        const n = Math.round(Math.log10(last.f));
        const note =
          lang === "id"
            ? `${sign} ${num(lang, last.f)}: setiap angka bergeser ${n} tempat ke ${last.op === "x" ? "kiri" : "kanan"}`
            : `${sign} ${num(lang, last.f)}: every digit moves ${n} place${n > 1 ? "s" : ""} to the ${last.op === "x" ? "left" : "right"}`;
        fit(g, note, W / 2, 432, 880, 24, C.teal);
        g.c.globalAlpha = 1;
      } else g.text(show(e), W / 2, 380, 48, C.ink, "center", true);
      OPS.forEach((f, i) => {
        const n = i + 1;
        g.button(`x${f}`, `× ${num(lang, f)}`, 50 + i * 152, 470, 140, 52, C.teal, hi + n <= 4);
        g.button(`d${f}`, `${div} ${num(lang, f)}`, 512 + i * 152, 470, 140, 52, C.coral, e - n >= -4);
      });
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W / 2 - 140, 555, 280, 52, C.cobalt);
    },
  };
}

const PRESETS = [10, 25, 50, 75];

/** A square of a hundred, coloured by sweeping or by the buttons: n% is n out of 100, also a fraction and a decimal. */
function percent(lang: Lang): Scene {
  let n = 25;
  let painting = false;
  let changed = 0;
  let now = 0;
  const x = 50;
  const y = 40;
  const s = 46;
  const cell = (p: Pt) => {
    const cx = Math.floor((p.x - x) / s);
    const cy = Math.floor((p.y - y) / s);
    return cx >= 0 && cx < 10 && cy >= 0 && cy < 10 ? cy * 10 + cx : null;
  };
  return {
    press(id) {
      if (id === "+1") n = clamp(n + 1, 0, 100);
      else if (id === "-1") n = clamp(n - 1, 0, 100);
      else n = Number(id);
      changed = now;
    },
    down(p) {
      const c = cell(p);
      if (c === null) return;
      painting = true;
      n = c + 1;
      return true;
    },
    move(p) {
      const c = painting ? cell(p) : null;
      if (c !== null) n = c + 1;
    },
    up() {
      painting = false;
      changed = now;
    },
    draw(g, t) {
      now = t;
      g.card(x, y, s * 10, s * 10, C.paper, 1);
      for (let i = 0; i < n; i++) {
        const k = painting ? 1 : ease(t, changed + 0.006 * i, 0.25);
        g.c.globalAlpha = Math.max(k, 0.15);
        g.c.fillStyle = Math.floor(i / 10) % 2 ? "#e9625c" : C.coral;
        g.c.fillRect(x + (i % 10) * s, y + Math.floor(i / 10) * s, s, s);
        g.c.globalAlpha = 1;
      }
      for (let i = 1; i < 10; i++) {
        g.line(x + i * s, y, x + i * s, y + 10 * s, "rgba(58, 63, 75, 0.25)", 1);
        g.line(x, y + i * s, x + 10 * s, y + i * s, "rgba(58, 63, 75, 0.35)", 1);
      }
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(x, y, s * 10, s * 10);
      g.text(lang === "id" ? "atau usap kotaknya" : "or sweep across the square", x + 5 * s, 540, 22, C.soft, "center", true);
      // The same amount written three more ways.
      const cx = 760;
      const pop = 1 + 0.1 * (1 - ease(t, changed, 0.4));
      g.c.save();
      g.c.translate(cx, 90);
      g.c.scale(pop, pop);
      g.text(`${n}%`, 0, 0, 80, C.coral, "center", true);
      g.c.restore();
      g.text(lang === "id" ? `${n} dari 100 kotak` : `${n} out of 100 squares`, cx, 150, 22, C.soft, "center", true);
      sum(g, ["=", [n, 100]], cx, 220, 40, [C.soft, C.coral]);
      const k = gcd(n, 100);
      const kf = ease(t, changed + 0.4, 0.4);
      if (n > 0 && k > 1) {
        g.c.globalAlpha = kf;
        sum(g, ["=", [n / k, 100 / k]], cx, 320, 40, [C.soft, C.plum]);
        g.c.globalAlpha = 1;
      }
      g.c.globalAlpha = ease(t, changed + 0.7, 0.4);
      sum(g, ["=", dec(lang, n / 100, 2)], cx, 410, 48, [C.soft, C.cobalt]);
      g.c.globalAlpha = 1;
      PRESETS.forEach((v, i) => g.button(String(v), `${v}%`, 585 + i * 92, 470, 82, 52, C.plum, v !== n));
      g.button("-1", "−1", 620, 555, 90, 52, C.coral, n > 0);
      g.button("+1", "+1", 810, 555, 90, 52, C.teal, n < 100);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "To compare decimals, line them up in the place value chart and look from the left. The first place where the digits differ decides.",
        id: "Untuk membandingkan desimal, susun di tabel nilai tempat dan lihat dari kiri. Tempat pertama yang angkanya berbeda menentukan.",
      },
      scene: compare,
    },
    {
      say: {
        en: "Before adding decimals, line up the commas so tenths sit under tenths. Fill empty places with 0 and add from the right.",
        id: "Sebelum menjumlahkan desimal, luruskan komanya supaya persepuluhan di bawah persepuluhan. Isi tempat kosong dengan 0, lalu jumlahkan dari kanan.",
      },
      scene: add,
    },
    {
      say: {
        en: "Multiplying by 10, 100 or 1000 slides the digits 1, 2 or 3 places to the left of the comma; dividing slides them right.",
        id: "Dikali 10, 100, atau 1.000, angka-angkanya bergeser 1, 2, atau 3 tempat ke kiri koma; dibagi, bergeser ke kanan.",
      },
      scene: shift,
    },
    {
      say: {
        en: "Percent means out of a hundred. 25% colours 25 of the 100 squares: that is 25/100, or 1/4, or 0.25.",
        id: "Persen artinya per seratus. 25% mewarnai 25 dari 100 kotak: sama dengan 25/100, atau 1/4, atau 0,25.",
      },
      scene: percent,
    },
  ],
};
