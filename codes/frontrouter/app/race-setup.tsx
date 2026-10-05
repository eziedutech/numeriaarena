import type { Lang } from "./legal";

/**
 * How a new race room is raced: which games, how many rounds of how many
 * seconds, and how hard the questions are aimed. The server checks the same
 * bounds. The last choice is kept in this browser, so the RACE button on a
 * class's page opens the same kind of room.
 */

export type RoomGame = "balloon_burst" | "orb_forge" | "factory_sort" | "bridge_builder" | "balance_gate";
export type Level = "adaptive" | "easier" | "harder";

export interface RoomSetup {
  games: RoomGame[];
  rounds: number;
  seconds: number;
  level: Level;
}

export const GAMES: RoomGame[] = ["balloon_burst", "orb_forge", "factory_sort", "bridge_builder", "balance_gate"];
const LEVELS: Level[] = ["adaptive", "easier", "harder"];
const ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SECONDS = [30, 45, 60, 90, 120, 180];
/** Longest race, counting every round but not the final one. */
const MAX_TOTAL = 15 * 60;
const KEY = "numeria.raceSetup";

export const USUAL: RoomSetup = { games: ["balloon_burst", "orb_forge"], rounds: 3, seconds: 60, level: "adaptive" };

const TEXT = {
  en: {
    title: "HOW IT IS RACED",
    games: "Games, raced in this order",
    rounds: "Rounds",
    seconds: "Seconds a round",
    level: "Questions",
    levels: {
      adaptive: "ADAPTIVE (USUAL)",
      easier: "EASIER",
      harder: "HARDER",
    } as Record<Level, string>,
    levelNote: {
      adaptive: "Each student gets questions at their own level.",
      easier: "Each student's questions are aimed a little easier than their level: good for a first race or a new topic.",
      harder: "Each student's questions are aimed a little harder than their level: good for a challenge day.",
    } as Record<Level, string>,
    order: "Order",
    final: "then a short final round",
    total: (m: number, s: number) => `About ${m} min${s ? ` ${s} s` : ""} of rounds`,
    usual: "USUAL RACE",
    names: {
      balloon_burst: "Balloon Burst",
      orb_forge: "Orb Forge",
      factory_sort: "Factory Sort",
      bridge_builder: "Bridge Builder",
      balance_gate: "Balance Gate",
    } as Record<RoomGame, string>,
    summary: (games: string, rounds: number, seconds: number, level: string) =>
      `${games} · ${rounds} ${rounds === 1 ? "round" : "rounds"} of ${seconds} s · ${level}`,
    short: { adaptive: "adaptive", easier: "easier", harder: "harder" } as Record<Level, string>,
  },
  id: {
    title: "CARA LOMBANYA",
    games: "Game, dilombakan berurutan",
    rounds: "Babak",
    seconds: "Detik per babak",
    level: "Soal",
    levels: {
      adaptive: "ADAPTIF (BAWAAN)",
      easier: "LEBIH MUDAH",
      harder: "LEBIH SULIT",
    } as Record<Level, string>,
    levelNote: {
      adaptive: "Tiap siswa mendapat soal sesuai tingkatnya sendiri.",
      easier: "Soal tiap siswa dibuat sedikit lebih mudah dari tingkatnya: cocok untuk lomba pertama atau topik baru.",
      harder: "Soal tiap siswa dibuat sedikit lebih sulit dari tingkatnya: cocok untuk hari tantangan.",
    } as Record<Level, string>,
    order: "Urutan",
    final: "lalu babak final singkat",
    total: (m: number, s: number) => `Sekitar ${m} menit${s ? ` ${s} detik` : ""} babak`,
    usual: "LOMBA BAWAAN",
    names: {
      balloon_burst: "Balloon Burst",
      orb_forge: "Orb Forge",
      factory_sort: "Factory Sort",
      bridge_builder: "Bridge Builder",
      balance_gate: "Balance Gate",
    } as Record<RoomGame, string>,
    summary: (games: string, rounds: number, seconds: number, level: string) =>
      `${games} · ${rounds} babak @ ${seconds} detik · ${level}`,
    short: { adaptive: "adaptif", easier: "lebih mudah", harder: "lebih sulit" } as Record<Level, string>,
  },
};

const fits = (rounds: number, seconds: number) => rounds * seconds <= MAX_TOTAL;

/** A setup the server takes, from anything (a stored one may be old). */
export function clean(s: Partial<RoomSetup> | null | undefined): RoomSetup {
  const games = Array.isArray(s?.games) ? GAMES.filter((g) => s.games!.includes(g)) : [];
  const rounds = ROUNDS.includes(Number(s?.rounds)) ? Number(s?.rounds) : USUAL.rounds;
  const seconds = SECONDS.includes(Number(s?.seconds)) ? Number(s?.seconds) : USUAL.seconds;
  const level = LEVELS.includes(s?.level as Level) ? (s?.level as Level) : USUAL.level;
  if (games.length === 0 || !fits(rounds, seconds)) return { ...USUAL, level };
  // Keep the order the games were picked in.
  return { games: [...new Set(s!.games!.filter((g) => games.includes(g)))], rounds, seconds, level };
}

export function readSetup(): RoomSetup {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return USUAL;
  }
}

function keep(s: RoomSetup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // A private window may refuse; the choice just lasts this visit.
  }
}

/** One line for a room's ticket: its games, rounds and level. */
export function describe(lang: Lang, setup: RoomSetup | null | undefined): string {
  const t = TEXT[lang];
  const s = clean(setup);
  return t.summary(s.games.map((g) => t.names[g]).join(", "), s.rounds, s.seconds, t.short[s.level]);
}

export function RaceSetup({ lang, setup, onChange }: { lang: Lang; setup: RoomSetup; onChange: (s: RoomSetup) => void }) {
  const t = TEXT[lang];
  const set = (next: RoomSetup) => {
    keep(next);
    onChange(next);
  };
  const toggle = (g: RoomGame) => {
    const on = setup.games.includes(g);
    if (on && setup.games.length === 1) return;
    set({ ...setup, games: on ? setup.games.filter((x) => x !== g) : [...setup.games, g] });
  };
  const order = Array.from({ length: setup.rounds }, (_, i) => t.names[setup.games[i % setup.games.length]]);
  const total = setup.rounds * setup.seconds;
  const usual = JSON.stringify(setup) === JSON.stringify(USUAL);
  return (
    <div className="race-setup">
      <h3>{t.title}</h3>
      <span className="field-label">{t.games}</span>
      <div className="tabs" role="group" aria-label={t.games}>
        {GAMES.map((g) => {
          const at = setup.games.indexOf(g);
          return (
            <button key={g} type="button" className={at >= 0 ? "tab on" : "tab"} aria-pressed={at >= 0} onClick={() => toggle(g)}>
              {at >= 0 ? `${at + 1}. ` : ""}
              {t.names[g]}
            </button>
          );
        })}
      </div>
      <span className="field-label">{t.rounds}</span>
      <div className="tabs" role="group" aria-label={t.rounds}>
        {ROUNDS.map((r) => (
          <button
            key={r}
            type="button"
            className={r === setup.rounds ? "tab on" : "tab"}
            aria-pressed={r === setup.rounds}
            disabled={!fits(r, setup.seconds)}
            onClick={() => set({ ...setup, rounds: r })}
          >
            {r}
          </button>
        ))}
      </div>
      <span className="field-label">{t.seconds}</span>
      <div className="tabs" role="group" aria-label={t.seconds}>
        {SECONDS.map((s) => (
          <button
            key={s}
            type="button"
            className={s === setup.seconds ? "tab on" : "tab"}
            aria-pressed={s === setup.seconds}
            disabled={!fits(setup.rounds, s)}
            onClick={() => set({ ...setup, seconds: s })}
          >
            {s}
          </button>
        ))}
      </div>
      <span className="field-label">{t.level}</span>
      <div className="tabs" role="group" aria-label={t.level}>
        {LEVELS.map((l) => (
          <button key={l} type="button" className={l === setup.level ? "tab on" : "tab"} aria-pressed={l === setup.level} onClick={() => set({ ...setup, level: l })}>
            {t.levels[l]}
          </button>
        ))}
      </div>
      <p className="soft">{t.levelNote[setup.level]}</p>
      <p className="soft">
        {t.order}: {order.join(", ")}, {t.final}. {t.total(Math.floor(total / 60), total % 60)}.
      </p>
      {!usual && (
        <button type="button" className="btn small" onClick={() => set({ ...USUAL })}>
          {t.usual}
        </button>
      )}
    </div>
  );
}
