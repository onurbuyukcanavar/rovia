import { FileCode } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/i18n";

/** Seyahatnameyi tek dosyalık HTML olarak indirir (fotoğraflar gömülü). */
export function HtmlExportButton({ travelogueId }: { travelogueId: string }) {
  return (
    <a href={`/api/travelogues/${travelogueId}/export?format=html`} download className={buttonClass("secondary", "sm")} data-testid="export-html">
      <FileCode className="size-4" aria-hidden /> {t.tools.export.html}
    </a>
  );
}
