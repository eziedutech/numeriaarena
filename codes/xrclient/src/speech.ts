import { accessOn, getLang, type Lang } from './settings.js';

/**
 * Reads a question aloud with the browser's own voice when READ ALOUD is on.
 * The signs a child reads as words are spoken as words; nothing is recorded
 * or sent anywhere. Browsers without speech simply stay quiet.
 */
const WORDS: Record<Lang, { over: string; times: string; divided: string; equals: string; plus: string; minus: string; percent: string }> = {
  en: { over: ' over ', times: ' times ', divided: ' divided by ', equals: ' equals ', plus: ' plus ', minus: ' minus ', percent: ' percent' },
  id: { over: ' per ', times: ' kali ', divided: ' dibagi ', equals: ' sama dengan ', plus: ' tambah ', minus: ' kurang ', percent: ' persen' },
};

function spoken(text: string, lang: Lang): string {
  const w = WORDS[lang];
  return text
    .replace(/(\d)\s*\/\s*(\d)/gu, `$1${w.over}$2`)
    .replace(/[×x](?=\s*\d)/gu, w.times)
    .replace(/÷/gu, w.divided)
    .replace(/=/gu, w.equals)
    .replace(/\+/gu, w.plus)
    .replace(/(\d)\s*[−-]\s*(\d)/gu, `$1${w.minus}$2`)
    .replace(/%/gu, w.percent)
    .replace(/[?_]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Speaks `text` in the game's language, cutting off whatever was being read. */
export function readAloud(text: string): void {
  if (!accessOn('readAloud') || typeof speechSynthesis === 'undefined') return;
  const lang = getLang();
  const say = new SpeechSynthesisUtterance(spoken(text, lang));
  say.lang = lang === 'id' ? 'id-ID' : 'en-US';
  say.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(say);
}

/** Stops reading, when the question is gone. */
export function stopReading(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
