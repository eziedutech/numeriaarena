import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import type { User } from "firebase/auth";

import type { Route } from "./+types/manage";
import { api, errorCode, finishEmailLink, isSample, sendEmailLink, signInConfigured, signInWith, signOut, startSample, watchUser } from "../auth";
import { AdminAi } from "../admin-ai";
import { CLASS_TABS, MyClasses, type ClassTab } from "../classes";
import { RaceSetup, USUAL, describe, readSetup, type RoomSetup } from "../race-setup";
import { CopyCode } from "../copy-code";
import { useLang, type Lang } from "../legal";
import { GAME } from "../game-link";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage - Numeria Arena" }, { name: "robots", content: "noindex" }];
}

/**
 * One door for adults: teachers and organisers see their account, sign up
 * if they have not, and their classes; admins also see the organiser
 * gate. Every right is checked again by the server.
 */

type Status = "pending" | "approved" | "suspended";
const STATUSES: Status[] = ["pending", "approved", "suspended"];

interface Me {
  email: string;
  name: string;
  admin: boolean;
  organizer: { status: Status; org: { name: string; kind: string; country: string } | null } | null;
  terms_version: string;
}

interface Organizer {
  user_id: number;
  name: string;
  email: string;
  email_verified: boolean;
  provider: string;
  status: Status;
  path: string;
  org_name: string | null;
  org_kind: string | null;
  country: string | null;
  joined: string;
  updated: string;
}

const TEXT = {
  en: {
    home: "Manage",
    account: "My account",
    organizers: "Organizers",
    myClasses: "My classes",
    raceRooms: "Race rooms",
    signedInAs: "Signed in as",
    modes: { teacher: "TEACHER", admin: "ADMIN" } as Record<Mode, string>,
    signIn: "For teachers, club organisers and admins. Students never sign in here.",
    google: "Continue with Google",
    facebook: "Continue with Facebook",
    emailLink: "EMAIL ME A SIGN-IN LINK",
    emailLabel: "Your email",
    linkSent: (e: string) => `A sign-in link is on its way to ${e}. Open it in this browser.`,
    confirmEmail: "This link was opened in another browser. Type the email it was sent to.",
    go: "GO",
    signOut: "SIGN OUT",
    sampleOr: "Just looking?",
    sample: "TRY THE TEACHER PAGE",
    sampleNote: "A sample teacher just for you, with a class of 6 that has already raced and practised. No sign-in. It is gone after 24 hours.",
    sampleMaking: "Making your sample class...",
    sampleHere: "This is a sample teacher. Everything here is made up and gone after 24 hours. Sign out to start again or to sign in as yourself.",
    toGame: "TO THE GAME",
    status: { pending: "Waiting for approval", approved: "Verified", suspended: "Suspended" } as Record<Status, string>,
    pendingBody: "An admin checks new organisers. Until then you can set up one trial class with 5 seats and robots.",
    suspendedBody: "This account is suspended. Write to numeria@eziedutech.dev if you think this is a mistake.",
    admin: "Admin",
    tabs: [
      ["MY CLASSES", "Seats, sign-in cards and each student's records"],
      ["RACE ROOMS", "New races, the class screen, past results"],
    ],
    raceTitle: "NEW RACE ROOM",
    raceFor: "Who races in it?",
    forClass: (l: string) => `ONLY CLASS ${l}`,
    forAnyone: "OPEN TO ANYONE",
    raceForNote:
      "A room for a class seats only its students, signed in to their seats, and its results go to each seat's official record. A room open to anyone takes any player with the code and is counted apart.",
    noClasses: "No class yet: make one under MY CLASSES to race as a class.",
    openRooms: "ACTIVE ROOMS",
    noOpenRooms: "No room is active now.",
    roomFor: (l: string | null | undefined) => (l ? `Class ${l}` : "Open to anyone"),
    opening: "Making a room...",
    roomPlay: "Students press RACE MY CLASSMATES in the game and enter",
    roomPlayClass: (l: string) => `Students of ${l} press RACE MY CLASSMATES in the game and join with one button, or enter`,
    roomCode: "Room code",
    roomWatch: "Watch code, for a screen or parents",
    copy: "COPY",
    copied: "COPIED",
    roomSeats: "6 seats; robots fill the empty ones.",
    openScreen: "OPEN THE CLASS SCREEN",
    closeRoom: "CLOSE THE ROOM",
    closeSure: "Close this room? Nobody can join it again, and a match on now stops.",
    closeYes: "YES, CLOSE IT",
    keepOpen: "KEEP IT OPEN",
    history: "ROOMS SO FAR",
    historyNone: "No rooms yet. The rooms you open show here, with each match's results.",
    historySummary: (rooms: number, matches: number) =>
      `${rooms} ${rooms === 1 ? "room" : "rooms"}, ${matches} ${matches === 1 ? "match" : "matches"} played. The newest first.`,
    historyOpen: "OPEN",
    historyClosed: "CLOSED",
    historyMeta: (seats: number, matches: number) =>
      `${seats} seats · ${matches === 0 ? "no match yet" : `${matches} ${matches === 1 ? "match" : "matches"}`}`,
    historyMatch: (n: number) => `Match ${n}`,
    historyGroup: (g: string) => ` · Group ${g}`,
    historyUntil: (end: string, n: number) => ` to ${end} (${n} min)`,
    historyUnfinished: "Stopped before the end",
    historyCols: ["Place", "Player", "Points", "Stars"],
    historySeat: "Seat",
    robot: "robot",
    roomTabs: { overview: "OVERVIEW", matches: "MATCHES" } as Record<RoomTab, string>,
    roomDetail: "DETAILS",
    roomNotFound: "This room is not among your last 30 rooms.",
    allRooms: "ALL ROOMS",
    roomSetup: "How it is raced",
    roomOpened: "Opened",
    roomKind: { class: "For a class", open: "Open to anyone" } as Record<string, string>,
    roomClosedNote: "This room is closed: nobody can join it again. Its results stay here.",
    roomNoMatches: "No match in this room yet.",
    loading: "Loading...",
    locale: "en-GB",
    regTitle: "ABOUT YOU",
    regIntro: "One time only. Students never see your email.",
    yourName: "Your name (shown to your classes)",
    orgName: "School or club (leave empty for a personal workspace)",
    orgKind: "Kind",
    kinds: { school: "SCHOOL", tutoring: "TUTORING", community: "COMMUNITY", event: "EVENT" } as Record<string, string>,
    country: "Country (2 letters, like ID or US)",
    statement:
      "I am a teacher or organiser responsible for the children in my groups, and I will get parental permission as my local rules require. I agree to the terms of use.",
    readTerms: "Read the terms of use",
    save: "SAVE",
    tab: { pending: "WAITING", approved: "APPROVED", suspended: "SUSPENDED" } as Record<Status, string>,
    empty: { pending: "Nobody is waiting.", approved: "No approved organisers yet.", suspended: "Nobody is suspended." } as Record<Status, string>,
    to: { pending: "BACK TO WAITING", approved: "APPROVE", suspended: "SUSPEND" } as Record<Status, string>,
    verified: "verified",
    unverified: "not verified",
    personal: "personal workspace",
    joined: "Joined",
    changed: "Changed",
    via: { self: "signed up", manual: "approved by an admin", school_domain: "school email", invite: "invited" } as Record<string, string>,
    reason: "Reason (kept in the audit log)",
    confirm: "CONFIRM",
    cancel: "CANCEL",
    errors: {
      reason: "Write a reason of 3 to 300 letters.",
      setup_games: "Pick one to five games for the race.",
      setup_time: "Pick fewer rounds or shorter ones: a race lasts at most 15 minutes.",
      unchanged: "That organiser already has this status.",
      not_admin: "This account is not an admin.",
      offline: "The server cannot be reached right now.",
      name: "Write a name of 2 to 60 letters.",
      org_name: "The school or club name is too long.",
      org_kind: "Pick a kind.",
      country: "Write the country as two letters, like ID.",
      terms_not_agreed: "Tick the statement to continue.",
      terms_changed: "The statement changed. Reload the page and try again.",
      already_registered: "This account is already signed up.",
      busy: "Many samples were made in the last hour. Try again later.",
      invalid_token: "Your session is over. Sign out and in again.",
      suspended: "This account is suspended.",
      email_required: "This account has no email. Use Google or an email link instead.",
      "auth/popup-closed-by-user": "The sign-in window was closed before it finished.",
      "auth/account-exists-with-different-credential": "This email already signs in another way. Use that way first.",
      "auth/invalid-email": "That email does not look right.",
      other: "Something went wrong. Try again.",
    } as Record<string, string>,
  },
  id: {
    home: "Kelola",
    account: "Akun saya",
    organizers: "Penyelenggara",
    myClasses: "Kelas saya",
    raceRooms: "Ruang lomba",
    signedInAs: "Masuk sebagai",
    modes: { teacher: "GURU", admin: "ADMIN" } as Record<Mode, string>,
    signIn: "Untuk guru, pembina klub, dan admin. Siswa tidak pernah masuk di sini.",
    google: "Lanjut dengan Google",
    facebook: "Lanjut dengan Facebook",
    emailLink: "KIRIM TAUTAN MASUK KE EMAIL",
    emailLabel: "Email Anda",
    linkSent: (e: string) => `Tautan masuk sedang dikirim ke ${e}. Buka di browser ini.`,
    confirmEmail: "Tautan ini dibuka di browser lain. Ketik email tujuan tautan itu.",
    go: "MASUK",
    signOut: "KELUAR",
    sampleOr: "Hanya ingin melihat?",
    sample: "COBA HALAMAN GURU",
    sampleNote: "Guru contoh khusus untuk Anda, dengan kelas 6 siswa yang sudah berlomba dan berlatih. Tanpa masuk akun. Hilang setelah 24 jam.",
    sampleMaking: "Membuat kelas contoh Anda...",
    sampleHere: "Ini guru contoh. Semua isinya buatan dan hilang setelah 24 jam. Keluar untuk mulai lagi atau masuk dengan akun Anda sendiri.",
    toGame: "KE GAME",
    status: { pending: "Menunggu persetujuan", approved: "Terverifikasi", suspended: "Ditangguhkan" } as Record<Status, string>,
    pendingBody: "Admin memeriksa penyelenggara baru. Sambil menunggu, Anda bisa menyiapkan satu kelas percobaan dengan 5 kursi dan robot.",
    suspendedBody: "Akun ini ditangguhkan. Tulis ke numeria@eziedutech.dev bila menurut Anda ini keliru.",
    admin: "Admin",
    tabs: [
      ["KELAS SAYA", "Kursi, kartu masuk, dan catatan tiap siswa"],
      ["RUANG LOMBA", "Lomba baru, layar kelas, hasil sebelumnya"],
    ],
    raceTitle: "BUAT RUANG LOMBA",
    raceFor: "Siapa yang berlomba?",
    forClass: (l: string) => `HANYA KELAS ${l}`,
    forAnyone: "TERBUKA UNTUK SIAPA SAJA",
    raceForNote:
      "Ruang untuk kelas hanya menerima siswanya yang sudah masuk ke kursi, dan hasilnya masuk ke catatan resmi tiap kursi. Ruang terbuka menerima siapa saja yang punya kodenya dan dihitung terpisah.",
    noClasses: "Belum ada kelas: buat dulu di KELAS SAYA untuk berlomba sebagai kelas.",
    openRooms: "RUANG AKTIF",
    noOpenRooms: "Tidak ada ruang yang aktif.",
    roomFor: (l: string | null | undefined) => (l ? `Kelas ${l}` : "Terbuka untuk siapa saja"),
    opening: "Membuat ruang...",
    roomPlay: "Siswa menekan LOMBA DENGAN TEMAN di game lalu memasukkan",
    roomPlayClass: (l: string) => `Siswa ${l} menekan LOMBA DENGAN TEMAN di game lalu bergabung dengan satu tombol, atau memasukkan`,
    roomCode: "Kode ruang",
    roomWatch: "Kode tonton, untuk layar atau orang tua",
    copy: "SALIN",
    copied: "TERSALIN",
    roomSeats: "6 kursi; robot mengisi yang kosong.",
    openScreen: "BUKA LAYAR KELAS",
    closeRoom: "TUTUP RUANG",
    closeSure: "Tutup ruang ini? Tidak ada yang bisa masuk lagi, dan pertandingan yang berjalan berhenti.",
    closeYes: "YA, TUTUP",
    keepOpen: "BIARKAN TERBUKA",
    history: "RUANG SEBELUMNYA",
    historyNone: "Belum ada ruang. Ruang yang Anda buka tampil di sini, dengan hasil tiap pertandingan.",
    historySummary: (rooms: number, matches: number) =>
      `${rooms} ruang, ${matches} pertandingan dimainkan. Yang terbaru di atas.`,
    historyOpen: "TERBUKA",
    historyClosed: "DITUTUP",
    historyMeta: (seats: number, matches: number) =>
      `${seats} kursi · ${matches === 0 ? "belum ada pertandingan" : `${matches} pertandingan`}`,
    historyMatch: (n: number) => `Pertandingan ${n}`,
    historyGroup: (g: string) => ` · Kelompok ${g}`,
    historyUntil: (end: string, n: number) => ` sampai ${end} (${n} menit)`,
    historyUnfinished: "Berhenti sebelum selesai",
    historyCols: ["Peringkat", "Pemain", "Poin", "Bintang"],
    historySeat: "Kursi",
    robot: "robot",
    roomTabs: { overview: "RINGKASAN", matches: "PERTANDINGAN" } as Record<RoomTab, string>,
    roomDetail: "RINCIAN",
    roomNotFound: "Ruang ini tidak ada di antara 30 ruang terakhir Anda.",
    allRooms: "SEMUA RUANG",
    roomSetup: "Cara berlomba",
    roomOpened: "Dibuka",
    roomKind: { class: "Untuk kelas", open: "Terbuka untuk siapa saja" } as Record<string, string>,
    roomClosedNote: "Ruang ini sudah ditutup: tidak ada yang bisa masuk lagi. Hasilnya tetap di sini.",
    roomNoMatches: "Belum ada pertandingan di ruang ini.",
    loading: "Memuat...",
    locale: "id-ID",
    regTitle: "TENTANG ANDA",
    regIntro: "Hanya sekali. Siswa tidak pernah melihat email Anda.",
    yourName: "Nama Anda (tampil di kelas Anda)",
    orgName: "Sekolah atau klub (kosongkan untuk ruang kerja pribadi)",
    orgKind: "Jenis",
    kinds: { school: "SEKOLAH", tutoring: "BIMBEL", community: "KOMUNITAS", event: "ACARA" } as Record<string, string>,
    country: "Negara (2 huruf, misalnya ID atau US)",
    statement:
      "Saya guru atau penyelenggara yang bertanggung jawab atas anak-anak di grup saya, dan akan meminta izin orang tua sesuai aturan setempat. Saya menyetujui syarat penggunaan.",
    readTerms: "Baca syarat penggunaan",
    save: "SIMPAN",
    tab: { pending: "MENUNGGU", approved: "DISETUJUI", suspended: "DITANGGUHKAN" } as Record<Status, string>,
    empty: { pending: "Tidak ada yang menunggu.", approved: "Belum ada penyelenggara yang disetujui.", suspended: "Tidak ada yang ditangguhkan." } as Record<Status, string>,
    to: { pending: "KEMBALIKAN KE MENUNGGU", approved: "SETUJUI", suspended: "TANGGUHKAN" } as Record<Status, string>,
    verified: "terverifikasi",
    unverified: "belum terverifikasi",
    personal: "ruang kerja pribadi",
    joined: "Bergabung",
    changed: "Diubah",
    via: { self: "mendaftar sendiri", manual: "disetujui admin", school_domain: "email sekolah", invite: "diundang" } as Record<string, string>,
    reason: "Alasan (disimpan di log audit)",
    confirm: "KONFIRMASI",
    cancel: "BATAL",
    errors: {
      reason: "Tulis alasan 3 sampai 300 huruf.",
      setup_games: "Pilih satu sampai lima game untuk lomba.",
      setup_time: "Pilih babak lebih sedikit atau lebih singkat: lomba paling lama 15 menit.",
      unchanged: "Penyelenggara itu sudah berstatus ini.",
      not_admin: "Akun ini bukan admin.",
      offline: "Server belum bisa dihubungi.",
      name: "Tulis nama 2 sampai 60 huruf.",
      org_name: "Nama sekolah atau klub terlalu panjang.",
      org_kind: "Pilih jenisnya.",
      country: "Tulis negara dengan dua huruf, misalnya ID.",
      terms_not_agreed: "Centang pernyataan untuk melanjutkan.",
      terms_changed: "Pernyataan berubah. Muat ulang halaman lalu coba lagi.",
      already_registered: "Akun ini sudah terdaftar.",
      busy: "Banyak contoh dibuat dalam satu jam terakhir. Coba lagi nanti.",
      invalid_token: "Sesi Anda sudah habis. Keluar lalu masuk lagi.",
      suspended: "Akun ini ditangguhkan.",
      email_required: "Akun ini tidak punya email. Pakai Google atau tautan email.",
      "auth/popup-closed-by-user": "Jendela masuk ditutup sebelum selesai.",
      "auth/account-exists-with-different-credential": "Email ini sudah masuk dengan cara lain. Pakai cara itu dulu.",
      "auth/invalid-email": "Email itu sepertinya keliru.",
      other: "Ada yang salah. Coba lagi.",
    } as Record<string, string>,
  },
};
type Text = (typeof TEXT)["en"];

const errorText = (t: Text, code: string) => t.errors[code] ?? t.errors.other;

/** The tabs of a room's page, as `?tab=` names them. */
const ROOM_TABS = ["overview", "matches"] as const;
type RoomTab = (typeof ROOM_TABS)[number];

/** One account can be an admin and a teacher at once; an admin picks which side of the page to use. */
type Mode = "teacher" | "admin";
const MODE_KEY = "numeria.manageAs";

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "admin" ? "admin" : "teacher";
  } catch {
    return "teacher";
  }
}

function ErrorLine({ t, code }: { t: Text; code: string }) {
  if (!code) return null;
  return (
    <p className="err" role="alert">
      {errorText(t, code)}
    </p>
  );
}

export default function Manage() {
  const [lang, setLang] = useLang();
  const t = TEXT[lang];
  // undefined while Firebase starts, null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("teacher");
  const chooseMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // The choice lasts for this visit.
    }
  };
  useEffect(() => setMode(readMode()), []);
  const asAdmin = mode === "admin" && Boolean(me?.admin);
  const [adminView, setAdminView] = useState<"organizers" | "ai">("organizers");
  // /manage/class/ID and /manage/room/ID: one class's or one room's page; the tab is in ?tab=.
  const [kind, id] = (useParams()["*"] ?? "").split("/");
  const classId = kind === "class" && id ? id : null;
  const roomId = kind === "room" && id ? id : null;
  const [search, setSearch] = useSearchParams();
  const pageTab = search.get("tab") ?? "";
  const setPageTab = (tab: string) => setSearch(tab === "overview" ? {} : { tab }, { replace: true, preventScrollReset: true });
  // The open class's or room's name, for the breadcrumb.
  const [trail, setTrail] = useState("");

  const loadMe = (u: User) => {
    setError("");
    api<Me>(u, "/me").then(setMe, (e) => setError(errorCode(e)));
  };

  useEffect(() => {
    watchUser((u) => {
      setUser(u);
      setMe(null);
      if (u) loadMe(u);
    })
      .then((r) => setNeedsEmail(r === "needs_email"))
      .catch((e) => {
        // Firebase did not start: show the sign-in with the reason, never an endless skeleton.
        console.warn("[manage] sign-in did not start", e);
        setError(errorCode(e));
        setUser(null);
      });
  }, []);

  const crumbs: { label: string; to?: string }[] = asAdmin
    ? [{ label: t.home }, { label: t.organizers }]
    : me && classId
      ? [{ label: t.home }, { label: t.account, to: "/manage" }, { label: t.myClasses, to: "/manage#classes" }, { label: trail || "..." }]
      : me && roomId
        ? [{ label: t.home }, { label: t.account, to: "/manage" }, { label: t.raceRooms, to: "/manage#rooms" }, { label: trail || "..." }]
        : [{ label: t.home }, { label: t.account }];

  return (
    <main className="paper-page manage">
      <nav className="paper-nav" aria-label={lang === "id" ? "Navigasi" : "Navigation"}>
        <ol className="crumbs">
          {crumbs.map((c, i) => (
            <li key={i} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
              {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
            </li>
          ))}
        </ol>
        <span className="nav-right">
          <a className="paper-chip" href={GAME}>
            {t.toGame}
          </a>
          <LangSwitch lang={lang} setLang={setLang} />
        </span>
      </nav>
      {user === undefined || (user && !me && !error) ? (
        <section className="paper-sheet" aria-busy="true">
          <div className="skel wide" />
          <div className="skel" />
          <div className="skel" />
        </section>
      ) : !user ? (
        <SignIn t={t} needsEmail={needsEmail} startError={error} />
      ) : !me ? (
        <section className="paper-sheet">
          <ErrorLine t={t} code={error} />
          <button type="button" className="btn" onClick={() => void signOut()}>
            {t.signOut}
          </button>
        </section>
      ) : (
        <>
          {me.admin && (
            <div className="tabs mode" role="tablist" aria-label={t.signedInAs}>
              <span className="mode-label">{t.signedInAs}</span>
              {(["teacher", "admin"] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={m === mode} className={m === mode ? "tab on" : "tab"} onClick={() => chooseMode(m)}>
                  {t.modes[m]}
                </button>
              ))}
            </div>
          )}
          {asAdmin ? (
            <>
              <section className="paper-sheet">
                <AccountHead t={t} me={me} />
              </section>
              <div className="tabs" role="tablist" aria-label={t.modes.admin}>
                {(["organizers", "ai"] as const).map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={v === adminView} className={v === adminView ? "tab on" : "tab"} onClick={() => setAdminView(v)}>
                    {v === "ai" ? "AI" : t.organizers.toUpperCase()}
                  </button>
                ))}
              </div>
              {adminView === "ai" ? <AdminAi lang={lang} user={user} /> : <Organizers t={t} user={user} />}
            </>
          ) : (
            <Account
              t={t}
              lang={lang}
              user={user}
              me={me}
              onChange={() => loadMe(user)}
              classId={classId}
              roomId={roomId}
              pageTab={pageTab}
              onPageTab={setPageTab}
              onTrail={setTrail}
            />
          )}
        </>
      )}
    </main>
  );
}

function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <span className="paper-chip" role="group" aria-label={lang === "id" ? "Bahasa" : "Language"}>
      {(["en", "id"] as Lang[]).map((l) => (
        <button key={l} type="button" className={l === lang ? "seg on" : "seg"} aria-pressed={l === lang} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </span>
  );
}

function SignIn({ t, needsEmail, startError }: { t: Text; needsEmail: boolean; startError: string }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(startError);
  const [making, setMaking] = useState(false);
  const run = (p: Promise<unknown>, done?: string) => {
    setError("");
    p.then(() => done && setNote(done)).catch((e) => setError(errorCode(e)));
  };
  const trySample = () => {
    if (making) return;
    setMaking(true);
    setError("");
    startSample()
      .catch((e) => setError(errorCode(e)))
      .finally(() => setMaking(false));
  };
  return (
    <section className="paper-sheet narrow">
      <p>{needsEmail ? t.confirmEmail : t.signIn}</p>
      {!needsEmail && (
        <>
          {/* Plain text, no company logos. */}
          <button type="button" className="btn wide" onClick={() => run(signInWith("google"))}>
            {t.google}
          </button>
          <button type="button" className="btn wide" onClick={() => run(signInWith("facebook"))}>
            {t.facebook}
          </button>
        </>
      )}
      <label className="field-label" htmlFor="manage-email">
        {t.emailLabel}
      </label>
      <input id="manage-email" className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button
        type="button"
        className="btn wide blue"
        onClick={() => {
          const e = email.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(e)) {
            setError("auth/invalid-email");
            return;
          }
          run(needsEmail ? finishEmailLink(e) : sendEmailLink(e), needsEmail ? "" : t.linkSent(e));
        }}
      >
        {needsEmail ? t.go : t.emailLink}
      </button>
      {note && <p>{note}</p>}
      <ErrorLine t={t} code={error} />
      {!needsEmail && (
        <div className="sample-try">
          <p className="field-label">{t.sampleOr}</p>
          <button type="button" className="btn wide" disabled={making} onClick={trySample}>
            {making ? t.sampleMaking : t.sample}
          </button>
          <p className="soft">{t.sampleNote}</p>
        </div>
      )}
    </section>
  );
}

/** Who is signed in, and the way out. */
function AccountHead({ t, me }: { t: Text; me: Me }) {
  return (
    <div className="admin-head">
      <div>
        <h1 className="account-name">{me.name || me.email}</h1>
        <p className="soft">
          {me.email}
          {me.admin ? `, ${t.admin}` : ""}
        </p>
      </div>
      <button type="button" className="btn small" onClick={() => void signOut()}>
        {t.signOut}
      </button>
    </div>
  );
}

/** The signed-in adult: who, where, the approval status, the sign-up form if needed, and the class tools. */
type Tab = "classes" | "rooms";

function Account({
  t,
  lang,
  user,
  me,
  onChange,
  classId,
  roomId,
  pageTab,
  onPageTab,
  onTrail,
}: {
  t: Text;
  lang: Lang;
  user: User;
  me: Me;
  onChange: () => void;
  /** With one of these, that class's or room's own page instead of the account. */
  classId: string | null;
  roomId: string | null;
  pageTab: string;
  onPageTab: (tab: string) => void;
  onTrail: (label: string) => void;
}) {
  const org = me.organizer?.org;
  const navigate = useNavigate();
  const { hash } = useLocation();
  // Bumped when a room opens or closes, so the open rooms and the history read again.
  const [rooms, setRooms] = useState(0);
  // The game links to /manage#classes and /manage#rooms, which open that tab.
  const tab: Tab = hash === "#rooms" ? "rooms" : "classes";
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const [setup, setSetup] = useState<RoomSetup>(USUAL);
  useEffect(() => setSetup(readSetup(me.email)), [me.email]);
  const working = me.organizer && me.organizer.status !== "suspended";
  const show = (next: Tab) => navigate(`/manage#${next}`, { replace: !classId });
  /**
   * A race room of six seats with the chosen setup, for one class or for
   * anyone; the RACE ROOMS tab then shows it, or from a class's page the
   * new room's own page.
   */
  const openRoom = (forClass?: string, toRoom = false) => {
    if (opening) return;
    setOpening(true);
    setOpenError("");
    if (!toRoom) show("rooms");
    api<OpenedRoom>(user, "/rooms", {
      method: "POST",
      body: JSON.stringify({ seats: 6, kind: "class", class_id: forClass, setup }),
    })
      .then(
        (room) => {
          setRooms((n) => n + 1);
          if (toRoom) navigate(`/manage/room/${encodeURIComponent(room.id)}`);
        },
        (e) => {
          setOpenError(errorCode(e));
          if (toRoom) show("rooms");
        },
      )
      .finally(() => setOpening(false));
  };
  if (working && classId) {
    return (
      <MyClasses
        lang={lang}
        user={user}
        trial={me.organizer?.status === "pending"}
        onRace={(c) => openRoom(c, true)}
        raceLine={describe(lang, setup)}
        openId={classId}
        tab={(CLASS_TABS as readonly string[]).includes(pageTab) ? (pageTab as ClassTab) : "overview"}
        onOpen={(c) => navigate(c ? `/manage/class/${encodeURIComponent(c)}` : "/manage#classes")}
        onTab={onPageTab}
        onTrail={onTrail}
      />
    );
  }
  if (me.organizer && roomId) {
    return (
      <RoomPage
        t={t}
        lang={lang}
        user={user}
        id={roomId}
        tab={(ROOM_TABS as readonly string[]).includes(pageTab) ? (pageTab as RoomTab) : "overview"}
        onTab={onPageTab}
        onTrail={onTrail}
        version={rooms}
        onChange={() => setRooms((n) => n + 1)}
      />
    );
  }
  return (
    <>
      <section className="paper-sheet">
        <AccountHead t={t} me={me} />
        {isSample() && <p className="sample-here">{t.sampleHere}</p>}
        {me.organizer && (
          <>
            <p>
              <strong>{t.status[me.organizer.status]}</strong>
              {org && org.kind !== "personal" ? ` · ${org.name}, ${org.country}` : ""}
            </p>
            {me.organizer.status === "pending" && <p>{t.pendingBody}</p>}
            {me.organizer.status === "suspended" && <p>{t.suspendedBody}</p>}
          </>
        )}
      </section>
      {!me.organizer && <SignUp t={t} user={user} me={me} onDone={onChange} />}
      {working && (
        <section className="folder">
          <div className="tools folder-tabs" role="tablist">
            {(["classes", "rooms"] as Tab[]).map((k, i) => (
              <button
                key={k}
                type="button"
                role="tab"
                id={`tab-${k}`}
                aria-selected={tab === k}
                aria-controls={`panel-${k}`}
                className={tab === k ? "tool tool-on on" : "tool tool-on"}
                onClick={() => show(k)}
              >
                <strong>{t.tabs[i][0]}</strong>
                <span className="soft">{t.tabs[i][1]}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {working && tab === "classes" && (
        <div role="tabpanel" id="panel-classes" aria-labelledby="tab-classes">
          <MyClasses
            lang={lang}
            user={user}
            trial={me.organizer?.status === "pending"}
            onRace={(c) => openRoom(c, true)}
            raceLine={describe(lang, setup)}
            openId={null}
            tab="overview"
            onOpen={(c) => navigate(c ? `/manage/class/${encodeURIComponent(c)}` : "/manage#classes")}
            onTab={onPageTab}
            onTrail={onTrail}
          />
        </div>
      )}
      {me.organizer && (!working || tab === "rooms") && (
        <div role="tabpanel" id="panel-rooms" aria-labelledby="tab-rooms">
          {working && <RaceRooms t={t} lang={lang} owner={me.email} setup={setup} onSetup={setSetup} user={user} version={rooms} opening={opening} openError={openError} onOpen={openRoom} onChange={() => setRooms((n) => n + 1)} />}
          <RoomHistory t={t} user={user} version={rooms} />
        </div>
      )}
    </>
  );
}

interface OpenedRoom {
  id: string;
  play_code: string;
  watch_code: string;
  host_token: string;
  class_label?: string | null;
  setup?: RoomSetup | null;
}

/** The class screen of an open room; the host token stays in the hash, which the browser never sends to a server. */
const screenUrl = (room: OpenedRoom) =>
  `/screen?code=${encodeURIComponent(room.watch_code)}#host=${encodeURIComponent(room.host_token)}&play=${encodeURIComponent(room.play_code)}`;

interface ClassChoice {
  id: string;
  label: string;
  status: "active" | "archived";
}

/**
 * RACE ROOMS: choose how it is raced, then open a room of six seats for one of this teacher's classes
 * (only its signed-in seats, the official record) or for anyone with the
 * code; then every room still open, each with its codes, the class screen
 * that starts it, and CLOSE THE ROOM. Rooms live in the server's memory, so
 * a reload finds them again until they close or the server is updated.
 */
function RaceRooms({
  t,
  lang,
  owner,
  setup,
  onSetup,
  user,
  version,
  opening,
  openError,
  onOpen,
  onChange,
}: {
  t: Text;
  lang: Lang;
  owner: string;
  setup: RoomSetup;
  onSetup: (s: RoomSetup) => void;
  user: User;
  version: number;
  opening: boolean;
  openError: string;
  onOpen: (classId?: string) => void;
  onChange: () => void;
}) {
  // undefined while asking the server.
  const [rooms, setRooms] = useState<OpenedRoom[]>();
  const [classes, setClasses] = useState<ClassChoice[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<OpenedRoom | null>(null);
  useEffect(() => {
    api<{ rooms: OpenedRoom[] }>(user, "/rooms").then(
      (r) => setRooms(r.rooms),
      (e) => {
        setRooms([]);
        setError(errorCode(e));
      },
    );
  }, [user, version]);
  useEffect(() => {
    api<{ classes: ClassChoice[] }>(user, "/classes").then(
      (r) => setClasses(r.classes.filter((c) => c.status === "active")),
      () => setClasses([]),
    );
  }, [user]);
  const close = (room: OpenedRoom) => {
    if (busy) return;
    setAsking(null);
    setBusy(true);
    setError("");
    api(user, `/rooms/${encodeURIComponent(room.id)}`, { method: "DELETE" })
      .then(onChange, (e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <section className="paper-sheet">
        <h2 className="sheet-title">{t.raceTitle}</h2>
        <RaceSetup lang={lang} owner={owner} setup={setup} onChange={onSetup} />
        <p>{t.raceFor}</p>
        <div className="row race-for">
          {classes?.map((c) => (
            <button key={c.id} type="button" className="btn blue" disabled={opening} onClick={() => onOpen(c.id)}>
              {t.forClass(c.label)}
            </button>
          ))}
          <button type="button" className="btn" disabled={opening || !classes} onClick={() => onOpen()}>
            {t.forAnyone}
          </button>
        </div>
        {classes?.length === 0 && <p className="soft">{t.noClasses}</p>}
        <p className="soft">{opening ? t.opening : t.raceForNote}</p>
        <ErrorLine t={t} code={openError} />
      </section>
      <section className="paper-sheet">
        <h2 className="sheet-title">{t.openRooms}</h2>
        <ErrorLine t={t} code={error} />
        {rooms?.length === 0 && <p className="soft">{t.noOpenRooms}</p>}
        <div className="tools tickets">
          {rooms?.map((room) => {
            const screen = screenUrl(room);
            return (
              <div key={room.id} className="tool ticket">
                <strong>{t.roomFor(room.class_label)}</strong>
                <span>{room.class_label ? t.roomPlayClass(room.class_label) : t.roomPlay}</span>
                <CopyCode big label={t.roomCode} code={room.play_code} copyText={t.copy} copiedText={t.copied} />
                <CopyCode label={t.roomWatch} code={room.watch_code} copyText={t.copy} copiedText={t.copied} />
                <span>{describe(lang, room.setup)}</span>
                <span className="soft">{t.roomSeats}</span>
                <div className="row ticket-foot">
                  <Link className="btn small" to={`/manage/room/${encodeURIComponent(room.id)}`}>
                    {t.roomDetail}
                  </Link>
                  <a className="btn small" href={screen} target="_blank" rel="noopener">
                    {t.openScreen}
                  </a>
                  <button type="button" className="btn small" onClick={() => setAsking(room)} disabled={busy}>
                    {t.closeRoom}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {asking && <CloseAsk t={t} code={asking.play_code} onKeep={() => setAsking(null)} onClose={() => close(asking)} />}
    </>
  );
}

interface PastMatch {
  started_at: string;
  ended_at: string | null;
  seats: { name: string; bot: boolean }[];
  /** The group that raced (0 is A), in a room for a class. */
  race_group?: number | null;
  players: { name: string; bot: boolean; points: number; place: number; stars: number }[] | null;
}

interface PastRoom {
  id: string;
  play_code: string;
  kind: "class" | "open";
  seats: number;
  /** The class the room was opened for, or null for a room for anyone. */
  class_label?: string | null;
  created_at: string;
  open: boolean;
  setup?: RoomSetup | null;
  matches: PastMatch[];
}

const dayOf = (t: Text, iso: string) => new Date(iso).toLocaleDateString(t.locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const clockOf = (t: Text, iso: string) => new Date(iso).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit" });

/** ROOMS SO FAR: every room this adult opened, the newest first, one line each that leads to the room's page. */
function RoomHistory({ t, user, version }: { t: Text; user: User; version: number }) {
  const [rooms, setRooms] = useState<PastRoom[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ rooms: PastRoom[] }>(user, "/rooms/history").then(
      (r) => {
        setRooms(r.rooms);
        setError("");
      },
      (e) => setError(errorCode(e)),
    );
  }, [user, version]);
  const matches = rooms?.reduce((n, r) => n + r.matches.length, 0) ?? 0;
  return (
    <section className="paper-sheet history">
      <h2 className="sheet-title">{t.history}</h2>
      <ErrorLine t={t} code={error} />
      {rooms?.length === 0 && <p className="soft">{t.historyNone}</p>}
      {rooms && rooms.length > 0 && <p className="soft">{t.historySummary(rooms.length, matches)}</p>}
      <div className="past-list">
        {rooms?.map((r) => (
          <Link key={r.id} to={`/manage/room/${encodeURIComponent(r.id)}`} className="past-head past-link">
            <strong className="past-code">{r.play_code}</strong>
            <span className="past-tags">
              {r.class_label && <span className="past-state">{r.class_label}</span>}
              <span className={r.open ? "past-state on" : "past-state"}>{r.open ? t.historyOpen : t.historyClosed}</span>
            </span>
            <span className="past-when">
              {dayOf(t, r.created_at)}, {clockOf(t, r.created_at)}
            </span>
            <span className="soft past-meta">{t.historyMeta(r.seats, r.matches.length)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Each match of a room, the first first: when, the group, and the places or, unfinished, who sat down. */
function MatchList({ t, matches }: { t: Text; matches: PastMatch[] }) {
  return (
    <>
      {matches.map((m, n) => {
        const minutes = m.ended_at ? Math.max(1, Math.round((Date.parse(m.ended_at) - Date.parse(m.started_at)) / 60000)) : 0;
        return (
          <div key={m.started_at} className="past-match">
            <p className="past-match-head">
              <strong>
                {t.historyMatch(n + 1)}
                {m.race_group != null && t.historyGroup(String.fromCharCode(65 + m.race_group))}
              </strong>
              <span className="soft">
                {clockOf(t, m.started_at)}
                {m.ended_at ? t.historyUntil(clockOf(t, m.ended_at), minutes) : ""}
              </span>
              {!m.players && <span className="past-state">{t.historyUnfinished}</span>}
            </p>
            <table className="past-table">
              <thead>
                <tr>
                  <th>{m.players ? t.historyCols[0] : t.historySeat}</th>
                  <th>{t.historyCols[1]}</th>
                  {m.players && <th className="num">{t.historyCols[2]}</th>}
                  {m.players && <th>{t.historyCols[3]}</th>}
                </tr>
              </thead>
              <tbody>
                {m.players
                  ? [...m.players]
                      .sort((a, b) => a.place - b.place)
                      .map((p) => (
                        <tr key={p.name} className={p.bot ? "bot" : ""}>
                          <td>{p.place}</td>
                          <td>
                            {p.name}
                            {p.bot && <span className="soft"> ({t.robot})</span>}
                          </td>
                          <td className="num">{p.points}</td>
                          <td className="stars" aria-label={`${p.stars}/3`}>
                            {"★".repeat(p.stars)}
                            <span className="dim">{"★".repeat(Math.max(0, 3 - p.stars))}</span>
                          </td>
                        </tr>
                      ))
                  : m.seats.map((s, k) => (
                      <tr key={s.name} className={s.bot ? "bot" : ""}>
                        <td>{k + 1}</td>
                        <td>
                          {s.name}
                          {s.bot && <span className="soft"> ({t.robot})</span>}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

/**
 * One room's page at /manage/room/ID: its codes, class screen and CLOSE
 * while it is open, how it is raced, and each match's results. The room is
 * looked up among the open rooms and the last 30 rooms.
 */
function RoomPage({
  t,
  lang,
  user,
  id,
  tab,
  onTab,
  onTrail,
  version,
  onChange,
}: {
  t: Text;
  lang: Lang;
  user: User;
  id: string;
  tab: RoomTab;
  onTab: (tab: RoomTab) => void;
  onTrail: (label: string) => void;
  version: number;
  onChange: () => void;
}) {
  // undefined while asking the server, null when not there.
  const [active, setActive] = useState<OpenedRoom | null>();
  const [past, setPast] = useState<PastRoom | null>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    Promise.all([api<{ rooms: OpenedRoom[] }>(user, "/rooms"), api<{ rooms: PastRoom[] }>(user, "/rooms/history")]).then(
      ([open, history]) => {
        setActive(open.rooms.find((r) => r.id === id) ?? null);
        setPast(history.rooms.find((r) => r.id === id) ?? null);
        setError("");
      },
      (e) => {
        setError(errorCode(e));
        setActive(null);
        setPast(null);
      },
    );
  }, [user, id, version]);
  const code = active?.play_code ?? past?.play_code ?? "";
  useEffect(() => onTrail(code), [code]);
  const close = () => {
    if (busy || !active) return;
    setAsking(false);
    setBusy(true);
    setError("");
    api(user, `/rooms/${encodeURIComponent(active.id)}`, { method: "DELETE" })
      .then(onChange, (e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };

  if (active === undefined) {
    return (
      <section className="paper-sheet" aria-busy="true">
        <p className="soft">{t.loading}</p>
      </section>
    );
  }
  if (!active && !past) {
    return (
      <section className="paper-sheet">
        {error ? <ErrorLine t={t} code={error} /> : <p>{t.roomNotFound}</p>}
        <Link className="btn small" to="/manage#rooms">
          {t.allRooms}
        </Link>
      </section>
    );
  }
  const label = active?.class_label ?? past?.class_label;
  const matches = past?.matches ?? [];
  const tabName = (k: RoomTab) => (k === "matches" ? `${t.roomTabs.matches} (${matches.length})` : t.roomTabs[k]);
  return (
    <section className="paper-sheet room-page">
      <div className="admin-head">
        <div>
          <h2 className="class-title">
            <span className="past-code">{code}</span>
            {label && <span className="past-state">{label}</span>}
            <span className={active ? "past-state on" : "past-state"}>{active ? t.historyOpen : t.historyClosed}</span>
          </h2>
          <p className="soft">
            {t.roomFor(label)}
            {past ? ` · ${t.roomOpened} ${dayOf(t, past.created_at)}, ${clockOf(t, past.created_at)}` : ""}
            {past ? ` · ${t.historyMeta(past.seats, matches.length)}` : ""}
          </p>
        </div>
        {active && (
          <div className="row">
            <a className="btn small blue" href={screenUrl(active)} target="_blank" rel="noopener">
              {t.openScreen}
            </a>
            <button type="button" className="btn small" onClick={() => setAsking(true)} disabled={busy}>
              {t.closeRoom}
            </button>
          </div>
        )}
      </div>
      <div className="page-tabs" role="tablist" aria-label={code}>
        {ROOM_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`room-tab-${k}`}
            aria-selected={tab === k}
            aria-controls="room-panel"
            className={tab === k ? "page-tab on" : "page-tab"}
            onClick={() => onTab(k)}
          >
            {tabName(k)}
          </button>
        ))}
      </div>
      <ErrorLine t={t} code={error} />
      <div role="tabpanel" id="room-panel" aria-labelledby={`room-tab-${tab}`} className="class-panel">
        {tab === "overview" ? (
          <>
            {active ? (
              <div className="class-block room-codes">
                <p>{label ? t.roomPlayClass(label) : t.roomPlay}</p>
                <CopyCode big label={t.roomCode} code={active.play_code} copyText={t.copy} copiedText={t.copied} />
                <CopyCode label={t.roomWatch} code={active.watch_code} copyText={t.copy} copiedText={t.copied} />
                <p className="soft">{t.roomSeats}</p>
              </div>
            ) : (
              <p className="soft">{t.roomClosedNote}</p>
            )}
            <div className="class-block">
              <h3>{t.roomSetup}</h3>
              <p>{describe(lang, active?.setup ?? past?.setup)}</p>
            </div>
          </>
        ) : matches.length > 0 ? (
          <MatchList t={t} matches={matches} />
        ) : (
          <p className="soft">{t.roomNoMatches}</p>
        )}
      </div>
      {asking && active && <CloseAsk t={t} code={active.play_code} onKeep={() => setAsking(false)} onClose={close} />}
    </section>
  );
}

/** CLOSE THE ROOM, asked on our own paper card. */
function CloseAsk({ t, code, onKeep, onClose }: { t: Text; code: string; onKeep: () => void; onClose: () => void }) {
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label={t.closeRoom} onClick={(e) => e.target === e.currentTarget && onKeep()}>
      <div className="paper-sheet narrow">
        <h2 className="dialog-title">
          {t.closeRoom}: {code}
        </h2>
        <p>{t.closeSure}</p>
        <div className="actions">
          <button type="button" className="btn" onClick={onKeep} autoFocus>
            {t.keepOpen}
          </button>
          <button type="button" className="btn suspended" onClick={onClose}>
            {t.closeYes}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The one-time organiser form: name, organisation, kind, country, and the statement. */
function SignUp({ t, user, me, onDone }: { t: Text; user: User; me: Me; onDone: () => void }) {
  const [name, setName] = useState(me.name);
  const [orgName, setOrgName] = useState("");
  const [kind, setKind] = useState("school");
  const [country, setCountry] = useState(typeof document !== "undefined" && document.documentElement.lang === "id" ? "ID" : "");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="paper-sheet narrow">
      <h2 className="dialog-title">{t.regTitle}</h2>
      <p>{t.regIntro}</p>
      <label className="field-label" htmlFor="reg-name">
        {t.yourName}
      </label>
      <input id="reg-name" className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="field-label" htmlFor="reg-org">
        {t.orgName}
      </label>
      <input id="reg-org" className="field" maxLength={80} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
      <span className="field-label">{t.orgKind}</span>
      <div className="tabs" role="group" aria-label={t.orgKind}>
        {Object.entries(t.kinds).map(([k, label]) => (
          <button key={k} type="button" className={k === kind ? "tab on" : "tab"} aria-pressed={k === kind} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="reg-country">
        {t.country}
      </label>
      <input
        id="reg-country"
        className="field short"
        maxLength={2}
        value={country}
        onChange={(e) => setCountry(e.target.value.toUpperCase())}
      />
      <button type="button" className={agree ? "tick on" : "tick"} aria-pressed={agree} onClick={() => setAgree(!agree)}>
        <span className="mark">{agree ? "✓" : ""}</span>
        <span>{t.statement}</span>
      </button>
      <a className="soft" href="/terms" target="_blank" rel="noreferrer">
        {t.readTerms}
      </a>
      <ErrorLine t={t} code={error} />
      <div className="actions">
        <button
          type="button"
          className="btn blue"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            api(user, "/organizer", {
              method: "POST",
              body: JSON.stringify({ name, org_name: orgName, org_kind: kind, country, terms_version: me.terms_version, agree }),
            })
              .then(onDone)
              .catch((e) => {
                setBusy(false);
                setError(errorCode(e));
              });
          }}
        >
          {t.save}
        </button>
      </div>
    </section>
  );
}

function Organizers({ t, user }: { t: Text; user: User }) {
  const [tab, setTab] = useState<Status>("pending");
  const [rows, setRows] = useState<Organizer[] | null>(null);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState<{ row: Organizer; to: Status } | null>(null);

  const load = (status: Status) => {
    setRows(null);
    setError("");
    api<Organizer[]>(user, `/admin/organizers?status=${status}`).then(setRows, (e) => setError(errorCode(e)));
  };
  useEffect(() => load(tab), [tab]);

  return (
    <section className="paper-sheet">
      <div className="tabs" role="tablist">
        {STATUSES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={s === tab} className={s === tab ? "tab on" : "tab"} onClick={() => setTab(s)}>
            {t.tab[s]}
          </button>
        ))}
      </div>
      <ErrorLine t={t} code={error} />
      {rows === null && !error ? (
        <div aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="org">
              <div className="org-main" style={{ width: "100%" }}>
                <div className="skel wide" />
                <div className="skel" />
              </div>
            </div>
          ))}
        </div>
      ) : rows && rows.length === 0 ? (
        <p>{t.empty[tab]}</p>
      ) : (
        rows?.map((r) => (
          <article key={r.user_id} className="org">
            <div className="org-main">
              <strong>{r.name || r.email}</strong>
              <span>
                {r.email} ({r.email_verified ? t.verified : t.unverified}), {r.provider}
              </span>
              <span>
                {r.org_kind === "personal" ? t.personal : `${r.org_name ?? ""}, ${r.org_kind ?? ""}`}
                {r.country ? `, ${r.country}` : ""}
              </span>
              <span className="soft">
                {t.joined} {r.joined} UTC. {t.changed} {r.updated} UTC, {t.via[r.path] ?? r.path}.
              </span>
            </div>
            <div className="org-actions">
              {STATUSES.filter((s) => s !== r.status).map((to) => (
                <button key={to} type="button" className={`btn small ${to}`} onClick={() => setDeciding({ row: r, to })}>
                  {t.to[to]}
                </button>
              ))}
            </div>
          </article>
        ))
      )}
      {deciding && (
        <Decide
          t={t}
          user={user}
          row={deciding.row}
          to={deciding.to}
          onClose={(changed) => {
            setDeciding(null);
            if (changed) load(tab);
          }}
        />
      )}
    </section>
  );
}

/** The confirmation: our own paper card with the required reason (no browser dialog). */
function Decide({ t, user, row, to, onClose }: { t: Text; user: User; row: Organizer; to: Status; onClose: (changed: boolean) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label={t.to[to]} onClick={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="paper-sheet narrow">
        <h2 className="dialog-title">
          {t.to[to]}: {row.name || row.email}
        </h2>
        <label className="field-label" htmlFor="reason">
          {t.reason}
        </label>
        <textarea id="reason" className="field" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        <ErrorLine t={t} code={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={() => onClose(false)}>
            {t.cancel}
          </button>
          <button
            type="button"
            className={`btn ${to}`}
            disabled={busy}
            onClick={() => {
              if (reason.trim().length < 3) {
                setError("reason");
                return;
              }
              setBusy(true);
              api(user, `/admin/organizers/${row.user_id}`, { method: "POST", body: JSON.stringify({ status: to, reason }) })
                .then(() => onClose(true))
                .catch((e) => {
                  setBusy(false);
                  setError(errorCode(e));
                });
            }}
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
