"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, Crosshair, LocateFixed, Plus, Trash2 } from "lucide-react";
import type { Dispatch } from "react";
import type { LatLng } from "@/lib/geo";
import { MAX_WAYPOINTS, newKey, type ExplorerAction, type ExplorerState, type SlotRef } from "@/lib/maps/explorer-state";
import { PlaceSearch } from "./place-search";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

type Props = {
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
        "grid size-9 shrink-0 place-items-center rounded-lg text-stone-600 transition hover:bg-sand-100 hover:text-ink-900 disabled:opacity-35",
        active && "bg-amber-400/25 text-ink-900",
      )}>
      {children}
    </button>
  );
}

const Dot = ({ className }: { className: string }) => <span className={cn("block size-3 rounded-full border-2", className)} />;

export function RouteBuilder({ state, dispatch, bias, picking, onPick, onLocate, locating }: Props) {
  const pickButton = (slot: SlotRef) => (
    <IconButton label={sameSlot(picking, slot) ? t.maps.cancelPick : t.maps.pickOnMap}
      active={sameSlot(picking, slot)} onClick={() => onPick(sameSlot(picking, slot) ? null : slot)}>
      <Crosshair className="size-4" />
    </IconButton>
  );

  return (
    <section aria-label={t.maps.route} className="space-y-2">
      <PlaceSearch
        label={t.maps.origin}
        value={state.origin.stop}
        bias={bias}
        onSelect={(stop) => dispatch({ type: "set", slot: { kind: "origin" }, stop })}
        marker={<Dot className="border-paper bg-ink-900 ring-2 ring-ink-900" />}
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
          marker={<span className="text-[0.7rem] font-extrabold text-ink-800">{i + 1}</span>}
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
        marker={<Dot className="border-ink-900 bg-amber-500" />}
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
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-800 hover:bg-sand-100 disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden /> {t.maps.addStop}
        </button>
      </div>
      {state.waypoints.length >= MAX_WAYPOINTS && <p className="pl-8 text-xs text-danger">{t.maps.tooManyStops}</p>}
      {picking && (
        <p className="rounded-lg bg-amber-400/20 px-3 py-2 text-sm font-semibold text-ink-900" role="status">
          {t.maps.pickingHint}
        </p>
      )}
    </section>
  );
}
