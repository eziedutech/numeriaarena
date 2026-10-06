import type { Lang } from "./legal";
import { LessonLink } from "./lesson-link";

/**
 * INSIGHTS above a class's report, made by fixed rules from the same numbers
 * (no AI): each skill as strong, middle or needs practice, the mistakes made
 * most, and what to practise next, for the whole class or one seat. Class
 * races and own play count together here; the tables below keep them apart.
 */

export interface InsightRow {
  seat: number;
  skill: string;
  right: number;
  total: number;
}

export interface MistakeRow {
  seat: number;
  skill: string;
  misconception: string;
  count: number;
}

/** First tries a skill needs before it gets a status. */
const ENOUGH = 5;
const STRONG = 0.8;
const MIDDLE = 0.5;
/** A seat needs this many first tries in a skill to be named as needing help. */
const SEAT_ENOUGH = 3;

type Level = "strong" | "middle" | "practice" | "few";
const LEVELS: Level[] = ["practice", "middle", "strong", "few"];

const TEXT = {
  en: {
    title: "INSIGHTS",
    note: "Made by fixed rules from the answers below, class races and own play together. Not made by AI.",
    levels: { strong: "STRONG", middle: "IN BETWEEN", practice: "NEEDS PRACTICE", few: "NOT ENOUGH ANSWERS YET" },
    mistakes: "Mistakes made most",
    students: (n: number) => `${n} ${n === 1 ? "student" : "students"}`,
    times: (n: number) => `${n} ${n === 1 ? "time" : "times"}`,
    next: "What to practise next",
    practise: (skill: string) => `Practise ${skill}`,
    keepGoing: (skill: string) => `Keep practising ${skill}`,
    watch: (m: string) => `watch for: ${m}`,
    help: "most help needed:",
    none: "Not enough answers yet for insights: about 5 first tries a skill.",
    allGood: "Every skill with enough answers is strong. Try harder levels or new skills.",
  },
  id: {
    title: "WAWASAN",
    note: "Dibuat dengan aturan tetap dari jawaban di bawah, lomba kelas dan main sendiri digabung. Bukan buatan AI.",
    levels: { strong: "KUAT", middle: "SEDANG", practice: "PERLU LATIHAN", few: "BELUM CUKUP JAWABAN" },
    mistakes: "Kesalahan paling sering",
    students: (n: number) => `${n} siswa`,
    times: (n: number) => `${n} kali`,
    next: "Yang perlu dilatih berikutnya",
    practise: (skill: string) => `Latih ${skill}`,
    keepGoing: (skill: string) => `Terus latih ${skill}`,
    watch: (m: string) => `perhatikan: ${m}`,
    help: "paling perlu dibantu:",
    none: "Jawaban belum cukup untuk wawasan: sekitar 5 percobaan pertama per skill.",
    allGood: "Semua skill yang jawabannya cukup sudah kuat. Coba tingkat lebih sulit atau skill baru.",
  },
};

/** A mistake's code read as words (`added_denominators` as "added denominators"), for a code with no title yet. */
export const words = (code: string) => code.replace(/_/gu, " ");

/** A kind of mistake as the teacher reads it: a short title and one sentence. */
export interface MistakeWords {
  title: string;
  note?: string;
}

function level(right: number, total: number): Level {
  if (total < ENOUGH) return "few";
  const r = right / total;
  return r >= STRONG ? "strong" : r >= MIDDLE ? "middle" : "practice";
}

export function ClassInsight({
  lang,
  rows,
  mistakes,
  whole,
  skillTitle,
  mistake,
  seatName,
}: {
  lang: Lang;
  /** First tries of the class or of the seat shown. */
  rows: InsightRow[];
  mistakes: MistakeRow[];
  /** The whole class, not one seat. */
  whole: boolean;
  skillTitle: (code: string) => string;
  mistake: (code: string) => MistakeWords;
  seatName: (seat: number) => string;
}) {
  const t = TEXT[lang];

  const bySkill = new Map<string, { right: number; total: number }>();
  for (const r of rows) {
    const s = bySkill.get(r.skill) ?? { right: 0, total: 0 };
    s.right += r.right;
    s.total += r.total;
    bySkill.set(r.skill, s);
  }
  const skills = [...bySkill].map(([code, s]) => ({ code, ...s, level: level(s.right, s.total), ratio: s.total ? s.right / s.total : 0 }));
  if (skills.every((s) => s.level === "few")) {
    return (
      <div className="insight">
        <h4>{t.title}</h4>
        <p className="soft">{t.none}</p>
      </div>
    );
  }

  // Each mistake: how many students made it (class) or how many times (one seat).
  const byMistake = new Map<string, { skill: string; code: string; seats: Set<number>; count: number }>();
  for (const m of mistakes) {
    const key = `${m.skill} ${m.misconception}`;
    const e = byMistake.get(key) ?? { skill: m.skill, code: m.misconception, seats: new Set<number>(), count: 0 };
    e.seats.add(m.seat);
    e.count += m.count;
    byMistake.set(key, e);
  }
  const weight = (e: { seats: Set<number>; count: number }) => (whole ? e.seats.size * 1000 + e.count : e.count);
  const topMistakes = [...byMistake.values()].sort((a, b) => weight(b) - weight(a)).slice(0, 3);

  // Skills needing practice, weakest first; if none, the weakest in between.
  const practice = skills.filter((s) => s.level === "practice").sort((a, b) => a.ratio - b.ratio);
  const focus = practice.length > 0 ? practice.slice(0, 3) : skills.filter((s) => s.level === "middle").sort((a, b) => a.ratio - b.ratio).slice(0, 1);

  const needHelp = (skill: string) => {
    const seats = new Map<number, { right: number; total: number }>();
    for (const r of rows.filter((r) => r.skill === skill)) {
      const s = seats.get(r.seat) ?? { right: 0, total: 0 };
      s.right += r.right;
      s.total += r.total;
      seats.set(r.seat, s);
    }
    return [...seats]
      .filter(([, s]) => s.total >= SEAT_ENOUGH && s.right / s.total < MIDDLE)
      .sort(([, a], [, b]) => a.right / a.total - b.right / b.total)
      .slice(0, 3)
      .map(([seat]) => seatName(seat));
  };
  const topMistakeOf = (skill: string) => [...byMistake.values()].filter((e) => e.skill === skill).sort((a, b) => weight(b) - weight(a))[0];

  return (
    <div className="insight">
      <h4>{t.title}</h4>
      <p className="soft">{t.note}</p>
      <div className="insight-levels">
        {LEVELS.map((l) => {
          const these = skills.filter((s) => s.level === l);
          if (these.length === 0) return null;
          return (
            <div key={l} className={`insight-level ${l}`}>
              <span className="insight-level-name">{t.levels[l]}</span>
              {these.map((s) => (
                <span key={s.code} className="insight-skill">
                  {skillTitle(s.code)} <span className="soft">{s.total >= ENOUGH ? `${Math.round(s.ratio * 100)}%` : `${s.right}/${s.total}`}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {topMistakes.length > 0 && (
        <>
          <p className="insight-head">{t.mistakes}</p>
          <ul className="report-missed">
            {topMistakes.map((e) => (
              <li key={`${e.skill} ${e.code}`}>
                <div>{mistake(e.code).title}</div>
                {mistake(e.code).note && <div className="soft">{mistake(e.code).note}</div>}
                <div className="soft">
                  {skillTitle(e.skill)} · {whole ? t.students(e.seats.size) : t.times(e.count)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="insight-head">{t.next}</p>
      {focus.length === 0 ? (
        <p>{t.allGood}</p>
      ) : (
        <ul className="report-missed">
          {focus.map((s) => {
            const m = topMistakeOf(s.code);
            const help = whole ? needHelp(s.code) : [];
            return (
              <li key={s.code}>
                <div>
                  {s.level === "practice" ? t.practise(skillTitle(s.code)) : t.keepGoing(skillTitle(s.code))}
                  <LessonLink skill={s.code} lang={lang} />
                </div>
                {m && <div className="soft">{t.watch(mistake(m.code).title.toLowerCase())}</div>}
                {help.length > 0 && (
                  <div className="soft">
                    {t.help} {help.join(", ")}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
