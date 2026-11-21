"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardPaste, Crosshair, LocateFixed, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Dispatch } from "react";
import type { LatLng } from "@/lib/geo";
import { MAX_WAYPOINTS, newKey, type ExplorerAction, type ExplorerState, type SlotRef } from "@/lib/maps/explorer-state";
import { PlaceSearch } from "./place-search";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

type Props = {
  /** Numaralı üst başlık sırası */
  index?: number;
  state: ExplorerState;
  dispatch: Dispatch<ExplorerAction>;
  bias?: LatLng;
  picking: SlotRef | null;
  onPick: (slot: SlotRef | null) => void;
  onLocate: () => void;
  locating: boolean;
};

const sameSlot = (a: SlotRef | null, b: SlotRef) =>
  !!a && a.kind === b.kind && (a.kind !== "waypoint" || (b.kind === "waypoint" && a.key === b.key));

function IconButton({ label, onClick, active, disabled, children }: {
  label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted transition hover:bg-fg/[0.07] hover:text-fg disabled:opacity-35",
        active && "bg-accent-soft text-accent-ink ring-1 ring-accent/40",
      )}>
      {children}
    </button>
  );
}

const Dot = ({ className }: { className: string }) => <span className={cn("block size-3 rounded-full border-2", className)} />;

export function RouteBuilder({ index, state, dispatch, bias, picking, onPick, onLocate, locating }: Props) {
  const pickButton = (slot: SlotRef) => (
    <IconButton label={sameSlot(picking, slot) ? t.maps.cancelPick : t.maps.pickOnMap}
      active={sameSlot(picking, slot)} onClick={() => onPick(sameSlot(picking, slot) ? null : slot)}>
      <Crosshair className="size-4" />
    </IconButton>
  );

  return (
    <section aria-label={t.maps.route} className="space-y-2">
      <SectionEyebrow index={index} className="mb-3">{t.maps.route}</SectionEyebrow>
      <PlaceSearch
        label={t.maps.origin}
        value={state.origin.stop}
        bias={bias}
        onSelect={(stop) => dispatch({ type: "set", slot: { kind: "origin" }, stop })}
        marker={<Dot className="border-surface bg-fg ring-2 ring-fg" />}
        actions={
          <>
            <IconButton label={t.maps.myLocation} onClick={onLocate} disabled={locating}>
              <LocateFixed className={cn("size-4", locating && "animate-pulse")} />
            </IconButton>
            {pickButton({ kind: "origin" })}
          </>
        }
      />

      {state.waypoints.map((w, i) => (
        <PlaceSearch
          key={w.key}
          label={t.maps.waypoint(i + 1)}
          value={w.stop}
          bias={bias}
          autoFocus={!w.stop}
          onSelect={(stop) => dispatch({ type: "set", slot: { kind: "waypoint", key: w.key }, stop })}
          marker={<span className="text-[0.7rem] font-extrabold text-fg">{i + 1}</span>}
          actions={
            <>
              <IconButton label={t.maps.moveUp} disabled={i === 0} onClick={() => dispatch({ type: "moveWaypoint", key: w.key, delta: -1 })}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton label={t.maps.moveDown} disabled={i === state.waypoints.length - 1}
                onClick={() => dispatch({ type: "moveWaypoint", key: w.key, delta: 1 })}>
                <ArrowDown className="size-4" />
              </IconButton>
              {pickButton({ kind: "waypoint", key: w.key })}
              <IconButton label={t.maps.removeStop} onClick={() => dispatch({ type: "removeWaypoint", key: w.key })}>
                <Trash2 className="size-4" />
              </IconButton>
            </>
          }
        />
      ))}

      <PlaceSearch
        label={t.maps.destination}
        value={state.destination.stop}
        bias={bias}
        onSelect={(stop) => dispatch({ type: "set", slot: { kind: "destination" }, stop })}
        marker={<Dot className="border-fg bg-accent" />}
        actions={
          <>
            <IconButton label={t.maps.swap} onClick={() => dispatch({ type: "swapEnds" })}
              disabled={!state.origin.stop && !state.destination.stop}>
              <ArrowUpDown className="size-4" />
            </IconButton>
            {pickButton({ kind: "destination" })}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 pl-8">
        <button
          type="button"
          onClick={() => dispatch({ type: "addWaypoint", key: newKey() })}
          disabled={state.waypoints.length >= MAX_WAYPOINTS}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-accent-ink hover:bg-accent-soft disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden /> {t.maps.addStop}
        </button>
        <Link href="/konum" title={t.sharedLocation.entryHint} data-testid="open-shared-location"
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-fg-muted hover:bg-fg/[0.05] hover:text-fg">
          <ClipboardPaste className="size-4" aria-hidden /> {t.sharedLocation.entry}
        </Link>
      </div>
      {state.waypoints.length >= MAX_WAYPOINTS && <p className="pl-8 text-xs text-danger">{t.maps.tooManyStops}</p>}
      {picking && (
        <p className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm font-semibold text-fg" role="status">
          {t.maps.pickingHint}
        </p>
      )}
    </section>
  );
}
