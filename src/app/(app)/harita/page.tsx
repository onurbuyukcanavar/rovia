import type { Metadata } from "next";
import { MapPinOff } from "lucide-react";
import { MapExplorer } from "@/components/map/map-explorer";
import { getMapsBrowserConfig } from "@/lib/env";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.maps.title };

export default function MapPage() {
  const config = getMapsBrowserConfig();
  if (!config) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <MapPinOff className="mx-auto size-10 text-stone-500" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t.maps.notConfiguredTitle}</h1>
        <p className="mt-2 text-stone-600">{t.maps.notConfiguredBody}</p>
      </div>
    );
  }
  return <MapExplorer apiKey={config.apiKey} mapId={config.mapId} />;
}
