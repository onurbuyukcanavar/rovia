import type { ReactNode } from "react";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { cn } from "@/lib/cn";

/**
 * Sayfa başlığı: amber üst başlık ("—— AYARLAR"), ince ve büyük başlık, isteğe bağlı serif italik amber vurgu.
 * Ana sayfa ve panelle aynı dil; her iki temada okunur.
 */
export function PageHeader({ eyebrow, index, title, accent, description, actions }: {
  eyebrow?: string; index?: number; title: ReactNode; accent?: ReactNode; description?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <SectionEyebrow index={index}>{eyebrow}</SectionEyebrow>}
        <h1 className={cn("text-[clamp(2rem,7vw,3rem)] leading-[1.04] font-extralight tracking-[-0.03em] break-words text-fg", eyebrow && "mt-3")}>
          {title}
          {accent && <> <span className="font-serif font-normal text-accent-glow italic">{accent}</span></>}
        </h1>
        {description && <p className="mt-2 max-w-2xl leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
