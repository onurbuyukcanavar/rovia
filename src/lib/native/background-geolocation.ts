/**
 * Android uygulamasında (Capacitor kabuğu) arka planda konum: @capacitor-community/background-geolocation.
 * Yalnızca isNativeApp() doğruyken çağrılır; @capacitor/core dinamik yüklenir, tarayıcı kullanıcılarının
 * paketine girmez. Eklenti, ekran kapalıyken de konum verebilmek için bildirimli bir ön plan hizmeti açar.
 */
import type { BackgroundGeolocationPlugin, Location } from "@capacitor-community/background-geolocation";
import type { RawPoint } from "@/lib/gps/filter";

export type NativeGeoProblem = "denied" | "unavailable";

/** Ardışık konumlar arasında en az bu kadar metre (filtre ayrıca gürültüyü ayıklar) */
const DISTANCE_FILTER_M = 5;

export const NATIVE_GEO_TEXT = {
  backgroundTitle: "ROVIA yolculuğu kaydediyor",
  backgroundMessage: "Konumun yolculuk kaydı için kullanılıyor.",
  denied: "Konum izni verilmedi. Kaydın sürmesi için ROVIA'ya konum iznini (\"Uygulamayı kullanırken\" veya \"Her zaman\") ver.",
  unavailable: "Konum alınamıyor. Cihazın konum servisinin açık olduğundan emin ol.",
  openSettingsPrompt: "ROVIA'nın konum iznine ihtiyacı var. Ayarları açıp izin vermek ister misin?",
} as const;

let pluginPromise: Promise<BackgroundGeolocationPlugin> | null = null;

function plugin(): Promise<BackgroundGeolocationPlugin> {
  pluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) =>
    registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation"),
  );
  return pluginPromise;
}

export function toRawPoint(l: Location): RawPoint {
  const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    t: Math.round(num(l.time) ?? Date.now()),
    lat: l.latitude,
    lng: l.longitude,
    acc: num(l.accuracy),
    alt: num(l.altitude),
    spd: num(l.speed),
    hdg: num(l.bearing),
  };
}

function problemOf(code: string | undefined): NativeGeoProblem {
  return code === "NOT_AUTHORIZED" ? "denied" : "unavailable";
}

/**
 * Kayıt süresince konum izler (ön plan hizmeti + bildirim). Dönen fonksiyon izlemeyi durdurur;
 * eklenti henüz yüklenmeden çağrılsa da güvenlidir.
 */
export function watchNativePosition(
  onPoint: (p: RawPoint) => void,
  onProblem: (p: NativeGeoProblem) => void,
): () => void {
  let stopped = false;
  let watcherId: string | null = null;
  void plugin()
    .then((bg) =>
      bg.addWatcher(
        {
          backgroundTitle: NATIVE_GEO_TEXT.backgroundTitle,
          backgroundMessage: NATIVE_GEO_TEXT.backgroundMessage,
          requestPermissions: true,
          stale: false,
          distanceFilter: DISTANCE_FILTER_M,
        },
        (location, error) => {
          if (stopped) return;
          if (error) return onProblem(problemOf(error.code));
          if (location) onPoint(toRawPoint(location));
        },
      ),
    )
    .then((id) => {
      watcherId = id;
      if (stopped) void plugin().then((bg) => bg.removeWatcher({ id }));
    })
    .catch(() => {
      if (!stopped) onProblem("unavailable");
    });
  return () => {
    stopped = true;
    const id = watcherId;
    watcherId = null;
    if (id) void plugin().then((bg) => bg.removeWatcher({ id })).catch(() => undefined);
  };
}

/**
 * Kayıt başlarken izin ister ve ilk konumu bekler (bildirimsiz, yalnızca ön planda).
 * Sonuç: ilk nokta, "denied"/"unavailable" ya da zaman aşımında null.
 */
export function firstNativeFix(timeoutMs = 30_000): Promise<RawPoint | NativeGeoProblem | null> {
  return new Promise((resolve) => {
    let done = false;
    let stop: (() => void) | null = null;
    const finish = (r: RawPoint | NativeGeoProblem | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      stop?.();
      resolve(r);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    let id: string | null = null;
    stop = () => {
      if (id) void plugin().then((bg) => bg.removeWatcher({ id: id! })).catch(() => undefined);
    };
    void plugin()
      .then((bg) =>
        bg.addWatcher({ requestPermissions: true, stale: false }, (location, error) => {
          if (error) return finish(problemOf(error.code));
          if (location) finish(toRawPoint(location));
        }),
      )
      .then((watcher) => {
        id = watcher;
        if (done) stop?.();
      })
      .catch(() => finish("unavailable"));
  });
}

/** Uygulamanın Android ayarlar sayfasını açar (konum izni reddedildiyse). */
export async function openNativeSettings(): Promise<void> {
  await (await plugin()).openSettings();
}

/** İzin reddinde kullanıcıya "Ayarları aç" seçeneği sunar. */
export function offerNativeSettings(): void {
  if (window.confirm(NATIVE_GEO_TEXT.openSettingsPrompt)) void openNativeSettings().catch(() => undefined);
}
