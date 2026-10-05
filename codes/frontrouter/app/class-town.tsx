import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import type { Lang } from "./legal";

/**
 * FOLD TOWN MAP on a class's page: each land of a student's MY FOLD TOWN is
 * one cell of the class's map. A student picks the cell of their first land
 * in the game; a later land joins beside their own. Seat numbers come from
 * the server, names only from this browser.
 */

type Kind = "plain" | "river" | "hills" | "beach";

interface Cell {
  x: number;
  y: number;
  kind: Kind;
  land: number;
  name: string;
  seat: number;
}

interface TownMap {
  cols: number;
  rows: number;
  cells: Cell[];
}

const TEXT = {
  en: {
    title: "FOLD TOWN MAP",
    note: "Every land your students build on in MY FOLD TOWN, where they placed it on the class map. A student picks the cell of their first land; each new land joins beside their own when there is room.",
    kinds: { plain: "Plain", river: "River", hills: "Hills", beach: "Beach" },
    land: (n: number) => `land ${n}`,
    empty: "No student has placed a land yet.",
    free: "Free",
    refresh: "REFRESH",
    failed: "The map could not be loaded. Try REFRESH.",
    offline: "No connection. Try again when you are online.",
  },
  id: {
    title: "PETA FOLD TOWN",
    note: "Setiap lahan yang dibangun siswa di MY FOLD TOWN, di tempat yang mereka pilih pada peta kelas. Siswa memilih sel lahan pertamanya; setiap lahan baru menyusul di sebelah lahannya bila masih ada tempat.",
    kinds: { plain: "Dataran", river: "Sungai", hills: "Bukit", beach: "Pantai" },
    land: (n: number) => `lahan ${n}`,
    empty: "Belum ada siswa yang menaruh lahan.",
    free: "Kosong",
    refresh: "MUAT ULANG",
    failed: "Peta belum bisa dimuat. Coba MUAT ULANG.",
    offline: "Tidak ada koneksi. Coba lagi saat online.",
  },
};

const two = (n: number) => String(n).padStart(2, "0");

export function ClassTown({ lang, user, base, names }: { lang: Lang; user: User; base: string; names: Record<number, string> }) {
  const t = TEXT[lang];
  const [map, setMap] = useState<TownMap>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    setError("");
    api<TownMap>(user, `${base}/town/map`)
      .then(setMap, (e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };
  useEffect(load, [base]);

  const at = new Map(map?.cells.map((c) => [`${c.x},${c.y}`, c]));

  return (
    <section className="class-report class-town">
      <div className="report-head">
        <h3>{t.title}</h3>
      </div>
      <p className="soft">{t.note}</p>
      {error && (
        <p className="err" role="alert">
          {error === "offline" ? t.offline : t.failed}
        </p>
      )}
      {map && map.cells.length === 0 && <p className="soft">{t.empty}</p>}
      {map && (
        <div className="town-map" style={{ gridTemplateColumns: `repeat(${map.cols}, 1fr)` }} role="grid" aria-label={t.title}>
          {Array.from({ length: map.rows }, (_, y) => (
            <div key={y} role="row" className="town-map-row">
              {Array.from({ length: map.cols }, (_, x) => {
                const c = at.get(`${x},${y}`);
                if (!c) {
                  return <div key={x} role="gridcell" className="town-cell free" aria-label={t.free} />;
                }
                const label = `${two(c.seat)} ${names[c.seat] || c.name}, ${t.kinds[c.kind]}, ${t.land(c.land + 1)}`;
                return (
                  <div key={x} role="gridcell" className={`town-cell ${c.kind}`} title={label} aria-label={label}>
                    <b>{two(c.seat)}</b>
                    {c.land > 0 && <small>{c.land + 1}</small>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {map && (
        <ul className="town-legend">
          {(["plain", "river", "hills", "beach"] as Kind[]).map((k) => (
            <li key={k}>
              <span className={`town-cell ${k}`} aria-hidden="true" /> {t.kinds[k]}
            </li>
          ))}
        </ul>
      )}
      <div className="row class-tools">
        <button type="button" className="btn small" disabled={busy} onClick={load}>
          {t.refresh}
        </button>
      </div>
    </section>
  );
}
