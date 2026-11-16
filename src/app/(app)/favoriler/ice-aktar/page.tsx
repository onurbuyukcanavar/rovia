import type { Metadata } from "next";
import { Importer } from "@/components/favorites/importer";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.importer.title };

export default function ImportPage() {
  return <Importer />;
}
