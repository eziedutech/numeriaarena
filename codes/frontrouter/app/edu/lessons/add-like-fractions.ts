import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { frac, num, strip, sum } from "../parts";

/** A minus, a value and a plus in a row with a small name above. */
function stepper(g: Ink, lang: Lang, key: string, x: number, value: number, lo: number, hi: number, color: string, name: string) {
  g.text(name, x + 97, 530, 22, C.soft, "center", true);
  g.button(`${key}-`, "−", x, 555, 64, 52, color, value > lo);
  g.text(num(lang, value), x + 97, 581, 34, color, "center", true);
  g.button(`${key}+`, "+", x + 130, 555, 64, 52, color, value < hi);
}

/** One piece of a strip: a lifted card with a paper edge. */
function piece(g: Ink, x: number, y: number, w: number, h: number, color: string, lift = 0.8) {
  g.card(x, y, w, h, color, lift);
  g.c.strokeStyle = C.paper;
  g.c.lineWidth = 2;
  g.c.strokeRect(x, y, w, h);
}

/** The result written after "=": a fraction, and when it passes one whole also as wholes and a fraction. */
function result(lang: Lang, r: number, b: number) {
  const out: (string | [string, string])[] = [[num(lang, r), num(lang, b)]];
  if (r >= b) {
    out.push("=");
    out.push(num(lang, Math.floor(r / b)));
    if (r % b) out.push([num(lang, r % b), num(lang, b)]);
  }
  return out;
}

/** Pieces of the same size slide down into one strip; past one whole they spill into a second. */
function together(lang: Lang): Scene {
  let a = 2;
  let c = 4;
  let b = 5;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "a+") a += 1;
      if (id === "a-") a -= 1;
      if (id === "c+") c += 1;
      if (id === "c-") c -= 1;
      if (id === "b+") b = clamp(b + 1, 2, 8);
      if (id === "b-") b = clamp(b - 1, 2, 8);
      a = clamp(a, 1, b);
      c = clamp(c, 1, b);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const w = 400;
      const pw = w / b;
      const left = 80;
      const right = 520;
      const r = a + c;
      // The two fractions, each on its own whole.
      strip(g, left, 50, w, 60, b, 0, C.paper);
      strip(g, right, 50, w, 60, b, 0, C.paper);
      frac(g, num(lang, a), num(lang, b), left + w / 2, 160, 32, C.coral);
      frac(g, num(lang, c), num(lang, b), right + w / 2, 160, 32, C.teal);
      g.text("+", 500, 80, 40, C.ink, "center", true);
      // The wholes they land in; the second waits faintly until it is needed.
      strip(g, left, 250, w, 70, b, 0, C.paper);
      g.c.globalAlpha = r > b ? 1 : 0.3;
      strip(g, right, 250, w, 70, b, 0, C.paper);
      g.c.globalAlpha = 1;
      for (let n = 0; n < r; n++) {
        const fromA = n < a;
        const sx = fromA ? left + n * pw : right + (n - a) * pw;
        const tx = (n >= b ? right : left) + (n % b) * pw;
        const k = ease(t, changed + 0.5 + 0.18 * n, 0.6);
        const y = lerp(50, 250, k);
        const x = lerp(sx, tx, k);
        piece(g, x, y, pw, lerp(60, 70, k), fromA ? C.coral : C.teal, 0.8 + 0.6 * Math.sin(Math.PI * k));
      }
      const done = ease(t, changed + 0.7 + 0.18 * r, 0.4);
      g.c.globalAlpha = done;
      const parts: (string | [string, string])[] = [[num(lang, a), num(lang, b)], "+", [num(lang, c), num(lang, b)], "=", ...result(lang, r, b)];
      sum(g, parts, W / 2, 400, 46, [C.coral, C.ink, C.teal, C.ink, C.plum, C.ink, C.plum, C.plum]);
      g.text(
        lang === "id"
          ? `penyebut tetap ${num(lang, b)}, pembilang dijumlah: ${num(lang, a)} + ${num(lang, c)} = ${num(lang, r)}`
          : `denominator stays ${num(lang, b)}, add the numerators: ${num(lang, a)} + ${num(lang, c)} = ${num(lang, r)}`,
        W / 2,
        480,
        24,
        C.soft,
        "center",
        true,
      );
      g.c.globalAlpha = 1;
      const top = lang === "id" ? "pembilang" : "numerator";
      stepper(g, lang, "a", 40, a, 1, b, C.coral, top);
      stepper(g, lang, "b", W / 2 - 97, b, 2, 8, C.soft, lang === "id" ? "penyebut" : "denominator");
      stepper(g, lang, "c", W - 234, c, 1, b, C.teal, top);
    },
  };
}

/** Pieces lifted off a strip and set aside: what stays is the difference, still in the same pieces. */
function takeAway(lang: Lang): Scene {
  let a = 5;
  let c = 2;
  let b = 6;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "a+") a += 1;
      if (id === "a-") a -= 1;
      if (id === "c+") c += 1;
      if (id === "c-") c -= 1;
      if (id === "b+") b = clamp(b + 1, 2, 10);
      if (id === "b-") b = clamp(b - 1, 2, 10);
      a = clamp(a, 1, b);
      c = clamp(c, 0, a);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const x = 150;
      const w = 700;
      const y = 170;
      const pw = w / b;
      strip(g, x, y, w, 100, b, 0, C.paper);
      g.text(lang === "id" ? "satu utuh" : "one whole", x + w / 2, y + 130, 22, C.soft, "center", true);
      for (let n = 0; n < a - c; n++) piece(g, x + n * pw, y, pw, 100, C.coral);
      // The last ones lift off and float up to the side, one after another.
      for (let j = 0; j < c; j++) {
        const n = a - c + j;
        const k = ease(t, changed + 0.6 + 0.3 * j, 0.7);
        const px = lerp(x + n * pw, x + n * pw + 30, k);
        const py = lerp(y, 40, k);
        g.c.globalAlpha = lerp(1, 0.55, k);
        piece(g, px, py, pw, lerp(100, 70, k), C.teal, 0.8 + 0.8 * k);
        g.c.globalAlpha = 1;
      }
      const done = ease(t, changed + 0.9 + 0.3 * c, 0.4);
      g.c.globalAlpha = done;
      sum(g, [[num(lang, a), num(lang, b)], "−", [num(lang, c), num(lang, b)], "=", [num(lang, a - c), num(lang, b)]], W / 2, 390, 50, [C.coral, C.ink, C.teal, C.ink, C.plum]);
      g.text(
        lang === "id"
          ? `penyebut tetap ${num(lang, b)}, pembilang dikurangi: ${num(lang, a)} − ${num(lang, c)} = ${num(lang, a - c)}`
          : `denominator stays ${num(lang, b)}, subtract the numerators: ${num(lang, a)} − ${num(lang, c)} = ${num(lang, a - c)}`,
        W / 2,
        470,
        24,
        C.soft,
        "center",
        true,
      );
      g.c.globalAlpha = 1;
      stepper(g, lang, "a", 40, a, 1, b, C.coral, lang === "id" ? "yang ada" : "you have");
      stepper(g, lang, "b", W / 2 - 97, b, 2, 10, C.soft, lang === "id" ? "penyebut" : "denominator");
      stepper(g, lang, "c", W - 234, c, 0, a, C.teal, lang === "id" ? "diambil" : "taken away");
    },
  };
}

/** Hops along a number line from 0 to 2: one long hop to a/b, then c short hops of one piece each, forward or back. */
function hops(lang: Lang): Scene {
  let a = 3;
  let c = 4;
  let b = 5;
  let minus = false;
  let changed = 0;
  let now = 0;
  return {
    press(id) {
      if (id === "op") minus = !minus;
      if (id === "a+") a += 1;
      if (id === "a-") a -= 1;
      if (id === "c+") c += 1;
      if (id === "c-") c -= 1;
      if (id === "b+") b = clamp(b + 1, 2, 8);
      if (id === "b-") b = clamp(b - 1, 2, 8);
      a = clamp(a, 1, b);
      c = clamp(c, 1, minus ? a : b);
      changed = now;
    },
    draw(g, t) {
      now = t;
      const x0 = 80;
      const x1 = 920;
      const y = 290;
      const xs = (v: number) => lerp(x0, x1, v / (2 * b));
      g.line(x0, y, x1, y, C.ink, 3);
      for (let i = 0; i <= 2 * b; i++) {
        const whole = i % b === 0;
        g.line(xs(i), y - (whole ? 14 : 8), xs(i), y + (whole ? 14 : 8), whole ? C.ink : C.soft, whole ? 3 : 2);
        if (whole) g.text(num(lang, i / b), xs(i), y + 44, 30, C.ink, "center", true);
        else frac(g, num(lang, i % b), num(lang, b), xs(i), y + 44, 20, C.soft);
      }
      const arc = (from: number, to: number, height: number, k: number, color: string) => {
        const sx = xs(from);
        const ex = xs(to);
        g.c.strokeStyle = color;
        g.c.lineWidth = 4;
        g.c.beginPath();
        for (let i = 0; i <= 24 * k; i++) {
          const u = i / 24;
          const px = lerp(sx, ex, u);
          const py = y - Math.sin(Math.PI * u) * height;
          if (i) g.c.lineTo(px, py);
          else g.c.moveTo(px, py);
        }
        g.c.stroke();
      };
      // The long hop to the first fraction.
      const k0 = ease(t, changed + 0.3, 0.8);
      arc(0, a, 150, k0, C.coral);
      if (k0 >= 1) g.dot(xs(a), y, 9, C.coral);
      // Then one short hop for every piece added or taken away, counted as it lands.
      let at = a;
      for (let j = 0; j < c; j++) {
        const k = ease(t, changed + 1.2 + 0.45 * j, 0.4);
        if (k <= 0) break;
        const next = minus ? at - 1 : at + 1;
        arc(at, next, minus ? 60 : 80, k, C.teal);
        if (k >= 1) {
          g.dot(xs(next), y, 8, C.teal);
          g.text(num(lang, j + 1), (xs(at) + xs(next)) / 2, y - (minus ? 60 : 80) - 22, 22, C.teal, "center", true);
        }
        at = next;
      }
      const r = minus ? a - c : a + c;
      g.c.globalAlpha = ease(t, changed + 1.4 + 0.45 * c, 0.4);
      sum(g, [[num(lang, a), num(lang, b)], minus ? "−" : "+", [num(lang, c), num(lang, b)], "=", [num(lang, r), num(lang, b)]], W / 2, 440, 46, [C.coral, C.ink, C.teal, C.ink, C.plum]);
      g.c.globalAlpha = 1;
      stepper(g, lang, "a", 40, a, 1, b, C.coral, lang === "id" ? "pembilang" : "numerator");
      stepper(g, lang, "b", 270, b, 2, 8, C.soft, lang === "id" ? "penyebut" : "denominator");
      g.button("op", minus ? "−" : "+", 530, 555, 100, 52, C.cobalt);
      stepper(g, lang, "c", W - 234, c, 1, minus ? a : b, C.teal, lang === "id" ? "lompatan" : "hops");
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Pieces of the same size can be put together. The denominator stays the same and the numerators add up.",
        id: "Potongan yang sama besar bisa langsung digabung. Penyebutnya tetap, pembilangnya dijumlahkan.",
      },
      scene: together,
    },
    {
      say: {
        en: "Taking away works the same way: lift some pieces off. The denominator stays, and you take away the numerators.",
        id: "Pengurangan juga begitu: ambil beberapa potongan. Penyebutnya tetap, pembilangnya dikurangi.",
      },
      scene: takeAway,
    },
    {
      say: {
        en: "On the number line every hop is one piece. Hop forward to add, or back to take away.",
        id: "Pada garis bilangan, setiap lompatan adalah satu potong. Lompat maju untuk menjumlah, mundur untuk mengurangi.",
      },
      scene: hops,
    },
  ],
};
