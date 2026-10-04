import { useEffect, useRef, useState } from "react";

import type { Route } from "./+types/screen";
import { avatarSvg, robotSvg } from "../avatar";
import { useLang, type Lang } from "../legal";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Arena Screen - Numeria Arena" }, { name: "robots", content: "noindex" }];
}

/**
 * The class screen: a Class Match seen with its watch code, for the
 * classroom's projector. It shows every seat's points and place, what each
 * one is working on, the round's clock and the results. With the room's host
 * token (after `#host=` in the address, so it never reaches a server log) it
 * also starts the match. The messages are the server's (protocol.rs in
 * codes/backrust/core); a watcher cannot answer anything.
 */

type GameKind = "balloon_burst" | "orb_forge";
type Highlight = "best_save" | "most_improved" | "sharpest_aim" | "steady_streak" | "brave_try";

interface Seat {
  name: string;
  bot: boolean;
  away: boolean;
  stand_in: boolean;
  points: number;
  folded: number;
  place: number;
}

interface View {
  phase: "ready" | "wave" | "break" | "boss" | "done";
  wave?: number;
  next_wave?: number | null;
  until_ms?: number;
  waves: number;
  plan: { game: GameKind; seconds: number; boss: boolean }[];
  ends_at_ms: number | null;
  seats: Seat[];
}

interface Lobby {
  seats: number;
  names: string[];
  watch_code: string;
  kind: "class" | "open";
  ready: boolean[];
  starts_at_ms: number | null;
}

interface Recap {
  players: { name: string; bot: boolean; points: number; folded: number; place: number; stars: number; highlight: Highlight | null }[];
}

type ClassEvent =
  | { type: "wave_start"; at_ms: number; wave: number; game: GameKind; ends_at_ms: number }
  | { type: "seat_working"; at_ms: number; seat: number; prompt: { en: string; id: string } }
  | { type: "seat_answer"; at_ms: number; seat: number; correct: boolean; attempt: number; points: number }
  | { type: "emote"; at_ms: number; seat: number; emote: string }
  | { type: "time_up"; at_ms: number; wave: number | null }
  | { type: "boss_start"; at_ms: number; ends_at_ms: number }
  | { type: "match_end"; at_ms: number }
  | { type: "seat_away" | "seat_back" | "stand_in"; at_ms: number; seat: number };

type ServerMsg =
  | { type: "welcome"; seat: number | null; now_ms: number }
  | ({ type: "lobby" } & Lobby)
  | ({ type: "view" } & View)
  | { type: "event"; event: ClassEvent }
  | { type: "cheer"; at_ms: number }
  | ({ type: "recap" } & Recap)
  | { type: "match_committed"; match_id: string }
  | { type: "error"; code: string }
  | { type: "offer" | "verdict" };

const TEXT = {
  en: {
    title: "ARENA SCREEN",
    codeLabel: "Watch code",
    watch: "WATCH",
    demo: "WATCH THE DEMO MATCH",
    connecting: "Connecting...",
    lost: "The connection dropped. Trying again...",
    gone: {
      room_not_found: "THIS ROOM IS NOT OPEN",
      room_closed: "THIS ROOM IS CLOSED",
      other: "THE SCREEN COULD NOT JOIN",
    } as Record<string, string>,
    goneWhy: {
      room_not_found:
        "Check the code. A room stays open while its class plays; it ends when the teacher closes it, and when the game's server is updated.",
      room_closed: "The teacher closed this room. The match is over.",
      other: "Reload the page, or try the code again in a moment.",
    } as Record<string, string>,
    goneHost: "To race again, open a new room in the game: OPEN A CLASS ROOM. Every finished match is kept under ROOMS SO FAR.",
    goneResults: "SEE ROOMS SO FAR",
    goneOther: "Watch another room",
    reload: "RELOAD",
    joinWith: "Join with code",
    joinHow: "In the game: RACE MY CLASSMATES, then this code.",
    seatsTaken: (n: number, of: number) => `${n} of ${of} seats taken. Robots fill the empty seats.`,
    waiting: "Waiting for the teacher to start the match.",
    waitingHost: "When everyone is in, press START. Every desk counts down 10 seconds together.",
    waitingReady: (n: number, of: number) => `${n} of ${of} ready. It starts when everyone is ready.`,
    startsIn: (s: number) => `The match starts in ${s}`,
    start: "START THE MATCH",
    cheer: "CHEER",
    cheered: "The class cheers!",
    wave: (n: number, of: number) => `WAVE ${n} OF ${of}`,
    boss: "BOSS ROUND, DOUBLE POINTS",
    break: "BREAK",
    ready: "GET READY",
    results: "RESULTS",
    games: { balloon_burst: "Balloon Burst", orb_forge: "Orb Forge" } as Record<GameKind, string>,
    bot: "BOT",
    away: "AWAY",
    standIn: "ROBOT HELPER",
    points: "points",
    folded: "folded",
    working: "Working on",
    place: (n: number) => (["1ST", "2ND", "3RD"][n - 1] ?? `${n}TH`),
    highlights: {
      best_save: "Best save",
      most_improved: "Most improved",
      sharpest_aim: "Sharpest aim",
      steady_streak: "Steady streak",
      brave_try: "Brave try",
    } as Record<Highlight, string>,
    feed: {
      right: (n: string, p: number) => `${n} got it right, +${p}`,
      wrong: (n: string) => `${n} had a go`,
      away: (n: string) => `${n} stepped away`,
      back: (n: string) => `${n} is back`,
      standIn: (n: string) => `A robot helper keeps ${n}'s desk busy (no points)`,
      timeUp: "Time's up!",
      end: "The match is over.",
    },
    stored: "Results saved.",
    errors: {
      room_not_found: "No room has that code. Check the code, or watch the demo match.",
      room_closed: "The teacher closed this room.",
      hello_first: "The screen could not join. Reload the page.",
      not_host: "Only the room's host can start it.",
      no_players: "Nobody has taken a seat yet.",
      starting: "The countdown is already on.",
      match_started: "The match has already started.",
      cannot_start: "The match could not start. Try again.",
      code_length: "Write all 6 letters of the code.",
      other: "Something went wrong.",
    } as Record<string, string>,
    toGame: "TO THE GAME",
  },
  id: {
    title: "LAYAR ARENA",
    codeLabel: "Kode tonton",
    watch: "TONTON",
    demo: "TONTON PERTANDINGAN DEMO",
    connecting: "Menyambung...",
    lost: "Sambungan putus. Mencoba lagi...",
    gone: {
      room_not_found: "RUANG INI TIDAK DIBUKA",
      room_closed: "RUANG INI SUDAH DITUTUP",
      other: "LAYAR TIDAK BISA MASUK",
    } as Record<string, string>,
    goneWhy: {
      room_not_found:
        "Periksa kodenya. Ruang terbuka selama kelasnya bermain; ruang berakhir saat guru menutupnya, dan saat server game diperbarui.",
      room_closed: "Guru menutup ruang ini. Pertandingan sudah selesai.",
      other: "Muat ulang halaman, atau coba kodenya lagi sebentar lagi.",
    } as Record<string, string>,
    goneHost: "Untuk lomba lagi, buka ruang baru di game: BUKA RUANG KELAS. Setiap pertandingan yang selesai tersimpan di RUANG SEBELUMNYA.",
    goneResults: "LIHAT RUANG SEBELUMNYA",
    goneOther: "Tonton ruang lain",
    reload: "MUAT ULANG",
    joinWith: "Masuk dengan kode",
    joinHow: "Di game: LOMBA DENGAN TEMAN, lalu kode ini.",
    seatsTaken: (n: number, of: number) => `${n} dari ${of} kursi terisi. Robot mengisi kursi kosong.`,
    waiting: "Menunggu guru memulai pertandingan.",
    waitingHost: "Setelah semua masuk, tekan MULAI. Semua meja menghitung mundur 10 detik bersama.",
    waitingReady: (n: number, of: number) => `${n} dari ${of} siap. Mulai saat semua siap.`,
    startsIn: (s: number) => `Pertandingan mulai dalam ${s}`,
    start: "MULAI PERTANDINGAN",
    cheer: "SORAKI",
    cheered: "Kelas bersorak!",
    wave: (n: number, of: number) => `GELOMBANG ${n} DARI ${of}`,
    boss: "BABAK BOS, POIN GANDA",
    break: "ISTIRAHAT",
    ready: "BERSIAP",
    results: "HASIL",
    games: { balloon_burst: "Balloon Burst", orb_forge: "Orb Forge" } as Record<GameKind, string>,
    bot: "BOT",
    away: "PERGI",
    standIn: "ROBOT PEMBANTU",
    points: "poin",
    folded: "terlipat",
    working: "Mengerjakan",
    place: (n: number) => `KE-${n}`,
    highlights: {
      best_save: "Penyelamatan terbaik",
      most_improved: "Paling berkembang",
      sharpest_aim: "Bidikan terjitu",
      steady_streak: "Beruntun stabil",
      brave_try: "Percobaan berani",
    } as Record<Highlight, string>,
    feed: {
      right: (n: string, p: number) => `${n} benar, +${p}`,
      wrong: (n: string) => `${n} mencoba`,
      away: (n: string) => `${n} pergi sebentar`,
      back: (n: string) => `${n} kembali`,
      standIn: (n: string) => `Robot pembantu mengisi meja ${n} (tanpa poin)`,
      timeUp: "Waktu habis!",
      end: "Pertandingan selesai.",
    },
    stored: "Hasil tersimpan.",
    errors: {
      room_not_found: "Tidak ada ruang dengan kode itu. Periksa kodenya, atau tonton pertandingan demo.",
      room_closed: "Guru menutup ruang ini.",
      hello_first: "Layar tidak bisa masuk. Muat ulang halaman.",
      not_host: "Hanya tuan rumah ruang yang bisa memulai.",
      no_players: "Belum ada yang duduk.",
      starting: "Hitung mundur sudah berjalan.",
      match_started: "Pertandingan sudah dimulai.",
      cannot_start: "Pertandingan tidak bisa dimulai. Coba lagi.",
      code_length: "Tulis keenam huruf kodenya.",
      other: "Ada yang salah.",
    } as Record<string, string>,
    toGame: "KE GAME",
  },
};
type Text = (typeof TEXT)["en"];

const DEMO_CODE = "WATCHX";
const FEED_LINES = 8;
/** Errors that end the watching; others are answers to START or CHEER. */
const FATAL = ["room_not_found", "hello_first", "room_closed"];

function wsUrl(): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`;
}

/** Code and host token from the address: `?code=WATCHX#host=...&play=...`. */
function readAddress(): { code: string; host?: string; play?: string } {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  return { code: (q.get("code") ?? "").toUpperCase(), host: h.get("host") ?? undefined, play: h.get("play") ?? undefined };
}

interface Live {
  status: "connecting" | "on" | "lost" | "failed";
  lobby?: Lobby;
  view?: View;
  recap?: Recap;
  stored: boolean;
  /** Each seat's creature now, and its last answer. */
  work: Record<number, { en: string; id: string } | undefined>;
  last: Record<number, boolean | undefined>;
  feed: { key: number; text: (t: Text) => string }[];
  cheerAt: number;
  error?: string;
}

const EMPTY: Live = { status: "connecting", stored: false, work: {}, last: {}, feed: [], cheerAt: 0 };

/** The watch connection: reconnects on a drop, and keeps the room's clock against this one. */
function useRoom(code: string, host?: string) {
  const [live, setLive] = useState<Live>(EMPTY);
  const ws = useRef<WebSocket | null>(null);
  const offset = useRef(-Infinity);
  const feedKey = useRef(0);
  useEffect(() => {
    if (!code) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const seen = (ms: number) => {
      offset.current = Math.max(offset.current, ms - Date.now());
    };
    const connect = () => {
      const s = new WebSocket(wsUrl());
      ws.current = s;
      setLive((l) => ({ ...l, status: l.status === "on" ? "lost" : l.status }));
      s.onopen = () => s.send(JSON.stringify({ type: "hello", code, host }));
      s.onmessage = (e) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(e.data)) as ServerMsg;
        } catch {
          return;
        }
        if (msg.type === "welcome") seen(msg.now_ms);
        if (msg.type === "event") seen(msg.event.at_ms);
        // A closed or unknown room stays that way: no more tries.
        if (msg.type === "error" && FATAL.includes(msg.code)) closed = true;
        setLive((l) => reduce(l, msg, feedKey));
      };
      s.onclose = () => {
        if (ws.current !== s) return;
        ws.current = null;
        setLive((l) => (l.status === "failed" ? l : { ...l, status: "lost" }));
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws.current?.close();
      ws.current = null;
    };
  }, [code, host]);
  useEffect(() => {
    if (live.status === "failed") {
      const s = ws.current;
      ws.current = null;
      s?.close();
    }
  }, [live.status]);
  const send = (msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  };
  /** Room time now, on this computer's clock. */
  const now = () => Date.now() + (Number.isFinite(offset.current) ? offset.current : 0);
  return { live, send, now };
}

function reduce(l: Live, msg: ServerMsg, feedKey: { current: number }): Live {
  const name = (seat: number) => l.view?.seats[seat]?.name ?? `#${seat + 1}`;
  const line = (text: (t: Text) => string): Live["feed"] => {
    feedKey.current += 1;
    return [{ key: feedKey.current, text }, ...l.feed].slice(0, FEED_LINES);
  };
  switch (msg.type) {
    case "welcome":
      return { ...l, status: "on", error: undefined };
    case "lobby":
      // The demo room starts again: a fresh lobby clears the last match.
      return { ...EMPTY, status: "on", lobby: msg };
    case "view":
      return { ...l, status: "on", view: msg };
    case "recap":
      return { ...l, recap: msg };
    case "match_committed":
      return { ...l, stored: true };
    case "cheer":
      return { ...l, cheerAt: Date.now() };
    case "error":
      if (FATAL.includes(msg.code)) return { ...l, status: "failed", error: msg.code };
      return { ...l, error: msg.code };
    case "event": {
      const e = msg.event;
      switch (e.type) {
        case "wave_start":
          // A new match in the same room (the demo) starts at wave 0.
          if (e.wave === 0 && l.recap) return { ...l, recap: undefined, stored: false, work: {}, last: {}, feed: [] };
          return { ...l, work: {}, last: {} };
        case "seat_working":
          return { ...l, work: { ...l.work, [e.seat]: e.prompt }, last: { ...l.last, [e.seat]: undefined } };
        case "seat_answer": {
          const n = name(e.seat);
          const finished = e.correct || e.attempt >= 2;
          return {
            ...l,
            work: finished ? { ...l.work, [e.seat]: undefined } : l.work,
            last: { ...l.last, [e.seat]: e.correct },
            feed: e.correct ? line((t) => t.feed.right(n, e.points)) : l.feed,
          };
        }
        case "seat_away": {
          const n = name(e.seat);
          return { ...l, work: { ...l.work, [e.seat]: undefined }, feed: line((t) => t.feed.away(n)) };
        }
        case "seat_back": {
          const n = name(e.seat);
          return { ...l, feed: line((t) => t.feed.back(n)) };
        }
        case "stand_in": {
          const n = name(e.seat);
          return { ...l, feed: line((t) => t.feed.standIn(n)) };
        }
        case "time_up":
          return { ...l, work: {}, feed: line((t) => t.feed.timeUp) };
        case "match_end":
          return { ...l, work: {}, feed: line((t) => t.feed.end) };
        default:
          return l;
      }
    }
    default:
      return l;
  }
}

export default function Screen() {
  const [lang, setLang] = useLang();
  const t = TEXT[lang];
  const [addr, setAddr] = useState<{ code: string; host?: string; play?: string } | null>(null);
  useEffect(() => {
    const read = () => setAddr(readAddress());
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  if (!addr) return null;
  return (
    <main className="arena">
      <nav className="paper-nav">
        <a className="paper-chip" href="/play/">
          {t.toGame}
        </a>
        <LangSwitch lang={lang} setLang={setLang} />
      </nav>
      {addr.code ? (
        <Watching key={addr.code} t={t} lang={lang} code={addr.code} host={addr.host} play={addr.play} />
      ) : (
        <AskCode t={t} />
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

function go(code: string) {
  history.pushState(null, "", `/screen?code=${encodeURIComponent(code)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** No code in the address: ask for one, or watch the demo match. */
function AskCode({ t }: { t: Text }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="paper-sheet narrow">
      <h1>{t.title}</h1>
      <label className="field-label" htmlFor="screen-code">
        {t.codeLabel}
      </label>
      <input
        id="screen-code"
        className="field arena-code-field"
        maxLength={6}
        autoCapitalize="characters"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/giu, "").toUpperCase())}
      />
      <button
        type="button"
        className="btn wide blue"
        onClick={() => (code.length === 6 ? go(code) : setError(t.errors.code_length))}
      >
        {t.watch}
      </button>
      <button type="button" className="btn wide" onClick={() => go(DEMO_CODE)}>
        {t.demo}
      </button>
      {error && <p className="err">{error}</p>}
    </section>
  );
}

function Watching({ t, lang, code, host, play }: { t: Text; lang: Lang; code: string; host?: string; play?: string }) {
  const { live, send, now } = useRoom(code, host);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const errorText = live.error ? (t.errors[live.error] ?? t.errors.other) : "";
  if (live.status === "failed") {
    return (
      <>
        {live.recap && <RecapCard t={t} recap={live.recap} stored={live.stored} />}
        <RoomGone t={t} code={code} error={live.error ?? "other"} host={host} />
      </>
    );
  }
  const v = live.view;
  const cheering = Date.now() - live.cheerAt < 2500;
  return (
    <>
      {live.status !== "on" && <p className="arena-banner">{live.status === "lost" ? t.lost : t.connecting}</p>}
      {!v ? (
        <LobbyCard
          t={t}
          lobby={live.lobby}
          host={host}
          play={play}
          startsIn={live.lobby?.starts_at_ms == null ? null : live.lobby.starts_at_ms - now()}
          onStart={() => send({ type: "start" })}
        />
      ) : live.recap ? (
        <RecapCard t={t} recap={live.recap} stored={live.stored} />
      ) : (
        <section className="arena-board">
          <Header t={t} view={v} remaining={v.ends_at_ms === null ? null : v.ends_at_ms - now()} breakLeft={v.until_ms === undefined ? null : v.until_ms - now()} />
          <Standings t={t} lang={lang} view={v} live={live} />
          <ol className="arena-feed" aria-live="polite">
            {live.feed.map((f) => (
              <li key={f.key}>{f.text(t)}</li>
            ))}
          </ol>
        </section>
      )}
      <div className="arena-foot">
        <span className="paper-chip">
          {t.codeLabel}: <strong>{code}</strong>
        </span>
        {!host && (
          <button type="button" className="btn" onClick={() => send({ type: "cheer" })}>
            {t.cheer}
          </button>
        )}
        {cheering && <span className="arena-cheer">{t.cheered}</span>}
        {errorText && <span className="err">{errorText}</span>}
      </div>
    </>
  );
}

/** The room is gone (a wrong code, closed by the teacher, or ended by a server update). */
function RoomGone({ t, code, error, host }: { t: Text; code: string; error: string; host?: string }) {
  const known = error === "room_not_found" || error === "room_closed";
  const key = known ? error : "other";
  const [other, setOther] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <section className="paper-sheet narrow arena-gone" role="status">
      <span className="arena-gone-code">{code}</span>
      <h1>{t.gone[key]}</h1>
      <p>{t.goneWhy[key]}</p>
      {!known && (
        <button type="button" className="btn wide blue" onClick={() => location.reload()}>
          {t.reload}
        </button>
      )}
      {host && known && (
        <>
          <p>{t.goneHost}</p>
          <a className="btn wide blue" href="/manage">
            {t.goneResults}
          </a>
        </>
      )}
      <h2>{t.goneOther}</h2>
      <div className="arena-gone-row">
        <input
          className="field arena-code-field"
          aria-label={t.codeLabel}
          maxLength={6}
          autoCapitalize="characters"
          value={other}
          onChange={(e) => {
            setBad(false);
            setOther(e.target.value.replace(/[^a-z0-9]/giu, "").toUpperCase());
          }}
        />
        <button type="button" className="btn blue" onClick={() => (other.length === 6 ? go(other) : setBad(true))}>
          {t.watch}
        </button>
      </div>
      {bad && <p className="err">{t.errors.code_length}</p>}
      <button type="button" className="btn wide" onClick={() => go(DEMO_CODE)}>
        {t.demo}
      </button>
    </section>
  );
}

function LobbyCard({
  t,
  lobby,
  host,
  play,
  startsIn,
  onStart,
}: {
  t: Text;
  lobby?: Lobby;
  host?: string;
  play?: string;
  startsIn: number | null;
  onStart: () => void;
}) {
  const open = lobby?.kind === "open";
  return (
    <section className="paper-sheet arena-lobby">
      <h1>{t.title}</h1>
      {play && (
        <>
          <p className="soft">{t.joinWith}</p>
          <p className="arena-play-code">{play}</p>
          <p>{t.joinHow}</p>
        </>
      )}
      {lobby && (
        <>
          <p>
            <strong>{t.seatsTaken(lobby.names.length, lobby.seats)}</strong>
          </p>
          <div className="arena-names">
            {lobby.names.map((n, i) => (
              <span key={n} className={open && lobby.ready[i] ? "ready" : undefined}>
                <Avatar name={n} size={34} />
                {open && lobby.ready[i] ? `${n} \u2713` : n}
              </span>
            ))}
          </div>
        </>
      )}
      {startsIn !== null ? (
        <p className="arena-countdown" aria-live="assertive">
          {t.startsIn(Math.max(0, Math.ceil(startsIn / 1000)))}
        </p>
      ) : (
        <p className="soft">
          {open ? t.waitingReady(lobby?.ready.filter(Boolean).length ?? 0, lobby?.names.length ?? 0) : host ? t.waitingHost : t.waiting}
        </p>
      )}
      {host && !open && startsIn === null && (
        <button type="button" className="btn wide blue" disabled={!lobby || lobby.names.length === 0} onClick={onStart}>
          {t.start}
        </button>
      )}
    </section>
  );
}

function clock(ms: number | null): string {
  if (ms === null) return "";
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Header({ t, view, remaining, breakLeft }: { t: Text; view: View; remaining: number | null; breakLeft: number | null }) {
  const round = view.wave !== undefined ? view.plan[view.wave] : undefined;
  let title = t.ready;
  if (view.phase === "wave" && view.wave !== undefined) title = `${t.wave(view.wave + 1, view.waves)}: ${round ? t.games[round.game] : ""}`;
  if (view.phase === "boss") title = t.boss;
  if (view.phase === "break") title = t.break;
  if (view.phase === "done") title = t.results;
  return (
    <header className="arena-head">
      <h1>{title}</h1>
      <span className="arena-clock" aria-label="clock">
        {view.phase === "break" ? clock(breakLeft) : clock(remaining)}
      </span>
    </header>
  );
}

/** A seat's paper avatar, read from its pseudonym (the game draws the same); a robot for a bot. */
function Avatar({ name, bot = false, size }: { name: string; bot?: boolean; size: number }) {
  return <span className="arena-avatar" aria-hidden="true" dangerouslySetInnerHTML={{ __html: bot ? robotSvg(size) : avatarSvg(name, size) }} />;
}

function Standings({ t, lang, view, live }: { t: Text; lang: Lang; view: View; live: Live }) {
  const rows = view.seats.map((s, i) => ({ s, i })).sort((a, b) => a.s.place - b.s.place || a.i - b.i);
  return (
    <ol className="arena-rows">
      {rows.map(({ s, i }) => {
        const work = live.work[i];
        const last = live.last[i];
        return (
          <li key={i} className={s.away ? "arena-row away" : "arena-row"}>
            <span className="arena-place">{t.place(s.place)}</span>
            <Avatar name={s.name} bot={s.bot} size={60} />
            <span className="arena-name">
              <strong>{s.name}</strong>
              {s.bot && <span className="tag">{t.bot}</span>}
              {s.away && <span className="tag">{s.stand_in ? t.standIn : t.away}</span>}
              <span className="arena-work">
                {work ? `${t.working}: ${work[lang]}` : ""}
                {last === true ? " ✓" : last === false ? " ✗" : ""}
              </span>
            </span>
            <span className="arena-points">
              {s.points}
              <small> {t.points}</small>
              <small className="soft">
                {" "}
                · {s.folded} {t.folded}
              </small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RecapCard({ t, recap, stored }: { t: Text; recap: Recap; stored: boolean }) {
  const rows = [...recap.players].sort((a, b) => a.place - b.place);
  return (
    <section className="arena-board">
      <header className="arena-head">
        <h1>{t.results}</h1>
      </header>
      <ol className="arena-rows">
        {rows.map((p) => (
          <li key={p.name} className="arena-row">
            <span className="arena-place">{t.place(p.place)}</span>
            <Avatar name={p.name} bot={p.bot} size={60} />
            <span className="arena-name">
              <strong>{p.name}</strong>
              {p.bot && <span className="tag">{t.bot}</span>}
              <span className="arena-work">
                {"★".repeat(p.stars)}
                {"☆".repeat(Math.max(0, 3 - p.stars))}
                {p.highlight ? `  ${t.highlights[p.highlight]}` : ""}
              </span>
            </span>
            <span className="arena-points">
              {p.points}
              <small> {t.points}</small>
            </span>
          </li>
        ))}
      </ol>
      {stored && <p className="soft">{t.stored}</p>}
    </section>
  );
}
