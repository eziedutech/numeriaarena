import type { ReactNode } from "react";

import type { Lang } from "../legal";

/** The top of every Math Edu page: a way back, the language, and room for more. */
export function EduNav({ lang, setLang, back, children }: { lang: Lang; setLang: (l: Lang) => void; back: { href: string; label: string }; children?: ReactNode }) {
  return (
    <nav className="paper-nav edu-nav" aria-label={lang === "id" ? "Navigasi" : "Navigation"}>
      <a className="paper-chip" href={back.href}>
        {back.label}
      </a>
      <span className="edu-nav-end">
        {children}
        <span className="paper-chip" role="group" aria-label={lang === "id" ? "Bahasa" : "Language"}>
          {(["en", "id"] as Lang[]).map((l) => (
            <button key={l} type="button" className={l === lang ? "seg on" : "seg"} aria-pressed={l === lang} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </span>
      </span>
    </nav>
  );
}
