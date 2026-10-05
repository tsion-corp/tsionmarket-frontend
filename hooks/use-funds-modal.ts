"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useRequireSession } from "@/hooks/use-require-session";

// One deposit modal for the whole session, so any "not enough balance" can
// offer Add funds in place. The host in the session providers draws it.
let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function openFundsModal(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeFundsModal(): void {
  if (!open) return;
  open = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFundsModalOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false
  );
}

/** Opens the deposit modal, or asks for a sign-in first. */
export function useAddFunds(): () => void {
  const requireSession = useRequireSession();
  return useCallback(() => {
    if (requireSession("fund")) openFundsModal();
  }, [requireSession]);
}

/** An Add funds button for a toast that reports a short balance. */
export function useAddFundsAction(): { label: string; onClick: () => void } {
  const addFunds = useAddFunds();
  const t = useTranslations("balance");
  const label = t("addFunds");
  return useMemo(() => ({ label, onClick: addFunds }), [label, addFunds]);
}
