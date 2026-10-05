import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Scene, W, lerp } from "../ink";
import { dec, num, wrap } from "../parts";

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

/** A label over a − and a + button with the value between them. */
function stepper(g: Ink, label: string, value: string, id: string, cx: number, canDown: boolean, canUp: boolean, color: string) {
  fit(g, label, cx, 518, 260, 22, C.soft);
  g.button(`${id}-`, "−", cx - 115, 545, 70, 52, color, canDown);
  g.text(value, cx, 571, 28, C.ink, "center", true);
  g.button(`${id}+`, "+", cx + 45, 545, 70, 52, color, canUp);
}

/** A number with at most one decimal place, without a trailing ,0. */
function show(lang: Lang, v: number) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? num(lang, r) : dec(lang, r, 1);
}

/** m times 10 to the power e, written without stray zeros. */
function amount(lang: Lang, m: number, e: number) {
  while (e < 0 && m % 10 === 0) {
    m /= 10;
    e += 1;
  }
  return e >= 0 ? num(lang, m * 10 ** e) : dec(lang, m / 10 ** -e, -e);
}

const UNITS = ["m³", "dm³", "cm³"];
const STARTS: [number, number][] = [
  [2, 0],
  [5, 1],
  [1500, 2],
  [250, 1],
  [3, 0],
  [750, 2],
];

/** The staircase of volume units: a hop down multiplies by 1,000, a hop up divides by 1,000; dm³ is the litre and cm³ the millilitre. */
function stairs(lang: Lang): Scene {
  let pick = 0;
  let [m, from] = STARTS[0];
  let at = from;
  let hop = { a: at, b: at, start: -9 };
  let now = 0;
  const n = UNITS.length;
  const x0 = 110;
  const sw = 260;
  const top = 185;
  const dh = 85;
  const id = lang === "id";
  const alias = ["", id ? "= liter" : "= litre", "= ml"];
  const pos = (i: number) => ({ x: x0 + (i + 0.5) * sw, y: top + i * dh });
  const on = (u: number, off: number) => {
    const i = u * (n - 1);
    return { x: x0 + (i + 0.5) * sw, y: top + i * dh + off };
  };
  return {
    press(key) {
      if (key === "down" && at < n - 1) {
        hop = { a: at, b: at + 1, start: now };
        at += 1;
      }
      if (key === "up" && at > 0) {
        hop = { a: at, b: at - 1, start: now };
        at -= 1;
      }
      if (key === "new") {
        pick = (pick + 1) % STARTS.length;
        [m, from] = STARTS[pick];
        hop = { a: at, b: from, start: now };
        at = from;
      }
    },
    draw(g, t) {
      now = t;
      UNITS.forEach((u, i) => {
        const p = pos(i);
        g.card(x0 + i * sw + 10, p.y, sw - 20, 70, i === at ? C.sun : i % 2 ? C.paper : "#f8efdc", 1);
        g.text(u, p.x, p.y + (alias[i] ? 26 : 35), 32, C.ink, "center", true);
        if (alias[i]) g.text(alias[i], p.x, p.y + 54, 20, C.soft, "center", true);
      });
      const a1 = on(0.05, -60);
      const a2 = on(0.95, -60);
      arrow(g, a1.x, a1.y, a2.x, a2.y, C.teal);
      const b1 = on(0.9, 125);
      const b2 = on(0.1, 125);
      arrow(g, b1.x, b1.y, b2.x, b2.y, C.coral);
      const k1000 = num(lang, 1000);
      fit(g, id ? `turun 1 tangga, dikali ${k1000}` : `1 step down: × ${k1000}`, 935, 180, 340, 24, C.teal, "right");
      fit(g, id ? `naik 1 tangga, dibagi ${k1000}` : `1 step up: ÷ ${k1000}`, 50, 480, 330, 24, C.coral, "left");
      g.card(600, 470, 360, 64, C.field, 0);
      fit(g, id ? `1 m³ = ${k1000} liter` : `1 m³ = ${k1000} litres`, 780, 502, 330, 24, C.ink);

      const k = ease(t, hop.start, 0.5);
      const pa = pos(hop.a);
      const pb = pos(hop.b);
      const bx = lerp(pa.x, pb.x, k);
      const by = lerp(pa.y, pb.y, k) - 20 - 50 * Math.sin(Math.PI * k);
      g.dot(bx + 2, by + 4, 18, "rgba(70, 50, 25, 0.25)");
      g.dot(bx, by, 18, C.coral);

      const e = (at - from) * 3;
      pieces(
        g,
        [
          [`${amount(lang, m, 0)} ${UNITS[from]}`, C.ink],
          ["=", C.soft],
          [`${amount(lang, m, e)} ${UNITS[at]}`, C.cobalt],
        ],
        W / 2,
        56,
        900,
        40,
      );
      const steps = at - from;
      let said = "";
      if (steps !== 0) {
        const many = Math.abs(steps);
        const times = num(lang, 10 ** (many * 3));
        said = id
          ? `${steps > 0 ? "turun" : "naik"} ${many} tangga, ${steps > 0 ? "dikali" : "dibagi"} ${times}`
          : `${many} step${many === 1 ? "" : "s"} ${steps > 0 ? "down, times" : "up, divided by"} ${times}`;
      }
      if (at > 0) {
        const word = at === 1 ? (id ? "liter" : "litres") : "ml";
        said = `${said ? `${said}; ` : ""}= ${amount(lang, m, e)} ${word}`;
      }
      if (said) fit(g, said, W / 2, 104, 700, 24, steps > 0 ? C.teal : steps < 0 ? C.coral : C.soft);
      g.button("up", id ? "NAIK" : "UP", 40, 555, 160, 52, C.coral, at > 0);
      g.button("down", id ? "TURUN" : "DOWN", 220, 555, 160, 52, C.teal, at < n - 1);
      g.button("new", id ? "BILANGAN LAIN" : "ANOTHER NUMBER", W - 320, 555, 280, 52, C.cobalt);
    },
  };
}

const DEBITS = [2, 3, 4, 5, 6, 10, 12];

/** A tap fills a 60 litre tank while a stopwatch runs; the litres in the tank over the minutes gone give the flow rate. */
function tap(lang: Lang): Scene {
  let pick = 3;
  let open = false;
  let time = 0;
  let last = 0;
  const CAP = 60;
  const TX = 120;
  const TW = 290;
  const TB = 480;
  const TH = 300;
  const SX = 262;
  const PX = 790;
  return {
    press(key) {
      const d = DEBITS[pick];
      const full = d * time >= CAP - 1e-6;
      if (key === "d-" && time === 0) pick = clamp(pick - 1, 0, DEBITS.length - 1);
      if (key === "d+" && time === 0) pick = clamp(pick + 1, 0, DEBITS.length - 1);
      if (key === "tap" && !full) open = !open;
      if (key === "empty") {
        open = false;
        time = 0;
      }
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      const d = DEBITS[pick];
      // One second on the page is one minute by the stopwatch.
      if (open) time += dt;
      if (d * time >= CAP) {
        time = CAP / d;
        open = false;
      }
      const vol = d * time;
      const full = vol >= CAP - 1e-6;
      const tq = full ? CAP / d : Math.floor(time * 10 + 1e-6) / 10;
      const id = lang === "id";

      // The pipe, the tap and its handle, which turns when it is open.
      g.card(40, 100, SX - 30, 24, C.soft, 1);
      g.card(SX - 14, 100, 28, 60, C.soft, 1);
      const turn = open ? Math.PI / 2 : 0;
      g.c.lineCap = "round";
      g.line(SX - 18 * Math.cos(turn), 88 - 18 * Math.sin(turn) * 0.3, SX + 18 * Math.cos(turn), 88 + 18 * Math.sin(turn) * 0.3, C.coral, 9);
      g.c.lineCap = "butt";
      g.line(SX, 88, SX, 100, C.ink, 4);
      g.dot(SX, 88, 6, C.ink);
      const surface = TB - (TH * vol) / CAP;
      g.card(TX, TB - TH, TW, TH, "#fbf6ea", 0);
      if (open) {
        const wob = Math.sin(t * 22) * 2;
        g.line(SX + wob, 160, SX - wob, surface, "rgba(52, 105, 196, 0.65)", 12);
        for (let i = 0; i < 4; i++) {
          const yy = 160 + (((t * 300 + i * 70) % 300) / 300) * (surface - 160);
          g.dot(SX + Math.sin(i * 2 + t * 5) * 8, yy, 3, C.cobalt);
        }
      }
      if (vol > 0) {
        g.c.fillStyle = "rgba(52, 105, 196, 0.45)";
        g.c.beginPath();
        g.c.moveTo(TX, TB);
        for (let x = TX; x <= TX + TW; x += 10) g.c.lineTo(x, surface + Math.sin(x / 20 + t * 4) * (open ? 3 : 1));
        g.c.lineTo(TX + TW, TB);
        g.c.closePath();
        g.c.fill();
      }
      g.line(TX, TB - TH, TX, TB, C.ink, 4);
      g.line(TX, TB, TX + TW, TB, C.ink, 4);
      g.line(TX + TW, TB, TX + TW, TB - TH, C.ink, 4);
      for (let L = 10; L <= CAP; L += 10) {
        const y = TB - (TH * L) / CAP;
        g.line(TX + TW, y, TX + TW + 12, y, C.soft, 2);
        g.text(`${num(lang, L)} L`, TX + TW + 18, y, 18, C.soft, "left");
      }

      // The stopwatch: its hand goes round once a minute.
      const cx = 520;
      const cy = 170;
      g.dot(cx + 3, cy + 5, 52, "rgba(70, 50, 25, 0.22)");
      g.dot(cx, cy, 52, C.paper);
      g.card(cx - 8, cy - 66, 16, 12, C.soft, 0);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.line(cx + Math.sin(a) * 42, cy - Math.cos(a) * 42, cx + Math.sin(a) * 48, cy - Math.cos(a) * 48, C.soft, 2);
      }
      const ha = time * Math.PI * 2;
      g.line(cx, cy, cx + Math.sin(ha) * 38, cy - Math.cos(ha) * 38, C.coral, 4);
      g.dot(cx, cy, 5, C.ink);
      g.text(`${show(lang, tq)} ${id ? "menit" : "min"}`, cx, cy + 80, 24, C.cobalt, "center", true);

      const unit = id ? "liter/menit" : "litres/minute";
      fit(g, `${id ? "waktu" : "time"}: ${show(lang, tq)} ${id ? "menit" : "minutes"}`, PX, 90, 330, 28, C.cobalt);
      fit(g, `volume: ${show(lang, d * tq)} ${id ? "liter" : "litres"}`, PX, 140, 330, 28, "#2f9a86");
      fit(g, `${id ? "debit" : "flow rate"}: ${num(lang, d)} ${unit}`, PX, 190, 330, 28, C.coral);
      g.card(PX - 170, 235, 340, 120, C.field, 0);
      fit(g, id ? "debit = volume : waktu" : "flow rate = volume ÷ time", PX, 270, 310, 26, C.ink);
      if (tq > 0) fit(g, `= ${show(lang, d * tq)} ${id ? ":" : "÷"} ${show(lang, tq)} = ${num(lang, d)} ${unit}`, PX, 318, 310, 24, C.ink);
      if (full) {
        g.card(PX - 170, 375, 340, 60, C.sun, 1);
        fit(g, id ? `penuh dalam ${show(lang, CAP / d)} menit` : `full in ${show(lang, CAP / d)} minutes`, PX, 405, 310, 26, C.ink);
      }
      const note = id ? "Debit adalah banyaknya air yang mengalir setiap satu satuan waktu." : "Flow rate is how much water flows in each unit of time.";
      wrap(g, note, 340, 20).forEach((l, i) => g.text(l, PX, 462 + i * 26, 20, C.soft, "center"));

      stepper(g, `${id ? "debit" : "flow rate"} (${unit})`, num(lang, d), "d", 170, time === 0 && pick > 0, time === 0 && pick < DEBITS.length - 1, C.coral);
      g.button("tap", open ? (id ? "TUTUP KERAN" : "CLOSE THE TAP") : id ? "BUKA KERAN" : "OPEN THE TAP", 330, 545, 290, 52, C.cobalt, !full);
      g.button("empty", id ? "KOSONGKAN" : "EMPTY THE TANK", 640, 545, 320, 52, C.teal, time > 0);
    },
  };
}

/** A car on its wheels, its front at x and its wheels on the road at y; the wheels turn as it goes. */
function car(g: Ink, x: number, y: number, turn: number) {
  g.card(x - 86, y - 34, 86, 22, C.coral, 1);
  g.c.fillStyle = C.coral;
  g.c.beginPath();
  g.c.moveTo(x - 70, y - 34);
  g.c.lineTo(x - 58, y - 54);
  g.c.lineTo(x - 26, y - 54);
  g.c.lineTo(x - 14, y - 34);
  g.c.closePath();
  g.c.fill();
  g.c.fillStyle = C.paper;
  g.c.fillRect(x - 56, y - 50, 14, 14);
  g.c.fillRect(x - 38, y - 50, 14, 14);
  g.dot(x - 4, y - 26, 4, C.sun);
  for (const wx of [x - 66, x - 22]) {
    g.dot(wx, y - 10, 11, C.ink);
    g.dot(wx, y - 10, 4, C.paper);
    g.line(wx, y - 10, wx + Math.cos(turn) * 9, y - 10 + Math.sin(turn) * 9, C.paper, 2);
  }
}

/** A car drives along a road marked in km; a flag goes up at every hour, and distance over time gives its speed. */
function road(lang: Lang): Scene {
  let v = 60;
  let time = 0;
  let driving = false;
  let last = 0;
  const HOUR = 2;
  const MAXH = 3;
  const RX0 = 90;
  const RX1 = 930;
  const MAXKM = 240;
  const pk = (RX1 - RX0) / MAXKM;
  const RY = 290;
  return {
    press(key) {
      if (key === "v-" || key === "v+") {
        v = clamp(v + (key === "v+" ? 10 : -10), 20, 80);
        time = 0;
        driving = false;
      }
      if (key === "go") {
        if (time >= MAXH - 1e-6) time = 0;
        driving = !driving;
      }
      if (key === "reset") {
        time = 0;
        driving = false;
      }
    },
    draw(g, t) {
      const dt = clamp(t - last, 0, 0.1);
      last = t;
      if (driving) time += dt / HOUR;
      if (time >= MAXH) {
        time = MAXH;
        driving = false;
      }
      const id = lang === "id";
      const tq = time >= MAXH ? MAXH : Math.floor(time * 10 + 1e-6) / 10;
      const km = v * tq;

      // Hills behind the road, then the road with its middle line and the km marks.
      g.c.fillStyle = C.field;
      for (const [hx, hr] of [[200, 120], [520, 160], [820, 110]]) {
        g.c.beginPath();
        g.c.arc(hx, RY - 40, hr, Math.PI, 0);
        g.c.fill();
      }
      g.card(40, RY - 40, 920, 56, "#6d7280", 1);
      g.c.setLineDash([22, 18]);
      g.line(40, RY - 12, 960, RY - 12, C.paper, 3);
      g.c.setLineDash([]);
      for (let k = 0; k <= MAXKM; k += 40) {
        const x = RX0 + k * pk;
        g.line(x, RY + 18, x, RY + 30, C.ink, 2);
        g.text(`${num(lang, k)} km`, x, RY + 44, 18, C.soft, "center", true);
      }
      for (let h = 1; h <= Math.floor(time + 1e-6); h++) {
        const x = RX0 + v * h * pk;
        const k = ease(time * HOUR, h * HOUR, 0.4);
        g.line(x, RY - 40, x, RY - 40 - 70 * k, C.ink, 3);
        g.card(x, RY - 110 * k, 66, 28, C.sun, 1);
        g.text(`${num(lang, h)} ${id ? "jam" : "h"}`, x + 33, RY - 110 * k + 14, 18, C.ink, "center", true);
      }
      car(g, RX0 + km * pk + (time >= MAXH ? 0 : (v * (time - tq)) * pk), RY + 2, -time * 40);

      const cols: [string, string, string][] = [
        [id ? "waktu" : "time", `${show(lang, tq)} ${id ? "jam" : "hours"}`, C.cobalt],
        [id ? "jarak" : "distance", `${num(lang, km)} km`, "#2f9a86"],
        [id ? "kecepatan" : "speed", `${num(lang, v)} ${id ? "km/jam" : "km/h"}`, C.coral],
      ];
      cols.forEach(([label, value, color], i) => {
        const x = 200 + i * 300;
        g.text(label, x, 365, 22, C.soft, "center", true);
        fit(g, value, x, 400, 260, 32, color);
      });
      g.card(120, 432, 760, 60, C.field, 0);
      const rule = id ? "kecepatan = jarak : waktu" : "speed = distance ÷ time";
      const sums = tq > 0 ? ` = ${num(lang, km)} ${id ? ":" : "÷"} ${show(lang, tq)} = ${num(lang, v)} ${id ? "km/jam" : "km/h"}` : "";
      fit(g, rule + sums, W / 2, 462, 720, 26, C.ink);

      stepper(g, id ? "kecepatan (km/jam)" : "speed (km/h)", num(lang, v), "v", 170, v > 20, v < 80, C.coral);
      g.button("go", driving ? (id ? "BERHENTI" : "STOP") : id ? "JALAN" : "DRIVE", 330, 545, 260, 52, C.cobalt);
      g.button("reset", id ? "ULANG DARI 0" : "START AGAIN", 640, 545, 300, 52, C.teal, time > 0);
    },
  };
}

type Part = "J" | "K" | "W";
const TRIPS: { en: string; id: string; k: number; w: number }[] = [
  { en: "a car", id: "mobil", k: 60, w: 2 },
  { en: "a bicycle", id: "sepeda", k: 15, w: 2 },
  { en: "a train", id: "kereta api", k: 90, w: 4 },
  { en: "someone walking", id: "orang berjalan kaki", k: 5, w: 3 },
  { en: "a motorbike", id: "sepeda motor", k: 40, w: 3 },
];

/** The triangle of distance, speed and time: covering one letter leaves the way to find it from the other two. */
function triangle(lang: Lang): Scene {
  let hide: Part = "J";
  let pick = 0;
  let changed = 0.2;
  let now = 0;
  const id = lang === "id";
  const AX = 300;
  const AY = 100;
  const BY = 450;
  const half = 210;
  const MID = 300;
  const PX = 750;
  const letter: Record<Part, string> = id ? { J: "J", K: "K", W: "W" } : { J: "D", K: "S", W: "T" };
  const color: Record<Part, string> = { J: "#2f9a86", K: C.coral, W: C.cobalt };
  const spot: Record<Part, { x: number; y: number }> = { J: { x: AX, y: 225 }, K: { x: AX - 75, y: 385 }, W: { x: AX + 75, y: 385 } };
  const choose = (p: Part) => {
    hide = p;
    changed = now;
  };
  return {
    press(key) {
      if (key === "next") {
        pick = (pick + 1) % TRIPS.length;
        changed = now;
      } else choose(key as Part);
    },
    down(p) {
      if (p.y < AY || p.y > BY) return;
      const w = (half * (p.y - AY)) / (BY - AY);
      if (Math.abs(p.x - AX) > w) return;
      choose(p.y < MID ? "J" : p.x < AX ? "K" : "W");
    },
    draw(g, t) {
      now = t;
      const trip = TRIPS[pick];
      const vals: Record<Part, number> = { J: trip.k * trip.w, K: trip.k, W: trip.w };
      const units: Record<Part, string> = { J: "km", K: id ? "km/jam" : "km/h", W: id ? "jam" : "hours" };
      const names: Record<Part, string> = id ? { J: "jarak", K: "kecepatan", W: "waktu" } : { J: "distance", K: "speed", W: "time" };

      const c = g.c;
      c.fillStyle = "rgba(70, 50, 25, 0.2)";
      c.beginPath();
      c.moveTo(AX + 4, AY + 6);
      c.lineTo(AX + half + 4, BY + 6);
      c.lineTo(AX - half + 4, BY + 6);
      c.closePath();
      c.fill();
      c.fillStyle = "#f8efdc";
      c.beginPath();
      c.moveTo(AX, AY);
      c.lineTo(AX + half, BY);
      c.lineTo(AX - half, BY);
      c.closePath();
      c.fill();
      const wm = (half * (MID - AY)) / (BY - AY);
      g.crease(AX - wm, MID, AX + wm, MID);
      g.crease(AX, MID, AX, BY);
      (["J", "K", "W"] as Part[]).forEach((p) => {
        const s = spot[p];
        g.text(letter[p], s.x, s.y, 64, color[p], "center", true);
        g.text(names[p], s.x, s.y + 44, 18, C.soft, "center", true);
      });
      g.dot(AX, 385, 16, C.paper);
      g.text("×", AX, 385, 30, C.ink, "center", true);
      // A paper flap lifts onto the letter being looked for.
      const k = ease(t, changed, 0.45);
      const s = spot[hide];
      const fy = s.y - 40 * (1 - k);
      c.globalAlpha = k;
      g.card(s.x - 50, fy - 46, 100, 92, C.sun, 1 + (1 - k));
      g.text("?", s.x, fy, 56, C.ink, "center", true);
      c.globalAlpha = 1;
      g.text(id ? "tutup satu huruf" : "cover one letter", AX, 490, 20, C.soft, "center", true);

      const rule: Record<Part, string> = id
        ? { J: "J = K × W", K: "K = J : W", W: "W = J : K" }
        : { J: "D = S × T", K: "S = D ÷ T", W: "T = D ÷ S" };
      const others = (["J", "K", "W"] as Part[]).filter((p) => p !== hide);
      fit(g, `${id ? "contoh" : "for example"}: ${id ? trip.id : trip.en}`, PX, 80, 400, 26, C.ink);
      others.forEach((p, i) => {
        fit(g, `${names[p]}: ${num(lang, vals[p])} ${units[p]}`, PX, 125 + i * 38, 400, 24, color[p]);
      });
      fit(g, `${names[hide]}: ?`, PX, 201, 400, 24, color[hide]);
      g.c.globalAlpha = ease(t, changed + 0.4, 0.5);
      g.card(PX - 200, 235, 400, 120, C.field, 0);
      g.text(rule[hide], PX, 270, 34, C.ink, "center", true);
      const op = hide === "J" ? "×" : id ? ":" : "÷";
      const [a, b] = hide === "J" ? [vals.K, vals.W] : [vals.J, hide === "K" ? vals.W : vals.K];
      fit(g, `= ${num(lang, a)} ${op} ${num(lang, b)} = ${num(lang, vals[hide])} ${units[hide]}`, PX, 320, 370, 28, color[hide]);
      g.c.globalAlpha = 1;

      // The trip on a little road: one hour on the page is one second.
      const RX0 = 570;
      const RX1 = 930;
      const RY = 430;
      g.line(RX0, RY, RX1, RY, C.soft, 6);
      for (let h = 0; h <= trip.w; h++) {
        const x = lerp(RX0, RX1, h / trip.w);
        g.line(x, RY - 10, x, RY + 10, C.ink, 2);
        g.text(`${num(lang, h)} ${id ? "jam" : "h"}`, x, RY + 26, 18, C.cobalt, "center", true);
      }
      g.text(`${num(lang, vals.J)} km`, RX1, RY - 26, 18, "#2f9a86", "right", true);
      const go = ((t % (trip.w + 1)) / trip.w);
      g.dot(lerp(RX0, RX1, clamp(go, 0, 1)), RY - 2, 10, C.coral);

      g.button("J", id ? "CARI JARAK" : "FIND DISTANCE", 40, 555, 225, 52, "#2f9a86");
      g.button("K", id ? "CARI KECEPATAN" : "FIND SPEED", 280, 555, 235, 52, C.coral);
      g.button("W", id ? "CARI WAKTU" : "FIND TIME", 530, 555, 210, 52, C.cobalt);
      g.button("next", id ? "CONTOH LAIN" : "ANOTHER", 755, 555, 205, 52, C.plum);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Volume units stand on a staircase where each step is × 1,000. And 1 dm³ is 1 litre, 1 cm³ is 1 ml.",
        id: "Satuan volume tersusun seperti tangga, setiap anak tangga dikali 1.000. Ingat, 1 dm³ = 1 liter dan 1 cm³ = 1 ml.",
      },
      scene: stairs,
    },
    {
      say: {
        en: "Open the tap and watch the stopwatch. The flow rate is the volume of water divided by the time: litres per minute.",
        id: "Buka keran dan perhatikan stopwatch-nya. Debit adalah volume air dibagi waktu: liter per menit.",
      },
      scene: tap,
    },
    {
      say: {
        en: "Set the speed and let the car drive. Speed is the distance divided by the time: km per hour.",
        id: "Atur kecepatannya, lalu jalankan mobilnya. Kecepatan adalah jarak dibagi waktu: km per jam.",
      },
      scene: road,
    },
    {
      say: {
        en: "Distance = speed × time. Cover the letter you are looking for, and the triangle shows how to find it.",
        id: "Jarak = kecepatan × waktu. Tutup huruf yang dicari, maka segitiga menunjukkan cara menghitungnya.",
      },
      scene: triangle,
    },
  ],
};
