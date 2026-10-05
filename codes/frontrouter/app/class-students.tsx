import { useEffect } from "react";

import type { MistakeRow } from "./class-insight";
import { esc, printPage, saveXlsx } from "./export";
import type { Lang } from "./legal";

/**
 * PER STUDENT: one short line for each seat, class races and own play
 * together, with its strongest and weakest skill and its most made mistake.
 * Fixed rules from the numbers, no AI. Names come from this browser.
 */

/** First tries a seat needs in a skill before it is called strong or weak there. */
const SKILL_ENOUGH = 3;
/** First tries a seat needs before it gets a status. */
const ENOUGH = 5;

const TEXT = {
  en: {
    title: "PER STUDENT",
    note: "First tries from class races and own play together. A skill needs 3 first tries to count as strongest or weakest.",
    cols: ["Seat", "Name", "Tries", "Right", "%", "Strongest", "Weakest", "Most made mistake", "Status"],
    status: { few: "Too few answers", help: "Needs help", way: "On the way", good: "Doing well" },
    times: (n: number) => `${n}x`,
    excel: "SAVE AS EXCEL",
    pdf: "SAVE AS PDF",
    close: "CLOSE",
    sheet: "Per student",
  },
  id: {
    title: "PER SISWA",
    note: "Percobaan pertama dari lomba kelas dan main sendiri digabung. Keterampilan perlu 3 percobaan pertama untuk disebut terkuat atau terlemah.",
    cols: ["Kursi", "Nama", "Coba", "Benar", "%", "Terkuat", "Terlemah", "Salah paling sering", "Status"],
    status: { few: "Jawaban belum cukup", help: "Perlu dibantu", way: "Sedang berkembang", good: "Sudah baik" },
    times: (n: number) => `${n}x`,
    excel: "SIMPAN KE EXCEL",
    pdf: "SIMPAN KE PDF",
    close: "TUTUP",
    sheet: "Per siswa",
  },
};

interface Row {
  seat: number;
  name: string;
  tries: number;
  right: number;
  percent: number | null;
  strongest: string;
  weakest: string;
  mistake: string;
  status: string;
}

export function ClassStudents({
  lang,
  rows,
  mistakes,
  seats,
  seatName,
  skillTitle,
  mistakeTitle,
  heading,
  file,
  onClose,
}: {
  lang: Lang;
  rows: { seat: number; skill: string; right: number; total: number }[];
  mistakes: MistakeRow[];
  seats: number[];
  /** The seat's number and the name this browser keeps for it. */
  seatName: (seat: number) => string;
  skillTitle: (code: string) => string;
  mistakeTitle: (code: string) => string;
  /** The class, at the top of the saved files. */
  heading: string;
  /** The saved files' name, without the ending. */
  file: string;
  onClose: () => void;
}) {
  const t = TEXT[lang];
  useEffect(() => {
    const away = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", away);
    return () => document.removeEventListener("keydown", away);
  }, [onClose]);

  const table: Row[] = seats.map((seat) => {
    const skills = new Map<string, { right: number; total: number }>();
    for (const r of rows) {
      if (r.seat !== seat) continue;
      const s = skills.get(r.skill) ?? { right: 0, total: 0 };
      s.right += r.right;
      s.total += r.total;
      skills.set(r.skill, s);
    }
    const all = [...skills.values()];
    const right = all.reduce((n, s) => n + s.right, 0);
    const tries = all.reduce((n, s) => n + s.total, 0);
    const sure = [...skills.entries()].filter(([, s]) => s.total >= SKILL_ENOUGH).map(([k, s]) => ({ k, p: s.right / s.total }));
    sure.sort((a, b) => b.p - a.p || skillTitle(a.k).localeCompare(skillTitle(b.k)));
    const best = sure[0];
    const worst = sure.length > 1 ? sure[sure.length - 1] : undefined;
    const kinds = new Map<string, number>();
    for (const m of mistakes) if (m.seat === seat) kinds.set(m.misconception, (kinds.get(m.misconception) ?? 0) + m.count);
    const top = [...kinds.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const percent = tries > 0 ? Math.round((right / tries) * 100) : null;
    const status =
      tries < ENOUGH || percent === null ? t.status.few : percent < 50 ? t.status.help : percent < 80 ? t.status.way : t.status.good;
    return {
      seat,
      name: seatName(seat).replace(/^\d+\s*/u, ""),
      tries,
      right,
      percent,
      strongest: best ? skillTitle(best.k) : "",
      weakest: best && worst && worst.p < best.p ? skillTitle(worst.k) : "",
      mistake: top ? `${mistakeTitle(top[0])} (${t.times(top[1])})` : "",
      status,
    };
  });

  const cells = (r: Row): (string | number)[] => [
    r.seat,
    r.name,
    r.tries,
    r.right,
    r.percent ?? "",
    r.strongest,
    r.weakest,
    r.mistake,
    r.status,
  ];
  const numeric = (i: number) => i === 0 || (i >= 2 && i <= 4);

  const excel = () => saveXlsx(`${file}-${lang === "id" ? "per-siswa" : "per-student"}.xlsx`, t.sheet, [t.cols, ...table.map(cells)]);
  const pdf = () =>
    printPage(
      `${t.title} ${heading}`,
      `<h1>${esc(t.title)}: ${esc(heading)}</h1><p class="soft">${esc(t.note)}</p><table><thead><tr>${t.cols
        .map((c, i) => `<th${numeric(i) ? ' class="num"' : ""}>${esc(c)}</th>`)
        .join("")}</tr></thead><tbody>${table
        .map((r) => `<tr>${cells(r).map((v, i) => `<td${numeric(i) ? ' class="num"' : ""}>${esc(String(v))}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`,
    );

  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="paper-sheet students-sheet">
        <h2 className="dialog-title">
          {t.title}: {heading}
        </h2>
        <p className="soft">{t.note}</p>
        <div className="students-scroll">
          <table className="past-table students">
            <thead>
              <tr>
                {t.cols.map((c, i) => (
                  <th key={c} className={numeric(i) ? "num" : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.seat} className={r.status === t.status.help ? "weak" : undefined}>
                  {cells(r).map((v, i) => (
                    <td key={i} className={numeric(i) ? "num" : undefined}>
                      {i === 0 ? String(v).padStart(2, "0") : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row class-tools">
          <button type="button" className="btn small blue" onClick={excel}>
            {t.excel}
          </button>
          <button type="button" className="btn small" onClick={pdf}>
            {t.pdf}
          </button>
          <button type="button" className="btn small" onClick={onClose} autoFocus>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
