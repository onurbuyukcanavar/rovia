"use client";
import { ClipboardPaste, MapPinned } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { t } from "@/i18n";

/** "Konum bağlantısını yapıştır": metni /konum?text=… olarak açar (sayfa sunucuda yeniden çizilir). */
export function PasteBox({ initial = "", autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function open(text: string) {
    const v = text.trim();
    if (!v) {
      setError(t.sharedLocation.errors.empty);
      return;
    }
    setError(null);
    router.push(`/konum?text=${encodeURIComponent(v.slice(0, 4000))}`);
  }

  async function fromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text);
      if (text.trim()) open(text);
    } catch {
      setError(t.sharedLocation.paste.clipboardDenied);
    }
  }

  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        open(value);
      }}
      data-testid="shared-location-paste"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <MapPinned className="size-4 text-accent-ink" aria-hidden /> {t.sharedLocation.paste.title}
      </h2>
      <div className="space-y-1.5">
        <textarea
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              open(value);
            }
          }}
          rows={3}
          maxLength={4000}
          autoFocus={autoFocus}
          aria-label={t.sharedLocation.paste.label}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          placeholder={t.sharedLocation.paste.placeholder}
          className={inputClass(!!error, "min-h-24 resize-y px-4 py-3 text-sm")}
        />
        <p id={`${id}-help`} className={error ? "text-sm text-danger" : "text-xs text-fg-subtle"} role={error ? "alert" : undefined}>
          {error ?? t.sharedLocation.paste.hint}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">{t.sharedLocation.paste.submit}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={fromClipboard}>
          <ClipboardPaste className="size-4" aria-hidden /> {t.sharedLocation.paste.clipboard}
        </Button>
      </div>
    </form>
  );
}
