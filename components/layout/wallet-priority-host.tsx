"use client";

import { useEffect } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getCustomWalletSession } from "@/lib/signer/session";
import { touchUnlocked } from "@/lib/wallet-core/unlock-state";
import { hasCustomWallet, markHasCustomWallet, walletSwitchEnabled } from "@/lib/signer/preference";

/**
 * On sign-in, learn whether this account has a new wallet, so the app can put it first from
 * the first screen on a new device. One small read of the encrypted package (ciphertext only);
 * nothing here unlocks or signs. Renders nothing.
 */
export function WalletPriorityHost() {
  const { authenticated, userId } = useAuthSession();
  useEffect(() => {
    if (!walletSwitchEnabled() || !authenticated || !userId || hasCustomWallet(userId)) return;
    let live = true;
    void (async () => {
      const { bootstrapCustomWalletSession } = await import("@/lib/signer/app-signer");
      await bootstrapCustomWalletSession(userId);
      if (live && getCustomWalletSession()?.uid === userId) markHasCustomWallet(userId);
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [authenticated, userId]);

  // Using the app keeps an unlocked wallet unlocked. Real interaction only (a tap, a key, a
  // scroll), throttled, and only while the tab is visible: a tab left open and untouched still
  // runs out its idle time and locks.
  useEffect(() => {
    if (!walletSwitchEnabled() || !userId) return;
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 15_000 || document.visibilityState !== "visible") return;
      last = now;
      const session = getCustomWalletSession();
      if (session && session.uid === userId) touchUnlocked(userId, session.pkg.walletId);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, onActivity, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, onActivity);
    };
  }, [userId]);
  return null;
}
