import { useEffect, useState, type ReactNode } from "react";

import { copy } from "./copy-code";
import type { Lang } from "./legal";

/**
 * Wide enough for the parts made for a projector or smartboard: 1024 pixels
 * across, or a tablet held sideways. Goes by the screen's size and how it is
 * held, never by which browser or device it is.
 */
const WIDE = "(min-width: 1024px), (orientation: landscape) and (min-width: 900px) and (min-height: 600px)";

const TEXT = {
  en: {
    title: "WIDE SCREEN NEEDED",
    body: "This part needs a wide screen (at least 1024 pixels). Open it on a laptop, projector or smartboard.",
    turn: "On a tablet, turning it sideways is enough.",
    copy: "COPY LINK",
    copied: "LINK COPIED",
  },
  id: {
    title: "BUTUH LAYAR LEBAR",
    body: "Bagian ini butuh layar lebar (paling sedikit 1024 piksel). Buka di laptop, proyektor, atau smartboard.",
    turn: "Di tablet, cukup putar ke posisi mendatar.",
    copy: "SALIN TAUTAN",
    copied: "TAUTAN TERSALIN",
  },
};

function useWide(): boolean | undefined {
  const [wide, setWide] = useState<boolean>();
  useEffect(() => {
    const q = window.matchMedia(WIDE);
    const read = () => setWide(q.matches);
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);
  return wide;
}

/** Shows `children` on a wide screen; on a narrow one, a paper card saying where to open it, with the link to copy. */
export function WideOnly({ lang, children }: { lang: Lang; children: ReactNode }) {
  const wide = useWide();
  const [copied, setCopied] = useState(false);
  if (wide === undefined) return null;
  if (wide) return <>{children}</>;
  const t = TEXT[lang];
  return (
    <section className="paper-sheet narrow wide-only" role="status">
      <svg className="wide-only-art" viewBox="0 0 64 40" aria-hidden="true">
        <rect x="4" y="4" width="56" height="30" rx="3" />
        <path d="M24 38 H40" />
      </svg>
      <h2 className="sheet-title">{t.title}</h2>
      <p>{t.body}</p>
      <p className="soft">{t.turn}</p>
      <button
        type="button"
        className="btn wide blue"
        onClick={() =>
          void copy(window.location.href).then((ok) => {
            if (!ok) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
        }
      >
        {copied ? t.copied : t.copy}
      </button>
    </section>
  );
}
