import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import { namesCsv, parseNamesCsv, readNames, writeName, writeNames } from "./class-names";
import type { Lang } from "./legal";
import { Picture, PICTURE_NAMES } from "./pictures";

/**
 * MY CLASSES on /manage: a teacher's standing classes, each with numbered
 * seats. A seat's picture password comes back from the server only once (when
 * the class or seat is made, or given a new picture), so its cards are printed
 * from this page at that moment. Real names live only in this browser.
 */

interface ClassRow {
  id: string;
  label: string;
  grade: number;
  school_year: string;
  join_code: string | null;
  status: "active" | "archived";
  seats: number;
  created_at: string;
}

interface Seat {
  number: number;
  pseudonym: string;
  locked: boolean;
  last_seen_at: string | null;
  /** Matches in rooms the teacher opened for this class: the official record. */
  official: { matches: number; stars: number };
  last_official: { at: string; place: number; points: number; stars: number } | null;
  /** Matches in rooms for anyone, never added to the official record. */
  other_rooms: { matches: number; last_at: string | null };
  /** Races against the robots and practices on the student's own, as the game reports them. */
  own: { races: number; practices: number; days: number; last_at: string | null };
}

/** A sign-in card, only in this page's memory. */
interface Card {
  number: number;
  pseudonym: string;
  picture: number[];
}

const TEXT = {
  en: {
    title: "MY CLASSES",
    intro: "A class keeps its seats all year. Each student gets a card with the class code, a seat number and three pictures.",
    none: "No classes yet.",
    trial: "Until an admin approves you: one class with up to 5 seats.",
    newClass: "NEW CLASS",
    allClasses: "ALL CLASSES",
    open: "OPEN",
    archived: "ARCHIVED",
    grade: (g: number) => `Grade ${g}`,
    seatsCount: (n: number) => `${n} ${n === 1 ? "seat" : "seats"}`,
    code: "Class code",
    label: "Class name (like 5B; about the class, never a student)",
    gradeLabel: "Grade",
    year: "School year",
    seatsLabel: "Seats (one per student)",
    make: "MAKE THE CLASS",
    cancel: "CANCEL",
    signInHow: "Students press I'M IN A CLASS in the game, enter this code, tap their seat and their three pictures.",
    cols: ["Seat", "Name (this browser only)", "Pseudonym", "Class races", "Own play", "Last played", ""],
    official: (n: number, stars: number) => `${n} ${n === 1 ? "race" : "races"} · ${stars}★`,
    lastOfficial: (place: number, points: number) => `last: ${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}, ${points} pts`,
    own: (races: number, practices: number) => `${races} with robots · ${practices} ${practices === 1 ? "practice" : "practices"}`,
    otherRooms: (n: number) => `${n} in rooms for anyone`,
    days: (n: number) => `on ${n} ${n === 1 ? "day" : "days"}`,
    recordsNote:
      "Class races are the official record: rooms you open for this class. Own play counts races with robots, practices and rooms for anyone, kept apart; the game reports them, so they show how often a student plays, not a grade.",
    namePlaceholder: "Name",
    never: "not yet",
    locked: "LOCKED",
    newPicture: "NEW PICTURE",
    unlock: "UNLOCK",
    empty: "EMPTY THE SEAT",
    addSeats: "ADD SEATS",
    howMany: "How many seats to add?",
    add: "ADD",
    archive: "ARCHIVE THE CLASS",
    exportNames: "SAVE NAMES (CSV)",
    importNames: "LOAD NAMES (CSV)",
    namesNote:
      "Names are kept only in this browser and are never sent to Numeria. Save them as a CSV file to keep a copy or to use another computer.",
    namesLoaded: (n: number) => `${n} ${n === 1 ? "name" : "names"} loaded.`,
    cardsReady: (n: number) =>
      `${n} ${n === 1 ? "card is" : "cards are"} ready. Print ${n === 1 ? "it" : "them"} now: the pictures show only once, and leaving this page loses them.`,
    print: "PRINT THE CARDS",
    printDone: "DONE, HIDE THEM",
    askPicture: (n: number) => `Give seat ${n} a new picture? The old card stops working and the student's devices sign out.`,
    askEmpty: (n: number) =>
      `Empty seat ${n} for a new student? It gets a new pseudonym and picture, the old card stops working and its name here is cleared.`,
    askArchive: "Archive this class? Its code stops working and every student signs out. The class stays here to read.",
    yes: "YES",
    no: "NO",
    cardGame: "NUMERIA ARENA · I'M IN A CLASS",
    cardCode: "Class code",
    cardSeat: "Seat",
    cardPictures: "My pictures, in this order",
    cardName: "Name",
    locale: "en-GB",
    errors: {
      label: "Write a class name of 1 to 30 letters.",
      grade: "Pick a grade.",
      school_year: "The school year is too long.",
      seats: "A class has 1 to 40 seats.",
      seats_limit: "That is more seats than this account may have.",
      classes_limit: "This account cannot make another class now.",
      not_organizer: "Sign up as an organiser first.",
      suspended: "This account is suspended.",
      class_not_found: "That class is gone.",
      archived: "This class is archived.",
      seat_not_found: "That seat is gone.",
      names_file: "That file has no seat numbers in its first column.",
      names_store: "This browser cannot keep names (private window?).",
      offline: "The server cannot be reached right now.",
      other: "Something went wrong. Try again.",
    } as Record<string, string>,
  },
  id: {
    title: "KELAS SAYA",
    intro: "Kelas menyimpan kursinya sepanjang tahun. Tiap siswa mendapat kartu berisi kode kelas, nomor kursi, dan tiga gambar.",
    none: "Belum ada kelas.",
    trial: "Sampai admin menyetujui Anda: satu kelas dengan paling banyak 5 kursi.",
    newClass: "KELAS BARU",
    allClasses: "SEMUA KELAS",
    open: "BUKA",
    archived: "DIARSIPKAN",
    grade: (g: number) => `Kelas ${g}`,
    seatsCount: (n: number) => `${n} kursi`,
    code: "Kode kelas",
    label: "Nama kelas (misalnya 5B; tentang kelasnya, bukan nama siswa)",
    gradeLabel: "Jenjang",
    year: "Tahun ajaran",
    seatsLabel: "Kursi (satu per siswa)",
    make: "BUAT KELAS",
    cancel: "BATAL",
    signInHow: "Siswa menekan AKU DI KELAS di game, memasukkan kode ini, lalu menekan nomor kursi dan tiga gambarnya.",
    cols: ["Kursi", "Nama (hanya di browser ini)", "Samaran", "Lomba kelas", "Main sendiri", "Terakhir main", ""],
    official: (n: number, stars: number) => `${n} lomba · ${stars}★`,
    lastOfficial: (place: number, points: number) => `terakhir: ke-${place}, ${points} poin`,
    own: (races: number, practices: number) => `${races} lawan robot · ${practices} latihan`,
    otherRooms: (n: number) => `${n} di ruang umum`,
    days: (n: number) => `dalam ${n} hari`,
    recordsNote:
      "Lomba kelas adalah catatan resmi: ruang yang Anda buka untuk kelas ini. Main sendiri menghitung lomba lawan robot, latihan, dan ruang umum, disimpan terpisah; game yang melaporkannya, jadi ini menunjukkan seberapa sering siswa bermain, bukan nilai.",
    namePlaceholder: "Nama",
    never: "belum",
    locked: "TERKUNCI",
    newPicture: "GAMBAR BARU",
    unlock: "BUKA KUNCI",
    empty: "KOSONGKAN KURSI",
    addSeats: "TAMBAH KURSI",
    howMany: "Berapa kursi yang ditambah?",
    add: "TAMBAH",
    archive: "ARSIPKAN KELAS",
    exportNames: "SIMPAN NAMA (CSV)",
    importNames: "MUAT NAMA (CSV)",
    namesNote:
      "Nama hanya disimpan di browser ini dan tidak pernah dikirim ke Numeria. Simpan sebagai berkas CSV untuk cadangan atau untuk komputer lain.",
    namesLoaded: (n: number) => `${n} nama dimuat.`,
    cardsReady: (n: number) =>
      `${n} kartu siap. Cetak sekarang: gambarnya hanya tampil sekali, dan hilang bila halaman ini ditinggalkan.`,
    print: "CETAK KARTU",
    printDone: "SELESAI, SEMBUNYIKAN",
    askPicture: (n: number) => `Beri kursi ${n} gambar baru? Kartu lama tidak berlaku lagi dan perangkat siswa itu keluar.`,
    askEmpty: (n: number) =>
      `Kosongkan kursi ${n} untuk siswa baru? Kursi mendapat samaran dan gambar baru, kartu lama tidak berlaku, dan namanya di sini dihapus.`,
    askArchive: "Arsipkan kelas ini? Kodenya tidak berlaku lagi dan semua siswa keluar. Kelas tetap ada di sini untuk dibaca.",
    yes: "YA",
    no: "TIDAK",
    cardGame: "NUMERIA ARENA · AKU DI KELAS",
    cardCode: "Kode kelas",
    cardSeat: "Kursi",
    cardPictures: "Gambarku, urut seperti ini",
    cardName: "Nama",
    locale: "id-ID",
    errors: {
      label: "Tulis nama kelas 1 sampai 30 huruf.",
      grade: "Pilih jenjang.",
      school_year: "Tahun ajaran terlalu panjang.",
      seats: "Satu kelas berisi 1 sampai 40 kursi.",
      seats_limit: "Jumlah kursi melebihi batas akun ini.",
      classes_limit: "Akun ini belum bisa membuat kelas lagi.",
      not_organizer: "Daftar sebagai penyelenggara dulu.",
      suspended: "Akun ini ditangguhkan.",
      class_not_found: "Kelas itu sudah tidak ada.",
      archived: "Kelas ini sudah diarsipkan.",
      seat_not_found: "Kursi itu sudah tidak ada.",
      names_file: "Kolom pertama berkas itu tidak berisi nomor kursi.",
      names_store: "Browser ini tidak bisa menyimpan nama (jendela privat?).",
      offline: "Server belum bisa dihubungi.",
      other: "Ada yang salah. Coba lagi.",
    } as Record<string, string>,
  },
};
type Text = (typeof TEXT)["en"];

function ErrorLine({ t, code }: { t: Text; code: string }) {
  if (!code) return null;
  return (
    <p className="err" role="alert">
      {t.errors[code] ?? t.errors.other}
    </p>
  );
}

/** Seat 7 reads as 07, like the pseudonyms. */
const two = (n: number) => String(n).padStart(2, "0");

/** The school year a new class most likely belongs to: from July, this year and the next. */
function thisSchoolYear(): string {
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}

/** The MY CLASSES card in the tool grid, which opens the section below it. */
export function ClassesTool({ title, sub, open, onOpen }: { title: string; sub: string; open: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={open ? "tool tool-on on" : "tool tool-on"} aria-expanded={open} onClick={onOpen}>
      <strong>{title}</strong>
      <span className="soft">{sub}</span>
    </button>
  );
}

export function MyClasses({ lang, user, trial }: { lang: Lang; user: User; trial: boolean }) {
  const t = TEXT[lang];
  const [classes, setClasses] = useState<ClassRow[]>();
  const [error, setError] = useState("");
  const [making, setMaking] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Fresh cards by class, kept while this page lives.
  const [cards, setCards] = useState<Record<string, Card[]>>({});
  const load = () =>
    api<{ classes: ClassRow[] }>(user, "/classes").then(
      (r) => {
        setClasses(r.classes);
        setError("");
      },
      (e) => setError(errorCode(e)),
    );
  useEffect(() => {
    void load();
  }, [user]);
  const keep = (classId: string, fresh: Card[]) =>
    setCards((all) => {
      const byNumber = new Map((all[classId] ?? []).map((c) => [c.number, c]));
      for (const c of fresh) byNumber.set(c.number, c);
      return { ...all, [classId]: [...byNumber.values()].sort((a, b) => a.number - b.number) };
    });
  const opened = classes?.find((c) => c.id === openId);

  return (
    <section className="paper-sheet classes" id="classes">
      {opened ? (
        <ClassPage
          t={t}
          lang={lang}
          user={user}
          row={opened}
          cards={cards[opened.id] ?? []}
          onCards={(c) => keep(opened.id, c)}
          onPrinted={() => setCards((all) => ({ ...all, [opened.id]: [] }))}
          onBack={() => setOpenId(null)}
          onChange={() => void load()}
        />
      ) : (
        <>
          <div className="admin-head">
            <h2>{t.title}</h2>
            <button type="button" className="btn blue" onClick={() => setMaking(true)} disabled={!classes}>
              {t.newClass}
            </button>
          </div>
          <p className="soft">{t.intro}</p>
          {trial && <p className="soft">{t.trial}</p>}
          <ErrorLine t={t} code={error} />
          {classes?.length === 0 && <p>{t.none}</p>}
          <div className="class-list">
            {classes?.map((c) => (
              <button key={c.id} type="button" className={c.status === "active" ? "class-row" : "class-row old"} onClick={() => setOpenId(c.id)}>
                <strong className="class-label">{c.label}</strong>
                <span>
                  {t.grade(c.grade)}
                  {c.school_year ? `, ${c.school_year}` : ""} · {t.seatsCount(c.seats)}
                </span>
                {c.join_code ? <span className="class-code">{c.join_code}</span> : <span className="past-state">{t.archived}</span>}
              </button>
            ))}
          </div>
        </>
      )}
      {making && (
        <NewClass
          t={t}
          user={user}
          trial={trial}
          onClose={() => setMaking(false)}
          onMade={(row, fresh) => {
            setMaking(false);
            keep(row.id, fresh);
            setClasses((list) => [row, ...(list ?? [])]);
            setOpenId(row.id);
          }}
        />
      )}
    </section>
  );
}

function NewClass({
  t,
  user,
  trial,
  onClose,
  onMade,
}: {
  t: Text;
  user: User;
  trial: boolean;
  onClose: () => void;
  onMade: (row: ClassRow, cards: Card[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [grade, setGrade] = useState(5);
  const [year, setYear] = useState(thisSchoolYear);
  const max = trial ? 5 : 40;
  const [seats, setSeats] = useState(String(trial ? 5 : 30));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const make = () => {
    const n = Number(seats);
    if (!label.trim()) return setError("label");
    if (!Number.isInteger(n) || n < 1 || n > max) return setError(n > max && n <= 40 ? "seats_limit" : "seats");
    setBusy(true);
    setError("");
    api<{ class: ClassRow; seats: Card[] }>(user, "/classes", {
      method: "POST",
      body: JSON.stringify({ label: label.trim(), grade, school_year: year.trim(), seats: n }),
    }).then(
      (r) => onMade(r.class, r.seats),
      (e) => {
        setBusy(false);
        setError(errorCode(e));
      },
    );
  };
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label={t.newClass} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="paper-sheet narrow">
        <h2 className="dialog-title">{t.newClass}</h2>
        <label className="field-label" htmlFor="class-label">
          {t.label}
        </label>
        <input id="class-label" className="field" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        <span className="field-label">{t.gradeLabel}</span>
        <div className="tabs" role="group" aria-label={t.gradeLabel}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
            <button key={g} type="button" className={g === grade ? "tab on" : "tab"} aria-pressed={g === grade} onClick={() => setGrade(g)}>
              {g}
            </button>
          ))}
        </div>
        <label className="field-label" htmlFor="class-year">
          {t.year}
        </label>
        <input id="class-year" className="field" maxLength={20} value={year} onChange={(e) => setYear(e.target.value)} />
        <label className="field-label" htmlFor="class-seats">
          {t.seatsLabel}
        </label>
        <input
          id="class-seats"
          className="field short"
          type="number"
          min={1}
          max={max}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
        />
        <ErrorLine t={t} code={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="button" className="btn blue" onClick={make} disabled={busy}>
            {t.make}
          </button>
        </div>
      </div>
    </div>
  );
}

type Ask = { kind: "picture" | "empty"; seat: number } | { kind: "archive" } | { kind: "add" };

function ClassPage({
  t,
  lang,
  user,
  row,
  cards,
  onCards,
  onPrinted,
  onBack,
  onChange,
}: {
  t: Text;
  lang: Lang;
  user: User;
  row: ClassRow;
  cards: Card[];
  onCards: (c: Card[]) => void;
  onPrinted: () => void;
  onBack: () => void;
  onChange: () => void;
}) {
  const [seats, setSeats] = useState<Seat[]>();
  const [names, setNames] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState("1");
  const file = useRef<HTMLInputElement>(null);
  const active = row.status === "active";
  const base = `/classes/${encodeURIComponent(row.id)}`;

  const load = () =>
    api<{ class: ClassRow; seats: Seat[] }>(user, base).then(
      (r) => setSeats(r.seats),
      (e) => setError(errorCode(e)),
    );
  useEffect(() => {
    void load();
    readNames(row.id).then(setNames, () => setError("names_store"));
  }, [row.id]);

  const name = (n: number, v: string) => {
    setNames((all) => ({ ...all, [n]: v }));
    writeName(row.id, n, v).catch(() => setError("names_store"));
  };

  const act = (p: Promise<unknown>) => {
    setBusy(true);
    setError("");
    setNote("");
    p.then(load)
      .then(onChange)
      .catch((e) => setError(errorCode(e)))
      .finally(() => {
        setBusy(false);
        setAsk(null);
      });
  };

  const confirm = () => {
    if (!ask) return;
    if (ask.kind === "picture")
      act(api<Card>(user, `${base}/seats/${ask.seat}/picture`, { method: "POST" }).then((c) => onCards([c])));
    else if (ask.kind === "empty")
      act(
        api<Card>(user, `${base}/seats/${ask.seat}`, { method: "DELETE" }).then((c) => {
          onCards([c]);
          name(c.number, "");
        }),
      );
    else if (ask.kind === "archive") act(api(user, base, { method: "DELETE" }).then(onPrinted));
    else
      act(
        api<{ seats: Card[] }>(user, `${base}/seats`, { method: "POST", body: JSON.stringify({ count: Number(more) }) }).then((r) =>
          onCards(r.seats),
        ),
      );
  };

  const save = () => {
    if (!seats) return;
    const blob = new Blob([namesCsv(seats, names)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `numeria-${row.label.replace(/[^\p{L}\p{N}]+/gu, "-")}-${row.school_year.replace(/\D+/gu, "-")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const loadFile = (f: File | undefined) => {
    if (!f) return;
    setError("");
    setNote("");
    f.text()
      .then((text) => {
        const found = parseNamesCsv(text);
        if (Object.keys(found).length === 0) throw new Error("names_file");
        const count = Object.values(found).filter(Boolean).length;
        return writeNames(row.id, found).then(() => {
          setNames((all) => ({ ...all, ...found }));
          setNote(t.namesLoaded(count));
        });
      })
      .catch((e) => setError(errorCode(e) === "names_file" ? "names_file" : "names_store"));
  };

  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(t.locale, { day: "numeric", month: "short" }) + ", " + new Date(iso).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit" }) : t.never;

  const askText = !ask
    ? ""
    : ask.kind === "picture"
      ? t.askPicture(ask.seat)
      : ask.kind === "empty"
        ? t.askEmpty(ask.seat)
        : ask.kind === "archive"
          ? t.askArchive
          : t.howMany;

  return (
    <>
      <div className="admin-head">
        <div>
          <h2 className="class-title">
            {row.label}
            {!active && <span className="past-state">{t.archived}</span>}
          </h2>
          <p className="soft">
            {t.grade(row.grade)}
            {row.school_year ? `, ${row.school_year}` : ""} · {t.seatsCount(row.seats)}
          </p>
        </div>
        <button type="button" className="btn small" onClick={onBack}>
          {t.allClasses}
        </button>
      </div>
      {row.join_code && (
        <div className="class-join">
          <span className="soft">{t.code}</span>
          <span className="room-code">{row.join_code}</span>
          <span className="soft">{t.signInHow}</span>
        </div>
      )}
      {cards.length > 0 && (
        <div className="cards-ready" role="status">
          <p>{t.cardsReady(cards.length)}</p>
          <div className="row">
            <button type="button" className="btn blue" onClick={() => window.print()}>
              {t.print}
            </button>
            <button type="button" className="btn small" onClick={onPrinted}>
              {t.printDone}
            </button>
          </div>
        </div>
      )}
      <ErrorLine t={t} code={error} />
      {note && <p role="status">{note}</p>}
      <p className="soft">{t.recordsNote}</p>
      <table className="past-table seats">
        <thead>
          <tr>
            {t.cols.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {seats?.map((s) => (
            <tr key={s.number}>
              <td className="seat-no">{two(s.number)}</td>
              <td>
                <input
                  className="field name"
                  aria-label={`${t.cols[1]} ${s.number}`}
                  placeholder={t.namePlaceholder}
                  maxLength={80}
                  defaultValue={names[s.number] ?? ""}
                  key={`${s.number}:${names[s.number] ?? ""}`}
                  onBlur={(e) => e.target.value !== (names[s.number] ?? "") && name(s.number, e.target.value)}
                />
              </td>
              <td>{s.pseudonym}</td>
              <td>
                {t.official(s.official.matches, s.official.stars)}
                {s.last_official && <div className="soft">{t.lastOfficial(s.last_official.place, s.last_official.points)}</div>}
              </td>
              <td>
                {t.own(s.own.races, s.own.practices)}
                {s.other_rooms.matches > 0 && <div className="soft">{t.otherRooms(s.other_rooms.matches)}</div>}
                {s.own.days > 0 && <div className="soft">{t.days(s.own.days)}</div>}
              </td>
              <td>{s.locked ? <span className="past-state lock">{t.locked}</span> : <span className="soft">{day(s.last_seen_at)}</span>}</td>
              <td className="seat-actions">
                {active && (
                  <>
                    {s.locked && (
                      <button type="button" className="btn small blue" disabled={busy} onClick={() => act(api(user, `${base}/seats/${s.number}/unlock`, { method: "POST" }))}>
                        {t.unlock}
                      </button>
                    )}
                    <button type="button" className="btn small" disabled={busy} onClick={() => setAsk({ kind: "picture", seat: s.number })}>
                      {t.newPicture}
                    </button>
                    <button type="button" className="btn small" disabled={busy} onClick={() => setAsk({ kind: "empty", seat: s.number })}>
                      {t.empty}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="soft">{t.namesNote}</p>
      <div className="row class-tools">
        <button type="button" className="btn small" onClick={save} disabled={!seats}>
          {t.exportNames}
        </button>
        <button type="button" className="btn small" onClick={() => file.current?.click()}>
          {t.importNames}
        </button>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            loadFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {active && (
          <>
            <button type="button" className="btn small" disabled={busy} onClick={() => setAsk({ kind: "add" })}>
              {t.addSeats}
            </button>
            <button type="button" className="btn small suspended" disabled={busy} onClick={() => setAsk({ kind: "archive" })}>
              {t.archive}
            </button>
          </>
        )}
      </div>
      {ask && (
        <div className="veil" role="dialog" aria-modal="true" aria-label={askText} onClick={(e) => e.target === e.currentTarget && setAsk(null)}>
          <div className="paper-sheet narrow">
            <p>{askText}</p>
            {ask.kind === "add" && (
              <input className="field short" type="number" min={1} max={40} value={more} onChange={(e) => setMore(e.target.value)} autoFocus />
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setAsk(null)} autoFocus={ask.kind !== "add"}>
                {ask.kind === "add" ? t.cancel : t.no}
              </button>
              <button type="button" className={ask.kind === "add" ? "btn blue" : "btn suspended"} onClick={confirm} disabled={busy}>
                {ask.kind === "add" ? t.add : t.yes}
              </button>
            </div>
          </div>
        </div>
      )}
      {cards.length > 0 && <PrintCards t={t} lang={lang} row={row} cards={cards} names={names} />}
    </>
  );
}

/** The sheet the printer gets: one cut-out card per seat. Hidden on screen. */
function PrintCards({ t, lang, row, cards, names }: { t: Text; lang: Lang; row: ClassRow; cards: Card[]; names: Record<number, string> }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;
  return createPortal(
    <div className="print-cards">
      {cards.map((c) => (
        <div key={c.number} className="sign-card">
          <p className="sign-game">{t.cardGame}</p>
          <div className="sign-top">
            <div>
              <span className="sign-small">{t.cardCode}</span>
              <strong className="sign-code">{row.join_code}</strong>
            </div>
            <div>
              <span className="sign-small">{t.cardSeat}</span>
              <strong className="sign-seat">{two(c.number)}</strong>
            </div>
          </div>
          <p className="sign-name">{c.pseudonym}</p>
          <span className="sign-small">{t.cardPictures}</span>
          <ol className="sign-pictures">
            {c.picture.map((p, i) => (
              <li key={i}>
                <Picture n={p} lang={lang} size={52} />
                <span>{PICTURE_NAMES[lang][p]}</span>
              </li>
            ))}
          </ol>
          <p className="sign-line">
            {t.cardName}: <span>{names[c.number] ?? ""}</span>
          </p>
          <p className="sign-small">
            {row.label}
            {row.school_year ? `, ${row.school_year}` : ""}
          </p>
        </div>
      ))}
    </div>,
    host,
  );
}
