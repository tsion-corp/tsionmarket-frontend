"use client";

import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openArkIdDialog() {
  if (open) return;
  open = true;
  emit();
}

export function closeArkIdDialog() {
  if (!open) return;
  open = false;
  emit();
}

export function useArkIdDialogOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false
  );
}
