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

/** Read literally so Next inlines it at build time. */
export const walletSwitchEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_WALLET_SWITCH_ENABLED?.trim().toLowerCase() === "true";

export function getActiveWalletKind(uid: string | null): ActiveWalletKind {
  if (!walletSwitchEnabled() || !uid || typeof window === "undefined") return "decane";
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
        name?.startsWith("ark:active-wallet:") &&
        window.localStorage.getItem(name) === "custom"
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
