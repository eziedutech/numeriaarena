import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import type { Route } from "./+types/manage";
import { api, errorCode, finishEmailLink, sendEmailLink, signInConfigured, signInWith, signOut, watchUser } from "../auth";
import { MyClasses } from "../classes";
import { CopyCode } from "../copy-code";
import { useLang, type Lang } from "../legal";

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
    toGame: "TO THE GAME",
    status: { pending: "Waiting for approval", approved: "Approved", suspended: "Suspended" } as Record<Status, string>,
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
    roomSeats: "3 seats; robots fill the empty ones.",
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
    historyUntil: (end: string, n: number) => ` to ${end} (${n} min)`,
    historyUnfinished: "Stopped before the end",
    historyCols: ["Place", "Player", "Points", "Stars"],
    historySeat: "Seat",
    robot: "robot",
    locale: "en-GB",
    regTitle: "ABOUT YOU",
    regIntro: "One time only. Students never see your email.",
    yourName: "Your name (shown to your classes)",
    orgName: "School or club (leave empty for a personal workspace)",
    orgKind: "Kind",
    kinds: { school: "SCHOOL", tutoring: "TUTORING", community: "COMMUNITY", event: "EVENT" } as Record<string, string>,
    country: "Country (2 letters, like ID or US)",
    statement:
      "I am a teacher or organiser responsible for the children in my groups, and I will get parental permission as my local rules require.",
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
    toGame: "KE GAME",
    status: { pending: "Menunggu persetujuan", approved: "Disetujui", suspended: "Ditangguhkan" } as Record<Status, string>,
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
    roomSeats: "3 kursi; robot mengisi yang kosong.",
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
    historyUntil: (end: string, n: number) => ` sampai ${end} (${n} menit)`,
    historyUnfinished: "Berhenti sebelum selesai",
    historyCols: ["Peringkat", "Pemain", "Poin", "Bintang"],
    historySeat: "Kursi",
    robot: "robot",
    locale: "id-ID",
    regTitle: "TENTANG ANDA",
    regIntro: "Hanya sekali. Siswa tidak pernah melihat email Anda.",
    yourName: "Nama Anda (tampil di kelas Anda)",
    orgName: "Sekolah atau klub (kosongkan untuk ruang kerja pribadi)",
    orgKind: "Jenis",
    kinds: { school: "SEKOLAH", tutoring: "BIMBEL", community: "KOMUNITAS", event: "ACARA" } as Record<string, string>,
    country: "Negara (2 huruf, misalnya ID atau US)",
    statement:
      "Saya guru atau penyelenggara yang bertanggung jawab atas anak-anak di grup saya, dan akan meminta izin orang tua sesuai aturan setempat.",
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

  const loadMe = (u: User) => {
    setError("");
    api<Me>(u, "/me").then(setMe, (e) => setError(errorCode(e)));
  };

  useEffect(() => {
    if (!signInConfigured) {
      setUser(null);
      return;
    }
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

  const crumbs = [t.home, asAdmin ? t.organizers : t.account];

  return (
    <main className="paper-page manage">
      <nav className="paper-nav" aria-label={lang === "id" ? "Navigasi" : "Navigation"}>
        <ol className="crumbs">
          {crumbs.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <span className="nav-right">
          <a className="paper-chip" href="/play/">
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
              <Organizers t={t} user={user} />
            </>
          ) : (
            <Account t={t} lang={lang} user={user} me={me} onChange={() => loadMe(user)} />
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
  const run = (p: Promise<unknown>, done?: string) => {
    setError("");
    p.then(() => done && setNote(done)).catch((e) => setError(errorCode(e)));
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

function Account({ t, lang, user, me, onChange }: { t: Text; lang: Lang; user: User; me: Me; onChange: () => void }) {
  const org = me.organizer?.org;
  // Bumped when a room opens or closes, so the open rooms and the history read again.
  const [rooms, setRooms] = useState(0);
  // The game links to /manage#classes and /manage#rooms, which open that tab.
  const [tab, setTab] = useState<Tab>("classes");
  useEffect(() => setTab(window.location.hash === "#rooms" ? "rooms" : "classes"), []);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const working = me.organizer && me.organizer.status !== "suspended";
  const show = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  };
  // A race room of three seats, for one class or for anyone; the RACE ROOMS tab then shows it.
  const openRoom = (classId?: string) => {
    if (opening) return;
    setOpening(true);
    setOpenError("");
    show("rooms");
    api<OpenedRoom>(user, "/rooms", {
      method: "POST",
      body: JSON.stringify({ seats: 3, kind: "class", class_id: classId }),
    })
      .then(
        () => setRooms((n) => n + 1),
        (e) => setOpenError(errorCode(e)),
      )
      .finally(() => setOpening(false));
  };
  return (
    <>
      <section className="paper-sheet">
        <AccountHead t={t} me={me} />
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
          <MyClasses lang={lang} user={user} trial={me.organizer?.status === "pending"} onRace={openRoom} />
        </div>
      )}
      {me.organizer && (!working || tab === "rooms") && (
        <div role="tabpanel" id="panel-rooms" aria-labelledby="tab-rooms">
          {working && <RaceRooms t={t} user={user} version={rooms} opening={opening} openError={openError} onOpen={openRoom} onChange={() => setRooms((n) => n + 1)} />}
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
}

interface ClassChoice {
  id: string;
  label: string;
  status: "active" | "archived";
}

/**
 * RACE ROOMS: open a room of three seats for one of this teacher's classes
 * (only its signed-in seats, the official record) or for anyone with the
 * code; then every room still open, each with its codes, the class screen
 * that starts it, and CLOSE THE ROOM. Rooms live in the server's memory, so
 * a reload finds them again until they close or the server is updated.
 */
function RaceRooms({
  t,
  user,
  version,
  opening,
  openError,
  onOpen,
  onChange,
}: {
  t: Text;
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
            // The host token stays in the hash, which the browser never sends to a server.
            const screen = `/screen?code=${encodeURIComponent(room.watch_code)}#host=${encodeURIComponent(room.host_token)}&play=${encodeURIComponent(room.play_code)}`;
            return (
              <div key={room.id} className="tool ticket">
                <strong>{t.roomFor(room.class_label)}</strong>
                <span>{room.class_label ? t.roomPlayClass(room.class_label) : t.roomPlay}</span>
                <CopyCode big label={t.roomCode} code={room.play_code} copyText={t.copy} copiedText={t.copied} />
                <CopyCode label={t.roomWatch} code={room.watch_code} copyText={t.copy} copiedText={t.copied} />
                <span className="soft">{t.roomSeats}</span>
                <div className="row ticket-foot">
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
      {asking && (
        <div className="veil" role="dialog" aria-modal="true" aria-label={t.closeRoom} onClick={(e) => e.target === e.currentTarget && setAsking(null)}>
          <div className="paper-sheet narrow">
            <h2 className="dialog-title">
              {t.closeRoom}: {asking.play_code}
            </h2>
            <p>{t.closeSure}</p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setAsking(null)} autoFocus>
                {t.keepOpen}
              </button>
              <button type="button" className="btn suspended" onClick={() => close(asking)}>
                {t.closeYes}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
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
  matches: {
    started_at: string;
    ended_at: string | null;
    seats: { name: string; bot: boolean }[];
    players: { name: string; bot: boolean; points: number; place: number; stars: number }[] | null;
  }[];
}

/** ROOMS SO FAR: every room this adult opened, the newest first, with each match's results. */
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
  const day = (iso: string) => new Date(iso).toLocaleDateString(t.locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const clock = (iso: string) => new Date(iso).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit" });
  const matches = rooms?.reduce((n, r) => n + r.matches.length, 0) ?? 0;
  return (
    <section className="paper-sheet history">
      <h2 className="sheet-title">{t.history}</h2>
      <ErrorLine t={t} code={error} />
      {rooms?.length === 0 && <p className="soft">{t.historyNone}</p>}
      {rooms && rooms.length > 0 && <p className="soft">{t.historySummary(rooms.length, matches)}</p>}
      {rooms?.map((r, i) => (
        // The newest room starts unfolded; the others fold to one line each.
        <details key={r.id} className="past-room" open={i === 0}>
          <summary className="past-head">
            <strong className="past-code">{r.play_code}</strong>
            <span className="past-tags">
              {r.class_label && <span className="past-state">{r.class_label}</span>}
              <span className={r.open ? "past-state on" : "past-state"}>{r.open ? t.historyOpen : t.historyClosed}</span>
            </span>
            <span className="past-when">
              {day(r.created_at)}, {clock(r.created_at)}
            </span>
            <span className="soft past-meta">{t.historyMeta(r.seats, r.matches.length)}</span>
          </summary>
          {r.matches.map((m, n) => {
            const minutes = m.ended_at ? Math.max(1, Math.round((Date.parse(m.ended_at) - Date.parse(m.started_at)) / 60000)) : 0;
            return (
              <div key={m.started_at} className="past-match">
                <p className="past-match-head">
                  <strong>{t.historyMatch(n + 1)}</strong>
                  <span className="soft">
                    {clock(m.started_at)}
                    {m.ended_at ? t.historyUntil(clock(m.ended_at), minutes) : ""}
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
                                {"\u2605".repeat(p.stars)}
                                <span className="dim">{"\u2605".repeat(Math.max(0, 3 - p.stars))}</span>
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
        </details>
      ))}
    </section>
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
