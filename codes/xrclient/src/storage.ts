/**
 * Device storage (layer L1): a local guest profile, settings, and the outbox
 * of answer events. Every answer is written here as soon as it is judged,
 * before any animation, and stays until the server confirms it. Answers
 * given while signed in to a class seat carry that seat and are sent to it
 * (`pendingFor`, then `ack`); a guest's stay here. Nothing is ever dropped
 * silently: events the server refuses move to their own store with the reason.
 *
 * When IndexedDB is missing, blocked or failing, the game keeps running on an
 * in-memory copy and says so once in the console; play never stops for it.
 */

const DB_NAME = 'numeria';
const DB_VERSION = 1;
/** Above this many waiting events a warning is logged; none is ever dropped. */
const OUTBOX_WARN = 4500;

export interface Profile {
  /** Random id for this install; also makes every event id unique to this device. */
  id: string;
  created_at: number;
}

export interface StoredEvent {
  /** `<profile id>-<core event id>`: the core's ids come from a seeded generator. */
  event_id: string;
  profile_id: string;
  /** `practice` or `race`. */
  mode: string;
  /** The class seat signed in when the answer was given; none for a guest. */
  seat?: string;
  stored_at: number;
  event: unknown;
}

export interface RejectedEvent extends StoredEvent {
  reason: string;
  rejected_at: number;
}

type StoreName = 'meta' | 'outbox' | 'rejected';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'event_id' });
      if (!db.objectStoreNames.contains('rejected')) db.createObjectStore('rejected', { keyPath: 'event_id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('database blocked by another tab'));
  });
}

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** In-memory stand-in with the same shape, used when IndexedDB cannot be. */
class MemoryBackend {
  private stores: Record<StoreName, Map<IDBValidKey, unknown>> = {
    meta: new Map(),
    outbox: new Map(),
    rejected: new Map(),
  };

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.stores[store].get(key) as T | undefined;
  }

  async put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
    const k = key ?? (value as { event_id: string }).event_id;
    this.stores[store].set(k, value);
  }

  async putAll(store: StoreName, values: unknown[]): Promise<void> {
    for (const v of values) await this.put(store, v);
  }

  async remove(store: StoreName, keys: IDBValidKey[]): Promise<void> {
    for (const k of keys) this.stores[store].delete(k);
  }

  async count(store: StoreName): Promise<number> {
    return this.stores[store].size;
  }

  async first<T>(store: StoreName, limit: number): Promise<T[]> {
    return [...this.stores[store].values()].slice(0, limit) as T[];
  }

  async all<T>(store: StoreName): Promise<T[]> {
    return [...this.stores[store].values()] as T[];
  }
}

class IdbBackend {
  constructor(private db: IDBDatabase) {}

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return (await request(this.db.transaction(store).objectStore(store).get(key))) as T | undefined;
  }

  async put(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await done(tx);
  }

  /** All in one transaction: either every event is stored or none is. */
  async putAll(store: StoreName, values: unknown[]): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    for (const v of values) s.put(v);
    await done(tx);
  }

  async remove(store: StoreName, keys: IDBValidKey[]): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    for (const k of keys) s.delete(k);
    await done(tx);
  }

  async count(store: StoreName): Promise<number> {
    return request(this.db.transaction(store).objectStore(store).count());
  }

  async first<T>(store: StoreName, limit: number): Promise<T[]> {
    return (await request(this.db.transaction(store).objectStore(store).getAll(undefined, limit))) as T[];
  }

  async all<T>(store: StoreName): Promise<T[]> {
    return (await request(this.db.transaction(store).objectStore(store).getAll())) as T[];
  }
}

type Backend = MemoryBackend | IdbBackend;

export class LocalStore {
  private constructor(
    private backend: Backend,
    /** False when running on the in-memory stand-in. */
    readonly durable: boolean,
    readonly profile: Profile,
  ) {}

  /** Opens the device database, or falls back to memory; never throws. */
  static async open(): Promise<LocalStore> {
    let backend: Backend;
    let durable = true;
    try {
      if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
      backend = new IdbBackend(await openDb());
    } catch (error) {
      console.warn(`[store] progress is kept in memory only this session: ${String(error)}`);
      backend = new MemoryBackend();
      durable = false;
    }
    let profile: Profile | undefined;
    try {
      profile = await backend.get<Profile>('meta', 'profile');
      if (!profile) {
        profile = { id: randomId(), created_at: Date.now() };
        await backend.put('meta', profile, 'profile');
      }
    } catch (error) {
      console.warn(`[store] could not read the profile, using a new one for this session: ${String(error)}`);
      profile = { id: randomId(), created_at: Date.now() };
    }
    const store = new LocalStore(backend, durable, profile);
    if (durable) void store.askToPersist();
    console.info(`[store] ${durable ? 'device' : 'memory'} storage, profile ${profile.id}, ${await store.outboxCount()} events waiting`);
    return store;
  }

  /** Asks the browser not to evict our data under storage pressure; the answer is logged. */
  private async askToPersist(): Promise<void> {
    try {
      if (!navigator.storage?.persist) return;
      const persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
      await this.backend.put('meta', { persisted, asked_at: Date.now() }, 'persist');
      console.info(`[store] persistent storage ${persisted ? 'granted' : 'not granted'}`);
    } catch (error) {
      console.warn(`[store] persistent storage request failed: ${String(error)}`);
    }
  }

  /**
   * Writes judged answers to the outbox. Returns how many were stored; on a
   * failure the events stay in memory for this session and the error is logged.
   */
  async record(events: unknown[], mode: string, seat?: string): Promise<number> {
    if (events.length === 0) return 0;
    const now = Date.now();
    const rows: StoredEvent[] = events.map((event) => ({
      event_id: `${this.profile.id}-${(event as { event_id?: string }).event_id ?? randomId()}`,
      profile_id: this.profile.id,
      mode,
      ...(seat ? { seat } : {}),
      stored_at: now,
      event,
    }));
    try {
      await this.backend.putAll('outbox', rows);
    } catch (error) {
      console.error(`[store] could not save ${rows.length} answer events, keeping them in memory: ${String(error)}`);
      this.backend = await this.switchToMemory(rows);
      return 0;
    }
    const waiting = await this.outboxCount();
    console.info(`[store] saved ${rows.length} ${mode} answer event(s), ${waiting} waiting`);
    if (waiting > OUTBOX_WARN) console.warn(`[store] ${waiting} events are waiting to be sent`);
    return rows.length;
  }

  /** After a failed write the session carries on in memory, with what was not saved. */
  private async switchToMemory(rows: StoredEvent[]): Promise<MemoryBackend> {
    const memory = new MemoryBackend();
    await memory.put('meta', this.profile, 'profile');
    await memory.putAll('outbox', rows);
    return memory;
  }

  outboxCount(): Promise<number> {
    return this.backend.count('outbox');
  }

  /** Oldest waiting events first, for the next sync batch (at most 200 per request). */
  pending(limit = 200): Promise<StoredEvent[]> {
    return this.backend.first<StoredEvent>('outbox', limit);
  }

  /** Oldest waiting answers of one class seat, for the next batch sent to it. */
  async pendingFor(seat: string, limit = 200): Promise<StoredEvent[]> {
    const rows = await this.backend.all<StoredEvent>('outbox');
    return rows
      .filter((r) => r.seat === seat)
      .sort((a, b) => a.stored_at - b.stored_at)
      .slice(0, limit);
  }

  /** The server stored these: they leave the device. */
  ack(eventIds: string[]): Promise<void> {
    return this.backend.remove('outbox', eventIds);
  }

  /** The server refused these: kept with the reason, shown in diagnostics, never dropped. */
  async reject(items: { event_id: string; reason: string }[]): Promise<void> {
    const now = Date.now();
    const rows: RejectedEvent[] = [];
    for (const item of items) {
      const row = await this.backend.get<StoredEvent>('outbox', item.event_id);
      if (row) rows.push({ ...row, reason: item.reason, rejected_at: now });
    }
    await this.backend.putAll('rejected', rows);
    await this.backend.remove('outbox', rows.map((r) => r.event_id));
  }

  async setting<T>(key: string): Promise<T | undefined> {
    return this.backend.get<T>('meta', `setting:${key}`);
  }

  setSetting(key: string, value: unknown): Promise<void> {
    return this.backend.put('meta', value, `setting:${key}`);
  }

  /** A Fold Town kept on this device, by its owner (a guest or a class seat). */
  async town<T>(owner: string): Promise<T | undefined> {
    try {
      return await this.backend.get<T>('meta', `town:${owner}`);
    } catch (error) {
      console.warn(`[store] could not read the town: ${String(error)}`);
      return undefined;
    }
  }

  async setTown(owner: string, doc: unknown): Promise<void> {
    try {
      await this.backend.put('meta', doc, `town:${owner}`);
    } catch (error) {
      console.error(`[store] could not save the town, it stays in memory this session: ${String(error)}`);
    }
  }
}

let shared: Promise<LocalStore> | undefined;

/** The one device store of the page, opened on first use. */
export function sharedStore(): Promise<LocalStore> {
  shared ??= LocalStore.open();
  return shared;
}
