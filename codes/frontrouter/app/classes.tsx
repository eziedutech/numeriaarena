import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import type { User } from "firebase/auth";

import { api, errorCode } from "./auth";
import { GAME } from "./game-link";
import { ClassLeaders } from "./class-leaders";
import { ClassTown } from "./class-town";
import { ClassReport } from "./class-report";
import { clearNames, namesCsv, parseNamesCsv, readNames, writeName, writeNames } from "./class-names";
import type { Lang } from "./legal";
import { IconButton } from "./icon-button";
import { NumberField, Pick } from "./pick";
import { Picture, PICTURE_NAMES } from "./pictures";

/**
 * MY CLASSES on /manage: a teacher's standing classes, each with numbered
 * seats, and each class's own page at /manage/class/ID, in tabs. A seat's
 * picture password comes back from the server only once (when the class or
 * seat is made, or given a new picture), so its cards are printed from this
 * page at that moment. Real names live only in this browser.
 */

/** The tabs of a class's page, as `?tab=` names them. */
export const CLASS_TABS = ["overview", "seats", "groups", "report", "ranks", "town"] as const;
export type ClassTab = (typeof CLASS_TABS)[number];

/** Fresh cards by class, kept outside the page so moving between its pages keeps them until printed. */
const cardStore: Record<string, Card[]> = {};

/** A seat played within this many days counts as playing lately. */
const LATELY_DAYS = 7;

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

/** How the seat table can be ordered. */
type SortKey = "seat" | "name" | "recent" | "idle" | "active" | "stars" | "points" | "group";
const SORTS: SortKey[] = ["seat", "name", "recent", "idle", "active", "stars", "points", "group"];

/** Every play of a seat: class races, smartboard races, rooms for anyone, races with robots, practices. */
const plays = (s: Seat) => s.official.matches + (s.board?.races ?? 0) + s.other_rooms.matches + s.own.races + s.own.practices;
const seen = (s: Seat) => (s.last_seen_at ? Date.parse(s.last_seen_at) : 0);

/** Seats matching `query` (name from this browser or pseudonym), in the order picked; ties by seat number. */
function arrange(seats: Seat[], names: Record<number, string>, query: string, by: SortKey): Seat[] {
  const q = query.trim().toLowerCase();
  const label = (s: Seat) => (names[s.number] || s.pseudonym).toLowerCase();
  const found = q ? seats.filter((s) => `${names[s.number] ?? ""} ${s.pseudonym} ${two(s.number)}`.toLowerCase().includes(q)) : [...seats];
  const key: Record<SortKey, (a: Seat, b: Seat) => number> = {
    seat: () => 0,
    name: (a, b) => label(a).localeCompare(label(b)),
    recent: (a, b) => seen(b) - seen(a),
    // Never played first: they need the nudge most.
    idle: (a, b) => seen(a) - seen(b),
    active: (a, b) => plays(b) - plays(a),
    stars: (a, b) => b.official.stars - a.official.stars,
    points: (a, b) => (b.last_official?.points ?? -1) - (a.last_official?.points ?? -1),
    group: (a, b) => a.group - b.group,
  };
  return found.sort((a, b) => key[by](a, b) || a.number - b.number);
}

interface Seat {
  number: number;
  pseudonym: string;
  locked: boolean;
  last_seen_at: string | null;
  /** The race group (0 is A): the teacher's choice, or by seat number. */
  group: number;
  group_chosen: boolean;
  /** Matches in rooms the teacher opened for this class: the official record. */
  official: { matches: number; stars: number };
  last_official: { at: string; place: number; points: number; stars: number } | null;
  /** Matches in rooms for anyone, never added to the official record. */
  other_rooms: { matches: number; last_at: string | null };
  /** Races against the robots and practices on the student's own, as the game reports them. */
  own: { races: number; practices: number; days: number; last_at: string | null };
  /** Races on the classroom's smartboard the teacher saved, counted with the class races. */
  board?: { races: number; stars: number };
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
    intro: "A class keeps its seats all year. Each student gets a sign-in card with the class code, a seat number and a picture password: three pictures in order.",
    none: "No classes yet.",
    trial: "Until an admin approves you: one class with up to 5 seats.",
    newClass: "NEW CLASS",
    edu: "MATH LESSONS",
    eduHint: "Paper lessons to show on the smartboard or share with the class",
    classTabs: {
      overview: "OVERVIEW",
      seats: "SEATS & CARDS",
      groups: "GROUPS",
      report: "REPORT",
      ranks: "RANKINGS",
      town: "TOWN",
    } as Record<ClassTab, string>,
    stat: {
      seats: "Seats",
      lately: "Played in the last 7 days",
      never: "Never signed in",
      locked: "Locked seats",
      groups: "Race groups",
    },
    signInTitle: "SIGNING IN",
    raceTitle: "RACING",
    endTitle: "ARCHIVE OR DELETE",
    endNote: "Archive a class at the end of the school year: its code stops working and it stays here to read. Deleting removes it and its records from Numeria for good.",
    listSummary: (active: number, archived: number) => `${active} active${archived ? `, ${archived} archived` : ""}`,
    archivedTitle: "ARCHIVED",
    groupTitle: (g: string, n: number) => `Group ${g} · ${n} ${n === 1 ? "seat" : "seats"}`,
    moveTo: (n: number) => `Group of seat ${n}`,
    lockedSeats: (n: number) => `${n} ${n === 1 ? "seat is" : "seats are"} locked after wrong picture passwords. Unlock ${n === 1 ? "it" : "them"} under SEATS & CARDS.`,
    allClasses: "ALL CLASSES",
    race: "NEW RACE ROOM FOR THIS CLASS",
    raceLine: (s: string) => `A new race room: ${s}. Change it under RACE ROOMS.`,
    board: "SMARTBOARD RACE",
    boardTitle: "A race on the smartboard",
    boardBody: "Three students race side by side on the classroom's big screen, each touching their own column. Pick who plays; the game opens with them.",
    boardPlayer: (n: number) => `Player ${n}`,
    boardNobody: "Pick a student",
    boardRecord: "Save the results in this class's report (stay signed in in the game)",
    boardDistinct: "Pick three different students.",
    boardOpen: "OPEN THE RACE",
    onBoard: (n: number) => `${n} on the smartboard`,
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
    cols: ["Seat", "Name (this browser only)", "Pseudonym", "Group", "Class races", "Own play", "Last played", ""],
    groupsNote:
      "A race room has 6 desks, so the class races in groups, one group a match: seats 01 to 06 are group A, 07 to 12 group B, and so on. Pick another group for a seat here; the class screen calls the groups in turn.",
    byNumber: "GROUPS BY SEAT NUMBER",
    tooBig: (g: string, n: number) =>
      `Group ${g} has ${n} seats and a room has 6 desks: the rest wait, and after each race those who have not raced yet take the desks.`,
    official: (n: number, stars: number) => [`${n} ${n === 1 ? "race" : "races"}`, `${stars}★`],
    lastOfficial: (place: number, points: number) => `last: ${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}, ${points} pts`,
    own: (races: number, practices: number) => [`${races} with robots`, `${practices} ${practices === 1 ? "practice" : "practices"}`],
    otherRooms: (n: number) => `${n} in rooms for anyone`,
    days: (n: number) => `on ${n} ${n === 1 ? "day" : "days"}`,
    recordsNote:
      "Class races are the official record: rooms you open for this class, and smartboard races you save. Own play counts races with robots, practices and rooms for anyone, kept apart; the game reports them, so they show how often a student plays, not a grade.",
    namePlaceholder: "Name",
    never: "not yet",
    locked: "LOCKED",
    newPicture: "New picture password: prints a new sign-in card, and the old card stops working",
    unlock: "Unlock the seat: it was locked after too many wrong picture passwords",
    empty: "Empty the seat for a new student: new pseudonym, new picture password, the records start again",
    find: "Find a name or pseudonym",
    sortBy: "Sort by",
    sorts: {
      seat: "Seat number",
      name: "Name, A to Z",
      recent: "Played most recently",
      idle: "Not played for longest",
      active: "Plays most (all play)",
      stars: "Most stars in class races",
      points: "Points in the last class race",
      group: "Group",
    } as Record<SortKey, string>,
    loading: "Loading...",
    shown: (n: number, all: number) => `${n} of ${all} seats`,
    noMatch: "No seat matches.",
    addSeats: "ADD SEATS",
    howMany: "How many seats to add?",
    add: "ADD",
    archive: "ARCHIVE THE CLASS",
    erase: "DELETE FOR GOOD",
    exportNames: "SAVE NAMES (CSV)",
    importNames: "LOAD NAMES (CSV)",
    namesNote:
      "Names are kept only in this browser and are never sent to Numeria. Save them as a CSV file to keep a copy or to use another computer.",
    namesLoaded: (n: number, stale: number) =>
      `${n} ${n === 1 ? "name" : "names"} loaded.` +
      (stale ? ` ${stale} ${stale === 1 ? "line was" : "lines were"} skipped: that seat has a new student now.` : ""),
    cardsReady: (n: number) =>
      `${n} ${n === 1 ? "card is" : "cards are"} ready. Print ${n === 1 ? "it" : "them"} now: the pictures show only once, and leaving this page loses them.`,
    print: "PRINT THE CARDS",
    printDone: "DONE, HIDE THEM",
    askPicture: (n: number) => `Give seat ${n} a new picture password? A new card is printed, the old card stops working and the student's devices sign out.`,
    askEmpty: (n: number) =>
      `Empty seat ${n} for a new student? It gets a new pseudonym and picture password, the old card stops working and its name here is cleared.`,
    askArchive: "Archive this class? Its code stops working and every student signs out. The class stays here to read.",
    askErase:
      "Delete this class for good? Its seats, answers, race results, reports, towns and AI notes, and the races in its rooms, are deleted from Numeria, and the names kept in this browser go too. This cannot be undone. Save the names or the report first if you need them.",
    typeLabel: (label: string) => `Type the class name, ${label}, to delete it.`,
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
      seats: "A class has 1 to 100 seats.",
      seats_limit: "That is more seats than this account may have.",
      classes_limit: "This account cannot make another class now.",
      not_organizer: "Sign up as an organiser first.",
      suspended: "This account is suspended.",
      class_not_found: "That class is gone.",
      archived: "This class is archived.",
      seat_not_found: "That seat is gone.",
      class_frozen: "This account is suspended, so its classes wait.",
      group: "Pick a group from A to Q.",
      names_file: "That file has no seat numbers in its first column.",
      names_store: "This browser cannot keep names (private window?).",
      offline: "The server cannot be reached right now.",
      other: "Something went wrong. Try again.",
    } as Record<string, string>,
  },
  id: {
    title: "KELAS SAYA",
    intro: "Kelas menyimpan kursinya sepanjang tahun. Tiap siswa mendapat kartu masuk berisi kode kelas, nomor kursi, dan sandi gambar: tiga gambar berurutan.",
    none: "Belum ada kelas.",
    trial: "Sampai admin menyetujui Anda: satu kelas dengan paling banyak 5 kursi.",
    newClass: "KELAS BARU",
    edu: "EDUKASI MATEMATIKA",
    eduHint: "Pelajaran kertas untuk ditampilkan di smartboard atau dibagikan ke kelas",
    classTabs: {
      overview: "RINGKASAN",
      seats: "KURSI & KARTU",
      groups: "KELOMPOK",
      report: "LAPORAN",
      ranks: "PERINGKAT",
      town: "KOTA",
    } as Record<ClassTab, string>,
    stat: {
      seats: "Kursi",
      lately: "Bermain 7 hari terakhir",
      never: "Belum pernah masuk",
      locked: "Kursi terkunci",
      groups: "Kelompok lomba",
    },
    signInTitle: "CARA MASUK",
    raceTitle: "LOMBA",
    endTitle: "ARSIPKAN ATAU HAPUS",
    endNote: "Arsipkan kelas di akhir tahun ajaran: kodenya tidak berlaku lagi dan kelasnya tetap ada di sini untuk dibaca. Menghapus membuang kelas dan catatannya dari Numeria selamanya.",
    listSummary: (active: number, archived: number) => `${active} aktif${archived ? `, ${archived} diarsipkan` : ""}`,
    archivedTitle: "DIARSIPKAN",
    groupTitle: (g: string, n: number) => `Kelompok ${g} · ${n} kursi`,
    moveTo: (n: number) => `Kelompok kursi ${n}`,
    lockedSeats: (n: number) => `${n} kursi terkunci karena salah sandi gambar. Buka kuncinya di KURSI & KARTU.`,
    allClasses: "SEMUA KELAS",
    race: "BUAT RUANG LOMBA UNTUK KELAS INI",
    raceLine: (s: string) => `Ruang lomba baru: ${s}. Ubah di RUANG LOMBA.`,
    board: "BALAPAN SMARTBOARD",
    boardTitle: "Balapan di smartboard",
    boardBody: "Tiga siswa berlomba berdampingan di layar besar kelas, masing-masing menyentuh kolomnya sendiri. Pilih siapa yang main; game terbuka dengan mereka.",
    boardPlayer: (n: number) => `Pemain ${n}`,
    boardNobody: "Pilih siswa",
    boardRecord: "Simpan hasilnya di laporan kelas ini (tetap masuk di game)",
    boardDistinct: "Pilih tiga siswa yang berbeda.",
    boardOpen: "BUKA BALAPAN",
    onBoard: (n: number) => `${n} di smartboard`,
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
    cols: ["Kursi", "Nama (hanya di browser ini)", "Samaran", "Kelompok", "Lomba kelas", "Main sendiri", "Terakhir main", ""],
    groupsNote:
      "Ruang lomba punya 6 meja, jadi kelas berlomba per kelompok, satu kelompok satu pertandingan: kursi 01 sampai 06 kelompok A, 07 sampai 12 kelompok B, dan seterusnya. Pilih kelompok lain untuk sebuah kursi di sini; layar kelas memanggil kelompok bergiliran.",
    byNumber: "KELOMPOK MENURUT NOMOR KURSI",
    tooBig: (g: string, n: number) =>
      `Kelompok ${g} punya ${n} kursi dan ruang punya 6 meja: sisanya menunggu, dan setelah tiap balapan yang belum balapan mengambil mejanya.`,
    official: (n: number, stars: number) => [`${n} lomba`, `${stars}★`],
    lastOfficial: (place: number, points: number) => `terakhir: ke-${place}, ${points} poin`,
    own: (races: number, practices: number) => [`${races} lawan robot`, `${practices} latihan`],
    otherRooms: (n: number) => `${n} di ruang umum`,
    days: (n: number) => `dalam ${n} hari`,
    recordsNote:
      "Lomba kelas adalah catatan resmi: ruang yang Anda buka untuk kelas ini, dan balapan smartboard yang Anda simpan. Main sendiri menghitung lomba lawan robot, latihan, dan ruang umum, disimpan terpisah; game yang melaporkannya, jadi ini menunjukkan seberapa sering siswa bermain, bukan nilai.",
    namePlaceholder: "Nama",
    never: "belum",
    locked: "TERKUNCI",
    newPicture: "Sandi gambar baru: mencetak kartu masuk baru, dan kartu lama tidak berlaku",
    unlock: "Buka kunci kursi: terkunci karena terlalu sering salah sandi gambar",
    empty: "Kosongkan kursi untuk siswa baru: samaran baru, sandi gambar baru, catatan mulai dari awal",
    find: "Cari nama atau samaran",
    sortBy: "Urutkan",
    sorts: {
      seat: "Nomor kursi",
      name: "Nama, A sampai Z",
      recent: "Paling baru bermain",
      idle: "Paling lama tidak bermain",
      active: "Paling sering bermain (semua)",
      stars: "Bintang terbanyak di lomba kelas",
      points: "Poin lomba kelas terakhir",
      group: "Kelompok",
    } as Record<SortKey, string>,
    loading: "Memuat...",
    shown: (n: number, all: number) => `${n} dari ${all} kursi`,
    noMatch: "Tidak ada kursi yang cocok.",
    addSeats: "TAMBAH KURSI",
    howMany: "Berapa kursi yang ditambah?",
    add: "TAMBAH",
    archive: "ARSIPKAN KELAS",
    erase: "HAPUS SELAMANYA",
    exportNames: "SIMPAN NAMA (CSV)",
    importNames: "MUAT NAMA (CSV)",
    namesNote:
      "Nama hanya disimpan di browser ini dan tidak pernah dikirim ke Numeria. Simpan sebagai berkas CSV untuk cadangan atau untuk komputer lain.",
    namesLoaded: (n: number, stale: number) =>
      `${n} nama dimuat.` + (stale ? ` ${stale} baris dilewati: kursinya sudah untuk siswa baru.` : ""),
    cardsReady: (n: number) =>
      `${n} kartu siap. Cetak sekarang: gambarnya hanya tampil sekali, dan hilang bila halaman ini ditinggalkan.`,
    print: "CETAK KARTU",
    printDone: "SELESAI, SEMBUNYIKAN",
    askPicture: (n: number) => `Beri kursi ${n} sandi gambar baru? Kartu baru dicetak, kartu lama tidak berlaku lagi, dan perangkat siswa itu keluar.`,
    askEmpty: (n: number) =>
      `Kosongkan kursi ${n} untuk siswa baru? Kursi mendapat samaran dan sandi gambar baru, kartu lama tidak berlaku, dan namanya di sini dihapus.`,
    askArchive: "Arsipkan kelas ini? Kodenya tidak berlaku lagi dan semua siswa keluar. Kelas tetap ada di sini untuk dibaca.",
    askErase:
      "Hapus kelas ini selamanya? Kursi, jawaban, hasil lomba, laporan, kota, dan catatan AI-nya, serta lomba di ruangnya, dihapus dari Numeria, dan nama yang tersimpan di browser ini ikut terhapus. Ini tidak bisa dibatalkan. Simpan nama atau laporannya dulu bila masih perlu.",
    typeLabel: (label: string) => `Ketik nama kelas, ${label}, untuk menghapusnya.`,
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
      seats: "Satu kelas berisi 1 sampai 100 kursi.",
      seats_limit: "Jumlah kursi melebihi batas akun ini.",
      classes_limit: "Akun ini belum bisa membuat kelas lagi.",
      not_organizer: "Daftar sebagai penyelenggara dulu.",
      suspended: "Akun ini ditangguhkan.",
      class_not_found: "Kelas itu sudah tidak ada.",
      archived: "Kelas ini sudah diarsipkan.",
      seat_not_found: "Kursi itu sudah tidak ada.",
      class_frozen: "Akun ini ditangguhkan, jadi kelasnya menunggu.",
      group: "Pilih kelompok A sampai Q.",
      names_file: "Kolom pertama berkas itu tidak berisi nomor kursi.",
      names_store: "Browser ini tidak bisa menyimpan nama (jendela privat?).",
      offline: "Server belum bisa dihubungi.",
      other: "Ada yang salah. Coba lagi.",
    } as Record<string, string>,
  },
};
type Text = (typeof TEXT)["en"];

/** A room for a class has this many desks; a class races in groups A to Q. */
const DESKS = 6;
const GROUPS = Array.from({ length: 17 }, (_, g) => g);
const letter = (g: number) => String.fromCharCode(65 + g);

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

/**
 * MY CLASSES: the list, or with `openId` that class's page on tab `tab`;
 * `onOpen` and `onTab` move between them, `onRace` opens a race room for a
 * class, and `onTrail` names the open class for the breadcrumb.
 */
export function MyClasses({
  lang,
  user,
  trial,
  onRace,
  raceLine,
  openId,
  tab,
  onOpen,
  onTab,
  onTrail,
}: {
  lang: Lang;
  user: User;
  trial: boolean;
  onRace: (classId: string) => void;
  /** How a race room opened now is raced. */
  raceLine: string;
  openId: string | null;
  tab: ClassTab;
  onOpen: (classId: string | null) => void;
  onTab: (tab: ClassTab) => void;
  onTrail: (label: string) => void;
}) {
  const t = TEXT[lang];
  const [classes, setClasses] = useState<ClassRow[]>();
  const [error, setError] = useState("");
  const [making, setMaking] = useState(false);
  const [cards, setCardsHere] = useState<Record<string, Card[]>>(() => ({ ...cardStore }));
  const setCards = (next: (all: Record<string, Card[]>) => Record<string, Card[]>) =>
    setCardsHere((all) => {
      const made = next(all);
      for (const k of Object.keys(cardStore)) delete cardStore[k];
      Object.assign(cardStore, made);
      return made;
    });
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
  useEffect(() => onTrail(opened?.label ?? ""), [opened?.label]);
  const active = classes?.filter((c) => c.status === "active") ?? [];
  const archived = classes?.filter((c) => c.status !== "active") ?? [];
  const rowOf = (c: ClassRow) => (
    <Link key={c.id} to={`/manage/class/${encodeURIComponent(c.id)}`} className={c.status === "active" ? "class-row" : "class-row old"}>
      <strong className="class-label">{c.label}</strong>
      <span>
        {t.grade(c.grade)}
        {c.school_year ? `, ${c.school_year}` : ""} · {t.seatsCount(c.seats)}
      </span>
      {c.join_code ? <span className="class-code">{c.join_code}</span> : <span className="past-state">{t.archived}</span>}
    </Link>
  );

  if (openId) {
    return (
      <section className="paper-sheet classes" id="classes">
        {opened ? (
          <ClassPage
            key={opened.id}
            t={t}
            lang={lang}
            user={user}
            row={opened}
            tab={tab}
            onTab={onTab}
            cards={cards[opened.id] ?? []}
            onCards={(c) => keep(opened.id, c)}
            onPrinted={() => setCards((all) => ({ ...all, [opened.id]: [] }))}
            onBack={() => onOpen(null)}
            onChange={() => void load()}
            onRace={() => onRace(opened.id)}
            raceLine={raceLine}
            trial={trial}
          />
        ) : classes || error ? (
          <>
            <ErrorLine t={t} code={error || "class_not_found"} />
            <Link className="btn small" to="/manage#classes">
              {t.allClasses}
            </Link>
          </>
        ) : (
          <p className="soft">{t.loading}</p>
        )}
      </section>
    );
  }

  return (
    <section className="paper-sheet classes" id="classes">
        <div className="admin-head">
          <h2>{t.title}</h2>
          <span className="head-buttons">
            <a className="btn" href="/edu/" title={t.eduHint}>
              {t.edu}
            </a>
            <button type="button" className="btn blue" onClick={() => setMaking(true)} disabled={!classes}>
              {t.newClass}
            </button>
          </span>
        </div>
        <p className="soft">{t.intro}</p>
        {trial && <p className="soft">{t.trial}</p>}
        <ErrorLine t={t} code={error} />
        {classes?.length === 0 && <p>{t.none}</p>}
        {classes && classes.length > 0 && <p className="soft">{t.listSummary(active.length, archived.length)}</p>}
        <div className="class-list">{active.map(rowOf)}</div>
        {archived.length > 0 && (
          <details className="class-archived">
            <summary>
              {t.archivedTitle} ({archived.length})
            </summary>
            <div className="class-list">{archived.map(rowOf)}</div>
          </details>
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
            onOpen(row.id);
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
  const max = trial ? 5 : 100;
  const [seats, setSeats] = useState(String(trial ? 5 : 30));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const make = () => {
    const n = Number(seats);
    if (!label.trim()) return setError("label");
    if (!Number.isInteger(n) || n < 1 || n > max) return setError(n > max && n <= 100 ? "seats_limit" : "seats");
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
        <NumberField id="class-seats" label={t.seatsLabel} min={1} max={max} value={seats} onChange={setSeats} />
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

type Ask = { kind: "picture" | "empty"; seat: number } | { kind: "archive" | "erase" } | { kind: "add" };

function ClassPage({
  t,
  lang,
  user,
  row,
  tab,
  onTab,
  cards,
  onCards,
  onPrinted,
  onBack,
  onChange,
  onRace,
  raceLine,
  trial,
}: {
  t: Text;
  lang: Lang;
  user: User;
  row: ClassRow;
  tab: ClassTab;
  onTab: (tab: ClassTab) => void;
  cards: Card[];
  onCards: (c: Card[]) => void;
  onPrinted: () => void;
  onBack: () => void;
  onChange: () => void;
  onRace: () => void;
  raceLine: string;
  trial: boolean;
}) {
  const [seats, setSeats] = useState<Seat[]>();
  const [names, setNames] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState("1");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("seat");
  const [board, setBoard] = useState(false);
  const shown = seats ? arrange(seats, names, query, sortBy) : [];
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
    else if (ask.kind === "erase") {
      setBusy(true);
      setError("");
      api(user, `${base}/delete`, { method: "POST" })
        .then(() => {
          onPrinted();
          onChange();
          onBack();
          return clearNames(row.id).catch(() => undefined);
        })
        .catch((e) => {
          setError(errorCode(e));
          setBusy(false);
          setAsk(null);
        });
    }
    else
      act(
        api<{ seats: Card[] }>(user, `${base}/seats`, { method: "POST", body: JSON.stringify({ count: Number(more) }) }).then((r) =>
          onCards(r.seats),
        ),
      );
  };

  const fileName = `numeria-${row.label.replace(/[^\p{L}\p{N}]+/gu, "-")}-${row.school_year.replace(/\D+/gu, "-")}`;
  const save = () => {
    if (!seats) return;
    const blob = new Blob([namesCsv(seats, names)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const loadFile = (f: File | undefined) => {
    if (!f) return;
    setError("");
    setNote("");
    f.text()
      .then((text) => {
        const now = Object.fromEntries((seats ?? []).map((s) => [s.number, s.pseudonym]));
        const { names: found, stale } = parseNamesCsv(text, now);
        if (Object.keys(found).length === 0 && stale === 0) throw new Error("names_file");
        const count = Object.values(found).filter(Boolean).length;
        return writeNames(row.id, found).then(() => {
          setNames((all) => ({ ...all, ...found }));
          setNote(t.namesLoaded(count, stale));
        });
      })
      .catch((e) => setError(errorCode(e) === "names_file" ? "names_file" : "names_store"));
  };

  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(t.locale, { day: "numeric", month: "short" }) + ", " + new Date(iso).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit" }) : t.never;

  // Groups with more seats than a room has desks.
  const sizes = new Map<number, number>();
  for (const s of seats ?? []) sizes.set(s.group, (sizes.get(s.group) ?? 0) + 1);
  const big = [...sizes].filter(([, n]) => n > DESKS).sort(([a], [b]) => a - b);

  const askText = !ask
    ? ""
    : ask.kind === "picture"
      ? t.askPicture(ask.seat)
      : ask.kind === "empty"
        ? t.askEmpty(ask.seat)
        : ask.kind === "archive"
          ? t.askArchive
          : ask.kind === "erase"
            ? t.askErase
            : t.howMany;

  const now = Date.now();
  const lately = seats?.filter((s) => s.last_seen_at && now - Date.parse(s.last_seen_at) < LATELY_DAYS * 86_400_000).length ?? 0;
  const never = seats?.filter((s) => !s.last_seen_at).length ?? 0;
  const locked = seats?.filter((s) => s.locked).length ?? 0;
  const byGroup = [...sizes.keys()].sort((a, b) => a - b).map((g) => [g, (seats ?? []).filter((s) => s.group === g)] as const);
  const stats: [string, number][] = [
    [t.stat.seats, seats?.length ?? row.seats],
    [t.stat.lately, lately],
    [t.stat.never, never],
    [t.stat.locked, locked],
    [t.stat.groups, sizes.size],
  ];

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
            {row.join_code ? ` · ${t.code} ${row.join_code}` : ""}
          </p>
          {active && <p className="soft">{t.raceLine(raceLine)}</p>}
        </div>
        {active && (
          <div className="row">
            <button type="button" className="btn small blue" onClick={onRace}>
              {t.race}
            </button>
            <button type="button" className="btn small blue" onClick={() => setBoard(true)} disabled={!seats?.length}>
              {t.board}
            </button>
          </div>
        )}
      </div>
      <div className="page-tabs" role="tablist" aria-label={row.label}>
        {CLASS_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`class-tab-${k}`}
            aria-selected={tab === k}
            aria-controls="class-panel"
            className={tab === k ? "page-tab on" : "page-tab"}
            onClick={() => onTab(k)}
          >
            {t.classTabs[k]}
          </button>
        ))}
      </div>
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
      <div role="tabpanel" id="class-panel" aria-labelledby={`class-tab-${tab}`} className="class-panel">
        {!seats ? (
          <p className="soft">{t.loading}</p>
        ) : tab === "overview" ? (
          <>
            <div className="stat-grid">
              {stats.map(([label, n]) => (
                <div key={label} className="stat">
                  <strong>{n}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {active && locked > 0 && <p className="soft">{t.lockedSeats(locked)}</p>}
            {big.map(([g, n]) => (
              <p key={g} className="err">
                {t.tooBig(letter(g), n)}
              </p>
            ))}
            {row.join_code && (
              <div className="class-block">
                <h3>{t.signInTitle}</h3>
                <div className="class-join">
                  <span className="soft">{t.code}</span>
                  <span className="room-code">{row.join_code}</span>
                  <span className="soft">{t.signInHow}</span>
                </div>
              </div>
            )}
            <div className="class-block end">
              <h3>{t.endTitle}</h3>
              <p className="soft">{t.endNote}</p>
              <div className="row">
                {active && (
                  <button type="button" className="btn small suspended" disabled={busy} onClick={() => setAsk({ kind: "archive" })}>
                    {t.archive}
                  </button>
                )}
                <button
                  type="button"
                  className="btn small suspended"
                  disabled={busy}
                  onClick={() => {
                    setTyped("");
                    setAsk({ kind: "erase" });
                  }}
                >
                  {t.erase}
                </button>
              </div>
            </div>
          </>
        ) : tab === "seats" ? (
          <>
            <p className="soft">{t.recordsNote}</p>
            {seats.length > 0 && (
              <div className="seat-find">
                <input className="field" type="text" enterKeyHint="search" placeholder={t.find} aria-label={t.find} value={query} onChange={(e) => setQuery(e.target.value)} />
                <label className="report-pick">
                  <span className="soft">{t.sortBy}</span>
                  <Pick className="group" label={t.sortBy} value={sortBy} onChange={setSortBy} options={SORTS.map((k) => ({ value: k, label: t.sorts[k] }))} />
                </label>
                {query.trim() && <span className="soft">{shown.length > 0 ? t.shown(shown.length, seats.length) : t.noMatch}</span>}
              </div>
            )}
            <div className="table-scroll">
              <table className="past-table seats">
                <thead>
                  <tr>
                    {t.cols.map((c, i) => (
                      <th key={i}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
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
                      <td className="seat-group">{letter(s.group)}</td>
                      <td className="seat-stats">
                        {t.official(s.official.matches, s.official.stars).map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                        {s.last_official && <div className="soft">{t.lastOfficial(s.last_official.place, s.last_official.points)}</div>}
                        {(s.board?.races ?? 0) > 0 && <div className="soft">{t.onBoard(s.board!.races)}</div>}
                      </td>
                      <td className="seat-stats">
                        {t.own(s.own.races, s.own.practices).map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                        {s.other_rooms.matches > 0 && <div className="soft">{t.otherRooms(s.other_rooms.matches)}</div>}
                        {s.own.days > 0 && <div className="soft">{t.days(s.own.days)}</div>}
                      </td>
                      <td className="seat-stats">
                        {s.locked ? <span className="past-state lock">{t.locked}</span> : <span className="soft">{day(s.last_seen_at)}</span>}
                      </td>
                      <td className="seat-actions">
                        {active && (
                          <div>
                            {s.locked && (
                              <IconButton tip={t.unlock} icon="unlock" tone="blue" disabled={busy} onClick={() => act(api(user, `${base}/seats/${s.number}/unlock`, { method: "POST" }))} />
                            )}
                            <IconButton tip={t.newPicture} icon="key" disabled={busy} onClick={() => setAsk({ kind: "picture", seat: s.number })} />
                            <IconButton tip={t.empty} icon="empty" tone="danger" disabled={busy} onClick={() => setAsk({ kind: "empty", seat: s.number })} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="soft">{t.namesNote}</p>
            <div className="row class-tools">
              <button type="button" className="btn small" onClick={save}>
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
                <button type="button" className="btn small" disabled={busy} onClick={() => setAsk({ kind: "add" })}>
                  {t.addSeats}
                </button>
              )}
            </div>
          </>
        ) : tab === "groups" ? (
          <>
            <p className="soft">{t.groupsNote}</p>
            {big.map(([g, n]) => (
              <p key={g} className="err">
                {t.tooBig(letter(g), n)}
              </p>
            ))}
            {active && seats.some((s) => s.group_chosen) && (
              <div className="row class-tools">
                <button type="button" className="btn small" disabled={busy} onClick={() => act(api(user, `${base}/groups`, { method: "DELETE" }))}>
                  {t.byNumber}
                </button>
              </div>
            )}
            <div className="group-grid">
              {byGroup.map(([g, list]) => (
                <div key={g} className={list.length > DESKS ? "group-card big" : "group-card"}>
                  <h4>{t.groupTitle(letter(g), list.length)}</h4>
                  <ul>
                    {list.map((s) => (
                      <li key={s.number}>
                        <span className="seat-no">{two(s.number)}</span>
                        <span className="group-who">{names[s.number] || s.pseudonym}</span>
                        <Pick
                          className={s.group_chosen ? "group chosen" : "group"}
                          label={t.moveTo(s.number)}
                          value={s.group}
                          disabled={!active || busy}
                          onChange={(group) => act(api(user, `${base}/seats/${s.number}/group`, { method: "POST", body: JSON.stringify({ group }) }))}
                          options={GROUPS.map((x) => ({ value: x, label: letter(x) }))}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : tab === "report" ? (
          <ClassReport lang={lang} user={user} base={base} file={fileName} heading={`${row.label} ${row.school_year}`} seats={seats} names={names} />
        ) : tab === "ranks" ? (
          <ClassLeaders lang={lang} user={user} base={base} active={active} seats={seats} names={names} trial={trial} />
        ) : (
          <ClassTown lang={lang} user={user} base={base} names={names} />
        )}
      </div>
      {ask && (
        <div className="veil" role="dialog" aria-modal="true" aria-label={askText} onClick={(e) => e.target === e.currentTarget && setAsk(null)}>
          <div className="paper-sheet narrow">
            <p>{askText}</p>
            {ask.kind === "add" && (
              <NumberField label={askText} min={1} max={100} value={more} onChange={setMore} autoFocus />
            )}
            {ask.kind === "erase" && (
              <>
                <label htmlFor="erase-label">{t.typeLabel(row.label)}</label>
                <input id="erase-label" className="field" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
              </>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setAsk(null)} autoFocus={ask.kind !== "add"}>
                {ask.kind === "add" ? t.cancel : t.no}
              </button>
              <button type="button" className={ask.kind === "add" ? "btn blue" : "btn suspended"} onClick={confirm} disabled={busy || (ask.kind === "erase" && typed.trim() !== row.label.trim())}>
                {ask.kind === "add" ? t.add : t.yes}
              </button>
            </div>
          </div>
        </div>
      )}
      {board && seats && <BoardPanel t={t} row={row} seats={seats} names={names} onClose={() => setBoard(false)} />}
      {cards.length > 0 && <PrintCards t={t} lang={lang} row={row} cards={cards} names={names} />}
    </>
  );
}

/**
 * Three seats for a race on the smartboard, opened in the game. The names go
 * in the link's hash, which never reaches a server, because the game may run
 * where this browser's names are not kept.
 */
function BoardPanel({ t, row, seats, names, onClose }: { t: Text; row: ClassRow; seats: Seat[]; names: Record<number, string>; onClose: () => void }) {
  const [picked, setPicked] = useState(() => [0, 1, 2].map((i) => seats[i]?.number ?? 0));
  const [record, setRecord] = useState(true);
  const label = (n: number) => `${two(n)} ${names[n] || seats.find((s) => s.number === n)?.pseudonym || ""}`.trim();
  const options = [{ value: 0, label: t.boardNobody }, ...seats.map((s) => ({ value: s.number, label: label(s.number) }))];
  const ready = picked.every((n) => n > 0) && new Set(picked).size === 3;
  const q = new URLSearchParams({ board: row.id, grade: String(row.grade) });
  if (record) q.set("record", "1");
  for (const n of picked) q.append("seat", `${n}:${names[n] || seats.find((s) => s.number === n)?.pseudonym || ""}`);
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label={t.boardTitle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="paper-sheet narrow board-panel">
        <h3 className="dialog-title">{t.boardTitle}</h3>
        <p className="soft">{t.boardBody}</p>
        {picked.map((n, i) => (
          <div className="board-slot" key={i}>
            <span>{t.boardPlayer(i + 1)}</span>
            <Pick label={t.boardPlayer(i + 1)} value={n} options={options} onChange={(v) => setPicked((all) => all.map((x, j) => (j === i ? v : x)))} />
          </div>
        ))}
        <label className="board-record">
          <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} /> {t.boardRecord}
        </label>
        {!ready && <p className="err">{t.boardDistinct}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose} autoFocus>
            {t.cancel}
          </button>
          {ready ? (
            <a className="btn blue" href={`${GAME}#${q}`} target="_blank" rel="noopener" onClick={onClose}>
              {t.boardOpen}
            </a>
          ) : (
            <button type="button" className="btn blue" disabled>
              {t.boardOpen}
            </button>
          )}
        </div>
      </div>
    </div>
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
