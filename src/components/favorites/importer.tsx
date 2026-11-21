"use client";
import { ArrowLeft, CircleCheck, CircleHelp, ExternalLink, FileUp, LoaderCircle, MapPinOff, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { matchPlaceNames, savePlaces, type NameMatch } from "@/lib/actions/favorites";
import { ImportError, parseImportFile, type ImportSource, type ParsedFile, type ParsedPlace } from "@/lib/import/parsers";
import type { PlaceInput } from "@/lib/favorites/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

type Row = {
  key: number;
  file: number;
  place: ParsedPlace;
  match: NameMatch | null;
  status: "ok" | "estimated" | "missing";
};

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "matching" }
  | { kind: "preview" }
  | { kind: "importing"; done: number; total: number }
  | { kind: "done"; imported: number; duplicates: number; invalid: number; failed: string | null };

const MATCH_CHUNK = 200;
const SAVE_CHUNK = 500;
const ROW_RENDER_LIMIT = 1000;

export function Importer() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState(false);

  const stats = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((r) => r.status !== "missing").length,
    missing: rows.filter((r) => r.status === "missing").length,
  }), [rows]);

  function reset() {
    setPhase({ kind: "idle" });
    setError(null);
    setFiles([]);
    setRows([]);
    setSelected(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  async function readFile(file: File) {
    setError(null);
    setPhase({ kind: "reading" });
    let parsed: ParsedFile[];
    try {
      // Dosya tarayıcıda okunur; sunucuya yalnızca seçilen yerlerin alanları gider
      const buf = new Uint8Array(await file.arrayBuffer());
      parsed = parseImportFile(file.name, buf);
    } catch (e) {
      const code = e instanceof ImportError ? e.code : "invalid";
      setError(t.importer.errors[code] ?? t.importer.errors.invalid);
      setPhase({ kind: "idle" });
      return;
    }

    let key = 0;
    const next: Row[] = parsed.flatMap((f, fi) =>
      f.places.map((p) => ({
        key: key++, file: fi, place: p, match: null,
        status: p.lat !== null && p.lng !== null ? ("ok" as const) : ("missing" as const),
      })),
    );

    // Koordinatsız yerler (Takeout liste .csv'leri) için ROVIA'nın OSM verisinde ad eşleştirmesi
    const missing = next.filter((r) => r.status === "missing");
    if (missing.length) {
      setPhase({ kind: "matching" });
      for (let i = 0; i < missing.length; i += MATCH_CHUNK) {
        const chunk = missing.slice(i, i + MATCH_CHUNK);
        const r = await matchPlaceNames(chunk.map((x) => x.place.name));
        if (!r.ok) {
          setError(r.message);
          break;
        }
        for (const m of r.matches) {
          const row = chunk[m.i];
          if (row) {
            row.match = m;
            row.status = "estimated";
          }
        }
      }
    }

    setFiles(parsed);
    setRows(next);
    // Kesin konumlular varsayılan seçili; tahminîler kullanıcı kontrol etsin diye seçilmez
    setSelected(new Set(next.filter((r) => r.status === "ok").map((r) => r.key)));
    setPhase({ kind: "preview" });
  }

  function toggle(key: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  async function runImport() {
    const chosen = rows.filter((r) => selected.has(r.key) && r.status !== "missing");
    if (!chosen.length) return;
    setError(null);
    let imported = 0, duplicates = 0, invalid = 0, done = 0;
    let failed: string | null = null;
    setPhase({ kind: "importing", done, total: chosen.length });

    // Kaynak dosya başına gönderilir (içe aktarma kaydı dosya adıyla tutulur)
    const byFile = new Map<number, Row[]>();
    for (const r of chosen) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);

    outer: for (const [fi, group] of byFile) {
      const file = files[fi];
      for (let i = 0; i < group.length; i += SAVE_CHUNK) {
        const items: PlaceInput[] = group.slice(i, i + SAVE_CHUNK).map((r) => toInput(r));
        const res = await savePlaces({ source: file.source satisfies ImportSource, fileName: file.fileName.slice(0, 255), items });
        if (!res.ok) {
          failed = res.message;
          break outer;
        }
        imported += res.imported;
        duplicates += res.duplicates;
        invalid += res.invalid;
        done += items.length;
        setPhase({ kind: "importing", done, total: chosen.length });
      }
    }
    setPhase({ kind: "done", imported, duplicates, invalid, failed });
  }

  return (
    <div data-themed className="page-backdrop min-h-full">
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <div className="space-y-6">
        <Link href="/favoriler" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-muted transition-colors hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> {t.favorites.title}
        </Link>
        <PageHeader eyebrow={t.favorites.import} index={1} title={t.importer.title} accent={t.importer.accent} description={t.importer.subtitle} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {(phase.kind === "idle" || phase.kind === "reading" || phase.kind === "matching") && (
        <>
          <label
            htmlFor={inputId}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f && phase.kind === "idle") void readFile(f);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-raised hover:border-accent/50",
            )}
            data-testid="import-drop"
          >
            <span className="grid size-14 place-items-center rounded-2xl border border-line bg-raised text-accent-ink">
              {phase.kind === "idle" ? <FileUp className="size-7" aria-hidden /> : <LoaderCircle className="size-7 animate-spin" aria-hidden />}
            </span>
            <span className="text-lg font-light tracking-tight text-fg">
              {phase.kind === "reading" ? t.importer.reading : phase.kind === "matching" ? t.importer.matching : t.importer.drop}
            </span>
            <span className="text-xs text-fg-subtle">{t.importer.formats}</span>
            <input id={inputId} ref={inputRef} type="file" className="sr-only" disabled={phase.kind !== "idle"}
              accept=".zip,.json,.geojson,.csv,.kml,.kmz,.gpx,application/zip,application/json,text/csv,application/vnd.google-earth.kml+xml,application/gpx+xml"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} data-testid="import-input" />
          </label>
          <p className="flex items-start gap-2 text-sm text-fg-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {t.importer.privacy}
          </p>
          <TakeoutHelp />
        </>
      )}

      {phase.kind === "preview" && (
        <section className="space-y-4" aria-labelledby="preview-title" data-testid="import-preview">
          <div className="space-y-1">
            <h2 id="preview-title" className="text-xl font-light tracking-tight text-fg">{t.importer.summary(stats.total, stats.ready)}</h2>
            <p className="text-sm break-words text-fg-muted">{t.importer.fileCount(files.length)} · {files.map((f) => f.fileName).join(", ")}</p>
          </div>
          {stats.missing > 0 && (
            <Alert>
              <strong>{t.importer.needsLocation(stats.missing)}.</strong> {t.importer.noLocationNote}
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary"
              onClick={() => setSelected(new Set(rows.filter((r) => r.status !== "missing").map((r) => r.key)))}>{t.importer.selectAll}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t.importer.selectNone}</Button>
            <span className="flex-1" />
            <Button type="button" variant="ghost" size="sm" onClick={reset}>{t.common.cancel}</Button>
            <Button type="button" variant="accent" onClick={runImport} disabled={selected.size === 0} data-testid="import-run">
              {t.importer.importN(selected.size)}
            </Button>
          </div>
          <ul className="card divide-y divide-line overflow-hidden" data-testid="import-rows">
            {rows.slice(0, ROW_RENDER_LIMIT).map((r) => (
              <li key={r.key}>
                <label className={cn("flex min-w-0 items-start gap-3 px-4 py-3", r.status === "missing" ? "opacity-60" : "cursor-pointer hover:bg-fg/[0.04]")}>
                  <input type="checkbox" className="mt-1 size-4 shrink-0 accent-accent" checked={selected.has(r.key)} disabled={r.status === "missing"}
                    onChange={() => toggle(r.key)} aria-label={r.place.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{r.place.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
                      <StatusLabel row={r} />
                      {r.place.listName && <span>· {r.place.listName}</span>}
                    </span>
                  </span>
                  <Badge tone={r.place.listType === "want_to_go" ? "neutral" : "accent"} className="shrink-0">
                    {t.favorites.lists[r.place.listType ?? "favorite"]}
                  </Badge>
                </label>
              </li>
            ))}
          </ul>
          {rows.length > ROW_RENDER_LIMIT && <p className="text-xs text-fg-subtle">{t.importer.moreRows(rows.length - ROW_RENDER_LIMIT)}</p>}
        </section>
      )}

      {phase.kind === "importing" && (
        <div className="card space-y-3 p-6" role="status">
          <p className="flex items-center gap-2 font-semibold text-fg"><LoaderCircle className="size-5 animate-spin text-accent-ink" aria-hidden /> {t.importer.importing(phase.done, phase.total)}</p>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round((phase.done / Math.max(1, phase.total)) * 100)}%` }} />
          </div>
        </div>
      )}

      {phase.kind === "done" && (
        <section className="card space-y-4 p-6" data-testid="import-result">
          {phase.failed && <Alert tone="error">{phase.failed}</Alert>}
          <p className="flex items-start gap-2 text-xl font-light tracking-tight text-fg"><CircleCheck className="mt-1 size-5 shrink-0 text-success" aria-hidden /> {t.importer.result(phase.imported, phase.duplicates)}</p>
          {phase.invalid > 0 && <p className="text-sm text-fg-muted">{t.importer.invalidSkipped(phase.invalid)}</p>}
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/favoriler" variant="primary">{t.importer.goFavorites}</ButtonLink>
            <Button type="button" variant="secondary" onClick={reset}>{t.importer.another}</Button>
          </div>
        </section>
      )}
    </div>
    </div>
  );
}

function toInput(r: Row): PlaceInput {
  const p = r.place;
  const base = {
    name: p.name.slice(0, 200), address: p.address ?? null, notes: p.notes ?? null,
    listType: p.listType ?? "favorite", sourceRef: p.sourceRef?.slice(0, 1024) ?? null, listName: p.listName ?? null,
  };
  if (r.status === "estimated" && r.match) {
    return { ...base, lat: r.match.lat, lng: r.match.lng, osmRef: r.match.osmRef, address: base.address ?? r.match.admin };
  }
  return { ...base, lat: p.lat!, lng: p.lng! };
}

function StatusLabel({ row }: { row: Row }) {
  if (row.status === "ok") return <span className="inline-flex items-center gap-1 text-success"><CircleCheck className="size-3.5" aria-hidden /> {t.importer.statusOk}</span>;
  if (row.status === "estimated" && row.match) {
    const where = [row.match.name, row.match.admin].filter(Boolean).join(", ");
    return <span className="inline-flex items-center gap-1 text-accent-ink"><CircleHelp className="size-3.5" aria-hidden /> {t.importer.statusEstimated(where)}</span>;
  }
  return <span className="inline-flex items-center gap-1 text-danger"><MapPinOff className="size-3.5" aria-hidden /> {t.importer.statusMissing}</span>;
}

function TakeoutHelp() {
  return (
    <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="takeout-help">
      <h2 id="takeout-help" className="text-lg font-semibold tracking-tight text-fg">{t.importer.howTitle}</h2>
      <p className="text-sm leading-relaxed text-fg-muted">{t.importer.howWhy}</p>
      <ol className="space-y-2.5 text-sm text-fg">
        {t.importer.steps.map((s, i) => (
          <li key={s} className="flex min-w-0 gap-3">
            <span aria-hidden className="mt-px grid size-6 shrink-0 place-items-center rounded-full border border-line text-[0.7rem] font-semibold text-accent-ink tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 break-words">{s}</span>
          </li>
        ))}
      </ol>
      <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-semibold text-accent-ink underline underline-offset-2">
        {t.importer.takeoutLink} <ExternalLink className="size-3.5" aria-hidden />
      </a>
    </section>
  );
}
