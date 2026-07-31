"use client";

import { AsyncError, AsyncEmpty, AsyncLoading } from "@/components/dashboard/async-state";

// These moved to components/dashboard/async-state once earn needed the same
// three surfaces. The casino names stay here so its screens read as before,
// and CasinoError keeps the casino's own wording for a service that is not
// switched on yet.

export const CasinoLoading = AsyncLoading;
export const CasinoEmpty = AsyncEmpty;

export function CasinoError({
  error,
  subject,
  onRetry,
}: {
  error: unknown;
  subject: string;
  onRetry?: () => void;
}) {
  return (
    <AsyncError
      error={error}
      subject={subject}
      unconfiguredDetail="This game goes live once the casino service is switched on."
      onRetry={onRetry}
    />
  );
}
