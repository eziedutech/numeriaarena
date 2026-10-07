import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import type { Lang } from "./legal";

/**
 * LEADERBOARD on a class's page: the same two boards the students see in the
 * game (HIGH STRIKE, the best points in one race the server judged, and MOST
 * DAYS, the days played, and CITY BUILDER, the Folds in finished buildings
 * of MY FOLD TOWN), but every seat, with the names kept in this browser.
 * The teacher also decides here whether the class takes part in GLOBAL.
 */

interface Row {
  place: number;
  name: string;
  score: number;
}

interface Boards {
  strike: Row[];
  days: Row[];
  city: Row[];
  on_global: boolean;
}

type Period = "month" | "all";

const TEXT = {
  en: {
    title: "LEADERBOARD",
    note: "What your students see in the game under MY CLASS. HIGH STRIKE counts only races the server judged: class races, rooms and FIND A RIVAL. MOST DAYS counts the days a student played anything, one a day at most. CITY BUILDER counts the Folds in the finished buildings of a student's MY FOLD TOWN (this month: finished this month).",
    periods: { month: "THIS MONTH", all: "ALL TIME" },
    month1: "A month starts on the 1st at 07:00 in Western Indonesia.",
    strike: "HIGH STRIKE",
    days: "MOST DAYS",
    city: "CITY BUILDER",
    folds: (n: number) => `${n} Folds`,
    cols: ["Place", "Student", ""],
    points: (n: number) => `${n} pts`,
    dayCount: (n: number) => (n === 1 ? "1 day" : `${n} days`),
    empty: "Nobody yet.",
    global: "Take part in GLOBAL",
    globalTrial: "A trial class shows on GLOBAL once an admin approves your account.",
    globalNote: "GLOBAL ranks every class that takes part. It shows only a student's pseudonym and the class's grade, never the class name, the school or a real name.",
    refresh: "REFRESH",
    failed: "The leaderboard could not be loaded. Try REFRESH.",
    offline: "No connection. Try again when you are online.",
  },
  id: {
    title: "PAPAN PERINGKAT",
    note: "Yang dilihat siswa di game pada KELASKU. HIGH STRIKE hanya menghitung lomba yang dinilai server: lomba kelas, ruang, dan CARI LAWAN. PALING RAJIN menghitung hari siswa bermain apa saja, paling banyak satu per hari. CITY BUILDER menghitung Folds pada bangunan MY FOLD TOWN siswa yang sudah jadi (bulan ini: yang jadi bulan ini).",
    periods: { month: "BULAN INI", all: "SEPANJANG MASA" },
    month1: "Bulan baru mulai tanggal 1 pukul 07.00 WIB.",
    strike: "HIGH STRIKE",
    days: "PALING RAJIN",
    city: "CITY BUILDER",
    folds: (n: number) => `${n} Folds`,
    cols: ["Peringkat", "Siswa", ""],
    points: (n: number) => `${n} poin`,
    dayCount: (n: number) => `${n} hari`,
    empty: "Belum ada.",
    global: "Ikut GLOBAL",
    globalTrial: "Kelas percobaan tampil di GLOBAL setelah admin menyetujui akun Anda.",
    globalNote: "GLOBAL memeringkat semua kelas yang ikut. Yang tampil hanya nama samaran siswa dan tingkat kelas, tidak pernah nama kelas, sekolah, atau nama asli.",
    refresh: "MUAT ULANG",
    failed: "Papan peringkat belum bisa dimuat. Coba MUAT ULANG.",
    offline: "Tidak ada koneksi. Coba lagi saat online.",
  },
};

const two = (n: number) => String(n).padStart(2, "0");

export function ClassLeaders({
  lang,
  user,
  base,
  active,
  seats,
  names,
  trial,
}: {
  lang: Lang;
  user: User;
  /** A trial class waits for its teacher's approval before it shows on GLOBAL. */
  trial: boolean;
  /** The class's API path. */
  base: string;
  /** An archived class keeps its boards but no longer changes GLOBAL. */
  active: boolean;
  seats: { number: number; pseudonym: string }[];
  names: Record<number, string>;
}) {
  const t = TEXT[lang];
  const [period, setPeriod] = useState<Period>("month");
  const [boards, setBoards] = useState<Boards>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    setError("");
    api<Boards>(user, `${base}/leaderboard?period=${period}`)
      .then(setBoards, (e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };
  useEffect(load, [base, period]);

  const setGlobal = (on: boolean) => {
    setBusy(true);
    setError("");
    api<{ on_global: boolean }>(user, `${base}/global`, { method: "POST", body: JSON.stringify({ on }) })
      .then((r) => setBoards((b) => b && { ...b, on_global: r.on_global }), (e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };

  // A pseudonym is unique in its class, so it finds the seat and the name kept here.
  const seatOf = new Map(seats.map((s) => [s.pseudonym, s.number]));
  const who = (pseudonym: string) => {
    const n = seatOf.get(pseudonym);
    return n === undefined ? pseudonym : `${two(n)} ${names[n] || pseudonym}`;
  };

  return (
    <section className="class-report class-leaders">
      <div className="report-head">
        <h3>{t.title}</h3>
        <div className="row">
          {(["month", "all"] as Period[]).map((p) => (
            <button key={p} type="button" className={p === period ? "tab on" : "tab"} aria-pressed={p === period} onClick={() => setPeriod(p)}>
              {t.periods[p]}
            </button>
          ))}
        </div>
      </div>
      <p className="soft">{t.note}</p>
      {period === "month" && <p className="soft">{t.month1}</p>}
      {boards && (
        <label className="board-record">
          <input type="checkbox" checked={boards.on_global} disabled={!active || busy} onChange={(e) => setGlobal(e.target.checked)} /> {t.global}
        </label>
      )}
      <p className="soft">{t.globalNote}</p>
      {trial && <p className="soft">{t.globalTrial}</p>}
      {error && (
        <p className="err" role="alert">
          {error === "offline" ? t.offline : t.failed}
        </p>
      )}
      {boards && (
        <div className="report-sources">
          {(["strike", "days", "city"] as const).map((kind) => (
            <div key={kind} className="report-source">
              <h4>{t[kind]}</h4>
              {boards[kind].length === 0 ? (
                <p className="soft">{t.empty}</p>
              ) : (
                <table className="past-table report">
                  <thead>
                    <tr>
                      {t.cols.map((c, i) => (
                        <th key={i} className={i !== 1 ? "num" : undefined}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {boards[kind].map((r) => (
                      <tr key={r.place}>
                        <td className="num">{r.place}</td>
                        <td>{who(r.name)}</td>
                        <td className="num">{kind === "strike" ? t.points(r.score) : kind === "days" ? t.dayCount(r.score) : t.folds(r.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="row class-tools">
        <button type="button" className="btn small" disabled={busy} onClick={load}>
          {t.refresh}
        </button>
      </div>
    </section>
  );
}
