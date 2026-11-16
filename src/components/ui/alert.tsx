import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  error: { cls: "border-danger/25 bg-danger/5 text-danger", Icon: CircleAlert },
  success: { cls: "border-success/25 bg-success/5 text-success", Icon: CircleCheck },
  info: { cls: "border-sand-300 bg-sand-100/70 text-ink-700", Icon: Info },
} as const;

export function Alert({ tone = "info", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  const { cls, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
