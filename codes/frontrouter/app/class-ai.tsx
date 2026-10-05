import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import { robotSvg } from "./avatar";
import { esc, printPage } from "./export";
import type { Lang } from "./legal";

/**
 * AI INSIGHTS under the fixed-rule ones, only when the teacher asks: the
 * server sends the report's numbers (seat numbers, never names) to the
 * model the admin chose and checks what comes back. The same numbers give
 * the same insight again without asking. Seat numbers in it are read with
 * the names kept in this browser.
 */

interface Side {
  summary: string;
  strengths: string[];
  gaps: string[];
  next: string[];
}

interface Made {
  insight: { en: Side; id: Side };
  at: string;
  kept: boolean;
}

const TEXT = {
  en: {
    title: "AI INSIGHTS",
    make: "MAKE AI INSIGHTS",
    steps: [
      "Reading the class's numbers...",
      "Asking the AI, with seat numbers only and no names...",
      "Checking the answer against the numbers...",
      "Still working: this can take up to a minute.",
    ],
    seconds: (n: number) => `${n} s`,
    pdf: "SAVE AS PDF",
    about: "Made by AI from the numbers above, with seat numbers only and no names. Check it before you use it.",
    made: (at: string) => `made ${at} UTC`,
    strengths: "Going well",
    gaps: "Needs work",
    next: "What to do next",
    seat: /\bseats? (\d+)/giu,
    errors: {
      ai_not_set_up: "AI is not switched on for this server. The insights above still hold.",
      ai_budget: "This month's AI budget is used up. The insights above still hold.",
      ai_failed: "The AI did not give a usable answer. Try again later; the insights above still hold.",
      insight_too_few: "Not enough answers yet: about 5 first tries are needed.",
      insight_demo_busy: "Sample classes have used their AI insights for this hour. Try again later.",
      offline: "The server cannot be reached right now.",
      other: "AI insights could not be made. Try again.",
    } as Record<string, string>,
  },
  id: {
    title: "WAWASAN AI",
    make: "BUAT WAWASAN AI",
    steps: [
      "Membaca angka kelas...",
      "Bertanya ke AI, hanya dengan nomor kursi tanpa nama...",
      "Memeriksa jawaban dengan angkanya...",
      "Masih bekerja: bisa sampai satu menit.",
    ],
    seconds: (n: number) => `${n} dtk`,
    pdf: "SIMPAN KE PDF",
    about: "Dibuat AI dari angka di atas, hanya dengan nomor kursi tanpa nama. Periksa kembali sebelum dipakai.",
    made: (at: string) => `dibuat ${at} UTC`,
    strengths: "Sudah baik",
    gaps: "Perlu dikuatkan",
    next: "Langkah berikutnya",
    seat: /\bkursi (\d+)/giu,
    errors: {
      ai_not_set_up: "AI belum dinyalakan di server ini. Wawasan di atas tetap berlaku.",
      ai_budget: "Anggaran AI bulan ini sudah habis. Wawasan di atas tetap berlaku.",
      ai_failed: "AI belum memberi jawaban yang bisa dipakai. Coba lagi nanti; wawasan di atas tetap berlaku.",
      insight_too_few: "Jawaban belum cukup: perlu sekitar 5 percobaan pertama.",
      insight_demo_busy: "Kelas contoh sudah memakai jatah wawasan AI jam ini. Coba lagi nanti.",
      offline: "Server belum bisa dihubungi.",
      other: "Wawasan AI belum bisa dibuat. Coba lagi.",
    } as Record<string, string>,
  },
};

export function ClassAi({
  lang,
  user,
  base,
  seat,
  seatName,
  heading,
}: {
  lang: Lang;
  user: User;
  /** The class's API path. */
  base: string;
  /** 0 for the whole class. */
  seat: number;
  seatName: (seat: number) => string;
  /** The class and who is shown, at the top of the saved PDF. */
  heading: string;
}) {
  const t = TEXT[lang];
  // Per seat shown, so going back to one already made shows it again.
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
    api<Made>(user, `${base}/insight`, { method: "POST", body: JSON.stringify({ seat }) })
      .then((m) => setMade((all) => ({ ...all, [seat]: m })))
      .catch((e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };

  // "seat 3" reads as the seat's number and the name this browser keeps for it.
  const named = (s: string) => s.replace(t.seat, (all, n: string) => `${all.split(" ")[0]} ${seatName(Number(n))}`);
  const side = mine?.insight[lang];
  // A new step every few seconds, staying on the last.
  const step = t.steps[Math.min(t.steps.length - 1, Math.floor(waited / 3))];
  const lists = (["strengths", "gaps", "next"] as const).filter((k) => side && side[k].length > 0);

  const pdf = () => {
    if (!side || !mine) return;
    const items = lists
      .map((k) => `<h2>${esc(t[k])}</h2><ul>${side[k].map((s) => `<li>${esc(named(s))}</li>`).join("")}</ul>`)
      .join("");
    printPage(
      `${t.title} ${heading}`,
      `<h1>${esc(t.title)}: ${esc(heading)}</h1><p class="soft">${esc(t.about)} ${esc(t.made(mine.at))}</p><p>${esc(named(side.summary))}</p>${items}`,
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
          <p>{named(side.summary)}</p>
          {lists.map((k) => (
            <div key={k}>
              <p className="insight-head">{t[k]}</p>
              <ul className="report-missed">
                {side[k].map((s, i) => (
                  <li key={i}>{named(s)}</li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="btn small" onClick={pdf}>
            {t.pdf}
          </button>
        </>
      )}
    </div>
  );
}
