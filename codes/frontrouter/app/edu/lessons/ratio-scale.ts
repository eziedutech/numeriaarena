import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp, pulse } from "../ink";
import { dec, num } from "../parts";

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  fit(g, label, cx, 518, 230, 22, C.soft);
  g.button(`${id}-`, "−", cx - 115, 545, 70, 52, color, canDown);
  fit(g, value, cx, 571, 84, 30, C.ink);
  g.button(`${id}+`, "+", cx + 45, 545, 70, 52, color, canUp);
}

/** A paper counter that drops in as `k` goes 0 to 1. */
function counter(g: Ink, x: number, y: number, r: number, color: string, k: number) {
  if (k <= 0) return;
  const yy = y - (1 - k) * 30;
  g.c.globalAlpha = k;
  g.dot(x + 1.5, yy + 3, r, "rgba(70, 50, 25, 0.22)");
  g.dot(x, yy, r, color);
  g.dot(x - r * 0.3, yy - r * 0.3, r * 0.3, "rgba(255, 255, 255, 0.45)");
  g.c.globalAlpha = 1;
}

const NAME = {
  en: { red: "red", blue: "blue" },
  id: { red: "merah", blue: "biru" },
};

/** Groups of red and blue counters: each new group brings the same red and blue, so the totals grow together. */
function groups(lang: Lang): Scene {
  let a = 2;
  let b = 3;
  let n = 2;
  const born = [0, 0.8, -1, -1, -1, -1];
  let now = 0;
  const colW = 140;
  const x0 = (W - 6 * colW) / 2;
  const restart = () => {
    n = 2;
    born[0] = now;
    born[1] = now + 0.8;
  };
  return {
    press(id) {
      if (id === "add" && n < 6) {
        born[n] = now;
        n += 1;
        return;
      }
      if (id === "again") {
        n = 1;
        born[0] = now;
        return;
      }
      if (id === "r-") a = clamp(a - 1, 1, 4);
      if (id === "r+") a = clamp(a + 1, 1, 4);
      if (id === "b-") b = clamp(b - 1, 1, 4);
      if (id === "b+") b = clamp(b + 1, 1, 4);
      restart();
    },
    draw(g, t) {
      now = t;
      const L = NAME[lang];
      const head = lang === "id" ? `setiap ${a} ${L.red} ada ${b} ${L.blue}` : `for every ${a} ${L.red} there are ${b} ${L.blue}`;
      fit(g, head, W / 2, 50, 900, 36, C.ink);
      for (let i = 0; i < 6; i++) {
        const x = x0 + i * colW + 8;
        const w = colW - 16;
        if (i >= n) {
          g.card(x, 100, w, 300, C.field, 0);
          continue;
        }
        const newest = i === n - 1 && t - born[i] < 2;
        g.card(x, 100, w, 300, newest ? "#fff4d6" : C.paper, 1);
        fit(g, lang === "id" ? `kelompok ${i + 1}` : `group ${i + 1}`, x + w / 2, 122, w - 10, 18, C.soft);
        for (let j = 0; j < a; j++) counter(g, x + w / 2, 165 + j * 30, 12, C.coral, ease(t, born[i] + 0.08 * j, 0.3));
        for (let j = 0; j < b; j++) counter(g, x + w / 2, 177 + (a + j) * 30, 12, C.cobalt, ease(t, born[i] + 0.08 * (a + j), 0.3));
      }
      // The totals so far, side by side as a ratio.
      const k = ease(t, born[n - 1] + 0.3, 0.4);
      const bob = (1 - k) * 8;
      g.text(`${L.red} ${num(lang, n * a)}`, W / 2 - 26, 450 + bob, 36, C.coral, "right", true);
      g.text(":", W / 2, 450, 36, C.ink, "center", true);
      g.text(`${num(lang, n * b)} ${L.blue}`, W / 2 + 26, 450 + bob, 36, C.cobalt, "left", true);
      g.c.globalAlpha = 0.5 + 0.5 * pulse(t, 2.4);
      g.text(`${a} : ${b}`, 880, 450, 30, C.soft, "center", true);
      g.c.globalAlpha = 1;

      stepper(g, L.red, String(a), "r", 130, a > 1, a < 4, C.coral);
      stepper(g, L.blue, String(b), "b", 375, b > 1, b < 4, C.cobalt);
      g.button("add", lang === "id" ? "TAMBAH KELOMPOK" : "ADD A GROUP", 520, 545, 250, 52, C.teal, n < 6);
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", 790, 545, 170, 52, C.soft, n > 1);
    },
  };
}

/** A ratio table: each column is the first times 1, 2, 3, ...; press a column to see its counters in groups. */
function table(lang: Lang): Scene {
  let a = 2;
  let b = 3;
  let shown = 2;
  let pick = 1;
  const born = [0, 0.5, -1, -1, -1, -1];
  let picked = 0.6;
  let now = 0;
  const colW = 120;
  const tx = 210;
  const cx = (i: number) => tx + i * colW + colW / 2;
  return {
    press(id) {
      if (id === "next" && shown < 6) {
        born[shown] = now;
        pick = shown;
        shown += 1;
        picked = now + 0.3;
        return;
      }
      if (id[0] === "c") {
        pick = Number(id.slice(1));
        picked = now;
        return;
      }
      if (id === "r-") a = clamp(a - 1, 1, 4);
      if (id === "r+") a = clamp(a + 1, 1, 4);
      if (id === "b-") b = clamp(b - 1, 1, 4);
      if (id === "b+") b = clamp(b + 1, 1, 4);
      picked = now;
    },
    draw(g, t) {
      now = t;
      const L = NAME[lang];
      fit(g, L.red, 130, 150, 130, 26, C.coral);
      fit(g, L.blue, 130, 220, 130, 26, C.cobalt);
      if (t < 6) fit(g, lang === "id" ? "tekan satu kolom" : "press a column", 130, 285, 140, 18, C.coral);
      for (let i = 0; i < 6; i++) {
        const x = tx + i * colW;
        if (i >= shown) {
          g.card(x + 6, 120, colW - 12, 130, C.field, 0);
          g.text("?", cx(i), 185, 30, C.soft, "center", true);
          continue;
        }
        const k = ease(t, born[i], 0.4);
        const on = i === pick;
        g.c.globalAlpha = k;
        g.card(x + 6, 120 - (1 - k) * 20, colW - 12, 130, on ? "#fff1c9" : C.paper, on ? 1.4 : 1);
        g.crease(x + 12, 185, x + colW - 12, 185);
        g.text(num(lang, a * (i + 1)), cx(i), 152, 36, C.coral, "center", true);
        g.text(num(lang, b * (i + 1)), cx(i), 220, 36, C.cobalt, "center", true);
        g.c.globalAlpha = 1;
        g.hits.push({ id: `c${i}`, x, y: 110, w: colW, h: 150 });
      }
      // The same "times" over the top row and under the bottom row.
      const m = pick + 1;
      if (pick > 0) {
        const k = ease(t, picked, 0.6);
        const arc = (y: number, dir: number) => {
          g.c.strokeStyle = C.teal;
          g.c.lineWidth = 3;
          g.c.beginPath();
          for (let s = 0; s <= 30 * k; s++) {
            const u = s / 30;
            const px = lerp(cx(0), cx(pick), u);
            const py = y + dir * Math.sin(Math.PI * u) * 34;
            if (s) g.c.lineTo(px, py);
            else g.c.moveTo(px, py);
          }
          g.c.stroke();
        };
        arc(112, -1);
        arc(258, 1);
        g.c.globalAlpha = k;
        g.text(`×${m}`, (cx(0) + cx(pick)) / 2, 64, 26, C.teal, "center", true);
        g.text(`×${m}`, (cx(0) + cx(pick)) / 2, 310, 26, C.teal, "center", true);
        g.c.globalAlpha = 1;
      }
      // The picked column as counters, one paper card for each group.
      const gw = Math.max(a, b) * 24 + 16;
      const gx = W / 2 - (m * gw + (m - 1) * 10) / 2;
      for (let i = 0; i < m; i++) {
        const x = gx + i * (gw + 10);
        const k = ease(t, picked + 0.08 * i, 0.3);
        g.c.globalAlpha = k;
        g.card(x, 330, gw, 80, C.field, 0.5);
        g.c.globalAlpha = 1;
        for (let j = 0; j < a; j++) counter(g, x + 20 + j * 24, 352, 9, C.coral, k);
        for (let j = 0; j < b; j++) counter(g, x + 20 + j * 24, 388, 9, C.cobalt, k);
      }
      const k = ease(t, picked + 0.4, 0.4);
      g.c.globalAlpha = k;
      g.text(m === 1 ? `${a} : ${b}` : `${a} : ${b}  =  ${num(lang, a * m)} : ${num(lang, b * m)}`, W / 2, 445, 40, C.ink, "center", true);
      fit(
        g,
        lang === "id" ? "perbandingan senilai: kedua bilangan dikali bilangan yang sama" : "equal ratios: both numbers are multiplied by the same number",
        W / 2,
        484,
        900,
        22,
        C.soft,
      );
      g.c.globalAlpha = 1;

      stepper(g, L.red, String(a), "r", 130, a > 1, a < 4, C.coral);
      stepper(g, L.blue, String(b), "b", 375, b > 1, b < 4, C.cobalt);
      g.button("next", lang === "id" ? "KOLOM BERIKUTNYA" : "NEXT COLUMN", 660, 545, 300, 52, C.teal, shown < 6);
    },
  };
}

/** A bar of marbles cut into equal parts, the parts handed out in the ratio: the sum is done by the boxes. */
function share(lang: Lang): Scene {
  let a = 2;
  let b = 3;
  let each = 8;
  let start = 0.3;
  let now = 0;
  const bx = 120;
  const bw = 760;
  return {
    press(id) {
      if (id === "a-") a = clamp(a - 1, 1, 4);
      if (id === "a+") a = clamp(a + 1, 1, 4);
      if (id === "b-") b = clamp(b - 1, 1, 4);
      if (id === "b+") b = clamp(b + 1, 1, 4);
      if (id === "n-") each = clamp(each - 1, 1, 12);
      if (id === "n+") each = clamp(each + 1, 1, 12);
      start = now + 0.2;
    },
    draw(g, t) {
      now = t;
      const parts = a + b;
      const total = each * parts;
      const thing = lang === "id" ? "kelereng" : "marbles";
      const k1 = ease(t, start, 0.6);
      const k2 = ease(t, start + 0.8, 0.6);
      const k3 = ease(t, start + 1.8, 1);
      const k4 = ease(t, start + 3, 0.5);
      g.c.globalAlpha = k1;
      g.text(`${num(lang, total)} ${thing}`, W / 2, 62, 34, C.ink, "center", true);
      g.c.globalAlpha = 1;
      // The whole bar stays as a faint outline once its boxes leave.
      g.card(bx, 100, bw * k1, 60, C.field, k3 > 0 ? 0 : 1);
      const big = bw / parts;
      const small = Math.min(big, 100);
      const rowX = 220;
      for (let i = 0; i < parts; i++) {
        const mine = i < a;
        const j = mine ? i : i - a;
        const fx = bx + i * big;
        const tx = rowX + j * small;
        const ty = mine ? 280 : 370;
        const x = lerp(fx, tx, k3);
        const y = lerp(100, ty, k3) - Math.sin(Math.PI * k3) * 30;
        const w = lerp(big, small, k3);
        if (k1 < 1) continue;
        g.card(x, y, w, 60, mine ? C.coral : C.cobalt, k3 > 0 && k3 < 1 ? 1.6 : 1);
        g.c.fillStyle = `rgba(255, 253, 248, ${0.6 * (1 - k2)})`;
        g.c.fillRect(x, y, w, 60);
        if (i > 0 && k3 === 0) g.crease(x, y + 4, x, y + 56);
        g.c.globalAlpha = k2;
        fit(g, num(lang, each), x + w / 2, y + 30, w - 8, 26, C.paper);
        g.c.globalAlpha = 1;
      }
      g.c.globalAlpha = k2;
      const div = lang === "id" ? ":" : "÷";
      g.text(`${num(lang, total)} ${div} ${parts} = ${num(lang, each)}`, W / 2, 200, 34, C.ink, "center", true);
      fit(
        g,
        lang === "id" ? `${parts} bagian yang sama, setiap bagian ${num(lang, each)} ${thing}` : `${parts} equal parts, ${num(lang, each)} ${thing} in each part`,
        W / 2,
        238,
        900,
        22,
        C.soft,
      );
      g.c.globalAlpha = k3;
      g.text("Ani", rowX - 20, 310, 30, C.coral, "right", true);
      g.text("Budi", rowX - 20, 400, 30, C.cobalt, "right", true);
      g.c.globalAlpha = k4;
      const ex = rowX + 4 * 100 + 30;
      g.text(`${a} × ${num(lang, each)} = ${num(lang, a * each)}`, ex, 310, 30, C.coral, "left", true);
      g.text(`${b} × ${num(lang, each)} = ${num(lang, b * each)}`, ex, 400, 30, C.cobalt, "left", true);
      g.text(`Ani : Budi = ${a} : ${b} = ${num(lang, a * each)} : ${num(lang, b * each)}`, W / 2, 465, 30, C.ink, "center", true);
      g.c.globalAlpha = 1;

      stepper(g, "Ani", String(a), "a", 130, a > 1, a < 4, C.coral);
      stepper(g, "Budi", String(b), "b", 370, b > 1, b < 4, C.cobalt);
      stepper(g, thing, num(lang, total), "n", 610, each > 1, each < 12, C.teal);
      g.button("go", lang === "id" ? "BAGI LAGI" : "SHARE AGAIN", 760, 545, 200, 52, C.plum);
    },
  };
}

/** One centimetre on the map. */
const CM = 40;
const MAP = { x: 40, y: 70, w: 600, h: 420 };
const TOWNS: [string, Pt][] = [
  ["Sukamaju", { x: 100, y: 430 }],
  ["Mekarsari", { x: 300, y: 150 }],
  ["Karangjati", { x: 580, y: 130 }],
  ["Sumberejo", { x: 540, y: 400 }],
  ["Tanjungsari", { x: 300, y: 330 }],
];

/** A paper map with a ruler from one town: the length on the map times the scale is the real distance. */
function map(lang: Lang): Scene {
  let scale = 100000;
  const from = TOWNS[0][1];
  let end: Pt = { ...TOWNS[3][1] };
  let held = false;
  let changed = 0;
  let now = 0;
  const snap = (p: Pt) => {
    for (const [, q] of TOWNS) if (q !== from && Math.hypot(p.x - q.x, p.y - q.y) < 20) return { ...q };
    return p;
  };
  return {
    press(id) {
      scale = Number(id);
      changed = now;
    },
    down(p) {
      if (Math.hypot(p.x - end.x, p.y - end.y) < 36) {
        held = true;
        return true;
      }
    },
    move(p) {
      if (!held) return;
      let q = { x: clamp(p.x, MAP.x + 14, MAP.x + MAP.w - 14), y: clamp(p.y, MAP.y + 14, MAP.y + MAP.h - 14) };
      // Not shorter than 1 cm, so the ruler always shows.
      const d = Math.hypot(q.x - from.x, q.y - from.y);
      if (d < CM) q = { x: from.x + ((q.x - from.x) / (d || 1)) * CM, y: from.y + ((q.y - from.y) / (d || 1)) * CM };
      end = snap(q);
      changed = now;
    },
    up() {
      held = false;
    },
    draw(g, t) {
      now = t;
      const c = g.c;
      g.card(MAP.x, MAP.y, MAP.w, MAP.h, "#f6ecd2", 1);
      g.crease(MAP.x + MAP.w / 2, MAP.y + 4, MAP.x + MAP.w / 2, MAP.y + MAP.h - 4);
      g.crease(MAP.x + 4, MAP.y + MAP.h / 2, MAP.x + MAP.w - 4, MAP.y + MAP.h / 2);
      // A river and some trees.
      c.save();
      c.beginPath();
      c.rect(MAP.x, MAP.y, MAP.w, MAP.h);
      c.clip();
      c.strokeStyle = "rgba(52, 105, 196, 0.35)";
      c.lineWidth = 14;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(MAP.x + 380, MAP.y);
      c.bezierCurveTo(MAP.x + 300, MAP.y + 140, MAP.x + 520, MAP.y + 220, MAP.x + 430, MAP.y + MAP.h);
      c.stroke();
      c.restore();
      const trees: [number, number][] = [
        [90, 120],
        [140, 170],
        [180, 110],
        [470, 300],
        [600, 260],
        [210, 420],
        [450, 450],
        [120, 300],
      ];
      for (const [x, y] of trees) {
        c.fillStyle = "rgba(63, 182, 160, 0.55)";
        c.beginPath();
        c.moveTo(x, y - 14);
        c.lineTo(x + 10, y + 6);
        c.lineTo(x - 10, y + 6);
        c.fill();
      }
      // Roads between the towns.
      c.setLineDash([8, 6]);
      const roads = [
        [0, 4],
        [4, 1],
        [1, 2],
        [4, 3],
        [3, 2],
      ];
      for (const [i, j] of roads) g.line(TOWNS[i][1].x, TOWNS[i][1].y, TOWNS[j][1].x, TOWNS[j][1].y, "rgba(93, 98, 112, 0.45)", 3);
      c.setLineDash([]);
      g.text(lang === "id" ? "U" : "N", MAP.x + MAP.w - 30, MAP.y + 26, 22, C.ink, "center", true);
      g.line(MAP.x + MAP.w - 30, MAP.y + 70, MAP.x + MAP.w - 30, MAP.y + 42, C.ink, 3);
      g.line(MAP.x + MAP.w - 30, MAP.y + 42, MAP.x + MAP.w - 37, MAP.y + 52, C.ink, 3);
      g.line(MAP.x + MAP.w - 30, MAP.y + 42, MAP.x + MAP.w - 23, MAP.y + 52, C.ink, 3);
      for (const [name, p] of TOWNS) {
        g.dot(p.x, p.y, 9, C.ink);
        g.dot(p.x, p.y, 4, C.paper);
        const left = p.x > MAP.x + MAP.w - 120;
        g.text(name, p.x + (left ? -14 : 14), p.y - 18, 18, C.ink, left ? "right" : "left", true);
      }

      // The ruler lies along the measure, its 0 on the town.
      const d = Math.hypot(end.x - from.x, end.y - from.y);
      const len = Math.round((d / CM) * 10) / 10;
      const ang = Math.atan2(end.y - from.y, end.x - from.x);
      const rl = Math.ceil(len) + 0.5;
      c.save();
      c.translate(from.x, from.y);
      c.rotate(ang);
      c.globalAlpha = 0.9;
      g.card(-12, 0, rl * CM + 12, 38, C.sun, 1);
      c.globalAlpha = 1;
      for (let i = 0; i <= rl * 10; i++) {
        const x = i * (CM / 10);
        const tall = i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 5;
        g.line(x, 0, x, tall, C.ink, i % 10 === 0 ? 2 : 1);
        if (i % 10 === 0) g.text(String(i / 10), x, 26, 18, C.ink, "center", true);
      }
      c.restore();
      g.line(from.x, from.y, end.x, end.y, C.coral, 4);
      g.handle(end.x, end.y, held);
      if (t < 5 && !held) fit(g, lang === "id" ? "geser ujung merah" : "drag the red end", end.x, end.y + 40, 200, 20, C.coral);

      // What the measure means in real life.
      const px = 665;
      const pw = 300;
      const mid = px + pw / 2;
      const km = (len * scale) / 100000;
      const flash = 1 - ease(t, changed, 0.6);
      g.card(px, 70, pw, 420, C.paper, 1);
      if (flash > 0) {
        c.fillStyle = `rgba(255, 209, 102, ${0.35 * flash})`;
        c.fillRect(px, 70, pw, 420);
      }
      fit(g, lang === "id" ? "di peta" : "on the map", mid, 100, pw - 20, 22, C.soft);
      fit(g, `${dec(lang, len, 1)} cm`, mid, 140, pw - 20, 40, C.coral);
      fit(g, lang === "id" ? "skala" : "scale", mid, 190, pw - 20, 22, C.soft);
      fit(g, `1 : ${num(lang, scale)}`, mid, 226, pw - 20, 34, C.ink);
      fit(g, `1 cm = ${num(lang, scale)} cm = ${num(lang, scale / 100000)} km`, mid, 266, pw - 20, 22, C.cobalt);
      g.crease(px + 20, 296, px + pw - 20, 296);
      fit(g, lang === "id" ? "jarak sebenarnya" : "real distance", mid, 324, pw - 20, 22, C.soft);
      fit(g, `${dec(lang, len, 1)} × ${num(lang, scale)} cm`, mid, 362, pw - 20, 26, C.ink);
      fit(g, `= ${num(lang, Math.round(len * scale))} cm`, mid, 400, pw - 20, 26, C.ink);
      fit(g, `= ${dec(lang, km, km % 1 === 0 ? 0 : 1)} km`, mid, 450, pw - 20, 44, C.teal);

      [100000, 200000, 500000].forEach((s, i) => g.button(String(s), `1 : ${num(lang, s)}`, 40 + i * 210, 545, 190, 52, s === scale ? C.cobalt : C.soft));
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A ratio compares two amounts. For every 2 red there are 3 blue: add a group and both grow together.",
        id: "Perbandingan membandingkan dua banyak benda. Setiap 2 merah ada 3 biru: tambah kelompoknya, keduanya bertambah bersama.",
      },
      scene: groups,
    },
    {
      say: {
        en: "Multiply both numbers of a ratio by the same number and you get an equal ratio. Press a column to see it as groups.",
        id: "Kalikan kedua bilangan dalam perbandingan dengan bilangan yang sama, hasilnya perbandingan senilai. Tekan satu kolom untuk melihat kelompoknya.",
      },
      scene: table,
    },
    {
      say: {
        en: "To share in the ratio 2 : 3, cut the whole into 2 + 3 equal parts. Ani takes 2 parts and Budi takes 3.",
        id: "Untuk membagi dengan perbandingan 2 : 3, potong semuanya menjadi 2 + 3 bagian yang sama. Ani mendapat 2 bagian, Budi 3 bagian.",
      },
      scene: share,
    },
    {
      say: {
        en: "On a map with scale 1 : 100,000, 1 cm on the map is 100,000 cm, which is 1 km, in real life. Drag the red end of the ruler to another town.",
        id: "Pada peta berskala 1 : 100.000, 1 cm di peta sama dengan 100.000 cm, yaitu 1 km, di tempat sebenarnya. Geser ujung merah penggaris ke kota lain.",
      },
      scene: map,
    },
  ],
};
