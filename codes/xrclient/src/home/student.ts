/**
 * A student signed in to their class seat (MY CLASSES): class code, seat
 * number and three pictures in order. The server answers with a token for
 * 30 days, kept on this device until the student signs out. No name, no
 * email: only the seat's pseudonym and the class's label.
 */

const API = '/api';
const KEY = 'numeria.student';

export interface Student {
  token: string;
  seat: number;
  pseudonym: string;
  class_label: string;
  grade: number;
}

let current: Student | null = read();
const listeners = new Set<(s: Student | null) => void>();

function read(): Student | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Student | null;
    return s && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}

function set(next: Student | null): void {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Without storage the seat lasts for this visit.
  }
  for (const l of listeners) l(next);
}

export function studentState(): Student | null {
  return current;
}

export function onStudent(listener: (s: Student | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function errorCode(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

/** Signs this device in to a seat; resolves with an error code when it cannot. */
export async function studentSignIn(classCode: string, seat: number, picture: number[]): Promise<true | string> {
  try {
    const res = await fetch(`${API}/student/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_code: classCode, seat, picture }),
    });
    if (!res.ok) return errorCode(res);
    set((await res.json()) as Student);
    return true;
  } catch (e) {
    console.warn('[student] sign-in failed', e);
    return 'offline';
  }
}

/**
 * Asks the server whether the seat still holds (a new picture, an emptied
 * seat or an archived class signs it out). Offline, the device stays signed in.
 */
export async function checkStudent(): Promise<void> {
  const s = current;
  if (!s) return;
  try {
    const res = await fetch(`${API}/student/me`, { headers: { Authorization: `Bearer ${s.token}` } });
    if (res.status === 401) {
      if (current?.token === s.token) set(null);
      return;
    }
    if (!res.ok) return;
    const me = (await res.json()) as Omit<Student, 'token'>;
    if (current?.token === s.token) set({ ...me, token: s.token });
  } catch {
    // Out of reach: try again next time.
  }
}

/** The room the teacher opened for this student's class: its play code, or null with none open. */
export async function studentRoom(): Promise<{ play_code: string | null; class_label: string } | string> {
  const s = current;
  if (!s) return 'signed_out';
  try {
    const res = await fetch(`${API}/student/room`, { headers: { Authorization: `Bearer ${s.token}` } });
    if (res.status === 401 && current?.token === s.token) set(null);
    if (!res.ok) return errorCode(res);
    return (await res.json()) as { play_code: string | null; class_label: string };
  } catch {
    return 'offline';
  }
}

/** FIND A RIVAL: the play code of a duel for the student's grade. */
export async function findRival(): Promise<{ play_code: string } | string> {
  const s = current;
  if (!s) return 'signed_out';
  try {
    const res = await fetch(`${API}/student/rival`, { method: 'POST', headers: { Authorization: `Bearer ${s.token}` } });
    if (res.status === 401 && current?.token === s.token) set(null);
    if (!res.ok) return errorCode(res);
    return (await res.json()) as { play_code: string };
  } catch {
    return 'offline';
  }
}

/** A race against the robots or a practice played on the student's own. */
export type OwnPlay =
  | { kind: 'race'; points: number; folded: number; place: number; stars: number; duration_ms: number }
  | { kind: 'practice'; game: string; points: number; folded: number; right: number; total: number; duration_ms: number };

/**
 * Tells the teacher's class page about a play on the student's own, kept
 * apart from the class's matches. Signed out, nothing is sent; offline, the
 * play is not kept.
 */
export function reportPlay(play: OwnPlay): void {
  const s = current;
  if (!s) return;
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const client_id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  fetch(`${API}/student/plays`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
    body: JSON.stringify({ ...play, client_id, duration_ms: Math.max(0, Math.round(play.duration_ms)) }),
  })
    .then((res) => {
      if (res.status === 401 && current?.token === s.token) set(null);
    })
    .catch(() => {
      // Out of reach: this play is simply not counted.
    });
}

/** Signs out here at once, and tells the server when it can. */
export async function studentSignOut(): Promise<void> {
  const s = current;
  set(null);
  if (!s) return;
  try {
    await fetch(`${API}/student/sign-out`, { method: 'POST', headers: { Authorization: `Bearer ${s.token}` } });
  } catch {
    // The token runs out by itself.
  }
}
