import type { Lang } from "../legal";
import { C, type Ink } from "./ink";

/** Pieces several lessons share: numbers as each language writes them, fractions, words. */

/** 345,216 in English, 345.216 in Indonesian. */
export const num = (lang: Lang, n: number) => {
  const s = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/gu, lang === "id" ? "." : ",");
  return n < 0 ? `-${s}` : s;
};

/** A decimal with `digits` places: 0.25 in English, 0,25 in Indonesian. */
export const dec = (lang: Lang, n: number, digits: number) => {
  const [whole, part] = n.toFixed(digits).split(".");
  const w = num(lang, Number(whole));
  return part === undefined ? w : `${w}${lang === "id" ? "," : "."}${part}`;
};

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** A fraction written as on paper, its middle at (x, y). Returns its width. */
export function frac(g: Ink, a: number | string, b: number | string, x: number, y: number, size = 40, color: string = C.ink) {
  const w = Math.max(g.width(String(a), size, true), g.width(String(b), size, true)) + size * 0.3;
  g.text(String(a), x, y - size * 0.58, size, color, "center", true);
  g.line(x - w / 2, y, x + w / 2, y, color, Math.max(2, size / 14));
  g.text(String(b), x, y + size * 0.62, size, color, "center", true);
  return w;
}

/** A row of signs and fractions centred on x, such as 1/2 + 1/3 = 5/6. */
export function sum(g: Ink, parts: (string | [number | string, number | string])[], x: number, y: number, size = 40, colors: string[] = []) {
  const gap = size * 0.35;
  const widths = parts.map((p) =>
    typeof p === "string" ? g.width(p, size, true) : Math.max(g.width(String(p[0]), size, true), g.width(String(p[1]), size, true)) + size * 0.3,
  );
  let at = x - (widths.reduce((n, w) => n + w, 0) + gap * (parts.length - 1)) / 2;
  parts.forEach((p, i) => {
    const color = colors[i] ?? C.ink;
    if (typeof p === "string") g.text(p, at + widths[i] / 2, y, size, color, "center", true);
    else frac(g, p[0], p[1], at + widths[i] / 2, y, size, color);
    at += widths[i] + gap;
  });
}

/** A strip cut into `parts`, the first `shaded` coloured, with creases between. */
export function strip(g: Ink, x: number, y: number, w: number, h: number, parts: number, shaded: number, color: string, lift = 1) {
  g.card(x, y, w, h, C.paper, lift);
  g.c.fillStyle = color;
  g.c.fillRect(x, y, (w * shaded) / parts, h);
  for (let i = 1; i < parts; i++) g.crease(x + (w * i) / parts, y, x + (w * i) / parts, y + h);
  g.c.strokeStyle = C.ink;
  g.c.lineWidth = 2;
  g.c.strokeRect(x, y, w, h);
}

const EN_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ID_ONES = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

function en(n: number): string {
  if (n < 20) return EN_ONES[n];
  if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : "");
  if (n < 1000) return `${EN_ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${en(n % 100)}` : ""}`;
  if (n < 1_000_000) return `${en(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${en(n % 1000)}` : ""}`;
  return `${en(Math.floor(n / 1_000_000))} million${n % 1_000_000 ? ` ${en(n % 1_000_000)}` : ""}`;
}

function id(n: number): string {
  if (n < 12) return ID_ONES[n];
  if (n < 20) return `${ID_ONES[n - 10]} belas`;
  if (n < 100) return `${ID_ONES[Math.floor(n / 10)]} puluh${n % 10 ? ` ${ID_ONES[n % 10]}` : ""}`;
  if (n < 200) return `seratus${n % 100 ? ` ${id(n % 100)}` : ""}`;
  if (n < 1000) return `${ID_ONES[Math.floor(n / 100)]} ratus${n % 100 ? ` ${id(n % 100)}` : ""}`;
  if (n < 2000) return `seribu${n % 1000 ? ` ${id(n % 1000)}` : ""}`;
  if (n < 1_000_000) return `${id(Math.floor(n / 1000))} ribu${n % 1000 ? ` ${id(n % 1000)}` : ""}`;
  return `${id(Math.floor(n / 1_000_000))} juta${n % 1_000_000 ? ` ${id(n % 1_000_000)}` : ""}`;
}

/** A whole number read aloud, up to millions. */
export const words = (lang: Lang, n: number) => (n === 0 ? (lang === "id" ? "nol" : "zero") : lang === "id" ? id(n) : en(n));

/** Lines of text that fit `width`, for long words drawn in a canvas. */
export function wrap(g: Ink, s: string, width: number, size: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (g.width(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
