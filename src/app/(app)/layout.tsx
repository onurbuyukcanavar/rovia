import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";

export default function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return <div className="mx-auto max-w-lg px-6 py-16"><SetupNotice /></div>;
  }
  return <AppShell>{children}</AppShell>;
}
