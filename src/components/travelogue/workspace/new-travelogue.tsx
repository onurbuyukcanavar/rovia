"use client";
import { LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/journal/note-editor";
import { createTravelogue } from "@/lib/actions/travelogue";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { Modal } from "./modal";

export type CreatableTrip = { id: string; title: string; date: string | null; travelogueId: string | null };

const T = t.travelogue.pages.create;

/** "Yeni seyahatname" düğmesi ve penceresi: tamamlanan bir yolculuk ya da boş seyahatname. */
export function NewTravelogueButton({ trips, label = t.travelogue.pages.list.newButton, variant = "accent" }: {
  trips: CreatableTrip[]; label?: string; variant?: "accent" | "primary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)} data-testid="new-travelogue">
        <Plus className="size-4" aria-hidden /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={T.title} testId="new-travelogue-dialog">
        <NewTravelogueForm trips={trips} />
      </Modal>
    </>
  );
}

function NewTravelogueForm({ trips }: { trips: CreatableTrip[] }) {
  const router = useRouter();
  const firstFree = trips.find((tr) => !tr.travelogueId)?.id ?? "";
  const [tripId, setTripId] = useState<string>(firstFree);
  const [title, setTitle] = useState("");
  const [importNotes, setImportNotes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tripId && !title.trim()) {
      setError(T.titleRequiredNoTrip);
      return;
    }
    start(async () => {
      const r = await createTravelogue({ tripId: tripId || null, title: title.trim() || null, importNotes: Boolean(tripId) && importNotes });
      if (!r.ok) setError(r.message);
      else router.push(`/seyahatnameler/${r.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-ink-800">{T.tripLabel}</legend>
        {trips.length === 0 && <p className="text-sm text-stone-600">{T.noCompleted}</p>}
        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {trips.map((tr) => (
            <li key={tr.id}>
              {tr.travelogueId ? (
                <div className="flex items-center gap-3 rounded-xl border border-sand-200 bg-sand-100/60 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{tr.title}</span>
                    <span className="block text-xs text-stone-600">{[formatDate(tr.date), T.hasTravelogue].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Link href={`/seyahatnameler/${tr.travelogueId}`} className="font-semibold text-amber-700 underline">{T.openExisting}</Link>
                </div>
              ) : (
                <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm",
                  tripId === tr.id ? "border-ink-900 bg-white" : "border-sand-200 bg-paper-50 hover:bg-white")}>
                  <input type="radio" name="trip" className="size-4 accent-amber-600" checked={tripId === tr.id} onChange={() => setTripId(tr.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{tr.title}</span>
                    {tr.date && <span className="block text-xs text-stone-600">{formatDate(tr.date)}</span>}
                  </span>
                </label>
              )}
            </li>
          ))}
          <li>
            <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm",
              tripId === "" ? "border-ink-900 bg-white" : "border-sand-200 bg-paper-50 hover:bg-white")}>
              <input type="radio" name="trip" className="mt-0.5 size-4 accent-amber-600" checked={tripId === ""} onChange={() => setTripId("")}
                data-testid="new-travelogue-no-trip" />
              <span>
                <span className="block font-semibold">{T.noTrip}</span>
                <span className="block text-xs text-stone-600">{T.noTripHint}</span>
              </span>
            </label>
          </li>
        </ul>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="tl-new-title" className="block text-sm font-semibold text-ink-800">{T.titleLabel}</label>
        <input id="tl-new-title" className={cn(fieldClass, "h-11")} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
          placeholder={tripId ? T.titlePlaceholder : undefined} data-testid="new-travelogue-title" />
      </div>

      {tripId && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-amber-600" checked={importNotes} onChange={(e) => setImportNotes(e.target.checked)} />
          <span>
            {T.importNotes}
            <span className="block text-xs text-stone-600">{T.importNotesHint}</span>
          </span>
        </label>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" variant="accent" className="w-full" disabled={pending} data-testid="new-travelogue-submit">
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {pending ? T.creating : T.submit}
      </Button>
    </form>
  );
}
