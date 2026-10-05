import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import { ClassAi } from "./class-ai";
import { ClassStudents } from "./class-students";
import { ClassInsight, type MistakeRow, type MistakeWords, words } from "./class-insight";
import type { Lang } from "./legal";
import { Pick } from "./pick";

/**
 * REPORT on a class's page: first tries by skill and by question, for the
 * whole class or one seat. Class races (rooms the teacher opened, the official
 * record) and own play (practice and races with robots, sent by the game) are
 * shown apart. Names come from this browser, in the downloaded file too.
 */

interface I18n {
  en: string;
  id: string;
}

interface ReportRow {
  seat: number;
  source: "class" | "own";
  template_id: string;
  skill: string;
  right: number;
  total: number;
}

interface Report {
  skills: Record<string, I18n>;
  /** `example` is one question made from the template, with real numbers. */
  templates: Record<string, { skill: string; prompt: I18n; example: I18n | null }>;
  rows: ReportRow[];
  /** Wrong first tries by the kind of mistake their answer showed. */
  mistakes: (MistakeRow & { source: "class" | "own" })[];
  /** Title and a sentence for each kind of mistake above that has them. */
  misconceptions?: Record<string, { title: I18n; note: I18n }>;
}

/** A skill is called the weakest only with at least this many first tries. */
const ENOUGH = 5;
/** Questions listed as missed most. */
const MISSED = 3;

const TEXT = {
  en: {
    title: "REPORT",
    note: "Only first tries count: a second try has already seen the answer. Own play reaches this page when the student plays signed in to their seat.",
    whole: "Whole class",
    seat: (n: string, name: string) => `Seat ${n}${name ? `, ${name}` : ""}`,
    pick: "Show",
    sources: { class: "CLASS RACES", own: "OWN PLAY" },
    cols: ["Skill", "Right", "Tries", "%"],
    nothing: "No answers yet.",
    weakest: "weakest",
    missed: "Missed most",
    like: "like",
    wrongOf: (wrong: number, total: number) => `${wrong} wrong of ${total}`,
    refresh: "REFRESH",
    download: "DOWNLOAD THE REPORT (CSV)",
    students: "PER STUDENT",
    errors: {
      class_not_found: "That class is gone.",
      offline: "The server cannot be reached right now.",
      other: "The report could not be loaded. Try again.",
    } as Record<string, string>,
  },
  id: {
    title: "LAPORAN",
    note: "Hanya percobaan pertama yang dihitung: percobaan kedua sudah melihat jawabannya. Main sendiri sampai ke halaman ini bila siswa bermain sambil masuk ke kursinya.",
    whole: "Seluruh kelas",
    seat: (n: string, name: string) => `Kursi ${n}${name ? `, ${name}` : ""}`,
    pick: "Tampilkan",
    sources: { class: "LOMBA KELAS", own: "MAIN SENDIRI" },
    cols: ["Keterampilan", "Benar", "Coba", "%"],
    nothing: "Belum ada jawaban.",
    weakest: "terlemah",
    missed: "Paling sering salah",
    like: "misalnya",
    wrongOf: (wrong: number, total: number) => `${wrong} salah dari ${total}`,
    refresh: "MUAT ULANG",
    download: "UNDUH LAPORAN (CSV)",
    students: "PER SISWA",
    errors: {
      class_not_found: "Kelas itu sudah tidak ada.",
      offline: "Server belum bisa dihubungi.",
      other: "Laporan belum bisa dimuat. Coba lagi.",
    } as Record<string, string>,
  },
};

const two = (n: number) => String(n).padStart(2, "0");
const percent = (right: number, total: number) => (total > 0 ? Math.round((right / total) * 100) : 0);
/** A question with its numbers left out, when no example could be made. */
const blank = (prompt: string) => prompt.replace(/\{[^}]*\}/gu, "...");
const cell = (v: string) => (/[",\n\r]/u.test(v) ? `"${v.replace(/"/gu, '""')}"` : v);

interface Tally {
  key: string;
  right: number;
  total: number;
}

function tally(rows: ReportRow[], by: (r: ReportRow) => string): Tally[] {
  const all = new Map<string, Tally>();
  for (const r of rows) {
    const key = by(r);
    const t = all.get(key) ?? { key, right: 0, total: 0 };
    t.right += r.right;
    t.total += r.total;
    all.set(key, t);
  }
  return [...all.values()];
}

export function ClassReport({
  lang,
  user,
  base,
  file,
  heading,
  seats,
  names,
}: {
  lang: Lang;
  user: User;
  /** The class's API path. */
  base: string;
  /** The downloaded file's name, without `.csv`. */
  file: string;
  /** The class's label and year, at the top of saved PDFs. */
  heading: string;
  seats: { number: number; pseudonym: string }[];
  names: Record<number, string>;
}) {
  const t = TEXT[lang];
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(0);
  const [students, setStudents] = useState(false);

  const load = () => {
    setBusy(true);
    setError("");
    api<Report>(user, `${base}/report`)
      .then(setReport, (e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };
  useEffect(load, [base]);

  const skillTitle = (code: string) => report?.skills[code]?.[lang] ?? code;
  const mistake = (code: string): MistakeWords => {
    const m = report?.misconceptions?.[code];
    return m ? { title: m.title[lang], note: m.note[lang] } : { title: words(code) };
  };
  const question = (tpl: Report["templates"][string] | undefined, id: string) =>
    tpl ? (tpl.example?.[lang] ?? blank(tpl.prompt[lang])) : id;
  const rows = (report?.rows ?? []).filter((r) => pick === 0 || r.seat === pick);
  const mistakes = (report?.mistakes ?? []).filter((m) => pick === 0 || m.seat === pick);
  const seatName = (n: number) => {
    const s = seats.find((x) => x.number === n);
    return `${two(n)} ${names[n] || s?.pseudonym || ""}`.trim();
  };

  const download = () => {
    if (!report) return;
    const pseudonym = new Map(seats.map((s) => [s.number, s.pseudonym]));
    const lines = [
      "seat,pseudonym,name,source,skill,skill_title,question,right,tries",
      ...report.rows.map((r) =>
        [
          String(r.seat),
          pseudonym.get(r.seat) ?? "",
          names[r.seat] ?? "",
          r.source,
          r.skill,
          skillTitle(r.skill),
          question(report.templates[r.template_id], r.template_id),
          String(r.right),
          String(r.total),
        ]
          .map(cell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file}-report.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="class-report">
      <div className="report-head">
        <h3>{t.title}</h3>
        <label className="report-pick">
          <span className="soft">{t.pick}</span>
          <Pick
            className="group"
            label={t.pick}
            value={pick}
            onChange={setPick}
            options={[{ value: 0, label: t.whole }, ...seats.map((s) => ({ value: s.number, label: t.seat(two(s.number), names[s.number] || s.pseudonym) }))]}
          />
        </label>
      </div>
      <p className="soft">{t.note}</p>
      {error && (
        <p className="err" role="alert">
          {t.errors[error] ?? t.errors.other}
        </p>
      )}
      {report && (
        <ClassInsight lang={lang} rows={rows} mistakes={mistakes} whole={pick === 0} skillTitle={skillTitle} mistake={mistake} seatName={seatName} />
      )}
      {report && <ClassAi lang={lang} user={user} base={base} seat={pick} seatName={seatName} heading={`${heading}, ${pick === 0 ? t.whole : t.seat(two(pick), names[pick] || seats.find((s) => s.number === pick)?.pseudonym || "")}`} />}
      {report && (
        <div className="report-sources">
          {(["class", "own"] as const).map((source) => {
            const mine = rows.filter((r) => r.source === source);
            const skills = tally(mine, (r) => r.skill).sort((a, b) => skillTitle(a.key).localeCompare(skillTitle(b.key)));
            const sure = skills.filter((s) => s.total >= ENOUGH);
            const weakest = sure.length > 1 ? sure.reduce((w, s) => (s.right / s.total < w.right / w.total ? s : w)).key : "";
            const missed = tally(mine, (r) => r.template_id)
              .filter((q) => q.total > q.right)
              .sort((a, b) => b.total - b.right - (a.total - a.right))
              .slice(0, MISSED);
            return (
              <div key={source} className="report-source">
                <h4>{t.sources[source]}</h4>
                {skills.length === 0 ? (
                  <p className="soft">{t.nothing}</p>
                ) : (
                  <>
                    <table className="past-table report">
                      <thead>
                        <tr>
                          {t.cols.map((c, i) => (
                            <th key={c} className={i > 0 ? "num" : undefined}>
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {skills.map((s) => (
                          <tr key={s.key} className={s.key === weakest ? "weak" : undefined}>
                            <td>
                              {skillTitle(s.key)}
                              {s.key === weakest && <span className="past-state weak-tag">{t.weakest}</span>}
                            </td>
                            <td className="num">{s.right}</td>
                            <td className="num">{s.total}</td>
                            <td className="num">{percent(s.right, s.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {missed.length > 0 && (
                      <>
                        <p className="report-missed-title">{t.missed}</p>
                        <ul className="report-missed">
                          {missed.map((q) => {
                            const tpl = report.templates[q.key];
                            return (
                              <li key={q.key}>
                                <div>
                                  {tpl?.example && <span className="soft">{t.like} </span>}
                                  {question(tpl, q.key)}
                                </div>
                                <div className="soft">
                                  {tpl ? `${skillTitle(tpl.skill)} · ` : ""}
                                  {t.wrongOf(q.total - q.right, q.total)}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="row class-tools">
        <button type="button" className="btn small" disabled={busy} onClick={load}>
          {t.refresh}
        </button>
        <button type="button" className="btn small" disabled={!report || report.rows.length === 0} onClick={download}>
          {t.download}
        </button>
        <button type="button" className="btn small" disabled={!report || report.rows.length === 0} onClick={() => setStudents(true)}>
          {t.students}
        </button>
      </div>
      {students && report && (
        <ClassStudents
          lang={lang}
          rows={report.rows}
          mistakes={report.mistakes}
          seats={seats.map((s) => s.number)}
          seatName={seatName}
          skillTitle={skillTitle}
          mistakeTitle={(code) => mistake(code).title}
          heading={heading}
          file={file}
          onClose={() => setStudents(false)}
        />
      )}
    </section>
  );
}
