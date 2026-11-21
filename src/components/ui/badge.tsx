import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "danger";
// Renkler globals.css'teki .badge-* bileşen sınıflarındadır: className ile verilen renkler her zaman kazanır.
const tones: Record<Tone, string> = {
  neutral: "badge-neutral",
  accent: "badge-accent",
  success: "badge-success",
  danger: "badge-danger",
};

export function Badge({ children, className, tone = "neutral" }: { children: ReactNode; className?: string; tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide", tones[tone], className)}>
      {children}
    </span>
  );
}
