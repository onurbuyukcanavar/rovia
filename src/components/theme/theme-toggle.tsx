"use client";
import { Moon, Sun } from "lucide-react";
import { chooseTheme } from "./choose-theme";
import { t } from "@/i18n";
import { useResolvedTheme } from "./use-theme";

const T = t.theme.toggle;

/**
 * Kenar menüsündeki hızlı tema düğmesi: tek dokunuşla Koyu ↔ Aydınlık. "Sistem" ve ayrıntılı seçim
 * Ayarlar → Görünüm'de kalır; bu düğmeye basmak tercihi açık bir temaya sabitler.
 */
export function ThemeToggle() {
  const resolved = useResolvedTheme();
  const toLight = resolved === "dark";
  const label = toLight ? T.toLight : T.toDark;
  return (
    <button type="button" onClick={() => chooseTheme(toLight ? "light" : "dark")}
      aria-label={label} title={label} data-testid="theme-toggle"
      className="group grid size-9 shrink-0 place-items-center rounded-full border border-line bg-sunken text-fg-muted transition-colors hover:border-line-strong hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      {toLight
        ? <Sun className="size-4 transition-transform duration-300 group-hover:rotate-45 motion-reduce:transition-none" aria-hidden />
        : <Moon className="size-4 transition-transform duration-300 group-hover:-rotate-12 motion-reduce:transition-none" aria-hidden />}
    </button>
  );
}
