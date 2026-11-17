"use client";
import { Check, Copy, ExternalLink, Eye, Globe, Link2, Lock, RefreshCw, Share } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveShareSettings, type ShareResult } from "@/lib/actions/share";
import { PRIVACY_RADII, SHARE_OPTION_KEYS, SHARE_VISIBILITIES, type ShareKind, type ShareOptionKey, type ShareOptions, type ShareVisibility } from "@/lib/share/types";
import { radiusLabel } from "@/lib/share/view";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const S = t.share;
type Loaded = Extract<ShareResult, { ok: true }>;
const ICONS = { private: Lock, link: Link2, public: Globe } as const;

export function ShareForm({ kind, targetId, initial, busy, onSaved }: {
  kind: ShareKind; targetId: string; initial: Loaded; busy?: boolean; onSaved: (r: Loaded) => void;
}) {
  const [result, setResult] = useState(initial);
  const [visibility, setVisibility] = useState<ShareVisibility>(initial.state.visibility);
  const [options, setOptions] = useState<ShareOptions>(initial.state.options);
  const [radius, setRadius] = useState(initial.state.privacyRadiusM);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const hydrated = useHydrated();
  const canNativeShare = hydrated && typeof navigator !== "undefined" && typeof navigator.share === "function";

  const keys = SHARE_OPTION_KEYS.filter((k) => !(kind === "travelogue" && k === "travelogue"));
  const dirty = visibility !== result.state.visibility || radius !== result.state.privacyRadiusM
    || (visibility !== "private" && keys.some((k) => options[k] !== result.state.options[k]));
  const disabled = pending || busy;

  const save = (rotate = false) => {
    setMessage(null);
    start(async () => {
      const r = await saveShareSettings({ kind, id: targetId, visibility, options, privacyRadiusM: radius, rotate });
      if (!r.ok) {
        setMessage({ tone: "error", text: r.message });
        return;
      }
      setResult(r);
      setConfirmRotate(false);
      setMessage({ tone: "success", text: rotate ? S.rotated : S.saved });
      onSaved(r);
    });
  };

  const copy = async () => {
    if (!result.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ tone: "error", text: S.errors.copyFailed });
    }
  };

  const nativeShare = async () => {
    if (!result.url) return;
    try {
      await navigator.share({ title: result.preview[0] ?? t.brand.name, url: result.url });
    } catch {
      // Kullanıcı vazgeçti
    }
  };

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(false); }} data-testid="share-form">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold">{S.visibilityLegend}</legend>
        {SHARE_VISIBILITIES.map((v) => {
          const Icon = ICONS[v];
          return (
            <label key={v} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
              visibility === v ? "border-ink-900 bg-white" : "border-sand-200 hover:border-stone-400")}>
              <input type="radio" name="visibility" value={v} checked={visibility === v} onChange={() => setVisibility(v)}
                className="mt-1 accent-ink-900" data-testid={`share-visibility-${v}`} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-semibold"><Icon className="size-4" aria-hidden /> {S.visibility[v].label}</span>
                <span className="block text-sm text-stone-600">{S.visibility[v].body}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {visibility !== "private" && (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">{S.contentLegend}</legend>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {keys.map((k: ShareOptionKey) => (
                <label key={k} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={options[k]} onChange={(e) => setOptions({ ...options, [k]: e.target.checked })}
                    className="mt-0.5 size-4 accent-ink-900" data-testid={`share-option-${k}`} />
                  <span>
                    {S.options[k]}
                    {k in S.optionHints && <span className="block text-xs text-stone-500">{S.optionHints[k as keyof typeof S.optionHints]}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1">
            <label htmlFor={`share-radius-${targetId}`} className="text-sm font-bold">{S.radiusLabel}</label>
            <select id={`share-radius-${targetId}`} value={radius} onChange={(e) => setRadius(Number(e.target.value))}
              disabled={options.endpoints} data-testid="share-radius"
              className="block h-10 w-full rounded-xl border border-sand-300 bg-white px-3 text-sm disabled:opacity-50">
              {PRIVACY_RADII.map((m) => <option key={m} value={m}>{radiusLabel(m)}</option>)}
            </select>
            <p className="text-xs text-stone-500">{S.radiusHint}</p>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={disabled || !dirty} data-testid="share-save">
          {pending ? S.saving : S.save}
        </Button>
        {dirty && <span className="text-xs text-amber-700" data-testid="share-dirty">{S.unsaved}</span>}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section className="rounded-xl border border-sand-200 bg-sand-100/50 p-3" aria-labelledby="share-preview-title" data-testid="share-preview">
        <h3 id="share-preview-title" className="flex items-center gap-1.5 text-sm font-bold"><Eye className="size-4" aria-hidden /> {S.previewTitle}</h3>
        {result.state.visibility === "private" ? (
          <p className="mt-1 text-sm text-stone-600">{visibility === "private" ? S.previewNothing : S.previewAfterSave}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {result.preview.map((item) => (
              <li key={item} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {item}</li>
            ))}
          </ul>
        )}
      </section>

      {result.url && result.state.visibility !== "private" && (
        <section className="space-y-3" aria-label={S.linkLabel}>
          <label className="block space-y-1">
            <span className="text-sm font-bold">{S.linkLabel}</span>
            <input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} data-testid="share-url"
              className="block h-10 w-full rounded-xl border border-sand-300 bg-white px-3 font-mono text-xs" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="primary" onClick={copy} data-testid="share-copy">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? S.copied : S.copy}
            </Button>
            <a href={result.url} target="_blank" rel="noopener noreferrer" data-testid="share-open"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-sand-300 bg-paper-50 px-4 text-sm font-semibold hover:border-stone-500">
              <ExternalLink className="size-4" aria-hidden /> {S.open}
            </a>
            {canNativeShare && (
              <Button type="button" size="sm" variant="secondary" onClick={nativeShare}>
                <Share className="size-4" aria-hidden /> {S.nativeShare}
              </Button>
            )}
          </div>
          {confirmRotate ? (
            <div className="space-y-2 rounded-xl border border-danger/30 bg-danger/5 p-3" role="alertdialog" aria-label={S.rotate}>
              <p className="text-sm">{S.rotateConfirm}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRotate(false)} disabled={disabled}>{t.common.cancel}</Button>
                <Button type="button" size="sm" variant="danger" onClick={() => save(true)} disabled={disabled} data-testid="share-rotate-confirm">{S.rotateYes}</Button>
              </div>
            </div>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRotate(true)} disabled={disabled} data-testid="share-rotate">
              <RefreshCw className="size-4" aria-hidden /> {S.rotate}
            </Button>
          )}
        </section>
      )}
    </form>
  );
}
