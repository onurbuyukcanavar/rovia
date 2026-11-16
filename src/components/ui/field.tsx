import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Field({
  label, name, error, hint, className, ...props
}: ComponentProps<"input"> & { label: string; name: string; error?: string; hint?: string }) {
  const id = props.id ?? `f-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-12 w-full rounded-xl border bg-white px-4 text-[0.95rem] text-ink-900 transition outline-none placeholder:text-stone-500",
          "focus:border-ink-700 focus:ring-4 focus:ring-amber-400/25",
          error ? "border-danger/60" : "border-sand-300",
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-stone-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
