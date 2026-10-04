import { Quaternion, Vector3, type PerspectiveCamera } from '@iwsdk/core';

import { drawGlyphs, glyphWidth, whenGlyphsLoad } from '../art/glyphs.js';
import { bigText, getLang, onSettings, setBigText, setLang } from '../settings.js';
import { HOME_TEXT, type HomeText, type Lang } from './home-text.js';
import {
  authErrorCode,
  finishEmailLink,
  onTeacher,
  register,
  sendEmailLink,
  signInConfigured,
  signInWith,
  signOut,
  startTeacher,
  teacherState,
  type Me,
} from './teacher.js';
import { ClassRace } from '../game/class-race.js';
import { avatarOf, avatarSvg } from './avatar.js';
import { pictureSvg } from './pictures.js';
import { checkStudent, findRival, studentRoom, onStudent, studentSignIn, studentSignOut, studentState, type Student } from './student.js';
import { online, onNetwork } from '../offline.js';
import { readCheckpoint } from '../race-checkpoint.js';
import { leaderboardSticker } from './leaderboard-sticker.js';
import { townSticker } from './town-sticker.js';

/**
 * The home page: a flat paper page over the browser view of the book. Where
 * to play and the language at the top, ways to play on the left, sign-in and
 * information on the right, and a footer below. Shown outside the headset
 * only.
 */
export type Device = 'computer' | 'xr' | 'smartboard';
/** `class`: the seat joined on the home page (`ClassRace.pending`), to the desk. */
export type PlayMode = 'practice' | 'race' | 'resume' | 'class';

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
  person:
    '<rect width="54" height="54" fill="#fff8ec"/><circle cx="27" cy="19" r="9" fill="#3469c4"/><path d="M9 46q0-16 18-16t18 16z" fill="#3469c4"/><path d="M27 10a9 9 0 0 1 0 18zM27 30q18 0 18 16H27z" fill="#2a54a0"/>',
  classes:
    '<rect width="54" height="54" fill="#fff8ec"/><rect x="8" y="8" width="17" height="17" fill="#e8b64c"/><rect x="29" y="8" width="17" height="17" fill="#e8b64c"/><rect x="8" y="29" width="17" height="17" fill="#e8b64c"/><rect x="29" y="29" width="17" height="17" fill="#c9962f"/>',
  history:
    '<rect width="54" height="54" fill="#fff8ec"/><rect x="9" y="8" width="36" height="38" fill="#3469c4"/><path d="M27 8h18v38H27z" fill="#2a54a0"/><rect x="15" y="16" width="24" height="3" fill="#fff8ec"/><rect x="15" y="24" width="24" height="3" fill="#fff8ec"/><rect x="15" y="32" width="16" height="3" fill="#fff8ec"/>',
  room: '<rect width="54" height="54" fill="#fff8ec"/><rect x="7" y="9" width="40" height="26" fill="#f2716b"/><path d="M27 9h20v26H27z" fill="#c9554f"/><rect x="18" y="17" width="18" height="10" fill="#fff8ec"/><rect x="25" y="35" width="4" height="9" fill="#3a3f4b"/>',
  teacher: '<rect width="54" height="54" fill="#3469c4"/><path d="M9 14h17v28H9z" fill="#fff8ec"/><path d="M28 14h17v28H28z" fill="#f3e6c9"/><rect x="26" y="12" width="2" height="32" fill="#3a3f4b"/><rect x="13" y="20" width="9" height="2" fill="#3469c4"/><rect x="13" y="25" width="9" height="2" fill="#3469c4"/>',
  tips: '<rect width="54" height="54" fill="#3fb6a0"/><circle cx="27" cy="22" r="12" fill="#fff8ec"/><path d="M27 10a12 12 0 0 1 0 24z" fill="#f3e6c9"/><rect x="21" y="34" width="12" height="4" fill="#fff8ec"/><rect x="22" y="40" width="10" height="4" fill="#f3e6c9"/>',
  rival: '<rect width="54" height="54" fill="#fff8ec"/><circle cx="14" cy="21" r="7" fill="#f2716b"/><path d="M4 46 7 31h14l3 15z" fill="#f2716b"/><circle cx="40" cy="21" r="7" fill="#3469c4"/><path d="M30 46 33 31h14l3 15z" fill="#3469c4"/><path d="M29 5 22 19h6l-3 11 9-15h-6l3-10z" fill="#e8b64c"/>',
  watch: '<rect width="54" height="54" fill="#b198ea"/><path d="M5 27q22-20 44 0q-22 20-44 0z" fill="#fff8ec"/><path d="M27 12q11 3 22 15q-11 12-22 15z" fill="#f3e6c9"/><circle cx="27" cy="27" r="7" fill="#3a3f4b"/>',
};

const CSS = `
#home { position: fixed; inset: 0; z-index: 5; pointer-events: none; overflow: hidden;
  font-family: 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif; color: ${INK}; }
#home .stage { position: absolute; left: 0; top: 0; width: ${STAGE_W}px; height: ${STAGE_H}px; transform-origin: 0 0; }
#home .stage > * { pointer-events: auto; }
#home .title { position: absolute; left: 50%; top: 52px; transform: translateX(-50%); width: 430px; }
#home .shadow { box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.32); }
#home .tabs { position: absolute; left: 50%; top: 150px; transform: translateX(-50%); display: flex; }
#home .tab { padding: 10px 18px; background: ${PAPER}; display: flex; align-items: center; cursor: pointer; border: 0; }
#home .tab.label { cursor: default; }
#home .tab.on { background: ${COLORS.teal}; }
#home .tab.off { opacity: 0.45; cursor: not-allowed; }
#home .chips { position: absolute; left: 50%; top: 210px; transform: translateX(-50%); display: flex; gap: 46px; }
#home .chip { padding: 9px 16px; background: ${PAPER}; display: flex; align-items: center; gap: 10px; }
#home .seg { padding: 2px 8px; cursor: pointer; }
#home .seg.on { background: ${COLORS.cobalt}; }
#home .offline { position: absolute; left: 50%; top: 304px; transform: translateX(-50%); }
#home .hint { position: absolute; left: 50%; top: 266px; transform: translateX(-50%); font-size: 15px; color: ${PAPER};
  background: rgba(92, 66, 24, 0.42); padding: 5px 12px; white-space: nowrap; }
#home .head { position: absolute; top: 312px; }
#home .card { position: absolute; width: 350px; height: 78px; display: flex; align-items: center; gap: 14px;
  padding: 12px 18px 12px 12px; cursor: pointer; transition: transform 0.12s; }
#home .card:hover { transform: scale(1.03); }
#home .card .sub { font-size: 15px; line-height: 1.2; margin-top: 4px; }
#home .card svg { width: 54px; height: 54px; flex: none; }
#home .card.muted { filter: saturate(0.25) brightness(0.92); }
#home .card .soon { position: absolute; right: -8px; top: -10px; background: ${INK}; padding: 2px 6px; }
#home .card.me { padding-left: 8px; }
#home .card.me svg { outline: 3px solid ${PAPER}; transform: rotate(-4deg); box-shadow: 0 3px 6px rgba(58, 45, 20, 0.25); }
#home .idcard { display: flex; align-items: center; gap: 22px; margin: -22px -26px 6px; padding: 22px 26px; }
#home .idcard canvas { display: block; }
#home .idcard canvas + canvas { margin-top: 4px; }
#home .idcard .av { flex: none; background: ${PAPER}; padding: 6px; transform: rotate(-4deg); }
#home .idcard .av svg { display: block; }
#home .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
#home .chips span { background: ${PAPER}; color: ${INK}; font-weight: 700; font-size: 15px; padding: 4px 10px; }
#home .actions .out { margin-right: auto; }
#home .town { position: absolute; left: 34px; top: 6px; width: 300px; background: none; border: 0; padding: 0;
  text-align: left; cursor: pointer; transition: transform 0.12s; }
#home .town:hover { transform: scale(1.04); }
#home .town svg { display: block; overflow: visible; }
#home .townlabel { position: absolute; left: 70px; top: 196px; background: ${PAPER}; padding: 6px 12px 8px; }
#home .town .sub { font-size: 13px; margin-top: 2px; }
#home .town .soon { position: absolute; right: 10px; top: 60px; background: ${INK}; padding: 2px 6px; }
#home .town.board { left: auto; right: 34px; }
#home .town.board .townlabel { left: auto; right: 70px; }
#home .town.board .soon { right: auto; left: 10px; }
#home .note { position: absolute; font-size: 13px; background: ${PAPER}; padding: 3px 8px; pointer-events: none; }
#home .footer { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; background: ${PAPER}; }
#home .footer button { padding: 10px 14px; white-space: nowrap; font-family: inherit; font-weight: 700; font-size: 15px; color: ${INK}; background: none;
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
#home .sym:hover { background: #ecd7ab; }
#home .slots { margin-bottom: 4px; }
#home .slot { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
  background: #fffdf8; border: 2px dashed #c9b88f; font-weight: 700; color: #5d6270; box-sizing: border-box; }
#home .slot.on { border: 2px solid ${COLORS.teal}; }
#home .seat.undo { width: auto; padding: 0 10px; font-size: 14px; }
#home .seat.undo:disabled { opacity: 0.5; cursor: default; }
#home .btn { padding: 12px 18px; border: 0; cursor: pointer; display: flex; align-items: center; }
#home .actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 18px; }
#home .wide { width: 100%; margin-top: 10px; justify-content: flex-start; font-family: inherit; font-weight: 700; font-size: 17px;
  color: ${INK}; background: ${PAPER}; }
#home .field { width: 100%; box-sizing: border-box; height: 46px; padding: 0 12px; background: #f1e3c4; border: 0;
  font-family: inherit; font-size: 18px; color: ${INK}; }
#home .field.short { width: 90px; text-transform: uppercase; text-align: center; font-weight: 700; }
#home .kind { padding: 9px 12px; background: #f1e3c4; border: 0; cursor: pointer; }
#home .kind.on { background: ${COLORS.cobalt}; }
#home .tick { display: flex; gap: 12px; align-items: flex-start; background: none; border: 0; padding: 0; margin-top: 14px;
  cursor: pointer; text-align: left; font-family: inherit; font-size: 15px; line-height: 1.4; color: ${INK}; }
#home .tick .mark { flex: none; width: 26px; height: 26px; background: #f1e3c4; display: flex; align-items: center;
  justify-content: center; }
#home .tick.on .mark { background: ${COLORS.teal}; }
#home .names { display: flex; flex-wrap: wrap; gap: 8px; }
#home .names span { background: #f1e3c4; padding: 7px 11px; font-weight: 700; font-size: 16px; }
#home .names span.me { background: ${COLORS.sun}; }
#home .err { color: #c62828; font-size: 15px; min-height: 20px; margin: 10px 0 0; }
#home .skel { display: inline-block; width: 170px; height: 13px; background: rgba(58, 63, 75, 0.14);
  animation: home-skel 1.1s ease-in-out infinite alternate; }
@keyframes home-skel { from { opacity: 0.45; } to { opacity: 1; } }
body.home-open button[class*="xr" i], body.home-open #VRButton, body.home-open #ARButton { display: none !important; }
#home-games { position: fixed; top: 16px; z-index: 5; padding: 10px 16px; border: 0; cursor: pointer;
  background: ${PAPER}; box-shadow: 4px 7px 12px rgba(70, 50, 25, 0.32); display: none; }
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
  /** OTHER GAME beside HOME, during a practice in the browser: back to the practice envelopes. */
  private otherGame: HTMLElement;
  private otherGameWanted = false;
  private savedEye?: { p: Vector3; q: Quaternion };
  /** The sign-up form opens by itself once per sign-in, not on every redraw. */
  private askedToRegister = false;
  /**
   * Whether the player opened the sign-in on this page. A session kept from
   * before is checked by itself on every load: a server out of reach then
   * shows on the teacher card, not as a box to close each time.
   */
  private signInAsked = false;

  constructor(
    private camera: PerspectiveCamera,
    private xrAvailable: boolean,
    private onPlay: (mode: PlayMode, device: Device) => void,
    private onBack: () => void,
    private onOtherGame: () => void,
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
    this.otherGame = el('button', 'shadow', document.body);
    this.otherGame.id = 'home-games';
    this.otherGame.addEventListener('click', () => this.onOtherGame());
    this.lang = getLang();
    // A language picked on the desk shows here too.
    onSettings(() => {
      if (getLang() !== this.lang) {
        this.lang = getLang();
        this.render();
      }
    });
    const saved = store.get('device') as Device | null;
    // On a headset the game opens on the desk by default.
    const onHeadset = /OculusBrowser|Quest/u.test(navigator.userAgent);
    this.device = saved && (saved !== 'xr' || xrAvailable) ? saved : onHeadset && xrAvailable ? 'xr' : 'computer';
    this.render();
    window.addEventListener('resize', () => this.fit());
    // The OFFLINE chip comes and goes with the network.
    onNetwork(() => {
      if (this.shown) this.render();
    });
    onStudent(() => this.render());
    void checkStudent();
    onTeacher((s) => {
      this.render();
      if (s.kind === 'out') this.askedToRegister = false;
      if (s.kind === 'in' && !s.me.organizer && !this.askedToRegister) {
        this.askedToRegister = true;
        this.registration(s.me);
      }
      if (s.kind === 'error' && (s.code !== 'offline' || this.signInAsked)) this.message(this.t.teacher[0], this.errorText(s.code));
    });
    startTeacher()
      .then((r) => {
        if (r === 'needs_email') this.confirmLinkEmail();
      })
      .catch((e) => {
        console.warn('[teacher] start failed', e);
        this.message(this.t.teacher[0], this.errorText(authErrorCode(e)));
      });
  }

  /**
   * Whether this device can really open a headset session, once the browser
   * has said so (the constructor's value is only the project's setting). A
   * saved choice of the headset falls back to this computer without one.
   */
  setXrAvailable(available: boolean): void {
    if (available === this.xrAvailable) return;
    this.xrAvailable = available;
    if (!available && this.device === 'xr') this.device = 'computer';
    this.render();
  }

  /** The headset session could not start: say so, and play here instead. */
  xrFailed(): void {
    this.setXrAvailable(false);
    this.message(this.t.device.xr, this.t.noXrBody);
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
    // Drawn again on every return: a race left meanwhile changes the robots card.
    this.render();
    // A seat given a new picture or emptied by the teacher signs out here.
    void checkStudent();
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
    this.placeOtherGame(inGame);
  }

  /** Shows OTHER GAME beside HOME while a practice is on (the game says when). */
  setOtherGame(on: boolean): void {
    if (on === this.otherGameWanted) return;
    this.otherGameWanted = on;
    this.placeOtherGame(this.back.style.display === 'block');
  }

  private placeOtherGame(inGame: boolean): void {
    const show = inGame && this.otherGameWanted;
    this.otherGame.style.display = show ? 'block' : 'none';
    if (show) this.otherGame.style.left = `${16 + this.back.offsetWidth + 12}px`;
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
    title.src = `${import.meta.env.BASE_URL}ui2d/brand/title_numeria_arena.webp`;
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
    access.addEventListener('click', () => this.accessibility());
    el('div', 'hint', this.stage).textContent = t.hint[this.device];
    if (!online()) {
      // No network: the games still play, and say where their results go. A row of its own,
      // under the hint, so the chips above keep their width.
      const off = el('div', 'offline chip shadow', this.stage);
      off.appendChild(paperText(t.offline, 17, COLORS.coral));
      off.setAttribute('role', 'status');
    }

    // Student and teacher sign-in hide each other: a signed-in teacher gets
    // their own card and the class tools in place of the student code, and a
    // student in a class seat gets their pass in place of both sign-ins.
    const teacher = teacherState();
    const student = studentState();
    // A race left before its results can pick up again: the card says from where.
    const kept = readCheckpoint();
    const robots: [string, string] = kept ? [t.robots[0], t.resumeSub(kept.next, kept.next >= kept.card.length)] : [t.robots[0], t.robots[1]];

    // Left: ways to play, or for a signed-in teacher the class tools.
    const left = el('div', 'head', this.stage);
    left.style.left = '40px';
    if (teacher.kind === 'in') {
      left.appendChild(paperText(t.teach, 30, INK));
      // The class tools live on the teacher page, which opens at the right tab.
      this.card('left', 0, t.openRoom, 'room', COLORS.coral, () => window.location.assign('/manage#rooms'));
      this.card('left', 1, t.myClasses, 'classes', COLORS.teal, () => window.location.assign('/manage#classes'));
      this.card('left', 2, t.history, 'history', COLORS.cobalt, () => window.location.assign('/manage#rooms'));
      this.card('left', 3, t.smartboard, 'smartboard', COLORS.violet, () => this.message(t.smartboard[0], t.soonBody.smartboard), true);
    } else {
      left.appendChild(paperText(t.play, 30, INK));
      this.card('left', 0, t.practice, 'practice', COLORS.teal, () => this.play('practice'));
      this.card('left', 1, robots, 'robots', COLORS.cobalt, () => this.play('race'));
      this.card('left', 2, t.classmates, 'classmates', COLORS.coral, () => this.joinRoom());
      this.card('left', 3, t.smartboard, 'smartboard', COLORS.violet, () => this.message(t.smartboard[0], t.soonBody.smartboard), true);
    }

    // Right: who you are, and learning more.
    const right = el('div', 'head', this.stage);
    right.style.left = '1210px';
    right.appendChild(paperText(t.you, 30, INK));
    let row = 0;
    if (teacher.kind === 'in') {
      const me = teacher.me;
      const status = me.organizer ? t.status[me.organizer.status] : t.finishSignUp;
      const org = me.organizer?.org;
      const where = org && org.kind !== 'personal' ? `${org.name} · ` : '';
      const name = (me.name || me.email.split('@')[0]).toUpperCase();
      const card = this.card('right', row++, [name, `${where}${status}`], 'person', COLORS.cobalt, () => this.account(me));
      card.style.background = COLORS.cobalt;
      card.style.color = PAPER;
      card.querySelector('canvas')?.replaceWith(paperText(name, name.length > 20 ? 17 : 18, PAPER));
      // The games themselves, to see what the students play.
      this.card('right', row++, t.tryPractice, 'practice', COLORS.teal, () => this.play('practice'));
      this.card('right', row++, kept ? [t.tryRobots[0], robots[1]] : t.tryRobots, 'robots', COLORS.cobalt, () => this.play('race'));
    } else if (student) {
      // A device in a class seat is a student's: no teacher sign-in here.
      const look = avatarOf(student.pseudonym);
      const name = student.pseudonym.toUpperCase();
      const sub = t.studentSeat(student.class_label, student.seat);
      const card = this.card('right', row++, [name, sub], 'student', look.colour, () => this.studentCard(student));
      card.classList.add('me');
      card.style.borderLeft = `8px solid ${look.colour}`;
      const icon = card.querySelector('svg');
      if (icon) {
        icon.setAttribute('viewBox', '0 0 64 64');
        icon.innerHTML = look.inner;
      }
      const badge = el('span', 'soon', card);
      badge.style.background = COLORS.teal;
      badge.appendChild(paperText(t.inClass, 12, PAPER));
      card.setAttribute('aria-label', `${t.studentHi(student.pseudonym)}. ${sub}. ${t.inClass}`);
      this.card('right', row++, t.rival, 'rival', COLORS.coral, () => this.findRival());
    } else {
      this.card('right', row++, t.student, 'student', COLORS.sun, () => this.studentCode());
      const card = this.card('right', row++, t.teacher, 'teacher', COLORS.cobalt, () => this.teacherSignIn());
      if (teacher.kind === 'error' && teacher.code === 'offline') {
        const sub = card.querySelector('.sub');
        if (sub) sub.textContent = t.serverAway;
        card.setAttribute('aria-label', `${t.teacher[0]}. ${t.serverAway}`);
      }
      if (teacher.kind === 'loading') {
        const sub = card.querySelector('.sub');
        if (sub) sub.innerHTML = '<span class="skel"></span>';
        card.setAttribute('aria-label', `${t.teacher[0]}. ${t.signingIn}`);
        card.setAttribute('aria-busy', 'true');
      }
    }
    this.card('right', row++, t.tips, 'tips', COLORS.teal, () => this.message(t.tips[0], t.soonBody.tips), true);
    this.card('right', row++, t.watch, 'watch', COLORS.violet, () => this.watch());

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

    // Its partner on the right: the leaderboards, a podium on a sticker.
    const board = el('button', 'town board', this.stage);
    board.insertAdjacentHTML('beforeend', leaderboardSticker(300));
    const boardLabel = el('div', 'townlabel shadow', board);
    boardLabel.appendChild(paperText(t.board[0], 18, INK));
    el('div', 'sub', boardLabel).textContent = t.board[1];
    el('span', 'soon', board).appendChild(paperText(t.soon, 12, PAPER));
    board.setAttribute('aria-label', `${t.board[0]}. ${t.board[1]}. ${t.soon}`);
    board.addEventListener('click', () => this.message(t.board[0], t.soonBody.board));

    const footer = el('div', 'footer shadow', this.stage);
    const keys = Object.keys(HOME_TEXT.en.pages) as (keyof HomeText['pages'])[];
    t.footer.forEach((label, i) => {
      const b = el('button', '', footer);
      b.textContent = label;
      // Privacy and the page for parents point to the full policy on the site.
      const policy = keys[i] === 'Privacy' || keys[i] === 'For parents' ? { href: '/privacy', label: t.fullPolicy } : undefined;
      b.addEventListener('click', () => this.message(label.toUpperCase(), t.pages[keys[i]], policy));
    });
    // Teachers and admins: the full teacher page on the site (not on a student's device).
    if (!student) {
      const teachers = el('button', '', footer);
      teachers.textContent = t.teacherPage;
      teachers.addEventListener('click', () => window.location.assign('/manage'));
    }
    el('span', '', footer).textContent = VERSION;

    this.back.innerHTML = '';
    this.back.appendChild(paperText(this.lang === 'id' ? 'BERANDA' : 'HOME', 18, INK));
    this.back.setAttribute('aria-label', this.lang === 'id' ? 'Beranda' : 'Home');
    this.otherGame.innerHTML = '';
    this.otherGame.appendChild(paperText(this.lang === 'id' ? 'GAME LAIN' : 'OTHER GAME', 18, INK));
    this.otherGame.setAttribute('aria-label', this.lang === 'id' ? 'Pilih game lain' : 'Choose another game');
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
    setLang(l);
    this.render();
  }

  private play(mode: PlayMode): void {
    if (mode === 'race' && readCheckpoint()) {
      this.resumeChoice();
      return;
    }
    // A smartboard plays like this computer, with touch for the mouse.
    this.onPlay(mode, this.device === 'xr' ? 'xr' : 'computer');
  }

  /** A race was left before its results: carry on from the next round, or start over. */
  private resumeChoice(): void {
    const t = this.t;
    const kept = readCheckpoint();
    if (!kept) {
      this.play('race');
      return;
    }
    const boss = kept.next >= kept.card.length;
    const { veil, body } = this.popup(t.robots[0]);
    el('p', '', body).textContent = t.resumeBody(kept.next, boss);
    const device = this.device === 'xr' ? 'xr' : 'computer';
    const go = el('button', 'btn wide shadow', body);
    go.style.background = COLORS.teal;
    go.appendChild(paperText(t.resumeGo(kept.next, boss), 17, PAPER));
    go.setAttribute('aria-label', t.resumeGo(kept.next, boss));
    go.addEventListener('click', () => {
      veil.remove();
      this.onPlay('resume', device);
    });
    const fresh = el('button', 'btn wide shadow', body);
    fresh.appendChild(paperText(t.startOver, 17, INK));
    fresh.setAttribute('aria-label', t.startOver);
    fresh.addEventListener('click', () => {
      veil.remove();
      this.onPlay('race', device);
    });
    this.actions(body, veil);
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

  private message(title: string, text: string, link?: { href: string; label: string }): void {
    const { veil, body } = this.popup(title);
    el('p', '', body).textContent = text;
    if (link) {
      const p = el('p', '', body);
      const a = el('a', '', p);
      a.href = link.href;
      a.textContent = link.label;
      a.style.color = COLORS.cobalt;
    }
    this.actions(body, veil);
  }

  private accessibility(): void {
    const t = this.t;
    const { veil, body } = this.popup(t.accessibility);
    const toggle = el('button', 'btn wide shadow', body);
    const draw = () => {
      toggle.innerHTML = '';
      toggle.style.background = bigText() ? COLORS.teal : PAPER;
      toggle.appendChild(paperText(t.bigNumbers(bigText()), 17, bigText() ? PAPER : INK));
      toggle.setAttribute('aria-pressed', String(bigText()));
      toggle.setAttribute('aria-label', t.bigNumbers(bigText()));
    };
    draw();
    toggle.addEventListener('click', () => {
      setBigText(!bigText());
      draw();
    });
    // Shows the paper hand's how-to again on each game's next first creature.
    const again = el('button', 'btn wide shadow', body);
    again.appendChild(paperText(t.howtoAgain, 17, INK));
    again.setAttribute('aria-label', t.howtoAgain);
    const done = el('p', '', body);
    again.addEventListener('click', () => {
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('numeria.howto.') || k === 'numeria.menuHintSeen') localStorage.removeItem(k);
        }
      } catch {
        // Without storage the how-to shows every time anyway.
      }
      done.textContent = t.howtoReset;
    });
    el('p', '', body).textContent = t.soonBody.accessibility;
    this.actions(body, veil);
  }

  /**
   * I'M IN A CLASS: the class code, the seat number and the three pictures
   * in the order on the student's card; the device then stays in that seat.
   */
  private studentCode(): void {
    const t = this.t;
    const { veil, body } = this.popup(t.student[0]);
    el('div', 'step', body).textContent = t.classCode;
    const code = this.codeBoxes(body);
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
    // The three picked so far, in order, then the nine to pick from.
    const picked: number[] = [];
    const slots = el('div', 'row slots', body);
    const showPicked = () => {
      slots.replaceChildren();
      for (let k = 0; k < 3; k += 1) {
        const n = picked[k];
        const slot = el('span', n === undefined ? 'slot' : 'slot on', slots);
        if (n === undefined) slot.textContent = String(k + 1);
        else slot.innerHTML = pictureSvg(n, 32);
        slot.setAttribute('aria-label', n === undefined ? `${k + 1}` : `${k + 1}: ${t.pictureNames[n]}`);
      }
      const undo = el('button', 'seat undo', slots);
      undo.textContent = t.undoPicture;
      undo.setAttribute('aria-label', t.undoPicture);
      undo.disabled = picked.length === 0;
      undo.addEventListener('click', () => {
        picked.pop();
        showPicked();
      });
    };
    const pics = el('div', 'row pics', body);
    t.pictureNames.forEach((name, n) => {
      const b = el('button', 'sym', pics);
      b.innerHTML = pictureSvg(n, 36);
      b.setAttribute('aria-label', name);
      b.title = name;
      b.addEventListener('click', () => {
        if (picked.length < 3) picked.push(n);
        showPicked();
      });
    });
    showPicked();
    const fail = this.errorLine(body);
    let busy = false;
    this.actions(body, veil, () => {
      if (busy) return;
      const c = code();
      const seat = digits[0] * 10 + digits[1];
      if (c.length !== 6) return fail('code_length');
      if (digits.some((d) => d < 0) || seat < 1) return fail('seat_pick');
      if (picked.length !== 3) return fail('picture');
      if (!online()) return fail('offline');
      busy = true;
      fail();
      const line = body.querySelector('.err');
      if (line) line.textContent = t.joining;
      void studentSignIn(c, seat, [...picked]).then((r) => {
        busy = false;
        if (r === true) {
          veil.remove();
          const s = studentState();
          if (s) this.studentCard(s, true);
          return;
        }
        fail(r);
        // A wrong try starts the pictures again.
        if (r === 'wrong_picture') {
          picked.length = 0;
          showPicked();
        }
      });
    });
  }

  /**
   * The signed-in seat as a class pass: the paper avatar on a band of its
   * colour, the pseudonym, the class and seat, and SIGN OUT for a shared device.
   */
  private studentCard(s: Student, welcome = false): void {
    const t = this.t;
    const look = avatarOf(s.pseudonym);
    const name = s.pseudonym.toUpperCase();
    const veil = el('div', 'veil', this.stage);
    const body = el('div', 'pop shadow', veil);
    body.setAttribute('role', 'dialog');
    body.setAttribute('aria-label', t.studentHi(s.pseudonym));
    veil.addEventListener('click', (e) => {
      if (e.target === veil) veil.remove();
    });
    const band = el('div', 'idcard', body);
    band.style.background = look.colour;
    el('div', 'av shadow', band).innerHTML = avatarSvg(s.pseudonym, 104);
    const who = el('div', '', band);
    who.appendChild(paperText(t.hello, 18, PAPER));
    who.appendChild(paperText(name, name.length > 14 ? 26 : 30, PAPER));
    const chips = el('div', 'chips', who);
    el('span', '', chips).textContent = s.class_label;
    el('span', '', chips).textContent = t.seatNo(s.seat);
    el('p', '', body).textContent = welcome ? t.studentWelcome : t.studentKept;
    const row = el('div', 'actions', body);
    const out = el('button', 'btn shadow out', row);
    out.style.background = COLORS.coral;
    out.appendChild(paperText(t.signOut, 16, PAPER));
    out.setAttribute('aria-label', t.signOut);
    out.addEventListener('click', () => {
      veil.remove();
      void studentSignOut();
    });
    const close = el('button', 'btn shadow', row);
    close.style.background = '#f1e3c4';
    close.appendChild(paperText(t.close, 16, INK));
    close.setAttribute('aria-label', t.close);
    close.addEventListener('click', () => veil.remove());
  }

  /**
   * Six boxes for a room's code; reads it back in capitals. Every letter is
   * set in capitals as it is typed, a pasted code fills the boxes (a whole
   * code from the first box), Backspace and Delete clear, and the arrows move.
   */
  private codeBoxes(body: HTMLElement): () => string {
    const row = el('div', 'row', body);
    const boxes: HTMLInputElement[] = [];
    const clean = (text: string) => text.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const fill = (from: number, text: string) => {
      const start = text.length >= 6 ? 0 : from;
      for (let k = 0; k < text.length && start + k < 6; k += 1) boxes[start + k].value = text[k];
      boxes[Math.min(5, start + text.length)].focus();
    };
    for (let i = 0; i < 6; i += 1) {
      const box = el('input', 'box', row);
      box.autocapitalize = 'characters';
      box.autocomplete = 'off';
      box.spellcheck = false;
      box.setAttribute('aria-label', `${i + 1}`);
      box.style.textTransform = 'uppercase';
      box.addEventListener('focus', () => box.select());
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = clean(e.clipboardData?.getData('text') ?? '');
        if (text) fill(i, text);
      });
      box.addEventListener('input', () => {
        const text = clean(box.value);
        box.value = '';
        if (text) fill(i, text);
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (box.value) box.value = '';
          else if (i > 0) {
            boxes[i - 1].value = '';
            boxes[i - 1].focus();
          }
        } else if (e.key === 'Delete') {
          e.preventDefault();
          // The letters after it close up, as in one text field.
          for (let k = i; k < 5; k += 1) boxes[k].value = boxes[k + 1].value;
          boxes[5].value = '';
        } else if (e.key === 'ArrowLeft' && i > 0) {
          e.preventDefault();
          boxes[i - 1].focus();
        } else if (e.key === 'ArrowRight' && i < 5) {
          e.preventDefault();
          boxes[i + 1].focus();
        }
      });
      boxes.push(box);
    }
    return () => boxes.map((b) => b.value.trim().toUpperCase()).join('');
  }

  /** RACE MY CLASSMATES: a room's code, then its lobby. */
  private joinRoom(): void {
    const t = this.t;
    if (ClassRace.pending) {
      this.lobby(ClassRace.pending);
      return;
    }
    const { veil, body } = this.popup(t.classmates[0]);
    // A student in a class seat: the room their teacher opened, without a code.
    const mine = studentState() ? el('div', '', body) : undefined;
    const step = el('div', 'step', body);
    step.textContent = t.roomCode;
    const code = this.codeBoxes(body);
    const fail = this.errorLine(body);
    let busy = false;
    const go = (c: string) => {
      if (busy) return;
      if (c.length !== 6) {
        fail('code_length');
        return;
      }
      if (!online()) {
        fail('offline');
        return;
      }
      busy = true;
      fail();
      const line = body.querySelector('.err');
      if (line) line.textContent = t.joining;
      ClassRace.join(c).then(
        (link) => {
          ClassRace.pending = link;
          veil.remove();
          this.lobby(link);
        },
        (e: Error) => {
          busy = false;
          fail(e.message);
        },
      );
    };
    this.actions(body, veil, () => go(code()));
    if (mine) {
      void studentRoom().then((r) => {
        if (typeof r === 'string') {
          mine.remove();
          return;
        }
        step.textContent = t.orTypeCode;
        if (r.play_code) {
          const play = r.play_code;
          const b = el('button', 'btn wide shadow', mine);
          const text = t.joinClassRoom(r.class_label);
          b.style.background = COLORS.coral;
          b.appendChild(paperText(text, 17, PAPER));
          b.setAttribute('aria-label', text);
          b.addEventListener('click', () => go(play));
        } else {
          el('p', '', mine).textContent = t.noClassRoom(r.class_label);
        }
      });
    }
  }

  /** FIND A RIVAL: a duel for the student's grade, then its lobby. */
  private findRival(): void {
    const t = this.t;
    if (ClassRace.pending) {
      this.lobby(ClassRace.pending);
      return;
    }
    const { veil, body } = this.popup(t.rival[0]);
    const fail = this.errorLine(body);
    const line = body.querySelector('.err');
    if (line) line.textContent = t.rivalFinding;
    this.actions(body, veil);
    let tries = 0;
    const go = (): void => {
      if (!online()) {
        fail('offline');
        return;
      }
      void findRival().then((r) => {
        if (!veil.isConnected) return;
        if (typeof r === 'string') {
          fail(r);
          return;
        }
        ClassRace.join(r.play_code).then(
          (link) => {
            if (!veil.isConnected) {
              link.free();
              return;
            }
            ClassRace.pending = link;
            veil.remove();
            this.lobby(link);
          },
          (e: Error) => {
            // The duel filled a moment ago: the next one waits for a rival.
            if ((e.message === 'room_full' || e.message === 'match_started') && tries++ < 2) go();
            else fail(e.message);
          },
        );
      });
    };
    go();
  }

  /**
   * Who is in the room so far, and how it starts: in a teacher's room only
   * the teacher (from the class screen), in an open room once everyone has
   * pressed I'M READY. Waiting at the desk early is allowed: the server
   * hands out no creature before the countdown ends. When it starts, a
   * computer goes to the desk by itself; a headset cannot open its session
   * without a press, so there the button turns into TO MY DESK NOW.
   */
  private lobby(link: ClassRace): void {
    const t = this.t;
    const { veil, body } = this.popup(t.lobbyTitle);
    let stopTimer = () => {};
    const leave = () => {
      if (ClassRace.pending === link) ClassRace.pending = undefined;
      link.onChange = undefined;
      stopTimer();
      link.free();
    };
    veil.addEventListener('click', (e) => {
      if (e.target === veil) leave();
    });
    el('p', '', body).textContent = t.lobbyYou(link.name);
    const seats = el('p', '', body);
    el('div', 'step', body).textContent = t.lobbyIn;
    const names = el('div', 'names', body);
    const state = el('p', '', body);
    const early = el('p', '', body);
    early.textContent = t.deskEarly;
    const ready = el('button', 'btn wide shadow', body);
    ready.style.background = COLORS.coral;
    ready.appendChild(paperText(t.lobbyReady, 17, PAPER));
    ready.setAttribute('aria-label', t.lobbyReady);
    ready.addEventListener('click', () => link.ready());
    let timer = 0;
    stopTimer = () => window.clearInterval(timer);
    const toDesk = () => {
      link.onChange = undefined;
      window.clearInterval(timer);
      veil.remove();
      this.onPlay('class', this.device === 'xr' ? 'xr' : 'computer');
    };
    const desk = el('button', 'btn wide shadow', body);
    desk.addEventListener('click', toDesk);
    let label = '';
    const deskLabel = (text: string, background: string, ink: string) => {
      if (label === text) return;
      label = text;
      desk.replaceChildren(paperText(text, 17, ink));
      desk.style.background = background;
      desk.setAttribute('aria-label', text);
    };
    const draw = () => {
      const left = link.startsIn();
      const starting = !link.shut && (link.started || left !== null);
      if (starting && this.device !== 'xr') {
        // Starting: everyone goes to their desk now, nobody is left in the lobby.
        toDesk();
        return;
      }
      if (starting) {
        state.textContent = left === null ? t.lobbyOn : t.lobbyStarting(Math.ceil(left / 1000));
        early.style.display = 'none';
        ready.style.display = 'none';
        deskLabel(t.toDesk, COLORS.coral, PAPER);
        // The countdown ticks on here until the press.
        if (!timer) timer = window.setInterval(draw, 250);
        return;
      }
      const l = link.lobby;
      const open = l?.kind === 'open';
      const duel = l?.kind === 'duel';
      // A duel's wait for a rival ticks down here.
      if (duel && !link.shut && !timer) timer = window.setInterval(draw, 250);
      const rival = link.rivalIn();
      seats.textContent = l
        ? t.lobbySeats(l.names.length, l.seats) + (l.turn ? t.lobbyGroup(String.fromCharCode(65 + l.turn.group)) : '')
        : '';
      names.replaceChildren(
        ...(l?.names ?? []).map((n, i) => {
          const s = document.createElement('span');
          if (i === link.seat) s.className = 'me';
          s.textContent = open && l?.ready[i] ? `${n} \u2713` : n;
          return s;
        }),
      );
      const readyNow = l ? l.ready.filter(Boolean).length : 0;
      state.textContent = link.shut
        ? link.turnOver
          ? t.turnOver
          : t.roomClosed
        : open
          ? t.lobbyReadyWait(readyNow, l?.names.length ?? 0)
          : duel
            ? rival === null
              ? t.rivalFinding
              : t.lobbyRival(Math.ceil(rival / 1000))
            : t.lobbyWait;
      ready.style.display = open && !link.shut && link.seat !== null && !l?.ready[link.seat] ? '' : 'none';
      early.style.display = link.shut ? 'none' : '';
      desk.style.display = link.shut ? 'none' : '';
      deskLabel(t.waitAtDesk, '#f1e3c4', INK);
    };
    link.onChange = draw;
    draw();
    const row = el('div', 'actions', body);
    const close = el('button', 'btn shadow', row);
    close.style.background = '#f1e3c4';
    close.appendChild(paperText(t.cancel, 16, INK));
    close.setAttribute('aria-label', t.cancel);
    close.addEventListener('click', () => {
      leave();
      veil.remove();
    });
  }

  /** The class screen for a watch code, in a new tab: `/screen` on this site. */
  private openScreen(code: string, host?: string, play?: string): void {
    const hash = host ? `#host=${encodeURIComponent(host)}&play=${encodeURIComponent(play ?? '')}` : '';
    const url = `${location.origin}/screen?code=${encodeURIComponent(code)}${hash}`;
    window.open(url, '_blank', 'noopener');
  }

  /** WATCH A MATCH: a watch code, or the demo match of robots. */
  private watch(): void {
    const t = this.t;
    const { veil, body } = this.popup(t.watch[0]);
    el('div', 'step', body).textContent = t.watchCode;
    const code = this.codeBoxes(body);
    const fail = this.errorLine(body);
    const demo = el('button', 'btn wide shadow', body);
    demo.style.background = COLORS.violet;
    demo.appendChild(paperText(t.watchDemo, 17, PAPER));
    demo.setAttribute('aria-label', t.watchDemo);
    demo.addEventListener('click', () => {
      veil.remove();
      this.openScreen('WATCHX');
    });
    this.actions(body, veil, () => {
      const c = code();
      if (c.length !== 6) {
        fail('code_length');
        return;
      }
      veil.remove();
      this.openScreen(c);
    });
  }

  private errorText(code: string): string {
    return this.t.errors[code] ?? this.t.errors.other;
  }

  /** A line in a form for what went wrong; empty until then. */
  private errorLine(body: HTMLElement): (code?: string) => void {
    const line = el('p', 'err', body);
    line.setAttribute('role', 'alert');
    return (code) => {
      line.textContent = code ? this.errorText(code) : '';
    };
  }

  private emailField(body: HTMLElement): HTMLInputElement {
    const input = el('input', 'field', body);
    input.type = 'email';
    input.autocomplete = 'email';
    input.setAttribute('aria-label', this.t.emailLabel);
    return input;
  }

  private teacherSignIn(): void {
    const t = this.t;
    this.signInAsked = true;
    if (!signInConfigured) {
      this.message(t.teacher[0], t.teacherOff);
      return;
    }
    if (!online()) {
      this.message(t.teacher[0], t.offlineSignIn);
      return;
    }
    const { veil, body } = this.popup(t.teacher[0]);
    el('p', '', body).textContent = t.teacherIntro;
    // Plain text, no company logos.
    const providers = [
      [t.google, 'google'],
      [t.facebook, 'facebook'],
    ] as const;
    const buttons = providers.map(([label]) => {
      const b = el('button', 'btn wide shadow', body);
      b.textContent = label;
      return b;
    });
    const mail = el('button', 'btn wide shadow', body);
    mail.style.background = COLORS.cobalt;
    mail.appendChild(paperText(t.email, 16, PAPER));
    mail.setAttribute('aria-label', t.email);
    mail.addEventListener('click', () => {
      veil.remove();
      this.emailLink();
    });
    const showError = this.errorLine(body);
    buttons.forEach((b, i) =>
      b.addEventListener('click', () => {
        showError();
        signInWith(providers[i][1])
          .then(() => veil.remove())
          .catch((e) => showError(authErrorCode(e)));
      }),
    );
    const more = el('a', '', el('p', '', body));
    more.href = '/manage';
    more.textContent = t.manageInstead;
    more.style.color = COLORS.cobalt;
    this.actions(body, veil);
  }

  private emailLink(): void {
    const t = this.t;
    const { veil, body } = this.popup(t.email);
    el('div', 'step', body).textContent = t.emailLabel;
    const input = this.emailField(body);
    const showError = this.errorLine(body);
    const row = el('div', 'actions', body);
    const cancel = el('button', 'btn shadow', row);
    cancel.style.background = '#f1e3c4';
    cancel.appendChild(paperText(t.cancel, 16, INK));
    cancel.setAttribute('aria-label', t.cancel);
    cancel.addEventListener('click', () => veil.remove());
    const send = el('button', 'btn shadow', row);
    send.style.background = COLORS.cobalt;
    send.appendChild(paperText(t.sendLink, 16, PAPER));
    send.setAttribute('aria-label', t.sendLink);
    send.addEventListener('click', () => {
      const email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
        showError('auth/invalid-email');
        return;
      }
      showError();
      sendEmailLink(email)
        .then(() => {
          veil.remove();
          this.message(t.email, t.linkSent(email));
        })
        .catch((e) => showError(authErrorCode(e)));
    });
    input.focus();
  }

  /** An email link opened in a browser that did not send it: ask which email. */
  private confirmLinkEmail(): void {
    const t = this.t;
    const { veil, body } = this.popup(t.teacher[0]);
    el('p', '', body).textContent = t.confirmEmail;
    const input = this.emailField(body);
    const showError = this.errorLine(body);
    this.actions(body, veil, () => {
      showError();
      finishEmailLink(input.value.trim())
        .then(() => veil.remove())
        .catch((e) => showError(authErrorCode(e)));
    });
  }

  /** One-time organizer form: name, organization, kind, country, and the statement. */
  private registration(me: Me): void {
    const t = this.t;
    const { veil, body } = this.popup(t.regTitle);
    el('p', '', body).textContent = t.regIntro;
    el('div', 'step', body).textContent = t.yourName;
    const name = el('input', 'field', body);
    name.value = me.name;
    name.maxLength = 60;
    name.setAttribute('aria-label', t.yourName);
    el('div', 'step', body).textContent = t.orgName;
    const org = el('input', 'field', body);
    org.maxLength = 80;
    org.setAttribute('aria-label', t.orgName);
    el('div', 'step', body).textContent = t.orgKind;
    const kindRow = el('div', 'row', body);
    const kinds = Object.entries(t.kinds);
    let kind = kinds[0][0];
    const drawKinds = () => {
      kindRow.replaceChildren();
      for (const [k, label] of kinds) {
        const on = k === kind;
        const b = el('button', `kind${on ? ' on' : ''}`, kindRow);
        b.appendChild(paperText(label, 15, on ? PAPER : INK));
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', label);
        b.addEventListener('click', () => {
          kind = k;
          drawKinds();
        });
      }
    };
    drawKinds();
    el('div', 'step', body).textContent = t.country;
    const country = el('input', 'field short', body);
    country.maxLength = 2;
    country.value = this.lang === 'id' ? 'ID' : '';
    country.setAttribute('aria-label', t.country);
    let agree = false;
    const tick = el('button', 'tick', body);
    const mark = el('span', 'mark', tick);
    el('span', '', tick).textContent = t.statement;
    tick.setAttribute('aria-pressed', 'false');
    tick.addEventListener('click', () => {
      agree = !agree;
      tick.classList.toggle('on', agree);
      tick.setAttribute('aria-pressed', String(agree));
      mark.innerHTML = agree
        ? '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 8l4 4 8-9" stroke="#fff8ec" stroke-width="3" fill="none"/></svg>'
        : '';
    });
    const showError = this.errorLine(body);
    this.actions(body, veil, () => {
      showError();
      void register({
        name: name.value,
        org_name: org.value,
        org_kind: kind,
        country: country.value,
        terms_version: me.terms_version,
        agree,
      }).then((code) => {
        if (code) showError(code);
        else veil.remove();
      });
    });
  }

  /** The signed-in teacher: who, where, the approval status, and signing out. */
  private account(me: Me): void {
    const t = this.t;
    if (!me.organizer) {
      this.registration(me);
      return;
    }
    const { veil, body } = this.popup(t.account);
    el('p', '', body).textContent = `${me.name} (${me.email})`;
    const org = me.organizer.org;
    if (org && org.kind !== 'personal') el('p', '', body).textContent = `${org.name}, ${org.country}`;
    el('div', 'step', body).textContent = t.status[me.organizer.status];
    if (me.organizer.status === 'pending') el('p', '', body).textContent = t.pendingBody;
    // The full teacher page (classes, rooms, and for admins the organizer gate) is on the site.
    const manage = el('a', '', el('p', '', body));
    manage.href = '/manage';
    manage.textContent = t.manageLink;
    manage.style.color = COLORS.cobalt;
    const out = el('button', 'btn wide shadow', body);
    out.appendChild(paperText(t.signOut, 16, INK));
    out.setAttribute('aria-label', t.signOut);
    out.addEventListener('click', () => {
      veil.remove();
      signOut().catch((e) => console.warn('[teacher] sign out failed', e));
    });
    this.actions(body, veil);
  }
}
