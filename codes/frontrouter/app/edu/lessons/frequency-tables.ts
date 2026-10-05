import type { Lang } from "../../legal";
import type { I18n } from "../catalog";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, lerp, pulse } from "../ink";
import { num } from "../parts";

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** Tally marks: four upright, the fifth across them; the newest one is drawn as `k` goes to 1. */
function marks(g: Ink, count: number, x: number, cy: number, k: number) {
  const h = 32;
  let at = x;
  for (let i = 0; i < count; i++) {
    const p = i === count - 1 ? k : 1;
    const inGroup = i % 5;
    if (inGroup < 4) {
      const mx = at + inGroup * 12;
      g.line(mx, cy - h / 2, mx, cy - h / 2 + h * p, C.ink, 4);
    } else {
      g.line(at - 8, cy + h / 2 - 4, lerp(at - 8, at + 44, p), lerp(cy + h / 2 - 4, cy - h / 2 + 4, p), C.coral, 4);
      at += 72;
    }
  }
}

/** Where the next tally mark of a row goes, for a card flying into it. */
const markAt = (x: number, c: number) => x + Math.floor(c / 5) * 72 + (c % 5 < 4 ? (c % 5) * 12 : 18);

interface DataSet {
  title: I18n;
  head: I18n;
  values: number[];
  rows: number;
  rowOf: (v: number) => number;
  row: (lang: Lang, i: number) => string;
  card: (lang: Lang, v: number) => string;
  hue?: string[];
}

const COLOURS = {
  en: ["red", "blue", "green", "yellow", "purple"],
  id: ["merah", "biru", "hijau", "kuning", "ungu"],
};
const PAINT = [C.coral, C.cobalt, C.teal, C.sun, C.plum];

const shoes = (values: number[]): DataSet => ({
  title: { en: "shoe sizes of 20 pupils", id: "ukuran sepatu 20 siswa" },
  head: { en: "shoe size", id: "ukuran sepatu" },
  values,
  rows: 5,
  rowOf: (v) => v - 33,
  row: (lang, i) => num(lang, 33 + i),
  card: (lang, v) => num(lang, v),
});

const SHOES_A = shoes([34, 35, 33, 36, 35, 34, 35, 37, 34, 35, 36, 33, 35, 34, 36, 35, 37, 34, 35, 36]);
const SHOES_B = shoes([36, 35, 36, 34, 37, 36, 35, 36, 33, 36, 35, 37, 36, 34, 35, 36, 37, 35, 36, 34]);

const COLOUR_SET: DataSet = {
  title: { en: "favourite colours of 20 pupils", id: "warna kesukaan 20 siswa" },
  head: { en: "colour", id: "warna" },
  values: [1, 0, 2, 1, 3, 1, 4, 0, 1, 2, 3, 1, 0, 2, 1, 4, 1, 0, 2, 3],
  rows: 5,
  rowOf: (v) => v,
  row: (lang, i) => COLOURS[lang][i],
  card: (lang, v) => COLOURS[lang][v],
  hue: PAINT,
};

const SIBLINGS: DataSet = {
  title: { en: "number of brothers and sisters of 20 pupils", id: "banyak saudara kandung 20 siswa" },
  head: { en: "brothers and sisters", id: "saudara kandung" },
  values: [1, 2, 0, 1, 3, 1, 2, 1, 0, 2, 1, 4, 2, 1, 3, 2, 1, 0, 2, 2],
  rows: 5,
  rowOf: (v) => v,
  row: (lang, i) => num(lang, i),
  card: (lang, v) => num(lang, v),
};

const scores = (values: number[]): DataSet => ({
  title: { en: "maths test scores of 20 pupils", id: "nilai ulangan matematika 20 siswa" },
  head: { en: "score", id: "nilai" },
  values,
  rows: 5,
  rowOf: (v) => clamp(Math.floor((v - 51) / 10), 0, 4),
  row: (lang, i) => `${num(lang, 51 + i * 10)}-${num(lang, 60 + i * 10)}`,
  card: (lang, v) => num(lang, v),
});

const SCORES_A = scores([78, 85, 62, 91, 74, 88, 69, 80, 95, 73, 57, 84, 76, 90, 66, 82, 79, 71, 87, 98]);
const SCORES_B = scores([64, 72, 55, 81, 77, 68, 93, 59, 74, 86, 70, 62, 79, 83, 58, 75, 66, 97, 71, 80]);

const FLY = 0.65;
const CW = 80;
const CH = 54;
const home = (i: number): Pt => ({ x: 64 + (i % 10) * 88, y: 58 + Math.floor(i / 10) * 64 });
const TOP = 230;
const RH = 50;
const TALLY = 280;

/**
 * Cards of raw data sorted one by one into the rows of a frequency table:
 * a card pressed, dragged or sent by a button flies to its row and becomes a tally mark.
 * With `mode`, the row with the most marks lights up once every card is in.
 */
function sorter(sets: DataSet[], auto: boolean, mode: boolean) {
  return (lang: Lang): Scene => {
    let pick = 0;
    let set = sets[0];
    let start: number[] = [];
    let slot: number[] = [];
    let from: Pt[] = [];
    let held = -1;
    let at: Pt = { x: 0, y: 0 };
    let grab: Pt = { x: 0, y: 0 };
    let now = 0;
    const reset = (when: number) => {
      start = set.values.map(() => Infinity);
      slot = set.values.map(() => 0);
      from = set.values.map((_, i) => home(i));
      held = -1;
      if (auto) set.values.forEach((_, i) => launch(i, when + 0.6 + i * 0.22));
    };
    const launch = (i: number, when: number, p?: Pt) => {
      const row = set.rowOf(set.values[i]);
      slot[i] = set.values.filter((v, j) => j !== i && set.rowOf(v) === row && start[j] !== Infinity).length;
      start[i] = when;
      from[i] = p ?? home(i);
    };
    const waiting = () => set.values.map((_, i) => i).filter((i) => start[i] === Infinity && i !== held);
    reset(0);
    const cardAt = (p: Pt) => {
      for (const i of waiting()) {
        const h = home(i);
        if (p.x >= h.x && p.x <= h.x + CW && p.y >= h.y && p.y <= h.y + CH) return i;
      }
      return -1;
    };
    const drawCard = (g: Ink, i: number, x: number, y: number, s: number, lift: number) => {
      const v = set.values[i];
      const w = CW * s;
      const h = CH * s;
      g.card(x, y, w, h, C.paper, lift);
      if (set.hue) {
        g.c.fillStyle = set.hue[v];
        g.c.fillRect(x, y, w, h * 0.32);
      }
      g.crease(x + 4, y + h * 0.32, x + w - 4, y + h * 0.32);
      fit(g, set.card(lang, v), x + w / 2, y + h * 0.64, w - 6, Math.max(18, (set.hue ? 20 : 26) * s), C.ink);
    };
    return {
      press(id) {
        if (id === "one") {
          const i = waiting()[0];
          if (i !== undefined) launch(i, now);
        }
        if (id === "all") waiting().forEach((i, j) => launch(i, now + j * 0.22));
        if (id === "again") reset(now);
        if (id === "other") {
          pick = (pick + 1) % sets.length;
          set = sets[pick];
          reset(now);
        }
      },
      down(p) {
        const i = cardAt(p);
        if (i < 0) return;
        held = i;
        const h = home(i);
        grab = { x: p.x - h.x, y: p.y - h.y };
        at = { x: h.x, y: h.y };
        return true;
      },
      move(p) {
        if (held >= 0) at = { x: p.x - grab.x, y: p.y - grab.y };
      },
      up() {
        if (held < 0) return;
        const i = held;
        held = -1;
        launch(i, now, at);
      },
      draw(g, t) {
        now = t;
        fit(g, set.title[lang], 500, 28, 900, 24, C.soft);
        const counts = Array.from({ length: set.rows }, () => 0);
        const lastLand = Array.from({ length: set.rows }, () => -9);
        let landed = 0;
        set.values.forEach((v, i) => {
          if (t >= start[i] + FLY) {
            const r = set.rowOf(v);
            counts[r] += 1;
            lastLand[r] = Math.max(lastLand[r], start[i] + FLY);
            landed += 1;
          }
        });
        const all = landed === set.values.length;
        const most = Math.max(...counts);
        const glowAt = Math.max(...lastLand) + 0.3;

        // The table: a head, a row for each value, and the total.
        g.card(50, TOP - 42, 900, 38, C.field, 0);
        fit(g, set.head[lang], 150, TOP - 23, 190, 22, C.ink);
        g.text(lang === "id" ? "turus" : "tally", 480, TOP - 23, 22, C.ink, "center", true);
        g.text(lang === "id" ? "frekuensi" : "frequency", 830, TOP - 23, 22, C.ink, "center", true);
        for (let r = 0; r < set.rows; r++) {
          const y = TOP + r * RH;
          const cy = y + RH / 2;
          const lit = mode && all && counts[r] === most;
          g.card(50, y, 900, RH - 4, lit ? C.sun : r % 2 ? C.paper : "#f8efdc", 0.5);
          if (lit) {
            g.c.fillStyle = `rgba(255, 255, 255, ${0.35 * pulse(t)})`;
            g.c.fillRect(50, y, 900, RH - 4);
          }
          g.crease(250, y + 5, 250, y + RH - 9);
          g.crease(710, y + 5, 710, y + RH - 9);
          if (set.hue) g.dot(80, cy - 2, 11, set.hue[r]);
          fit(g, set.row(lang, r), set.hue ? 160 : 150, cy - 2, 150, 24, C.ink);
          marks(g, counts[r], TALLY, cy - 2, ease(t, lastLand[r], 0.25));
          const pop = 1 + 0.25 * (1 - ease(t, lastLand[r], 0.35));
          g.c.save();
          g.c.translate(830, cy - 2);
          g.c.scale(pop, pop);
          g.text(num(lang, counts[r]), 0, 0, 28, C.cobalt, "center", true);
          g.c.restore();
          if (lit) {
            g.c.globalAlpha = ease(t, glowAt, 0.4);
            g.text(lang === "id" ? "modus" : "mode", 690, cy - 2, 24, C.coral, "right", true);
            g.c.globalAlpha = 1;
          }
        }
        const ty = TOP + set.rows * RH;
        g.card(50, ty + 2, 900, 44, all ? C.field : C.paper, 0.8);
        g.text(lang === "id" ? "jumlah" : "total", 150, ty + 24, 24, C.ink, "center", true);
        fit(g, `${num(lang, landed)} ${lang === "id" ? "dari" : "of"} ${num(lang, set.values.length)} ${lang === "id" ? "kartu" : "cards"}`, 480, ty + 24, 420, 22, C.soft);
        g.text(num(lang, landed), 830, ty + 24, 30, all ? C.coral : C.ink, "center", true);

        // Cards still waiting, then the one in the hand, then those in flight.
        set.values.forEach((_, i) => {
          if (start[i] !== Infinity || i === held) return;
          const h = home(i);
          const near = g.over(h.x, h.y, CW, CH);
          drawCard(g, i, h.x, h.y - (near ? 3 : 0), 1, near ? 1.4 : 1);
        });
        set.values.forEach((v, i) => {
          if (start[i] === Infinity || t < start[i] || t >= start[i] + FLY) return;
          const k = ease(t, start[i], FLY);
          const row = set.rowOf(v);
          const tx = markAt(TALLY, slot[i]) - (CW * 0.35) / 2;
          const ty2 = TOP + row * RH + RH / 2 - (CH * 0.35) / 2;
          const x = lerp(from[i].x, tx, k);
          const y = lerp(from[i].y, ty2, k) - Math.sin(Math.PI * k) * 50;
          g.c.globalAlpha = 1 - 0.4 * k;
          drawCard(g, i, x, y, lerp(1, 0.35, k), 1.4);
          g.c.globalAlpha = 1;
        });
        set.values.forEach((_, i) => {
          if (start[i] === Infinity && i !== held) return;
          if (start[i] !== Infinity && t >= start[i]) return;
          const p = i === held ? at : home(i);
          drawCard(g, i, p.x, p.y, 1, i === held ? 1.8 : 1);
        });

        const left = waiting().length > 0;
        g.button("one", lang === "id" ? "SATU KARTU" : "ONE CARD", 40, 555, 210, 52, C.teal, left);
        g.button("all", lang === "id" ? "SEMUA KARTU" : "ALL CARDS", 270, 555, 210, 52, C.cobalt, left);
        g.button("again", lang === "id" ? "ULANGI" : "START AGAIN", 500, 555, 210, 52, C.coral);
        if (sets.length > 1) g.button("other", lang === "id" ? "DATA LAIN" : "OTHER DATA", 730, 555, 230, 52, C.plum);
      },
    };
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Each card is one pupil's shoe size. Press or drag a card and it flies to its row as a tally mark; the frequency counts the marks.",
        id: "Setiap kartu adalah ukuran sepatu satu siswa. Tekan atau geser kartu, maka kartu terbang ke barisnya menjadi turus; frekuensi adalah banyaknya turus.",
      },
      scene: sorter([SHOES_A], false, false),
    },
    {
      say: {
        en: "When every card is sorted, the value that appears most often lights up: it is the mode. Try other data.",
        id: "Setelah semua kartu tersusun, nilai yang paling sering muncul menyala: itulah modus. Coba data lain.",
      },
      scene: sorter([COLOUR_SET, SIBLINGS, SHOES_B], true, true),
    },
    {
      say: {
        en: "Many different scores can be grouped: each row holds a range of scores. The total of the frequencies is the number of data.",
        id: "Nilai yang beragam dapat dikelompokkan: setiap baris memuat satu rentang nilai. Jumlah semua frekuensi sama dengan banyaknya data.",
      },
      scene: sorter([SCORES_A, SCORES_B], false, false),
    },
  ],
};
