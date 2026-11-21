"use client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div data-themed className="mx-auto max-w-lg space-y-4 px-6 py-16">
      <Alert tone="error">{t.common.unexpectedError}</Alert>
      <Button variant="secondary" onClick={reset}>Tekrar dene</Button>
    </div>
  );
}
