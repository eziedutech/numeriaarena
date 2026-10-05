import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { num, wrap } from "../parts";

type Kind = "dots" | "squares" | "triangles";
/** One piece of a term: where it sits from the bottom middle, and whether this term added it. */
type Bit = { x: number; y: number; fresh: boolean };

/** The pieces of term `n` (from 1) of each growing shape. */
function bits(kind: Kind, n: number): Bit[] {
  const out: Bit[] = [];
  if (kind === "dots") {
    // A centre dot with three arms, one dot longer each time: +3.
    out.push({ x: 0, y: -75, fresh: n === 1 });
    for (let arm = 0; arm < 3; arm++) {
      const a = -Math.PI / 2 + (arm * Math.PI * 2) / 3;
      for (let j = 1; j < n; j++) out.push({ x: Math.cos(a) * j * 19, y: -75 + Math.sin(a) * j * 19, fresh: j === n - 1 });
    }
  } else if (kind === "squares") {
    // An n by n square: the new row and column make an L.
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out.push({ x: (c - n / 2) * 28, y: -(r + 1) * 28, fresh: r === n - 1 || c === n - 1 });
  } else {
    // Rows of 1, 2, 3, ... triangles: each term adds a longer row at the bottom.
    for (let r = 0; r < n; r++) for (let c = 0; c <= r; c++) out.push({ x: (c - r / 2) * 30, y: -(n - r) * 28, fresh: r === n - 1 });
  }
  return out;
}

function bit(g: Ink, kind: Kind, b: Bit, cx: number, cy: number, k: number, color: string) {
  const x = cx + b.x;
  const y = cy + b.y - (1 - k) * 40;
  g.c.globalAlpha = k;
  if (kind === "dots") {
    g.dot(x + 1.5, y + 2.5, 8, "rgba(70, 50, 25, 0.22)");
    g.dot(x, y, 8, color);
  } else if (kind === "squares") {
    g.card(x + 1, y + 1, 26, 26, color, 0.6);
  } else {
    g.c.fillStyle = "rgba(70, 50, 25, 0.2)";
    g.c.beginPath();
    g.c.moveTo(x + 2, y + 3);
    g.c.lineTo(x + 16, y + 29);
    g.c.lineTo(x - 12, y + 29);
    g.c.fill();
    g.c.fillStyle = color;
    g.c.beginPath();
    g.c.moveTo(x, y);
    g.c.lineTo(x + 14, y + 26);
    g.c.lineTo(x - 14, y + 26);
    g.c.fill();
  }
  g.c.globalAlpha = 1;
}

/** Shapes that grow term by term: the part each term adds is coloured, and the jump between counts shown. */
function grow(lang: Lang): Scene {
  let kind: Kind = "dots";
  let shown = 3;
  const born = [0, 0.6, 1.2, -1, -1];
  let now = 0;
  const xs = [120, 310, 500, 690, 880];
  return {
    press(id) {
      if (id === "next" && shown < 5) {
        born[shown] = now;
        shown += 1;
      }
      if (id === "again") {
        shown = 1;
        born[0] = now;
      }
      if (id === "dots" || id === "squares" || id === "triangles") {
        kind = id;
        shown = 3;
        [0, 1, 2].forEach((i) => (born[i] = now + 0.5 * i));
      }
    },
    draw(g, t) {
      now = t;
      const counts = [1, 2, 3, 4, 5].map((n) => bits(kind, n).length);
      for (let i = 0; i < 5; i++) {
        const x = xs[i];
        g.card(x - 88, 92, 176, 290, i < shown ? C.paper : C.field, i < shown ? 1 : 0);
        g.text(lang === "id" ? `suku ke-${i + 1}` : `term ${i + 1}`, x, 118, 20, C.soft, "center", true);
        if (i >= shown) continue;
        const k1 = ease(t, born[i], 0.4);
        const k2 = ease(t, born[i] + 0.35, 0.5);
        bits(kind, i + 1).forEach((b) => bit(g, kind, b, x, 362, b.fresh && i > 0 ? k2 : k1, b.fresh && i > 0 ? C.coral : C.cobalt));
        g.c.globalAlpha = k2;
        g.text(num(lang, counts[i]), x, 418, 40, C.ink, "center", true);
        g.c.globalAlpha = 1;
        if (i > 0) {
          // The jump from the term before.
          const k = ease(t, born[i] + 0.6, 0.5);
          const a = xs[i - 1] + 26;
          const b = x - 26;
          g.c.strokeStyle = C.teal;
          g.c.lineWidth = 3;
          g.c.beginPath();
          for (let s = 0; s <= 20 * k; s++) {
            const u = s / 20;
            const px = lerp(a, b, u);
            const py = 440 + Math.sin(Math.PI * u) * 26;
            if (s) g.c.lineTo(px, py);
            else g.c.moveTo(px, py);
          }
          g.c.stroke();
          g.c.globalAlpha = k;
          g.text(`+${counts[i] - counts[i - 1]}`, (a + b) / 2, 492, 26, C.teal, "center", true);
          g.c.globalAlpha = 1;
        }
      }
      const rule = {
        dots: lang === "id" ? "aturannya: +3 setiap kali" : "the rule: +3 each time",
        squares: lang === "id" ? "lompatannya bertambah: +3, +5, +7, ..." : "the jumps grow: +3, +5, +7, ...",
        triangles: lang === "id" ? "lompatannya bertambah: +2, +3, +4, ..." : "the jumps grow: +2, +3, +4, ...",
      }[kind];
      g.c.globalAlpha = shown >= 3 ? ease(t, born[2] + 1, 0.5) : 0;
      g.text(rule, W / 2, 50, 32, C.ink, "center", true);
      g.c.globalAlpha = 1;
      const names: [Kind, string, number, number][] = [
        ["dots", lang === "id" ? "TITIK" : "DOTS", 40, 130],
        ["squares", lang === "id" ? "PERSEGI" : "SQUARES", 180, 160],
        ["triangles", lang === "id" ? "SEGITIGA" : "TRIANGLES", 350, 180],
      ];
      names.forEach(([id, label, x, w]) => g.button(id, label, x, 555, w, 52, id === kind ? C.cobalt : C.soft));
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", 560, 555, 190, 52, C.soft, shown > 1);
      g.button("next", lang === "id" ? "BERIKUTNYA" : "NEXT TERM", 770, 555, 190, 52, C.teal, shown < 5);
    },
  };
}

/** Terms on cards with the rule as jumps between them: change the first term and the jump. */
function jumps(lang: Lang): Scene {
  let first = 4;
  let rule = 3;
  let shown = 3;
  const born = [0, 0.7, 1.4, -1, -1, -1, -1, -1];
  let now = 0;
  const cw = 92;
  const x0 = (W - (8 * cw + 7 * 16)) / 2;
  const cx = (i: number) => x0 + i * (cw + 16) + cw / 2;
  const reset = () => {
    shown = 3;
    [0, 1, 2].forEach((i) => (born[i] = now + 0.5 * i));
  };
  return {
    press(id) {
      if (id === "next" && shown < 8) {
        born[shown] = now;
        shown += 1;
        return;
      }
      if (id === "f-") first = clamp(first - 1, 0, 20);
      if (id === "f+") first = clamp(first + 1, 0, 20);
      if (id === "r-") rule = clamp(rule - 1, 1, 10);
      if (id === "r+") rule = clamp(rule + 1, 1, 10);
      reset();
    },
    draw(g, t) {
      now = t;
      g.text(lang === "id" ? `aturan: +${rule}` : `rule: +${rule}`, W / 2, 62, 44, C.coral, "center", true);
      const terms = [...Array(shown).keys()].map((i) => first + i * rule);
      g.text(`${terms.map((n) => num(lang, n)).join(", ")}, ...`, W / 2, 130, 28, C.ink, "center", true);
      for (let i = 0; i < 8; i++) {
        const x = cx(i);
        if (i >= shown) {
          g.card(x - cw / 2, 300, cw, 80, C.field, 0);
          g.text("?", x, 340, 34, C.soft, "center", true);
          continue;
        }
        // The jump arrives first, a ball hops along it, then the card drops in.
        const hop = i > 0 ? ease(t, born[i], 0.6) : 1;
        const land = ease(t, born[i] + (i > 0 ? 0.5 : 0), 0.4);
        if (i > 0) {
          const a = cx(i - 1);
          g.c.strokeStyle = C.coral;
          g.c.lineWidth = 3;
          g.c.beginPath();
          for (let s = 0; s <= 24 * hop; s++) {
            const u = s / 24;
            const px = lerp(a, x, u);
            const py = 292 - Math.sin(Math.PI * u) * 56;
            if (s) g.c.lineTo(px, py);
            else g.c.moveTo(px, py);
          }
          g.c.stroke();
          g.text(`+${rule}`, (a + x) / 2, 214, 24, C.coral, "center", true);
          if (hop < 1) g.dot(lerp(a, x, hop), 292 - Math.sin(Math.PI * hop) * 56 - 8, 10, C.sun);
        }
        g.c.globalAlpha = land;
        g.card(x - cw / 2, 300 - (1 - land) * 30, cw, 80, i === shown - 1 ? C.sun : C.paper, 1);
        g.text(num(lang, terms[i]), x, 340 - (1 - land) * 30, 38, C.ink, "center", true);
        g.c.globalAlpha = 1;
        g.text(lang === "id" ? `ke-${i + 1}` : `term ${i + 1}`, x, 404, 20, C.soft, "center", true);
      }
      const control = (id: string, label: string, value: number, x: number, lo: number, hi: number, color: string) => {
        g.text(label, x, 518, 22, C.soft, "center", true);
        g.button(`${id}-`, "−", x - 110, 545, 70, 52, color, value > lo);
        g.text(String(value), x, 571, 34, C.ink, "center", true);
        g.button(`${id}+`, "+", x + 40, 545, 70, 52, color, value < hi);
      };
      control("f", lang === "id" ? "suku pertama" : "first term", first, 150, 0, 20, C.cobalt);
      control("r", lang === "id" ? "aturan" : "rule", rule, 440, 1, 10, C.coral);
      g.button("next", lang === "id" ? "BERIKUTNYA" : "NEXT TERM", 700, 545, 260, 52, C.teal, shown < 8);
    },
  };
}

/** A hundred chart: counting from a start in equal jumps lights squares that make a pattern. */
function chart(lang: Lang): Scene {
  let start = 3;
  let step = 4;
  let shown = 1;
  let auto = false;
  let tick = 0;
  let lit = [0];
  let now = 0;
  const S = 52;
  const x0 = 30;
  const y0 = 25;
  const terms = () => [...Array(Math.floor((100 - start) / step) + 1).keys()].map((i) => start + i * step);
  const reset = () => {
    shown = 1;
    auto = false;
    lit = [now];
  };
  return {
    press(id) {
      const all = terms();
      if (id === "next" && shown < all.length) {
        lit[shown] = now;
        shown += 1;
        return;
      }
      if (id === "all") {
        auto = true;
        tick = now;
        return;
      }
      if (id === "s-") start = clamp(start - 1, 1, 10);
      if (id === "s+") start = clamp(start + 1, 1, 10);
      if (id === "j-") step = clamp(step - 1, 2, 12);
      if (id === "j+") step = clamp(step + 1, 2, 12);
      reset();
    },
    draw(g, t) {
      now = t;
      const all = terms();
      if (auto && shown < all.length && t - tick > 0.12) {
        lit[shown] = t;
        shown += 1;
        tick = t;
      }
      const on = new Map(all.slice(0, shown).map((n, i) => [n, i]));
      for (let n = 1; n <= 100; n++) {
        const x = x0 + ((n - 1) % 10) * (S + 4);
        const y = y0 + Math.floor((n - 1) / 10) * (S + 4);
        const i = on.get(n);
        if (i === undefined) {
          g.card(x, y, S, S, C.paper, 0.35);
          g.text(String(n), x + S / 2, y + S / 2, 20, C.soft, "center", false);
        } else {
          const k = ease(t, lit[i], 0.3);
          const grow = lerp(0.6, 1, k);
          const s = S * grow;
          const newest = i === shown - 1;
          g.card(x + (S - s) / 2, y + (S - s) / 2, s, s, newest ? C.sun : C.coral, 1);
          g.text(String(n), x + S / 2, y + S / 2, 22, newest ? C.ink : C.paper, "center", true);
          if (newest) {
            g.c.strokeStyle = `rgba(58, 63, 75, ${0.15 + 0.3 * pulse(t)})`;
            g.c.lineWidth = 3;
            g.c.strokeRect(x - 4, y - 4, S + 8, S + 8);
          }
        }
      }
      // The terms so far, then what the pattern does.
      const px = 625;
      const pw = 345;
      const said = all.slice(0, shown).map((n) => num(lang, n)).join(", ");
      let lines = wrap(g, said + (shown < all.length ? ", ..." : ""), pw - 30, 24);
      if (lines.length > 5) lines = ["...", ...lines.slice(-4)];
      lines.forEach((l, i) => g.text(l, px, 48 + i * 32, 24, C.ink, "left", true));
      const ones = [...new Set(all.map((n) => n % 10))].slice(0, 6);
      const note: Record<number, [string, string]> = {
        2: ["Counting by 2 lights every other column.", "Lompat 2 menyalakan kolom yang berselang-seling."],
        5: ["Counting by 5 makes two straight columns.", "Lompat 5 membentuk dua kolom lurus."],
        9: ["Counting by 9 moves one square left on each row: a diagonal.", "Lompat 9 bergeser satu kotak ke kiri di setiap baris: membentuk diagonal."],
        10: ["Counting by 10 stays in one column: the ones digit never changes.", "Lompat 10 tetap di satu kolom: angka satuannya tidak berubah."],
        11: ["Counting by 11 moves one square right on each row: a diagonal.", "Lompat 11 bergeser satu kotak ke kanan di setiap baris: membentuk diagonal."],
      };
      const generic: [string, string] = [`The ones digits repeat: ${ones.join(", ")}, ...`, `Angka satuannya berulang: ${ones.join(", ")}, ...`];
      const [en, id] = note[step] ?? generic;
      g.c.globalAlpha = shown >= 3 ? ease(t, lit[2] ?? 0, 0.5) : 0;
      wrap(g, lang === "id" ? id : en, pw - 30, 22).forEach((l, i) => g.text(l, px, 222 + i * 28, 22, C.teal, "left", true));
      g.c.globalAlpha = 1;
      const control = (key: string, label: string, value: number, y: number, lo: number, hi: number, color: string) => {
        g.text(label, px + pw / 2, y, 22, C.soft, "center", true);
        g.button(`${key}-`, "−", px + 20, y + 18, 70, 52, color, value > lo);
        g.text(String(value), px + pw / 2, y + 44, 34, C.ink, "center", true);
        g.button(`${key}+`, "+", px + pw - 90, y + 18, 70, 52, color, value < hi);
      };
      control("s", lang === "id" ? "mulai dari" : "start at", start, 330, 1, 10, C.cobalt);
      control("j", lang === "id" ? "lompat" : "jump by", step, 430, 2, 12, C.coral);
      g.button("next", lang === "id" ? "BERIKUTNYA" : "NEXT TERM", px, 545, 205, 52, C.teal, shown < all.length);
      g.button("all", lang === "id" ? "SEMUA" : "ALL", px + 220, 545, 125, 52, C.cobalt, !auto && shown < all.length);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Each shape grows from the one before. The coloured part is what each term adds: watch the jumps between the counts.",
        id: "Setiap bangun tumbuh dari bangun sebelumnya. Bagian berwarna adalah tambahan di setiap suku: perhatikan lompatan di antara banyaknya.",
      },
      scene: grow,
    },
    {
      say: {
        en: "A pattern with a rule like +3 jumps the same amount each time. Change the first term or the rule and show the next term.",
        id: "Pola dengan aturan seperti +3 melompat sama jauh setiap kali. Ubah suku pertama atau aturannya, lalu tampilkan suku berikutnya.",
      },
      scene: jumps,
    },
    {
      say: {
        en: "Count in equal jumps on a hundred chart and the squares make a pattern: columns, steps or diagonals.",
        id: "Berhitung dengan lompatan yang sama pada tabel seratus, kotak-kotaknya membentuk pola: kolom, tangga, atau diagonal.",
      },
      scene: chart,
    },
  ],
};
