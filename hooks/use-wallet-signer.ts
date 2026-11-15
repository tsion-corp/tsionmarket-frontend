"use client";

import { useSocialWallet } from "decane-connect-kit";
import { useCustomWallet } from "@/hooks/use-custom-wallet";
import { walletSwitchEnabled } from "@/lib/signer/preference";
import type { WalletSigner } from "@/lib/signer/types";

/**
 * The wallet that signs. Everything in the app that signs, sends or reads the
 * account's addresses goes through this rather than reaching for the Decane wallet.
 *
 * With the switch off (the default) this IS the Decane wallet, handed through as it
 * always was. With it on and the account's choice set to the self-custody wallet, it
 * is that wallet's signer instead, or the pending signer while it loads, never a
 * quiet fall-back to Decane. Authentication is untouched: the session token still
 * comes from Decane.
 */
function useWalletSignerOff(): WalletSigner {
  return useSocialWallet() as unknown as WalletSigner;
}

function useWalletSignerOn(): WalletSigner {
  const social = useSocialWallet();
  const custom = useCustomWallet();
  return custom.signer ?? (social as unknown as WalletSigner);
}

export const useWalletSigner: () => WalletSigner = walletSwitchEnabled()
  ? useWalletSignerOn
  : useWalletSignerOff;
