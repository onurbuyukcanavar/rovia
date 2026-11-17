import type { PdfImage } from "./document";
import type { BookSection } from "./model";
import { mapPoints } from "./model";
import { boundsOf } from "@/lib/geo";

/**
 * Rota haritasını ekran dışı bir MapLibre haritasında çizip JPEG veri adresine çevirir (yalnızca tarayıcı).
 * Rota ve numaralı duraklar GeoJSON katmanlarıdır (DOM işaretleri tuvale düşmez).
 * Başarısız olursa null döner; PDF harita bölümü olmadan oluşturulur.
 */
export async function renderMapImage(
  sec: Extract<BookSection, { kind: "map" }>,
  styleUrl: string,
  opts: { width?: number; height?: number; timeoutMs?: number } = {},
): Promise<PdfImage | null> {
  const width = opts.width ?? 1100;
  const height = opts.height ?? 820;
  const points = mapPoints(sec);
  if (!points.length) return null;

  const { loadMapLib } = await import("@/lib/maps/maplibre-setup");
  const maplibre = await loadMapLib();

  const container = document.createElement("div");
  Object.assign(container.style, { position: "fixed", left: "-10000px", top: "0", width: `${width}px`, height: `${height}px`, pointerEvents: "none" });
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  const b = boundsOf(points);
  const single = points.length === 1 || !b || (b.west === b.east && b.south === b.north);
  let map: import("maplibre-gl").Map | null = null;
  try {
    map = new maplibre.Map({
      container,
      style: styleUrl,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: 2,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      ...(single
        ? { center: [points[0].lng, points[0].lat] as [number, number], zoom: 11 }
        : { bounds: [[b!.west, b!.south], [b!.east, b!.north]] as [[number, number], [number, number]], fitBoundsOptions: { padding: 70, maxZoom: 14 } }),
    });
    const m = map;

    await withTimeout(new Promise<void>((resolve, reject) => {
      m.once("load", () => resolve());
      m.once("error", (e) => reject(e.error ?? new Error("MAP_ERROR")));
    }), opts.timeoutMs ?? 20_000);

    m.addSource("route", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: sec.paths.map((p) => p.map((x) => [x.lng, x.lat])) } },
    });
    m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } });
    m.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#0e1726", "line-width": 4.5 } });
    m.addSource("stops", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: sec.markers.map((mk) => ({ type: "Feature", properties: { n: String(mk.number) }, geometry: { type: "Point", coordinates: [mk.lng, mk.lat] } })),
      },
    });
    m.addLayer({ id: "stops-circle", type: "circle", source: "stops", paint: { "circle-radius": 12, "circle-color": "#e8912d", "circle-stroke-color": "#0e1726", "circle-stroke-width": 2 } });
    m.addLayer({
      id: "stops-label", type: "symbol", source: "stops",
      layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": "#0e1726" },
    });

    await withTimeout(new Promise<void>((resolve) => m.once("idle", () => resolve())), opts.timeoutMs ?? 20_000);
    const src = m.getCanvas().toDataURL("image/jpeg", 0.88);
    if (!src.startsWith("data:image/jpeg")) return null;
    return { src, width, height };
  } catch (e) {
    console.warn("[rovia] PDF haritası çizilemedi:", e);
    return null;
  } finally {
    map?.remove();
    container.remove();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("MAP_TIMEOUT")), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}
