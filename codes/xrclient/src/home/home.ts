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
export type PlayMode = 'practice' | 'race' | 'resume';

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
  room: '<rect width="54" height="54" fill="#fff8ec"/><rect x="7" y="9" width="40" height="26" fill="#f2716b"/><path d="M27 9h20v26H27z" fill="#c9554f"/><rect x="18" y="17" width="18" height="10" fill="#fff8ec"/><rect x="25" y="35" width="4" height="9" fill="#3a3f4b"/>',
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
#home .sym.on { background: ${COLORS.teal}; }
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
#home .err { color: #c62828; font-size: 15px; min-height: 20px; margin: 10px 0 0; }
#home .skel { display: inline-block; width: 170px; height: 13px; background: rgba(58, 63, 75, 0.14);
  animation: home-skel 1.1s ease-in-out infinite alternate; }
@keyframes home-skel { from { opacity: 0.45; } to { opacity: 1; } }
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
  /** The sign-up form opens by itself once per sign-in, not on every redraw. */
  private askedToRegister = false;

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
    onTeacher((s) => {
      this.render();
      if (s.kind === 'out') this.askedToRegister = false;
      if (s.kind === 'in' && !s.me.organizer && !this.askedToRegister) {
        this.askedToRegister = true;
        this.registration(s.me);
      }
      if (s.kind === 'error') this.message(this.t.teacher[0], this.errorText(s.code));
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

    // Left: ways to play.
    const left = el('div', 'head', this.stage);
    left.style.left = '40px';
    left.appendChild(paperText(t.play, 30, INK));
    this.card('left', 0, t.practice, 'practice', COLORS.teal, () => this.play('practice'));
    // A race left before its results can pick up again: the card says from where.
    const kept = readCheckpoint();
    const robots: [string, string] = kept ? [t.robots[0], t.resumeSub(kept.next, kept.next >= kept.card.length)] : [t.robots[0], t.robots[1]];
    this.card('left', 1, robots, 'robots', COLORS.cobalt, () => this.play('race'));
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
    // Student and teacher sign-in hide each other: a signed-in teacher gets
    // their own card and the class tools in place of the student code.
    const teacher = teacherState();
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
      this.card('right', row++, t.myClasses, 'classes', COLORS.sun, () => this.message(t.myClasses[0], t.classesSoon), true);
      this.card('right', row++, t.openRoom, 'room', COLORS.coral, () => this.message(t.openRoom[0], t.classesSoon), true);
    } else {
      this.card('right', row++, t.student, 'student', COLORS.sun, () => this.studentCode());
      const card = this.card('right', row++, t.teacher, 'teacher', COLORS.cobalt, () => this.teacherSignIn());
      if (teacher.kind === 'loading') {
        const sub = card.querySelector('.sub');
        if (sub) sub.innerHTML = '<span class="skel"></span>';
        card.setAttribute('aria-label', `${t.teacher[0]}. ${t.signingIn}`);
        card.setAttribute('aria-busy', 'true');
      }
    }
    this.card('right', row++, t.tips, 'tips', COLORS.teal, () => this.message(t.tips[0], t.soonBody.tips), true);
    this.card('right', row++, t.watch, 'watch', COLORS.violet, () => this.message(t.watch[0], t.soonBody.watch), true);

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
    // Teachers and admins: the full teacher page on the site.
    const teachers = el('button', '', footer);
    teachers.textContent = t.teacherPage;
    teachers.addEventListener('click', () => window.location.assign('/manage'));
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
    if (!signInConfigured) {
      this.message(t.teacher[0], t.serverSoon);
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
