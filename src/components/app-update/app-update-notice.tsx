"use client";
import { Download, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { isNativeApp } from "@/lib/platform";
import { DISMISS_KEY, isAllowedApkUrl, isUpdateAvailable, type LatestRelease } from "@/lib/app-update/version";
import { hasNativeUpdater, installedVersion, updater } from "@/lib/native/updater";
import { t } from "@/i18n";

type Phase =
  | { kind: "idle" }
  | { kind: "downloading"; percent: number | null }
  | { kind: "installing" }
  | { kind: "permission" }
  | { kind: "error"; message: string };

type Notice = { latest: LatestRelease; mode: "native" | "manual" };

function readDismissed(): number | null {
  try {
    const v = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeDismissed(code: number) {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(code));
  } catch {
    // Gizli mod / depolama kapalı: bildirim bu oturumda kapanır
  }
}

function isLatest(v: unknown): v is LatestRelease {
  const r = v as LatestRelease | null;
  return !!r && Number.isSafeInteger(r.versionCode) && typeof r.versionName === "string" && typeof r.apkUrl === "string" && isAllowedApkUrl(r.apkUrl);
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/signature_mismatch|wrong_package|invalid_apk|not_newer/.test(msg)) return t.appUpdate.errors.signature;
  if (/download_failed|storage|host_not_allowed|http_/.test(msg)) return t.appUpdate.errors.download;
  return t.appUpdate.errors.generic;
}

/**
 * Android uygulamasında yeni APK sürümü varsa kabukta yüzen bildirim. Tarayıcıda hiçbir şey yapmaz.
 * Kurulu sürüm eklentiden/UA'dan okunur; okunamıyorsa (eski APK) bir kerelik elle indirme bağlantısı gösterilir.
 */
export function AppUpdateNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/app/latest").catch(() => null);
      if (!res?.ok) return;
      const latest: unknown = await res.json().catch(() => null);
      if (!isLatest(latest) || readDismissed() === latest.versionCode) return;
      const installed = await installedVersion();
      if (cancelled) return;
      if (!installed) setNotice({ latest, mode: "manual" });
      else if (isUpdateAvailable(latest, installed)) setNotice({ latest, mode: hasNativeUpdater() ? "native" : "manual" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Eklenti olayları: indirme ilerlemesi ve ayarlardan dönüşte kurulum durumu
  useEffect(() => {
    if (notice?.mode !== "native") return;
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    void updater().then((u) => {
      handles.push(u.addListener("updateProgress", (e) => setPhase({ kind: "downloading", percent: e.percent >= 0 ? e.percent : null })));
      handles.push(u.addListener("updateStatus", (e) =>
        setPhase(e.status === "installing" ? { kind: "installing" } : { kind: "error", message: t.appUpdate.permissionDenied })));
    });
    return () => {
      for (const h of handles) void h.then((x) => x.remove()).catch(() => undefined);
    };
  }, [notice?.mode]);

  if (!notice) return null;
  const { latest, mode } = notice;
  const busy = phase.kind === "downloading";

  async function update() {
    setPhase({ kind: "downloading", percent: null });
    try {
      const r = await (await updater()).downloadAndInstall({ url: latest.apkUrl });
      setPhase(r.status === "permission" ? { kind: "permission" } : { kind: "installing" });
    } catch (e) {
      setPhase({ kind: "error", message: errorText(e) });
    }
  }

  function dismiss() {
    writeDismissed(latest.versionCode);
    setNotice(null);
  }

  return (
    <aside
      aria-labelledby="app-update-title"
      data-testid="app-update-notice"
      className="fixed inset-x-3 bottom-[calc(var(--mobile-nav,0px)+0.75rem)] z-40 rounded-2xl border border-line bg-overlay p-4 text-fg shadow-[var(--shadow-overlay)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-96"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-raised text-accent-ink" aria-hidden>
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="app-update-title" className="text-sm font-semibold text-fg">{t.appUpdate.title(latest.versionName)}</h2>
          <p className="text-xs leading-relaxed text-fg-muted" role="status">
            {phase.kind === "downloading" ? t.appUpdate.downloading(phase.percent)
              : phase.kind === "installing" ? t.appUpdate.installing
                : phase.kind === "permission" ? t.appUpdate.permission
                  : mode === "manual" ? t.appUpdate.manual.body : t.appUpdate.body}
          </p>
          {phase.kind === "error" && <p className="text-xs text-danger" role="alert">{phase.message}</p>}
        </div>
        {!busy && (
          <button type="button" onClick={dismiss} aria-label={t.appUpdate.dismiss}
            className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-fg-subtle hover:bg-fg/[0.07] hover:text-fg">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {busy && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label={t.appUpdate.downloading(phase.percent)}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.percent ?? undefined}>
          <div className={phase.percent === null ? "h-full w-1/3 animate-pulse rounded-full bg-accent" : "h-full rounded-full bg-accent transition-[width]"}
            style={phase.percent === null ? undefined : { width: `${phase.percent}%` }} />
        </div>
      )}

      {!busy && phase.kind !== "installing" && (
        <div className="mt-3 flex gap-2 pl-12">
          {mode === "native" ? (
            <Button type="button" size="sm" variant="accent" onClick={update}>
              <Download className="size-4" aria-hidden />
              {phase.kind === "error" ? t.appUpdate.retry : t.appUpdate.update}
            </Button>
          ) : (
            // Eski APK: indirme sistem tarayıcısında açılır (github.com uygulama dışı adres)
            <a href={latest.apkUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("accent", "sm")}>
              <Download className="size-4" aria-hidden /> {t.appUpdate.manual.download}
            </a>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={dismiss}>{t.appUpdate.later}</Button>
        </div>
      )}
    </aside>
  );
}
