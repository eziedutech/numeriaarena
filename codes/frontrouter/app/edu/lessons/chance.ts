import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, lerp, pulse } from "../ink";
import { frac, gcd, num, sum, wrap } from "../parts";

const COL = [C.coral, C.teal, C.cobalt, C.sun];
const COLOUR = {
  en: ["red", "green", "blue", "yellow"],
  id: ["merah", "hijau", "biru", "kuning"],
};

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** Fast at first, slowing to a stop. */
const easeOut = (k: number) => 1 - (1 - clamp(k, 0, 1)) ** 3;

/** A paper marble with a shine. */
function marble(g: Ink, x: number, y: number, r: number, color: string) {
  g.dot(x + 2, y + 3, r, "rgba(70, 50, 25, 0.22)");
  g.dot(x, y, r, color);
  g.dot(x - r * 0.35, y - r * 0.35, r * 0.28, "rgba(255, 255, 255, 0.55)");
}

/** A spinner the learner builds: add or recolour sectors, then spin and count where the arrow stops. */
function spinner(lang: Lang): Scene {
  let sectors = [0, 1, 2, 3];
  let results = [0, 0, 0, 0];
  let spin: { from: number; to: number; start: number } | null = null;
  let angle = -Math.PI / 2 + 0.4;
  let landed = -1;
  let landedAt = -9;
  let now = 0;
  const O = { x: 280, y: 300, r: 190 };
  const reset = () => {
    results = [0, 0, 0, 0];
    landed = -1;
  };
  const sectorAt = (a: number) => {
    const s = (Math.PI * 2) / sectors.length;
    let k = (a + Math.PI / 2) % (Math.PI * 2);
    if (k < 0) k += Math.PI * 2;
    return Math.min(sectors.length - 1, Math.floor(k / s));
  };
  return {
    press(id) {
      if (spin) return;
      if (id === "spin") {
        spin = { from: angle, to: angle + Math.PI * 2 * (3 + Math.random() * 2), start: now };
        landed = -1;
      }
      if (id === "add" && sectors.length < 8) {
        sectors = [...sectors, sectors.length % 4];
        reset();
      }
      if (id === "remove" && sectors.length > 2) {
        sectors = sectors.slice(0, -1);
        reset();
      }
    },
    down(p: Pt) {
      if (spin) return;
      const dx = p.x - O.x;
      const dy = p.y - O.y;
      if (dx * dx + dy * dy > O.r * O.r || dx * dx + dy * dy < 400) return;
      const i = sectorAt(Math.atan2(dy, dx));
      sectors = sectors.map((c, j) => (j === i ? (c + 1) % 4 : c));
      reset();
    },
    draw(g, t) {
      now = t;
      if (spin) {
        const k = (t - spin.start) / 3;
        angle = lerp(spin.from, spin.to, easeOut(k));
        if (k >= 1) {
          spin = null;
          landed = sectorAt(angle);
          landedAt = t;
          results[sectors[landed]] += 1;
        }
      }
      const n = sectors.length;
      const s = (Math.PI * 2) / n;
      const c = g.c;
      g.dot(O.x + 4, O.y + 6, O.r, "rgba(70, 50, 25, 0.22)");
      sectors.forEach((col, i) => {
        const a0 = -Math.PI / 2 + i * s;
        c.fillStyle = COL[col];
        c.beginPath();
        c.moveTo(O.x, O.y);
        c.arc(O.x, O.y, O.r, a0, a0 + s);
        c.closePath();
        c.fill();
        if (i === landed) {
          c.fillStyle = `rgba(255, 255, 255, ${0.45 * pulse(t - landedAt, 0.8)})`;
          c.fill();
        }
        g.crease(O.x, O.y, O.x + Math.cos(a0) * O.r, O.y + Math.sin(a0) * O.r);
      });
      // The arrow: a paper needle turning on a pin.
      const tip = { x: O.x + Math.cos(angle) * (O.r - 24), y: O.y + Math.sin(angle) * (O.r - 24) };
      const side = { x: Math.cos(angle + Math.PI / 2) * 14, y: Math.sin(angle + Math.PI / 2) * 14 };
      const tail = { x: O.x - Math.cos(angle) * 40, y: O.y - Math.sin(angle) * 40 };
      c.fillStyle = C.ink;
      c.beginPath();
      c.moveTo(tip.x, tip.y);
      c.lineTo(O.x + side.x, O.y + side.y);
      c.lineTo(tail.x, tail.y);
      c.lineTo(O.x - side.x, O.y - side.y);
      c.closePath();
      c.fill();
      g.dot(O.x, O.y, 12, C.paper);
      g.dot(O.x, O.y, 5, C.ink);
      const top =
        landed >= 0
          ? `${lang === "id" ? "jarum berhenti di" : "the arrow stops on"} ${COLOUR[lang][sectors[landed]]}`
          : spin
            ? lang === "id"
              ? "berputar..."
              : "spinning..."
            : "";
      fit(g, top, O.x, 60, 480, 28, C.ink);

      const px = 540;
      g.text(lang === "id" ? "peluang" : "chance", 700, 78, 22, C.soft, "center", true);
      g.text(lang === "id" ? "hasil" : "results", 860, 78, 22, C.soft, "center", true);
      const most = Math.max(10, ...results);
      [0, 1, 2, 3].forEach((col) => {
        const y = 104 + col * 92;
        const have = sectors.filter((x) => x === col).length;
        g.card(px, y, 420, 80, have ? C.paper : C.field, have ? 1 : 0.3);
        g.dot(px + 28, y + 40, 14, COL[col]);
        g.text(COLOUR[lang][col], px + 52, y + 40, 22, C.ink, "left", true);
        frac(g, have, n, 700, y + 40, 26, have ? C.ink : C.soft);
        const bw = (results[col] / most) * 120;
        if (bw > 0) g.card(780, y + 26, bw, 28, COL[col], 0.5);
        g.text(num(lang, results[col]), 790 + bw, y + 40, 22, C.ink, "left", true);
      });
      wrap(g, lang === "id" ? "ketuk sebuah juring untuk mengganti warnanya" : "tap a sector to change its colour", 300, 20).forEach((l, i) =>
        g.text(l, 800, 490 + i * 24, 20, C.soft),
      );
      const L = lang === "id" ? ["PUTAR", "+ JURING", "− JURING"] : ["SPIN", "+ SECTOR", "− SECTOR"];
      g.button("spin", L[0], 45, 555, 200, 52, C.coral, !spin);
      g.button("add", L[1], 265, 555, 200, 52, C.teal, !spin && n < 8);
      g.button("remove", L[2], 485, 555, 200, 52, C.cobalt, !spin && n > 2);
    },
  };
}

const BAG = [C.coral, C.teal, C.cobalt];

/** A bag of marbles: draw one at random, put it back, and watch the results stack up by colour. */
function bag(lang: Lang): Scene {
  const count = [3, 2, 1];
  let drawn = [0, 0, 0];
  let flights: { c: number; start: number }[] = [];
  let now = 0;
  const COLX = [580, 715, 850];
  const BASE = 455;
  const CAP = 56;
  const stackAt = (c: number, j: number) => ({ x: COLX[c] - 27 + (j % 4) * 18, y: BASE - 10 - Math.floor(j / 4) * 19 });
  const pick = () => {
    const total = count[0] + count[1] + count[2];
    let r = Math.random() * total;
    for (let c = 0; c < 3; c++) {
      if (r < count[c]) return c;
      r -= count[c];
    }
    return 2;
  };
  const full = () => drawn.some((d) => d + flights.length >= CAP);
  return {
    press(id) {
      if (id === "one" || id === "ten") {
        const times = id === "one" ? 1 : 10;
        const from = Math.max(now, ...flights.map((f) => f.start + 0.18));
        for (let j = 0; j < times; j++) flights.push({ c: pick(), start: from + j * 0.18 });
        return;
      }
      if (id === "clear") {
        drawn = [0, 0, 0];
        flights = [];
        return;
      }
      const c = Number(id.slice(1));
      count[c] = clamp(count[c] + (id[0] === "+" ? 1 : -1), 0, 6);
      drawn = [0, 0, 0];
      flights = [];
    },
    draw(g, t) {
      now = t;
      flights = flights.filter((f) => {
        if (t - f.start < 0.6) return true;
        drawn[f.c] += 1;
        return false;
      });
      const total = count[0] + count[1] + count[2];
      const c = g.c;
      // The bag: a paper sack, tied at the top.
      c.fillStyle = "rgba(70, 50, 25, 0.22)";
      c.beginPath();
      c.moveTo(130, 190);
      c.lineTo(334, 190);
      c.quadraticCurveTo(420, 330, 384, 482);
      c.lineTo(84, 482);
      c.quadraticCurveTo(48, 330, 130, 190);
      c.fill();
      c.fillStyle = C.sand;
      c.beginPath();
      c.moveTo(126, 184);
      c.lineTo(330, 184);
      c.quadraticCurveTo(416, 324, 380, 476);
      c.lineTo(80, 476);
      c.quadraticCurveTo(44, 324, 126, 184);
      c.fill();
      g.crease(150, 200, 310, 200);
      g.text(lang === "id" ? "isi kantong" : "in the bag", 230, 150, 24, C.soft, "center", true);
      const inBag = count.flatMap((n, ci) => Array.from({ length: n }, () => ci));
      inBag.forEach((ci, j) => {
        const row = Math.floor(j / 6);
        const x = 105 + (j % 6) * 44 + (row % 2) * 20;
        marble(g, x, 450 - row * 40, 17, BAG[ci]);
      });
      if (total === 0) g.text(lang === "id" ? "kosong" : "empty", 230, 340, 28, C.soft, "center", true);

      g.text(lang === "id" ? "hasil pengambilan" : "what was drawn", 715, 60, 24, C.soft, "center", true);
      g.line(520, BASE + 4, 910, BASE + 4, C.ink, 3);
      for (let ci = 0; ci < 3; ci++) {
        for (let j = 0; j < drawn[ci]; j++) {
          const q = stackAt(ci, j);
          marble(g, q.x, q.y, 8, BAG[ci]);
        }
        const rows = Math.ceil(drawn[ci] / 4);
        g.text(num(lang, drawn[ci]), COLX[ci], BASE - 30 - rows * 19, 26, C.ink, "center", true);
        frac(g, count[ci], total || 1, COLX[ci], 497, 22, total ? C.ink : C.soft);
      }
      g.text(lang === "id" ? "peluang" : "chance", 470, 497, 20, C.soft, "center", true);
      flights.forEach((f) => {
        const k = ease(t, f.start, 0.6);
        if (k <= 0) return;
        const end = stackAt(f.c, drawn[f.c] + flights.filter((o) => o.c === f.c && o.start < f.start).length);
        const x = lerp(230, end.x, k);
        const y = lerp(190, end.y, k) - Math.sin(Math.PI * k) * 140;
        marble(g, x, y, lerp(17, 8, k), BAG[f.c]);
      });

      for (let ci = 0; ci < 3; ci++) {
        g.button(`-${ci}`, "−", 45 + ci * 122, 555, 52, 52, BAG[ci], count[ci] > 0);
        g.button(`+${ci}`, "+", 103 + ci * 122, 555, 52, 52, BAG[ci], count[ci] < 6);
      }
      const L = lang === "id" ? ["AMBIL 1", "AMBIL 10", "ULANGI"] : ["DRAW 1", "DRAW 10", "CLEAR"];
      const can = total > 0 && !full();
      g.button("one", L[0], 430, 555, 160, 52, C.ink, can);
      g.button("ten", L[1], 605, 555, 170, 52, C.ink, can);
      g.button("clear", L[2], 790, 555, 165, 52, C.soft, drawn.some((d) => d > 0) || flights.length > 0);
    },
  };
}

/** Ten marbles in a box, some green: the chance of drawing green slides along a line from impossible to certain. */
function line(lang: Lang): Scene {
  let k = 3;
  let shown = 0.3;
  let drag = false;
  let changed = -9;
  let last = 0;
  let now = 0;
  const X0 = 100;
  const X1 = 900;
  const Y = 330;
  const set = (p: Pt) => {
    const nk = clamp(Math.round(((p.x - X0) / (X1 - X0)) * 10), 0, 10);
    if (nk !== k) changed = now;
    k = nk;
  };
  return {
    press(id) {
      k = clamp(k + (id === "+" ? 1 : -1), 0, 10);
      changed = now;
    },
    down(p) {
      const hx = lerp(X0, X1, shown);
      if (Math.abs(p.x - hx) > 40 && (p.y < Y - 30 || p.y > Y + 30)) return;
      if (p.x < X0 - 30 || p.x > X1 + 30) return;
      drag = true;
      set(p);
      return true;
    },
    move(p) {
      if (drag) set(p);
    },
    up() {
      drag = false;
    },
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      shown += (k / 10 - shown) * (1 - Math.exp(-dt * (drag ? 16 : 6)));
      g.card(260, 92, 480, 86, C.paper, 1);
      for (let i = 0; i < 10; i++) {
        const pop = i === (k > 0 ? k - 1 : 0) ? 1 + 0.3 * (1 - ease(t, changed, 0.35)) : 1;
        marble(g, 296 + i * 45.5, 135, 16 * pop, i < k ? C.teal : C.coral);
      }
      g.text(lang === "id" ? "ambil satu kelereng tanpa melihat" : "draw one marble without looking", 500, 66, 22, C.soft, "center", true);

      const words = lang === "id" ? ["mustahil", "kecil kemungkinannya", "sama besar", "besar kemungkinannya", "pasti"] : ["impossible", "unlikely", "even chance", "likely", "certain"];
      const grad = ramp(g, X0, X1, Y);
      g.c.fillStyle = grad;
      g.c.fillRect(X0, Y - 8, X1 - X0, 16);
      for (let i = 0; i <= 10; i++) {
        const x = lerp(X0, X1, i / 10);
        g.line(x, Y - (i % 5 ? 14 : 22), x, Y + (i % 5 ? 14 : 22), C.ink, i % 5 ? 2 : 3);
      }
      g.text("0", X0, Y + 50, 30, C.ink, "center", true);
      frac(g, 1, 2, 500, Y + 56, 26);
      g.text("1", X1, Y + 50, 30, C.ink, "center", true);
      const near = k === 0 ? 0 : k < 5 ? 1 : k === 5 ? 2 : k < 10 ? 3 : 4;
      words.forEach((w, i) => {
        const x = lerp(X0, X1, i / 4);
        const on = i === near;
        const ls = wrap(g, w, 150, 20);
        ls.forEach((l, j) => g.text(l, clamp(x, 80, 920), Y + 104 + j * 24, 20, on ? C.plum : C.soft, "center", on));
      });

      const hx = lerp(X0, X1, shown);
      g.c.fillStyle = C.teal;
      g.c.beginPath();
      g.c.moveTo(hx, Y - 14);
      g.c.lineTo(hx - 14, Y - 40);
      g.c.lineTo(hx + 14, Y - 40);
      g.c.closePath();
      g.c.fill();
      frac(g, k, 10, hx, Y - 82, 26, C.teal);
      g.handle(hx, Y, drag);

      const d = gcd(k, 10) || 1;
      const said = lang === "id" ? "peluang hijau" : "chance of green";
      const row: (string | [number, number])[] = [said, "=", [k, 10]];
      if (k === 0) row.push("=", "0");
      else if (k === 10) row.push("=", "1");
      else if (d > 1) row.push("=", [k / d, 10 / d]);
      sum(g, row, 500, 505, 28, [C.ink, C.ink, C.teal, C.ink, C.cobalt]);
      const L = lang === "id" ? ["− HIJAU", "+ HIJAU"] : ["− GREEN", "+ GREEN"];
      g.button("-", L[0], 290, 555, 200, 52, C.coral, k > 0);
      g.button("+", L[1], 510, 555, 200, 52, C.teal, k < 10);
    },
  };
}

/** A strip that runs from coral at impossible to teal at certain. */
function ramp(g: Ink, x0: number, x1: number, y: number) {
  const grad = g.c.createLinearGradient(x0, y, x1, y);
  grad.addColorStop(0, C.coral);
  grad.addColorStop(0.5, C.sun);
  grad.addColorStop(1, C.teal);
  return grad;
}

/** The pips of a die face, inside a square of side `s` centred at (x, y). */
function pips(g: Ink, face: number, x: number, y: number, s: number, color: string = C.ink) {
  const o = s * 0.27;
  const at: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  at[face].forEach(([a, b]) => g.dot(x + a * o, y + b * o, s * 0.09, color));
}

/** A coin or a die tossed many times: the share of each outcome settles toward an equal part. */
function toss(lang: Lang): Scene {
  let die = false;
  let counts = [0, 0];
  let pending = 0;
  let single = false;
  let acc = 0;
  let face = 0;
  let tossedAt = -9;
  let last = 0;
  const shares = [0, 0, 0, 0, 0, 0];
  const one = () => {
    face = Math.floor(Math.random() * counts.length);
    counts[face] += 1;
  };
  return {
    press(id) {
      if (id === "coin" || id === "die") {
        die = id === "die";
        counts = die ? [0, 0, 0, 0, 0, 0] : [0, 0];
        pending = 0;
        single = false;
        face = 0;
        shares.fill(0);
        return;
      }
      if (id === "clear") {
        counts = counts.map(() => 0);
        pending = 0;
        single = false;
        return;
      }
      if (id === "n1") {
        if (pending === 0 && !single) {
          single = true;
          tossedAt = last;
        }
        return;
      }
      pending += Number(id.slice(1));
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (single && t - tossedAt >= 0.6) {
        one();
        single = false;
      }
      if (pending > 0) {
        acc += dt * 60;
        while (acc >= 1 && pending > 0) {
          one();
          pending -= 1;
          acc -= 1;
        }
      } else acc = 0;
      const total = counts.reduce((a, b) => a + b, 0);
      counts.forEach((n, i) => (shares[i] += ((total ? n / total : 0) - shares[i]) * (1 - Math.exp(-dt * 6))));
      const busy = pending > 0 || single;

      // The coin or the die on the left, tumbling while tosses are being made.
      const cx = 190;
      const cy = 270;
      const roll = busy ? (t * 3) % 1 : 1;
      if (!die) {
        const sy = busy ? Math.abs(Math.cos(t * Math.PI * 7)) : 1;
        g.c.save();
        g.c.translate(cx, cy - (busy ? 40 * Math.sin(roll * Math.PI) : 0));
        g.c.scale(1, Math.max(0.06, sy));
        g.dot(3, 6, 90, "rgba(70, 50, 25, 0.22)");
        g.dot(0, 0, 90, "#e8b84a");
        g.dot(0, 0, 76, C.sun);
        const letter = lang === "id" ? ["A", "G"][face] : ["H", "T"][face];
        g.text(letter, 0, 0, 72, "#9a7420", "center", true);
        g.c.restore();
      } else {
        const show = busy ? 1 + Math.floor(t * 12) % 6 : face + 1;
        g.c.save();
        g.c.translate(cx, cy - (busy ? 40 * Math.sin(roll * Math.PI) : 0));
        g.c.rotate(busy ? Math.sin(t * 9) * 0.4 : 0);
        g.card(-75, -75, 150, 150, C.paper, 1.2);
        pips(g, show, 0, 0, 150);
        g.c.restore();
      }
      g.text(`${lang === "id" ? "lemparan" : "tosses"}: ${num(lang, total)}`, cx, 420, 28, C.ink, "center", true);
      if (!die)
        g.text(lang === "id" ? "A = angka, G = gambar" : "H = heads, T = tails", cx, 460, 20, C.soft, "center", true);

      const x0 = 400;
      const x1 = 950;
      const BASE = 460;
      const TALL = 360;
      const top = die ? 0.5 : 1;
      const n = counts.length;
      const slot = (x1 - x0) / n;
      const equal = 1 / n;
      g.line(x0, BASE, x1, BASE, C.ink, 3);
      counts.forEach((c, i) => {
        const x = x0 + slot * (i + 0.5);
        const h = (Math.min(top, shares[i]) / top) * TALL;
        const bw = Math.min(110, slot * 0.62);
        g.card(x - bw / 2, BASE - h, bw, h, die ? [C.coral, C.sun, C.teal, C.cobalt, C.plum, C.coral][i] : [C.cobalt, C.teal][i], 0.7);
        g.text(num(lang, c), x, BASE - h - 18, 22, C.ink, "center", true);
        if (die) {
          g.card(x - 18, BASE + 12, 36, 36, C.paper, 0.6);
          pips(g, i + 1, x, BASE + 30, 36);
        } else g.text(lang === "id" ? ["angka", "gambar"][i] : ["heads", "tails"][i], x, BASE + 28, 22, C.ink, "center", true);
      });
      const ey = BASE - (equal / top) * TALL;
      g.c.setLineDash([10, 7]);
      g.line(x0, ey, x1, ey, C.plum, 3);
      g.c.setLineDash([]);
      frac(g, 1, n, x0 - 22, ey, 22, C.plum);
      fit(g, lang === "id" ? `garis ungu: tiap hasil mendapat bagian yang sama` : `purple line: an equal share for each outcome`, (x0 + x1) / 2, 64, 540, 22, C.soft);

      const L = lang === "id" ? ["KOIN", "DADU", "LEMPAR 1", "LEMPAR 10", "LEMPAR 100", "ULANGI"] : ["COIN", "DIE", "TOSS 1", "TOSS 10", "TOSS 100", "CLEAR"];
      g.button("coin", L[0], 40, 555, 130, 52, die ? C.soft : C.cobalt);
      g.button("die", L[1], 180, 555, 130, 52, die ? C.cobalt : C.soft);
      g.button("n1", L[2], 340, 555, 150, 52, C.coral, !busy);
      g.button("n10", L[3], 500, 555, 150, 52, C.coral, pending < 500);
      g.button("n100", L[4], 660, 555, 165, 52, C.coral, pending < 500);
      g.button("clear", L[5], 835, 555, 125, 52, C.soft, total > 0);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Build a spinner: add sectors and tap them to change colour, then spin. The more sectors a colour has, the more often the arrow stops on it.",
        id: "Buat sebuah putaran: tambah juring dan ketuk untuk mengganti warnanya, lalu putar. Makin banyak juring suatu warna, makin sering jarum berhenti di warna itu.",
      },
      scene: spinner,
    },
    {
      say: {
        en: "Draw a marble from the bag without looking, then put it back. The chance of each colour is its marbles out of all the marbles.",
        id: "Ambil satu kelereng dari kantong tanpa melihat, lalu kembalikan. Peluang setiap warna adalah banyak kelereng warna itu dibagi banyak semua kelereng.",
      },
      scene: bag,
    },
    {
      say: {
        en: "Chance runs from 0, impossible, to 1, certain. Change how many marbles are green and watch the chance slide along the line.",
        id: "Peluang bernilai dari 0 (mustahil) sampai 1 (pasti). Ubah banyak kelereng hijau dan lihat peluangnya bergeser di sepanjang garis.",
      },
      scene: line,
    },
    {
      say: {
        en: "A coin has 2 equal sides and a die has 6 equal faces. Toss many times and the bars settle close to an equal share.",
        id: "Koin punya 2 sisi yang sama kemungkinannya, dadu punya 6 mata. Lempar berkali-kali dan batangnya makin mendekati bagian yang sama.",
      },
      scene: toss,
    },
  ],
};
