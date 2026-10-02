/**
 * Player settings kept on this device and shared by the home page and the
 * desk: the language and larger numbers. Changes reach every listener.
 */
export type Lang = 'en' | 'id';

const KEY = { lang: 'numeria.lang', big: 'numeria.bigtext' };
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

/** Runs `f` whenever a setting changes. */
export function onSettings(f: () => void): void {
  listeners.add(f);
}
