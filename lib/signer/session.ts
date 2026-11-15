import type { WalletPackage } from "@/lib/wallet-core/package";

/**
 * The self-custody wallet's encrypted package, once it has been loaded for this
 * account: what the signer derives keys from, together with the unlock state. It
 * holds ciphertext only, never a key. A tiny store so React can follow it.
 */

export interface CustomWalletSession {
  uid: string;
  pkg: WalletPackage;
}

let current: CustomWalletSession | null = null;
const listeners = new Set<() => void>();

export const getCustomWalletSession = (): CustomWalletSession | null => current;

export function setCustomWalletSession(session: CustomWalletSession | null): void {
  if (current === session) return;
  // The same version of the same wallet, fetched again: nothing changed, so tell no one.
  if (
    session &&
    current &&
    current.uid === session.uid &&
    current.pkg.walletId === session.pkg.walletId &&
    current.pkg.version === session.pkg.version
  ) {
    return;
  }
  current = session;
  listeners.forEach((listener) => listener());
}

export function subscribeCustomWalletSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
