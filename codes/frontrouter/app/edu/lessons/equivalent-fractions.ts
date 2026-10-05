import type { Lang } from "../../legal";
import { C, clamp, ease, type Lesson, type Scene, W } from "../ink";
import { frac, strip, sum } from "../parts";

/** Fold a half-coloured strip again and again: more parts, the same amount coloured. */
function fold(lang: Lang): Scene {
  let folds = 1;
  let folding: number | null = null;
  let now = 0;
  const x = 150;
  const y = 250;
  const w = 700;
  const h = 120;
  return {
    press(id) {
      if (folding !== null) return;
      if (id === "fold" && folds < 4) folding = now;
      if (id === "again") folds = 1;
    },
    draw(g, t) {
      now = t;
      const parts = 2 ** folds;
      if (folding !== null) {
        // Folded in half and opened again, it shows one more crease in every part.
        const k = ease(t, folding, 1.1);
        const turn = Math.cos(2 * Math.PI * k);
        const mid = x + w / 2;
        strip(g, x, y, w / 2, h, parts / 2, parts / 2, C.coral);
        const reach = (w / 2) * turn;
        if (reach >= 0) {
          g.card(mid, y, reach, h, C.paper, 1);
          g.c.fillStyle = `rgba(58, 63, 75, ${0.2 * (1 - turn)})`;
          g.c.fillRect(mid, y, reach, h);
        } else {
          g.card(mid + reach, y, -reach, h, "#efe3c8", 1.4);
        }
        if (k >= 1) {
          folds += 1;
          folding = null;
        }
      } else {
        strip(g, x, y, w, h, parts, parts / 2, C.coral);
      }
      g.text(lang === "id" ? "satu utuh" : "one whole", x + w / 2, y - 30, 24, C.soft, "center", true);

      // The chain of names for the same amount.
      const chain: (string | [number, number])[] = [];
      for (let i = 1; i <= folds; i++) {
        if (i > 1) chain.push("=");
        chain.push([2 ** (i - 1), 2 ** i]);
      }
      sum(g, chain, W / 2, 470, 46, chain.map((_, i) => (i === chain.length - 1 ? C.coral : C.ink)));
      g.text(lang === "id" ? `${parts} bagian, ${parts / 2} berwarna` : `${parts} parts, ${parts / 2} coloured`, W / 2, 140, 30, C.ink, "center", true);
      g.button("fold", lang === "id" ? "LIPAT LAGI" : "FOLD AGAIN", W / 2 - 130, 555, 260, 52, C.cobalt, folding === null && folds < 4);
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", 40, 555, 190, 52, C.soft, folding === null && folds > 1);
    },
  };
}

const BASES: [number, number][] = [
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 4],
  [2, 5],
];

/** Strips of different cuts stacked: their coloured parts end on the same line. */
function stack(lang: Lang): Scene {
  let i = 0;
  let changed = 0;
  let now = 0;
  return {
    press() {
      i = (i + 1) % BASES.length;
      changed = now;
    },
    draw(g, t) {
      now = t;
      const [a, b] = BASES[i];
      const x = 230;
      const w = 640;
      for (let k = 1; k <= 4; k++) {
        const y = 40 + (k - 1) * 120;
        const drop = ease(t, changed + 0.25 * k, 0.5);
        g.c.globalAlpha = drop;
        strip(g, x, y + (1 - drop) * -20, w, 70, b * k, a * k, [C.coral, C.teal, C.cobalt, C.plum][k - 1]);
        frac(g, a * k, b * k, 130, y + 35, 34, C.ink);
        g.c.globalAlpha = 1;
      }
      // The line every coloured part reaches.
      const edge = x + (w * a) / b;
      g.c.setLineDash([10, 8]);
      g.line(edge, 20, edge, 520, C.ink, 3);
      g.c.setLineDash([]);
      g.text(lang === "id" ? "sama panjang" : "the same length", edge, 535, 22, C.ink, "center", true);
      g.button("next", lang === "id" ? "PECAHAN LAIN" : "ANOTHER FRACTION", W / 2 - 150, 565, 300, 52, C.cobalt);
    },
  };
}

/** Times k on top and bottom: the coloured area is cut into k times more, smaller pieces. */
function times(lang: Lang): Scene {
  let a = 2;
  let b = 3;
  let k = 1;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "k+") k = clamp(k + 1, 1, 6);
      if (id === "k-") k = clamp(k - 1, 1, 6);
      if (id === "base") {
        const next = BASES[(BASES.findIndex(([x, y]) => x === a && y === b) + 1) % BASES.length];
        [a, b] = next;
      }
      changed = now;
    },
    draw(g, t) {
      now = t;
      const x = 80;
      const y = 80;
      const s = 420;
      g.card(x, y, s, s, C.paper, 1);
      g.c.fillStyle = C.coral;
      g.c.fillRect(x, y, (s * a) / b, s);
      for (let i = 1; i < b; i++) g.line(x + (s * i) / b, y, x + (s * i) / b, y + s, C.ink, 3);
      // New cuts across slide in from the left.
      const grow = ease(t, changed, 0.6);
      for (let j = 1; j < k; j++) g.line(x, y + (s * j) / k, x + s * grow, y + (s * j) / k, C.ink, 2);
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.strokeRect(x, y, s, s);

      const cx = 760;
      frac(g, a, b, cx - 150, 220, 64, C.ink);
      g.text("=", cx - 70, 220, 56, C.ink, "center", true);
      g.c.globalAlpha = grow;
      frac(g, `${a} × ${k}`, `${b} × ${k}`, cx + 60, 220, 46, C.soft);
      g.c.globalAlpha = 1;
      g.text("=", cx - 70, 380, 56, C.ink, "center", true);
      frac(g, a * k, b * k, cx + 20, 380, 64, C.coral);
      g.text(lang === "id" ? `${a * k} dari ${b * k} potong berwarna` : `${a * k} of ${b * k} pieces coloured`, cx, 480, 24, C.soft, "center", true);
      g.text(`× ${k}`, 640, 575, 34, C.ink, "center", true);
      g.button("k-", "−", 540, 550, 60, 52, C.coral, k > 1);
      g.button("k+", "+", 680, 550, 60, 52, C.teal, k < 6);
      g.button("base", lang === "id" ? "PECAHAN LAIN" : "ANOTHER FRACTION", 80, 550, 300, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Colour half a strip, then fold it again. There are more parts, but the coloured amount stays the same.",
        id: "Warnai setengah pita, lalu lipat lagi. Bagiannya makin banyak, tetapi yang berwarna tetap sama.",
      },
      scene: fold,
    },
    {
      say: {
        en: "Stack strips cut in different ways. Fractions that end on the same line are equivalent: the same amount, different names.",
        id: "Susun pita yang dipotong berbeda. Pecahan yang berakhir di garis yang sama itu senilai: jumlahnya sama, namanya berbeda.",
      },
      scene: stack,
    },
    {
      say: {
        en: "Multiply the top and the bottom by the same number. Each piece is cut again, so the coloured area does not change.",
        id: "Kalikan pembilang dan penyebut dengan bilangan yang sama. Setiap potong dibagi lagi, jadi luas yang berwarna tidak berubah.",
      },
      scene: times,
    },
  ],
};
