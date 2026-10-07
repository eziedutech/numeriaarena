/**
 * A small square button that shows only an icon; what it does is in its
 * label and in our own tip, shown on hover and on keyboard focus (not the
 * browser's title, which waits and looks different in every browser).
 */

const ICONS = {
  // A key: a new picture password.
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" />
    </>
  ),
  // An open padlock.
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7.5a4 4 0 0 1 7.6-1.7" />
    </>
  ),
  // A chair with a cross: the seat emptied.
  empty: (
    <>
      <path d="M7 4v9h9M7 13v7M16 13v7" />
      <path d="M14.5 3.5l5 5M19.5 3.5l-5 5" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export function IconButton({
  tip,
  icon,
  onClick,
  disabled = false,
  tone = "",
}: {
  tip: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  tone?: "" | "blue" | "danger";
}) {
  return (
    <button type="button" className={`icon-btn ${tone}`.trim()} aria-label={tip} data-tip={tip} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[icon]}
      </svg>
    </button>
  );
}
