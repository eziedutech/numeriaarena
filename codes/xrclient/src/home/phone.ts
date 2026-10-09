import { onPhone, upright } from '../phone-mode.js';
import { getLang } from '../settings.js';
import { el } from './paper.js';

/**
 * A phone is played sideways: held upright it gets a card asking to be
 * turned, and where the browser lets a page do it (Android, after a tap, in
 * full screen) the game turns itself. Goes by the size of the screen, never
 * by which browser or device it is. A computer, a tablet or a headset never
 * sees any of this.
 */

/** Wide enough for the smartboard race: 1024 pixels across, or a tablet held sideways. */
const WIDE = '(min-width: 1024px), (orientation: landscape) and (min-width: 900px) and (min-height: 600px)';

const TEXT = {
  en: {
    turnTitle: 'TURN YOUR PHONE SIDEWAYS',
    turnBody: 'Numeria Arena is played with the phone held sideways.',
    turns: 'FULL SCREEN',
    wideTitle: 'WIDE SCREEN NEEDED',
    wideBody: 'This part needs a wide screen (at least 1024 pixels). Open it on a laptop, projector or smartboard.',
    copy: 'COPY LINK',
    copied: 'LINK COPIED',
    close: 'CLOSE',
  },
  id: {
    turnTitle: 'PUTAR PONSELMU MENDATAR',
    turnBody: 'Numeria Arena dimainkan dengan ponsel dipegang mendatar.',
    turns: 'LAYAR PENUH',
    wideTitle: 'BUTUH LAYAR LEBAR',
    wideBody: 'Bagian ini butuh layar lebar (paling sedikit 1024 piksel). Buka di laptop, proyektor, atau smartboard.',
    copy: 'SALIN TAUTAN',
    copied: 'TAUTAN TERSALIN',
    close: 'TUTUP',
  },
};

const CSS = `
.screen-card-veil { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
  padding: 16px; box-sizing: border-box; background: rgba(58, 45, 20, 0.38);
  font-family: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif; color: #3a3f4b; }
.screen-card { background: #fff8ec; box-shadow: 3px 5px 10px rgba(70, 50, 25, 0.3); padding: 20px 22px; width: 420px;
  max-width: 100%; max-height: 100%; overflow-y: auto; box-sizing: border-box; text-align: center; }
.screen-card svg { display: block; width: 72px; margin: 0 auto 8px; fill: none; stroke: #3469c4; stroke-width: 3; stroke-linecap: round; }
.screen-card h2 { margin: 0 0 8px; font-size: 19px; letter-spacing: 0.04em; }
.screen-card p { margin: 8px 0; font-size: 16px; line-height: 1.45; }
.screen-card .soft { color: #5d6270; font-size: 15px; }
.screen-card button { display: block; width: 100%; min-height: 48px; margin-top: 12px; border: 0; cursor: pointer;
  font-family: inherit; font-weight: 700; font-size: 16px; line-height: 1.2; letter-spacing: 0.04em; box-shadow: 3px 5px 10px rgba(70, 50, 25, 0.3); }
.screen-card .go { background: #3469c4; color: #fff8ec; }
.screen-card .plain { background: #f1e3c4; color: #3a3f4b; }
.screen-card-veil.turn { z-index: 40; background: #e0c780; }
.screen-card .turn-phone { animation: turn-phone 2.4s ease-in-out infinite; transform-origin: 50% 50%; }
@keyframes turn-phone { 0%, 25% { transform: rotate(0deg); } 65%, 100% { transform: rotate(-90deg); } }
html.phone canvas { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
html.phone body { overscroll-behavior: none; }
`;

const ART = '<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="4" y="4" width="56" height="30" rx="3"/><path d="M24 38 H40"/></svg>';
/** An upright phone that turns onto its side, over and over. */
const TURN_ART =
  '<svg class="turn-phone" viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="8" width="20" height="40" rx="4"/><path d="M30 42 H34"/></svg>';

export function wideEnough(): boolean {
  return window.matchMedia(WIDE).matches;
}

type Lockable = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

/** Whether this browser lets a page turn itself sideways (Android does, after a tap in full screen; iPhone does not). */
function canTurn(): boolean {
  return typeof (screen.orientation as Lockable | undefined)?.lock === 'function' && typeof document.documentElement.requestFullscreen === 'function';
}

/** Full screen and held sideways. Only from a tap: the browser refuses it otherwise. */
async function turnSideways(): Promise<void> {
  if (!canTurn()) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await (screen.orientation as Lockable).lock!('landscape');
  } catch {
    // Refused (not allowed here, or the player left full screen): the game plays as it is.
  }
}

function ensureCss(): void {
  if (document.getElementById('screen-card-css')) return;
  const style = el('style', '', document.head);
  style.id = 'screen-card-css';
  style.textContent = CSS;
}

function card(): { veil: HTMLElement; body: HTMLElement } {
  ensureCss();
  const veil = el('div', 'screen-card-veil', document.body);
  const body = el('div', 'screen-card', veil);
  body.setAttribute('role', 'dialog');
  body.innerHTML = ART;
  return { veil, body };
}

function button(body: HTMLElement, cls: string, text: string, onClick: (b: HTMLButtonElement) => void): void {
  const b = el('button', cls, body);
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', () => onClick(b));
}

let started = false;

/**
 * On a phone: held upright, the card asking to turn it sideways covers the
 * game; held sideways, the first tap anywhere also takes the full screen
 * where the browser allows it. Started once; called again, it does nothing.
 */
export function phoneNotice(): void {
  if (started || !onPhone()) return;
  started = true;
  ensureCss();
  document.documentElement.classList.add('phone');
  const t = TEXT[getLang()];
  let veil: HTMLElement | undefined;
  const check = (): void => {
    if (upright()) {
      if (!veil) {
        const made = card();
        veil = made.veil;
        veil.classList.add('turn');
        made.body.setAttribute('aria-label', t.turnTitle);
        made.body.querySelector('svg')?.remove();
        made.body.insertAdjacentHTML('afterbegin', TURN_ART);
        el('h2', '', made.body).textContent = t.turnTitle;
        el('p', '', made.body).textContent = t.turnBody;
        if (canTurn()) button(made.body, 'go', t.turns, () => void turnSideways());
      }
    } else if (veil) {
      veil.remove();
      veil = undefined;
    }
  };
  check();
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', check);
  if (canTurn()) window.addEventListener('pointerdown', () => void turnSideways(), { once: true, capture: true });
}

/** In place of a part made for a projector or smartboard on a narrow screen: where to open it, and the link to copy. */
export function wideNotice(): void {
  const t = TEXT[getLang()];
  const { veil, body } = card();
  body.setAttribute('aria-label', t.wideTitle);
  el('h2', '', body).textContent = t.wideTitle;
  el('p', '', body).textContent = t.wideBody;
  button(body, 'go', t.copy, (b) => {
    void navigator.clipboard?.writeText(window.location.href).then(
      () => {
        b.textContent = t.copied;
        setTimeout(() => (b.textContent = t.copy), 1600);
      },
      () => undefined,
    );
  });
  button(body, 'plain', t.close, () => veil.remove());
  veil.addEventListener('click', (e) => {
    if (e.target === veil) veil.remove();
  });
}
