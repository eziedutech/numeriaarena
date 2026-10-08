/**
 * Measure Hunt's banner on the desk menu: a wide orange card, separate from
 * the other games' chips, with a paper cube measured by pins and a thread, the
 * game's name and a line about it, a badge, and a ruler along its foot. Drawn
 * as an SVG for a canvas texture, like the Fold Town sticker.
 */

export const BANNER_W = 1120;
export const BANNER_H = 280;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function measureBanner(title: string, line: string, badge: string, width = BANNER_W): string {
  const height = (width * BANNER_H) / BANNER_W;
  const size = title.length > 11 ? 74 : 86;
  let ticks = '';
  for (let x = 40, i = 0; x < 1084; x += 20, i += 1) {
    ticks += `<line x1="${x}" y1="214" x2="${x}" y2="${i % 5 === 0 ? 244 : 232}" stroke="#b9531c" stroke-width="3" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 ${BANNER_W} ${BANNER_H}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mh-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7a064"/><stop offset="1" stop-color="#e0702f"/></linearGradient>
    <clipPath id="mh-in"><rect x="22" y="22" width="1076" height="236" rx="30"/></clipPath>
    <filter id="mh-sh" x="-5%" y="-10%" width="112%" height="140%"><feDropShadow dx="4" dy="8" stdDeviation="7" flood-color="#46321a" flood-opacity="0.34"/></filter>
  </defs>
  <g filter="url(#mh-sh)">
    <rect x="8" y="8" width="1104" height="264" rx="40" fill="#fffdf8"/>
  </g>
  <g clip-path="url(#mh-in)">
    <rect x="22" y="22" width="1076" height="236" fill="url(#mh-bg)"/>
    <rect x="22" y="208" width="1076" height="50" fill="#fff3da"/>
    ${ticks}
  </g>
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
  <g>
    <rect x="176" y="124" width="64" height="30" rx="6" fill="#fffdf8"/>
    <text x="208" y="146" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800" fill="#3a3f4b" text-anchor="middle">17 cm</text>
  </g>
  <text x="290" y="118" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="900" fill="#ffffff" stroke="#b9531c" stroke-width="7" paint-order="stroke" stroke-linejoin="round">${esc(title)}</text>
  <text x="293" y="170" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff3da">${esc(line)}</text>
  <g transform="rotate(-10 1008 100)">
    <circle cx="1008" cy="100" r="62" fill="#ffd23f" stroke="#fffdf8" stroke-width="7"/>
    <text x="1008" y="116" font-family="Segoe UI, Arial, sans-serif" font-size="${badge.length > 3 ? 32 : 44}" font-weight="900" fill="#7a4a00" text-anchor="middle">${esc(badge)}</text>
  </g>
</svg>`;
}
