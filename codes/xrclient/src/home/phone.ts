import { getLang } from '../settings.js';
import { el } from './paper.js';

/**
 * A phone or a narrow screen: the home page and the desk are laid out for a
 * wide screen, so a phone gets a card saying so once a visit, and turns the
 * game sideways for itself where the browser lets a page do that. Goes by
 * the size of the screen, never by which browser or device it is.
 */

/** Wide enough for the smartboard race: 1024 pixels across, or a tablet held sideways. */
const WIDE = '(min-width: 1024px), (orientation: landscape) and (min-width: 900px) and (min-height: 600px)';
/** A phone: its screen's short side under 600 pixels, whichever way it is held. */
const PHONE_SIDE = 600;
const SEEN = 'numeria.phoneCard';

const TEXT = {
  en: {
    phoneTitle: 'BEST ON A WIDE SCREEN OR HEADSET',
    phoneBody: 'On a phone the desk and its writing are small. A laptop, tablet, smartboard or headset shows them best.',
    turns: 'The game turns sideways and fills the screen.',
    turnYourself: 'Turn your phone sideways for a bigger desk.',
    continue: 'CONTINUE ANYWAY',
    wideTitle: 'WIDE SCREEN NEEDED',
    wideBody: 'This part needs a wide screen (at least 1024 pixels). Open it on a laptop, projector or smartboard.',
    copy: 'COPY LINK',
    copied: 'LINK COPIED',
    close: 'CLOSE',
  },
  id: {
    phoneTitle: 'PALING NYAMAN DI LAYAR LEBAR ATAU HEADSET',
    phoneBody: 'Di ponsel meja dan tulisannya kecil. Laptop, tablet, smartboard, atau headset menampilkannya paling baik.',
    turns: 'Game berputar mendatar dan memenuhi layar.',
    turnYourself: 'Putar ponselmu mendatar supaya meja lebih besar.',
    continue: 'LANJUTKAN SAJA',
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
`;

const ART = '<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="4" y="4" width="56" height="30" rx="3"/><path d="M24 38 H40"/></svg>';

export function wideEnough(): boolean {
  return window.matchMedia(WIDE).matches;
}

function onPhone(): boolean {
  return Math.min(screen.width, screen.height) < PHONE_SIDE;
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

function card(): { veil: HTMLElement; body: HTMLElement } {
  if (!document.getElementById('screen-card-css')) {
    const style = el('style', '', document.head);
    style.id = 'screen-card-css';
    style.textContent = CSS;
  }
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

let checked = false;

/**
 * On a phone, once a visit: the card saying the game is best on a wide screen,
 * whose CONTINUE ANYWAY also turns the game sideways where it can. Later in
 * the same visit (the page opened again) the first tap anywhere does that.
 */
export function phoneNotice(): void {
  if (checked || !onPhone()) return;
  checked = true;
  let seen = false;
  try {
    seen = sessionStorage.getItem(SEEN) === '1';
  } catch {
    // No storage: shown every time.
  }
  if (seen) {
    if (canTurn()) window.addEventListener('pointerdown', () => void turnSideways(), { once: true, capture: true });
    return;
  }
  const t = TEXT[getLang()];
  const { veil, body } = card();
  body.setAttribute('aria-label', t.phoneTitle);
  el('h2', '', body).textContent = t.phoneTitle;
  el('p', '', body).textContent = t.phoneBody;
  el('p', 'soft', body).textContent = canTurn() ? t.turns : t.turnYourself;
  button(body, 'go', t.continue, () => {
    try {
      sessionStorage.setItem(SEEN, '1');
    } catch {
      // No storage.
    }
    veil.remove();
    void turnSideways();
  });
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
