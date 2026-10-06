/**
 * Player settings kept on this device and shared by the home page and the
 * desk: the language, larger numbers, sound, music, the room around the desk
 * in XR and the accessibility choices. Changes reach every listener.
 */
export type Lang = 'en' | 'id';

const KEY = { lang: 'numeria.lang', big: 'numeria.bigtext', room: 'numeria.room', sound: 'numeria.sound', music: 'numeria.music' };
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the setting lasts for this visit.
  }
}

let lang: Lang = read(KEY.lang) === 'id' ? 'id' : 'en';
let big = read(KEY.big) === '1';
// Sound effects and the quiet music are on until the player turns them off.
let sound = read(KEY.sound) !== '0';
let music = read(KEY.music) !== '0';

/** The room around the desk in the headset: the real one (passthrough) or a virtual one. */
export type Room = 'here' | 'classroom' | 'bedroom';
export const ROOMS: readonly Room[] = ['here', 'classroom', 'bedroom'];
let room: Room = (ROOMS as readonly string[]).includes(read(KEY.room) ?? '') ? (read(KEY.room) as Room) : 'here';

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  write(KEY.lang, l);
  document.documentElement.lang = l;
  for (const f of listeners) f();
}

/** Answers and questions this much larger when big numbers are on. */
export function textScale(): number {
  return big ? 1.3 : 1;
}

export function bigText(): boolean {
  return big;
}

export function setBigText(on: boolean): void {
  if (on === big) return;
  big = on;
  write(KEY.big, on ? '1' : '0');
  for (const f of listeners) f();
}

export function soundOn(): boolean {
  return sound;
}

export function setSound(on: boolean): void {
  if (on === sound) return;
  sound = on;
  write(KEY.sound, on ? '1' : '0');
  for (const f of listeners) f();
}

export function musicOn(): boolean {
  return music;
}

export function setMusic(on: boolean): void {
  if (on === music) return;
  music = on;
  write(KEY.music, on ? '1' : '0');
  for (const f of listeners) f();
}

export function getRoom(): Room {
  return room;
}

export function setRoom(r: Room): void {
  if (r === room) return;
  room = r;
  write(KEY.room, r);
  for (const f of listeners) f();
}

/**
 * The accessibility choices, each off until the player turns it on: no timer
 * (no speed bonus and no answer strip), high contrast (dark paper, light
 * ink), the question read aloud, and a steadier aim for a shaky hand.
 */
export type Access = 'noTimer' | 'contrast' | 'readAloud' | 'steadyAim';
export const ACCESS: readonly Access[] = ['noTimer', 'contrast', 'readAloud', 'steadyAim'];
const access = new Set<Access>(ACCESS.filter((a) => read(`numeria.${a}`) === '1'));

export function accessOn(a: Access): boolean {
  return access.has(a);
}

export function setAccess(a: Access, on: boolean): void {
  if (on === access.has(a)) return;
  if (on) access.add(a);
  else access.delete(a);
  write(`numeria.${a}`, on ? '1' : '0');
  showContrast();
  for (const f of listeners) f();
}

/** The page's own colours follow high contrast through a class on the root. */
function showContrast(): void {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('contrast', access.has('contrast'));
}
showContrast();

/** Runs `f` whenever a setting changes. */
export function onSettings(f: () => void): void {
  listeners.add(f);
}
