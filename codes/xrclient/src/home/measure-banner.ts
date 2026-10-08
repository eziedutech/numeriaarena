/**
 * Measure Hunt's card on the desk menu: an orange square-cornered card, apart
 * from the other games' chips, with a paper cube measured by pins and a thread,
 * the game's name and a line about it, a badge, and a ruler along its foot.
 * Drawn as an SVG for a canvas texture, like the Fold Town sticker.
 */

export const BANNER_W = 900;
export const BANNER_H = 600;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The words broken at spaces into at most two lines of about `per` letters. */
function lines(text: string, per: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if (line && line.length + 1 + w.length > per) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

export function measureBanner(title: string, line: string, badge: string, width = BANNER_W): string {
  const height = (width * BANNER_H) / BANNER_W;
  const words = title.split(' ');
  const head = words.length > 1 ? [words[0], words.slice(1).join(' ')] : [title];
  const longest = Math.max(...head.map((h) => h.length));
  const size = longest > 7 ? 78 : 92;
  let ticks = '';
  for (let x = 50, i = 0; x < 860; x += 20, i += 1) {
    ticks += `<line x1="${x}" y1="476" x2="${x}" y2="${i % 5 === 0 ? 514 : 498}" stroke="#b9531c" stroke-width="4"/>`;
  }
  const titleSvg = head
    .map(
      (h, i) =>
        `<text x="400" y="${215 + i * 92}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="900" fill="#ffffff" stroke="#b9531c" stroke-width="8" paint-order="stroke" stroke-linejoin="miter">${esc(h)}</text>`,
    )
    .join('');
  const lineSvg = lines(line, 20)
    .slice(0, 2)
    .map(
      (l, i) =>
        `<text x="403" y="${(head.length > 1 ? 392 : 300) + i * 44}" font-family="Segoe UI, Arial, sans-serif" font-size="36" font-weight="700" fill="#fff3da">${esc(l)}</text>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${BANNER_W} ${BANNER_H}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mh-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7a064"/><stop offset="1" stop-color="#e0702f"/></linearGradient>
    <filter id="mh-sh" x="-5%" y="-5%" width="115%" height="120%"><feDropShadow dx="5" dy="9" stdDeviation="8" flood-color="#46321a" flood-opacity="0.34"/></filter>
  </defs>
  <g filter="url(#mh-sh)">
    <rect x="8" y="8" width="870" height="568" fill="#fffdf8"/>
  </g>
  <rect x="26" y="26" width="834" height="532" fill="url(#mh-bg)"/>
  <rect x="26" y="462" width="834" height="96" fill="#fff3da"/>
  ${ticks}
  <g transform="translate(-130 52) scale(2.1)">
    <g stroke="#3a3f4b" stroke-width="3.5" stroke-linejoin="round">
      <polygon points="170,38 232,70 170,102 108,70" fill="#fffaf0"/>
      <polygon points="108,70 170,102 170,170 108,138" fill="#f3dfb8"/>
      <polygon points="170,102 232,70 232,138 170,170" fill="#e6c995"/>
    </g>
    <g stroke="#2f6fe0" stroke-width="7" stroke-linecap="round">
      <line x1="170" y1="102" x2="108" y2="70"/>
      <line x1="170" y1="102" x2="232" y2="70"/>
      <line x1="170" y1="102" x2="170" y2="170"/>
    </g>
    <g fill="#e53935" stroke="#fffdf8" stroke-width="3">
      <circle cx="170" cy="102" r="10"/><circle cx="108" cy="70" r="10"/><circle cx="232" cy="70" r="10"/><circle cx="170" cy="170" r="10"/>
    </g>
    <rect x="176" y="124" width="64" height="30" fill="#fffdf8"/>
    <text x="208" y="146" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800" fill="#3a3f4b" text-anchor="middle">17 cm</text>
  </g>
  ${titleSvg}
  ${lineSvg}
  <rect x="690" y="26" width="170" height="78" fill="#ffd23f"/>
  <text x="775" y="80" font-family="Segoe UI, Arial, sans-serif" font-size="${badge.length > 3 ? 42 : 52}" font-weight="900" fill="#7a4a00" text-anchor="middle">${esc(badge)}</text>
</svg>`;
}
