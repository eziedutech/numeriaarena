import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
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
    making: "Reading the numbers...",
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
    making: "Membaca angka...",
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
}: {
  lang: Lang;
  user: User;
  /** The class's API path. */
  base: string;
  /** 0 for the whole class. */
  seat: number;
  seatName: (seat: number) => string;
}) {
  const t = TEXT[lang];
  // Per seat shown, so going back to one already made shows it again.
  const [made, setMade] = useState<Record<number, Made>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setError(""), [seat]);
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

  return (
    <div className="insight ai-insight">
      <h4>{t.title}</h4>
      {!side ? (
        <>
          <button type="button" className="btn small" onClick={make} disabled={busy}>
            {busy ? t.making : t.make}
          </button>
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
          {(["strengths", "gaps", "next"] as const).map((k) =>
            side[k].length === 0 ? null : (
              <div key={k}>
                <p className="insight-head">{t[k]}</p>
                <ul className="report-missed">
                  {side[k].map((s, i) => (
                    <li key={i}>{named(s)}</li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </>
      )}
    </div>
  );
}
