import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { num, sum, wrap } from "../parts";

/** An integer with a true minus sign: −7, and 1.000 or 1,000 as each language writes it. */
const int = (lang: Lang, n: number) => (n < 0 ? `−${num(lang, -n)}` : num(lang, n));

/** Below zero is cold blue, above zero warm coral, zero itself plain ink. */
const tone = (n: number) => (n < 0 ? C.cobalt : n > 0 ? C.coral : C.ink);

/** Text that shrinks to fit `maxW` instead of running off the sheet. */
function fit(g: Ink, s: string, x: number, y: number, size: number, maxW: number, color: string = C.ink, align: CanvasTextAlign = "center", bold = true) {
  const w = g.width(s, size, bold);
  g.text(s, x, y, w > maxW ? Math.max(18, (size * maxW) / w) : size, color, align, bold);
}

/** A line with an arrowhead at its end. */
function arrow(g: Ink, x1: number, y1: number, x2: number, y2: number, color: string, width = 3) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.line(x1, y1, x2, y2, color, width);
  g.line(x2, y2, x2 - 12 * Math.cos(a - 0.5), y2 - 12 * Math.sin(a - 0.5), color, width);
  g.line(x2, y2, x2 - 12 * Math.cos(a + 0.5), y2 - 12 * Math.sin(a + 0.5), color, width);
}

const X0 = 80;
const X1 = 920;
const ZX = 500;
const STEP = 42;
const xs = (n: number) => ZX + n * STEP;
const at = (x: number) => clamp(Math.round((x - ZX) / STEP), -10, 10);

/** The integer line from −10 to 10, every point ticked and labelled. */
function numberLine(g: Ink, lang: Lang, y: number) {
  arrow(g, ZX, y, X1 + 34, y, C.ink, 4);
  arrow(g, ZX, y, X0 - 34, y, C.ink, 4);
  for (let n = -10; n <= 10; n++) {
    const x = xs(n);
    g.line(x, y - (n === 0 ? 18 : 11), x, y + (n === 0 ? 18 : 11), C.ink, n === 0 ? 4 : 2);
    g.text(int(lang, n), x, y + 36, 20, tone(n), "center", true);
  }
}

/** A thermometer dragged up and down past zero, and the sea with a bird above it and a diver below. */
function life(lang: Lang): Scene {
  let view = 0;
  let temp = 12;
  let bird = 18;
  let diver = -22;
  let held: "temp" | "bird" | "diver" | null = null;
  // The thermometer: 40 °C at the top, −20 °C at the bottom.
  const TX = 200;
  const TT = 70;
  const TB = 430;
  const ty = (v: number) => lerp(TB, TT, (v + 20) / 60);
  const tv = (y: number) => Math.round(clamp(-20 + ((TB - y) / (TB - TT)) * 60, -20, 40));
  // The sea: 6.5 sheet units to a metre, sea level at y = 250.
  const SL = 250;
  const M = 6.5;
  const sy = (m: number) => SL - m * M;
  const sm = (y: number) => Math.round((SL - y) / M);
  const BX = 300;
  const DX = 500;
  const L =
    lang === "id"
      ? { thermo: "TERMOMETER", sea: "PERMUKAAN LAUT", drag: "geser", bird: "burung", diver: "penyelam" }
      : { thermo: "THERMOMETER", sea: "SEA LEVEL", drag: "drag", bird: "bird", diver: "diver" };

  const thermometer = (g: Ink, t: number) => {
    const color = temp < 0 ? C.cobalt : C.coral;
    g.card(TX - 20, TT - 30, 40, TB - TT + 70, C.paper, 1);
    g.dot(TX + 3, TB + 55, 32, "rgba(70, 50, 25, 0.22)");
    g.dot(TX, TB + 50, 32, C.paper);
    g.dot(TX, TB + 50, 24, color);
    g.c.fillStyle = color;
    g.c.fillRect(TX - 9, ty(temp), 18, TB + 50 - ty(temp));
    for (let v = -20; v <= 40; v += 5) {
      const y = ty(v);
      g.line(TX + 22, y, TX + (v % 10 ? 32 : 40), y, v === 0 ? C.ink : C.soft, v === 0 ? 3 : 2);
      if (v % 10 === 0) g.text(int(lang, v), TX + 50, y, 22, tone(v), "left", true);
    }
    g.crease(TX - 70, ty(0), TX + 110, ty(0));
    g.text("°C", TX, TT - 52, 24, C.soft, "center", true);
    g.handle(TX, ty(temp), held === "temp");
    if (t < 4 && !held) g.text(L.drag, TX - 60, ty(temp), 20, C.coral, "right", true);

    // What the number says, and the pond beside it.
    fit(g, `${int(lang, temp)} °C`, 660, 100, 72, 500, tone(temp));
    const phrase =
      temp === 0
        ? lang === "id"
          ? "nol derajat: air mulai membeku"
          : "zero degrees: water starts to freeze"
        : temp < 0
          ? lang === "id"
            ? `${-temp} derajat di bawah nol`
            : `${-temp} degree${temp === -1 ? "" : "s"} below zero`
          : lang === "id"
            ? `${temp} derajat di atas nol`
            : `${temp} degree${temp === 1 ? "" : "s"} above zero`;
    fit(g, phrase, 660, 168, 30, 520, C.ink);
    g.card(400, 210, 520, 270, temp < 0 ? "#e6eef8" : "#eaf3fb", 1);
    const frozen = temp <= 0;
    g.c.fillStyle = frozen ? "#d4e4f5" : "#8fd0c3";
    g.c.beginPath();
    g.c.ellipse(660, 410, 210, 50, 0, 0, Math.PI * 2);
    g.c.fill();
    if (frozen) {
      g.line(560, 400, 620, 420, "rgba(255, 255, 255, 0.9)", 3);
      g.line(620, 420, 700, 395, "rgba(255, 255, 255, 0.9)", 3);
      g.line(700, 395, 760, 425, "rgba(255, 255, 255, 0.9)", 3);
    } else {
      for (let i = 0; i < 3; i++) {
        const r = 30 + ((t * 25 + i * 40) % 120);
        g.c.strokeStyle = `rgba(255, 255, 255, ${0.8 * (1 - r / 150)})`;
        g.c.lineWidth = 2;
        g.c.beginPath();
        g.c.ellipse(660, 410, r, r / 4.2, 0, 0, Math.PI * 2);
        g.c.stroke();
      }
    }
    if (temp < 0) {
      // Snow falls while it is below zero.
      for (let i = 0; i < 16; i++) {
        const x = 420 + ((i * 67) % 480);
        const y = 225 + ((t * 40 + i * 53) % 230);
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI) / 3 + t;
          g.line(x - 7 * Math.cos(a), y - 7 * Math.sin(a), x + 7 * Math.cos(a), y + 7 * Math.sin(a), C.paper, 2);
        }
      }
    }
    if (temp >= 25) {
      g.dot(840, 270, 30, C.sun);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + t * 0.5;
        g.line(840 + 38 * Math.cos(a), 270 + 38 * Math.sin(a), 840 + 52 * Math.cos(a), 270 + 52 * Math.sin(a), C.sun, 4);
      }
    }
    fit(g, lang === "id" ? "Suhu di bawah nol ditulis dengan tanda minus." : "Below zero we write a minus sign in front.", 660, 510, 22, 520, C.soft);
  };

  const sea = (g: Ink, t: number) => {
    g.c.fillStyle = "#e3ecf9";
    g.c.fillRect(60, 40, 580, SL - 40);
    g.c.fillStyle = "#c9e9e2";
    g.c.fillRect(60, SL, 580, 280);
    g.c.fillStyle = "#a9ddd2";
    g.c.fillRect(60, sy(-20), 580, 530 - sy(-20));
    g.card(60, 505, 580, 25, C.sand, 0);
    // The waves along sea level.
    g.c.strokeStyle = C.cobalt;
    g.c.lineWidth = 3;
    g.c.beginPath();
    for (let x = 60; x <= 640; x += 4) {
      const y = SL + Math.sin(x / 22 + t * 2) * 3;
      if (x === 60) g.c.moveTo(x, y);
      else g.c.lineTo(x, y);
    }
    g.c.stroke();
    g.text(lang === "id" ? "permukaan laut: 0 m" : "sea level: 0 m", 630, SL - 18, 20, C.ink, "right", true);
    // The scale up the side.
    g.line(130, sy(30), 130, sy(-40), C.ink, 3);
    for (let m = 30; m >= -40; m -= 10) {
      g.line(122, sy(m), 138, sy(m), C.ink, m === 0 ? 4 : 2);
      g.text(`${int(lang, m)} m`, 116, sy(m), 18, tone(m), "right", true);
    }
    const level = (x: number, m: number, color: string) => {
      g.c.setLineDash([6, 6]);
      g.line(138, sy(m), x - 30, sy(m), color, 2);
      g.c.setLineDash([]);
    };
    // The bird, its wings beating.
    const by = sy(bird);
    level(BX, bird, C.coral);
    const flap = Math.sin(t * 8) * 12;
    g.c.strokeStyle = C.plum;
    g.c.lineWidth = 5;
    g.c.beginPath();
    g.c.moveTo(BX - 32, by - 8 - flap);
    g.c.quadraticCurveTo(BX - 14, by - 16, BX, by);
    g.c.quadraticCurveTo(BX + 14, by - 16, BX + 32, by - 8 - flap);
    g.c.stroke();
    g.dot(BX, by, 7, C.plum);
    if (held === "bird") g.dot(BX, by, 26, "rgba(242, 113, 107, 0.2)");
    // The diver, flippers kicking and bubbles rising.
    const dy = sy(diver);
    level(DX, diver, C.cobalt);
    for (let i = 0; i < 4; i++) {
      const rise = (t * 30 + i * 30) % Math.max(20, dy - SL);
      if (dy - SL > 20) g.dot(DX + 26 + Math.sin(t * 3 + i) * 4, dy - 12 - rise, 4 + i, "rgba(255, 255, 255, 0.8)");
    }
    g.c.fillStyle = C.cobalt;
    g.c.beginPath();
    g.c.ellipse(DX, dy, 34, 12, 0, 0, Math.PI * 2);
    g.c.fill();
    g.dot(DX + 36, dy - 4, 12, C.sun);
    g.dot(DX + 42, dy - 6, 5, C.paper);
    const kick = Math.sin(t * 6) * 8;
    g.line(DX - 32, dy, DX - 56, dy - 6 + kick, C.coral, 6);
    g.line(DX - 32, dy + 4, DX - 56, dy + 8 - kick, C.coral, 6);
    if (held === "diver") g.dot(DX, dy, 40, "rgba(242, 113, 107, 0.15)");
    if (t < 4 && !held) g.text(L.drag, (BX + DX) / 2, 300, 20, C.coral, "center", true);

    // A card for each of them.
    const tell = (y: number, name: string, m: number, s: string) => {
      g.card(670, y, 270, 200, C.paper, 1);
      g.text(name, 805, y + 28, 22, C.soft, "center", true);
      g.text(`${int(lang, m)} m`, 805, y + 80, 52, tone(m), "center", true);
      wrap(g, s, 240, 20).forEach((l, i, all) => g.text(l, 805, y + 150 + (i - (all.length - 1) / 2) * 24, 20, C.ink, "center", true));
    };
    tell(
      40,
      L.bird,
      bird,
      bird === 0 ? (lang === "id" ? "tepat di permukaan laut" : "right on the water") : lang === "id" ? `${bird} m di atas permukaan laut` : `${bird} m above sea level`,
    );
    tell(
      300,
      L.diver,
      diver,
      diver === 0 ? (lang === "id" ? "tepat di permukaan laut" : "right at the surface") : lang === "id" ? `${-diver} m di bawah permukaan laut` : `${-diver} m below sea level`,
    );
  };

  return {
    press(id) {
      if (id === "v0") view = 0;
      if (id === "v1") view = 1;
    },
    down(p) {
      if (view === 0 && Math.abs(p.x - TX) < 60 && p.y > TT - 40 && p.y < TB + 80) {
        held = "temp";
        temp = tv(p.y);
        return true;
      }
      if (view === 1 && Math.abs(p.x - BX) < 70 && p.y > 30 && p.y < SL + 10) {
        held = "bird";
        bird = clamp(sm(p.y), 0, 30);
        return true;
      }
      if (view === 1 && Math.abs(p.x - DX) < 80 && p.y > SL - 10 && p.y < 530) {
        held = "diver";
        diver = clamp(sm(p.y), -40, 0);
        return true;
      }
    },
    move(p) {
      if (held === "temp") temp = tv(p.y);
      if (held === "bird") bird = clamp(sm(p.y), 0, 30);
      if (held === "diver") diver = clamp(sm(p.y), -40, 0);
    },
    up() {
      held = null;
    },
    draw(g, t) {
      if (view === 0) thermometer(g, t);
      else sea(g, t);
      g.button("v0", L.thermo, 220, 555, 270, 52, view === 0 ? C.cobalt : C.soft);
      g.button("v1", L.sea, 510, 555, 270, 52, view === 1 ? C.cobalt : C.soft);
    },
  };
}

/** A point and its opposite mirrored around zero; folding the line at zero lays one on the other. */
function opposites(lang: Lang): Scene {
  let v = 4;
  let held = false;
  let folded = false;
  let foldAt = -10;
  let now = 0;
  const y = 330;
  const L =
    lang === "id" ? { fold: "LIPAT DI NOL", open: "BUKA LIPATAN", drag: "geser titiknya" } : { fold: "FOLD AT ZERO", open: "UNFOLD", drag: "drag the point" };
  const k = () => (folded ? ease(now, foldAt, 1.2) : 1 - ease(now, foldAt, 1.2));
  return {
    press(id) {
      if (id === "fold") {
        folded = !folded;
        foldAt = now;
      }
    },
    down(p) {
      if (k() > 0) return;
      if (Math.abs(p.y - y) < 60 && p.x > X0 - 20 && p.x < X1 + 20) {
        held = true;
        v = at(p.x);
        return true;
      }
    },
    move(p) {
      v = at(p.x);
    },
    up() {
      held = false;
    },
    draw(g, t) {
      now = t;
      const f = Math.cos(k() * Math.PI);
      const map = (n: number) => (n > 0 ? ZX + n * STEP * f : xs(n));
      // The left half of the paper, then the right half turning over onto it.
      g.card(X0 - 40, y - 70, ZX - X0 + 40, 140, "#f8efdc", 0.6);
      numberLine(g, lang, y);
      const right = (X1 + 40 - ZX) * f;
      g.c.globalAlpha = f < 0 ? 0.6 : 1;
      g.c.fillStyle = "rgba(70, 50, 25, 0.15)";
      g.c.fillRect(ZX + 3, y - 65, right, 140);
      g.c.fillStyle = f < 0 ? "#ead9b6" : "#f8efdc";
      g.c.fillRect(ZX, y - 70, right, 140);
      g.c.globalAlpha = 1;
      // The right half drawn where the fold has carried it.
      g.line(ZX, y, ZX + (X1 + 20 - ZX) * f, y, C.ink, 4);
      for (let n = 1; n <= 10; n++) {
        const x = map(n);
        g.line(x, y - 11, x, y + 11, C.ink, 2);
        g.text(int(lang, n), x, f >= 0 ? y + 36 : y - 36, 20, tone(n), "center", true);
      }
      g.line(ZX, y - 18, ZX, y + 18, C.ink, 4);
      g.crease(ZX, y - 70, ZX, y + 70);

      const open = 1 - k();
      if (v !== 0 && open > 0) {
        // An arc over zero joining the pair, and the equal distances under it.
        g.c.globalAlpha = open;
        g.c.strokeStyle = C.plum;
        g.c.lineWidth = 3;
        g.c.setLineDash([8, 8]);
        g.c.beginPath();
        const r = Math.abs(v) * STEP;
        g.c.ellipse(ZX, y - 12, r, Math.min(r * 0.6, 110), 0, Math.PI, Math.PI * 2);
        g.c.stroke();
        g.c.setLineDash([]);
        const steps = lang === "id" ? `${Math.abs(v)} langkah` : `${Math.abs(v)} step${Math.abs(v) === 1 ? "" : "s"}`;
        const bracket = (a: number, b: number) => {
          const [x1, x2] = [Math.min(a, b), Math.max(a, b)];
          g.line(x1, 385, x1, 397, C.plum, 3);
          g.line(x1, 397, x2, 397, C.plum, 3);
          g.line(x2, 385, x2, 397, C.plum, 3);
          g.text(steps, (x1 + x2) / 2, 420, 20, C.plum, "center", true);
        };
        bracket(ZX, xs(v));
        bracket(ZX, xs(-v));
        g.c.globalAlpha = 1;
      }
      g.dot(map(-v), y, 13, tone(-v));
      g.dot(map(-v), y, 5, C.paper);
      if (open > 0.99) g.handle(xs(v), y, held);
      else g.dot(map(v), y, 13, tone(v));
      if (t < 4 && !held) g.text(L.drag, xs(v), y - 50, 20, C.coral, "center", true);

      const head =
        v === 0
          ? lang === "id"
            ? "lawan dari 0 adalah 0 sendiri"
            : "the opposite of 0 is 0 itself"
          : lang === "id"
            ? `lawan dari ${int(lang, v)} adalah ${int(lang, -v)}`
            : `the opposite of ${int(lang, v)} is ${int(lang, -v)}`;
      fit(g, head, W / 2, 75, 46, 880, C.ink);
      if (v !== 0) {
        const a = int(lang, Math.abs(v));
        const b = int(lang, -Math.abs(v));
        const line =
          k() > 0.99
            ? lang === "id"
              ? `Dilipat di nol, ${a} jatuh tepat di atas ${b}.`
              : `Folded at zero, ${a} lands right on ${b}.`
            : lang === "id"
              ? `${a} dan ${b} sama jauhnya dari 0, tetapi di sisi yang berlawanan.`
              : `${a} and ${b} are the same distance from 0, on opposite sides.`;
        fit(g, line, W / 2, 135, 24, 880, C.soft);
      }
      g.button("fold", folded ? L.open : L.fold, W / 2 - 150, 555, 300, 52, C.cobalt);
    },
  };
}

/** Two points on the line: the one further right is the greater, however far below zero both are. */
function compare(lang: Lang): Scene {
  const pairs = [
    [-2, -7],
    [3, -5],
    [-1, -9],
    [0, -4],
    [6, 2],
  ];
  let pick = 0;
  const val = [-2, -7];
  const shown = [-2, -7];
  let held: number | null = null;
  const y = 300;
  const colors = [C.teal, C.plum];
  return {
    press(id) {
      if (id === "other") {
        pick = (pick + 1) % pairs.length;
        val[0] = pairs[pick][0];
        val[1] = pairs[pick][1];
      }
    },
    down(p) {
      if (p.y < y - 170 || p.y > y + 40) return;
      const d = shown.map((s) => Math.abs(p.x - xs(s)));
      const i = d[0] <= d[1] ? 0 : 1;
      if (d[i] < 30) {
        held = i;
        return true;
      }
    },
    move(p) {
      if (held !== null) {
        val[held] = at(p.x);
        shown[held] = val[held];
      }
    },
    up() {
      held = null;
    },
    draw(g, t) {
      shown.forEach((s, i) => {
        if (held !== i) shown[i] = Math.abs(val[i] - s) < 0.01 ? val[i] : lerp(s, val[i], 0.15);
      });
      numberLine(g, lang, y);
      shown.forEach((s, i) => {
        const x = xs(s);
        const top = y - (i === 0 ? 70 : 130);
        g.line(x, y - 14, x, top + 22, colors[i], 3);
        g.card(x - 40, top - 22, 80, 44, colors[i], held === i ? 1.6 : 1);
        g.text(int(lang, val[i]), x, top, 26, C.paper, "center", true);
        g.dot(x, y, 12, colors[i]);
      });
      if (t < 4 && held === null) g.text(lang === "id" ? "geser kartunya" : "drag the cards", W / 2, 190, 20, C.coral, "center", true);
      const [a, b] = val;
      const sign = a > b ? ">" : a < b ? "<" : "=";
      sum(g, [int(lang, a), sign, int(lang, b)], W / 2, 70, 64, [C.teal, C.ink, C.plum]);
      const [hi, lo] = a >= b ? [a, b] : [b, a];
      const line =
        a === b
          ? lang === "id"
            ? "Titiknya sama, jadi kedua bilangan sama besar."
            : "The same point, so the two numbers are equal."
          : lang === "id"
            ? `${int(lang, hi)} lebih ke kanan daripada ${int(lang, lo)}, jadi ${int(lang, hi)} lebih besar.`
            : `${int(lang, hi)} is further right than ${int(lang, lo)}, so ${int(lang, hi)} is greater.`;
      fit(g, line, W / 2, 400, 28, 880, C.ink);
      arrow(g, 330, 465, 670, 465, C.soft, 4);
      g.text(lang === "id" ? "lebih kecil" : "smaller", 315, 465, 22, C.cobalt, "right", true);
      g.text(lang === "id" ? "lebih besar" : "greater", 685, 465, 22, C.coral, "left", true);
      g.button("other", lang === "id" ? "PASANGAN LAIN" : "ANOTHER PAIR", W / 2 - 150, 555, 300, 52, C.cobalt);
    },
  };
}

/** Five cards drop onto the line in turn, and read from left to right they are in order. */
function order(lang: Lang): Scene {
  let nums = [3, -7, 0, -2, 5];
  let start: number | null = null;
  let now = 0;
  const y = 250;
  const slot = (i: number) => 160 + i * 170;
  const fresh = () => {
    const pool = Array.from({ length: 21 }, (_, i) => i - 10);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    nums = pool.slice(0, 5);
    start = null;
  };
  return {
    press(id) {
      if (id === "order" && start === null) start = now;
      if (id === "new") fresh();
    },
    draw(g, t) {
      now = t;
      numberLine(g, lang, y);
      const sorted = [...nums].sort((a, b) => a - b);
      const ks = nums.map((n) => (start === null ? 0 : ease(t, start + sorted.indexOf(n) * 0.45, 0.8)));
      nums.forEach((n, i) => {
        const k = ks[i];
        if (k <= 0) return;
        const r = sorted.indexOf(n);
        const x = lerp(slot(i), slot(r), k);
        const cy = lerp(90, 420, k);
        g.c.globalAlpha = 0.5 * k;
        g.line(x, cy - 32, xs(n), y + 12, tone(n), 2);
        g.c.globalAlpha = 1;
        g.dot(xs(n), y, 6 + 6 * k, tone(n));
      });
      nums.forEach((n, i) => {
        const k = ks[i];
        const r = sorted.indexOf(n);
        const x = lerp(slot(i), slot(r), k);
        const cy = lerp(90, 420, k) - Math.sin(k * Math.PI) * 40;
        g.card(x - 55, cy - 32, 110, 64, n < 0 ? C.cobalt : n > 0 ? C.coral : C.soft, 1 + Math.sin(k * Math.PI));
        g.text(int(lang, n), x, cy, 36, C.paper, "center", true);
      });
      if (start !== null && ks.every((k) => k >= 1)) {
        const k = ease(t, start + 5 * 0.45 + 0.5, 0.6);
        g.c.globalAlpha = k;
        g.text(lang === "id" ? "dari yang terkecil ke yang terbesar" : "from the smallest to the greatest", W / 2, 472, 20, C.soft, "center", true);
        const parts: string[] = [];
        sorted.forEach((n, i) => parts.push(...(i ? ["<", int(lang, n)] : [int(lang, n)])));
        sum(g, parts, W / 2, 510, 34, parts.map((p, i) => (i % 2 ? C.ink : tone(sorted[i / 2]))));
        g.c.globalAlpha = 1;
      }
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "NEW NUMBERS", W / 2 - 300, 555, 280, 52, C.soft);
      g.button("order", lang === "id" ? "URUTKAN" : "PUT IN ORDER", W / 2 + 20, 555, 280, 52, C.cobalt, start === null);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Numbers below zero are negative numbers, written with a minus sign. Drag the thermometer below zero, then visit the sea.",
        id: "Bilangan di bawah nol adalah bilangan negatif, ditulis dengan tanda minus. Geser termometer sampai di bawah nol, lalu lihat laut.",
      },
      scene: life,
    },
    {
      say: {
        en: "Every integer has an opposite, just as far from zero on the other side. Move the point, then fold the line at zero.",
        id: "Setiap bilangan bulat punya lawan, sama jauhnya dari nol di sisi yang lain. Geser titiknya, lalu lipat garis bilangan di nol.",
      },
      scene: opposites,
    },
    {
      say: {
        en: "On the number line, the number further to the right is greater. So −2 is greater than −7.",
        id: "Pada garis bilangan, bilangan yang lebih ke kanan lebih besar. Jadi −2 lebih besar daripada −7.",
      },
      scene: compare,
    },
    {
      say: {
        en: "To put integers in order, place them on the number line and read from left to right.",
        id: "Untuk mengurutkan bilangan bulat, letakkan di garis bilangan lalu baca dari kiri ke kanan.",
      },
      scene: order,
    },
  ],
};
