import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-sand-100 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-stone-600", className)}>
      {children}
    </span>
  );
}
