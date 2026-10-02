/**
 * Player-facing text. English is the default; a second language is added as
 * another table with the same keys.
 */
import type { Highlight } from './game/core.js';

const ORDINAL = ['1ST', '2ND', '3RD'];
const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}TH`;

export const EN = {
  /** The game's name, above the book in the menu. */
  title: 'Numeria Arena',
  race: 'Robot Race',
  bot: (name: string) => `${name.toUpperCase()} (BOT)`,
  you: 'YOU',
  wave: (n: number, total: number) => `Wave ${n} of ${total}`,
  place: ordinal,
  /** A rival's line above its window, for example "4 SOLVED, 380 PTS". */
  rival: (solved: number, points: number) => `${solved} SOLVED, ${points} PTS`,
  /** Countdown, for example "0:42". */
  clock: (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  timeUp: "Time's up!",
  right: 'Got it!',
  /** Points earned, spelled out so they are never mistaken for an answer. */
  earned: (points: number) => `+${points} POINTS`,
  /** The running score above the book. */
  points: (points: number) => `${points} POINTS`,
  tryAgain: 'Try again!',
  itWas: (answer: string) => `It was ${answer}`,
  missed: 'Missed',
  bossRound: 'Boss round: 20 seconds, double points!',
  emote: { thumbs_up: 'Nice!', clap: 'Yay!' },
  recapTitle: 'Race results',
  highlight: {
    // In a race a won second try is the comeback; the badge is the save symbol.
    best_save: 'BEST COMEBACK',
    most_improved: 'MOST IMPROVED',
    sharpest_aim: 'SHARPEST AIM',
    steady_streak: 'STEADY STREAK',
    brave_try: 'BRAVE TRY',
  } satisfies Record<Highlight, string>,
  done: 'Done',
  home: 'HOME',
  popHint: 'Pop the right answer',
  orbFirst: (target: string) => `Join 2 crystals to make ${target}`,
  orbTask: (target: string) => `Make ${target}`,
  gameName: { balloon_burst: 'Balloon Burst', orb_forge: 'Orb Forge' },
  /** First time on the desk menu: what to do, under the hand that shows it. */
  touchHint: 'TOUCH AN ENVELOPE',
  language: (lang: string) => `LANG ${lang}`,
  bigText: (_on: boolean) => 'BIG NUMBERS',
  best: (points: number, stars: number) => `BEST: ${points} PTS${stars ? `, ${stars} ★` : ''}`,
  townSoon: 'FOLD TOWN: SOON',
  animal: {
    dog: 'DOG',
    rabbit: 'RABBIT',
    bird: 'BIRD',
    chicken: 'CHICKEN',
    cow: 'COW',
    fish: 'FISH',
    cat: 'CAT',
    elephant: 'ELEPHANT',
  } as Record<string, string>,
};

type Text = typeof EN;

const ORDINAL_ID = (n: number) => `KE-${n}`;

export const ID: Text = {
  title: 'Numeria Arena',
  race: 'Lomba Robot',
  bot: (name: string) => `${name.toUpperCase()} (BOT)`,
  you: 'KAMU',
  wave: (n: number, total: number) => `Gelombang ${n} dari ${total}`,
  place: ORDINAL_ID,
  rival: (solved: number, points: number) => `${solved} BENAR, ${points} POIN`,
  clock: EN.clock,
  timeUp: 'Waktu habis!',
  right: 'Benar!',
  earned: (points: number) => `+${points} POIN`,
  points: (points: number) => `${points} POIN`,
  tryAgain: 'Coba lagi!',
  itWas: (answer: string) => `Jawabannya ${answer}`,
  missed: 'Meleset',
  bossRound: 'Ronde bos: 20 detik, poin ganda!',
  emote: { thumbs_up: 'Hebat!', clap: 'Hore!' },
  recapTitle: 'Hasil lomba',
  highlight: {
    best_save: 'BANGKIT TERBAIK',
    most_improved: 'PALING MAJU',
    sharpest_aim: 'PALING JITU',
    steady_streak: 'PALING KONSISTEN',
    brave_try: 'PALING BERANI',
  },
  done: 'Selesai',
  home: 'BERANDA',
  popHint: 'Pecahkan jawaban yang benar',
  orbFirst: (target: string) => `Gabung 2 kristal jadi ${target}`,
  orbTask: (target: string) => `Buat ${target}`,
  gameName: { balloon_burst: 'Balloon Burst', orb_forge: 'Orb Forge' },
  touchHint: 'SENTUH SEBUAH AMPLOP',
  language: (lang: string) => `BAHASA ${lang}`,
  bigText: (_on: boolean) => 'ANGKA BESAR',
  best: (points: number, stars: number) => `TERBAIK: ${points} POIN${stars ? `, ${stars} ★` : ''}`,
  townSoon: 'KOTA LIPAT: SEGERA',
  animal: {
    dog: 'ANJING',
    rabbit: 'KELINCI',
    bird: 'BURUNG',
    chicken: 'AYAM',
    cow: 'SAPI',
    fish: 'IKAN',
    cat: 'KUCING',
    elephant: 'GAJAH',
  },
};

/**
 * The text in the chosen language. Read it when drawing (`T.x`), so text
 * drawn after a language change follows it.
 */
export const T: Text = { ...EN };

export function useLanguage(lang: 'en' | 'id'): void {
  Object.assign(T, lang === 'id' ? ID : EN);
}
