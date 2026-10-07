import { useState } from "react";

/** Puts text on the clipboard, with the old way for a page the browser does not trust. */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  }
}

/** A room code on a paper slip: its label, the letters (selectable) and a COPY button that says when it copied. */
export function CopyCode({ label, code, copyText, copiedText, big = false }: { label: string; code: string; copyText: string; copiedText: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={big ? "copy-code big" : "copy-code"}>
      <span className="copy-label">{label}</span>
      <strong className="copy-letters">{code}</strong>
      <button
        type="button"
        className="btn small"
        aria-label={`${copyText} ${label} ${code}`}
        onClick={() =>
          void copy(code).then((ok) => {
            if (!ok) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
        }
      >
        {copied ? copiedText : copyText}
      </button>
    </span>
  );
}
