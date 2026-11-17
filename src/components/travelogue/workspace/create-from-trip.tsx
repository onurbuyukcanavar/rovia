"use client";
import { BookPlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createTravelogue } from "@/lib/actions/travelogue";
import { t } from "@/i18n";

const T = t.travelogue.pages.tripCard;

/** Yolculuk sayfasında: bu yolculuktan (günlük notları taslak yazı olarak aktarılarak) seyahatname oluşturur. */
export function CreateFromTrip({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="accent" disabled={pending} data-testid="trip-create-travelogue"
        onClick={() => start(async () => {
          setError(null);
          const r = await createTravelogue({ tripId, title: null, importNotes: true });
          if (r.ok) router.push(`/seyahatnameler/${r.id}`);
          else setError(r.message);
        })}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <BookPlus className="size-4" aria-hidden />}
        {pending ? T.creating : T.create}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
