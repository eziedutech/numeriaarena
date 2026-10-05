import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp, pulse } from "../ink";
import { dec, frac, num, wrap } from "../parts";

/** Text shrunk until it fits `max` wide, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center") {
  let k = size;
  while (k > 18 && g.width(s, k, true) > max) k -= 1;
  g.text(s, x, y, k, color, align, true);
}

/** A number with no more decimals than it needs, up to `most`. */
function nice(lang: Lang, v: number, most = 1) {
  for (let d = 0; d < most; d++) {
    const k = 10 ** d;
    if (Math.abs(v * k - Math.round(v * k)) < 1e-6) return dec(lang, v, d);
  }
  return dec(lang, v, most);
}

interface Axes {
  x0: number;
  x1: number;
  base: number;
  tall: number;
  lo: number;
  hi: number;
  every: number;
}

const yOf = (o: Axes, v: number) => o.base - ((v - o.lo) / (o.hi - o.lo)) * o.tall;
const xOf = (o: Axes, i: number, n: number) => o.x0 + ((o.x1 - o.x0) / n) * (i + 0.5);

/** Grid lines, numbers up the side and the two axes. */
function axes(g: Ink, lang: Lang, o: Axes) {
  for (let v = o.lo; v <= o.hi; v += 1) {
    const y = yOf(o, v);
    if (v > o.lo) g.line(o.x0, y, o.x1, y, v % o.every === 0 ? "rgba(58, 63, 75, 0.18)" : "rgba(58, 63, 75, 0.07)", 1);
    if (v % o.every === 0) g.text(num(lang, v), o.x0 - 12, y, 18, C.soft, "right", true);
  }
  g.line(o.x0, o.base, o.x1, o.base, C.ink, 3);
  g.line(o.x0, o.base, o.x0, o.base - o.tall - 14, C.ink, 3);
}

/** The broken line through the points, drawn in up to `upTo` segments; rises teal, falls coral. */
function polyline(g: Ink, o: Axes, vals: number[], upTo: number) {
  const n = vals.length;
  for (let i = 0; i < n - 1; i++) {
    const k = clamp(upTo - i, 0, 1);
    if (k <= 0) break;
    const xa = xOf(o, i, n);
    const ya = yOf(o, vals[i]);
    const xb = lerp(xa, xOf(o, i + 1, n), k);
    const yb = lerp(ya, yOf(o, vals[i + 1]), k);
    const d = vals[i + 1] - vals[i];
    const color = d > 0.3 ? C.teal : d < -0.3 ? C.coral : C.soft;
    g.c.lineCap = "round";
    g.line(xa, ya, xb, yb, color, 5);
    g.c.lineCap = "butt";
  }
}

/** A bean plant measured each day: drag a point up or down and the line is drawn again through it. */
function growth(lang: Lang): Scene {
  const v = [2, 3, 5, 6, 6, 8, 11];
  const shown = [...v];
  let held = -1;
  let sel = 2;
  let drawn = 0;
  let last = 0;
  let now = 0;
  const o: Axes = { x0: 100, x1: 660, base: 470, tall: 360, lo: 0, hi: 15, every: 1 };
  const PX = 830;
  return {
    press(id) {
      if (id === "again") drawn = now;
    },
    down(p) {
      for (let i = 0; i < v.length; i++) {
        if (Math.abs(p.x - xOf(o, i, v.length)) < 32 && Math.abs(p.y - yOf(o, shown[i])) < 32) {
          held = i;
          sel = i;
          return true;
        }
      }
    },
    move(p) {
      if (held < 0) return;
      v[held] = clamp(Math.round(((o.base - p.y) / o.tall) * (o.hi - o.lo)), o.lo, o.hi);
    },
    up() {
      held = -1;
    },
    draw(g, t) {
      now = t;
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      v.forEach((x, i) => (shown[i] += (x - shown[i]) * (1 - Math.exp(-dt * 14))));
      fit(g, lang === "id" ? "tinggi tanaman kacang hijau" : "height of a bean plant", (o.x0 + o.x1) / 2, 40, 520, 28, C.ink);
      g.text("cm", o.x0, 92, 20, C.soft, "center", true);
      axes(g, lang, o);
      const upTo = (t - drawn - 0.3) / 0.35;
      polyline(g, o, shown, upTo);
      shown.forEach((x, i) => {
        const cx = xOf(o, i, v.length);
        g.text(num(lang, i + 1), cx, o.base + 22, 20, i === sel ? C.cobalt : C.soft, "center", true);
        if (upTo < i - 0.2) return;
        const cy = yOf(o, x);
        if (i === held) g.handle(cx, cy, true);
        else {
          g.dot(cx + 2, cy + 3, 11, "rgba(70, 50, 25, 0.25)");
          g.dot(cx, cy, 11, i === sel ? C.coral : C.cobalt);
          g.dot(cx, cy, 4, C.paper);
        }
      });
      g.text(lang === "id" ? "hari ke-" : "day", (o.x0 + o.x1) / 2, o.base + 50, 20, C.soft, "center", true);

      // What the line does into the chosen day.
      g.card(PX - 120, 70, 240, 270, C.paper, 1);
      g.text(`${lang === "id" ? "hari ke-" : "day "}${num(lang, sel + 1)}`, PX, 100, 26, C.soft, "center", true);
      g.text(`${num(lang, v[sel])} cm`, PX, 160, 52, C.cobalt, "center", true);
      if (sel > 0) {
        const d = v[sel] - v[sel - 1];
        const said =
          d > 0
            ? lang === "id"
              ? `naik ${num(lang, d)} cm dari hari sebelumnya`
              : `up ${num(lang, d)} cm from the day before`
            : d < 0
              ? lang === "id"
                ? `turun ${num(lang, -d)} cm dari hari sebelumnya`
                : `down ${num(lang, -d)} cm from the day before`
              : lang === "id"
                ? "sama dengan hari sebelumnya"
                : "the same as the day before";
        wrap(g, said, 210, 22).forEach((line, i) => g.text(line, PX, 225 + i * 30, 22, d > 0 ? "#2f9a86" : d < 0 ? C.coral : C.soft, "center", true));
      }
      const key: [string, string][] = [
        [lang === "id" ? "naik" : "rises", C.teal],
        [lang === "id" ? "turun" : "falls", C.coral],
        [lang === "id" ? "tetap" : "stays", C.soft],
      ];
      key.forEach(([s, color], i) => {
        g.line(PX - 90, 385 + i * 36, PX - 40, 385 + i * 36, color, 5);
        g.text(s, PX - 26, 385 + i * 36, 22, C.ink, "left", true);
      });
      g.button("again", lang === "id" ? "GAMBAR LAGI" : "DRAW AGAIN", 40, 555, 260, 52, C.teal);
      fit(g, lang === "id" ? "geser titik ke atas atau ke bawah" : "drag a point up or down", 650, 581, 560, 22, C.soft);
    },
  };
}

const DAYS = [
  [24, 27, 30, 32, 31, 28, 25],
  [23, 25, 27, 25, 24, 26, 24],
  [25, 26, 29, 33, 34, 30, 27],
];

/** The temperature through one day, every two hours: a reader slides along it, and the highest and lowest points glow. */
function temperature(lang: Lang): Scene {
  let day = 0;
  const shown = [...DAYS[0]];
  let sel = 0;
  let held = false;
  let last = 0;
  const n = 7;
  const o: Axes = { x0: 110, x1: 680, base: 470, tall: 360, lo: 20, hi: 36, every: 2 };
  const PX = 835;
  const hour = (i: number) => {
    const h = String(6 + i * 2).padStart(2, "0");
    return lang === "id" ? `${h}.00` : `${h}:00`;
  };
  const pick = (x: number) => {
    sel = clamp(Math.round((x - o.x0) / ((o.x1 - o.x0) / n) - 0.5), 0, n - 1);
  };
  return {
    press(id) {
      if (id === "day") day = (day + 1) % DAYS.length;
    },
    down(p) {
      if (p.x < o.x0 - 20 || p.x > o.x1 + 20 || p.y < 60 || p.y > o.base + 40) return;
      held = true;
      pick(p.x);
      return true;
    },
    move(p) {
      if (held) pick(p.x);
    },
    up() {
      held = false;
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      const v = DAYS[day];
      v.forEach((x, i) => (shown[i] += (x - shown[i]) * (1 - Math.exp(-dt * 6))));
      fit(g, lang === "id" ? "suhu udara sepanjang hari" : "air temperature through the day", (o.x0 + o.x1) / 2, 40, 560, 28, C.ink);
      g.text("°C", o.x0, 92, 20, C.soft, "center", true);
      axes(g, lang, o);
      const top = v.indexOf(Math.max(...v));
      const low = v.indexOf(Math.min(...v));
      const cx = xOf(o, sel, n);
      g.c.fillStyle = "rgba(255, 209, 102, 0.3)";
      g.c.fillRect(cx - 26, o.base - o.tall - 10, 52, o.tall + 10);
      polyline(g, o, shown, (t - 0.3) / 0.3);
      shown.forEach((x, i) => {
        const px = xOf(o, i, n);
        const py = yOf(o, x);
        g.text(hour(i), px, o.base + 22, 18, i === sel ? C.cobalt : C.soft, "center", true);
        if (i === top || i === low) g.dot(px, py, 16 + 4 * pulse(t), i === top ? "rgba(242, 113, 107, 0.35)" : "rgba(52, 105, 196, 0.3)");
        g.dot(px, py, 9, i === sel ? C.ink : C.cobalt);
      });
      const ty = yOf(o, shown[top]);
      fit(g, lang === "id" ? "tertinggi" : "highest", xOf(o, top, n), ty - 32, 120, 20, C.coral);
      const ly = yOf(o, shown[low]);
      fit(g, lang === "id" ? "terendah" : "lowest", xOf(o, low, n), ly + 32, 120, 20, C.cobalt);
      g.c.setLineDash([7, 6]);
      g.line(cx, yOf(o, shown[sel]), o.x0, yOf(o, shown[sel]), C.coral, 2);
      g.c.setLineDash([]);

      g.card(PX - 125, 70, 250, 300, C.paper, 1);
      g.text(lang === "id" ? `pukul ${hour(sel)}` : `at ${hour(sel)}`, PX, 102, 26, C.soft, "center", true);
      g.text(`${num(lang, v[sel])} °C`, PX, 162, 50, C.cobalt, "center", true);
      if (sel < n - 1) {
        const d = v[sel + 1] - v[sel];
        const said =
          d > 0
            ? lang === "id"
              ? `lalu naik ${num(lang, d)} °C sampai pukul ${hour(sel + 1)}`
              : `then rises ${num(lang, d)} °C by ${hour(sel + 1)}`
            : d < 0
              ? lang === "id"
                ? `lalu turun ${num(lang, -d)} °C sampai pukul ${hour(sel + 1)}`
                : `then falls ${num(lang, -d)} °C by ${hour(sel + 1)}`
              : lang === "id"
                ? `lalu tetap sampai pukul ${hour(sel + 1)}`
                : `then stays the same until ${hour(sel + 1)}`;
        wrap(g, said, 220, 22).forEach((line, i) => g.text(line, PX, 225 + i * 30, 22, d > 0 ? "#2f9a86" : d < 0 ? C.coral : C.soft, "center", true));
      }
      g.button("day", lang === "id" ? "HARI LAIN" : "ANOTHER DAY", 40, 555, 260, 52, C.cobalt);
      fit(g, lang === "id" ? "geser di atas diagram untuk membaca suhu" : "slide across the chart to read the temperature", 650, 581, 580, 22, C.soft);
    },
  };
}

const SPORT = {
  en: ["football", "badminton", "swimming", "basketball"],
  id: ["sepak bola", "bulu tangkis", "renang", "bola basket"],
};
const HUE = [C.coral, C.cobalt, C.teal, C.sun];
const START = [9, 6, 3, 6];

/** A slice of a ring between two radii, from angle a to b. */
function ringSlice(g: Ink, cx: number, cy: number, ri: number, ro: number, a: number, b: number, color: string) {
  const c = g.c;
  c.fillStyle = color;
  c.beginPath();
  c.arc(cx, cy, ro, a, b);
  if (ri > 0.5) c.arc(cx, cy, ri, b, a, true);
  else c.lineTo(cx, cy);
  c.closePath();
  c.fill();
}

/** A bar of the class's favourite sports curls round into a ring, and the ring fills in to a pie. */
function curl(lang: Lang): Scene {
  let target = 0;
  let phase = 0;
  let last = 0;
  const L = 800;
  const thick = 70;
  const y0 = 140;
  const total = START.reduce((a, b) => a + b, 0);
  return {
    press(id) {
      if (id === "curl") target = target > 0 ? 0 : 2;
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (t > 1.2 && target === 0 && phase === 0 && t - dt <= 1.2) target = 2;
      phase += clamp(target - phase, -dt * 0.8, dt * 0.8);
      const k = ease(clamp(phase, 0, 1));
      const f = ease(clamp(phase - 1, 0, 1));
      const names = SPORT[lang];
      let s = -L / 2;
      if (k < 0.004) {
        START.forEach((n, i) => {
          const w = (L * n) / total;
          g.card(W / 2 + s, y0 - thick / 2, w, thick, HUE[i], i === 0 ? 1 : 0);
          g.text(num(lang, n), W / 2 + s + w / 2, y0, 28, C.paper, "center", true);
          fit(g, names[i], W / 2 + s + w / 2, y0 + 62, w - 8, 22, C.ink);
          if (i > 0) g.crease(W / 2 + s, y0 - thick / 2, W / 2 + s, y0 + thick / 2);
          s += w;
        });
      } else {
        const theta = k * Math.PI * 2;
        const R = L / theta;
        const cx = W / 2;
        const cy = y0 + R;
        const ro = R + thick / 2;
        const ri = lerp(R - thick / 2, 0, f);
        g.dot(cx + 3, cy + 5, ro, `rgba(70, 50, 25, ${0.18 * k})`);
        START.forEach((n, i) => {
          const w = (L * n) / total;
          const a = -Math.PI / 2 + s / R;
          const b = -Math.PI / 2 + (s + w) / R;
          ringSlice(g, cx, cy, ri, ro, a, b, HUE[i]);
          g.line(cx + ri * Math.cos(a), cy + ri * Math.sin(a), cx + ro * Math.cos(a), cy + ro * Math.sin(a), C.paper, 2);
          const mid = (a + b) / 2;
          const lr = lerp(R, ro * 0.62, f);
          g.text(num(lang, n), cx + lr * Math.cos(mid), cy + lr * Math.sin(mid), 28, C.paper, "center", true);
          if (f > 0) {
            g.c.globalAlpha = f;
            const nr = ro + 40;
            fit(g, names[i], cx + nr * Math.cos(mid), cy + nr * Math.sin(mid), 170, 22, C.ink);
            g.c.globalAlpha = 1;
          }
          s += w;
        });
        if (k < 0.5) {
          g.c.globalAlpha = 1 - k * 2;
          let at = -L / 2;
          START.forEach((n, i) => {
            const w = (L * n) / total;
            fit(g, names[i], W / 2 + at + w / 2, y0 + 62, w - 8, 22, C.ink);
            at += w;
          });
          g.c.globalAlpha = 1;
        }
      }
      const said =
        lang === "id"
          ? `${num(lang, total)} siswa = seluruh batang = seluruh lingkaran`
          : `${num(lang, total)} pupils = the whole bar = the whole circle`;
      fit(g, said, W / 2, 500, 880, 26, C.soft);
      fit(g, lang === "id" ? "olahraga kesukaan di kelas" : "favourite sport in the class", W / 2, 40, 700, 28, C.ink);
      const label = target > 0 ? (lang === "id" ? "LURUSKAN" : "STRAIGHTEN") : lang === "id" ? "GULUNG JADI LINGKARAN" : "CURL INTO A CIRCLE";
      g.button("curl", label, W / 2 - 200, 555, 400, 52, C.cobalt);
    },
  };
}

/** The pie with + and − for each sport: each slice is a fraction of the class, a percent, and a part of 360°. */
function pie(lang: Lang): Scene {
  const n = [...START];
  const shown = [...START];
  let last = 0;
  const cx = 250;
  const cy = 285;
  const r = 180;
  return {
    press(id) {
      const i = Number(id.slice(1));
      const total = n.reduce((a, b) => a + b, 0);
      if (id[0] === "+") n[i] = clamp(n[i] + 1, 0, 20);
      else if (total > 1) n[i] = clamp(n[i] - 1, 0, 20);
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      n.forEach((v, i) => (shown[i] += (v - shown[i]) * (1 - Math.exp(-dt * 8))));
      const total = n.reduce((a, b) => a + b, 0);
      const st = shown.reduce((a, b) => a + b, 0);
      const grow = ease(t, 0.1, 0.8);
      g.dot(cx + 3, cy + 5, r, "rgba(70, 50, 25, 0.22)");
      let a = -Math.PI / 2;
      shown.forEach((v, i) => {
        const b = a + (v / st) * Math.PI * 2 * grow;
        if (b - a > 0.001) ringSlice(g, cx, cy, 0, r, a, b, HUE[i]);
        a = b;
      });
      a = -Math.PI / 2;
      shown.forEach((v, i) => {
        const b = a + (v / st) * Math.PI * 2 * grow;
        if (b - a > 0.001) g.line(cx, cy, cx + r * Math.cos(a), cy + r * Math.sin(a), C.paper, 3);
        const deg = (n[i] / total) * 360;
        if (b - a > 0.35 && grow >= 1) g.text(`${nice(lang, deg)}°`, cx + r * 0.62 * Math.cos((a + b) / 2), cy + r * 0.62 * Math.sin((a + b) / 2), 24, C.paper, "center", true);
        a = b;
      });
      fit(g, lang === "id" ? "satu lingkaran penuh = 360°" : "one whole circle = 360°", cx, 500, 420, 24, C.soft);

      const X = 470;
      g.text(lang === "id" ? "pecahan" : "fraction", X + 50, 42, 20, C.soft, "center", true);
      g.text(lang === "id" ? "persen" : "percent", X + 175, 42, 20, C.soft, "center", true);
      g.text(lang === "id" ? "sudut" : "angle", X + 310, 42, 20, C.soft, "center", true);
      n.forEach((v, i) => {
        const y = 60 + i * 100;
        g.card(X, y, 490, 92, i % 2 ? C.paper : "#f8efdc", 0.6);
        g.dot(X + 22, y + 26, 11, HUE[i]);
        fit(g, `${SPORT[lang][i]}: ${num(lang, v)}`, X + 40, y + 26, 300, 24, C.ink, "left");
        frac(g, v, total, X + 50, y + 64, 20, C.ink);
        g.text(`= ${nice(lang, (v / total) * 100)}%`, X + 175, y + 64, 22, C.ink, "center", true);
        const said = `× 360° = ${nice(lang, (v / total) * 360)}°`;
        fit(g, said, X + 310, y + 64, 170, 22, C.cobalt);
        g.button(`-${i}`, "−", X + 370, y + 6, 52, 40, C.coral, v > 0 && total > 1);
        g.button(`+${i}`, "+", X + 430, y + 6, 52, 40, C.teal, v < 20);
      });
      const sumLine = lang === "id" ? `jumlah: ${num(lang, total)} siswa = 100% = 360°` : `total: ${num(lang, total)} pupils = 100% = 360°`;
      g.card(X, 470, 490, 56, C.sun, 1);
      fit(g, sumLine, X + 245, 498, 470, 26, C.ink);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "A line chart joins the measurements of each day. Drag a point up or down and see the line rise or fall.",
        id: "Diagram garis menghubungkan hasil pengukuran setiap hari. Geser titik ke atas atau ke bawah, lalu lihat garisnya naik atau turun.",
      },
      scene: growth,
    },
    {
      say: {
        en: "Read a line chart along the line: where it goes up the temperature rises, where it goes down it falls.",
        id: "Bacalah diagram garis mengikuti garisnya: saat garis naik suhunya naik, saat garis turun suhunya turun.",
      },
      scene: temperature,
    },
    {
      say: {
        en: "A pie chart is a bar of data curled into a circle. The whole circle stands for the whole class.",
        id: "Diagram lingkaran adalah batang data yang digulung menjadi lingkaran. Seluruh lingkaran mewakili seluruh kelas.",
      },
      scene: curl,
    },
    {
      say: {
        en: "Each slice is a fraction of the whole, so its angle is that fraction of 360°. Press + or − and watch the slices change.",
        id: "Setiap juring adalah pecahan dari keseluruhan, jadi sudutnya adalah pecahan itu dikali 360°. Tekan + atau − dan lihat juringnya berubah.",
      },
      scene: pie,
    },
  ],
};
