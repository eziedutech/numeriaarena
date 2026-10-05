import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp } from "../ink";
import { num, words, wrap } from "../parts";

const PLACES = {
  en: ["millions", "hundred thousands", "ten thousands", "thousands", "hundreds", "tens", "ones"],
  id: ["jutaan", "ratus ribuan", "puluh ribuan", "ribuan", "ratusan", "puluhan", "satuan"],
};

/** Column headers on two lines at most. */
function header(g: Ink, s: string, x: number, y: number, width: number) {
  wrap(g, s, width, 18).forEach((l, i, all) => g.text(l, x, y + (i - (all.length - 1) / 2) * 20, 18, C.soft));
}

/** The chart: a digit in each column, changed with + and −, and what each is worth. */
function chart(lang: Lang): Scene {
  const digits = [0, 3, 4, 5, 2, 1, 6];
  const changed = digits.map(() => -1);
  let now = 0;
  const value = () => digits.reduce((n, d) => n * 10 + d, 0);
  const colW = 128;
  const x0 = (W - colW * 7 - 6 * 8) / 2;
  return {
    press(id) {
      const [sign, at] = [id[0], Number(id.slice(1))];
      if (at === 0) {
        // A million has nothing beside it in this chart.
        digits.fill(0);
        digits[0] = sign === "+" ? 1 : 0;
      } else {
        digits[0] = 0;
        digits[at] = clamp(digits[at] + (sign === "+" ? 1 : -1), 0, 9);
      }
      changed[at] = now;
    },
    draw(g, t) {
      now = t;
      g.text(num(lang, value()), W / 2, 62, 60, C.ink, "center", true);
      digits.forEach((d, i) => {
        const x = x0 + i * (colW + 8);
        const flash = changed[i] >= 0 ? 1 - ease(t, changed[i], 0.6) : 0;
        g.card(x, 120, colW, 300, i < 4 ? "#f8efdc" : C.paper);
        if (flash > 0) {
          g.c.fillStyle = `rgba(255, 209, 102, ${0.6 * flash})`;
          g.c.fillRect(x, 120, colW, 300);
        }
        header(g, PLACES[lang][i], x + colW / 2, 158, colW - 12);
        const drop = ease(t, 0.15 * i, 0.5);
        g.c.globalAlpha = drop;
        g.text(String(d), x + colW / 2, 250 - 40 * (1 - drop), 80, d === 0 ? C.soft : C.cobalt, "center", true);
        g.c.globalAlpha = 1;
        g.button(`+${i}`, "+", x + 8, 340, 52, 48, C.teal, i === 0 ? digits[0] === 0 : digits[i] < 9);
        g.button(`-${i}`, "−", x + colW - 60, 340, 52, 48, C.coral, digits[i] > 0);
        const worth = d * 10 ** (6 - i);
        g.text(d === 0 ? "0" : num(lang, worth), x + colW / 2, 452, 22, d === 0 ? C.soft : C.ink, "center", true);
      });
      const parts = digits.map((d, i) => d * 10 ** (6 - i)).filter((v) => v > 0);
      const line = parts.length ? `${parts.map((v) => num(lang, v)).join(" + ")} = ${num(lang, value())}` : "0";
      g.card(x0, 500, W - 2 * x0, 80, C.field, 0);
      g.text(line, W / 2, 540, line.length > 50 ? 22 : 28, C.ink, "center", true);
    },
  };
}

const CELL = 14;

/** Ones, tens and hundreds as paper squares: ten of one fold into one of the next. */
function regroup(lang: Lang): Scene {
  const n = { h: 1, t: 2, o: 7 };
  let fold: { kind: "o" | "t"; start: number } | null = null;
  let now = 0;
  const L = lang === "id" ? { add1: "+1", add10: "+10", again: "ULANGI" } : { add1: "+1", add10: "+10", again: "START OVER" };
  const hx = (i: number) => 40 + i * (10 * CELL + 10);
  const tx = (i: number) => 530 + i * (CELL + 8);
  const ox = (i: number) => 790 + (i % 3) * (CELL + 14);
  const oy = (i: number) => 200 + Math.floor(i / 3) * (CELL + 14);

  const grid = (g: Ink, x: number, y: number, cols: number, rows: number, color: string) => {
    g.card(x, y, cols * CELL, rows * CELL, color, 0.8);
    for (let i = 1; i < cols; i++) g.line(x + i * CELL, y, x + i * CELL, y + rows * CELL, "rgba(255,255,255,0.7)", 1);
    for (let j = 1; j < rows; j++) g.line(x, y + j * CELL, x + cols * CELL, y + j * CELL, "rgba(255,255,255,0.7)", 1);
  };

  return {
    press(id) {
      if (fold) return;
      if (id === "again") Object.assign(n, { h: 0, t: 0, o: 0 });
      if (id === "o" && !(n.h === 3 && n.t === 9 && n.o === 9)) {
        n.o += 1;
        if (n.o === 10) fold = { kind: "o", start: now };
      }
      if (id === "t" && n.h < 3) {
        n.t += 1;
        if (n.t === 10) fold = { kind: "t", start: now };
      }
    },
    draw(g, t) {
      now = t;
      // A fold finishes: ten become one of the next column.
      if (fold && t - fold.start > 1.4) {
        if (fold.kind === "o") {
          n.o = 0;
          n.t += 1;
          if (n.t === 10) fold = { kind: "t", start: t };
          else fold = null;
        } else {
          n.t = 0;
          n.h = Math.min(3, n.h + 1);
          fold = null;
        }
      }
      const names = lang === "id" ? ["ratusan", "puluhan", "satuan"] : ["hundreds", "tens", "ones"];
      [40, 530, 790].forEach((x, i) => g.text(names[i], x, 165, 22, C.soft, "left", true));
      for (let i = 0; i < n.h; i++) grid(g, hx(i), 200, 10, 10, C.cobalt);
      const k = fold ? ease(t, fold.start, 1.2) : 0;
      // Tens: a strip that folds into a hundred moves as one.
      for (let i = 0; i < n.t; i++) {
        if (fold?.kind === "t") {
          const x = lerp(tx(i), hx(n.h) + i * CELL, k);
          grid(g, x, 200, 1, 10, k > 0.95 ? C.cobalt : C.teal);
        } else grid(g, tx(i), 200, 1, 10, C.teal);
      }
      for (let i = 0; i < n.o; i++) {
        if (fold?.kind === "o") {
          const x = lerp(ox(i), tx(n.t), k);
          const y = lerp(oy(i), 200 + i * CELL, k);
          grid(g, x, y, 1, 1, k > 0.95 ? C.teal : C.coral);
        } else grid(g, ox(i), oy(i), 1, 1, C.coral);
      }
      if (fold) {
        const msg = fold.kind === "o" ? (lang === "id" ? "10 satuan = 1 puluhan" : "10 ones = 1 ten") : lang === "id" ? "10 puluhan = 1 ratusan" : "10 tens = 1 hundred";
        g.card(W / 2 - 200, 372, 400, 56, C.sun, 1);
        g.text(msg, W / 2, 400, 28, C.ink, "center", true);
      }
      g.text(String(n.h), 40 + 70, 470, 72, C.cobalt, "center", true);
      g.text(String(n.t), 600, 470, 72, C.teal, "center", true);
      g.text(String(n.o), 820, 470, 72, C.coral, "center", true);
      const total = n.h * 100 + n.t * 10 + n.o;
      g.text(`= ${num(lang, total)}`, W / 2, 560, 40, C.ink, "center", true);
      g.button("t", L.add10, 680, 540, 90, 52, C.teal, !fold && n.h < 3);
      g.button("o", L.add1, 880, 540, 80, 52, C.coral, !fold && total < 399);
      g.button("again", L.again, 40, 540, 190, 52, C.soft, !fold);
    },
  };
}

/** One digit dragged across the columns: each step left is worth ten times more. */
function slide(lang: Lang): Scene {
  const cols = 6;
  const colW = 140;
  const x0 = (W - colW * cols) / 2;
  let at = 5;
  let drag: number | null = null;
  const names = PLACES[lang].slice(1);
  const cx = () => (drag ?? x0 + at * colW + colW / 2);
  return {
    down(p) {
      if (Math.abs(p.x - cx()) < 60 && p.y > 200 && p.y < 380) {
        drag = p.x;
        return true;
      }
    },
    move(p: Pt) {
      drag = clamp(p.x, x0 + colW / 2, x0 + colW * (cols - 0.5));
    },
    up() {
      if (drag !== null) at = clamp(Math.round((drag - x0 - colW / 2) / colW), 0, cols - 1);
      drag = null;
    },
    draw(g, t) {
      for (let i = 0; i < cols; i++) {
        const x = x0 + i * colW;
        g.card(x + 4, 120, colW - 8, 320, i % 2 ? C.paper : "#f8efdc", 0.6);
        header(g, names[i], x + colW / 2, 152, colW - 20);
        if (i < cols - 1) g.text("×10", x + colW, 470, 22, C.teal, "center", true);
      }
      for (let i = 0; i < cols - 1; i++) {
        const x = x0 + (i + 0.5) * colW;
        g.c.strokeStyle = C.teal;
        g.c.lineWidth = 3;
        g.c.beginPath();
        g.c.moveTo(x + colW - 10, 492);
        g.c.quadraticCurveTo(x + colW / 2, 520, x + 14, 492);
        g.c.stroke();
        g.line(x + 14, 492, x + 26, 488, C.teal, 3);
        g.line(x + 14, 492, x + 22, 502, C.teal, 3);
      }
      const bob = drag === null ? Math.sin(t * 3) * 3 : -6;
      g.card(cx() - 48, 230 + bob, 96, 120, C.cobalt, drag === null ? 1 : 1.8);
      g.text("7", cx(), 290 + bob, 84, C.paper, "center", true);
      const place = clamp(Math.round((cx() - x0 - colW / 2) / colW), 0, cols - 1);
      const worth = 7 * 10 ** (cols - 1 - place);
      g.text(lang === "id" ? `bernilai ${num(lang, worth)}` : `worth ${num(lang, worth)}`, W / 2, 580, 36, C.ink, "center", true);
      if (t < 4 && drag === null) g.text(lang === "id" ? "geser angkanya" : "drag the digit", cx(), 390, 20, C.coral, "center", true);
    },
  };
}

/** A big number read in groups of three: the thousands, then the rest. */
function read(lang: Lang): Scene {
  let n = 482305;
  let shown = 0;
  return {
    press(id) {
      if (id === "new") {
        n = 100000 + Math.floor(Math.random() * 900000);
        shown = -1;
      }
    },
    draw(g, t) {
      if (shown < 0) shown = t;
      const k = ease(t, shown, 0.8);
      const th = Math.floor(n / 1000);
      const rest = n % 1000;
      const a = String(th);
      const b = String(rest).padStart(3, "0");
      const sep = lang === "id" ? "." : ",";
      const size = 96;
      const wa = g.width(a, size, true);
      const ws = g.width(sep, size, true);
      const wb = g.width(b, size, true);
      const x = W / 2 - (wa + ws + wb) / 2;
      g.text(a, x + wa / 2, 170, size, C.coral, "center", true);
      g.text(sep, x + wa + ws / 2, 170, size, C.ink, "center", true);
      g.text(b, x + wa + ws + wb / 2, 170, size, C.cobalt, "center", true);
      // Brackets under each group.
      const bracket = (x1: number, x2: number, color: string, label: string) => {
        g.line(x1, 240, x1, 252, color, 4);
        g.line(x1, 252, x2, 252, color, 4);
        g.line(x2, 240, x2, 252, color, 4);
        g.text(label, (x1 + x2) / 2, 285, 26, color, "center", true);
      };
      g.c.globalAlpha = k;
      bracket(x, x + wa, C.coral, lang === "id" ? "ribu" : "thousand");
      bracket(x + wa + ws, x + wa + ws + wb, C.cobalt, lang === "id" ? "satuan" : "ones");
      const first = `${words(lang, th)} ${lang === "id" ? "ribu" : "thousand"}`.replace(/^satu ribu/u, "seribu");
      const second = rest ? words(lang, rest) : "";
      const lines = [...wrap(g, first, 860, 34).map((s) => [s, C.coral] as const), ...wrap(g, second, 860, 34).map((s) => [s, C.cobalt] as const)];
      lines.forEach(([s, color], i) => g.text(s, W / 2, 360 + i * 46, 34, color, "center", true));
      g.c.globalAlpha = 1;
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W / 2 - 140, 555, 280, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Every digit sits in a column, and the column tells what the digit is worth. Press + and − to change a digit and watch its worth.",
        id: "Setiap angka duduk di satu kolom, dan kolom itu menentukan nilainya. Tekan + dan − untuk mengubah angka, lalu lihat nilainya.",
      },
      scene: chart,
    },
    {
      say: {
        en: "Ten ones fold into one ten, and ten tens fold into one hundred. Add ones and watch them fold.",
        id: "Sepuluh satuan terlipat menjadi satu puluhan, dan sepuluh puluhan menjadi satu ratusan. Tambah satuan, lalu lihat lipatannya.",
      },
      scene: regroup,
    },
    {
      say: {
        en: "Move the 7 one column to the left and it is worth ten times more.",
        id: "Geser angka 7 satu kolom ke kiri, nilainya menjadi sepuluh kali lipat.",
      },
      scene: slide,
    },
    {
      say: {
        en: "Read a big number in groups of three from the left: first the thousands, then the rest.",
        id: "Baca bilangan besar per kelompok tiga angka dari kiri: ribuannya dulu, lalu sisanya.",
      },
      scene: read,
    },
  ],
};
