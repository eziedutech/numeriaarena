import { Quaternion, Vector3, type PerspectiveCamera } from '@iwsdk/core';

import { drawGlyphs, glyphWidth, whenGlyphsLoad } from '../art/glyphs.js';
import { HOME_TEXT, type HomeText, type Lang } from './home-text.js';
import { townSticker } from './town-sticker.js';

/**
 * The home page: a flat paper page over the browser view of the book. Where
 * to play and the language at the top, ways to play on the left, sign-in and
 * information on the right, and a footer below. Shown outside the headset
 * only.
 */
export type Device = 'computer' | 'xr' | 'smartboard';
export type PlayMode = 'practice' | 'race';

const INK = '#3a3f4b';
const PAPER = '#fff8ec';
const COLORS = { teal: '#3fb6a0', cobalt: '#3469c4', coral: '#f2716b', violet: '#b198ea', sun: '#e8b64c' };
/** The page is laid out on this stage and scaled to fit the window. */
/** Shown in the footer. */
const VERSION = 'v0.4';
const STAGE_W = 1600;
const STAGE_H = 900;
/** Where the camera looks from while the home page is up: close to the book. */
const HOME_EYE = new Vector3(0, 1.06, 0.2);
const HOME_AT = new Vector3(0, 0.95, -0.22);

const ICONS: Record<string, string> = {
  practice: '<rect width="54" height="54" fill="#fff8ec"/><path d="M27 8 32 22 47 22 35 31 39 46 27 37 15 46 19 31 7 22 22 22z" fill="#3fb6a0"/><path d="M27 8 32 22 47 22 35 31 39 46 27 37z" fill="#2f8f7d"/>',
  robots: '<rect width="54" height="54" fill="#fff8ec"/><rect x="25.5" y="7" width="3" height="9" fill="#3a3f4b"/><rect x="21" y="5" width="12" height="4" fill="#3469c4"/><rect x="11" y="16" width="32" height="26" fill="#3469c4"/><path d="M27 16h16v26H27z" fill="#2a54a0"/><rect x="18" y="24" width="6" height="6" fill="#fff8ec"/><rect x="30" y="24" width="6" height="6" fill="#fff8ec"/><rect x="20" y="34" width="14" height="3" fill="#fff8ec"/>',
  classmates: '<rect width="54" height="54" fill="#fff8ec"/><circle cx="18" cy="17" r="7" fill="#f2716b"/><path d="M6 46 10 28h16l4 18z" fill="#f2716b"/><circle cx="36" cy="17" r="7" fill="#c9554f"/><path d="M24 46 28 28h16l4 18z" fill="#c9554f"/>',
  smartboard: '<rect width="54" height="54" fill="#fff8ec"/><rect x="7" y="9" width="40" height="27" fill="#b198ea"/><path d="M27 9h20v27H27z" fill="#8f76c9"/><rect x="25" y="36" width="4" height="9" fill="#3a3f4b"/><rect x="16" y="44" width="22" height="3" fill="#3a3f4b"/>',
  student: '<rect width="54" height="54" fill="#e8b64c"/><path d="M8 18h38v18H8z" fill="#fff8ec"/><path d="M27 18h19v18H27z" fill="#f3e6c9"/><rect x="13" y="24" width="5" height="6" fill="#3a3f4b"/><rect x="22" y="24" width="5" height="6" fill="#3a3f4b"/><rect x="31" y="24" width="5" height="6" fill="#3a3f4b"/>',
  teacher: '<rect width="54" height="54" fill="#3469c4"/><path d="M9 14h17v28H9z" fill="#fff8ec"/><path d="M28 14h17v28H28z" fill="#f3e6c9"/><rect x="26" y="12" width="2" height="32" fill="#3a3f4b"/><rect x="13" y="20" width="9" height="2" fill="#3469c4"/><rect x="13" y="25" width="9" height="2" fill="#3469c4"/>',
  tips: '<rect width="54" height="54" fill="#3fb6a0"/><circle cx="27" cy="22" r="12" fill="#fff8ec"/><path d="M27 10a12 12 0 0 1 0 24z" fill="#f3e6c9"/><rect x="21" y="34" width="12" height="4" fill="#fff8ec"/><rect x="22" y="40" width="10" height="4" fill="#f3e6c9"/>',
  watch: '<rect width="54" height="54" fill="#b198ea"/><path d="M5 27q22-20 44 0q-22 20-44 0z" fill="#fff8ec"/><path d="M27 12q11 3 22 15q-11 12-22 15z" fill="#f3e6c9"/><circle cx="27" cy="27" r="7" fill="#3a3f4b"/>',
};

const SYMBOLS = [
  '<path d="M17 3 21 13 32 13 23 20 26 31 17 24 8 31 11 20 2 13 13 13z" fill="#e8b64c"/>',
  '<circle cx="17" cy="17" r="12" fill="#3469c4"/>',
  '<path d="M17 4 31 30H3z" fill="#3fb6a0"/>',
  '<rect x="5" y="5" width="24" height="24" fill="#f2716b"/>',
  '<path d="M17 30C3 20 3 8 10 6c4-1 6 2 7 4 1-2 3-5 7-4 7 2 7 14-7 24z" fill="#f2716b"/>',
  '<path d="M4 22q13-22 26 0z" fill="#e8b64c"/>',
  '<path d="M17 3 31 17 17 31 3 17z" fill="#b198ea"/>',
  '<path d="M6 8h22v6H6zM6 20h22v6H6z" fill="#3469c4"/>',
  '<path d="M13 4h8v9h9v8h-9v9h-8v-9H4v-8h9z" fill="#3fb6a0"/>',
];

const CSS = `
#home { position: fixed; inset: 0; z-index: 5; pointer-events: none; overflow: hidden;
  font-family: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif; color: ${INK}; }
#home .stage { position: absolute; left: 0; top: 0; width: ${STAGE_W}px; height: ${STAGE_H}px; transform-origin: 0 0; }
#home .stage > * { pointer-events: auto; }
#home .title { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); width: 430px; }
#home .shadow { box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.32); }
#home .tabs { position: absolute; left: 50%; top: 112px; transform: translateX(-50%); display: flex; }
#home .tab { padding: 10px 18px; background: ${PAPER}; display: flex; align-items: center; cursor: pointer; border: 0; }
#home .tab.label { cursor: default; }
#home .tab.on { background: ${COLORS.teal}; }
#home .tab.off { opacity: 0.45; cursor: not-allowed; }
#home .chips { position: absolute; left: 50%; top: 172px; transform: translateX(-50%); display: flex; gap: 46px; }
#home .chip { padding: 9px 16px; background: ${PAPER}; display: flex; align-items: center; gap: 10px; }
#home .seg { padding: 2px 8px; cursor: pointer; }
#home .seg.on { background: ${COLORS.cobalt}; }
#home .hint { position: absolute; left: 50%; top: 228px; transform: translateX(-50%); font-size: 15px;
  background: rgba(255, 248, 236, 0.86); padding: 4px 10px; white-space: nowrap; }
#home .head { position: absolute; top: 312px; }
#home .card { position: absolute; width: 350px; height: 78px; display: flex; align-items: center; gap: 14px;
  padding: 12px 18px 12px 12px; cursor: pointer; transition: transform 0.12s; }
#home .card:hover { transform: scale(1.03); }
#home .card .sub { font-size: 15px; line-height: 1.2; margin-top: 4px; }
#home .card svg { width: 54px; height: 54px; flex: none; }
#home .card.muted { filter: saturate(0.25) brightness(0.92); }
#home .card .soon { position: absolute; right: -8px; top: -10px; background: ${INK}; padding: 2px 6px; }
#home .town { position: absolute; left: 34px; top: 6px; width: 300px; background: none; border: 0; padding: 0;
  text-align: left; cursor: pointer; transition: transform 0.12s; }
#home .town:hover { transform: scale(1.04); }
#home .town svg { display: block; overflow: visible; }
#home .townlabel { position: absolute; left: 70px; top: 196px; background: ${PAPER}; padding: 6px 12px 8px; }
#home .town .sub { font-size: 13px; margin-top: 2px; }
#home .town .soon { position: absolute; right: 10px; top: 60px; background: ${INK}; padding: 2px 6px; }
#home .note { position: absolute; font-size: 13px; background: ${PAPER}; padding: 3px 8px; pointer-events: none; }
#home .footer { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; background: ${PAPER}; }
#home .footer button { padding: 10px 16px; font-family: inherit; font-weight: 700; font-size: 15px; color: ${INK}; background: none;
  border: 0; cursor: pointer; letter-spacing: 0.03em; }
#home .footer button + button, #home .footer span { border-left: 2px solid rgba(58, 63, 75, 0.12); }
#home .footer span { padding: 10px 16px; font-size: 15px; }
#home .veil { position: absolute; inset: -2000px; padding: 2000px; background: rgba(58, 45, 20, 0.38); display: flex;
  align-items: center; justify-content: center; }
#home .pop { background: ${PAPER}; padding: 22px 26px; width: 580px; max-width: 92%; }
#home .pop p { font-size: 17px; line-height: 1.45; margin: 12px 0; }
#home .pop .step { font-size: 15px; font-weight: 700; margin: 14px 0 8px; }
#home .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#home .box { width: 40px; height: 48px; background: #f1e3c4; border: 0; font-family: inherit; font-weight: 700; font-size: 24px;
  text-align: center; text-transform: uppercase; color: ${INK}; }
#home .seat, #home .sym { background: #f1e3c4; border: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
#home .seat { width: 38px; height: 34px; font-family: inherit; font-weight: 700; font-size: 16px; color: ${INK}; }
#home .seat.on { background: ${COLORS.sun}; }
#home .rowlabel { width: 52px; font-size: 14px; }
#home .seatno { font-size: 15px; font-weight: 700; min-height: 20px; margin: -4px 0 4px; }
#home .row + .row { margin-top: 6px; }
#home .sym { width: 48px; height: 48px; }
#home .sym.on { background: ${COLORS.teal}; }
#home .btn { padding: 12px 18px; border: 0; cursor: pointer; display: flex; align-items: center; }
#home .actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 18px; }
#home .wide { width: 100%; margin-top: 10px; justify-content: flex-start; font-family: inherit; font-weight: 700; font-size: 17px;
  color: ${INK}; background: ${PAPER}; border-left: 6px solid #f1e3c4; }
body.home-open button[class*="xr" i], body.home-open #VRButton, body.home-open #ARButton { display: none !important; }
#home-back { position: fixed; left: 16px; top: 16px; z-index: 5; padding: 10px 16px; border: 0; cursor: pointer;
  background: ${PAPER}; box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.32); display: none; }
`;

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`numeria.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(`numeria.${key}`, value);
    } catch {
      // Private windows may refuse storage; the choice lasts for this visit.
    }
  },
};

/** A canvas of capital text in the paper letters, `px` tall, in `ink`. */
function paperText(text: string, px: number, ink: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const draw = () => {
    const dpr = 2;
    const w = Math.max(1, Math.ceil(glyphWidth(text, px) + px * 0.25));
    const h = Math.ceil(px * 1.25);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const c = canvas.getContext('2d')!;
    c.scale(dpr, dpr);
    drawGlyphs(c, text, 0, px * 0.12, px, ink);
  };
  draw();
  whenGlyphsLoad(draw);
  return canvas;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export class Home {
  private root: HTMLDivElement;
  private stage!: HTMLDivElement;
  private back: HTMLButtonElement;
  private lang: Lang;
  private device: Device;
  private scale = 1;
  private shown = false;
  private savedEye?: { p: Vector3; q: Quaternion };

  constructor(
    private camera: PerspectiveCamera,
    private xrAvailable: boolean,
    private onPlay: (mode: PlayMode, device: Device) => void,
    private onBack: () => void,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = el('div');
    this.root.id = 'home';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    this.back = el('button', 'shadow', document.body);
    this.back.id = 'home-back';
    this.back.addEventListener('click', () => this.onBack());
    this.lang = store.get('lang') === 'id' ? 'id' : 'en';
    const saved = store.get('device') as Device | null;
    // On a headset the game opens on the desk by default.
    const onHeadset = /OculusBrowser|Quest/u.test(navigator.userAgent);
    this.device = saved && (saved !== 'xr' || xrAvailable) ? saved : onHeadset && xrAvailable ? 'xr' : 'computer';
    this.render();
    window.addEventListener('resize', () => this.fit());
  }

  get visible(): boolean {
    return this.shown;
  }

  private get t(): HomeText {
    return HOME_TEXT[this.lang];
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.root.style.display = 'block';
    document.body.classList.add('home-open');
    this.back.style.display = 'none';
    this.savedEye = { p: this.camera.position.clone(), q: this.camera.quaternion.clone() };
    this.camera.position.copy(HOME_EYE);
    this.camera.lookAt(HOME_AT);
    this.fit();
  }

  /** Hides the page; `inGame` shows the small Home button over the browser game. */
  hide(inGame: boolean): void {
    if (this.shown) {
      this.shown = false;
      this.root.style.display = 'none';
      document.body.classList.remove('home-open');
      if (this.savedEye) {
        this.camera.position.copy(this.savedEye.p);
        this.camera.quaternion.copy(this.savedEye.q);
      }
    }
    this.back.style.display = inGame ? 'block' : 'none';
  }

  private fit(): void {
    this.scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    const offX = (window.innerWidth - STAGE_W * this.scale) / 2;
    this.stage.style.transform = `translate(${offX}px, 0) scale(${this.scale})`;
  }

  private render(): void {
    const t = this.t;
    this.root.innerHTML = '';
    this.stage = el('div', 'stage', this.root);

    const title = el('img', 'title', this.stage);
    title.src = `${import.meta.env.BASE_URL}ui2d/brand/title_numeria_arena.png`;
    title.alt = 'Numeria Arena';

    // Where to play: one of three.
    const tabs = el('div', 'tabs shadow', this.stage);
    el('div', 'tab label', tabs).appendChild(paperText(t.playOn, 20, INK));
    for (const d of ['computer', 'xr', 'smartboard'] as Device[]) {
      const off = d === 'xr' && !this.xrAvailable;
      const tab = el('button', `tab${this.device === d ? ' on' : ''}${off ? ' off' : ''}`, tabs);
      tab.appendChild(paperText(t.device[d], 20, this.device === d ? PAPER : INK));
      tab.setAttribute('aria-label', `${t.playOn} ${t.device[d]}`);
      tab.setAttribute('aria-pressed', String(this.device === d));
      if (off) tab.title = t.noXr;
      else tab.addEventListener('click', () => this.setDevice(d));
    }
    const chips = el('div', 'chips', this.stage);
    const lang = el('div', 'chip shadow', chips);
    lang.appendChild(paperText(t.language, 17, INK));
    for (const code of ['en', 'id'] as Lang[]) {
      const seg = el('button', `seg${this.lang === code ? ' on' : ''}`, lang);
      seg.style.border = '0';
      seg.style.background = this.lang === code ? COLORS.cobalt : 'none';
      seg.appendChild(paperText(code.toUpperCase(), 17, this.lang === code ? PAPER : INK));
      seg.setAttribute('aria-label', `${t.language} ${code.toUpperCase()}`);
      seg.addEventListener('click', () => this.setLang(code));
    }
    const access = el('button', 'chip shadow', chips);
    access.style.border = '0';
    access.style.cursor = 'pointer';
    access.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="4" r="3.2" fill="#3469c4"/><path d="M2 8h18v3h-6v10h-3v-6h0v6H8V11H2z" fill="#3469c4"/></svg>';
    access.appendChild(paperText(t.accessibility, 17, INK));
    access.setAttribute('aria-label', t.accessibility);
    access.addEventListener('click', () => this.message(t.accessibility, t.soonBody.accessibility));
    el('div', 'hint', this.stage).textContent = t.hint[this.device];

    // Left: ways to play.
    const left = el('div', 'head', this.stage);
    left.style.left = '40px';
    left.appendChild(paperText(t.play, 30, INK));
    this.card('left', 0, t.practice, 'practice', COLORS.teal, () => this.play('practice'));
    this.card('left', 1, t.robots, 'robots', COLORS.cobalt, () => this.play('race'));
    const mates = this.card('left', 2, t.classmates, 'classmates', COLORS.coral, () => this.studentCode());
    mates.classList.add('muted');
    const note = el('div', 'note shadow', this.stage);
    note.textContent = t.studentFirst;
    note.style.left = '214px';
    note.style.top = '528px';
    this.card('left', 3, t.smartboard, 'smartboard', COLORS.violet, () => this.message(t.smartboard[0], t.soonBody.smartboard), true);

    // Right: who you are, and learning more.
    const right = el('div', 'head', this.stage);
    right.style.left = '1210px';
    right.appendChild(paperText(t.you, 30, INK));
    this.card('right', 0, t.student, 'student', COLORS.sun, () => this.studentCode());
    this.card('right', 1, t.teacher, 'teacher', COLORS.cobalt, () => this.teacherSignIn());
    this.card('right', 2, t.tips, 'tips', COLORS.teal, () => this.message(t.tips[0], t.soonBody.tips), true);
    this.card('right', 3, t.watch, 'watch', COLORS.violet, () => this.message(t.watch[0], t.soonBody.watch), true);

    // The town the player builds with the Folds they earn: a small round
    // paper sticker with the town standing up on it.
    const town = el('button', 'town', this.stage);
    town.insertAdjacentHTML('beforeend', townSticker(300));
    const label = el('div', 'townlabel shadow', town);
    label.appendChild(paperText(t.town[0], 18, INK));
    el('div', 'sub', label).textContent = t.town[1];
    el('span', 'soon', town).appendChild(paperText(t.soon, 12, PAPER));
    town.setAttribute('aria-label', `${t.town[0]}. ${t.town[1]}. ${t.soon}`);
    town.addEventListener('click', () => this.message(t.town[0], t.soonBody.town));

    const footer = el('div', 'footer shadow', this.stage);
    const keys = Object.keys(HOME_TEXT.en.pages) as (keyof HomeText['pages'])[];
    t.footer.forEach((label, i) => {
      const b = el('button', '', footer);
      b.textContent = label;
      b.addEventListener('click', () => this.message(label.toUpperCase(), t.pages[keys[i]]));
    });
    el('span', '', footer).textContent = VERSION;

    this.back.innerHTML = '';
    this.back.appendChild(paperText(this.lang === 'id' ? 'BERANDA' : 'HOME', 18, INK));
    this.back.setAttribute('aria-label', this.lang === 'id' ? 'Beranda' : 'Home');
    this.fit();
  }

  private card(
    side: 'left' | 'right',
    row: number,
    [title, sub]: string[],
    icon: string,
    color: string,
    onClick: () => void,
    soon = false,
  ): HTMLElement {
    const card = el('button', 'card shadow', this.stage);
    card.style.border = '0';
    card.style.textAlign = 'left';
    card.style.left = side === 'left' ? '40px' : '1210px';
    card.style.top = `${360 + row * 90}px`;
    const coloured = side === 'left';
    card.style.background = coloured ? color : PAPER;
    card.style.color = coloured ? PAPER : INK;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 54 54');
    svg.innerHTML = ICONS[icon];
    card.appendChild(svg);
    const txt = el('div', '', card);
    const len = title.length;
    txt.appendChild(paperText(title, len > 20 ? 17 : 18, coloured ? PAPER : INK));
    el('div', 'sub', txt).textContent = sub;
    if (soon) {
      const s = el('span', 'soon', card);
      s.appendChild(paperText(this.t.soon, 12, PAPER));
    }
    card.setAttribute('aria-label', `${title}. ${sub}${soon ? `. ${this.t.soon}` : ''}`);
    card.addEventListener('click', onClick);
    return card;
  }

  private setDevice(d: Device): void {
    this.device = d;
    store.set('device', d);
    this.render();
  }

  private setLang(l: Lang): void {
    this.lang = l;
    store.set('lang', l);
    document.documentElement.lang = l;
    this.render();
  }

  private play(mode: PlayMode): void {
    // A smartboard plays like this computer, with touch for the mouse.
    this.onPlay(mode, this.device === 'xr' ? 'xr' : 'computer');
  }

  // ------------------------------------------------------------ popups

  private popup(title: string): { veil: HTMLElement; body: HTMLElement } {
    const veil = el('div', 'veil', this.stage);
    const pop = el('div', 'pop shadow', veil);
    pop.appendChild(paperText(title, 24, INK));
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', title);
    veil.addEventListener('click', (e) => {
      if (e.target === veil) veil.remove();
    });
    return { veil, body: pop };
  }

  private actions(body: HTMLElement, veil: HTMLElement, go?: () => void): void {
    const row = el('div', 'actions', body);
    const close = el('button', 'btn shadow', row);
    close.style.background = '#f1e3c4';
    close.appendChild(paperText(go ? this.t.cancel : this.t.close, 16, INK));
    close.setAttribute('aria-label', go ? this.t.cancel : this.t.close);
    close.addEventListener('click', () => veil.remove());
    if (go) {
      const ok = el('button', 'btn shadow', row);
      ok.style.background = COLORS.teal;
      ok.appendChild(paperText(this.t.go, 16, PAPER));
      ok.setAttribute('aria-label', this.t.go);
      ok.addEventListener('click', go);
    }
  }

  private message(title: string, text: string): void {
    const { veil, body } = this.popup(title);
    el('p', '', body).textContent = text;
    this.actions(body, veil);
  }

  private studentCode(): void {
    const t = this.t;
    const { veil, body } = this.popup(t.student[0]);
    el('div', 'step', body).textContent = t.classCode;
    const code = el('div', 'row', body);
    for (let i = 0; i < 6; i += 1) {
      const box = el('input', 'box', code);
      box.maxLength = 1;
      box.addEventListener('input', () => (box.nextElementSibling as HTMLInputElement | null)?.focus());
    }
    el('div', 'step', body).textContent = t.seat;
    // Two rows of 0 to 9: tens, then ones (seat 1 is 0 then 1, seat 40 is 4 then 0).
    const digits = [-1, -1];
    const shown = el('div', 'seatno', body);
    const showSeat = () => {
      shown.textContent = digits.every((d) => d >= 0) ? `${t.seatIs} ${digits[0] * 10 + digits[1]}` : '';
    };
    [t.tens, t.ones].forEach((rowLabel, r) => {
      const row = el('div', 'row', body);
      el('span', 'rowlabel', row).textContent = rowLabel;
      for (let n = 0; n <= 9; n += 1) {
        const b = el('button', 'seat', row);
        b.textContent = String(n);
        b.setAttribute('aria-label', `${rowLabel} ${n}`);
        b.addEventListener('click', () => {
          row.querySelectorAll('.seat').forEach((o) => o.classList.remove('on'));
          b.classList.add('on');
          digits[r] = n;
          showSeat();
        });
      }
    });
    el('div', 'step', body).textContent = t.picture;
    const pics = el('div', 'row', body);
    SYMBOLS.forEach((sym) => {
      const b = el('button', 'sym', pics);
      b.innerHTML = `<svg width="30" height="30" viewBox="0 0 34 34">${sym}</svg>`;
      b.addEventListener('click', () => {
        if (b.classList.contains('on') || pics.querySelectorAll('.on').length < 3) b.classList.toggle('on');
      });
    });
    this.actions(body, veil, () => {
      veil.remove();
      this.message(t.student[0], t.serverSoon);
    });
  }

  private teacherSignIn(): void {
    const t = this.t;
    const { veil, body } = this.popup(t.teacher[0]);
    el('p', '', body).textContent = t.teacherIntro;
    // Plain text, no company logos.
    for (const label of [t.google, t.facebook]) {
      const b = el('button', 'btn wide shadow', body);
      b.textContent = label;
      b.addEventListener('click', () => {
        veil.remove();
        this.message(t.teacher[0], t.serverSoon);
      });
    }
    const mail = el('button', 'btn wide shadow', body);
    mail.style.background = COLORS.cobalt;
    mail.style.borderLeft = '0';
    mail.appendChild(paperText(t.email, 16, PAPER));
    mail.addEventListener('click', () => {
      veil.remove();
      this.message(t.teacher[0], t.serverSoon);
    });
    this.actions(body, veil);
  }
}
