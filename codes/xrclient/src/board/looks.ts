import { el } from '../home/paper.js';

/**
 * The three looks of a smartboard question: animals walking across a meadow
 * with the answers on signs, balloons rising through a sky with drifting
 * clouds, and glowing orbs circling in a night of stars. The looks cross over
 * the columns (question 1 is animals, balloons and orbs from left to right,
 * question 2 balloons, orbs and animals, and so on), so in three rounds every
 * player meets every look as often. In every look the three answers stay in
 * view the whole time, each in a lane of its own, moving slowly.
 */

export type Look = 'animal' | 'balloon' | 'orb';
export const LOOKS: readonly Look[] = ['animal', 'balloon', 'orb'];

/** The look of question `n` in column `column`. */
export const lookOf = (n: number, column: number): Look => LOOKS[(n + column) % LOOKS.length];

/** The scene's size inside a column, in stage pixels. */
const W = 504;
const FIELD_TOP = 150;
const FIELD_H = 576;

const WALK = 4.6;
const RISE = 5.2;
const ORBIT = 7;

export const LOOKS_CSS = `
#board .scene { position: relative; flex: 1 1 auto; overflow: hidden; }
#board .scene .ask { position: absolute; left: 16px; right: 16px; top: 14px; height: 118px; box-sizing: border-box; padding: 10px 16px;
  display: flex; align-items: center; justify-content: center; text-align: center; background: #fff8ec; z-index: 2;
  font-size: 36px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
#board .scene .field { position: absolute; left: 0; right: 0; top: ${FIELD_TOP}px; height: ${FIELD_H}px; z-index: 1; }
#board .deco, #board .deco * { pointer-events: none; }
#board .deco { position: absolute; inset: 0; }

#board .scene.animal { background: linear-gradient(#bfe3f5 0, #e6f5fb 140px, #a5d98c 140px, #86c873 100%); }
#board .scene.animal .deco::before { content: ''; position: absolute; left: -40px; right: -40px; top: 112px; height: 70px;
  background: radial-gradient(ellipse 140px 40px at 20% 100%, #96d27f 98%, transparent), radial-gradient(ellipse 180px 46px at 75% 100%, #8fcd78 98%, transparent); }
#board .scene.animal .path { position: absolute; left: 0; right: 0; height: 30px; background: #9fd07f; border-radius: 15px; }
#board .scene.animal .sun { position: absolute; right: 26px; top: -30px; width: 90px; height: 90px; border-radius: 50%; background: #ffd75e;
  box-shadow: 0 0 0 14px rgba(255, 215, 94, 0.3); animation: board-sun 6s ease-in-out infinite alternate; }

#board .scene.balloon { background: linear-gradient(#6fbcec, #c8e8fb); }
#board .cloud { position: absolute; width: 130px; height: 40px; background: #fff; border-radius: 20px; opacity: 0.85; animation: board-drift linear infinite; }
#board .cloud::before, #board .cloud::after { content: ''; position: absolute; background: #fff; border-radius: 50%; }
#board .cloud::before { width: 54px; height: 54px; left: 20px; top: -26px; }
#board .cloud::after { width: 40px; height: 40px; left: 62px; top: -16px; }

#board .scene.orb { background: radial-gradient(ellipse at 30% 15%, #5a4aa8, #231f52 60%, #15132f); }
#board .stars { position: absolute; inset: 0; background-size: 170px 170px; animation: board-twinkle 3s ease-in-out infinite alternate; }
#board .stars.a { background-image: radial-gradient(2px 2px at 20px 30px, #fff, transparent), radial-gradient(2px 2px at 120px 90px, #fff, transparent),
  radial-gradient(1.5px 1.5px at 70px 140px, #fff, transparent); }
#board .stars.b { background-image: radial-gradient(2px 2px at 60px 60px, #ffe9a8, transparent), radial-gradient(1.5px 1.5px at 150px 20px, #fff, transparent),
  radial-gradient(2px 2px at 100px 160px, #cfe0ff, transparent); background-size: 230px 230px; animation-delay: -1.5s; }

#board .tgt { position: absolute; padding: 0; background: none; touch-action: none; will-change: transform; }
#board .tgt .face { position: relative; display: flex; flex-direction: column; align-items: center; }
#board .tgt .txt { font-weight: 700; white-space: nowrap; }

#board .tgt.animal { left: 10px; animation: board-walk ${WALK}s ease-in-out infinite alternate; }
#board .tgt.animal .sign { background: #fff8ec; padding: 6px 16px; min-width: 96px; box-sizing: border-box; text-align: center;
  box-shadow: 3px 5px 8px rgba(70, 50, 25, 0.3); position: relative; z-index: 1; }
#board .tgt.animal .sign::after { content: ''; position: absolute; left: 50%; bottom: -16px; width: 6px; height: 16px; margin-left: -3px; background: #9a6b3c; }
#board .tgt.animal svg { display: block; width: 160px; height: 110px; margin-top: 4px; animation: board-flip ${WALK * 2}s step-end infinite; }
#board .tgt .leg { transform-box: fill-box; transform-origin: 50% 0; animation: board-step 0.5s ease-in-out infinite alternate; }
#board .tgt .leg.b { animation-delay: -0.5s; }

#board .tgt.balloon { top: 8px; animation: board-rise ${RISE}s ease-in-out infinite alternate; }
#board .tgt.balloon svg { display: block; width: 140px; height: 210px; transform-origin: 50% 100%; animation: board-wobble 2.4s ease-in-out infinite alternate; }
#board .tgt.balloon .txt { position: absolute; left: 0; right: 0; top: 52px; text-align: center; color: #fff; text-shadow: 0 2px 4px rgba(40, 30, 20, 0.45); }

#board .tgt.orb { animation: board-orbit ${ORBIT}s linear infinite; }
#board .tgt.orb .face { width: 140px; height: 140px; border-radius: 50%; justify-content: center; }
#board .tgt.orb .glow { position: absolute; inset: -18px; border-radius: 50%; animation: board-glow 1.8s ease-in-out infinite alternate; }
#board .tgt.orb .ball { position: absolute; inset: 0; border-radius: 50%; }
#board .tgt.orb .txt { position: relative; color: #fff; text-shadow: 0 2px 5px rgba(20, 10, 50, 0.7); }

#board .field.still .tgt, #board .field.still .tgt svg, #board .field.still .leg, #board .field.still .glow { animation-play-state: paused; }
#board .tgt.yes .face { filter: drop-shadow(0 0 10px #ffe066) drop-shadow(0 0 4px #ffd23a); animation: board-hop 0.45s ease-out; }
#board .tgt.balloon.yes.hit .face, #board .tgt.orb.yes.hit .face { animation: board-pop 0.42s ease-out forwards; }
#board .tgt.no .face { filter: grayscale(0.85) opacity(0.65); animation: board-shake 0.4s ease-in-out; }

@keyframes board-walk { to { transform: translateX(${W - 170 - 20}px); } }
@keyframes board-flip { 0% { transform: none; } 50% { transform: scaleX(-1); } 100% { transform: scaleX(-1); } }
@keyframes board-step { from { transform: rotate(-14deg); } to { transform: rotate(14deg); } }
@keyframes board-rise { from { transform: translateY(${FIELD_H - 210 - 16}px); } to { transform: translateY(0); } }
@keyframes board-wobble { from { transform: rotate(-5deg); } to { transform: rotate(5deg); } }
@keyframes board-orbit { from { transform: rotate(0deg) translateX(46px) rotate(0deg); } to { transform: rotate(360deg) translateX(46px) rotate(-360deg); } }
@keyframes board-glow { from { opacity: 0.35; transform: scale(0.92); } to { opacity: 0.8; transform: scale(1.04); } }
@keyframes board-drift { from { transform: translateX(-180px); } to { transform: translateX(${W + 60}px); } }
@keyframes board-twinkle { from { opacity: 0.35; } to { opacity: 1; } }
@keyframes board-sun { to { transform: scale(1.06); } }
@keyframes board-hop { 40% { transform: translateY(-26px); } }
@keyframes board-pop { 40% { transform: scale(1.25); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes board-shake { 20%, 60% { transform: translateX(-9px); } 40%, 80% { transform: translateX(9px); } }

@media (prefers-reduced-motion: reduce) {
  #board .tgt, #board .tgt svg, #board .leg, #board .glow, #board .cloud, #board .stars, #board .sun { animation: none !important; }
}
`;

const ANIMALS = [
  // An elephant.
  `<path d="M24 52 Q12 60 14 74" stroke="#6f7a8f" stroke-width="5" fill="none" stroke-linecap="round"/>
   <rect class="leg a" x="36" y="74" width="15" height="32" rx="6" fill="#7d879c"/><rect class="leg b" x="54" y="74" width="15" height="32" rx="6" fill="#7d879c"/>
   <rect class="leg b" x="86" y="74" width="15" height="32" rx="6" fill="#7d879c"/><rect class="leg a" x="104" y="74" width="15" height="32" rx="6" fill="#7d879c"/>
   <ellipse cx="74" cy="58" rx="50" ry="32" fill="#9aa4b8"/>
   <circle cx="124" cy="46" r="24" fill="#9aa4b8"/><ellipse cx="110" cy="46" rx="13" ry="19" fill="#7d879c"/>
   <path d="M142 52 Q154 72 146 94" stroke="#9aa4b8" stroke-width="11" fill="none" stroke-linecap="round"/>
   <circle cx="131" cy="39" r="3.5" fill="#3a3f4b"/>`,
  // A pig.
  `<path d="M28 54 q-12 -6 -7 -15 q7 -4 7 4" stroke="#e48aa0" stroke-width="4" fill="none" stroke-linecap="round"/>
   <rect class="leg a" x="40" y="76" width="13" height="26" rx="5" fill="#e48aa0"/><rect class="leg b" x="56" y="76" width="13" height="26" rx="5" fill="#e48aa0"/>
   <rect class="leg b" x="88" y="76" width="13" height="26" rx="5" fill="#e48aa0"/><rect class="leg a" x="104" y="76" width="13" height="26" rx="5" fill="#e48aa0"/>
   <ellipse cx="76" cy="62" rx="48" ry="30" fill="#f6adc0"/>
   <path d="M110 38 L116 18 L128 34 Z" fill="#e48aa0"/><circle cx="124" cy="54" r="23" fill="#f6adc0"/>
   <ellipse cx="144" cy="58" rx="10" ry="9" fill="#e48aa0"/><circle cx="141" cy="57" r="2" fill="#a8546b"/><circle cx="147" cy="57" r="2" fill="#a8546b"/>
   <circle cx="128" cy="46" r="3.5" fill="#3a3f4b"/>`,
  // A sheep.
  `<rect class="leg a" x="44" y="74" width="9" height="30" rx="4" fill="#4a4b5a"/><rect class="leg b" x="58" y="74" width="9" height="30" rx="4" fill="#4a4b5a"/>
   <rect class="leg b" x="88" y="74" width="9" height="30" rx="4" fill="#4a4b5a"/><rect class="leg a" x="102" y="74" width="9" height="30" rx="4" fill="#4a4b5a"/>
   <g fill="#fbf6ec"><circle cx="50" cy="58" r="21"/><circle cx="74" cy="46" r="23"/><circle cx="98" cy="56" r="21"/><circle cx="76" cy="70" r="22"/>
   <circle cx="52" cy="72" r="16"/><circle cx="100" cy="72" r="16"/></g>
   <ellipse cx="126" cy="52" rx="16" ry="21" fill="#4a4b5a"/><ellipse cx="112" cy="42" rx="9" ry="4.5" fill="#4a4b5a"/>
   <circle cx="131" cy="46" r="3" fill="#fff"/>`,
];

const BALLOONS = ['#f2716b', '#3469c4', '#3fb6a0', '#f0a92e', '#9b6bd6'];
const ORBS = [
  ['#ffd36b', '#e0802c'],
  ['#7fe3ff', '#2a76d6'],
  ['#ff9be0', '#b0389a'],
  ['#9dffb0', '#2ea36b'],
];

/** Lanes that never cross: rows for animals, columns for balloons, three corners for orbs. */
const ORB_AT: [number, number][] = [
  [130, 125],
  [374, 288],
  [130, 451],
];

const fontFor = (text: string, big: number) => (text.length > 7 ? big - 12 : text.length > 5 ? big - 6 : big);

/** The look's moving background, behind the question. */
export function decorate(scene: HTMLElement, look: Look, next: () => number): void {
  const deco = el('div', 'deco', scene);
  if (look === 'animal') {
    el('div', 'sun', deco);
    for (let lane = 0; lane < 3; lane++) {
      const path = el('div', 'path', deco);
      path.style.top = `${FIELD_TOP + lane * 192 + 158}px`;
    }
  } else if (look === 'balloon') {
    for (let n = 0; n < 4; n++) {
      const cloud = el('div', 'cloud', deco);
      const time = 26 + next() * 16;
      cloud.style.top = `${40 + n * 170 + next() * 60}px`;
      cloud.style.animationDuration = `${time}s`;
      cloud.style.animationDelay = `${-next() * time}s`;
      cloud.style.scale = String(0.7 + next() * 0.6);
    }
  } else {
    el('div', 'stars a', deco);
    el('div', 'stars b', deco);
  }
}

/**
 * An answer in the look, in lane `lane` of three. `phase` from 0 to 1 sets
 * where on its way it starts, so the columns never move alike.
 */
export function target(field: HTMLElement, look: Look, lane: number, text: string, phase: number, next: () => number): HTMLButtonElement {
  const b = el('button', `tgt ${look}`, field);
  b.setAttribute('aria-label', text);
  const face = el('div', 'face', b);
  if (look === 'animal') {
    b.style.top = `${lane * 192 + 6}px`;
    const delay = `${-phase * WALK * 2}s`;
    b.style.animationDelay = delay;
    const sign = el('div', 'sign', face);
    const txt = el('span', 'txt', sign);
    txt.textContent = text;
    txt.style.fontSize = `${fontFor(text, 38)}px`;
    face.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 160 110" aria-hidden="true">${ANIMALS[lane]}</svg>`);
    (face.lastElementChild as SVGElement).style.animationDelay = delay;
  } else if (look === 'balloon') {
    b.style.left = `${lane * 168 + 14}px`;
    b.style.animationDelay = `${-phase * RISE * 2}s`;
    const color = BALLOONS[Math.floor(next() * BALLOONS.length)];
    face.insertAdjacentHTML(
      'beforeend',
      `<svg viewBox="0 0 140 210" aria-hidden="true">
        <path d="M70 158 q-12 18 0 26 q12 8 0 26" stroke="#7a6f5c" stroke-width="2.5" fill="none"/>
        <path d="M63 150 L77 150 L70 160 Z" fill="${color}"/>
        <ellipse cx="70" cy="78" rx="62" ry="74" fill="${color}"/>
        <ellipse cx="46" cy="48" rx="12" ry="22" fill="#fff" opacity="0.35" transform="rotate(20 46 48)"/>
      </svg>`,
    );
    (face.lastElementChild as SVGElement).style.animationDelay = `${-next() * 2.4}s`;
    const txt = el('span', 'txt', face);
    txt.textContent = text;
    txt.style.fontSize = `${fontFor(text, 40)}px`;
  } else {
    const [x, y] = ORB_AT[lane];
    b.style.left = `${x - 70}px`;
    b.style.top = `${y - 70}px`;
    b.style.animationDelay = `${-phase * ORBIT}s`;
    const [light, deep] = ORBS[Math.floor(next() * ORBS.length)];
    const glow = el('div', 'glow', face);
    glow.style.background = `radial-gradient(circle, ${light}aa 40%, transparent 70%)`;
    glow.style.animationDelay = `${-next() * 1.8}s`;
    const ball = el('div', 'ball', face);
    ball.style.background = `radial-gradient(circle at 34% 30%, #fff 0, ${light} 28%, ${deep} 100%)`;
    const txt = el('span', 'txt', face);
    txt.textContent = text;
    txt.style.fontSize = `${fontFor(text, 40)}px`;
  }
  return b;
}
