import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import type { Lang } from "./legal";

/**
 * FOLD TOWN MAP on a class's page: each land of a student's MY FOLD TOWN is
 * one cell of the class's map. A student picks the cell of their first land
 * in the game; a later land joins beside their own. Seat numbers come from
 * the server, names only from this browser. A cell shows what stands on its
 * land: homes, trees, bigger buildings, and its landmark coloured by the
 * mission whose skill raised it.
 */

type Kind = "plain" | "river" | "hills" | "beach";
type Mission = "place_value" | "multiply_divide" | "fractions" | "decimals" | "measurement";

const MISSIONS: Mission[] = ["place_value", "multiply_divide", "fractions", "decimals", "measurement"];

interface OnLand {
  homes: number;
  trees: number;
  buildings: number;
  landmark: { mission: Mission; skill: string } | null;
}

interface Cell {
  x: number;
  y: number;
  kind: Kind;
  land: number;
  name: string;
  seat: number;
  town?: OnLand;
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
    homes: (n: number) => `${n} ${n === 1 ? "home" : "homes"}`,
    trees: (n: number) => `${n} ${n === 1 ? "tree" : "trees"}`,
    buildings: (n: number) => `${n} ${n === 1 ? "building" : "buildings"}`,
    nothing: "nothing built yet",
    legendHomes: "Homes",
    legendTrees: "Trees",
    legendBuildings: "Shops, school, towers",
    landmarkNote: "A landmark rises on a land once a skill of its mission gets its first star:",
    missions: {
      place_value: "Place Value",
      multiply_divide: "Multiply & Divide",
      fractions: "Fractions",
      decimals: "Decimals",
      measurement: "Measurement",
    },
    landmark: (m: string) => `a landmark for ${m}`,
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
    homes: (n: number) => `${n} rumah`,
    trees: (n: number) => `${n} pohon`,
    buildings: (n: number) => `${n} bangunan`,
    nothing: "belum ada bangunan",
    legendHomes: "Rumah",
    legendTrees: "Pohon",
    legendBuildings: "Toko, sekolah, menara",
    landmarkNote: "Landmark berdiri di sebuah lahan setelah satu skill dari misinya mendapat bintang pertama:",
    missions: {
      place_value: "Nilai Tempat",
      multiply_divide: "Kali & Bagi",
      fractions: "Pecahan",
      decimals: "Desimal",
      measurement: "Pengukuran",
    },
    landmark: (m: string) => `landmark ${m}`,
    refresh: "MUAT ULANG",
    failed: "Peta belum bisa dimuat. Coba MUAT ULANG.",
    offline: "Tidak ada koneksi. Coba lagi saat online.",
  },
};

const two = (n: number) => String(n).padStart(2, "0");

type Icon = "home" | "tree" | "building";

const ICONS: Record<Icon, string> = {
  home: "M2 9 L8 3 L14 9 V14 H2 Z",
  tree: "M8 1 L13 9 H9.5 V15 H6.5 V9 H3 Z",
  building: "M3 15 V3 H9 V7 H13 V15 Z",
};

function Glyph({ icon }: { icon: Icon }) {
  return (
    <svg className={`town-icon ${icon}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d={ICONS[icon]} />
    </svg>
  );
}

function Flag({ mission }: { mission: Mission }) {
  return (
    <svg className={`town-flag ${mission}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 15 V1 H5 V2 L14 5 L5 8 V15 Z" />
    </svg>
  );
}

function described(c: Cell, t: (typeof TEXT)["en"]): string {
  const o = c.town;
  if (!o) return "";
  const parts = [o.homes && t.homes(o.homes), o.trees && t.trees(o.trees), o.buildings && t.buildings(o.buildings)].filter(Boolean);
  if (o.landmark) parts.push(t.landmark(t.missions[o.landmark.mission]));
  return parts.length ? parts.join(", ") : t.nothing;
}

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
                const what = described(c, t);
                const label = `${two(c.seat)} ${names[c.seat] || c.name}, ${t.kinds[c.kind]}, ${t.land(c.land + 1)}${what ? `: ${what}` : ""}`;
                const o = c.town;
                return (
                  <div key={x} role="gridcell" className={`town-cell ${c.kind}`} title={label} aria-label={label}>
                    {o?.landmark && <Flag mission={o.landmark.mission} />}
                    <b>{two(c.seat)}</b>
                    {c.land > 0 && <small>{c.land + 1}</small>}
                    {o && (o.homes > 0 || o.trees > 0 || o.buildings > 0) && (
                      <span className="town-icons">
                        {o.homes > 0 && <Glyph icon="home" />}
                        {o.trees > 0 && <Glyph icon="tree" />}
                        {o.buildings > 0 && <Glyph icon="building" />}
                      </span>
                    )}
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
          <li>
            <Glyph icon="home" /> {t.legendHomes}
          </li>
          <li>
            <Glyph icon="tree" /> {t.legendTrees}
          </li>
          <li>
            <Glyph icon="building" /> {t.legendBuildings}
          </li>
        </ul>
      )}
      {map && (
        <>
          <p className="soft">{t.landmarkNote}</p>
          <ul className="town-legend">
            {MISSIONS.map((m) => (
              <li key={m}>
                <Flag mission={m} /> {t.missions[m]}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row class-tools">
        <button type="button" className="btn small" disabled={busy} onClick={load}>
          {t.refresh}
        </button>
      </div>
    </section>
  );
}
