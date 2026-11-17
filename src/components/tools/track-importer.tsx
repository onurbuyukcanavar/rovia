"use client";
import { FileUp, LoaderCircle, MapPin, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { TrackMap, type MapPin as Pin } from "@/components/recording/track-map";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { importTrack } from "@/lib/actions/trip-tools";
import { parseTrackFile, toLatLngs, trackStats, TrackImportError, type ParsedTrack } from "@/lib/import/track";
import { buildImportPayload, MAX_IMPORT_WAYPOINTS } from "@/lib/import/track-plan";
import { formatCount, formatDistance, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const T = t.tools.import;
const WAYPOINT_LIST_LIMIT = 30;

export type ImportTarget = { id: string; title: string; status: "planned" | "completed" | "archived"; hasRecording: boolean };

export function TrackImporter({ styleUrl, targets }: { styleUrl: string; targets: ImportTarget[] }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState<ParsedTrack | null>(null);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState<"new" | "attach">("new");
  const [tripId, setTripId] = useState("");
  const [saving, startSaving] = useTransition();

  const stats = useMemo(() => (track ? trackStats(track.segments) : null), [track]);
  const paths = useMemo(() => (track ? toLatLngs(track.segments) : []), [track]);
  const pins = useMemo<Pin[]>(
    () => (track?.waypoints ?? []).slice(0, 500).map((w, i) => ({ id: `w${i}`, lat: w.lat, lng: w.lng, kind: "note", label: w.name })),
    [track],
  );
  const mode = stats?.hasTime ? "recording" : "route";
  // Kayıt: aktif olmayan ve kaydı olmayan yolculuk; rota: yalnızca planlı yolculuk
  const choices = targets.filter((x) => (mode === "recording" ? !x.hasRecording : x.status === "planned"));

  function reset() {
    setTrack(null);
    setError(null);
    setTripId("");
    setTarget("new");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function readFile(file: File) {
    setError(null);
    setReading(true);
    try {
      const parsed = parseTrackFile(file.name, new Uint8Array(await file.arrayBuffer()));
      setTrack(parsed);
      setTitle(parsed.name ?? file.name.replace(/\.(gpx|kml|kmz)$/i, "").slice(0, 160));
      setTripId("");
    } catch (e) {
      const code = e instanceof TrackImportError ? e.code : "invalid";
      setError(T.errors[code]);
      setTrack(null);
    } finally {
      setReading(false);
    }
  }

  function save() {
    if (!track || !stats) return;
    setError(null);
    startSaving(async () => {
      let payload;
      try {
        payload = buildImportPayload(track, mode);
      } catch {
        setError(T.errors.invalidTrack);
        return;
      }
      const r = await importTrack({
        tripId: target === "attach" ? tripId || null : null,
        title: title.trim() || null,
        source: track.source,
        payload,
      });
      if (!r.ok) setError(r.message);
      else router.push(r.href);
    });
  }

  if (!track) {
    return (
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) void readFile(f);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
            dragging ? "border-amber-500 bg-amber-50" : "border-sand-300 bg-paper-50 hover:border-stone-500",
          )}
          data-testid="track-dropzone"
        >
          {reading ? <LoaderCircle className="size-8 animate-spin text-stone-500" aria-hidden /> : <FileUp className="size-8 text-amber-600" aria-hidden />}
          <span className="font-semibold">{reading ? T.reading : T.drop}</span>
          <span className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-sm font-semibold text-paper">{T.choose}</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".gpx,.kml,.kmz,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
            className="sr-only"
            data-testid="track-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFile(f);
            }}
          />
        </label>
        <p className="text-sm text-stone-600">{T.limits}</p>
      </div>
    );
  }

  const hasTrack = track.segments.length > 0;
  const canSave = hasTrack && !saving && (target === "new" || !!tripId);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]" data-testid="track-preview">
      <div className="relative h-[50vh] min-h-80 overflow-hidden rounded-2xl border border-sand-200 lg:h-[34rem]">
        <TrackMap styleUrl={styleUrl} paths={paths} showEndpoints pins={pins} className="relative h-full w-full" />
      </div>
      <div className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        {!hasTrack && <Alert tone="error">{T.noTrack}</Alert>}
        {stats && hasTrack && (
          <>
            <dl className="grid grid-cols-2 gap-3" data-testid="import-stats">
              <Stat label={T.stats.distance} value={formatDistance(stats.distanceM)} testId="import-distance" />
              <Stat label={T.stats.duration} value={stats.elapsedS !== null ? formatDuration(stats.elapsedS) : T.stats.noTime} testId="import-duration" />
              {stats.movingS !== null && <Stat label={T.stats.moving} value={formatDuration(stats.movingS)} testId="import-moving" />}
              <Stat label={T.stats.points} value={formatCount(stats.pointCount)} testId="import-points" />
              {track.segments.length > 1 && <Stat label={T.stats.segments} value={formatCount(track.segments.length)} testId="import-segments" />}
              <Stat label={T.stats.waypoints} value={formatCount(track.waypoints.length)} testId="import-waypoints" />
            </dl>
            <Alert>{stats.hasTime ? T.timed : T.untimed}</Alert>
          </>
        )}
        {track.waypoints.length > 0 && (
          <details className="rounded-xl border border-sand-200 bg-white p-3 text-sm">
            <summary className="cursor-pointer font-semibold">{T.waypointsTitle} ({formatCount(track.waypoints.length)})</summary>
            <ul className="mt-2 space-y-1">
              {track.waypoints.slice(0, WAYPOINT_LIST_LIMIT).map((w, i) => (
                <li key={i} className="flex gap-2">
                  <MapPin className="mt-1 size-3.5 shrink-0 text-stone-500" aria-hidden />
                  <span>{w.name}{w.description && <span className="text-stone-500"> — {w.description}</span>}</span>
                </li>
              ))}
              {track.waypoints.length > WAYPOINT_LIST_LIMIT && <li className="text-stone-500">{T.waypointsMore(track.waypoints.length - WAYPOINT_LIST_LIMIT)}</li>}
            </ul>
            <p className="mt-2 text-xs text-stone-500">{T.waypointsNote(MAX_IMPORT_WAYPOINTS)}</p>
          </details>
        )}

        {hasTrack && (
          <fieldset className="space-y-3" disabled={saving}>
            <legend className="mb-2 font-bold">{T.target}</legend>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="radio" name="target" checked={target === "new"} onChange={() => setTarget("new")} data-testid="target-new" />
              {T.asNew}
            </label>
            {target === "new" && (
              <Field label={T.titleLabel} name="title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder={T.defaultTitle} />
            )}
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="radio" name="target" checked={target === "attach"} onChange={() => setTarget("attach")} data-testid="target-attach" />
              {T.attach}
            </label>
            {target === "attach" && (
              <div className="space-y-2">
                {choices.length ? (
                  <select
                    aria-label={T.pickTrip}
                    value={tripId}
                    onChange={(e) => setTripId(e.target.value)}
                    className="h-12 w-full rounded-xl border border-sand-300 bg-white px-3 text-[0.95rem]"
                    data-testid="target-trip"
                  >
                    <option value="">{T.pickTrip}</option>
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>{c.title} · {T[c.status]}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-stone-600">{T.noTrips}</p>
                )}
                <p className="text-xs text-stone-600">{mode === "recording" ? T.attachRecordingHint : T.attachRouteHint}</p>
              </div>
            )}
          </fieldset>
        )}

        <div className="flex flex-wrap gap-2">
          {hasTrack && (
            <Button variant="accent" onClick={save} disabled={!canSave} data-testid="import-save">
              {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {saving ? T.saving : T.save}
            </Button>
          )}
          <Button variant="secondary" onClick={reset} disabled={saving}>
            <RotateCcw className="size-4" aria-hidden /> {T.another}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-3">
      <dt className="text-[0.7rem] font-semibold tracking-wide text-stone-500 uppercase">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums" data-testid={testId}>{value}</dd>
    </div>
  );
}
