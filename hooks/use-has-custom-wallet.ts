"use client";

import { useSyncExternalStore } from "react";
import {
  hasCustomWallet,
  subscribeActiveWalletKind,
  walletSwitchEnabled,
} from "@/lib/signer/preference";

/** This account has a new wallet, as far as this device knows. Never true while the switch is off. */
export function useHasCustomWallet(uid: string | null): boolean {
  return useSyncExternalStore(
    subscribeActiveWalletKind,
    () => walletSwitchEnabled() && hasCustomWallet(uid),
    () => false
  );
}
