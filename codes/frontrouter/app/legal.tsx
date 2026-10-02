import { useEffect, useState, type ReactNode } from "react";

/** The same choice as the game (`numeria.lang` on this site), so a page opens in the player's language. */
export type Lang = "en" | "id";

export const CONTACT = "zia@eziedutech.dev";
export const UPDATED = { en: "Last updated 2 October 2026", id: "Terakhir diperbarui 2 Oktober 2026" };

function readLang(): Lang {
  try {
    return localStorage.getItem("numeria.lang") === "id" ? "id" : "en";
  } catch {
    return "en";
  }
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    setLang(readLang());
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const choose = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("numeria.lang", l);
    } catch {
      // The choice lasts for this visit.
    }
  };
  return [lang, choose];
}

/** A page of paper on the game's sand: title, language switch, the text, and a way back to the game. */
export function PaperPage({
  lang,
  setLang,
  title,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="paper-page">
      <nav className="paper-nav" aria-label={lang === "id" ? "Navigasi" : "Navigation"}>
        <a className="paper-chip" href="/play/">
          {lang === "id" ? "KE GAME" : "TO THE GAME"}
        </a>
        <span className="paper-chip" role="group" aria-label={lang === "id" ? "Bahasa" : "Language"}>
          {(["en", "id"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === lang ? "seg on" : "seg"}
              aria-pressed={l === lang}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </span>
      </nav>
      <article className="paper-sheet">
        <h1>{title}</h1>
        <p className="updated">{UPDATED[lang]}</p>
        {children}
      </article>
      <footer className="paper-foot">
        <a href="/privacy">{lang === "id" ? "Privasi" : "Privacy"}</a>
        <a href="/data-deletion">{lang === "id" ? "Penghapusan data" : "Data deletion"}</a>
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </footer>
    </main>
  );
}
