import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Boş liste/bölüm durumu: kesik çizgili çerçeve, amber ikon. `title` + `action` ile büyük sürüm
 * (sayfanın tek içeriği boşken), yalnızca children ile tek satırlık sürüm.
 */
export function EmptyState({ icon: Icon, title, children, action, className }: {
  icon: LucideIcon; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string;
  /** @deprecated Tema token'larıyla gereksiz; yok sayılır. */
  tone?: "light" | "night";
}) {
  if (title || action) {
    return (
      <div className={cn("flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-10 text-center", className)}>
        <span className="grid size-12 place-items-center rounded-2xl border border-line bg-raised text-accent-ink">
          <Icon className="size-5" aria-hidden />
        </span>
        {title && <p className="mt-4 text-lg font-light tracking-tight text-fg">{title}</p>}
        {children && <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-muted">{children}</div>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-dashed border-line-strong p-4 text-sm text-fg-muted", className)}>
      <Icon className="size-5 shrink-0 text-accent-ink" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
