/**
 * Which wallet the app signs with: the Decane wallet (the default) or the
 * self-custody one. A per-account choice kept on this device, and honoured only
 * while the switch is built in (NEXT_PUBLIC_WALLET_SWITCH_ENABLED). With it off the
 * app is the Decane app, whatever a stored preference says.
 *
 * Small on purpose: this is imported on every route, so it holds no wallet code.
 */

export type ActiveWalletKind = "decane" | "custom";

const EVENT = "ark:active-wallet-changed";
const keyFor = (uid: string) => `ark:active-wallet:${uid}`;
// Set once an account is known to have a new wallet. From then on the new wallet is the one the
// app uses: it always comes before the Decane wallet, which stays reachable as the Legacy Wallet.
const HAS_PREFIX = "ark:has-custom-wallet:";
const hasKeyFor = (uid: string) => `${HAS_PREFIX}${uid}`;

/** Read literally so Next inlines it at build time. */
export const walletSwitchEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_WALLET_SWITCH_ENABLED?.trim().toLowerCase() === "true";

/** Whether this account is known, on this device, to have a new wallet. */
export function hasCustomWallet(uid: string | null): boolean {
  if (!uid || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(hasKeyFor(uid)) === "1";
  } catch {
    return false;
  }
}

/** Remember that this account has a new wallet, which makes it the wallet the app uses. */
export function markHasCustomWallet(uid: string): void {
  if (typeof window === "undefined" || hasCustomWallet(uid)) return;
  try {
    window.localStorage.setItem(hasKeyFor(uid), "1");
  } catch {
    // Storage blocked: it is learned again on the next visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function getActiveWalletKind(uid: string | null): ActiveWalletKind {
  if (!walletSwitchEnabled() || !uid || typeof window === "undefined") return "decane";
  // The new wallet always comes first once there is one. An older "use the old wallet" choice
  // no longer outranks it: the old wallet is the Legacy Wallet, a place to move funds out of.
  if (hasCustomWallet(uid)) return "custom";
  try {
    return window.localStorage.getItem(keyFor(uid)) === "custom" ? "custom" : "decane";
  } catch {
    return "decane";
  }
}

/**
 * The choice for someone who is signed in but whose account id is not known yet (the
 * token is read a render later). If ANY account on this device chose the new wallet,
 * treat it as chosen until the id arrives: showing the wrong wallet for one render
 * is the mistake to avoid, and waiting costs nothing.
 */
export function getActiveWalletKindWhileIdUnknown(): ActiveWalletKind {
  if (!walletSwitchEnabled() || typeof window === "undefined") return "decane";
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const name = window.localStorage.key(i);
      if (
        (name?.startsWith("ark:active-wallet:") &&
          window.localStorage.getItem(name) === "custom") ||
        (name?.startsWith(HAS_PREFIX) && window.localStorage.getItem(name) === "1")
      ) {
        return "custom";
      }
    }
  } catch {
    // Storage blocked: no choice can have been kept.
  }
  return "decane";
}

export function setActiveWalletKind(uid: string, kind: ActiveWalletKind): void {
  if (typeof window === "undefined") return;
  try {
    if (kind === "custom") window.localStorage.setItem(keyFor(uid), "custom");
    else window.localStorage.removeItem(keyFor(uid));
  } catch {
    // Storage blocked: the choice cannot be kept, so the app stays on Decane.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeActiveWalletKind(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
