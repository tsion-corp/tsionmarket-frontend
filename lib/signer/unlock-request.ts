/**
 * Lets any screen ask the app to open the wallet's unlock sheet, without knowing where that
 * sheet lives. The locked-wallet banner (components/layout) listens and opens it.
 */
const listeners = new Set<() => void>();

export function requestWalletUnlock(): void {
  listeners.forEach((listener) => listener());
}

export function onWalletUnlockRequested(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
