/**
 * Adult sign-in for the home page: Firebase Authentication in the browser
 * (Google, Facebook, or a link sent by email), then the Numeria server, which
 * checks the token and keeps the organizer record. Firebase loads only when a
 * teacher opens the sign-in, so players never download it.
 */
import type { Auth, User } from 'firebase/auth';

export interface Org {
  name: string;
  kind: string;
  country: string;
}

export interface Me {
  email: string;
  name: string;
  admin: boolean;
  organizer: { status: 'pending' | 'approved' | 'suspended'; org: Org | null } | null;
  terms_version: string;
}

export interface Registration {
  name: string;
  org_name: string;
  org_kind: string;
  country: string;
  terms_version: string;
  agree: boolean;
}

export type TeacherState =
  | { kind: 'out' }
  | { kind: 'loading' }
  | { kind: 'in'; me: Me }
  /** Signed in with Firebase, but the server could not be reached or refused. */
  | { kind: 'error'; code: string };

const env = import.meta.env;
const CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};
const EMAIL_KEY = 'numeria.signinEmail';
const API = '/api';

export const signInConfigured = Boolean(CONFIG.apiKey && CONFIG.projectId && CONFIG.appId);

let auth: Auth | undefined;
let state: TeacherState = { kind: 'out' };
const listeners = new Set<(s: TeacherState) => void>();

function set(next: TeacherState): void {
  state = next;
  for (const l of listeners) l(state);
}

export function teacherState(): TeacherState {
  return state;
}

export function onTeacher(listener: (s: TeacherState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function firebase(): Promise<{ auth: Auth; mod: typeof import('firebase/auth') }> {
  const [{ initializeApp }, mod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  if (!auth) {
    const app = initializeApp(CONFIG);
    auth = mod.getAuth(app);
    mod.onAuthStateChanged(auth, (user) => void refresh(user));
  }
  return { auth, mod };
}

async function call(user: User, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await user.getIdToken();
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

async function refresh(user: User | null): Promise<void> {
  if (!user) {
    set({ kind: 'out' });
    return;
  }
  set({ kind: 'loading' });
  try {
    const res = await call(user, '/me');
    if (res.ok) set({ kind: 'in', me: (await res.json()) as Me });
    else set({ kind: 'error', code: await errorCode(res) });
  } catch (e) {
    console.warn('[teacher] server unreachable', e);
    set({ kind: 'error', code: 'offline' });
  }
}

/**
 * Starts Firebase when a teacher was signed in before, or when this page is
 * the return from an email link. Returns 'needs_email' when the link was
 * opened on a browser that does not remember which email it went to.
 */
export async function startTeacher(): Promise<'ok' | 'needs_email' | 'off'> {
  if (!signInConfigured) return 'off';
  const fromLink = /[?&]oobCode=/.test(location.search);
  let remembered = false;
  try {
    remembered = Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser:'));
  } catch {
    // No storage: nobody can be remembered.
  }
  if (!fromLink && !remembered) return 'ok';
  const { auth, mod } = await firebase();
  if (fromLink && mod.isSignInWithEmailLink(auth, location.href)) {
    let email: string | null = null;
    try {
      email = localStorage.getItem(EMAIL_KEY);
    } catch {
      // Asked for below.
    }
    if (!email) return 'needs_email';
    await finishEmailLink(email);
  }
  return 'ok';
}

/** Completes an email link sign-in, then drops the link from the address bar. */
export async function finishEmailLink(email: string): Promise<void> {
  const { auth, mod } = await firebase();
  await mod.signInWithEmailLink(auth, email, location.href);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    // Nothing to forget.
  }
  history.replaceState(null, '', location.pathname);
}

export async function signInWith(provider: 'google' | 'facebook'): Promise<void> {
  const { auth, mod } = await firebase();
  const p = provider === 'google' ? new mod.GoogleAuthProvider() : new mod.FacebookAuthProvider();
  if (provider === 'facebook') p.addScope('email');
  await mod.signInWithPopup(auth, p);
}

export async function sendEmailLink(email: string): Promise<void> {
  const { auth, mod } = await firebase();
  await mod.sendSignInLinkToEmail(auth, email, { url: `${location.origin}${location.pathname}`, handleCodeInApp: true });
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // The page asks for the email again when the link comes back.
  }
}

export async function signOut(): Promise<void> {
  const { auth, mod } = await firebase();
  await mod.signOut(auth);
}

/** Sends the organizer form; resolves with an error code, or undefined when stored. */
export async function register(form: Registration): Promise<string | undefined> {
  const user = auth?.currentUser;
  if (!user) return 'signed_out';
  try {
    const res = await call(user, '/organizer', { method: 'POST', body: JSON.stringify(form) });
    if (!res.ok) return errorCode(res);
    set({ kind: 'in', me: (await res.json()) as Me });
    return undefined;
  } catch (e) {
    console.warn('[teacher] register failed', e);
    return 'offline';
  }
}

/** Firebase's own error code (auth/popup-closed-by-user and the like), or a generic one. */
export function authErrorCode(e: unknown): string {
  return typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : 'unknown';
}
