"use client";
import { Copy, Download, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { reuseTrip } from "@/lib/actions/trip-tools";
import { t } from "@/i18n";

const T = t.tools;

/** Yolculuk ayrıntısı: GPX/KML dışa aktarma ve "Rotayı tekrar kullan". */
export function TripTools({ tripId, title }: { tripId: string; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const href = (format: "gpx" | "kml") => `/api/trips/${tripId}/export?format=${format}`;
  return (
    <section className="card space-y-3 p-5" aria-labelledby="trip-tools" data-testid="trip-tools">
      <h2 id="trip-tools" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-fg"><Download className="size-5 shrink-0 text-accent-ink" aria-hidden /> {T.export.title}</h2>
      <p className="text-sm leading-relaxed text-fg-muted">{T.export.hint}</p>
      <div className="flex flex-wrap gap-2">
        <a href={href("gpx")} download className={buttonClass("secondary", "sm")} data-testid="export-gpx">{T.export.gpx}</a>
        <a href={href("kml")} download className={buttonClass("secondary", "sm")} data-testid="export-kml">{T.export.kml}</a>
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          title={T.reuse.hint}
          data-testid="reuse-route"
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await reuseTrip(tripId, title);
              if (r && !r.ok) setError(r.message);
            });
          }}
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {pending ? T.reuse.pending : T.reuse.button}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
