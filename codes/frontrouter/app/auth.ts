/**
 * Adult sign-in on the web pages (/manage, for teachers and admins): Firebase
 * Authentication in the browser, and the Numeria server checks every token.
 * Firebase loads only when a page asks for it. The game has its own copy for
 * teachers (codes/xrclient/src/home/teacher.ts); the two are separate apps.
 */
import type { Auth, User } from "firebase/auth";

const env = import.meta.env;
const CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};
const EMAIL_KEY = "numeria.signinEmail";

export const signInConfigured = Boolean(CONFIG.apiKey && CONFIG.projectId && CONFIG.appId);

let auth: Auth | undefined;

async function firebase(): Promise<{ auth: Auth; mod: typeof import("firebase/auth") }> {
  const [{ initializeApp }, mod] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  if (!auth) auth = mod.getAuth(initializeApp(CONFIG));
  return { auth, mod };
}

/** Calls `listener` with the signed-in user (or null) now and on every change; finishes an email link first. */
export async function watchUser(listener: (user: User | null) => void): Promise<"ok" | "needs_email"> {
  const { auth, mod } = await firebase();
  let result: "ok" | "needs_email" = "ok";
  if (mod.isSignInWithEmailLink(auth, window.location.href)) {
    let email: string | null = null;
    try {
      email = localStorage.getItem(EMAIL_KEY);
    } catch {
      // Asked for by the page.
    }
    if (email) await finishEmailLink(email);
    else result = "needs_email";
  }
  mod.onAuthStateChanged(auth, listener);
  return result;
}

export async function finishEmailLink(email: string): Promise<void> {
  const { auth, mod } = await firebase();
  await mod.signInWithEmailLink(auth, email, window.location.href);
  try {
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    // Nothing to forget.
  }
  window.history.replaceState(null, "", window.location.pathname);
}

export async function signInWith(provider: "google" | "facebook"): Promise<void> {
  const { auth, mod } = await firebase();
  const p = provider === "google" ? new mod.GoogleAuthProvider() : new mod.FacebookAuthProvider();
  if (provider === "facebook") p.addScope("email");
  await mod.signInWithPopup(auth, p);
}

export async function sendEmailLink(email: string): Promise<void> {
  const { auth, mod } = await firebase();
  await mod.sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}${window.location.pathname}`,
    handleCodeInApp: true,
  });
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

/** A call to the Numeria API with the user's token; resolves with the body, or throws the API's error code. */
export async function api<T>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {
    throw new Error("offline");
  }
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      // Not JSON: keep the HTTP status.
    }
    throw new Error(code);
  }
  return (await res.json()) as T;
}

/** Firebase's own error code (auth/popup-closed-by-user and the like), or the API's. */
export function errorCode(e: unknown): string {
  if (typeof e === "object" && e && "code" in e) return String((e as { code: unknown }).code);
  return e instanceof Error ? e.message : "unknown";
}
