"use client";

import { useEffect, useState } from "react";
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun,
} from "lucide-react";
import { t } from "@/i18n";

type Weather = { temp: number; code: number; isDay: boolean; city: string | null };
type State = { status: "loading" } | { status: "ok"; weather: Weather } | { status: "none" };

const C = t.dashboard.conditions;

function WeatherIcon({ code, isDay, className, strokeWidth }: { code: number | null; isDay: boolean; className: string; strokeWidth?: number }) {
  const p = { className, strokeWidth, "aria-hidden": true } as const;
  const k = iconKey(code, isDay);
  if (k === "sun") return <Sun {...p} />;
  if (k === "moon") return <Moon {...p} />;
  if (k === "cloud-sun") return <CloudSun {...p} />;
  if (k === "cloud-moon") return <CloudMoon {...p} />;
  if (k === "fog") return <CloudFog {...p} />;
  if (k === "drizzle") return <CloudDrizzle {...p} />;
  if (k === "snow") return <CloudSnow {...p} />;
  if (k === "storm") return <CloudLightning {...p} />;
  if (k === "rain") return <CloudRain {...p} />;
  return <Cloud {...p} />;
}

function iconKey(code: number | null, isDay: boolean) {
  if (code === null) return "cloud";
  if (code === 0) return isDay ? "sun" : "moon";
  if (code <= 2) return isDay ? "cloud-sun" : "cloud-moon";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "rain";
}

/** Konum izni önceden verildiyse cihaz konumu; değilse undefined (yeni izin penceresi açılmaz). */
async function grantedPosition(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    if (!navigator.geolocation || !navigator.permissions) return undefined;
    const p = await navigator.permissions.query({ name: "geolocation" });
    if (p.state !== "granted") return undefined;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(undefined),
        { maximumAge: 30 * 60_000, timeout: 5000, enableHighAccuracy: false },
      );
    });
  } catch {
    return undefined;
  }
}

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      id = setTimeout(tick, 60_000 - d.getSeconds() * 1000 - d.getMilliseconds() + 50);
    };
    tick();
    return () => clearTimeout(id);
  }, []);
  return now;
}

function useWeather(): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pos = await grantedPosition();
        const res = await fetch("/api/weather", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pos ?? {}),
        });
        const j = res.ok ? ((await res.json()) as { weather: Weather | null }) : null;
        if (alive) setState(j?.weather ? { status: "ok", weather: j.weather } : { status: "none" });
      } catch {
        if (alive) setState({ status: "none" });
      }
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

const timeFmt = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long" });
const dayShortFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", weekday: "short" });

/**
 * Karşılamadaki tarih, saat ve hava durumu. Geniş ekranda sağda bir "gösterge" kartı,
 * dar ekranda çağrı düğmesinin altında tek satırlık ince bir şerit. Saat istemcide çizilir (sunucu saat dilimi farkı olmasın).
 */
export function HeroConditions() {
  const now = useNow();
  const w = useWeather();
  const code = w.status === "ok" ? w.weather.code : null;
  const isDay = w.status === "ok" ? w.weather.isDay : true;
  const place = w.status === "ok" ? (w.weather.city ?? C.nearYou) : null;
  const desc = w.status === "ok" ? C.weather(w.weather.code, w.weather.isDay) : null;

  return (
    <section aria-label={C.label} className="min-w-0">
      {/* Telefon: ince şerit */}
      <div className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[1.25rem] border border-line bg-raised px-3.5 py-2 text-[0.8rem] whitespace-nowrap text-fg-muted [text-shadow:none] backdrop-blur-sm sm:gap-x-3 sm:px-4 sm:text-sm xl:hidden">
        <span className="font-light tracking-tight text-fg tabular-nums">{now ? timeFmt.format(now) : "--:--"}</span>
        <span aria-hidden className="h-3 w-px bg-fg/20" />
        <span className="capitalize">{now ? dayShortFmt.format(now) : " "}</span>
        {w.status !== "none" && (
          <>
            <span aria-hidden className="h-3 w-px bg-fg/20" />
            <span className="flex min-w-0 items-center gap-1.5">
              <WeatherIcon code={code} isDay={isDay} className="size-4 shrink-0 text-accent-ink" />
              {w.status === "ok" ? (
                <>
                  <span className="text-fg tabular-nums">{w.weather.temp}°</span>
                  <span className="max-w-[10rem] min-w-0 truncate">{place}</span>
                </>
              ) : <span className="h-3 w-16 animate-pulse rounded bg-fg/10" />}
            </span>
          </>
        )}
      </div>

      {/* Masaüstü: gösterge kartı */}
      <div className="hidden w-64 rounded-3xl border border-line bg-[color-mix(in_srgb,var(--color-surface)_55%,transparent)] p-6 shadow-[var(--shadow-overlay)] backdrop-blur-md xl:block">
        <div aria-hidden className="mb-4 flex justify-between">
          {Array.from({ length: 17 }, (_, i) => (
            <span key={i} className={i % 4 === 0 ? "h-2 w-px bg-accent-ink/60" : "h-1 w-px bg-fg/20"} />
          ))}
        </div>
        <p className="text-[3.25rem] leading-none font-extralight tracking-[-0.04em] text-fg tabular-nums">
          {now ? timeFmt.format(now) : "--:--"}
        </p>
        <p className="mt-2 text-sm text-fg-muted capitalize">{now ? dayFmt.format(now) : " "}</p>
        <div className="my-5 h-px bg-gradient-to-r from-accent-ink/50 via-fg/10 to-transparent" />
        {w.status === "loading" && <div className="h-12 animate-pulse rounded-xl bg-fg/[0.06]" />}
        {w.status === "none" && <p className="text-sm text-fg-subtle">{C.weatherUnavailable}</p>}
        {w.status === "ok" && (
          <div className="flex items-center gap-4">
            <WeatherIcon code={code} isDay={isDay} className="size-9 shrink-0 text-accent-ink" strokeWidth={1.4} />
            <div className="min-w-0">
              <p className="text-3xl leading-none font-extralight tracking-tight text-fg tabular-nums">
                {w.weather.temp}<span className="text-accent-ink">°</span>
              </p>
              <p className="mt-1 truncate text-xs text-fg-muted">{desc} · {place}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
