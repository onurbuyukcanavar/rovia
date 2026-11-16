import type { Metadata } from "next";
import { MapExplorer } from "@/components/map/map-explorer";
import { mapStyleUrl } from "@/lib/env";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.maps.title };

export default function MapPage() {
  return <MapExplorer styleUrl={mapStyleUrl()} />;
}
