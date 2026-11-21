"use client";
import { Check, Link2Off, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { safeHref } from "@/lib/travelogue/doc";
import { inputClass } from "@/components/ui/field";
import { t } from "@/i18n";

const tx = t.travelogue.editor.linkDialog;

/** "rovia.app" → https://rovia.app, "ad@alan.com" → mailto:… ; geçersizse null */
export function normalizeHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return safeHref(v);
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return safeHref(`mailto:${v}`);
  if (/^[^\s]+\.[^\s]{2,}/.test(v)) return safeHref(`https://${v.replace(/^\/+/, "")}`);
  return null;
}

export function LinkPopover({
  initialHref, hasLink, onApply, onRemove, onClose,
}: {
  initialHref: string;
  hasLink: boolean;
  onApply: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialHref);
  const [error, setError] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function apply() {
    const href = normalizeHref(value);
    if (!href) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    onApply(href);
  }

  return (
    <div
      role="dialog"
      aria-label={tx.title}
      data-testid="link-popover"
      className="absolute inset-x-2 top-full z-30 mt-2 rounded-2xl border border-line bg-overlay p-3 shadow-[var(--shadow-overlay)] sm:right-auto sm:left-2 sm:w-[26rem]"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <label htmlFor={inputId} className="eyebrow">{tx.label}</label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={value}
          placeholder={tx.placeholder}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); apply(); }
          }}
          className={inputClass(error, "h-10 min-w-0 flex-1 px-3 text-base sm:text-sm")}
        />
        <button type="button" onClick={apply} title={tx.apply} aria-label={tx.apply}
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-fg text-surface hover:bg-fg/85">
          <Check className="size-4" aria-hidden />
        </button>
        {hasLink && (
          <button type="button" onClick={onRemove} title={tx.remove} aria-label={tx.remove}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-strong text-danger hover:bg-danger-soft">
            <Link2Off className="size-4" aria-hidden />
          </button>
        )}
        <button type="button" onClick={onClose} title={tx.cancel} aria-label={tx.cancel}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted hover:bg-fg/[0.06]">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {error && <p id={errorId} className="mt-2 text-xs text-danger">{tx.invalid}</p>}
    </div>
  );
}
