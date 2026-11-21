import { OdometerValue } from "./route-motif";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Gösterge hücresi: kadran tikleri, küçük etiket, ince ve büyük rakam (birim küçük). */
export function SummaryStat({ label, value, testId, big = false }: { label: string; value: string; testId: string; big?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col bg-surface p-3.5 sm:p-4">
      {big && <div aria-hidden className="panel-gauge-ticks mb-2.5 h-1.5 w-full" />}
      <dt className="text-[0.65rem] font-semibold tracking-[0.16em] break-words text-fg-subtle uppercase">{label}</dt>
      <dd className={cn("mt-1.5 leading-none font-extralight tracking-[-0.03em] break-words tabular-nums", big ? "text-[1.9rem]" : "text-xl")} data-testid={testId}>
        <OdometerValue value={value} accent={big} />
      </dd>
    </div>
  );
}

/** Başlangıç / bitiş: kesik dikey yol çizgisi üzerinde nokta (başlangıç halka, bitiş amber). */
export function SummaryEndpoint({ label, value, time, end = false }: { label: string; value: string | null; time: string | null; end?: boolean }) {
  return (
    <div className={cn("relative min-w-0 pl-6",
      !end && "after:absolute after:top-4 after:-bottom-5 after:left-[0.3125rem] after:border-l-2 after:border-dashed after:border-fg/25")}>
      <dt className="text-[0.65rem] font-semibold tracking-[0.16em] text-fg-subtle uppercase">
        <span aria-hidden className={cn("absolute top-1 left-0 size-3 rounded-full",
          end ? "bg-accent shadow-[0_0_12px_rgb(232_145_45/0.7)]" : "border-2 border-fg/80 bg-surface")} />
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-fg">
        {value ?? "—"}
        {time && <span className="ml-1.5 text-fg-subtle tabular-nums">{formatTime(time)}</span>}
      </dd>
    </div>
  );
}
