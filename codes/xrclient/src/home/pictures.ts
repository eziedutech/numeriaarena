/**
 * The nine pictures of a seat's picture password, in the server's order
 * (index 0 to 8), drawn as on the printed sign-in card (the teacher page
 * draws the same nine). SVG inner markup on a 48 by 48 view box.
 */

const f = (n: number) => n.toFixed(1);

const star = Array.from({ length: 10 }, (_, k) => {
  const r = k % 2 ? 8.5 : 20;
  const a = ((-90 + k * 36) * Math.PI) / 180;
  return `${f(24 + r * Math.cos(a))},${f(25 + r * Math.sin(a))}`;
}).join(' ');

const rays = Array.from({ length: 8 }, (_, k) => {
  const a = (k * 45 * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return `M${f(24 + 13 * c)} ${f(24 + 13 * s)}L${f(24 + 20 * c)} ${f(24 + 20 * s)}`;
}).join('');

const petals = Array.from({ length: 5 }, (_, k) => {
  const a = ((-90 + k * 72) * Math.PI) / 180;
  return `<circle cx="${f(24 + 11 * Math.cos(a))}" cy="${f(24 + 11 * Math.sin(a))}" r="8" fill="#c86bc4"/>`;
}).join('');

export const PICTURES: readonly string[] = [
  `<circle cx="24" cy="24" r="9" fill="#e2a21b"/><path d="${rays}" stroke="#e2a21b" stroke-width="4" stroke-linecap="round"/>`,
  '<path d="M30 5a19 19 0 1 0 13 31a15 15 0 1 1 -13 -31z" fill="#3469c4"/>',
  `<polygon points="${star}" fill="#f08a24"/>`,
  '<path d="M24 42C8 31 3 21 8 13C13 6 21 8 24 15C27 8 35 6 40 13C45 21 40 31 24 42Z" fill="#f2716b"/>',
  '<rect x="20" y="30" width="8" height="13" fill="#8a5a2b"/><polygon points="24,4 41,31 7,31" fill="#3fa36b"/>',
  '<polygon points="33,24 46,13 46,35" fill="#2f9fb3"/><ellipse cx="20" cy="24" rx="16" ry="10" fill="#2f9fb3"/><circle cx="12" cy="22" r="2.5" fill="#fffdf8"/>',
  '<rect x="9" y="22" width="30" height="21" fill="#c98a4b"/><polygon points="24,5 45,23 3,23" fill="#b5483f"/><rect x="20" y="30" width="8" height="13" fill="#fffdf8"/>',
  '<polygon points="24,5 24,29 40,29" fill="#e9b949"/><path d="M24 5V31" stroke="#3a3f4b" stroke-width="2"/><polygon points="3,32 45,32 37,43 11,43" fill="#3469c4"/>',
  `${petals}<circle cx="24" cy="24" r="6" fill="#e2a21b"/>`,
];

export function pictureSvg(n: number, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${PICTURES[n] ?? ''}</svg>`;
}
