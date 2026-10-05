import { useEffect, useId, useRef, useState } from "react";

/**
 * The paper look's own controls in place of the browser's: a list to pick
 * one from (for `<select>`) and a whole number with − and + (for
 * `type="number"`, whose spinner differs in every browser).
 */

export interface Choice<T> {
  value: T;
  label: string;
}

export function Pick<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className = "",
  disabled = false,
}: {
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  /** Read by screen readers; the button shows the chosen option. */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useId();
  const at = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const show = () => {
    setHover(at);
    setOpen(true);
  };
  const choose = (i: number) => {
    setOpen(false);
    if (options[i] && options[i].value !== value) onChange(options[i].value);
  };
  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      if (!open) return show();
      setHover((h) => Math.min(options.length - 1, Math.max(0, h + step)));
    } else if (e.key === "Home" || e.key === "End") {
      if (!open) return;
      e.preventDefault();
      setHover(e.key === "Home" ? 0 : options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(hover);
      else show();
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={`pick ${className}`.trim()} ref={box}>
      <button
        type="button"
        className="pick-button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={list}
        aria-activedescendant={open ? `${list}-${hover}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={key}
      >
        <span>{options[at]?.label ?? ""}</span>
        <span className="pick-arrow" aria-hidden="true" />
      </button>
      {open && (
        <ul className="pick-list" id={list} role="listbox" aria-label={label}>
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${list}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={[i === hover ? "hover" : "", o.value === value ? "on" : ""].join(" ").trim()}
              onPointerEnter={() => setHover(i)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A whole number typed or stepped, kept as text while it is typed. */
export function NumberField({
  id,
  value,
  onChange,
  min,
  max,
  label,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  label: string;
  autoFocus?: boolean;
}) {
  const n = Number.parseInt(value, 10);
  const step = (by: number) => onChange(String(Math.min(max, Math.max(min, (Number.isFinite(n) ? n : min) + by))));
  return (
    <div className="number-field">
      <button type="button" className="btn small" aria-label={`${label} −1`} disabled={Number.isFinite(n) && n <= min} onClick={() => step(-1)}>
        −
      </button>
      <input
        id={id}
        className="field short"
        inputMode="numeric"
        aria-label={id ? undefined : label}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\D/gu, "").slice(0, 4))}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            step(e.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
      <button type="button" className="btn small" aria-label={`${label} +1`} disabled={Number.isFinite(n) && n >= max} onClick={() => step(1)}>
        +
      </button>
    </div>
  );
}
