import { useEffect, useState } from "react";
import type { User } from "firebase/auth";

import type { Route } from "./+types/manage";
import { api, errorCode, finishEmailLink, sendEmailLink, signInConfigured, signInWith, signOut, watchUser } from "../auth";
import { useLang, type Lang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Manage - Numeria Arena" }, { name: "robots", content: "noindex" }];
}

/**
 * One door for adults: teachers and organisers see their account, sign up
 * if they have not, and (soon) their classes; admins also see the organiser
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
    soon: "SOON",
    tools: [
      ["MY CLASSES", "Seats, sign-in cards and reports"],
      ["OPEN A CLASS ROOM", "A room code on the class screen"],
    ],
    toolsSoon: "Classes with seats open with the next update of the class server.",
    opening: "Opening a room...",
    roomPlay: "Students press RACE MY CLASSMATES in the game and enter",
    roomWatch: "Watch code (for a screen or parents):",
    roomSeats: "3 seats; robots fill the empty ones.",
    openScreen: "OPEN THE CLASS SCREEN",
    newRoom: "NEW ROOM",
    closeRoom: "CLOSE THE ROOM",
    closeSure: "Close this room? Nobody can join it again, and a match on now stops.",
    roomClosed: "The room is closed.",
    closeYes: "YES, CLOSE IT",
    keepOpen: "KEEP IT OPEN",
    history: "ROOMS SO FAR",
    historyNone: "No rooms yet. The rooms you open show here, with each match's results.",
    historyOpen: "OPEN",
    historyClosed: "CLOSED",
    historyNoMatch: "No match played.",
    historyUnfinished: "Stopped before the end.",
    historyPoints: (n: number) => `${n} points`,
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
    soon: "SEGERA",
    tools: [
      ["KELAS SAYA", "Kursi, kartu masuk, dan laporan"],
      ["BUKA RUANG KELAS", "Kode ruang di layar kelas"],
    ],
    toolsSoon: "Kelas dengan kursi dibuka di pembaruan server kelas berikutnya.",
    opening: "Membuka ruang...",
    roomPlay: "Siswa menekan LOMBA DENGAN TEMAN di game lalu memasukkan",
    roomWatch: "Kode tonton (untuk layar atau orang tua):",
    roomSeats: "3 kursi; robot mengisi yang kosong.",
    openScreen: "BUKA LAYAR KELAS",
    newRoom: "RUANG BARU",
    closeRoom: "TUTUP RUANG",
    closeSure: "Tutup ruang ini? Tidak ada yang bisa masuk lagi, dan pertandingan yang berjalan berhenti.",
    roomClosed: "Ruang sudah ditutup.",
    closeYes: "YA, TUTUP",
    keepOpen: "BIARKAN TERBUKA",
    history: "RUANG SEBELUMNYA",
    historyNone: "Belum ada ruang. Ruang yang kamu buka tampil di sini, dengan hasil tiap pertandingan.",
    historyOpen: "TERBUKA",
    historyClosed: "DITUTUP",
    historyNoMatch: "Belum ada pertandingan.",
    historyUnfinished: "Berhenti sebelum selesai.",
    historyPoints: (n: number) => `${n} poin`,
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
    <main className="paper-page">
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
            <Account t={t} user={user} me={me} onChange={() => loadMe(user)} />
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
function Account({ t, user, me, onChange }: { t: Text; user: User; me: Me; onChange: () => void }) {
  const org = me.organizer?.org;
  // Bumped when a room opens or closes, so the history reads again.
  const [rooms, setRooms] = useState(0);
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
      {!me.organizer ? (
        <SignUp t={t} user={user} me={me} onDone={onChange} />
      ) : (
        <section className="paper-sheet">
          <div className="tools">
            <div className="tool">
              <span className="soon">{t.soon}</span>
              <strong>{t.tools[0][0]}</strong>
              <span className="soft">{t.tools[0][1]}</span>
            </div>
            {me.organizer.status !== "suspended" && <OpenRoom t={t} user={user} onChange={() => setRooms((n) => n + 1)} />}
          </div>
          <p className="soft">{t.toolsSoon}</p>
        </section>
      )}
      {me.organizer && <RoomHistory t={t} user={user} version={rooms} />}
    </>
  );
}

interface OpenedRoom {
  id: string;
  play_code: string;
  watch_code: string;
  host_token: string;
}

/**
 * OPEN A CLASS ROOM: the newest room this teacher still has open (so a reload
 * finds it again), or a new one of three seats; its codes, the class screen
 * that starts it, and CLOSE THE ROOM, after which its codes stop working.
 */
function OpenRoom({ t, user, onChange }: { t: Text; user: User; onChange: () => void }) {
  // undefined while asking the server, null with no room open.
  const [room, setRoom] = useState<OpenedRoom | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const [asking, setAsking] = useState(false);
  const newest = () => api<{ rooms: OpenedRoom[] }>(user, "/rooms").then((r) => r.rooms[0] ?? null);
  useEffect(() => {
    newest().then(setRoom, (e) => {
      setRoom(null);
      setError(errorCode(e));
    });
  }, [user]);
  const open = () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setClosed(false);
    api<OpenedRoom>(user, "/rooms", { method: "POST", body: JSON.stringify({ seats: 3, kind: "class" }) })
      .then((r) => {
        setRoom(r);
        onChange();
      }, (e) => setError(errorCode(e)))
      .finally(() => setBusy(false));
  };
  const close = () => {
    if (!room || busy) return;
    setAsking(false);
    setBusy(true);
    setError("");
    api(user, `/rooms/${encodeURIComponent(room.id)}`, { method: "DELETE" })
      .then(newest)
      .then(
        (next) => {
          setRoom(next);
          setClosed(true);
          onChange();
        },
        (e) => setError(errorCode(e)),
      )
      .finally(() => setBusy(false));
  };
  const [title, sub] = t.tools[1];
  if (!room) {
    return (
      <button type="button" className="tool tool-on" onClick={open} disabled={busy || room === undefined}>
        <strong>{title}</strong>
        <span className="soft">{busy || room === undefined ? t.opening : closed ? t.roomClosed : sub}</span>
        <ErrorLine t={t} code={error} />
      </button>
    );
  }
  // The host token stays in the hash, which the browser never sends to a server.
  const screen = `/screen?code=${encodeURIComponent(room.watch_code)}#host=${encodeURIComponent(room.host_token)}&play=${encodeURIComponent(room.play_code)}`;
  return (
    <div className="tool">
      <strong>{title}</strong>
      <span>{t.roomPlay}</span>
      <span className="room-code">{room.play_code}</span>
      <span className="soft">
        {t.roomWatch} <strong>{room.watch_code}</strong>
      </span>
      <span className="soft">{t.roomSeats}</span>
      <div className="row">
        <a className="btn small" href={screen} target="_blank" rel="noopener">
          {t.openScreen}
        </a>
        <button type="button" className="btn small" onClick={open} disabled={busy}>
          {t.newRoom}
        </button>
        <button type="button" className="btn small" onClick={() => setAsking(true)} disabled={busy}>
          {t.closeRoom}
        </button>
      </div>
      <ErrorLine t={t} code={error} />
      {asking && (
        <div className="veil" role="dialog" aria-modal="true" aria-label={t.closeRoom} onClick={(e) => e.target === e.currentTarget && setAsking(false)}>
          <div className="paper-sheet narrow">
            <h2 className="dialog-title">
              {t.closeRoom}: {room.play_code}
            </h2>
            <p>{t.closeSure}</p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setAsking(false)} autoFocus>
                {t.keepOpen}
              </button>
              <button type="button" className="btn suspended" onClick={close}>
                {t.closeYes}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PastRoom {
  id: string;
  play_code: string;
  kind: "class" | "open";
  seats: number;
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
  const when = (iso: string) => new Date(iso).toLocaleString(t.locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section className="paper-sheet">
      <h2>{t.history}</h2>
      <ErrorLine t={t} code={error} />
      {rooms?.length === 0 && <p className="soft">{t.historyNone}</p>}
      {rooms?.map((r) => (
        <div key={r.id} className="past-room">
          <div className="past-head">
            <strong className="past-code">{r.play_code}</strong>
            <span className="soft">{when(r.created_at)}</span>
            <span className={r.open ? "past-state on" : "past-state"}>{r.open ? t.historyOpen : t.historyClosed}</span>
          </div>
          {r.matches.length === 0 && <p className="soft">{t.historyNoMatch}</p>}
          {r.matches.map((m) => (
            <div key={m.started_at} className="past-match">
              <span className="soft">{when(m.started_at)}</span>
              {m.players ? (
                <div className="past-players">
                  {[...m.players]
                    .sort((a, b) => a.place - b.place)
                    .map((p) => (
                      <span key={p.name}>
                        {p.place}. {p.name}
                        {p.bot ? ` (${t.robot})` : ""}: {t.historyPoints(p.points)} {"\u2605".repeat(p.stars)}
                      </span>
                    ))}
                </div>
              ) : (
                <div className="past-players">
                  {m.seats.map((s) => (
                    <span key={s.name}>
                      {s.name}
                      {s.bot ? ` (${t.robot})` : ""}
                    </span>
                  ))}
                  <span className="soft">{t.historyUnfinished}</span>
                </div>
              )}
            </div>
          ))}
        </div>
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
