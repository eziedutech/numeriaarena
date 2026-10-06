import { sharedStore, type LocalStore } from '../storage.js';
import { online } from '../offline.js';
import { seatKey, studentState, type Student } from '../home/student.js';
import { Book, earningsOf, loadTownCore, townRulesNow, type Earnings, type Landmark, type Play, type TownEvent, type TownView } from './town-core.js';
import { guestLandmarks } from './town-landmarks.js';
import { sampleTown } from './town-sample.js';

/**
 * One player's MY FOLD TOWN on this device. A guest's lives only here, its
 * Folds worked out from the plays kept on the device. A class seat's lives
 * on the server: what the server took is kept here as it sent it, the
 * changes made since wait beside it and go with the next sync, and those
 * the server refused are kept with the reason and shown, never dropped.
 */

const API = '/api';
const PLAYS_KEY = 'numeria.town.plays';
/** Plays kept for a guest's Folds; older days are folded into one entry. */
const PLAYS_KEPT = 400;

export interface TownDoc {
  /** Events the server took (a seat), or every event (a guest). */
  events: TownEvent[];
  /** A seat's events made on the device and not yet taken. */
  pending: TownEvent[];
  /** Refused by the server: the event, why, and when. */
  refused: { event: TownEvent; reason: string; at: number }[];
  earnings?: Earnings;
  landmarks: Landmark[];
  /** The server's clock less the device's, from the last sync. */
  skew_ms: number;
}

const DAY_MS = 86_400_000;

function readPlays(): Play[] {
  try {
    const list = JSON.parse(localStorage.getItem(PLAYS_KEY) ?? '[]') as Play[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * A guest's practice or race against the robots, for their Folds. A seat's
 * plays are counted by the server from what the device reports there.
 */
export function noteGuestPlay(points: number): void {
  if (studentState()) return;
  const plays = readPlays();
  plays.push({ day: Math.floor(Date.now() / DAY_MS), points: Math.max(0, Math.round(points)), source: 'device' });
  try {
    localStorage.setItem(PLAYS_KEY, JSON.stringify(plays.slice(-PLAYS_KEPT)));
  } catch {
    // Without storage this play counts for this visit only.
  }
}

function newId(store: LocalStore): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${store.profile.id}-t${Date.now().toString(36)}${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

type Change = (listener: TownModel) => void;

export class TownModel {
  private book?: Book;
  private syncing = false;
  private listeners = new Set<Change>();
  /** Why the last sync could not reach the server, if it could not. */
  syncNote = '';
  /** The sample town's Folds; set only for the sample, which is never changed or saved. */
  private fixed?: Earnings;

  get lookOnly(): boolean {
    return !!this.fixed;
  }

  private constructor(
    private store: LocalStore,
    readonly owner: string,
    readonly seat: Student | null,
    public doc: TownDoc,
  ) {}

  static async open(): Promise<TownModel> {
    await loadTownCore();
    const store = await sharedStore();
    const seat = studentState();
    const owner = seat ? `seat:${seatKey(seat)}` : 'guest';
    const doc = (await store.town<TownDoc>(owner)) ?? { events: [], pending: [], refused: [], landmarks: [], skew_ms: 0 };
    // A guest's landmarks come from the answers on this device, worked out again each time.
    if (!seat) doc.landmarks = await guestLandmarks(store);
    const model = new TownModel(store, owner, seat, doc);
    model.rebuild();
    return model;
  }

  /** The sample town, built afresh each time it opens. */
  static async sample(): Promise<TownModel> {
    const r = await loadTownCore();
    const store = await sharedStore();
    const s = sampleTown();
    const model = new TownModel(store, 'sample', null, { events: s.events, pending: [], refused: [], landmarks: s.landmarks, skew_ms: 0 });
    model.fixed = { plays: s.earned - r.welcome, streak: 0, welcome: r.welcome, held_back: 0, total: s.earned };
    model.rebuild();
    return model;
  }

  onChange(f: Change): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private changed(): void {
    for (const f of this.listeners) f(this);
  }

  /** The device's clock, set to the server's when a seat has synced. */
  now(): number {
    return Date.now() + this.doc.skew_ms;
  }

  earnings(): Earnings {
    if (this.fixed) return this.fixed;
    if (this.seat) return this.doc.earnings ?? earningsOf([]);
    return earningsOf(readPlays());
  }

  private rebuild(): void {
    this.book?.free();
    this.book = new Book([...this.doc.events, ...this.doc.pending], this.earnings().total);
  }

  view(): TownView {
    return this.book!.view(this.now());
  }

  fits(asset: string, land: number, x: number, y: number, rot: number, ignore = ''): string {
    return this.book!.fits(asset, land, x, y, rot, ignore);
  }

  /** Tries a change; "" when it is made (and saved), else why not. */
  async act(change: DistributiveOmit<TownEvent, 'event_id' | 'at_ms'>): Promise<string> {
    if (this.fixed) return 'look_only';
    // A place or a move says how wide the page it counts on is: one from a narrower page stands a column further right.
    const wide = change.type === 'town_place' || change.type === 'town_move' ? { cols: townRulesNow().cols } : {};
    const ev = { ...change, ...wide, event_id: newId(this.store), at_ms: this.now() } as TownEvent;
    const reason = this.book!.apply(ev);
    if (reason) return reason;
    if (this.seat) this.doc.pending.push(ev);
    else this.doc.events.push(ev);
    await this.save();
    this.changed();
    if (this.seat) void this.sync();
    return '';
  }

  /** The id of the last event, for a building just placed. */
  lastId(): string {
    const all = this.seat ? this.doc.pending : this.doc.events;
    return all[all.length - 1]?.event_id ?? '';
  }

  private save(): Promise<void> {
    if (this.fixed) return Promise.resolve();
    return this.store.setTown(this.owner, this.doc);
  }

  /** A seat: sends what waits and takes the server's town back. A guest has nothing to send. */
  async sync(): Promise<void> {
    const s = this.seat;
    if (!s || this.syncing) return;
    if (!online()) {
      this.syncNote = 'offline';
      this.changed();
      return;
    }
    this.syncing = true;
    try {
      const sent = this.doc.pending.slice(0, 200);
      const res = await fetch(`${API}/student/town`, {
        method: sent.length ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${s.token}`, ...(sent.length ? { 'Content-Type': 'application/json' } : {}) },
        body: sent.length ? JSON.stringify({ events: sent }) : undefined,
      });
      if (!res.ok) {
        this.syncNote = res.status === 401 ? 'signed_out' : `http_${res.status}`;
        console.warn(`[town] the town waits on the device: ${this.syncNote}`);
        return;
      }
      const out = (await res.json()) as {
        accepted: string[];
        refused: [string, string][];
        events: TownEvent[];
        earnings: Earnings;
        landmarks: Landmark[];
        now_ms: number;
      };
      const done = new Set([...out.accepted, ...out.refused.map(([id]) => id)]);
      const now = Date.now();
      for (const [id, reason] of out.refused) {
        const event = sent.find((e) => e.event_id === id);
        if (event) this.doc.refused.push({ event, reason, at: now });
      }
      if (out.refused.length) console.warn(`[town] ${out.refused.length} change(s) refused: ${out.refused[0][1]}`);
      this.doc.pending = this.doc.pending.filter((e) => !done.has(e.event_id));
      this.doc.events = out.events;
      this.doc.earnings = out.earnings;
      this.doc.landmarks = out.landmarks;
      this.doc.skew_ms = out.now_ms - now;
      this.syncNote = '';
      this.rebuild();
      await this.save();
      console.info(`[town] synced: ${out.accepted.length} taken, ${out.refused.length} refused, ${this.doc.pending.length} waiting`);
      this.changed();
      if (this.doc.pending.length && sent.length === 200) void Promise.resolve().then(() => this.sync());
    } catch (error) {
      this.syncNote = 'offline';
      console.warn(`[town] the town waits on the device: ${String(error)}`);
    } finally {
      this.syncing = false;
    }
  }

  /** Refusals seen: they leave the list once the player has read them. */
  async clearRefused(): Promise<void> {
    this.doc.refused = [];
    await this.save();
    this.changed();
  }

  dispose(): void {
    this.listeners.clear();
    this.book?.free();
    this.book = undefined;
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// ---------------------------------------------------------------- class map

export interface MapCell {
  x: number;
  y: number;
  kind: string;
  land: number;
  name: string;
  me: boolean;
}

export interface ClassMap {
  cols: number;
  rows: number;
  cells: MapCell[];
  class: string;
}

/** The seat's class map, or why it cannot be had. */
export async function classMap(s: Student): Promise<ClassMap | string> {
  if (!online()) return 'offline';
  try {
    const res = await fetch(`${API}/student/town/map`, { headers: { Authorization: `Bearer ${s.token}` } });
    if (!res.ok) return `http_${res.status}`;
    return (await res.json()) as ClassMap;
  } catch {
    return 'offline';
  }
}

/** Takes a cell of the class map for the seat's first land; "" or the error code. */
export async function takeCell(s: Student, x: number, y: number, kind: string): Promise<string> {
  if (!online()) return 'offline';
  try {
    const res = await fetch(`${API}/student/town/plot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ x, y, kind }),
    });
    if (res.ok) return '';
    try {
      return ((await res.json()) as { error?: string }).error ?? `http_${res.status}`;
    } catch {
      return `http_${res.status}`;
    }
  } catch {
    return 'offline';
  }
}
