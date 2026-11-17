"use client";
import { BookPlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/journal/note-editor";
import { Modal } from "@/components/travelogue/workspace/modal";
import { addPlaceToTravelogue, getTravelogueTargets } from "@/lib/actions/travelogue";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const T = t.travelogue.pages.addTo;

export type TraveloguePlace = {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  osmRef?: string | null;
  savedPlaceId?: string | null;
  visitedAt?: string | null;
};

type Target = { id: string; title: string; tripTitle: string | null };

const OSM_REF = /^[nwr][0-9]+$/;

/** "Seyahatnameye ekle": yeri mevcut ya da yeni bir seyahatnameye yazı olarak ekler ve yazı düzenleyiciyi açar. */
export function AddToTravelogue({ place, size = "sm", variant = "secondary", className }: {
  place: TraveloguePlace; size?: "sm" | "md"; variant?: "secondary" | "ghost" | "primary"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [, startLoad] = useTransition();

  function show() {
    setOpen(true);
    setTargets(null);
    setLoadError(false);
    startLoad(async () => {
      try {
        setTargets(await getTravelogueTargets());
      } catch {
        setTargets([]);
        setLoadError(true);
      }
    });
  }

  return (
    <>
      <Button type="button" size={size} variant={variant} className={className} onClick={show} data-testid="add-to-travelogue">
        <BookPlus className="size-4" aria-hidden /> {T.button}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={T.title} testId="add-to-travelogue-dialog">
        {targets === null ? (
          <p className="flex items-center gap-2 text-sm text-stone-600"><LoaderCircle className="size-4 animate-spin" aria-hidden /> {T.loading}</p>
        ) : (
          <AddForm place={place} targets={targets} loadError={loadError} />
        )}
      </Modal>
    </>
  );
}

function AddForm({ place, targets, loadError }: { place: TraveloguePlace; targets: Target[]; loadError: boolean }) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>(targets[0]?.id ?? "new");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(loadError ? t.common.unexpectedError : null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (choice === "new" && !newTitle.trim()) {
      setError(t.travelogue.errors.titleRequired);
      return;
    }
    start(async () => {
      const visitedAt = place.visitedAt ? new Date(place.visitedAt).toISOString() : null;
      const r = await addPlaceToTravelogue({
        travelogueId: choice === "new" ? null : choice,
        newTitle: choice === "new" ? newTitle.trim() : null,
        place: {
          name: place.name.slice(0, 200), address: place.address ?? null, lat: place.lat, lng: place.lng,
          osmRef: place.osmRef && OSM_REF.test(place.osmRef) ? place.osmRef : null,
          savedPlaceId: place.savedPlaceId ?? null, visitedAt,
        },
      });
      if (!r.ok) setError(r.message);
      else router.push(`/seyahatnameler/${r.travelogueId}/yazi/${r.entryId}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-stone-700">{T.intro(place.name)}</p>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-semibold text-ink-800">{T.choose}</legend>
        <ul className="max-h-60 space-y-1.5 overflow-y-auto">
          {targets.map((tg) => (
            <li key={tg.id}>
              <Choice checked={choice === tg.id} onChange={() => setChoice(tg.id)} title={tg.title} sub={tg.tripTitle} />
            </li>
          ))}
          <li><Choice checked={choice === "new"} onChange={() => setChoice("new")} title={T.newOption} sub={null} testId="add-to-new" /></li>
        </ul>
      </fieldset>
      {choice === "new" && (
        <div className="space-y-1.5">
          <label htmlFor="att-title" className="block text-sm font-semibold text-ink-800">{T.newTitle}</label>
          <input id="att-title" className={cn(fieldClass, "h-11")} value={newTitle} maxLength={200} placeholder={T.newTitlePlaceholder}
            onChange={(e) => setNewTitle(e.target.value)} />
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" variant="accent" className="w-full" disabled={pending} data-testid="add-to-travelogue-submit">
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {pending ? T.adding : T.submit}
      </Button>
    </form>
  );
}

function Choice({ checked, onChange, title, sub, testId }: { checked: boolean; onChange: () => void; title: string; sub: string | null; testId?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm",
      checked ? "border-ink-900 bg-white" : "border-sand-200 bg-paper-50 hover:bg-white")}>
      <input type="radio" name="att-target" className="size-4 accent-amber-600" checked={checked} onChange={onChange} data-testid={testId} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        {sub && <span className="block truncate text-xs text-stone-600">{sub}</span>}
      </span>
    </label>
  );
}
