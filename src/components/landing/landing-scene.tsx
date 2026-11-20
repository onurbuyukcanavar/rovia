"use client";
import { useEffect, useRef } from "react";

/**
 * Ana sayfanın yapışkan arka plan katmanı: CSS gece degradesi + ufuk ışıltısı (JS/WebGL yoksa da görünür)
 * ve üstünde WebGL parçacık tuvali. WebGL kodu yalnızca istemcide, dinamik import ile yüklenir.
 * Kapsayıcı: en yakın [data-scene-root]; bölümler: [data-scene-chapter]; km sayacı: [data-scene-km].
 */
export function LandingScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = canvas?.closest<HTMLElement>("[data-scene-root]");
    if (!canvas || !root) return;
    let cancelled = false;
    let handle: { destroy: () => void } | null = null;
    import("./particle-engine")
      .then(({ startScene }) => {
        if (cancelled) return;
        handle = startScene(canvas, {
          root,
          chapters: Array.from(root.querySelectorAll<HTMLElement>("[data-scene-chapter]")),
          glow: glowRef.current,
          km: root.querySelector<HTMLElement>("[data-scene-km]"),
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none sticky top-0 -mb-[100svh] h-svh overflow-hidden">
      <div className="landing-sky absolute inset-0" />
      <div ref={glowRef} className="landing-glow absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full opacity-0 transition-opacity duration-[1600ms] ease-out data-[ready]:opacity-100" />
      <div className="landing-vignette absolute inset-0" />
    </div>
  );
}
