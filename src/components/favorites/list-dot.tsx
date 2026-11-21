import type { ListType } from "@/lib/favorites/types";
import { cn } from "@/lib/cn";

/** Liste işareti: favoriler amber dolgu, "daha sonra gideceğim" ön plan halkası (iki temada da görünür). */
export function ListDot({ list, small, className }: { list: ListType; small?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn(small ? "size-2.5" : "size-3", "shrink-0 rounded-full",
      list === "want_to_go" ? "border-2 border-fg bg-surface" : "bg-accent shadow-[0_0_10px_rgb(232_145_45/0.55)]", className)} />
  );
}
