"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { TrackMap, type MapPin } from "./track-map";
import { MapFrame, useMapExpand } from "@/components/map/map-frame";
import { Button } from "@/components/ui/button";
import { decodeTrack } from "@/lib/gps/track";
import { deleteRawPoints } from "@/lib/actions/recordings";
import { deleteTripWithJournal } from "@/lib/actions/journal";
import { t } from "@/i18n";

export function SummaryMap({ styleUrl, polyline, plannedPolyline, pins = [] }: {
  styleUrl: string; polyline: string | null; plannedPolyline: string | null; pins?: MapPin[];
}) {
  const paths = useMemo(() => decodeTrack(polyline), [polyline]);
  const view = useMapExpand();
  return (
    <MapFrame expanded={view.expanded} onExpand={view.expand} onCollapse={view.collapse} className="h-full w-full">
      <TrackMap styleUrl={styleUrl} paths={paths} plannedPolyline={plannedPolyline} showEndpoints pins={pins} className="relative h-full w-full" />
    </MapFrame>
  );
}

/** İki adımlı onaylı silme işlemleri. */
export function SummaryActions({ tripId, recordingId, hasRawPoints }: { tripId: string; recordingId: string | null; hasRawPoints: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<"raw" | "trip" | null>(null);
  const [withJournal, setWithJournal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      if (confirming === "raw" && recordingId) {
        const r = await deleteRawPoints(tripId, recordingId);
        setMessage(r.ok ? t.tripSummary.deleted : (r.message ?? t.common.unexpectedError));
        setConfirming(null);
        router.refresh();
      } else if (confirming === "trip") {
        const r = await deleteTripWithJournal(tripId, withJournal);
        if (r.ok) router.replace("/yolculuklar");
        else {
          setMessage(r.message);
          setConfirming(null);
        }
      }
    });

  return (
    <div className="space-y-3" data-testid="summary-actions">
      {message && <p className="text-sm text-stone-600" role="status">{message}</p>}
      {confirming ? (
        <div className="card space-y-3 p-4" role="alertdialog" aria-labelledby="summary-confirm">
          <p id="summary-confirm" className="text-sm font-semibold">
            {confirming === "raw" ? t.tripSummary.deleteRawConfirm : t.tripSummary.deleteTripConfirm}
          </p>
          {confirming === "trip" && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-amber-600" checked={withJournal} onChange={(e) => setWithJournal(e.target.checked)} />
                {t.archive.deleteWithJournal}
              </label>
              {!withJournal && <p className="text-xs text-stone-600">{t.archive.keepJournalNote}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>{t.common.cancel}</Button>
            <Button type="button" size="sm" variant="danger" onClick={confirm} disabled={pending}>
              {confirming === "raw" ? t.tripSummary.deleteRaw : t.tripSummary.deleteTrip}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {recordingId && hasRawPoints && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming("raw")}>{t.tripSummary.deleteRaw}</Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming("trip")}>
            <Trash2 className="size-4" aria-hidden /> {t.tripSummary.deleteTrip}
          </Button>
        </div>
      )}
    </div>
  );
}
