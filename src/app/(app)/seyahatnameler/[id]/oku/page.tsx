import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BookView } from "@/components/travelogue/book/book-view";
import { HtmlExportButton } from "@/components/tools/html-export-button";
import { PdfExportButton } from "@/components/travelogue/book/pdf-export-button";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { getTravelogue } from "@/lib/queries/travelogue";
import { ShareButton } from "@/components/share/share-button";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.travelogue.book.metaTitle };

export default function TravelogueBookPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div data-themed className="mx-auto h-dvh max-w-3xl animate-pulse bg-sunken sm:my-8 sm:rounded-[var(--radius-card)]" aria-label={t.common.loading} />}>
      <TravelogueBook params={params} />
    </Suspense>
  );
}

async function TravelogueBook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [, travelogue] = await Promise.all([requireUser(), getTravelogue(id)]);
  if (!travelogue) notFound();

  return (
    <div data-themed className="page-backdrop min-h-dvh">
      {/* Okuma çubuğu: mobilde sabit üst çubuğun altında yapışır */}
      <div className="sticky top-[var(--mobile-header)] z-20 border-b border-line bg-chrome backdrop-blur lg:top-0">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link href={`/seyahatnameler/${travelogue.id}`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-fg-muted hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden /> {t.travelogue.book.backToEdit}
          </Link>
          <div className="flex flex-wrap items-start justify-end gap-2">
            <ShareButton kind="travelogue" targetId={travelogue.id} />
            <HtmlExportButton travelogueId={travelogue.id} />
            <PdfExportButton travelogue={travelogue} styleUrl={mapStyleUrl()} />
          </div>
        </div>
      </div>
      <BookView travelogue={travelogue} />
    </div>
  );
}
