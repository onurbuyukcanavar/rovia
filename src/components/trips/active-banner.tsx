import Link from "next/link";
import { ArrowRight, CircleDot } from "lucide-react";
import { t } from "@/i18n";

/** Süren kayıt uyarısı: kayıt moduna götürür (yanıp sönen nokta hareket azaltma tercihinde durur). */
export function ActiveRecordingBanner({ title }: { title: string }) {
  return (
    <Link href="/kayit-modu" data-testid="active-recording-banner"
      className="group flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] border border-danger/40 bg-danger-soft px-5 py-4 text-fg transition-colors hover:bg-danger/15">
      <span className="relative grid size-3 shrink-0 place-items-center" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-danger/60 motion-reduce:animate-none" />
        <CircleDot className="relative size-3 text-danger" />
      </span>
      <span className="min-w-[min(100%,11rem)] flex-1 font-semibold break-words">{t.tripSummary.activeBanner}: {title}</span>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-danger">
        {t.tripSummary.goRecording} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
