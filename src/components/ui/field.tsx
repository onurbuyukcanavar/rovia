import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Metin alanı, seçim kutusu ve çok satırlı alan için ortak görünüm. */
export function inputClass(error?: boolean, className?: string) {
  return cn(
    "w-full rounded-xl border bg-field text-[0.95rem] text-fg transition outline-none placeholder:text-fg-subtle",
    "focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60",
    error ? "border-danger/60" : "border-line-strong",
    className,
  );
}

export const labelClass = "block text-sm font-semibold text-fg";

function Help({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) return <p id={`${id}-error`} className="text-sm text-danger">{error}</p>;
  if (hint) return <p id={`${id}-hint`} className="text-xs text-fg-subtle">{hint}</p>;
  return null;
}

const describedBy = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function Field({
  label, name, error, hint, className, ...props
}: ComponentProps<"input"> & { label: string; name: string; error?: string; hint?: string }) {
  const id = props.id ?? `f-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)}
        className={inputClass(!!error, "h-12 px-4")} {...props} />
      <Help id={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  label, name, error, hint, className, selectClassName, children, ...props
}: ComponentProps<"select"> & { label: string; name: string; error?: string; hint?: ReactNode; selectClassName?: string }) {
  const id = props.id ?? `f-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)}
        className={inputClass(!!error, cn("h-12 px-3", selectClassName))} {...props}>
        {children}
      </select>
      <Help id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextareaField({
  label, name, error, hint, className, ...props
}: ComponentProps<"textarea"> & { label: string; name: string; error?: string; hint?: ReactNode }) {
  const id = props.id ?? `f-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <textarea id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)}
        className={inputClass(!!error, "min-h-28 px-4 py-3 leading-relaxed")} {...props} />
      <Help id={id} error={error} hint={hint} />
    </div>
  );
}
