"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSocialWallet } from "decane-connect-kit";
import { decodeDecaneUserId } from "@/lib/decane-user-id";
import { PENDING_SIGNER } from "@/lib/signer/pending-signer";
import {
  getActiveWalletKind,
  getActiveWalletKindWhileIdUnknown,
  subscribeActiveWalletKind,
  walletSwitchEnabled,
  type ActiveWalletKind,
} from "@/lib/signer/preference";
import { getCustomWalletSession, subscribeCustomWalletSession } from "@/lib/signer/session";
import type { WalletSigner } from "@/lib/signer/types";
import { peekUnlocked, subscribeUnlocked } from "@/lib/wallet-core/unlock-state";

/**
 * Whether the app is running on the self-custody wallet, and that wallet as a signer.
 *
 * Off unless the switch is built in AND this account chose it. When it is the wallet
 * in use, the app never falls back to Decane quietly: until the wallet has loaded the
 * signer is the pending one, which signs nothing and shows no address.
 *
 * The wallet code itself is loaded on demand, so a build or an account that does not
 * use it carries none of it.
 */

export interface CustomWalletState {
  kind: ActiveWalletKind;
  /** The signer to use when `kind` is "custom"; null otherwise. */
  signer: WalletSigner | null;
  /** The wallet's own addresses, when it is the one in use (empty until it has loaded). */
  addresses: { evm: string | null; solana: string | null } | null;
  status: "off" | "loading" | "locked" | "ready";
}

const OFF: CustomWalletState = { kind: "decane", signer: null, addresses: null, status: "off" };

function useCustomWalletOff(): CustomWalletState {
  return OFF;
}

type AppSigner = typeof import("@/lib/signer/app-signer");

// Loaded once and shared: many components use this hook, and they should wait on the same
// load rather than each starting their own.
let appSignerLoad: Promise<AppSigner> | null = null;
const loadAppSigner = (): Promise<AppSigner> =>
  (appSignerLoad ??= import("@/lib/signer/app-signer"));

function useCustomWalletOn(): CustomWalletState {
  const social = useSocialWallet();
  // The account the preference belongs to, read off the Decane token as everywhere else.
  // The token is null for a render while the kit rotates it, so the last one read stands.
  const [uid, setUid] = useState<string | null>(null);
  const token = social.addresses ? social.getAccessToken() : null;
  const fromToken = token ? decodeDecaneUserId(token) : null;
  const next = social.addresses ? (fromToken ?? uid) : null;
  if (next !== uid) setUid(next);

  const signedIn = social.addresses !== null;
  const kind = useSyncExternalStore(
    subscribeActiveWalletKind,
    () => {
      if (!signedIn) return "decane" as ActiveWalletKind;
      return uid ? getActiveWalletKind(uid) : getActiveWalletKindWhileIdUnknown();
    },
    () => "decane" as ActiveWalletKind
  );
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

  const [signing, setSigning] = useState<AppSigner | null>(null);
  useEffect(() => {
    if (kind !== "custom" || signing) return;
    let live = true;
    void loadAppSigner().then((module) => live && setSigning(module));
    return () => {
      live = false;
    };
  }, [kind, signing]);

  const mine = session && uid && session.uid === uid ? session : null;
  useEffect(() => {
    if (kind === "custom" && signing && uid && !mine)
      void signing.bootstrapCustomWalletSession(uid).catch(() => undefined);
  }, [kind, signing, uid, mine]);

  return useMemo<CustomWalletState>(() => {
    if (kind !== "custom") return OFF;
    if (!signing || !mine) {
      return {
        kind,
        signer: PENDING_SIGNER,
        addresses: { evm: null, solana: null },
        status: "loading",
      };
    }
    const signer = signing.createAppCustomSigner(mine.uid, mine.pkg);
    return {
      kind,
      signer,
      addresses: { evm: signer.addresses?.evm ?? null, solana: signer.addresses?.solana ?? null },
      status: unlocked ? "ready" : "locked",
    };
    // `unlocked` is a dependency on purpose: a lock or unlock hands consumers a fresh signer.
  }, [kind, signing, mine, unlocked]);
}

/** Chosen once, when the module loads: the build either has the switch or it does not. */
export const useCustomWallet: () => CustomWalletState = walletSwitchEnabled()
  ? useCustomWalletOn
  : useCustomWalletOff;
