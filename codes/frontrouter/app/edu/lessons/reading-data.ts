import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, lerp, pulse } from "../ink";
import { dec, gcd, num, sum, wrap } from "../parts";

const DAYS = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  id: ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"],
};
const HUE = [C.coral, C.sun, C.teal, C.cobalt, C.plum];

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A colour made paler by mixing it with paper. */
function pale(hex: string, k = 0.55) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(lerp(v, 255, k));
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

interface Axes {
  x0: number;
  x1: number;
  base: number;
  tall: number;
  max: number;
  step: number;
  count: number;
}

const slotW = (a: Axes) => (a.x1 - a.x0) / a.count;
const colX = (a: Axes, i: number) => a.x0 + slotW(a) * (i + 0.5);
const valY = (a: Axes, v: number) => a.base - (v / a.max) * a.tall;

/** Grid lines, numbers up the side, and the two axes. */
function axes(g: Ink, lang: Lang, a: Axes) {
  for (let v = 0; v <= a.max; v += a.step) {
    const y = valY(a, v);
    if (v) g.line(a.x0, y, a.x1, y, "rgba(58, 63, 75, 0.13)", 1);
    g.text(num(lang, v), a.x0 - 12, y, 18, C.soft, "right", true);
  }
  g.line(a.x0, a.base, a.x1, a.base, C.ink, 3);
  g.line(a.x0, a.base, a.x0, a.base - a.tall - 12, C.ink, 3);
}

/** A dashed guide from a point straight across to the side axis, drawn out as `k` goes to 1. */
function guide(g: Ink, a: Axes, x: number, v: number, color: string, k: number) {
  if (k <= 0) return;
  const y = valY(a, v);
  g.c.setLineDash([8, 6]);
  g.line(x, y, lerp(x, a.x0, k), y, color, 2.5);
  g.c.setLineDash([]);
  if (k >= 1) g.dot(a.x0, y, 6, color);
}

/** A pie of `vals` around (cx, cy); the chosen slice slides out. Returns nothing; draws as `k` sweeps 0 to 1. */
function pie(g: Ink, vals: number[], colors: string[], cx: number, cy: number, r: number, sel: number, k: number, labels: string[]) {
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  let a0 = -Math.PI / 2;
  const c = g.c;
  c.fillStyle = "rgba(70, 50, 25, 0.2)";
  c.beginPath();
  c.arc(cx + 4, cy + 6, r, 0, Math.PI * 2);
  c.fill();
  vals.forEach((v, i) => {
    const a1 = a0 + (v / total) * Math.PI * 2 * k;
    const mid = (a0 + a1) / 2;
    const out = i === sel ? 16 : 0;
    const ox = cx + Math.cos(mid) * out;
    const oy = cy + Math.sin(mid) * out;
    c.fillStyle = colors[i];
    c.beginPath();
    c.moveTo(ox, oy);
    c.arc(ox, oy, r, a0, a1);
    c.closePath();
    c.fill();
    c.strokeStyle = C.paper;
    c.lineWidth = 3;
    c.stroke();
    if (v > 0 && k > 0.95) {
      const lx = ox + Math.cos(mid) * r * 0.64;
      const ly = oy + Math.sin(mid) * r * 0.64;
      g.text(labels[i], lx, ly - 13, 20, C.ink, "center", true);
      g.text(String(v), lx, ly + 13, 22, C.ink, "center", true);
    }
    a0 = a1;
  });
}

/** Which slice of a pie holds the point, if any. */
function sliceAt(vals: number[], cx: number, cy: number, r: number, p: Pt) {
  const dx = p.x - cx;
  const dy = p.y - cy;
  if (dx * dx + dy * dy > (r + 24) ** 2) return null;
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  let ang = Math.atan2(dy, dx) + Math.PI / 2;
  if (ang < 0) ang += Math.PI * 2;
  let acc = 0;
  for (let i = 0; i < vals.length; i++) {
    acc += (vals[i] / total) * Math.PI * 2;
    if (ang <= acc) return i;
  }
  return vals.length - 1;
}

type View = "table" | "bar" | "line" | "pie";

/** One set of library visitors shown four ways; tapping a day in any view marks it in all of them. */
function views(lang: Lang): Scene {
  const v = [24, 36, 18, 30, 12];
  let view: View = "table";
  let sel = 1;
  let changed = 0;
  let now = 0;
  const a: Axes = { x0: 110, x1: 650, base: 470, tall: 340, max: 40, step: 10, count: 5 };
  const PIE = { x: 380, y: 290, r: 185 };
  const names = DAYS[lang];
  return {
    press(id) {
      if (id === "+" || id === "-") {
        v[sel] = clamp(v[sel] + (id === "+" ? 1 : -1), 0, 40);
        return;
      }
      view = id as View;
      changed = now;
    },
    down(p) {
      let i: number | null = null;
      if (view === "table" && p.x > 80 && p.x < 640) {
        const r = Math.floor((p.y - 150) / 60);
        if (r >= 0 && r < 5) i = r;
      }
      if ((view === "bar" || view === "line") && p.x > a.x0 && p.x < a.x1 && p.y > 90 && p.y < a.base + 40) i = Math.floor((p.x - a.x0) / slotW(a));
      if (view === "pie") i = sliceAt(v, PIE.x, PIE.y, PIE.r, p);
      if (i !== null) sel = i;
    },
    draw(g, t) {
      now = t;
      const k = ease(t, changed, 0.7);
      const total = v.reduce((x, y) => x + y, 0);
      fit(g, lang === "id" ? "pengunjung perpustakaan sekolah" : "visitors to the school library", 380, 40, 600, 28);
      if (view === "table") {
        g.card(80, 92, 560, 52, C.field, 0);
        g.text(lang === "id" ? "hari" : "day", 220, 118, 24, C.ink, "center", true);
        g.text(lang === "id" ? "banyak pengunjung" : "visitors", 500, 118, 24, C.ink, "center", true);
        v.forEach((n, i) => {
          const y = 150 + i * 60 + (1 - ease(t, changed + i * 0.08, 0.4)) * 30;
          const on = i === sel;
          g.c.globalAlpha = ease(t, changed + i * 0.08, 0.4);
          g.card(80, y, 560, 54, on ? pale(HUE[i], 0.5) : i % 2 ? C.paper : "#f8efdc", on ? 1.2 : 0.5);
          g.dot(110, y + 27, 9, HUE[i]);
          g.text(names[i], 220, y + 27, 26, C.ink, "center", on);
          g.text(num(lang, n), 500, y + 27, 28, on ? C.ink : C.soft, "center", true);
          g.c.globalAlpha = 1;
        });
        g.crease(360, 98, 360, 444);
        g.text(`${lang === "id" ? "jumlah" : "total"}: ${num(lang, total)}`, 500, 478, 24, C.ink, "center", true);
      }
      if (view === "bar" || view === "line") {
        axes(g, lang, a);
        const pts = v.map((n, i) => ({ x: colX(a, i), y: valY(a, n * k) }));
        if (view === "bar")
          v.forEach((n, i) => {
            const h = (n * k * a.tall) / a.max;
            g.card(pts[i].x - 34, a.base - h, 68, h, i === sel ? HUE[i] : pale(HUE[i], 0.45), i === sel ? 1.2 : 0.7);
          });
        else {
          g.c.strokeStyle = C.ink;
          g.c.lineWidth = 3;
          g.c.beginPath();
          pts.forEach((q, i) => (i ? g.c.lineTo(q.x, q.y) : g.c.moveTo(q.x, q.y)));
          g.c.stroke();
          pts.forEach((q, i) => g.dot(q.x, q.y, i === sel ? 14 : 9, HUE[i]));
          g.c.setLineDash([6, 6]);
          g.line(pts[sel].x, pts[sel].y, pts[sel].x, a.base, HUE[sel], 2);
          g.c.setLineDash([]);
        }
        v.forEach((n, i) => {
          g.text(names[i], pts[i].x, a.base + 24, 20, i === sel ? C.ink : C.soft, "center", true);
          if (k > 0.9) g.text(num(lang, n), pts[i].x, pts[i].y - 24, 22, C.ink, "center", true);
        });
        guide(g, a, pts[sel].x, v[sel] * k, HUE[sel] === C.sun ? "#d9a520" : HUE[sel], k);
      }
      if (view === "pie") pie(g, v, HUE, PIE.x, PIE.y, PIE.r, sel, k, names);

      const px = 690;
      const pw = 260;
      g.card(px, 92, pw, 390, C.paper, 1);
      g.dot(px + pw / 2, 138, 18 + 3 * pulse(t), HUE[sel]);
      fit(g, names[sel], px + pw / 2, 186, pw - 20, 34, C.ink);
      g.text(num(lang, v[sel]), px + pw / 2, 250, 64, C.cobalt, "center", true);
      g.text(lang === "id" ? "pengunjung" : "visitors", px + pw / 2, 298, 22, C.soft, "center", true);
      g.crease(px + 16, 324, px + pw - 16, 324);
      const how: Record<View, [string, string]> = {
        table: ["one row of the table", "satu baris pada tabel"],
        bar: ["the height of one bar", "tinggi satu batang"],
        line: ["the height of one point", "tinggi satu titik"],
        pie: ["the size of one slice", "besar satu juring"],
      };
      wrap(g, how[view][lang === "id" ? 1 : 0], pw - 30, 22).forEach((l, i) => g.text(l, px + pw / 2, 354 + i * 28, 22, C.ink));
      g.text(`${lang === "id" ? "dari" : "out of"} ${num(lang, total)}`, px + pw / 2, 444, 22, C.soft, "center", true);

      const L = lang === "id" ? ["TABEL", "BATANG", "GARIS", "LINGKARAN"] : ["TABLE", "BAR", "LINE", "PIE"];
      (["table", "bar", "line", "pie"] as View[]).forEach((id, i) => g.button(id, L[i], 45 + i * 162, 555, 150, 52, view === id ? C.cobalt : C.soft));
      g.button("-", "−", 840, 555, 52, 52, C.coral, v[sel] > 0);
      g.button("+", "+", 900, 555, 52, 52, C.teal, v[sel] < 40);
    },
  };
}

/** Plastic collected by each class: tap two bars and their guides mark the difference on the axis. */
function compare(lang: Lang): Scene {
  const v = [14, 22, 9, 27, 18, 12];
  const names = ["4A", "4B", "5A", "5B", "6A", "6B"];
  const picks = [3, 2];
  const picked = [0, 0];
  let now = 0;
  const a: Axes = { x0: 90, x1: 640, base: 470, tall: 340, max: 30, step: 5, count: 6 };
  const choose = (i: number) => {
    if (picks.includes(i)) return;
    picks[0] = picks[1];
    picked[0] = picked[1];
    picks[1] = i;
    picked[1] = now;
  };
  const most = () => v.indexOf(Math.max(...v));
  const least = () => v.indexOf(Math.min(...v));
  return {
    press(id) {
      if (id === "most") choose(most());
      if (id === "least") choose(least());
      if (id === "both") {
        picks[0] = most();
        picks[1] = least();
        picked[0] = now;
        picked[1] = now + 0.3;
      }
    },
    down(p) {
      if (p.x > a.x0 && p.x < a.x1 && p.y > 100 && p.y < a.base + 40) choose(Math.floor((p.x - a.x0) / slotW(a)));
    },
    draw(g, t) {
      now = t;
      fit(g, lang === "id" ? "sampah plastik yang dikumpulkan tiap kelas (kg)" : "plastic collected by each class (kg)", 360, 40, 620, 28);
      axes(g, lang, a);
      const colors = [C.coral, C.cobalt];
      v.forEach((n, i) => {
        const grow = ease(t, 0.1 + i * 0.1, 0.6);
        const h = (n * grow * a.tall) / a.max;
        const p = picks.indexOf(i);
        const x = colX(a, i);
        const hop = p >= 0 ? 14 * Math.sin(clamp((t - picked[p]) / 0.4, 0, 1) * Math.PI) : 0;
        g.card(x - 32, a.base - h - hop, 64, h, p >= 0 ? colors[p] : C.field, p >= 0 ? 1.2 : 0.7);
        g.text(num(lang, n), x, a.base - h - 20 - hop, 22, C.ink, "center", true);
        g.text(names[i], x, a.base + 24, 22, p >= 0 ? C.ink : C.soft, "center", true);
        if (i === most() && grow >= 1) g.text("▲", x, a.base - h - 46, 18, C.teal, "center");
        if (i === least() && grow >= 1) g.text("▼", x, a.base - h - 46, 18, C.coral, "center");
      });
      picks.forEach((i, j) => guide(g, a, colX(a, i), v[i], colors[j], ease(t, picked[j] + 0.6, 0.5)));
      const ready = ease(t, Math.max(picked[0], picked[1]) + 1.1, 0.5);
      const hi = Math.max(v[picks[0]], v[picks[1]]);
      const lo = Math.min(v[picks[0]], v[picks[1]]);
      if (ready > 0) {
        const bx = a.x0 - 52;
        const y1 = valY(a, hi);
        const y2 = lerp(y1, valY(a, lo), ready);
        g.line(bx, y1, bx, y2, "#d9a520", 5);
        g.line(bx - 8, y1, bx + 8, y1, "#d9a520", 4);
        g.line(bx - 8, y2, bx + 8, y2, "#d9a520", 4);
      }

      const px = 690;
      const pw = 260;
      g.card(px, 92, pw, 390, C.paper, 1);
      g.text(lang === "id" ? "terbanyak" : "most", px + 20, 128, 22, C.teal, "left", true);
      g.text(`${names[most()]}: ${num(lang, v[most()])} kg`, px + pw - 20, 128, 24, C.ink, "right", true);
      g.text(lang === "id" ? "tersedikit" : "least", px + 20, 170, 22, C.coral, "left", true);
      g.text(`${names[least()]}: ${num(lang, v[least()])} kg`, px + pw - 20, 170, 24, C.ink, "right", true);
      g.crease(px + 16, 200, px + pw - 16, 200);
      picks.forEach((i, j) => {
        g.dot(px + 34, 240 + j * 46, 12, colors[j]);
        g.text(`${names[i]} = ${num(lang, v[i])} kg`, px + 60, 240 + j * 46, 26, C.ink, "left", true);
      });
      g.text(lang === "id" ? "selisih" : "difference", px + pw / 2, 345, 22, C.soft, "center", true);
      g.c.globalAlpha = ready;
      fit(g, `${num(lang, hi)} − ${num(lang, lo)} = ${num(lang, hi - lo)} kg`, px + pw / 2, 390, pw - 20, 32, "#b8860b");
      g.c.globalAlpha = 1;
      fit(g, lang === "id" ? "ketuk dua batang" : "tap two bars", px + pw / 2, 448, pw - 20, 20, C.soft);

      const L = lang === "id" ? ["TERBANYAK", "TERSEDIKIT", "SELISIH KEDUANYA"] : ["MOST", "LEAST", "MOST − LEAST"];
      g.button("most", L[0], 45, 555, 200, 52, C.teal);
      g.button("least", L[1], 260, 555, 200, 52, C.coral);
      g.button("both", L[2], 475, 555, 280, 52, C.cobalt);
    },
  };
}

/** Cakes sold each day on a line chart: tap a point for its value and its change, and add the days into one tall column. */
function totals(lang: Lang): Scene {
  const v = [15, 25, 20, 35, 30];
  let sel = 3;
  let tapped = 0;
  let adding = -9;
  let now = 0;
  const a: Axes = { x0: 100, x1: 600, base: 470, tall: 340, max: 40, step: 5, count: 5 };
  const names = DAYS[lang];
  const SX = 740;
  const U2 = 340 / 200;
  return {
    press(id) {
      if (id === "add") adding = adding < 0 ? now : -9;
      if (id === "+" || id === "-") v[sel] = clamp(v[sel] + (id === "+" ? 1 : -1), 0, 40);
    },
    down(p) {
      if (p.x > a.x0 && p.x < a.x1 && p.y > 100 && p.y < a.base + 40) {
        sel = Math.floor((p.x - a.x0) / slotW(a));
        tapped = now;
      }
    },
    draw(g, t) {
      now = t;
      const total = v.reduce((x, y) => x + y, 0);
      fit(g, lang === "id" ? "kue yang terjual di kantin" : "cakes sold at the canteen", 350, 40, 560, 28);
      axes(g, lang, a);
      const draw = ease(t, 0.1, 1.2);
      const pts = v.map((n, i) => ({ x: colX(a, i), y: valY(a, n) }));
      g.c.save();
      g.c.beginPath();
      g.c.rect(0, 0, lerp(a.x0, a.x1, draw), 625);
      g.c.clip();
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 3;
      g.c.beginPath();
      pts.forEach((q, i) => (i ? g.c.lineTo(q.x, q.y) : g.c.moveTo(q.x, q.y)));
      g.c.stroke();
      g.c.restore();
      pts.forEach((q, i) => {
        if (draw < (i + 0.5) / 5) return;
        g.dot(q.x, q.y, i === sel ? 14 : 9, HUE[i]);
        g.text(num(lang, v[i]), q.x, q.y - 26, 22, C.ink, "center", true);
        g.text(names[i], q.x, a.base + 24, 20, i === sel ? C.ink : C.soft, "center", true);
      });
      const color = HUE[sel] === C.sun ? "#d9a520" : HUE[sel];
      guide(g, a, pts[sel].x, v[sel], color, ease(t, tapped, 0.5));
      if (sel > 0) {
        const d = v[sel] - v[sel - 1];
        const mx = (pts[sel].x + pts[sel - 1].x) / 2;
        const my = (pts[sel].y + pts[sel - 1].y) / 2;
        const word = d > 0 ? `+${num(lang, d)}` : d < 0 ? `−${num(lang, -d)}` : "0";
        g.card(mx - 32, my - 52, 64, 34, d >= 0 ? pale(C.teal, 0.6) : pale(C.coral, 0.6), 0.6);
        g.text(word, mx, my - 35, 22, C.ink, "center", true);
      }

      g.line(SX - 60, a.base, SX + 60, a.base, C.ink, 3);
      let acc = 0;
      v.forEach((n, i) => {
        const k = adding >= 0 ? ease(t, adding + i * 0.5, 0.6) : 0;
        if (k <= 0) return;
        const h = n * U2;
        const y = a.base - acc - h;
        const x = lerp(pts[i].x - 20, SX - 40, k);
        const yy = lerp(pts[i].y - h / 2, y, k);
        g.card(x, yy, 80, h, HUE[i], 0.7);
        if (h >= 20 && k >= 1) g.text(num(lang, n), SX, y + h / 2, 18, C.ink, "center", true);
        acc += h;
      });
      const all = adding >= 0 && t > adding + 2.6;
      if (all) g.text(num(lang, total), SX, a.base - acc - 24, 30, C.cobalt, "center", true);
      g.text(lang === "id" ? "jumlah" : "total", SX, a.base + 24, 20, C.soft, "center", true);
      if (all) fit(g, `${v.map((n) => num(lang, n)).join(" + ")} = ${num(lang, total)}`, 840, 140, 220, 22, C.ink);
      if (all) g.text(lang === "id" ? "kue seminggu" : "cakes this week", 870, 175, 20, C.soft, "center", true);

      g.button("add", adding >= 0 ? (lang === "id" ? "ULANGI" : "AGAIN") : lang === "id" ? "JUMLAHKAN" : "ADD UP", 45, 555, 240, 52, adding >= 0 ? C.soft : C.cobalt);
      g.button("-", "−", 320, 555, 52, 52, C.coral, v[sel] > 0);
      g.button("+", "+", 380, 555, 52, 52, C.teal, v[sel] < 40);
      fit(g, lang === "id" ? `ketuk sebuah titik; − dan + mengubah ${names[sel]}` : `tap a point; − and + change ${names[sel]}`, 455, 581, 500, 20, C.soft, "left");
    },
  };
}

const SPORTS = {
  en: ["football", "badminton", "swimming", "volleyball"],
  id: ["sepak bola", "bulu tangkis", "renang", "bola voli"],
};

/** A pie of favourite sports: each slice is a fraction of the whole class, and a percent of it. */
function parts(lang: Lang): Scene {
  const v = [20, 10, 5, 5];
  let sel = 0;
  let now = 0;
  let changed = -9;
  const colors = [C.teal, C.coral, C.cobalt, C.sun];
  const P = { x: 280, y: 300, r: 200 };
  return {
    press(id) {
      v[sel] = clamp(v[sel] + (id === "+" ? 1 : -1), 0, 30);
      changed = now;
    },
    down(p) {
      const i = sliceAt(v, P.x, P.y, P.r, p);
      if (i !== null) sel = i;
      for (let r = 0; r < 4; r++) if (p.x > 540 && p.x < 950 && p.y > 70 + r * 66 && p.y < 128 + r * 66) sel = r;
    },
    draw(g, t) {
      now = t;
      const total = v.reduce((x, y) => x + y, 0);
      const k = ease(t, 0.1, 1.2);
      pie(g, v, colors, P.x, P.y, P.r, sel, k, v.map(() => ""));
      if (k >= 1) {
        g.crease(P.x - P.r, P.y, P.x + P.r, P.y);
        g.crease(P.x, P.y - P.r, P.x, P.y + P.r);
      }
      const names = SPORTS[lang];
      names.forEach((s, i) => {
        const y = 70 + i * 66;
        const on = i === sel;
        g.card(540, y, 410, 58, on ? pale(colors[i], 0.55) : C.paper, on ? 1.2 : 0.6);
        g.dot(566, y + 29, 11, colors[i]);
        g.text(s, 590, y + 29, 24, C.ink, "left", on);
        g.text(`${num(lang, v[i])} ${lang === "id" ? "anak" : "pupils"}`, 930, y + 29, 22, C.soft, "right", true);
      });
      const n = v[sel];
      const d = gcd(n, total) || 1;
      const pct = total ? (n / total) * 100 : 0;
      const pctS = `${Number.isInteger(Math.round(pct * 10) / 10) ? num(lang, Math.round(pct)) : dec(lang, pct, 1)}%`;
      const pop = 1 + 0.06 * (1 - ease(t, changed, 0.4));
      g.card(540, 345, 410, 170, C.paper, 1);
      fit(g, `${names[sel]}: ${num(lang, n)} ${lang === "id" ? "dari" : "of"} ${num(lang, total)}`, 745, 375, 390, 24, C.ink);
      g.c.save();
      g.c.translate(745, 450);
      g.c.scale(pop, pop);
      const row: (string | [number, number])[] = d > 1 && total ? [[n, total], "=", [n / d, total / d], "=", pctS] : [[n, total], "=", pctS];
      sum(g, row, 0, 0, 34, [C.ink, C.ink, C.cobalt, C.ink, C.coral]);
      g.c.restore();
      g.button("-", "−", 540, 555, 52, 52, C.coral, n > 0);
      g.button("+", "+", 600, 555, 52, 52, C.teal, n < 30);
      fit(g, lang === "id" ? `ketuk juring, lalu − atau +` : `tap a slice, then − or +`, 670, 581, 285, 20, C.soft, "left");
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "The same data can be shown as a table, a bar chart, a line chart or a pie chart. Switch between them and tap a day: it is marked in every one.",
        id: "Data yang sama bisa disajikan dalam tabel, diagram batang, diagram garis, atau diagram lingkaran. Ganti tampilannya dan ketuk sebuah hari: hari itu ditandai di semuanya.",
      },
      scene: views,
    },
    {
      say: {
        en: "The tallest bar shows the most and the shortest the least. Tap two bars: their guides meet the axis, and the gap between is the difference.",
        id: "Batang tertinggi menunjukkan yang terbanyak dan yang terpendek yang tersedikit. Ketuk dua batang: garis bantunya sampai ke sumbu, dan jarak di antaranya adalah selisihnya.",
      },
      scene: compare,
    },
    {
      say: {
        en: "A line chart shows how data goes up and down from day to day. Press ADD UP to stack every day into one column and read the total.",
        id: "Diagram garis menunjukkan data naik dan turun dari hari ke hari. Tekan JUMLAHKAN untuk menumpuk semua hari menjadi satu kolom dan membaca jumlahnya.",
      },
      scene: totals,
    },
    {
      say: {
        en: "A pie chart shows each part of a whole. Half the circle is half of all the pupils; tap a slice to see its fraction and percent.",
        id: "Diagram lingkaran menunjukkan bagian dari keseluruhan. Setengah lingkaran berarti setengah dari semua anak; ketuk sebuah juring untuk melihat pecahan dan persennya.",
      },
      scene: parts,
    },
  ],
};
