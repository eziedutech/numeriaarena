import type { Lang } from "../../legal";
import { C, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { num } from "../parts";

type Op = "+" | "−" | "×" | "÷";
type Tok = number | Op | "(" | ")";
type Move = { from: number; to: number; value: number; rule: number };

const parse = (s: string): Tok[] =>
  s
    .replace(/\(/gu, "( ")
    .replace(/\)/gu, " )")
    .split(" ")
    .filter(Boolean)
    .map((x) => (/^\d+$/u.test(x) ? Number(x) : (x as Tok)));

const apply = (a: number, op: Op, b: number) => (op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : a / b);

/** The part to work next: the innermost brackets, then × and ÷ from the left, then + and − from the left. */
function nextMove(tk: Tok[]): Move | null {
  if (tk.length === 1) return null;
  let lo = -1;
  let hi = -1;
  for (let i = 0; i < tk.length; i++) {
    if (tk[i] === "(") lo = i;
    if (tk[i] === ")") {
      hi = i;
      break;
    }
  }
  const inside = hi >= 0;
  const a = inside ? lo + 1 : 0;
  const b = inside ? hi - 1 : tk.length - 1;
  let o = -1;
  for (let i = a; i <= b && o < 0; i++) if (tk[i] === "×" || tk[i] === "÷") o = i;
  for (let i = a; i <= b && o < 0; i++) if (tk[i] === "+" || tk[i] === "−") o = i;
  const op = tk[o] as Op;
  const value = apply(tk[o - 1] as number, op, tk[o + 1] as number);
  const whole = inside && b - a === 2;
  return { from: whole ? lo : o - 1, to: whole ? hi : o + 1, value, rule: inside ? 0 : op === "×" || op === "÷" ? 1 : 2 };
}

const after = (tk: Tok[], m: Move): Tok[] => [...tk.slice(0, m.from), m.value, ...tk.slice(m.to + 1)];

const finalValue = (s: string) => {
  let tk = parse(s);
  for (let m = nextMove(tk); m; m = nextMove(tk)) tk = after(tk, m);
  return tk[0] as number;
};

const RULES = {
  en: ["( ) first", "× and ÷ from the left", "+ and − from the left"],
  id: ["( ) dulu", "× dan : dari kiri", "+ dan − dari kiri"],
};

/**
 * An expression worked one move at a time: the part to work is lit, a press
 * folds it into its value, and every line so far stays written below.
 */
function collapse(list: string[][], withToggle: boolean) {
  return (lang: Lang): Scene => {
    let pick = 0;
    let side = 0;
    let lines: Tok[][] = [];
    let moves: Move[] = [];
    let changed = -10;
    let now = 0;
    const text = (tk: Tok) => (typeof tk === "number" ? num(lang, tk) : tk === "÷" ? (lang === "id" ? ":" : "÷") : tk);
    const start = () => {
      lines = [parse(list[pick][side])];
      moves = [];
      changed = now - 10;
    };
    start();
    /** Brackets hug what they hold; everything else has a space between. */
    const tight = (tk: Tok[], i: number) => tk[i] === "(" || tk[i + 1] === ")";
    const place = (g: Ink, tk: Tok[], size: number) => {
      const ws = tk.map((x) => g.width(text(x), size, true));
      const gaps = tk.map((_, i) => (i === tk.length - 1 ? 0 : tight(tk, i) ? size * 0.08 : size * 0.3));
      let x = W / 2 - (ws.reduce((n, w) => n + w, 0) + gaps.reduce((n, w) => n + w, 0)) / 2;
      return ws.map((w, i) => {
        const c = x + w / 2;
        x += w + gaps[i];
        return { c, w };
      });
    };
    const spaced = (tk: Tok[], i: number) => (tight(tk, i) ? text(tk[i]) : `${text(tk[i])} `);
    return {
      press(id) {
        if (id === "next") {
          const cur = lines[lines.length - 1];
          const m = nextMove(cur);
          if (!m) return;
          moves.push(m);
          lines.push(after(cur, m));
          changed = now;
        }
        if (id === "again") start();
        if (id === "other") {
          pick = (pick + 1) % list.length;
          side = 0;
          start();
        }
        if (id === "side") {
          side = 1 - side;
          start();
        }
      },
      draw(g, t) {
        now = t;
        const first = lines[0];
        const laid = place(g, first, 60);
        const total = laid[laid.length - 1].c + laid[laid.length - 1].w / 2 - (laid[0].c - laid[0].w / 2);
        const S = Math.min(60, (60 * 880) / total);
        const cur = lines[lines.length - 1];
        const coming = nextMove(cur);
        const k = ease(t, changed, 0.8);
        const Y = 110;

        if (k < 1 && lines.length > 1) {
          // The lit part folds into its value while the rest slides together.
          const prev = lines[lines.length - 2];
          const m = moves[moves.length - 1];
          const pp = place(g, prev, S);
          const cp = place(g, cur, S);
          const span = m.to - m.from;
          const left = pp[m.from].c - pp[m.from].w / 2;
          const right = pp[m.to].c + pp[m.to].w / 2;
          const rw = lerp(right - left, cp[m.from].w, k) + 24;
          g.card(lerp((left + right) / 2, cp[m.from].c, k) - rw / 2, Y - S * 0.62, rw, S * 1.24, C.sun, 1);
          prev.forEach((tk, i) => {
            if (i >= m.from && i <= m.to) {
              g.c.globalAlpha = 1 - k;
              g.text(text(tk), lerp(pp[i].c, cp[m.from].c, k), Y, S, C.ink, "center", true);
              g.c.globalAlpha = 1;
            } else {
              const j = i < m.from ? i : i - span;
              g.text(text(tk), lerp(pp[i].c, cp[j].c, k), Y, S, C.ink, "center", true);
            }
          });
          g.c.globalAlpha = k;
          g.text(text(m.value), cp[m.from].c, Y, S, C.plum, "center", true);
          g.c.globalAlpha = 1;
        } else {
          const cp = place(g, cur, S);
          if (coming) {
            // The next part to work, lit and breathing.
            const e = ease(t, changed + 0.9, 0.4);
            const left = cp[coming.from].c - cp[coming.from].w / 2 - 12;
            const right = cp[coming.to].c + cp[coming.to].w / 2 + 12;
            g.c.globalAlpha = e;
            g.card(left, Y - S * 0.62 - 3 * pulse(t), right - left, S * 1.24, C.sun, 1 + 0.4 * pulse(t));
            g.c.globalAlpha = 1;
          } else {
            g.card(cp[0].c - cp[0].w / 2 - 24, Y - S * 0.62, cp[0].w + 48, S * 1.24, C.sun, 1.4);
          }
          cur.forEach((tk, i) => g.text(text(tk), cp[i].c, Y, S, cur.length === 1 ? C.plum : C.ink, "center", true));
        }

        // Every line so far, with the part worked on it in coral.
        lines.forEach((tk, i) => {
          const y = 230 + i * 44;
          const show = i === lines.length - 1 && i > 0 ? ease(t, changed + 0.5, 0.5) : 1;
          g.c.globalAlpha = show;
          let x = 70;
          if (i > 0) {
            g.text("=", x, y, 28, C.soft, "left", true);
            x += g.width("= ", 28, true);
          }
          const m = moves[i];
          tk.forEach((tok, j) => {
            g.text(text(tok), x, y, 28, C.ink, "left", true);
            x += g.width(spaced(tk, j), 28, true);
          });
          if (m) {
            // Underline the part worked on this line.
            let ux = 70 + (i > 0 ? g.width("= ", 28, true) : 0);
            let u0 = 0;
            let u1 = 0;
            tk.forEach((tok, j) => {
              const w = g.width(text(tok), 28, true);
              if (j === m.from) u0 = ux;
              if (j === m.to) u1 = ux + w;
              ux += g.width(spaced(tk, j), 28, true);
            });
            g.line(u0, y + 18, u1, y + 18, C.coral, 4);
          }
          g.c.globalAlpha = 1;
        });

        // The order to follow, the rule in use lit.
        RULES[lang].forEach((r, i) => {
          const lit = coming?.rule === i && k >= 1;
          g.card(640, 210 + i * 72, 320, 56, lit ? C.sun : C.paper, lit ? 1.2 : 0.6);
          g.text(`${i + 1}`, 668, 238 + i * 72, 28, lit ? C.coral : C.soft, "center", true);
          g.text(r, 692, 238 + i * 72, 24, C.ink, "left", true);
        });

        if (withToggle && !coming) {
          const [a, b] = list[pick].map(finalValue);
          const said = lang === "id" ? `tanpa kurung: ${num(lang, a)}   dengan kurung: ${num(lang, b)}` : `without brackets: ${num(lang, a)}   with brackets: ${num(lang, b)}`;
          g.c.globalAlpha = ease(t, changed + 0.8, 0.5);
          g.card(60, 470, W - 120, 56, C.field, 0);
          g.text(said, W / 2, 498, 26, C.ink, "center", true);
          g.c.globalAlpha = 1;
        }

        g.button("again", lang === "id" ? "ULANGI" : "START OVER", 40, 555, 170, 52, C.soft, lines.length > 1);
        g.button("other", lang === "id" ? "CONTOH LAIN" : "ANOTHER ONE", 225, 555, 210, 52, C.teal);
        if (withToggle) {
          const label = side ? (lang === "id" ? "TANPA KURUNG" : "NO BRACKETS") : lang === "id" ? "PAKAI KURUNG" : "WITH BRACKETS";
          g.button("side", label, 450, 555, 230, 52, C.plum);
        }
        g.button("next", lang === "id" ? "LANGKAH LANJUT" : "NEXT STEP", 695, 555, 265, 52, C.cobalt, Boolean(coming) && k >= 1);
      },
    };
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Multiplication and division are done before addition and subtraction. Press to fold the lit part into its value.",
        id: "Perkalian dan pembagian dikerjakan lebih dulu daripada penjumlahan dan pengurangan. Tekan untuk melipat bagian yang menyala menjadi hasilnya.",
      },
      scene: collapse([["8 + 6 × 5"], ["30 − 4 × 6"], ["7 + 24 ÷ 3"], ["50 − 36 ÷ 4 + 2"]], false),
    },
    {
      say: {
        en: "When the operations are on the same level, work from left to right, one move at a time.",
        id: "Bila operasinya setingkat, kerjakan dari kiri ke kanan, satu langkah demi satu langkah.",
      },
      scene: collapse([["20 − 8 + 5"], ["36 ÷ 6 × 3"], ["100 − 40 − 20"], ["8 × 5 ÷ 4"]], false),
    },
    {
      say: {
        en: "Brackets are worked first. Put brackets on and off the same numbers and watch the answer change.",
        id: "Yang di dalam kurung dikerjakan paling dulu. Pasang dan lepas kurung pada bilangan yang sama, lalu lihat hasilnya berubah.",
      },
      scene: collapse(
        [
          ["8 + 4 × 3", "(8 + 4) × 3"],
          ["20 − 6 ÷ 2", "(20 − 6) ÷ 2"],
          ["5 × 6 − 2", "5 × (6 − 2)"],
        ],
        true,
      ),
    },
    {
      say: {
        en: "All together: brackets first, then × and ÷ from the left, then + and − from the left.",
        id: "Semuanya bersama: kurung dulu, lalu × dan : dari kiri, kemudian + dan − dari kiri.",
      },
      scene: collapse([["48 ÷ (6 + 2) × 3 − 5"], ["(15 − 3) ÷ 4 + 2 × 7"], ["60 − (4 + 6) × 5 + 9"], ["7 + 3 × (10 − 4) ÷ 2"]], false),
    },
  ],
};
