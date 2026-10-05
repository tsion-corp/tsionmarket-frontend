"use client";

import { useSyncExternalStore } from "react";

// One sign-in modal for the whole app. Anything can open it from here; the
// host in the session providers draws it.
let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function openSignIn(): void {
  if (open) return;
  open = true;
  emit();
}

export function closeSignIn(): void {
  if (!open) return;
  open = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the sign-in modal is open. */
export function useSignInOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false
  );
}
