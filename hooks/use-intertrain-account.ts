"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getCustomWalletSession, subscribeCustomWalletSession } from "@/lib/signer/session";
import { getUnlockedKey, peekUnlocked, subscribeUnlocked } from "@/lib/wallet-core/unlock-state";

/**
 * The new wallet's Intertrain address (wsk1…), if there is a new wallet.
 *
 * It is derived from the wallet's own seed, so it can only be worked out while the wallet is
 * unlocked. The address is public, so once known it is remembered on this device and shown
 * while locked too. Unlike the EVM and Solana accounts it is not stored with the wallet
 * service. The wallet code loads on demand, so a page that never needs it carries none of it.
 */

const storageKey = (uid: string, walletId: string) => `tsion.intertrain.v1.${uid}.${walletId}`;

function recall(uid: string, walletId: string): string | null {
  try {
    const value = window.localStorage.getItem(storageKey(uid, walletId));
    return value && /^wsk1[0-9a-z]{30,60}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function remember(uid: string, walletId: string, address: string): void {
  try {
    window.localStorage.setItem(storageKey(uid, walletId), address);
  } catch {
    // Private mode or a full quota: it is derived again on the next unlock.
  }
}

export interface IntertrainAccount {
  /** The wsk1… address, or null until the wallet has been unlocked once on this device. */
  address: string | null;
  /** There is a new wallet for this account. */
  hasWallet: boolean;
  /** The wallet is unlocked right now. */
  unlocked: boolean;
}

export function useIntertrainAccount(): IntertrainAccount {
  const session = useSyncExternalStore(
    subscribeCustomWalletSession,
    getCustomWalletSession,
    () => null
  );
  const unlocked = useSyncExternalStore(
    subscribeUnlocked,
    () => (session ? peekUnlocked(session.uid, session.pkg.walletId) : false),
    () => false
  );
  const [derived, setDerived] = useState<{ walletId: string; address: string } | null>(null);

  const walletId = session?.pkg.walletId ?? null;
  const remembered = session && walletId ? recall(session.uid, walletId) : null;
  const known = remembered ?? (derived && derived.walletId === walletId ? derived.address : null);

  useEffect(() => {
    if (!session || !walletId || !unlocked || known) return;
    let live = true;
    void (async () => {
      const dek = getUnlockedKey(session.uid, walletId);
      if (!dek) return;
      const { withIntertrainKey } = await import("@/lib/wallet-core/intertrain");
      const address = await withIntertrainKey(session.pkg, dek, (key) => key.address);
      if (!live) return;
      remember(session.uid, walletId, address);
      setDerived({ walletId, address });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [session, walletId, unlocked, known]);

  return { address: known, hasWallet: session !== null, unlocked };
}
