/**
 * Students' real names, kept only in this teacher's browser (IndexedDB),
 * keyed by class and seat number. Nothing here talks to the network: the
 * server only ever knows seat numbers and pseudonyms. A CSV file carries the
 * names to another browser.
 */

const DB = "numeria-teacher";
const STORE = "seat-names";

interface Row {
  class_id: string;
  number: number;
  name: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: ["class_id", "number"] });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest | void): Promise<unknown> {
  const db = await open();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const range = (classId: string) => IDBKeyRange.bound([classId, 0], [classId, 1000]);

/** The names of one class, by seat number. */
export async function readNames(classId: string): Promise<Record<number, string>> {
  const rows = ((await run("readonly", (s) => s.getAll(range(classId)))) ?? []) as Row[];
  return Object.fromEntries(rows.map((r) => [r.number, r.name]));
}

/** Sets one seat's name; an empty name removes it. */
export async function writeName(classId: string, number: number, name: string): Promise<void> {
  const clean = name.trim().slice(0, 80);
  await run("readwrite", (s) => (clean ? s.put({ class_id: classId, number, name: clean }) : s.delete([classId, number])));
}

/** Sets many names at once (an imported file); seats missing from it keep theirs. */
export async function writeNames(classId: string, names: Record<number, string>): Promise<void> {
  await run("readwrite", (s) => {
    for (const [n, name] of Object.entries(names)) {
      const clean = name.trim().slice(0, 80);
      if (clean) s.put({ class_id: classId, number: Number(n), name: clean });
      else s.delete([classId, Number(n)]);
    }
  });
}

const cell = (v: string) => (/[",\n\r]/u.test(v) ? `"${v.replace(/"/gu, '""')}"` : v);

/** seat,pseudonym,name, one line per seat. */
export function namesCsv(seats: { number: number; pseudonym: string }[], names: Record<number, string>): string {
  const lines = ["seat,pseudonym,name", ...seats.map((s) => [String(s.number), s.pseudonym, names[s.number] ?? ""].map(cell).join(","))];
  return lines.join("\r\n") + "\r\n";
}

function rows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let v = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        v += '"';
        i++;
      } else if (c === '"') quoted = false;
      else v += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";") {
      row.push(v);
      v = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(v);
      out.push(row);
      row = [];
      v = "";
    } else v += c;
  }
  row.push(v);
  out.push(row);
  return out;
}

/**
 * Names from a CSV file: the first column is the seat number, the last the
 * name (so both "seat,name" and our own "seat,pseudonym,name" read). Lines
 * without a seat number, such as the header, are skipped.
 */
export function parseNamesCsv(text: string): Record<number, string> {
  const names: Record<number, string> = {};
  for (const r of rows(text.replace(/^\uFEFF/u, ""))) {
    const n = Number(r[0]?.trim());
    if (!Number.isInteger(n) || n < 1 || n > 99 || r.length < 2) continue;
    names[n] = (r[r.length - 1] ?? "").replace(/\s+/gu, " ").trim();
  }
  return names;
}
