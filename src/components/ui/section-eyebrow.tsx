import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Ana sayfanın numaralı üst başlığı: "01 —— KEŞFET". Numara ve çizgi süstür (aria-hidden);
 * erişilebilir ad yalnızca metindir. `as="h2"` ile bölüm başlığı olarak kullanılır.
 */
export function SectionEyebrow({ index, children, as: Tag = "p", id, className }: {
  index?: number; children: ReactNode; as?: "p" | "h2" | "h3" | "span"; id?: string; className?: string;
}) {
  return (
    <Tag id={id} className={cn("flex min-w-0 items-center gap-3 text-xs font-semibold tracking-[0.24em] text-accent-ink uppercase", className)}>
      {index != null && <span aria-hidden className="text-fg-subtle tabular-nums">{String(index).padStart(2, "0")}</span>}
      <span aria-hidden className="h-px w-8 shrink-0 bg-accent-ink/60" />
      <span className="min-w-0 break-words">{children}</span>
    </Tag>
  );
}

/** Numaralı bölüm başlığı + sağda isteğe bağlı açıklama/bağlantı. */
export function SectionTitle({ index, id, children, aside }: { index?: number; id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <SectionEyebrow as="h2" id={id} index={index}>{children}</SectionEyebrow>
      {aside}
    </div>
  );
}
