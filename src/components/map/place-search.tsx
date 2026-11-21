"use client";
import { Building2, Home, LoaderCircle, MapPin, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { LatLng } from "@/lib/geo";
import { mapsApi } from "@/lib/maps/client";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import type { Stop, Suggestion } from "@/lib/maps/types";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

type Props = {
  label: string;
  value: Stop | null;
  onSelect: (stop: Stop | null) => void;
  bias?: LatLng;
  marker: ReactNode;
  actions?: ReactNode;
  autoFocus?: boolean;
};

/**
 * Yer arama kutusu: ROVIA'nın kendi OSM veritabanı (yerleşim + ilgi noktası) ve
 * adresler için Photon yedeği. Erişilebilir combobox (ARIA 1.2).
 */
export function PlaceSearch({ label, value, onSelect, bias, marker, actions, autoFocus }: Props) {
  const id = useId();
  const [text, setText] = useState(value?.label ?? "");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Dışarıdan değer değişince (haritadan seçim, yer değiştirme) metni eşitle — render sırasında, efektsiz
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!editing) setText(value?.label ?? "");
  }

  const query = text.trim();
  const suggest = useKeyedRequest<Suggestion[]>(
    editing && query.length >= 2 ? query : null,
    (signal) => mapsApi.autocomplete(query, bias, signal),
    { delayMs: 250 },
  );
  const items = suggest.data ?? [];
  const loading = suggest.loading;
  const error = suggest.error ?? null;
  const listOpen = open && editing && items.length > 0;
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  function choose(s: Suggestion) {
    setOpen(false);
    setEditing(false);
    setText(s.name);
    onSelect({
      id: s.id,
      label: s.name,
      address: s.secondary,
      ref: /^[nwr][0-9]+$/.test(s.id) ? s.id : null,
      location: s.location,
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!listOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="flex w-6 shrink-0 justify-center" aria-hidden>{marker}</span>
        <div className="relative min-w-0 flex-1">
          <label htmlFor={id} className="sr-only">{label}</label>
          <input
            id={id}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listOpen ? `${id}-opt-${activeIndex}` : undefined}
            autoComplete="off"
            autoFocus={autoFocus}
            placeholder={`${label} — ${t.maps.searchPlaceholder}`}
            value={text}
            onChange={(e) => {
              setEditing(true);
              setOpen(true);
              setActive(0);
              setText(e.target.value);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            className={inputClass(!!error, "h-11 pr-9 pl-3")}
          />
          <span className="absolute inset-y-0 right-2 flex items-center">
            {loading ? (
              <LoaderCircle className="size-4 animate-spin text-fg-subtle" aria-label={t.common.loading} />
            ) : value || text ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setText("");
                  onSelect(null);
                }}
                className="grid size-7 place-items-center rounded-lg text-fg-subtle hover:bg-fg/[0.07] hover:text-fg"
                aria-label={`${label}: ${t.maps.clear}`}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </span>
        </div>
        {actions}
      </div>
      {error && <p className="mt-1 pl-8 text-xs text-danger" role="alert">{error}</p>}
      {listOpen && (
        <ul id={listId} role="listbox" aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-1 ml-8 overflow-hidden rounded-xl border border-line bg-overlay shadow-[var(--shadow-overlay)]">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                void choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm", i === activeIndex && "bg-fg/[0.07]")}
            >
              {s.kind === "settlement" ? (
                <Building2 className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
              ) : s.kind === "address" ? (
                <Home className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
              ) : (
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block truncate font-semibold text-fg">{s.name}</span>
                {s.secondary && <span className="block truncate text-xs text-fg-subtle">{s.secondary}</span>}
              </span>
            </li>
          ))}
          <li className="border-t border-line px-3 py-1.5 text-right text-[0.65rem] text-fg-subtle" aria-hidden>© OpenStreetMap</li>
        </ul>
      )}
    </div>
  );
}
