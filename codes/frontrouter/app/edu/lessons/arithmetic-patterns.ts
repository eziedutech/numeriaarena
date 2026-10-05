import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { num } from "../parts";

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** Coloured pieces in one line centred on x, shrunk together to fit. */
function pieces(g: Ink, parts: [string, string][], x: number, y: number, max: number, size: number) {
  let k = size;
  while (k > 18 && g.width(parts.map((p) => p[0]).join(" "), k, true) > max) k -= 1;
  const space = g.width(" ", k, true);
  const ws = parts.map(([s]) => g.width(s, k, true));
  let at = x - (ws.reduce((a, b) => a + b, 0) + space * (parts.length - 1)) / 2;
  parts.forEach(([s, color], i) => {
    g.text(s, at, y, k, color, "left", true);
    at += ws[i] + space;
  });
}

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  fit(g, label, cx, 518, 230, 22, C.soft);
  g.button(`${id}-`, "−", cx - 115, 545, 70, 52, color, canDown);
  fit(g, value, cx, 571, 84, 30, C.ink);
  g.button(`${id}+`, "+", cx + 45, 545, 70, 52, color, canUp);
}

/** A curved jump from a to b at height `y`, drawn as far as `k`. */
function hopArc(g: Ink, a: number, b: number, y: number, h: number, k: number, color: string) {
  g.c.strokeStyle = color;
  g.c.lineWidth = 3;
  g.c.beginPath();
  for (let s = 0; s <= 30 * k; s++) {
    const u = s / 30;
    const px = lerp(a, b, u);
    const py = y - Math.sin(Math.PI * u) * h;
    if (s) g.c.lineTo(px, py);
    else g.c.moveTo(px, py);
  }
  g.c.stroke();
}

/** A paper frog, its eyes on top. */
function frog(g: Ink, x: number, y: number) {
  g.dot(x + 2, y + 4, 16, "rgba(70, 50, 25, 0.22)");
  g.dot(x, y, 16, C.teal);
  g.dot(x - 7, y - 13, 6, C.paper);
  g.dot(x + 7, y - 13, 6, C.paper);
  g.dot(x - 7, y - 13, 3, C.ink);
  g.dot(x + 7, y - 13, 3, C.ink);
}

/** A frog hops along a number line by the same difference each time; every landing is the next term. */
function hops(lang: Lang): Scene {
  let first = 3;
  let diff = 4;
  let shown = 1;
  const born = [0, -1, -1, -1, -1, -1, -1];
  let now = 0;
  const HOP = 0.7;
  const lx = 60;
  const lw = 880;
  const ly = 420;
  return {
    press(id) {
      if (id === "hop") {
        if (shown < 7 && now - born[shown - 1] > HOP) {
          born[shown] = now;
          shown += 1;
        }
        return;
      }
      if (id === "f-") first = clamp(first - 1, 0, 10);
      if (id === "f+") first = clamp(first + 1, 0, 10);
      if (id === "d-") diff = clamp(diff - 1, 1, 6);
      if (id === "d+") diff = clamp(diff + 1, 1, 6);
      shown = 1;
      born[0] = now;
    },
    draw(g, t) {
      now = t;
      const terms = [...Array(7).keys()].map((i) => first + i * diff);
      const span = Math.ceil((terms[6] + 1) / 5) * 5;
      const px = (v: number) => lx + (v / span) * lw;
      fit(g, lang === "id" ? `beda: +${diff}` : `difference: +${diff}`, W / 2, 46, 600, 40, C.coral);
      // The terms so far on cards.
      const cw = 100;
      const x0 = (W - (7 * cw + 6 * 30)) / 2;
      for (let i = 0; i < 7; i++) {
        const x = x0 + i * (cw + 30);
        if (i >= shown) {
          g.card(x, 100, cw, 70, C.field, 0);
          continue;
        }
        const k = ease(t, born[i] + (i ? HOP * 0.8 : 0), 0.35);
        g.c.globalAlpha = k;
        g.card(x, 100 - (1 - k) * 20, cw, 70, i === shown - 1 ? C.sun : C.paper, 1);
        g.text(num(lang, terms[i]), x + cw / 2, 135 - (1 - k) * 20, 36, C.ink, "center", true);
        g.c.globalAlpha = 1;
        fit(g, lang === "id" ? `suku ke-${i + 1}` : `term ${i + 1}`, x + cw / 2, 190, cw, 18, C.soft);
        if (i > 0) g.text(`+${diff}`, x - 15, 135, 20, C.coral, "center", true);
      }
      // The number line.
      g.line(lx - 10, ly, lx + lw + 10, ly, C.ink, 3);
      const every = span > 30 ? 2 : 1;
      for (let v = 0; v <= span; v += every) {
        const big = v % 5 === 0;
        g.line(px(v), ly - (big ? 10 : 6), px(v), ly + (big ? 10 : 6), C.ink, big ? 3 : 2);
        if (big) g.text(num(lang, v), px(v), ly + 32, 20, C.soft, "center", true);
      }
      for (let i = 0; i < shown; i++) {
        const x = px(terms[i]);
        g.dot(x, ly, 8, C.coral);
        if (i > 0) {
          const a = px(terms[i - 1]);
          const k = ease(t, born[i], HOP);
          const h = Math.min(120, (x - a) * 0.6 + 20);
          hopArc(g, a, x, ly - 8, h, k, C.coral);
          g.c.globalAlpha = k;
          g.text(`+${diff}`, (a + x) / 2, ly - h - 22, 22, C.coral, "center", true);
          g.c.globalAlpha = 1;
        }
      }
      // The frog rides the newest hop.
      const last = shown - 1;
      const kf = last > 0 ? ease(t, born[last], HOP) : 1;
      const fa = px(terms[Math.max(0, last - 1)]);
      const fb = px(terms[last]);
      const fh = last > 0 ? Math.min(120, (fb - fa) * 0.6 + 20) : 0;
      frog(g, lerp(fa, fb, kf), ly - 24 - Math.sin(Math.PI * kf) * fh - (kf >= 1 ? pulse(t, 0.9) * 4 : 0));

      stepper(g, lang === "id" ? "suku pertama" : "first term", String(first), "f", 130, first > 0, first < 10, C.cobalt);
      stepper(g, lang === "id" ? "beda" : "difference", String(diff), "d", 375, diff > 1, diff < 6, C.coral);
      g.button("hop", lang === "id" ? "LOMPAT" : "HOP", 540, 545, 200, 52, C.teal, shown < 7);
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", 760, 545, 200, 52, C.soft, shown > 1);
    },
  };
}

/** Each term as a strip: the first term, then one difference more on every row, so term n has n − 1 differences. */
function rule(lang: Lang): Scene {
  let first = 4;
  let diff = 3;
  let n = 5;
  let built = 0;
  let now = 0;
  const lx = 120;
  const rowH = 38;
  const y0 = 66;
  return {
    press(id) {
      if (id === "f-") first = clamp(first - 1, 1, 10);
      if (id === "f+") first = clamp(first + 1, 1, 10);
      if (id === "d-") diff = clamp(diff - 1, 1, 5);
      if (id === "d+") diff = clamp(diff + 1, 1, 5);
      if (id === "n-") n = clamp(n - 1, 1, 8);
      if (id === "n+") n = clamp(n + 1, 1, 8);
      built = now;
    },
    draw(g, t) {
      now = t;
      const unit = Math.min(30, 740 / (first + 7 * diff));
      for (let r = 0; r < n; r++) {
        const y = y0 + r * (rowH + 6);
        const last = r === n - 1;
        // Rows before the last are there at once; the last builds block by block.
        const at = (j: number) => (last ? ease(t, built + 0.3 + j * 0.25, 0.3) : 1);
        fit(g, lang === "id" ? `ke-${r + 1}` : `term ${r + 1}`, lx - 14, y + rowH / 2, 90, 20, last ? C.ink : C.soft, "right");
        if (last) {
          g.c.fillStyle = `rgba(255, 209, 102, ${0.25 + 0.2 * pulse(t, 2)})`;
          g.c.fillRect(lx - 100, y - 3, W - lx + 60, rowH + 6);
        }
        const k0 = at(0);
        g.c.globalAlpha = k0;
        g.card(lx, y, first * unit, rowH, C.cobalt, 0.8);
        fit(g, String(first), lx + (first * unit) / 2, y + rowH / 2, first * unit - 4, 22, C.paper);
        g.c.globalAlpha = 1;
        for (let j = 0; j < r; j++) {
          const k = at(j + 1);
          if (k <= 0) continue;
          const x = lx + (first + j * diff) * unit;
          g.c.globalAlpha = k;
          g.card(x, y - (1 - k) * 18, diff * unit, rowH, C.coral, 0.8);
          if (diff * unit >= 34) fit(g, `+${diff}`, x + (diff * unit) / 2, y + rowH / 2 - (1 - k) * 18, diff * unit - 4, 20, C.paper);
          g.c.globalAlpha = 1;
          g.crease(x, y + 3, x, y + rowH - 3);
        }
        const kv = at(r + 1);
        g.c.globalAlpha = kv;
        g.text(num(lang, first + r * diff), lx + (first + r * diff) * unit + 14, y + rowH / 2, 26, C.ink, "left", true);
        g.c.globalAlpha = 1;
      }
      const kf = ease(t, built + 0.5 + n * 0.25, 0.5);
      g.c.globalAlpha = kf;
      fit(
        g,
        lang === "id" ? "suku ke-n = suku pertama + (n − 1) × beda" : "term n = first term + (n − 1) × difference",
        W / 2,
        432,
        900,
        24,
        C.soft,
      );
      const name = lang === "id" ? `suku ke-${n}` : `term ${n}`;
      pieces(
        g,
        [
          [`${name} =`, C.ink],
          [String(first), C.cobalt],
          ["+", C.ink],
          [`(${n} − 1) × ${diff}`, C.coral],
          ["=", C.ink],
          [String(first), C.cobalt],
          ["+", C.ink],
          [num(lang, (n - 1) * diff), C.coral],
          ["=", C.ink],
          [num(lang, first + (n - 1) * diff), C.ink],
        ],
        W / 2,
        474,
        920,
        32,
      );
      g.c.globalAlpha = 1;

      stepper(g, lang === "id" ? "suku pertama" : "first term", String(first), "f", 130, first > 1, first < 10, C.cobalt);
      stepper(g, lang === "id" ? "beda" : "difference", String(diff), "d", 375, diff > 1, diff < 5, C.coral);
      stepper(g, "n", String(n), "n", 620, n > 1, n < 8, C.plum);
      g.button("again", lang === "id" ? "SUSUN ULANG" : "BUILD AGAIN", 770, 545, 190, 52, C.teal);
    },
  };
}

/** Towers of cubes: a growing pattern adds the difference each time, a shrinking one takes it away. */
function towers(lang: Lang): Scene {
  let up = true;
  let first = 3;
  let diff = 4;
  let start = 0.2;
  let now = 0;
  const reset = () => (start = now + 0.2);
  return {
    press(id) {
      if (id === "up" && !up) {
        up = true;
        first = 3;
      }
      if (id === "down" && up) {
        up = false;
        first = 30;
      }
      if (id === "f-") first = clamp(first - 1, 1, 30);
      if (id === "f+") first = clamp(first + 1, 1, 30);
      if (id === "d-") diff = clamp(diff - 1, 1, 5);
      if (id === "d+") diff = clamp(diff + 1, 1, 5);
      reset();
    },
    draw(g, t) {
      now = t;
      const terms: number[] = [];
      for (let i = 0; i < 7; i++) {
        const v = up ? first + i * diff : first - i * diff;
        if (v < 1) break;
        terms.push(v);
      }
      const top = Math.max(...terms);
      const ch = Math.min(12, 340 / top);
      const base = 460;
      const cw = 56;
      const gap = 128;
      const x0 = W / 2 - ((terms.length - 1) * gap) / 2;
      const head = up
        ? lang === "id"
          ? `pola naik: +${diff} setiap kali`
          : `growing: +${diff} each time`
        : lang === "id"
          ? `pola turun: −${diff} setiap kali`
          : `shrinking: −${diff} each time`;
      fit(g, head, W / 2, 44, 900, 36, up ? C.teal : C.coral);
      terms.forEach((v, i) => {
        const cx = x0 + i * gap;
        const k = ease(t, start + i * 0.6, 0.5);
        if (k <= 0) {
          g.card(cx - cw / 2, base - 8, cw, 8, C.field, 0);
          return;
        }
        const before = i ? terms[i - 1] : v;
        const keep = Math.min(before, v);
        for (let j = 0; j < Math.max(before, v); j++) {
          const y = base - (j + 1) * ch;
          if (j < keep) {
            g.c.globalAlpha = k;
            g.card(cx - cw / 2, y, cw, ch - 1.5, up ? C.cobalt : C.plum, 0.4);
            g.c.globalAlpha = 1;
          } else if (up) {
            // The new cubes drop in.
            const kk = ease(t, start + i * 0.6 + 0.15 + (j - keep) * 0.03, 0.3);
            g.c.globalAlpha = kk;
            g.card(cx - cw / 2, y - (1 - kk) * 40, cw, ch - 1.5, C.coral, 0.4);
            g.c.globalAlpha = 1;
          } else {
            // The cubes taken away lift off and fade.
            const kk = ease(t, start + i * 0.6 + 0.15, 0.6);
            g.c.globalAlpha = 1 - kk;
            g.card(cx - cw / 2 + kk * 20, y - kk * 50, cw, ch - 1.5, C.coral, 0.4);
            g.c.globalAlpha = 1;
          }
        }
        g.c.globalAlpha = k;
        g.text(num(lang, v), cx, base + 30, 30, C.ink, "center", true);
        if (i > 0) g.text(up ? `+${diff}` : `−${diff}`, cx - gap / 2, base + 30, 22, up ? C.teal : C.coral, "center", true);
        g.c.globalAlpha = 1;
      });
      g.line(60, base + 1, W - 60, base + 1, C.soft, 2);

      stepper(g, lang === "id" ? "suku pertama" : "first term", String(first), "f", 130, first > 1, first < 30, C.cobalt);
      stepper(g, lang === "id" ? "beda" : "difference", String(diff), "d", 375, diff > 1, diff < 5, C.coral);
      g.button("up", lang === "id" ? "NAIK" : "GROWING", 520, 545, 210, 52, up ? C.teal : C.soft);
      g.button("down", lang === "id" ? "TURUN" : "SHRINKING", 750, 545, 210, 52, up ? C.soft : C.coral);
    },
  };
}

/** Tables pushed together, or squares of matchsticks: each new one adds the same number, so the counts make an arithmetic pattern. */
function build(lang: Lang): Scene {
  let mode: "tables" | "sticks" = "tables";
  let n = 1;
  const born = [0, -1, -1, -1, -1, -1];
  let now = 0;
  const MAX = 6;
  return {
    press(id) {
      if (id === "add" && n < MAX) {
        born[n] = now;
        n += 1;
        return;
      }
      if (id === "tables" || id === "sticks") mode = id;
      n = 1;
      born[0] = now;
    },
    draw(g, t) {
      now = t;
      const c = g.c;
      const size = mode === "tables" ? 90 : 80;
      const left = W / 2 - (MAX * size) / 2;
      const top = 120;
      const k = (i: number) => ease(t, born[i], 0.5);
      const firstCount = 4;
      const step = mode === "tables" ? 2 : 3;
      const count = (m: number) => firstCount + (m - 1) * step;
      if (mode === "tables") {
        // The chair at the right end slides along as each table arrives.
        const endX = lerp(left + (n - 1) * size, left + n * size, k(n - 1));
        const chair = (x: number, y: number, w: number, h: number, color: string, kk: number) => {
          c.globalAlpha = kk;
          g.card(x, y - (1 - kk) * 16, w, h, color, 0.8);
          c.globalAlpha = 1;
        };
        for (let i = 0; i < n; i++) {
          const kk = k(i);
          const x = lerp(left + i * size + 200, left + i * size, kk);
          c.globalAlpha = kk;
          g.card(x + 3, top + 40, size - 6, size - 6, C.sun, 1);
          g.crease(x + 14, top + 52, x + size - 20, top + 52);
          c.globalAlpha = 1;
          const fresh = i === n - 1 && i > 0;
          const ck = ease(t, born[i] + 0.4, 0.3);
          chair(x + size / 2 - 22, top, 44, 30, fresh ? C.coral : C.plum, ck);
          chair(x + size / 2 - 22, top + 40 + size, 44, 30, fresh ? C.coral : C.plum, ck);
        }
        chair(left - 40, top + 40 + size / 2 - 25, 30, 44, C.plum, k(0));
        chair(endX + 10, top + 40 + size / 2 - 25, 30, 44, C.plum, k(0));
      } else {
        const y = top + 20;
        const stick = (x1: number, y1: number, x2: number, y2: number, kk: number, fresh: boolean) => {
          if (kk <= 0) return;
          c.globalAlpha = kk;
          const dy = (1 - kk) * -30;
          g.line(x1 + 2, y1 + dy + 3, x2 + 2, y2 + dy + 3, "rgba(70, 50, 25, 0.2)", 8);
          g.line(x1, y1 + dy, x2, y2 + dy, fresh ? "#f7b3ae" : "#e9c98a", 8);
          g.dot(x2, y2 + dy, 7, C.coral);
          c.globalAlpha = 1;
        };
        stick(left, y + size - 6, left, y + 6, k(0), false);
        for (let i = 0; i < n; i++) {
          const x = left + i * size;
          const fresh = i === n - 1 && i > 0;
          const at = (j: number) => ease(t, born[i] + j * 0.2, 0.3);
          stick(x + 6, y, x + size - 6, y, at(0), fresh);
          stick(x + size, y + size - 6, x + size, y + 6, at(1), fresh);
          stick(x + 6, y + size, x + size - 6, y + size, at(2), fresh);
        }
      }
      // The counts so far as a little table.
      const cw = 96;
      const tx = W / 2 - ((MAX + 1) * cw) / 2;
      const rows: [string, (m: number) => string][] = [
        [mode === "tables" ? (lang === "id" ? "meja" : "tables") : lang === "id" ? "persegi" : "squares", (m) => String(m)],
        [mode === "tables" ? (lang === "id" ? "kursi" : "chairs") : lang === "id" ? "batang" : "sticks", (m) => num(lang, count(m))],
      ];
      rows.forEach(([label, value], r) => {
        const y = 330 + r * 50;
        g.card(tx, y, cw, 46, C.field, 0);
        fit(g, label, tx + cw / 2, y + 23, cw - 8, 22, C.ink);
        for (let m = 1; m <= MAX; m++) {
          const x = tx + m * cw;
          const on = m <= n;
          g.card(x + 3, y, cw - 6, 46, on ? (m === n ? C.sun : C.paper) : C.field, on ? 0.6 : 0);
          if (on) {
            c.globalAlpha = ease(t, born[m - 1] + 0.5, 0.3);
            g.text(value(m), x + cw / 2, y + 23, 26, r ? C.coral : C.cobalt, "center", true);
            c.globalAlpha = 1;
          }
        }
      });
      for (let m = 2; m <= n; m++) {
        c.globalAlpha = ease(t, born[m - 1] + 0.6, 0.3);
        g.text(`+${step}`, tx + m * cw, 446, 20, C.coral, "center", true);
        c.globalAlpha = 1;
      }
      const thing = mode === "tables" ? (lang === "id" ? "kursi" : "chairs") : lang === "id" ? "batang" : "sticks";
      fit(g, `${thing} = ${firstCount} + (${n} − 1) × ${step} = ${num(lang, count(n))}`, W / 2, 482, 900, 30, C.ink);

      g.button("tables", lang === "id" ? "MEJA" : "TABLES", 40, 545, 190, 52, mode === "tables" ? C.cobalt : C.soft);
      g.button("sticks", lang === "id" ? "KOREK API" : "MATCHSTICKS", 250, 545, 220, 52, mode === "sticks" ? C.cobalt : C.soft);
      g.button("add", mode === "tables" ? (lang === "id" ? "TAMBAH MEJA" : "ADD A TABLE") : lang === "id" ? "TAMBAH PERSEGI" : "ADD A SQUARE", 490, 545, 260, 52, C.teal, n < MAX);
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", 770, 545, 190, 52, C.soft, n > 1);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "In an arithmetic pattern every term is the one before plus the same number, the difference. Press HOP and watch the frog.",
        id: "Pada pola bilangan aritmetika, setiap suku adalah suku sebelumnya ditambah bilangan yang sama, yaitu beda. Tekan LOMPAT dan lihat kataknya.",
      },
      scene: hops,
    },
    {
      say: {
        en: "Term n is the first term with n − 1 differences added on. Change n and watch the strip build.",
        id: "Suku ke-n adalah suku pertama ditambah (n − 1) kali beda. Ubah n dan lihat pitanya tersusun.",
      },
      scene: rule,
    },
    {
      say: {
        en: "A growing pattern adds the difference each time, a shrinking pattern takes it away. Switch between them.",
        id: "Pola naik menambah beda setiap kali, pola turun mengurangi beda setiap kali. Coba keduanya.",
      },
      scene: towers,
    },
    {
      say: {
        en: "Push tables together: each new table adds 2 chairs. Squares of matchsticks add 3 sticks each time.",
        id: "Sambungkan meja: setiap meja baru menambah 2 kursi. Persegi dari korek api bertambah 3 batang setiap kali.",
      },
      scene: build,
    },
  ],
};
