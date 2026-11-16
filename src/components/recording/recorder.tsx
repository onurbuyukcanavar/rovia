"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck, CircleDot, CloudOff, LoaderCircle, MapPin, Pause, Play, RefreshCw, ScreenShare, ScreenShareOff, Square, X,
} from "lucide-react";
import { TrackMap } from "./track-map";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useRecorder } from "@/lib/gps/use-recorder";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import { mapsApi } from "@/lib/maps/client";
import { loadActiveRecording } from "@/lib/actions/recordings";
import type { PlannedTripOption, ServerActiveRecording } from "@/lib/queries/recordings";
import { formatClock, formatDate, formatDistance, formatSpeed, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

type Props = {
  userId: string;
  styleUrl: string;
  plannedTrips: PlannedTripOption[];
  serverActive: ServerActiveRecording | null;
  /** /kayit-modu?yolculuk=<id>: planlı yolculuk önceden seçili gelir */
  preselectTripId: string | null;
};

export function Recorder({ userId, styleUrl, plannedTrips, serverActive, preselectTripId }: Props) {
  const router = useRouter();
  const rec = useRecorder(userId);
  const [tripChoice, setTripChoice] = useState<string>(
    preselectTripId && plannedTrips.some((p) => p.id === preselectTripId) ? preselectTripId : "",
  );
  const [title, setTitle] = useState("");
  const [confirming, setConfirming] = useState<"finish" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const active = rec.phase === "recording" || rec.phase === "paused";
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  // Tamamlanan kayıt sunucuya ulaşınca özete geç
  useEffect(() => {
    if (rec.finishedTripId) router.replace(`/yolculuklar/${rec.finishedTripId}`);
  }, [rec.finishedTripId, router]);

  // Mevcut konumun adı: ~1 km'de bir sorulur (hız sınırı ve gizlilik için seyrek)
  const fix = rec.lastFix;
  const placeKey = active && fix ? `${fix.lat.toFixed(2)},${fix.lng.toFixed(2)}` : null;
  const place = useKeyedRequest(placeKey, () => mapsApi.reverseGeocode({ lat: fix!.lat, lng: fix!.lng }), { keepPrevious: true });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const planned = plannedTrips.find((p) => p.id === (rec.session?.plannedTripId ?? tripChoice)) ?? null;
  const defaultTitle = t.recording.titleDefault(formatDate(new Date(now)));
  const elapsedS = rec.session ? (now - rec.session.startedAt) / 1000 : 0;
  const avgKmh = rec.stats.movingS >= 30 ? (rec.stats.distanceM / rec.stats.movingS) * 3.6 : null;
  const position = fix ? { lat: fix.lat, lng: fix.lng } : null;
  const showRemote = rec.phase === "idle" && serverActive && !rec.session;

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4.5rem-env(safe-area-inset-bottom))] flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr]">
      <div className="relative order-1 h-[42%] shrink-0 lg:order-2 lg:h-full">
        <TrackMap styleUrl={styleUrl} paths={rec.stats.paths} position={position}
          plannedPolyline={planned?.routePolyline ?? null} className="relative h-full w-full" />
        {active && (
          <div className="pointer-events-none absolute top-3 left-3 z-10">
            <StatusPill phase={rec.phase} />
          </div>
        )}
      </div>

      <aside className="order-2 min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-sand-200 bg-paper px-4 py-4 lg:order-1 lg:border-t-0 lg:border-r lg:px-5 lg:py-6">
        <header className="hidden lg:block">
          <h1 className="text-2xl font-extrabold tracking-tight">{t.recording.title}</h1>
          <p className="text-sm text-stone-600">{t.recording.subtitle}</p>
        </header>

        {rec.error && <Alert tone="error">{rec.error}</Alert>}
        {rec.notice && (
          <div className="flex items-start gap-2">
            <Alert className="flex-1">{rec.notice}</Alert>
            <button type="button" onClick={rec.dismissNotice} aria-label={t.common.close} className="mt-2 text-stone-500 hover:text-ink-900">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {rec.phase === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-sand-100" aria-label={t.common.loading} />}

        {showRemote && serverActive && (
          <section className="card space-y-3 p-4" data-testid="remote-active">
            <h2 className="font-bold">{t.recording.remoteActive.title}</h2>
            <p className="text-sm text-stone-600">
              <strong>{serverActive.title}</strong> — {t.recording.remoteActive.body(`${formatDate(serverActive.startedAt)} ${formatTime(serverActive.startedAt)}`)}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["adopt", "finish", "cancel"] as const).map((action) => (
                <Button key={action} type="button" size="sm" variant={action === "adopt" ? "accent" : action === "cancel" ? "ghost" : "secondary"} disabled={busy}
                  onClick={() => run(async () => {
                    const remote = await loadActiveRecording(serverActive.recordingId);
                    if (!remote) return router.refresh();
                    await rec.adopt(remote);
                    if (action === "finish") await rec.finish();
                    if (action === "cancel") await rec.cancel();
                  })}>
                  {t.recording.remoteActive[action]}
                </Button>
              ))}
            </div>
          </section>
        )}

        {(rec.phase === "idle" || rec.phase === "starting") && !showRemote && (
          <section className="space-y-4" data-testid="recorder-idle">
            <div className="space-y-1.5">
              <label htmlFor="trip-choice" className="block text-sm font-semibold text-ink-800">{t.recording.tripChoice}</label>
              <select id="trip-choice" value={tripChoice} onChange={(e) => setTripChoice(e.target.value)}
                className="h-12 w-full rounded-xl border border-sand-300 bg-white px-3 text-[0.95rem] outline-none focus:border-ink-700 focus:ring-4 focus:ring-amber-400/25">
                <option value="">{t.recording.unplanned}</option>
                {plannedTrips.map((p) => <option key={p.id} value={p.id}>{t.recording.plannedOption(p.title)}</option>)}
              </select>
            </div>
            {!tripChoice && (
              <Field label={t.recording.titleLabel} name="recordingTitle" value={title} maxLength={160} placeholder={defaultTitle}
                onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
            )}
            <p className="text-sm text-stone-600">{t.recording.permission.prompt}</p>
            <Button type="button" variant="accent" size="lg" className="w-full" disabled={rec.phase === "starting"}
              onClick={() => rec.start({ plannedTripId: tripChoice || null, title: tripChoice ? (planned?.title ?? defaultTitle) : title.trim() || defaultTitle })}>
              {rec.phase === "starting" ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <CircleDot className="size-5" aria-hidden />}
              {rec.phase === "starting" ? t.recording.starting : t.recording.start}
            </Button>
            <LimitsNote />
          </section>
        )}

        {active && rec.session && (
          <section className="space-y-5" data-testid="recorder-active">
            <div>
              <p className="eyebrow">{rec.session.title}</p>
              <p className="mt-1 font-mono text-5xl font-extrabold tracking-tight tabular-nums" data-testid="rec-elapsed" aria-label={t.recording.elapsed}>
                {formatClock(elapsedS)}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-3">
              <Stat label={t.recording.distance} value={formatDistance(rec.stats.distanceM)} testId="rec-distance" />
              <Stat label={t.recording.avgSpeed} value={formatSpeed(avgKmh)} testId="rec-speed" />
              <Stat label={t.recording.startedAt} value={formatTime(rec.session.startedAt)} />
            </dl>

            <div className="rounded-xl bg-sand-50 p-3 text-sm" data-testid="rec-location">
              <p className="flex items-center gap-1.5 font-semibold"><MapPin className="size-4 text-amber-600" aria-hidden /> {t.recording.currentLocation}</p>
              {fix ? (
                <p className="mt-1 text-stone-700">
                  {place.data?.label ?? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`}
                  {fix.acc !== null && <span className="ml-1.5 text-stone-500">({t.recording.accuracy(fix.acc)})</span>}
                </p>
              ) : (
                <p className="mt-1 text-stone-500">{rec.phase === "recording" ? t.recording.locating : t.recording.noFix}</p>
              )}
            </div>

            {confirming ? (
              <div className="card space-y-3 p-4" role="alertdialog" aria-labelledby="rec-confirm">
                <p id="rec-confirm" className="text-sm font-semibold">
                  {confirming === "finish" ? t.recording.finishConfirm : t.recording.cancelConfirm}
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>{t.recording.keep}</Button>
                  <Button type="button" size="sm" variant={confirming === "finish" ? "accent" : "danger"} disabled={busy}
                    onClick={() => run(confirming === "finish" ? rec.finish : rec.cancel)}>
                    {confirming === "finish" ? t.recording.finishYes : t.recording.cancelYes}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {rec.phase === "recording" ? (
                  <Button type="button" variant="secondary" size="lg" onClick={() => run(rec.pause)} disabled={busy}>
                    <Pause className="size-5" aria-hidden /> {t.recording.pause}
                  </Button>
                ) : (
                  <Button type="button" variant="accent" size="lg" onClick={() => run(rec.resume)} disabled={busy}>
                    <Play className="size-5" aria-hidden /> {t.recording.resume}
                  </Button>
                )}
                <Button type="button" variant="primary" size="lg" onClick={() => setConfirming("finish")} disabled={busy}>
                  <Square className="size-5" aria-hidden /> {t.recording.finish}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="col-span-2" onClick={() => setConfirming("cancel")} disabled={busy}>
                  {t.recording.cancel}
                </Button>
              </div>
            )}

            <div className="space-y-1.5 text-xs text-stone-600">
              <SyncLine sync={rec.sync} />
              {rec.phase === "recording" && (
                <p className={cn("flex items-center gap-1.5", !rec.wakeLock && "text-amber-700")} data-testid="rec-wakelock">
                  {rec.wakeLock ? <ScreenShare className="size-3.5" aria-hidden /> : <ScreenShareOff className="size-3.5" aria-hidden />}
                  {rec.wakeLock ? t.recording.wakeLock.on : t.recording.wakeLock.off}
                </p>
              )}
            </div>
            <LimitsNote />
          </section>
        )}

        {rec.phase === "finished" && (
          <section className="card space-y-3 p-5" data-testid="recorder-finished">
            <p className="flex items-center gap-2 font-semibold">
              <LoaderCircle className="size-5 animate-spin" aria-hidden />
              {rec.sync.pending > 0 && rec.sync.problem ? t.recording.finishedOffline : t.recording.finishedRedirect}
            </p>
            <SyncLine sync={rec.sync} />
          </section>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-3">
      <dt className="text-[0.7rem] font-semibold tracking-wide text-stone-500 uppercase">{label}</dt>
      <dd className="mt-1 text-lg font-extrabold tabular-nums" data-testid={testId}>{value}</dd>
    </div>
  );
}

function StatusPill({ phase }: { phase: string }) {
  const recording = phase === "recording";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold shadow-md", recording ? "bg-danger text-white" : "bg-ink-900 text-paper")}
      data-testid="rec-status">
      <span className={cn("size-2.5 rounded-full", recording ? "animate-pulse bg-white" : "bg-amber-400")} aria-hidden />
      {t.recording.status[phase]}
    </span>
  );
}

function SyncLine({ sync }: { sync: { pending: number; problem: string | null; online: boolean } }) {
  const offline = !sync.online || sync.problem === "offline";
  return (
    <p className={cn("flex items-center gap-1.5", offline && "text-amber-700")} data-testid="rec-sync" aria-live="polite">
      {offline ? <CloudOff className="size-3.5" aria-hidden /> : sync.pending > 0 ? <RefreshCw className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5 text-success" aria-hidden />}
      {offline ? t.recording.sync.offline : sync.pending > 0 ? (sync.problem ? t.recording.sync.error : t.recording.sync.pending(sync.pending)) : t.recording.sync.synced}
    </p>
  );
}

function LimitsNote() {
  return (
    <details className="rounded-xl border border-sand-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer font-semibold">{t.recording.limits.title}</summary>
      <p className="mt-2 leading-relaxed text-stone-600">{t.recording.limits.body}</p>
    </details>
  );
}
