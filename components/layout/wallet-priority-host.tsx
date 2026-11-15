"use client";

import { useEffect } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getCustomWalletSession } from "@/lib/signer/session";
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
  return null;
}
