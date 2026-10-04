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
