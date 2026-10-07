/**
 * Player-facing text. English is the default; a second language is added as
 * another table with the same keys.
 */
import type { Highlight } from './game/core.js';
import type { Access, Room } from './settings.js';

const ORDINAL = ['1ST', '2ND', '3RD'];
const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}TH`;

export const EN = {
  /** The game's name, above the book in the menu. */
  title: 'Numeria Arena',
  race: 'Robot Race',
  bot: (name: string) => `${name.toUpperCase()} (BOT)`,
  you: 'YOU',
  /** At the desk before a Class Match is started. */
  classWaiting: 'Waiting for the class to start...',
  /** The same, with the made-up name the class screen shows for this desk. */
  classWaitingAs: (name: string) => `You are ${name}. Waiting for your teacher...`,
  classClosed: 'The teacher closed the room.',
  classTurnOver: "Your group's turn is over: the teacher called the next group.",
  classStarting: (s: number) => `The match starts in ${s}...`,
  classStartingAs: (name: string, s: number) => `You are ${name}. Starts in ${s}...`,
  wave: (n: number, total: number) => `Wave ${n} of ${total}`,
  place: ordinal,
  /** A rival's line above its window, for example "4 SOLVED, 380 PTS". */
  rival: (solved: number, points: number) => `${solved} SOLVED, ${points} PTS`,
  /** The race card on the right: one row per round, the player's line on top. */
  roundRow: (n: number) => `WAVE ${n}`,
  bossRow: 'BOSS ×2',
  gameShort: { balloon_burst: 'BALLOONS', orb_forge: 'CRYSTALS', factory_sort: 'GATES', bridge_builder: 'PLANKS', balance_gate: 'WEIGHTS' },
  youRow: (place: number, points: number, name = 'YOU') => `${name}  ${ordinal(place)}  ${points} PTS`,
  /** The classroom's left whiteboard: its title, and a line per player, for example "1ST  YOU  380". */
  standings: 'STANDINGS',
  standingRow: (place: number, name: string, points: number) => `${ordinal(place)}  ${name}  ${points}`,
  nextRound: 'NEXT',
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
  /** The end of a practice: what it was, and the way on. */
  practiceDone: 'PRACTICE DONE',
  practiceScore: (right: number, total: number, points: number) => `${right} OF ${total} FOLDED, ${points} POINTS`,
  again: 'PRACTICE AGAIN',
  otherGame: 'OTHER GAME',
  build: 'BUILD',
  home: 'HOME',
  popHint: 'Pop the right answer',
  orbFirst: (target: string) => `Join 2 crystals to make ${target}`,
  orbTask: (target: string) => `Make ${target}`,
  balanceHint: 'Touch the weight that balances it',
  sortHint: 'Touch the gate it goes through',
  sortTask: (prompt: string, number: string) => (prompt.endsWith('?') ? `${prompt} ${number}` : `${prompt}: ${number}`),
  bridgeFirst: (target: string) => `Lay planks that make ${target}`,
  bridgeTask: (target: string) => `Bridge ${target}`,
  gameName: {
    balloon_burst: 'Balloon Burst',
    orb_forge: 'Orb Forge',
    factory_sort: 'Factory Sort',
    bridge_builder: 'Bridge Builder',
    balance_gate: 'Balance Gate',
  },
  /** First time on the desk menu: what to do, under the hand that shows it. */
  /** The heading in the games block's empty cell, over two lines. */
  gameType: 'GAME\nTYPE',
  language: (lang: string) => `LANG ${lang}`,
  bigText: (_on: boolean) => 'BIG NUMBERS',
  /** The settings cards on the desk: a small caption over a large value. */
  langCaption: 'LANGUAGE',
  bigCaption: 'BIG NUMBERS',
  accessCaption: 'ACCESSIBILITY',
  back: 'BACK',
  access: { noTimer: 'NO TIMER', contrast: 'HIGH CONTRAST', readAloud: 'READ ALOUD', steadyAim: 'STEADY AIM' } as Record<Access, string>,
  howtoAgain: 'SHOW THE HOW-TO AGAIN',
  roomCaption: 'ROOM',
  soundCaption: 'SOUND',
  musicCaption: 'MUSIC',
  roomName: { here: 'MY ROOM', classroom: 'CLASS', bedroom: 'BEDROOM' } as Record<Room, string>,
  onOff: (on: boolean): string => (on ? 'ON' : 'OFF'),
  /** The desk card that leaves a game in the headset, and what it says once pressed. */
  quit: 'QUIT',
  quitSure: 'SURE?',
  quitAgain: 'Press again to quit',
  /** The emulator-only card beside HOME that seats or stands the test headset (dev-seat.ts). */
  devSit: 'SIT',
  devStand: 'STAND',
  /** Placing the book in the headset. */
  ready: 'Ready!',
  findingTable: 'Finding your table',
  pinchToPlace: (s: number) => `Pinch to place the book, or wait ${s} s`,
  orWait: (s: number) => `or wait ${s} s`,
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
  classWaiting: 'Menunggu kelas dimulai...',
  classWaitingAs: (name: string) => `Kamu ${name}. Menunggu guru...`,
  classClosed: 'Guru menutup ruang ini.',
  classTurnOver: 'Giliran kelompokmu selesai: guru memanggil kelompok berikutnya.',
  classStarting: (s: number) => `Pertandingan mulai dalam ${s}...`,
  classStartingAs: (name: string, s: number) => `Kamu ${name}. Mulai dalam ${s}...`,
  wave: (n: number, total: number) => `Gelombang ${n} dari ${total}`,
  place: ORDINAL_ID,
  rival: (solved: number, points: number) => `${solved} BENAR, ${points} POIN`,
  roundRow: (n: number) => `GELOMBANG ${n}`,
  bossRow: 'BOS ×2',
  gameShort: { balloon_burst: 'BALON', orb_forge: 'KRISTAL', factory_sort: 'GERBANG', bridge_builder: 'PAPAN', balance_gate: 'BEBAN' },
  youRow: (place: number, points: number, name = 'KAMU') => `${name}  ${ORDINAL_ID(place)}  ${points} POIN`,
  standings: 'PERINGKAT',
  standingRow: (place: number, name: string, points: number) => `${ORDINAL_ID(place)}  ${name}  ${points}`,
  nextRound: 'BERIKUTNYA',
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
  practiceDone: 'LATIHAN SELESAI',
  practiceScore: (right: number, total: number, points: number) => `${right} DARI ${total} DILIPAT, ${points} POIN`,
  again: 'LATIH LAGI',
  otherGame: 'GAME LAIN',
  build: 'BANGUN',
  home: 'BERANDA',
  popHint: 'Pecahkan jawaban yang benar',
  orbFirst: (target: string) => `Gabung 2 kristal jadi ${target}`,
  orbTask: (target: string) => `Buat ${target}`,
  balanceHint: 'Sentuh beban yang membuatnya seimbang',
  sortHint: 'Sentuh gerbang yang dilewatinya',
  sortTask: (prompt: string, number: string) => (prompt.endsWith('?') ? `${prompt} ${number}` : `${prompt}: ${number}`),
  bridgeFirst: (target: string) => `Pasang papan yang jadi ${target}`,
  bridgeTask: (target: string) => `Jembatan ${target}`,
  gameName: {
    balloon_burst: 'Balloon Burst',
    orb_forge: 'Orb Forge',
    factory_sort: 'Factory Sort',
    bridge_builder: 'Bridge Builder',
    balance_gate: 'Balance Gate',
  },
  gameType: 'JENIS\nGAME',
  language: (lang: string) => `BAHASA ${lang}`,
  bigText: (_on: boolean) => 'ANGKA BESAR',
  langCaption: 'BAHASA',
  bigCaption: 'ANGKA BESAR',
  accessCaption: 'AKSESIBILITAS',
  back: 'KEMBALI',
  access: { noTimer: 'TANPA WAKTU', contrast: 'KONTRAS TINGGI', readAloud: 'BACAKAN SOAL', steadyAim: 'BIDIKAN STABIL' } as Record<Access, string>,
  howtoAgain: 'TAMPILKAN PETUNJUK LAGI',
  roomCaption: 'RUANG',
  soundCaption: 'SUARA',
  musicCaption: 'MUSIK',
  roomName: { here: 'RUANGANKU', classroom: 'KELAS', bedroom: 'KAMAR' } as Record<Room, string>,
  onOff: (on: boolean) => (on ? 'NYALA' : 'MATI'),
  quit: 'KELUAR',
  quitSure: 'YAKIN?',
  quitAgain: 'Tekan lagi untuk keluar',
  devSit: 'DUDUK',
  devStand: 'BERDIRI',
  ready: 'Siap!',
  findingTable: 'Mencari mejamu',
  pinchToPlace: (s: number) => `Cubit untuk menaruh buku, atau tunggu ${s} detik`,
  orWait: (s: number) => `atau tunggu ${s} detik`,
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
