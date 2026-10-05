import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp, pulse } from "../ink";
import { dec, num, wrap } from "../parts";

const HUE = [C.coral, C.sun, C.teal, C.cobalt, C.plum, C.coral, C.teal];
const NAMES = ["Ani", "Budi", "Citra", "Dodi", "Eka", "Fajar", "Gita"];

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** True when a value has at most one decimal place. */
const exact = (v: number) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;

/** A value written whole when it is whole, else to one decimal place. */
const show = (lang: Lang, v: number) => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? num(lang, r) : dec(lang, r, 1);
};

/** The division sign each language writes. */
const div = (lang: Lang) => (lang === "id" ? ":" : "÷");

/** A dashed level line across the chart. */
function dashed(g: Ink, x1: number, x2: number, y: number, color: string) {
  g.c.setLineDash([10, 7]);
  g.line(x1, y, x2, y, color, 3);
  g.c.setLineDash([]);
}

/** Towers of paper blocks, one for each child; levelling them out shares the blocks until every tower is the mean. */
function level(lang: Lang): Scene {
  const v = [3, 7, 4, 8, 3];
  const shown = v.map(() => 0);
  let flat = false;
  let last = 0;
  const U = 32;
  const BASE = 500;
  const X0 = 50;
  const SLOT = 124;
  return {
    press(id) {
      if (id === "level") {
        flat = !flat;
        return;
      }
      const i = Number(id.slice(1));
      v[i] = clamp(v[i] + (id[0] === "+" ? 1 : -1), 1, 10);
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      const total = v.reduce((a, b) => a + b, 0);
      const mean = total / v.length;
      v.forEach((n, i) => {
        if (t > 0.2 + i * 0.15) shown[i] += ((flat ? mean : n) - shown[i]) * (1 - Math.exp(-dt * 4));
      });
      fit(g, lang === "id" ? "banyak buku yang dibaca bulan ini" : "books read this month", X0 + 2.5 * SLOT, 40, 600, 30);
      v.forEach((_, i) => {
        const cx = X0 + SLOT * (i + 0.5);
        const h = shown[i];
        const full = Math.floor(h + 1e-6);
        for (let b = 0; b < full; b++) g.card(cx - 40, BASE - (b + 1) * U + 2, 80, U - 4, HUE[i], 0.6);
        const part = h - full;
        if (part > 0.03) g.card(cx - 40, BASE - h * U + 2, 80, Math.max(1, part * U - 4), HUE[i], 0.6);
        g.text(show(lang, h), cx, BASE - h * U - 20, 24, C.ink, "center", true);
        g.text(NAMES[i], cx, 522, 20, C.soft, "center", true);
        g.button(`-${i}`, "−", cx - 56, 555, 52, 52, C.coral, v[i] > 1 && !flat);
        g.button(`+${i}`, "+", cx + 4, 555, 52, 52, C.teal, v[i] < 10 && !flat);
      });
      g.line(X0, BASE, X0 + 5 * SLOT, BASE, C.ink, 3);
      const my = BASE - mean * U;
      dashed(g, X0, X0 + 5 * SLOT, my, C.coral);
      g.text(`${lang === "id" ? "rata-rata" : "mean"} ${show(lang, mean)}`, X0 + 5 * SLOT, my - 16, 20, C.coral, "right", true);

      const px = 700;
      const pw = 250;
      g.card(px, 90, pw, 300, C.paper, 1);
      g.text(lang === "id" ? "jumlah data" : "total", px + pw / 2, 122, 22, C.soft, "center", true);
      fit(g, v.map((n) => num(lang, n)).join(" + "), px + pw / 2, 162, pw - 20, 26, C.ink);
      g.text(`= ${num(lang, total)}`, px + pw / 2, 200, 28, C.ink, "center", true);
      g.crease(px + 16, 232, px + pw - 16, 232);
      g.text(lang === "id" ? "dibagi banyak data" : "shared by the count", px + pw / 2, 262, 20, C.soft, "center", true);
      const line = `${num(lang, total)} ${div(lang)} ${num(lang, v.length)} = ${show(lang, mean)}`;
      fit(g, line, px + pw / 2, 306, pw - 20, 36, C.cobalt);
      g.text(lang === "id" ? "rata-rata" : "mean", px + pw / 2, 350, 24, C.coral, "center", true);
      const label = flat ? (lang === "id" ? "KEMBALIKAN" : "PUT BACK") : lang === "id" ? "RATAKAN" : "LEVEL OUT";
      g.button("level", label, px, 410, pw, 60, flat ? C.soft : C.coral);
      const rule = lang === "id" ? "rata-rata = jumlah data : banyak data" : "mean = total ÷ number of values";
      wrap(g, rule, pw, 20).forEach((l, i) => g.text(l, px + pw / 2, 498 + i * 24, 20, C.ink));
    },
  };
}

interface Card {
  v: number;
  from: number;
  to: number;
  start: number;
}

/** Height cards that sort themselves when asked; folding the sorted row from both ends leaves the median in the middle. */
function median(lang: Lang): Scene {
  const pick = () => 125 + Math.floor(Math.random() * 21);
  let cards: Card[] = [138, 129, 141, 133, 127, 135, 131].map((v, i) => ({ v, from: i, to: i, start: -9 }));
  let fold = -9;
  let dealt = -9;
  let now = 0;
  const slot = (c: Card) => lerp(c.from, c.to, ease(now, c.start, 0.8));
  const ordered = () => [...cards].sort((a, b) => a.to - b.to);
  const sorted = () => ordered().every((c, i, o) => i === 0 || o[i - 1].v <= c.v);
  return {
    press(id) {
      if (id === "sort") {
        [...cards]
          .sort((a, b) => a.v - b.v)
          .forEach((c, i) => {
            c.from = slot(c);
            c.to = i;
            c.start = now + i * 0.08;
          });
        fold = -9;
      }
      if (id === "fold") fold = fold < 0 ? now : -9;
      if (id === "add" && cards.length < 8) {
        cards.push({ v: pick(), from: cards.length + 0.3, to: cards.length, start: now });
        fold = -9;
      }
      if (id === "remove" && cards.length > 3) {
        const lastCard = ordered()[cards.length - 1];
        cards = cards.filter((c) => c !== lastCard);
        fold = -9;
      }
      if (id === "new") {
        cards = cards.map((_, i) => ({ v: pick(), from: i, to: i, start: -9 }));
        dealt = now;
        fold = -9;
      }
    },
    draw(g, t) {
      now = t;
      const n = cards.length;
      const step = 110;
      const x0 = (W - (n * step - 14)) / 2;
      const isSorted = sorted();
      const pairs = Math.floor((n - 1) / 2);
      const o = ordered();
      const folding = fold >= 0;
      const done = folding && t > fold + pairs * 0.55 + 0.3;
      const mids = n % 2 ? [(n - 1) / 2] : [n / 2 - 1, n / 2];
      const cx = (s: number) => x0 + s * step + 48;

      fit(g, lang === "id" ? "tinggi badan anak-anak (cm)" : "children's heights (cm)", W / 2, 44, 700, 30);
      if (folding) {
        g.c.setLineDash([8, 6]);
        g.line(W / 2, 150, W / 2, 380, C.plum, 2);
        g.c.setLineDash([]);
        for (let j = 0; j < pairs; j++) {
          const k = ease(t, fold + j * 0.55, 0.5);
          if (k <= 0) continue;
          const a = cx(j);
          const b = cx(n - 1 - j);
          const top = 185 - (pairs - j) * 22;
          g.c.strokeStyle = "rgba(155, 107, 196, 0.7)";
          g.c.lineWidth = 3;
          g.c.beginPath();
          g.c.moveTo(a, 196);
          g.c.quadraticCurveTo(lerp(a, (a + b) / 2, k), top, lerp(a, b, k), 196);
          g.c.stroke();
        }
      }
      o.forEach((c, idx) => {
        const s = slot(c);
        const k = ease(t, c.start, 0.8);
        const moving = c.from !== c.to && k > 0 && k < 1;
        const drop = ease(t, dealt + idx * 0.06, 0.4);
        const x = x0 + s * step;
        const y = 200 - (moving ? Math.sin(Math.PI * k) * 60 : 0) - (1 - drop) * 80;
        const j = Math.min(idx, n - 1 - idx);
        const fk = folding && j < pairs && !mids.includes(idx) ? ease(t, fold + j * 0.55, 0.5) : 0;
        const mid = done && mids.includes(idx);
        g.c.save();
        g.c.globalAlpha = 0.25 + 0.75 * drop;
        g.c.translate(x + 48, y + 70);
        g.c.scale(Math.max(0.05, Math.abs(Math.cos(fk * Math.PI))), 1);
        const back = fk > 0.5;
        if (mid) g.card(-54, -76, 108, 152, `rgba(255, 209, 102, ${0.5 + 0.4 * pulse(t)})`, 0);
        g.card(-48, -70, 96, 140, back ? C.field : C.paper, back ? 0.4 : 1);
        if (!back) {
          g.text(num(lang, c.v), 0, -8, 38, mid ? C.plum : C.cobalt, "center", true);
          g.text("cm", 0, 36, 20, C.soft, "center", true);
        }
        g.c.restore();
      });
      if (done) mids.forEach((m) => g.text("median", cx(m), 375, 22, C.plum, "center", true));

      let said: string;
      if (!isSorted) said = lang === "id" ? "Urutkan dulu kartunya dari yang terkecil." : "First sort the cards from smallest to largest.";
      else if (!folding) said = lang === "id" ? "Sekarang lipat barisan di tengahnya." : "Now fold the row in the middle.";
      else if (!done) said = lang === "id" ? "Pasangkan ujung kiri dan ujung kanan..." : "Pairing the ends, left with right...";
      else if (n % 2) said = `median = ${num(lang, o[mids[0]].v)} cm`;
      else {
        const a = o[mids[0]].v;
        const b = o[mids[1]].v;
        said = `median = (${num(lang, a)} + ${num(lang, b)}) ${div(lang)} 2 = ${show(lang, (a + b) / 2)} cm`;
      }
      fit(g, said, W / 2, 430, 880, 30, done ? C.plum : C.ink);
      const count = lang === "id" ? `${n} data${n % 2 ? ": satu nilai di tengah" : ": dua nilai di tengah"}` : `${n} values${n % 2 ? ": one in the middle" : ": two in the middle"}`;
      g.text(count, W / 2, 478, 22, C.soft, "center", true);

      const L = lang === "id" ? ["URUTKAN", "LIPAT", "+ KARTU", "− KARTU", "DATA BARU"] : ["SORT", "FOLD", "+ CARD", "− CARD", "NEW DATA"];
      const ids = ["sort", "fold", "add", "remove", "new"];
      const cols = [C.cobalt, C.plum, C.teal, C.coral, C.soft];
      const still = cards.every((c) => ease(t, c.start, 0.8) >= 1);
      const ons = [!isSorted, isSorted && still, n < 8, n > 3, true];
      ids.forEach((id, i) => g.button(id, L[i], 45 + i * 185, 555, 170, 52, cols[i], ons[i]));
    },
  };
}

const SIZES = [32, 33, 34, 35, 36, 37, 38, 39];

/** A dot plot of shoe sizes: each dot drops onto its size, and the tallest stack is the mode. */
function mode(lang: Lang): Scene {
  const dots: number[][] = [1, 2, 4, 6, 5, 3, 2, 1].map((c, i) => Array.from({ length: c }, (_, j) => 0.2 + i * 0.08 + j * 0.06));
  let now = 0;
  const LINE = 470;
  const X0 = 100;
  const SLOT = 100;
  return {
    press(id) {
      if (id === "class") {
        dots.forEach((d) => (d.length = 0));
        const total = 18 + Math.floor(Math.random() * 8);
        for (let k = 0; k < total; k++) {
          const i = clamp(Math.round(((Math.random() + Math.random() + Math.random()) / 3) * 7), 0, 7);
          if (dots[i].length < 10) dots[i].push(now + k * 0.07);
        }
        return;
      }
      const i = Number(id.slice(1));
      if (id[0] === "+" && dots[i].length < 10) dots[i].push(now);
      if (id[0] === "-") dots[i].pop();
    },
    draw(g, t) {
      now = t;
      const counts = dots.map((d) => d.length);
      const top = Math.max(...counts);
      const used = counts.filter((c) => c > 0).length;
      const modes = top > 0 && !(used > 1 && counts.every((c) => c === 0 || c === top)) ? SIZES.filter((_, i) => counts[i] === top) : [];
      fit(g, lang === "id" ? "ukuran sepatu anak-anak di kelas" : "shoe sizes in the class", 60, 44, 640, 28, C.ink, "left");
      const head = modes.length
        ? `${lang === "id" ? "modus" : "mode"} = ${modes.map((s) => num(lang, s)).join(lang === "id" ? " dan " : " and ")}`
        : lang === "id"
          ? "tidak ada modus"
          : "no mode";
      g.text(head, 60, 96, 28, C.plum, "left", true);
      g.button("class", lang === "id" ? "KELAS BARU" : "NEW CLASS", 740, 22, 220, 52, C.cobalt);
      dots.forEach((d, i) => {
        const cx = X0 + SLOT * (i + 0.5);
        if (modes.includes(SIZES[i])) {
          const h = d.length * 32 + 22;
          g.card(cx - 30, LINE - h, 60, h, `rgba(255, 209, 102, ${0.35 + 0.35 * pulse(t)})`, 0);
          g.text(lang === "id" ? "modus" : "mode", cx, LINE - h - 18, 22, C.plum, "center", true);
        }
        d.forEach((birth, j) => {
          const target = LINE - 20 - j * 32;
          const k = ease(t, birth, 0.45);
          if (k <= 0) return;
          const y = lerp(60, target, k);
          g.dot(cx + 2, y + 3, 14, "rgba(70, 50, 25, 0.22)");
          g.dot(cx, y, 14, modes.includes(SIZES[i]) ? C.plum : C.teal);
        });
        g.text(num(lang, SIZES[i]), cx, 497, 22, C.ink, "center", true);
        g.button(`-${i}`, "−", cx - 46, 555, 44, 52, C.coral, d.length > 0);
        g.button(`+${i}`, "+", cx + 2, 555, 44, 52, C.teal, d.length < 10);
      });
      g.line(X0, LINE, X0 + SLOT * 8, LINE, C.ink, 3);
      for (let i = 0; i < 8; i++) g.line(X0 + SLOT * (i + 0.5), LINE - 6, X0 + SLOT * (i + 0.5), LINE + 6, C.ink, 2);
    },
  };
}

/** Seven bars to drag up and down, with the mean, median and mode moving as the data changes. */
function together(lang: Lang): Scene {
  const v = [4, 6, 3, 8, 4, 7, 5];
  const shown = v.map(() => 0);
  let drag: number | null = null;
  let last = 0;
  const BASE = 480;
  const U = 32;
  const X0 = 60;
  const SLOT = 82;
  const at = (p: Pt) => clamp(Math.round((BASE - p.y) / U), 1, 10);
  return {
    press(id) {
      if (id === "new") v.forEach((_, i) => (v[i] = 1 + Math.floor(Math.random() * 10)));
    },
    down(p) {
      const i = Math.floor((p.x - X0) / SLOT);
      if (i < 0 || i >= v.length || p.y < 120 || p.y > BASE + 20) return;
      drag = i;
      v[i] = at(p);
      return true;
    },
    move(p) {
      if (drag !== null) v[drag] = at(p);
    },
    up() {
      drag = null;
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      v.forEach((n, i) => {
        if (t > 0.2 + i * 0.1) shown[i] += (n - shown[i]) * (1 - Math.exp(-dt * (drag === i ? 14 : 5)));
      });
      const n = v.length;
      const mean = v.reduce((a, b) => a + b, 0) / n;
      const s = [...v].sort((a, b) => a - b);
      const med = s[(n - 1) / 2];
      const counts = new Map<number, number>();
      v.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
      const top = Math.max(...counts.values());
      const modes = top > 1 ? [...counts.keys()].filter((k) => counts.get(k) === top).sort((a, b) => a - b) : [];

      fit(g, lang === "id" ? "banyak buku yang dibaca tujuh anak" : "books read by seven children", X0 + 3.5 * SLOT, 40, 560, 28);
      const x1 = X0 + SLOT * n;
      v.forEach((val, i) => {
        const cx = X0 + SLOT * (i + 0.5);
        const h = shown[i] * U;
        g.card(cx - 28, BASE - h, 56, h, modes.includes(val) ? C.plum : C.cobalt, 0.8);
        g.text(num(lang, val), cx, BASE - h - 46, 22, C.ink, "center", true);
        g.handle(cx, BASE - h - 12, drag === i);
        g.text(NAMES[i], cx, 505, 20, C.soft, "center", true);
      });
      g.line(X0, BASE, x1, BASE, C.ink, 3);
      dashed(g, X0, x1, BASE - mean * U, C.coral);
      dashed(g, X0, x1, BASE - med * U, C.teal);
      fit(g, lang === "id" ? "seret puncak batang untuk mengubah data" : "drag the top of a bar to change the data", X0, 580, 560, 22, C.soft, "left");

      const px = 690;
      const pw = 270;
      const rows: [string, string, string][] = [
        [C.coral, lang === "id" ? "rata-rata" : "mean", `${exact(mean) ? "=" : "≈"} ${show(lang, mean)}`],
        [C.teal, "median", `= ${num(lang, med)}`],
        [C.plum, lang === "id" ? "modus" : "mode", modes.length ? `= ${modes.map((m) => num(lang, m)).join(", ")}` : lang === "id" ? "tidak ada" : "none"],
      ];
      rows.forEach(([color, name, val], i) => {
        const y = 80 + i * 92;
        g.card(px, y, pw, 78, C.paper, 1);
        g.c.fillStyle = color;
        g.c.fillRect(px, y + 70, pw, 8);
        g.text(name, px + 18, y + 36, 26, color, "left", true);
        fit(g, val, px + pw - 18, y + 36, 130, 30, C.ink, "right");
      });
      g.text(lang === "id" ? "data diurutkan" : "data in order", px + pw / 2, 375, 20, C.soft, "center", true);
      s.forEach((val, i) => {
        const x = px + pw / 2 + (i - 3) * 36;
        if (i === (n - 1) / 2) g.dot(x, 412, 20, "rgba(63, 182, 160, 0.3)");
        g.text(num(lang, val), x, 412, 24, modes.includes(val) ? C.plum : C.ink, "center", true);
      });
      g.text(`${lang === "id" ? "jumlah" : "total"} ${num(lang, v.reduce((a, b) => a + b, 0))} ${div(lang)} 7`, px + pw / 2, 458, 22, C.coral, "center", true);
      g.button("new", lang === "id" ? "DATA BARU" : "NEW DATA", px, 555, pw, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "The mean shares everything out equally. Add up all the data, then divide by how many values there are. Press LEVEL OUT to see it.",
        id: "Rata-rata membagi semuanya sama rata. Jumlahkan semua data, lalu bagi dengan banyak data. Tekan RATAKAN untuk melihatnya.",
      },
      scene: level,
    },
    {
      say: {
        en: "The median is the middle value once the data is in order. With an even number of values, it is halfway between the two middle ones.",
        id: "Median adalah nilai tengah setelah data diurutkan. Jika banyak data genap, median adalah rata-rata dua nilai di tengah.",
      },
      scene: median,
    },
    {
      say: {
        en: "The mode is the value that appears most often: the tallest stack in a dot plot. Add or take away dots and watch it move.",
        id: "Modus adalah nilai yang paling sering muncul: tumpukan tertinggi pada diagram titik. Tambah atau kurangi titik dan lihat modusnya berpindah.",
      },
      scene: mode,
    },
    {
      say: {
        en: "Drag the bars and watch all three move: the mean as a red line, the median as a green line, and the mode in purple.",
        id: "Seret batangnya dan perhatikan ketiganya bergerak: rata-rata garis merah, median garis hijau, dan modus berwarna ungu.",
      },
      scene: together,
    },
  ],
};
