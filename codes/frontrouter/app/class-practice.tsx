import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import { robotSvg } from "./avatar";
import { esc, printPage } from "./export";
import type { Lang } from "./legal";
import { LessonLink } from "./lesson-link";

/**
 * AI PRACTICE PLAN for one seat, only when the teacher asks: the server sends
 * that seat's numbers (never a name) to the model the admin chose, checks the
 * answer and gives back one to three skills, each with what the answers show,
 * one step to take and a link to its lesson. The same numbers give the same
 * plan again without asking.
 */

interface Item {
  /** The skill's code. */
  skill: string;
  why: string;
  do: string;
}

interface Side {
  note: string;
  plan: Item[];
}

interface Made {
  plan: { en: Side; id: Side };
  at: string;
  kept: boolean;
}

const TEXT = {
  en: {
    title: "AI PRACTICE PLAN",
    make: "MAKE AI PRACTICE PLAN",
    steps: [
      "Reading this student's numbers...",
      "Asking the AI, with the seat number only and no name...",
      "Checking the plan against the numbers...",
      "Still working: this can take up to a minute.",
    ],
    seconds: (n: number) => `${n} s`,
    pdf: "SAVE AS PDF",
    about: "Made by AI from this student's numbers, with the seat number only and no name. Check it before you use it.",
    made: (at: string) => `made ${at} UTC`,
    why: "What the answers show",
    do: "Try this",
    errors: {
      ai_not_set_up: "AI is not switched on for this server. The insights above still hold.",
      ai_budget: "This month's AI budget is used up. The insights above still hold.",
      ai_failed: "The AI did not give a usable plan. Try again later; the insights above still hold.",
      insight_too_few: "Not enough answers yet: about 5 first tries are needed.",
      insight_demo_busy: "Sample classes have used their AI plans for this hour. Try again later.",
      offline: "The server cannot be reached right now.",
      other: "The AI practice plan could not be made. Try again.",
    } as Record<string, string>,
  },
  id: {
    title: "RENCANA LATIHAN AI",
    make: "BUAT RENCANA LATIHAN AI",
    steps: [
      "Membaca angka siswa ini...",
      "Bertanya ke AI, hanya dengan nomor kursi tanpa nama...",
      "Memeriksa rencana dengan angkanya...",
      "Masih bekerja: bisa sampai satu menit.",
    ],
    seconds: (n: number) => `${n} dtk`,
    pdf: "SIMPAN KE PDF",
    about: "Dibuat AI dari angka siswa ini, hanya dengan nomor kursi tanpa nama. Periksa kembali sebelum dipakai.",
    made: (at: string) => `dibuat ${at} UTC`,
    why: "Yang terlihat dari jawaban",
    do: "Coba ini",
    errors: {
      ai_not_set_up: "AI belum dinyalakan di server ini. Wawasan di atas tetap berlaku.",
      ai_budget: "Anggaran AI bulan ini sudah habis. Wawasan di atas tetap berlaku.",
      ai_failed: "AI belum memberi rencana yang bisa dipakai. Coba lagi nanti; wawasan di atas tetap berlaku.",
      insight_too_few: "Jawaban belum cukup: perlu sekitar 5 percobaan pertama.",
      insight_demo_busy: "Kelas contoh sudah memakai jatah rencana AI jam ini. Coba lagi nanti.",
      offline: "Server belum bisa dihubungi.",
      other: "Rencana latihan AI belum bisa dibuat. Coba lagi.",
    } as Record<string, string>,
  },
};

export function ClassPractice({
  lang,
  user,
  base,
  seat,
  skillTitle,
  heading,
}: {
  lang: Lang;
  user: User;
  /** The class's API path. */
  base: string;
  /** The seat shown, never 0. */
  seat: number;
  skillTitle: (code: string) => string;
  /** The class and who is shown, at the top of the saved PDF. */
  heading: string;
}) {
  const t = TEXT[lang];
  const [made, setMade] = useState<Record<number, Made>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);
  useEffect(() => setError(""), [seat]);
  useEffect(() => {
    if (!busy) return;
    setWaited(0);
    const tick = setInterval(() => setWaited((n) => n + 1), 1000);
    return () => clearInterval(tick);
  }, [busy]);
  useEffect(() => setMade({}), [base]);
  const mine = made[seat];

  const make = () => {
    setBusy(true);
    setError("");
    api<Made>(user, `${base}/practice`, { method: "POST", body: JSON.stringify({ seat }) })
      .then((m) => setMade((all) => ({ ...all, [seat]: m })))
      .catch((e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };

  const side = mine?.plan[lang];
  const step = t.steps[Math.min(t.steps.length - 1, Math.floor(waited / 3))];

  const pdf = () => {
    if (!side || !mine) return;
    const items = side.plan
      .map((p) => `<h2>${esc(skillTitle(p.skill))}</h2><p>${esc(t.why)}: ${esc(p.why)}</p><p>${esc(t.do)}: ${esc(p.do)}</p>`)
      .join("");
    printPage(
      `${t.title} ${heading}`,
      `<h1>${esc(t.title)}: ${esc(heading)}</h1><p class="soft">${esc(t.about)} ${esc(t.made(mine.at))}</p><p>${esc(side.note)}</p>${items}`,
    );
  };

  return (
    <div className="insight ai-insight">
      <h4>{t.title}</h4>
      {!side ? (
        <>
          {busy ? (
            <div className="ai-working" role="status" aria-live="polite">
              <span className="ai-robot" dangerouslySetInnerHTML={{ __html: robotSvg(44) }} />
              <span>
                <span className="ai-step">{step}</span>
                <span className="soft"> {t.seconds(waited)}</span>
              </span>
            </div>
          ) : (
            <button type="button" className="btn small" onClick={make}>
              {t.make}
            </button>
          )}
          {error && (
            <p className="err" role="alert">
              {t.errors[error] ?? t.errors.other}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="soft">
            {t.about} {t.made(mine.at)}
          </p>
          <p>{side.note}</p>
          <ul className="report-missed">
            {side.plan.map((p, i) => (
              <li key={i}>
                <div>
                  {skillTitle(p.skill)}
                  {p.skill && <LessonLink skill={p.skill} lang={lang} />}
                </div>
                <div className="soft">
                  {t.why}: {p.why}
                </div>
                <div>
                  {t.do}: {p.do}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn small" onClick={pdf}>
            {t.pdf}
          </button>
        </>
      )}
    </div>
  );
}
