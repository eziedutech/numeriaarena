import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { num, wrap } from "../parts";

/** The primes of n, smallest first: 12 gives 2, 2, 3. */
const primesOf = (n: number) => {
  const out: number[] = [];
  let m = n;
  for (let p = 2; m > 1; p++) {
    while (m % p === 0) {
      out.push(p);
      m /= p;
    }
  }
  return out;
};

const isPrime = (n: number) => n > 1 && primesOf(n).length === 1;

/** A minus, a value and a plus in a row, the value between the two buttons. */
function stepper(g: Ink, lang: Lang, key: string, x: number, value: number, on: [boolean, boolean], color: string) {
  g.button(`${key}-`, "−", x, 555, 64, 52, color, on[0]);
  g.text(num(lang, value), x + 97, 581, 34, color, "center", true);
  g.button(`${key}+`, "+", x + 130, 555, 64, 52, color, on[1]);
}

/** Text shrunk until it fits `maxW`, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, maxW: number, size: number, color: string) {
  let z = size;
  while (z > 18 && g.width(s, z, true) > maxW) z -= 1;
  g.text(s, x, y, z, color, "center", true);
}

/** Every rectangle that n squares can make: a prime makes only one, a single row. */
function rectangles(lang: Lang): Scene {
  let n = 12;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      n = clamp(n + (id === "n+" ? 1 : -1), 2, 30);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const pairs: [number, number][] = [];
      for (let r = 1; r * r <= n; r++) if (n % r === 0) pairs.push([r, n / r]);
      const prime = pairs.length === 1;
      const rows = pairs.reduce((s, [r]) => s + r, 0);
      const s = Math.min(34, 800 / n, (330 - 22 * (pairs.length - 1)) / rows);
      fit(g, [num(lang, n), ...pairs.map(([r, c]) => `${r} × ${c}`)].join(" = "), W / 2, 50, 900, 32, C.ink);
      let y = 105;
      pairs.forEach(([r, c], j) => {
        const x = 150;
        const k = ease(t, changed + 0.3 * j, 0.4);
        g.c.globalAlpha = k;
        g.text(`${r} × ${c}`, x - 20, y + (r * s) / 2, 24, prime ? C.coral : j === 0 ? C.soft : C.teal, "right", true);
        g.c.globalAlpha = 1;
        for (let i = 0; i < r * c; i++) {
          const ki = ease(t, changed + 0.3 * j + 0.012 * i, 0.35);
          if (ki <= 0) continue;
          g.c.globalAlpha = ki;
          const color = prime ? C.coral : j === 0 ? "#c9ccd3" : C.teal;
          g.card(x + (i % c) * s, y + Math.floor(i / c) * s - (1 - ki) * 14, s - 3, s - 3, color, 0.5);
        }
        g.c.globalAlpha = 1;
        y += r * s + 22;
      });
      const k = ease(t, changed + 0.3 * pairs.length + 0.3, 0.5);
      const msg = prime
        ? lang === "id"
          ? `hanya satu baris: ${num(lang, n)} bilangan prima`
          : `only one row: ${num(lang, n)} is a prime number`
        : lang === "id"
          ? `${pairs.length} persegi panjang: ${num(lang, n)} bilangan komposit`
          : `${pairs.length} rectangles: ${num(lang, n)} is a composite number`;
      const w = g.width(msg, 28, true) + 60;
      g.c.globalAlpha = k;
      g.card(W / 2 - w / 2, 462, w, 58, prime ? C.sun : C.field, 1);
      g.text(msg, W / 2, 491, 28, C.ink, "center", true);
      g.c.globalAlpha = 1;
      stepper(g, lang, "n", W / 2 - 97, n, [n > 2, n < 30], C.cobalt);
    },
  };
}

const SIEVE = [2, 3, 5, 7];
const SIEVE_COLOR: Record<number, string> = { 1: C.soft, 2: C.coral, 3: C.teal, 5: C.plum, 7: C.cobalt };

/** A hundred square: circle each prime in turn and cross out its multiples; what is left is prime. */
function sieve(lang: Lang): Scene {
  let stage = 0;
  let by: number[] = [];
  let crossAt: number[] = [];
  let ringAt: number[] = [];
  let ringColor: string[] = [];
  let now = 0;
  const reset = (at: number) => {
    stage = 0;
    by = Array(101).fill(0);
    crossAt = Array(101).fill(Infinity);
    ringAt = Array(101).fill(Infinity);
    ringColor = Array(101).fill(C.ink);
    by[1] = 1;
    crossAt[1] = at + 0.6;
  };
  reset(0);
  const cw = 48;
  const ch = 44;
  const x0 = 40;
  const y0 = 40;
  return {
    press(id) {
      if (id === "again") return reset(now);
      if (stage < 4) {
        const p = SIEVE[stage];
        ringAt[p] = now;
        ringColor[p] = SIEVE_COLOR[p];
        let i = 0;
        for (let m = 2 * p; m <= 100; m += p) {
          if (by[m]) continue;
          by[m] = p;
          crossAt[m] = now + 0.5 + 0.05 * i++;
        }
      } else if (stage === 4) {
        let i = 0;
        for (let m = 2; m <= 100; m++) {
          if (by[m] || ringAt[m] < Infinity) continue;
          ringAt[m] = now + 0.04 * i++;
          ringColor[m] = "#c89412";
        }
      }
      stage += 1;
    },
    draw(g, t) {
      now = t;
      g.card(x0, y0, cw * 10, ch * 10, C.paper, 1);
      for (let m = 1; m <= 100; m++) {
        const x = x0 + ((m - 1) % 10) * cw;
        const y = y0 + Math.floor((m - 1) / 10) * ch;
        const crossed = t >= crossAt[m];
        const ringed = t >= ringAt[m];
        const color = SIEVE_COLOR[by[m]] ?? C.ink;
        if (crossed) {
          g.c.fillStyle = color;
          g.c.globalAlpha = 0.16;
          g.c.fillRect(x, y, cw, ch);
          g.c.globalAlpha = 1;
        }
        if (ringed) {
          const k = ease(t, ringAt[m], 0.4);
          g.c.fillStyle = ringColor[m] === "#c89412" ? "rgba(255, 209, 102, 0.6)" : "rgba(255, 255, 255, 0)";
          g.c.beginPath();
          g.c.arc(x + cw / 2, y + ch / 2, 19, 0, Math.PI * 2);
          g.c.fill();
          g.c.strokeStyle = ringColor[m];
          g.c.lineWidth = 3;
          g.c.beginPath();
          g.c.arc(x + cw / 2, y + ch / 2, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
          g.c.stroke();
        }
        g.text(String(m), x + cw / 2, y + ch / 2, 20, crossed ? "rgba(58, 63, 75, 0.4)" : ringed ? ringColor[m] : C.ink, "center", true);
        if (crossed) {
          const k = ease(t, crossAt[m], 0.25);
          g.line(x + 10, y + 8, lerp(x + 10, x + cw - 10, k), lerp(y + 8, y + ch - 8, k), color, 3);
          if (k > 0.5) g.line(x + cw - 10, y + 8, lerp(x + cw - 10, x + 10, k), lerp(y + 8, y + ch - 8, k), color, 3);
        }
      }
      for (let i = 1; i < 10; i++) {
        g.crease(x0 + i * cw, y0, x0 + i * cw, y0 + 10 * ch);
        g.crease(x0, y0 + i * ch, x0 + 10 * cw, y0 + i * ch);
      }
      // The panel: the prime of this turn and what to do with it.
      const cx = 760;
      const p = stage >= 1 && stage <= 4 ? SIEVE[stage - 1] : 0;
      let line: string;
      if (stage === 0) line = lang === "id" ? "1 bukan bilangan prima, jadi dicoret. Mulai dari 2." : "1 is not a prime number, so it is crossed out. Start with 2.";
      else if (stage <= 4) {
        const list = [2, 3, 4].map((k) => num(lang, k * p)).join(", ");
        line = lang === "id" ? `${p} bilangan prima. Coret semua kelipatannya: ${list}, dan seterusnya.` : `${p} is prime. Cross out all its multiples: ${list}, and so on.`;
      } else line = lang === "id" ? "Setelah 7, semua bilangan yang tersisa adalah prima." : "After 7, every number left is prime.";
      if (p) {
        const bob = 4 * pulse(t);
        g.dot(cx, 100 - bob, 44, SIEVE_COLOR[p]);
        g.text(String(p), cx, 100 - bob, 52, C.paper, "center", true);
      } else if (stage === 5) {
        g.dot(cx, 100, 44, C.sun);
        g.text("25", cx, 100, 46, C.ink, "center", true);
      }
      wrap(g, line, 380, 26).forEach((s, i) => g.text(s, cx, 200 + i * 36, 26, C.ink, "center", true));
      const found = [...Array(101).keys()].filter((m) => t >= ringAt[m]).length;
      g.text(lang === "id" ? `bilangan prima: ${found}` : `primes found: ${found}`, cx, 400, 28, C.soft, "center", true);
      const label = stage < 4 ? (lang === "id" ? "PRIMA BERIKUTNYA" : "NEXT PRIME") : lang === "id" ? "LINGKARI SISANYA" : "CIRCLE THE REST";
      g.button("next", label, cx - 190, 470, 380, 52, C.cobalt, stage < 5);
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", cx - 110, 545, 220, 52, C.soft, stage > 0);
    },
  };
}

interface Node {
  n: number;
  x: number;
  y: number;
  depth: number;
  at: number;
  kids: [Node, Node] | null;
}

const TREES = [60, 36, 48, 72, 90, 84, 100, 64, 42, 54];

/** The pair nearest to each other that multiplies to n: 60 gives 6 and 10. */
const split = (n: number): [number, number] => {
  let a = 1;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) a = d;
  return [a, n / a];
};

/** A factor tree that grows where it is tapped, until every leaf is a prime. */
function tree(lang: Lang): Scene {
  let i = 0;
  let now = 0;
  let root: Node = { n: TREES[0], x: W / 2, y: 70, depth: 0, at: 0, kids: null };
  const leaves = (node: Node): Node[] => (node.kids ? [...leaves(node.kids[0]), ...leaves(node.kids[1])] : [node]);
  const grow = (node: Node) => {
    if (node.kids || isPrime(node.n)) return;
    const [a, b] = split(node.n);
    const dx = 200 / 2 ** node.depth;
    const kid = (m: number, sx: number): Node => ({ n: m, x: node.x + sx * dx, y: node.y + 100, depth: node.depth + 1, at: now, kids: null });
    node.kids = [kid(a, -1), kid(b, 1)];
  };
  return {
    press(id) {
      if (id === "all") leaves(root).forEach(grow);
      if (id === "new") {
        i = (i + 1) % TREES.length;
        root = { n: TREES[i], x: W / 2, y: 70, depth: 0, at: now, kids: null };
      }
    },
    down(p) {
      const hit = leaves(root).find((l) => !isPrime(l.n) && Math.hypot(p.x - l.x, p.y - l.y) < 40);
      if (!hit) return;
      grow(hit);
      return true;
    },
    draw(g, t) {
      now = t;
      const paint = (node: Node) => {
        if (node.kids) {
          for (const kid of node.kids) {
            const k = ease(t, kid.at, 0.45);
            g.line(node.x, node.y + 26, lerp(node.x, kid.x, k), lerp(node.y + 26, kid.y - 26, k), C.soft, 3);
          }
          node.kids.forEach(paint);
        }
        const k = ease(t, node.at + 0.2, 0.4);
        g.c.globalAlpha = k;
        if (isPrime(node.n)) {
          g.dot(node.x + 2, node.y + 4, 28, "rgba(70, 50, 25, 0.22)");
          g.dot(node.x, node.y, 28, C.coral);
          g.text(String(node.n), node.x, node.y, 28, C.paper, "center", true);
        } else {
          const lift = node.kids ? 0 : 3 * pulse(t);
          g.card(node.x - 36, node.y - 26 - lift, 72, 52, node.kids ? C.field : C.paper, node.kids ? 0.6 : 1.2);
          g.text(String(node.n), node.x, node.y - lift, 30, C.ink, "center", true);
        }
        g.c.globalAlpha = 1;
      };
      paint(root);
      const ls = leaves(root);
      const done = ls.every((l) => isPrime(l.n)) && t - Math.max(...ls.map((l) => l.at)) > 0.6;
      if (done) {
        const ps = ls.map((l) => l.n).sort((a, b) => a - b);
        const k = ease(t, Math.max(...ls.map((l) => l.at)) + 0.6, 0.5);
        g.c.globalAlpha = k;
        g.card(W / 2 - 300, 440, 600, 70, C.sun, 1);
        fit(g, `${num(lang, root.n)} = ${ps.join(" × ")}`, W / 2, 475, 560, 40, C.ink);
        g.c.globalAlpha = 1;
      } else
        g.text(lang === "id" ? "ketuk bilangan yang bukan prima untuk memecahnya" : "tap a number that is not prime to split it", W / 2, 475, 24, C.soft, "center", true);
      g.button("all", lang === "id" ? "PECAH SEMUA" : "SPLIT ALL", W / 2 - 290, 555, 270, 52, C.coral, !done);
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W / 2 + 20, 555, 270, 52, C.cobalt);
    },
  };
}

const TINTS = [C.coral, C.teal, C.plum, C.cobalt];

/** A prime with its power at the top right, centred on x. Returns its width. */
function power(g: Ink, base: number, exp: number, x: number, y: number, color: string, measure = false) {
  const wb = g.width(String(base), 60, true);
  const we = exp > 1 ? g.width(String(exp), 34, true) + 4 : 0;
  if (!measure) {
    g.text(String(base), x - (wb + we) / 2 + wb / 2, y, 60, color, "center", true);
    if (exp > 1) g.text(String(exp), x + (wb + we) / 2 - (we - 4) / 2, y - 28, 34, color, "center", true);
  }
  return wb + we;
}

/** The primes of a number in a row, then the same primes gathered and written with powers. */
function powers(lang: Lang): Scene {
  let n = 72;
  let changed = 0;
  let now = 0;
  const step = (from: number, by: number) => {
    let m = from + by;
    while (m >= 4 && m <= 200 && isPrime(m)) m += by;
    return clamp(m, 4, 200);
  };
  return {
    press(id) {
      n = step(n, id === "n+" ? 1 : -1);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const s = t - changed;
      const ps = primesOf(n);
      const kinds = [...new Set(ps)];
      const head = `${num(lang, n)} =`;
      // The long row: one card for each prime.
      const cw = 58;
      const sw = 40;
      const hw = g.width(head, 52, true) + 24;
      const rowW = hw + ps.length * cw + (ps.length - 1) * sw;
      let x = W / 2 - rowW / 2;
      g.text(head, x + hw / 2 - 12, 170, 52, C.ink, "center", true);
      x += hw;
      const centres: number[] = [];
      ps.forEach((p, i) => {
        const k = ease(s, 0.1 * i, 0.4);
        const color = TINTS[kinds.indexOf(p) % TINTS.length];
        g.c.globalAlpha = k;
        g.card(x, 140 - (1 - k) * 20, cw, 62, C.paper, 1);
        g.text(String(p), x + cw / 2, 171 - (1 - k) * 20, 40, color, "center", true);
        if (i < ps.length - 1) g.text("×", x + cw + sw / 2, 171, 34, C.soft, "center", true);
        g.c.globalAlpha = 1;
        centres.push(x + cw / 2);
        x += cw + sw;
      });
      // Brackets under the same primes.
      const kb = ease(s, 1.2, 0.5);
      g.c.globalAlpha = kb;
      kinds.forEach((p, j) => {
        const idx = ps.map((q, i) => (q === p ? i : -1)).filter((i) => i >= 0);
        const a = centres[idx[0]] - cw / 2;
        const b = centres[idx[idx.length - 1]] + cw / 2;
        const color = TINTS[j % TINTS.length];
        g.line(a, 214, a, 224, color, 4);
        g.line(a, 224, b, 224, color, 4);
        g.line(b, 214, b, 224, color, 4);
        g.text(lang === "id" ? `${idx.length} kali` : `${idx.length} time${idx.length > 1 ? "s" : ""}`, (a + b) / 2, 248, 20, color, "center", true);
      });
      g.c.globalAlpha = 1;
      // The short row: each group dropped into a power.
      const counts = kinds.map((p) => ps.filter((q) => q === p).length);
      const widths = kinds.map((p, j) => power(g, p, counts[j], 0, 0, C.ink, true));
      const gap = 120;
      const total = hw + widths.reduce((a, b) => a + b, 0) + (kinds.length - 1) * gap;
      let px = W / 2 - total / 2;
      const y2 = 370;
      g.c.globalAlpha = ease(s, 1.7, 0.4);
      g.text(head, px + hw / 2 - 12, y2, 52, C.ink, "center", true);
      g.c.globalAlpha = 1;
      px += hw;
      kinds.forEach((p, j) => {
        const k = ease(s, 1.8 + 0.4 * j, 0.6);
        const idx = ps.map((q, i) => (q === p ? i : -1)).filter((i) => i >= 0);
        const from = (centres[idx[0]] + centres[idx[idx.length - 1]]) / 2;
        const color = TINTS[j % TINTS.length];
        const mx = px + widths[j] / 2;
        if (k > 0) {
          g.c.globalAlpha = k;
          power(g, p, counts[j], lerp(from, mx, k), lerp(250, y2, k), color);
          if (counts[j] > 1) {
            const long = `${Array(counts[j]).fill(p).join(" × ")} = ${num(lang, p ** counts[j])}`;
            g.text(long, mx, y2 + 62, 20, color, "center", true);
          }
          g.c.globalAlpha = 1;
        }
        if (j < kinds.length - 1) {
          g.c.globalAlpha = ease(s, 1.8 + 0.4 * kinds.length, 0.4);
          g.text("×", px + widths[j] + gap / 2, y2, 40, C.soft, "center", true);
          g.c.globalAlpha = 1;
        }
        px += widths[j] + gap;
      });
      g.c.globalAlpha = ease(s, 2.4 + 0.4 * kinds.length, 0.5);
      fit(
        g,
        lang === "id" ? "faktorisasi prima: perkalian yang sama ditulis sebagai pangkat" : "prime factorisation: the same prime multiplied again is written as a power",
        W / 2,
        490,
        900,
        24,
        C.ink,
      );
      g.c.globalAlpha = 1;
      stepper(g, lang, "n", W / 2 - 97, n, [n > 4, n < 200], C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Lay out squares in every rectangle they can make. A prime number makes only one: a single row.",
        id: "Susun persegi menjadi semua persegi panjang yang bisa dibuat. Bilangan prima hanya bisa membuat satu: satu baris saja.",
      },
      scene: rectangles,
    },
    {
      say: {
        en: "Circle a prime, then cross out all its multiples. After 2, 3, 5 and 7, every number left is a prime.",
        id: "Lingkari bilangan prima, lalu coret semua kelipatannya. Setelah 2, 3, 5, dan 7, semua bilangan yang tersisa adalah prima.",
      },
      scene: sieve,
    },
    {
      say: {
        en: "A factor tree splits a number into two factors again and again. Tap the numbers until every leaf is a prime.",
        id: "Pohon faktor memecah bilangan menjadi dua faktor berulang kali. Ketuk bilangannya sampai semua ujungnya bilangan prima.",
      },
      scene: tree,
    },
    {
      say: {
        en: "Gather the same primes together and write them as powers: 2 × 2 × 2 is 2³.",
        id: "Kumpulkan faktor prima yang sama dan tulis sebagai pangkat: 2 × 2 × 2 ditulis 2³.",
      },
      scene: powers,
    },
  ],
};
