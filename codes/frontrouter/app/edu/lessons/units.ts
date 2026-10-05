import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp } from "../ink";
import { dec, num } from "../parts";

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

function arrow(g: Ink, x1: number, y1: number, x2: number, y2: number, color: string) {
  g.line(x1, y1, x2, y2, color, 4);
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.line(x2, y2, x2 - 18 * Math.cos(a - 0.5), y2 - 18 * Math.sin(a - 0.5), color, 4);
  g.line(x2, y2, x2 - 18 * Math.cos(a + 0.5), y2 - 18 * Math.sin(a + 0.5), color, 4);
}

/** m times 10 to the power e, written without stray zeros: 50, 0,5, 0,005. */
function amount(lang: Lang, m: number, e: number) {
  while (e < 0 && m % 10 === 0) {
    m /= 10;
    e += 1;
  }
  return e >= 0 ? num(lang, m * 10 ** e) : dec(lang, m / 10 ** -e, -e);
}

interface Stairs {
  units: string[];
  /** A second name under a unit, such as ons. */
  alias?: string[];
  /** How many tens one step is worth. */
  pow: number;
  x0: number;
  sw: number;
  top: number;
  dh: number;
  /** Where the words for going down and going up are written. */
  downAt: [number, number, CanvasTextAlign];
  upAt: [number, number, CanvasTextAlign];
  /** A number and the unit it starts on. */
  starts: [number, number][];
  side?: (g: Ink, t: number) => void;
}

/** A staircase of units with a ball on one step: a hop down multiplies, a hop up divides. */
function stairs(lang: Lang, o: Stairs): Scene {
  let pick = 0;
  let [m, from] = o.starts[0];
  let at = from;
  let hop = { a: at, b: at, start: -9 };
  let now = 0;
  const n = o.units.length;
  const factor = 10 ** o.pow;
  const pos = (i: number) => ({ x: o.x0 + (i + 0.5) * o.sw, y: o.top + i * o.dh });
  const on = (u: number, off: number) => {
    const i = u * (n - 1);
    return { x: o.x0 + (i + 0.5) * o.sw, y: o.top + i * o.dh + off };
  };
  return {
    press(id) {
      if (id === "down" && at < n - 1) {
        hop = { a: at, b: at + 1, start: now };
        at += 1;
      }
      if (id === "up" && at > 0) {
        hop = { a: at, b: at - 1, start: now };
        at -= 1;
      }
      if (id === "new") {
        pick = (pick + 1) % o.starts.length;
        [m, from] = o.starts[pick];
        hop = { a: at, b: from, start: now };
        at = from;
      }
    },
    draw(g, t) {
      now = t;
      o.units.forEach((u, i) => {
        const p = pos(i);
        const x = o.x0 + i * o.sw + 4;
        g.card(x, p.y, o.sw - 8, 56, i === at ? C.sun : i % 2 ? C.paper : "#f8efdc", 1);
        const alias = o.alias?.[i];
        g.text(u, p.x, p.y + (alias ? 22 : 28), 28, C.ink, "center", true);
        if (alias) g.text(alias, p.x, p.y + 46, 18, C.soft, "center", true);
      });
      // Down along the top of the steps, up along their underside.
      const a1 = on(0.05, -(o.dh / 2 + 40));
      const a2 = on(0.95, -(o.dh / 2 + 40));
      arrow(g, a1.x, a1.y, a2.x, a2.y, C.teal);
      const b1 = on(0.9, o.dh / 2 + 90);
      const b2 = on(0.1, o.dh / 2 + 90);
      arrow(g, b1.x, b1.y, b2.x, b2.y, C.coral);
      const f = num(lang, factor);
      g.text(lang === "id" ? `turun 1 tangga, dikali ${f}` : `1 step down: × ${f}`, o.downAt[0], o.downAt[1], 24, C.teal, o.downAt[2], true);
      g.text(lang === "id" ? `naik 1 tangga, dibagi ${f}` : `1 step up: ÷ ${f}`, o.upAt[0], o.upAt[1], 24, C.coral, o.upAt[2], true);

      const k = ease(t, hop.start, 0.5);
      const pa = pos(hop.a);
      const pb = pos(hop.b);
      const bx = lerp(pa.x, pb.x, k);
      const by = lerp(pa.y, pb.y, k) - 20 - 50 * Math.sin(Math.PI * k);
      g.dot(bx + 2, by + 4, 18, "rgba(70, 50, 25, 0.25)");
      g.dot(bx, by, 18, C.coral);

      const e = (at - from) * o.pow;
      pieces(
        g,
        [
          [`${amount(lang, m, 0)} ${o.units[from]}`, C.ink],
          ["=", C.soft],
          [`${amount(lang, m, e)} ${o.units[at]}`, C.cobalt],
        ],
        W / 2,
        56,
        900,
        40,
      );
      const steps = at - from;
      if (steps !== 0) {
        const many = Math.abs(steps);
        const by10 = num(lang, 10 ** (many * o.pow));
        const said =
          lang === "id"
            ? `${steps > 0 ? "turun" : "naik"} ${many} tangga, ${steps > 0 ? "dikali" : "dibagi"} ${by10}`
            : `${many} step${many === 1 ? "" : "s"} ${steps > 0 ? "down, times" : "up, divided by"} ${by10}`;
        fit(g, said, W / 2, 104, 560, 24, steps > 0 ? C.teal : C.coral);
      }
      o.side?.(g, t);
      g.button("up", lang === "id" ? "NAIK" : "UP", 40, 555, 160, 52, C.coral, at > 0);
      g.button("down", lang === "id" ? "TURUN" : "DOWN", 220, 555, 160, 52, C.teal, at < n - 1);
      g.button("new", lang === "id" ? "BILANGAN LAIN" : "ANOTHER NUMBER", W - 320, 555, 280, 52, C.cobalt);
    },
  };
}

/** The length staircase from km down to mm. */
const length = (lang: Lang) =>
  stairs(lang, {
    units: ["km", "hm", "dam", "m", "dm", "cm", "mm"],
    pow: 1,
    x0: 60,
    sw: 125,
    top: 150,
    dh: 42,
    downAt: [935, 140, "right"],
    upAt: [50, 440, "left"],
    starts: [
      [5, 3],
      [2, 0],
      [350, 5],
      [12, 3],
      [7, 6],
      [45, 4],
    ],
  });

/** The weight staircase from kg to g, with tons and quintals on cards beside it. */
const weight = (lang: Lang) =>
  stairs(lang, {
    units: ["kg", "hg", "dag", "g"],
    alias: ["", lang === "id" ? "(ons)" : "", "", ""],
    pow: 1,
    x0: 60,
    sw: 140,
    top: 170,
    dh: 60,
    downAt: [620, 150, "right"],
    upAt: [50, 480, "left"],
    starts: [
      [2, 0],
      [500, 3],
      [3, 1],
      [25, 2],
    ],
    side(g, t) {
      const cx = 810;
      fit(g, lang === "id" ? "beban yang besar" : "big loads", cx, 190, 300, 24, C.soft);
      const facts =
        lang === "id"
          ? ["1 ton = 10 kuintal", "1 kuintal = 100 kg", `1 ton = ${num(lang, 1000)} kg`]
          : ["1 ton = 10 quintals", "1 quintal = 100 kg", `1 ton = ${num(lang, 1000)} kg`];
      facts.forEach((s, i) => {
        g.c.globalAlpha = ease(t, 0.6 + i * 0.5, 0.5);
        g.card(cx - 150, 225 + i * 80, 300, 62, i === 2 ? C.sun : C.paper, 1);
        fit(g, s, cx, 256 + i * 80, 280, 26, C.ink);
      });
      g.c.globalAlpha = 1;
    },
  });

/** A clock whose long hand is turned: each time it passes 12, another hour has gone. */
function clock(lang: Lang): Scene {
  let mins = 0;
  let goal = 0;
  let held = false;
  let last = 0;
  let lastAng = 0;
  let flash = -9;
  let hourSeen = 0;
  const CX = 290;
  const CY = 290;
  const R = 205;
  const PX = 760;
  const DAY = 1440;
  const angOf = (p: Pt) => Math.atan2(p.x - CX, -(p.y - CY));
  return {
    down(p) {
      if (Math.hypot(p.x - CX, p.y - CY) < R) {
        held = true;
        lastAng = angOf(p);
        return true;
      }
    },
    move(p) {
      const a = angOf(p);
      let d = a - lastAng;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      lastAng = a;
      mins = clamp(mins + (d / (Math.PI * 2)) * 60, 0, DAY);
      goal = mins;
    },
    up() {
      held = false;
      goal = Math.round(mins);
    },
    press(id) {
      if (id === "again") goal = 0;
      else goal = clamp(Math.round(goal) + Number(id), 0, DAY);
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (!held) mins += (goal - mins) * (1 - Math.exp(-dt * 6));
      const h = Math.floor(mins / 60 + 1e-6);
      if (h > hourSeen) flash = t;
      hourSeen = h;

      g.dot(CX + 4, CY + 6, R, "rgba(70, 50, 25, 0.22)");
      g.dot(CX, CY, R, C.paper);
      g.c.strokeStyle = C.ink;
      g.c.lineWidth = 4;
      g.c.beginPath();
      g.c.arc(CX, CY, R, 0, Math.PI * 2);
      g.c.stroke();
      // The part of the hour gone so far, swept from 12.
      const ma = ((mins % 60) / 60) * Math.PI * 2;
      g.c.fillStyle = "rgba(52, 105, 196, 0.14)";
      g.c.beginPath();
      g.c.moveTo(CX, CY);
      g.c.arc(CX, CY, R - 12, -Math.PI / 2, -Math.PI / 2 + ma);
      g.c.closePath();
      g.c.fill();
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const r1 = i % 5 ? R - 12 : R - 22;
        g.line(CX + Math.sin(a) * r1, CY - Math.cos(a) * r1, CX + Math.sin(a) * (R - 4), CY - Math.cos(a) * (R - 4), C.ink, i % 5 ? 1.5 : 3);
      }
      for (let i = 1; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.text(String(i), CX + Math.sin(a) * (R - 48), CY - Math.cos(a) * (R - 48), 30, C.ink, "center", true);
      }
      g.c.lineCap = "round";
      const ha = ((mins / 60) % 12) / 12 * Math.PI * 2;
      g.line(CX, CY, CX + Math.sin(ha) * R * 0.5, CY - Math.cos(ha) * R * 0.5, C.ink, 12);
      g.line(CX, CY, CX + Math.sin(ma) * (R - 30), CY - Math.cos(ma) * (R - 30), C.cobalt, 8);
      const sa = ((t % 60) / 60) * Math.PI * 2;
      g.line(CX, CY, CX + Math.sin(sa) * (R - 26), CY - Math.cos(sa) * (R - 26), C.coral, 2);
      g.c.lineCap = "butt";
      g.dot(CX, CY, 10, C.ink);
      if (t < 5 && !held) g.text(lang === "id" ? "putar jarum panjang" : "turn the long hand", CX, 520, 22, C.cobalt, "center", true);

      const m = Math.round(mins);
      const hh = Math.floor(m / 60);
      const rest = m % 60;
      let said: string;
      if (m >= DAY) said = lang === "id" ? "1 hari" : "1 day";
      else if (lang === "id") said = hh ? `${num(lang, hh)} jam ${num(lang, rest)} menit` : `${num(lang, rest)} menit`;
      else said = (hh ? `${num(lang, hh)} hour${hh === 1 ? "" : "s"} ` : "") + `${num(lang, rest)} minute${rest === 1 ? "" : "s"}`;
      fit(g, said, PX, 100, 400, 44, C.cobalt);
      fit(g, `= ${num(lang, m)} ${lang === "id" ? "menit" : "minutes"}`, PX, 160, 400, 28, C.soft);
      const glow = m >= DAY ? 1 : 1 - ease(t, flash + 1.4, 0.6);
      if (glow > 0 && (m >= DAY || flash > 0)) {
        g.c.globalAlpha = glow;
        g.card(PX - 180, 205, 360, 64, C.sun, 1);
        const big = m >= DAY ? (lang === "id" ? "24 jam = 1 hari" : "24 hours = 1 day") : lang === "id" ? "60 menit = 1 jam" : "60 minutes = 1 hour";
        fit(g, big, PX, 237, 330, 32, C.ink);
        g.c.globalAlpha = 1;
      }
      const facts = lang === "id" ? ["1 menit = 60 detik", "1 jam = 60 menit", "1 hari = 24 jam"] : ["1 minute = 60 seconds", "1 hour = 60 minutes", "1 day = 24 hours"];
      const tick = t % 60 < 1.2 && t > 1;
      facts.forEach((s, i) => {
        const lit = (i === 0 && tick) || (i === 2 && m >= DAY);
        g.card(PX - 180, 310 + i * 62, 360, 48, lit ? C.sun : C.field, lit ? 1 : 0);
        fit(g, s, PX, 334 + i * 62, 340, 24, i === 0 ? C.coral : C.ink);
      });
      const unit = lang === "id" ? "MENIT" : "MIN";
      g.button("5", `+5 ${unit}`, 40, 555, 150, 52, C.cobalt, m < DAY);
      g.button("15", `+15 ${unit}`, 200, 555, 170, 52, C.cobalt, m < DAY);
      g.button("60", lang === "id" ? "+1 JAM" : "+1 HOUR", 380, 555, 150, 52, C.teal, m < DAY);
      g.button("again", lang === "id" ? "ULANGI" : "START OVER", W - 230, 555, 190, 52, C.soft, m > 0);
    },
  };
}

/** An arm turned about a point: the angle in degrees, its name, and the quarter turns. */
function turn(lang: Lang): Scene {
  let deg = 50;
  let goal = 50;
  let held = false;
  let last = 0;
  let lastAng = 0;
  const CX = 300;
  const CY = 300;
  const R = 180;
  const PX = 760;
  const angOf = (p: Pt) => Math.atan2(-(p.y - CY), p.x - CX);
  const name = (r: number) => {
    const id = lang === "id";
    if (r === 0) return id ? "belum berputar" : "no turn yet";
    if (r < 90) return id ? "sudut lancip" : "an acute angle";
    if (r === 90) return id ? "sudut siku-siku" : "a right angle";
    if (r < 180) return id ? "sudut tumpul" : "an obtuse angle";
    if (r === 180) return id ? "sudut lurus" : "a straight angle";
    if (r < 360) return id ? "sudut refleks" : "a reflex angle";
    return id ? "satu putaran penuh" : "a full turn";
  };
  const QUARTERS = {
    en: ["a quarter turn", "half a turn", "three quarters of a turn", "a full turn"],
    id: ["¼ putaran", "½ putaran", "¾ putaran", "1 putaran penuh"],
  };
  return {
    down(p) {
      if (Math.hypot(p.x - CX, p.y - CY) < R + 40) {
        held = true;
        lastAng = angOf(p);
        return true;
      }
    },
    move(p) {
      const a = angOf(p);
      let d = a - lastAng;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      lastAng = a;
      deg = clamp(deg + (d * 180) / Math.PI, 0, 360);
      goal = deg;
    },
    up() {
      held = false;
      let r = Math.round(deg);
      for (const mark of [0, 90, 180, 270, 360]) if (Math.abs(r - mark) <= 3) r = mark;
      goal = r;
    },
    press(id) {
      if (id === "-10") goal = clamp(Math.round(goal) - 10, 0, 360);
      else if (id === "+10") goal = clamp(Math.round(goal) + 10, 0, 360);
      else goal = Number(id);
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (!held) deg += (goal - deg) * (1 - Math.exp(-dt * 7));
      const r = Math.round(deg);
      const rad = (deg * Math.PI) / 180;

      // A paper protractor all the way round.
      g.dot(CX + 3, CY + 5, R, "rgba(70, 50, 25, 0.18)");
      g.dot(CX, CY, R, "#f8efdc");
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const r1 = i % 3 ? R - 10 : R - 20;
        g.line(CX + Math.cos(a) * r1, CY - Math.sin(a) * r1, CX + Math.cos(a) * R, CY - Math.sin(a) * R, C.soft, i % 3 ? 1.5 : 2.5);
      }
      g.text("0°", CX + R + 30, CY, 22, C.soft, "center", true);
      g.text("90°", CX, CY - R - 26, 22, C.soft, "center", true);
      g.text("180°", CX - R - 36, CY, 22, C.soft, "center", true);
      g.text("270°", CX, CY + R + 26, 22, C.soft, "center", true);
      g.c.fillStyle = "rgba(63, 182, 160, 0.35)";
      g.c.beginPath();
      g.c.moveTo(CX, CY);
      g.c.arc(CX, CY, R - 24, 0, -rad, true);
      g.c.closePath();
      g.c.fill();
      if (r === 90) {
        g.line(CX + 30, CY, CX + 30, CY - 30, C.coral, 3);
        g.line(CX + 30, CY - 30, CX, CY - 30, C.coral, 3);
      } else if (rad > 0.01) {
        g.c.strokeStyle = C.coral;
        g.c.lineWidth = 3;
        g.c.beginPath();
        g.c.arc(CX, CY, 46, 0, -rad, true);
        g.c.stroke();
      }
      g.c.lineCap = "round";
      g.line(CX, CY, CX + R, CY, C.ink, 6);
      const tx = CX + Math.cos(rad) * R;
      const ty = CY - Math.sin(rad) * R;
      g.line(CX, CY, tx, ty, C.cobalt, 6);
      g.c.lineCap = "butt";
      g.dot(CX, CY, 9, C.ink);
      g.handle(tx, ty, held);

      g.text(`${num(lang, r)}°`, PX, 110, 80, C.cobalt, "center", true);
      fit(g, name(r), PX, 190, 380, 32, C.ink);
      if (r > 0 && r % 90 === 0) fit(g, QUARTERS[lang][r / 90 - 1], PX, 240, 380, 26, C.coral);
      const facts = lang === "id" ? ["1 putaran penuh = 360°", "sudut siku-siku = 90°"] : ["a full turn = 360°", "a right angle = 90°"];
      facts.forEach((s, i) => {
        const lit = (i === 0 && r === 360) || (i === 1 && r === 90);
        g.card(PX - 190, 290 + i * 62, 380, 48, lit ? C.sun : C.field, lit ? 1 : 0);
        fit(g, s, PX, 314 + i * 62, 360, 24, C.ink);
      });
      fit(g, lang === "id" ? "sudut diukur dengan busur derajat" : "angles are measured with a protractor", PX, 440, 380, 22, C.soft);
      if (t < 5 && !held) fit(g, lang === "id" ? "putar lengan birunya" : "turn the blue arm", PX, 485, 380, 22, C.cobalt);
      g.button("-10", "−10°", 40, 555, 110, 52, C.coral, goal > 0);
      g.button("+10", "+10°", 160, 555, 110, 52, C.teal, goal < 360);
      g.button("90", "90°", 560, 555, 110, 52, C.cobalt);
      g.button("180", "180°", 685, 555, 120, 52, C.cobalt);
      g.button("360", "360°", 820, 555, 140, 52, C.cobalt);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Units of length stand on a staircase: each step down is times 10, each step up is divided by 10.",
        id: "Satuan panjang tersusun seperti tangga: turun satu tangga dikali 10, naik satu tangga dibagi 10.",
      },
      scene: length,
    },
    {
      say: {
        en: "Weight has its own staircase from kg to g. Big loads are weighed in quintals and tons.",
        id: "Satuan berat juga punya tangga dari kg sampai g. Beban yang besar memakai kuintal dan ton.",
      },
      scene: weight,
    },
    {
      say: {
        en: "Time does not go in tens: 60 seconds make a minute and 60 minutes make an hour. Turn the long hand and watch.",
        id: "Waktu tidak berkelipatan sepuluh: 60 detik menjadi 1 menit dan 60 menit menjadi 1 jam. Putar jarum panjang dan amati.",
      },
      scene: clock,
    },
    {
      say: {
        en: "Angles are measured in degrees. A full turn is 360°, and a right angle is 90°.",
        id: "Sudut diukur dalam derajat. Satu putaran penuh adalah 360°, dan sudut siku-siku 90°.",
      },
      scene: turn,
    },
  ],
};
