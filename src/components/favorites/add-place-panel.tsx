"use client";
import { Link2, LoaderCircle, MapPin, X } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { PlaceSearch } from "@/components/map/place-search";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { previewGoogleLink, savePlaces } from "@/lib/actions/favorites";
import { FAVORITE_CATEGORIES, type ListType, type PlaceSource } from "@/lib/favorites/types";
import type { LatLng } from "@/lib/geo";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/** Kaydedilmeyi bekleyen yer (aramadan, haritadan ya da Google bağlantısından) */
export type Candidate = {
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  osmRef: string | null;
  source: PlaceSource;
  sourceRef: string | null;
  estimated: boolean;
};

const OSM_REF = /^[nwr][0-9]{1,19}$/;

export const inputClass =
  "h-11 w-full rounded-xl border border-sand-300 bg-white px-3 text-[0.95rem] text-ink-900 outline-none focus:border-ink-700 focus:ring-4 focus:ring-amber-400/25";

type Props = {
  candidate: Candidate | null;
  onCandidate: (c: Candidate | null) => void;
  onClose: () => void;
  onSaved: (id: string | null, message: string) => void;
};

export function AddPlacePanel({ candidate, onCandidate, onClose, onSaved }: Props) {
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resolving, startResolve] = useTransition();

  function resolveLink() {
    setLinkError(null);
    startResolve(async () => {
      const r = await previewGoogleLink(link.trim());
      if (!r.ok) {
        setLinkError(r.message);
        return;
      }
      onCandidate({
        name: r.name, lat: r.lat, lng: r.lng, address: r.admin, osmRef: null,
        source: "google_link", sourceRef: r.url, estimated: r.estimated,
      });
    });
  }

  return (
    <section className="space-y-5" aria-labelledby="add-place-title" data-testid="add-place-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 id="add-place-title" className="text-xl font-extrabold tracking-tight">{t.favorites.addTitle}</h2>
        <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-sand-100" aria-label={t.common.close}>
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="space-y-2">
        <PlaceSearch
          label={t.favorites.addSearch}
          value={null}
          marker={<MapPin className="size-4 text-stone-500" />}
          onSelect={(s) => {
            if (!s) return;
            onCandidate({
              name: s.label, lat: s.location.lat, lng: s.location.lng, address: s.address,
              osmRef: s.ref && OSM_REF.test(s.ref) ? s.ref : null, source: "manual", sourceRef: null, estimated: false,
            });
          }}
        />
        <p className="text-xs text-stone-600">{t.favorites.addPickHint}</p>
      </div>

      <details className="rounded-2xl border border-sand-200 bg-paper-50 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4" aria-hidden /> {t.favorites.addFromLink}
        </summary>
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (link.trim()) resolveLink(); }}>
          <label htmlFor="f-google-link" className="block text-sm font-semibold text-ink-800">{t.favorites.link.label}</label>
          <input id="f-google-link" type="url" inputMode="url" className={inputClass} value={link} maxLength={2048}
            placeholder={t.favorites.link.placeholder} onChange={(e) => setLink(e.target.value)} />
          <Button type="submit" variant="secondary" size="sm" disabled={!link.trim() || resolving}>
            {resolving && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {t.favorites.link.resolve}
          </Button>
          {linkError && <Alert tone="error">{linkError}</Alert>}
        </form>
      </details>

      {candidate && <CandidateForm key={`${candidate.lat},${candidate.lng},${candidate.name}`} candidate={candidate} onSaved={onSaved} />}
    </section>
  );
}

function CandidateForm({ candidate, onSaved }: { candidate: Candidate; onSaved: Props["onSaved"] }) {
  const [name, setName] = useState(candidate.name);
  const [listType, setListType] = useState<ListType>("favorite");
  const [category, setCategory] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function save() {
    setError(null);
    startSave(async () => {
      const r = await savePlaces({
        source: candidate.source,
        items: [{
          name: name.trim(), lat: candidate.lat, lng: candidate.lng, address: candidate.address, notes: notes.trim() || null,
          category: (category || null) as never, listType, osmRef: candidate.osmRef, sourceRef: candidate.sourceRef,
        }],
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      const res = r.results[0];
      if (res?.status === "duplicate") onSaved(res.id ?? null, t.favorites.alreadySaved);
      else if (res?.status === "imported") onSaved(res.id ?? null, listType === "favorite" ? t.favorites.added : t.favorites.addedWantToGo);
      else setError(t.favorites.errors.invalid);
    });
  }

  return (
    <form className="space-y-4 rounded-2xl border border-amber-400/60 bg-amber-50/40 p-4" onSubmit={(e) => { e.preventDefault(); save(); }}
      data-testid="candidate-form">
      {candidate.estimated && <Alert>{t.favorites.link.estimated}</Alert>}
      <p className="text-xs text-stone-600 tabular-nums">{candidate.lat.toFixed(5)}, {candidate.lng.toFixed(5)}{candidate.address ? ` · ${candidate.address}` : ""}</p>
      <div className="space-y-1.5">
        <label htmlFor="f-fav-name" className="block text-sm font-semibold text-ink-800">{t.favorites.name}</label>
        <input id="f-fav-name" className={inputClass} value={name} maxLength={200} required onChange={(e) => setName(e.target.value)} />
      </div>
      <ListTypeToggle value={listType} onChange={setListType} />
      <div className="space-y-1.5">
        <label htmlFor="f-fav-category" className="block text-sm font-semibold text-ink-800">{t.favorites.category}</label>
        <select id="f-fav-category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t.favorites.autoCategory}</option>
          {FAVORITE_CATEGORIES.map((c) => <option key={c} value={c}>{t.favorites.categories[c]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="f-fav-notes" className="block text-sm font-semibold text-ink-800">{t.favorites.notes}</label>
        <textarea id="f-fav-notes" rows={2} maxLength={5000} value={notes} placeholder={t.favorites.notesPlaceholder}
          onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, "h-auto py-2")} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" variant="accent" className="w-full" disabled={saving || !name.trim()}>
        {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {t.favorites.save}
      </Button>
    </form>
  );
}

export function ListTypeToggle({ value, onChange }: { value: ListType; onChange: (v: ListType) => void }) {
  const name = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 block text-sm font-semibold text-ink-800">{t.favorites.listType}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["favorite", "want_to_go"] as const).map((v) => (
          <label key={v} className={cn(
            "relative flex h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-amber-400/25",
            value === v ? "border-ink-900 bg-ink-900 text-paper" : "border-sand-300 bg-white text-ink-900",
          )}>
            <input type="radio" className="sr-only" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            {t.favorites.lists[v]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export const candidateFromPoint = (p: LatLng): Candidate => ({
  name: t.favorites.pickedPoint, lat: p.lat, lng: p.lng, address: null, osmRef: null, source: "manual", sourceRef: null, estimated: false,
});
