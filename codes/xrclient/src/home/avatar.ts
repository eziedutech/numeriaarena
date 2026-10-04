/**
 * A student's paper avatar, read from their seat's pseudonym: the colour
 * and the animal of RED FOX 03 give a red folded fox. The server picks the
 * pseudonym at random for each seat and keeps it all year, so the avatar is
 * random per student and stays the same. Flat faceted paper on a 64 by 64
 * view box, a light and a dark side for each fold.
 */

const INK = '#3a3f4b';
const PAPER = '#fff8ec';

const COLOURS: Record<string, string> = {
  blue: '#3469c4',
  red: '#d9534a',
  green: '#3fa36b',
  gold: '#e2a21b',
  teal: '#2a9d8f',
  coral: '#f2716b',
  violet: '#8f6fd6',
  amber: '#f08a24',
};

function mix(hex: string, to: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

type Draw = (c: string, l: string, d: string) => string;

const ANIMALS: Record<string, Draw> = {
  crane: (c, l, d) =>
    `<polygon points="32,30 12,8 26,40" fill="${l}"/><polygon points="32,30 54,6 38,40" fill="${c}"/>` +
    `<polygon points="44,43 60,24 40,40" fill="${l}"/><polygon points="18,42 32,34 46,42 32,50" fill="${d}"/>` +
    `<polygon points="20,43 6,22 24,40" fill="${c}"/><polygon points="6,22 2,28 10,25" fill="${d}"/>`,
  fox: (c, l, d) =>
    `<polygon points="10,20 16,4 28,18" fill="${d}"/><polygon points="54,20 48,4 36,18" fill="${d}"/>` +
    `<polygon points="14,18 17,9 23,17" fill="${PAPER}"/><polygon points="50,18 47,9 41,17" fill="${PAPER}"/>` +
    `<polygon points="8,20 32,18 32,54" fill="${c}"/><polygon points="56,20 32,18 32,54" fill="${l}"/>` +
    `<polygon points="22,36 42,36 32,54" fill="${PAPER}"/><polygon points="29,50 35,50 32,55" fill="${INK}"/>` +
    `<rect x="20" y="28" width="5" height="5" fill="${INK}"/><rect x="39" y="28" width="5" height="5" fill="${INK}"/>`,
  frog: (c, l, d) =>
    `<polygon points="4,54 16,40 24,54" fill="${d}"/><polygon points="60,54 48,40 40,54" fill="${d}"/>` +
    `<polygon points="10,48 32,20 32,54" fill="${c}"/><polygon points="54,48 32,20 32,54" fill="${l}"/>` +
    `<polygon points="24,48 40,48 32,54" fill="${PAPER}"/>` +
    `<circle cx="22" cy="22" r="7" fill="${c}"/><circle cx="42" cy="22" r="7" fill="${l}"/>` +
    `<circle cx="22" cy="22" r="3.5" fill="${PAPER}"/><circle cx="42" cy="22" r="3.5" fill="${PAPER}"/>` +
    `<circle cx="22" cy="22" r="1.8" fill="${INK}"/><circle cx="42" cy="22" r="1.8" fill="${INK}"/>` +
    `<path d="M25 38Q32 43 39 38" stroke="${INK}" stroke-width="2" fill="none"/>`,
  whale: (c, l, d) =>
    `<path d="M26 19V11M26 13l-5-5M26 13l5-5" stroke="${l}" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
    `<polygon points="48,34 62,20 56,36" fill="${l}"/><polygon points="48,34 62,46 56,36" fill="${d}"/>` +
    `<polygon points="4,36 16,22 42,22 50,36" fill="${c}"/><polygon points="4,36 50,36 38,46 14,46" fill="${d}"/>` +
    `<polygon points="12,40 40,40 34,46 16,46" fill="${PAPER}"/><circle cx="16" cy="31" r="2.2" fill="${INK}"/>`,
  owl: (c, l, d) =>
    `<polygon points="14,20 12,6 26,16" fill="${d}"/><polygon points="50,20 52,6 38,16" fill="${d}"/>` +
    `<polygon points="14,16 32,14 32,58 12,40" fill="${c}"/><polygon points="50,16 32,14 32,58 52,40" fill="${l}"/>` +
    `<polygon points="24,42 40,42 32,56" fill="${PAPER}"/>` +
    `<circle cx="24" cy="27" r="7" fill="${PAPER}"/><circle cx="40" cy="27" r="7" fill="${PAPER}"/>` +
    `<circle cx="24" cy="27" r="3" fill="${INK}"/><circle cx="40" cy="27" r="3" fill="${INK}"/>` +
    `<polygon points="29,33 35,33 32,39" fill="${INK}"/>`,
  rabbit: (c, l) =>
    `<polygon points="22,32 16,2 30,28" fill="${c}"/><polygon points="42,32 48,2 34,28" fill="${l}"/>` +
    `<polygon points="22,26 19,10 26,25" fill="${PAPER}"/><polygon points="42,26 45,10 38,25" fill="${PAPER}"/>` +
    `<polygon points="12,42 32,26 32,58" fill="${c}"/><polygon points="52,42 32,26 32,58" fill="${l}"/>` +
    `<rect x="22" y="38" width="4" height="5" fill="${INK}"/><rect x="38" y="38" width="4" height="5" fill="${INK}"/>` +
    `<polygon points="29,47 35,47 32,51" fill="${INK}"/>`,
  turtle: (c, l, d) =>
    `<polygon points="14,40 8,52 20,46" fill="${d}"/><polygon points="44,40 50,52 38,46" fill="${d}"/>` +
    `<polygon points="8,37 2,40 8,43" fill="${d}"/><polygon points="48,32 60,29 60,40 48,40" fill="${d}"/>` +
    `<circle cx="56" cy="33" r="1.8" fill="${INK}"/>` +
    `<polygon points="8,40 18,22 32,18 32,40" fill="${c}"/><polygon points="50,40 44,22 32,18 32,40" fill="${l}"/>` +
    `<polygon points="20,40 26,28 38,28 44,40" fill="${d}" opacity="0.35"/><rect x="6" y="40" width="46" height="4" fill="${d}"/>`,
  swan: (c, l) =>
    `<polygon points="6,44 28,34 56,40 44,54 16,54" fill="${c}"/><polygon points="24,40 52,26 46,48" fill="${l}"/>` +
    `<polygon points="14,46 12,14 18,12 22,42" fill="${c}"/><polygon points="12,14 18,8 24,12 18,15" fill="${l}"/>` +
    `<polygon points="24,12 31,15 22,15" fill="${INK}"/><circle cx="17" cy="12" r="1.5" fill="${INK}"/>`,
};

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** The avatar's colour and its SVG inner markup (64 by 64), from a pseudonym. */
export function avatarOf(pseudonym: string): { colour: string; inner: string } {
  const words = pseudonym.toLowerCase().split(/\s+/u);
  const h = hash(pseudonym);
  const colours = Object.values(COLOURS);
  const animals = Object.values(ANIMALS);
  // A name from an older list still gets one, picked from its letters.
  const colour = COLOURS[words[0] ?? ''] ?? colours[h % colours.length];
  const draw = ANIMALS[words[1] ?? ''] ?? animals[(h >> 3) % animals.length];
  const inner = `<rect width="64" height="64" fill="${mix(colour, PAPER, 0.8)}"/>${draw(colour, mix(colour, '#ffffff', 0.32), mix(colour, '#000000', 0.22))}`;
  return { colour, inner };
}

export function avatarSvg(pseudonym: string, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${avatarOf(pseudonym).inner}</svg>`;
}
