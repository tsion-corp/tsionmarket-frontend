"use client";

import { useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { getEmbeddedWallets, getWalletAddress } from "@/lib/user";
import type { LegacySigner } from "@/lib/migration/types";
import {
  useLegacyEvmSendBatch,
  useLegacySendToken,
} from "@/features/migrate/hooks/use-legacy-send";
import { useFreshLegacySession } from "@/features/migrate/hooks/use-fresh-legacy-session";
import { useLegacyEmailMatch } from "@/features/migrate/hooks/use-legacy-email-match";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";

// The old Privy wallets as a plain signer object, so venue adapters (which
// never import Privy) can spend from them. Null until the user has signed in
// to the old account IN THIS PAGE LOAD — a session Privy restored on its own is
// discarded first, see useFreshLegacySession. Must render inside
// LegacyPrivyProvider.
export function useLegacySigner(): LegacySigner | null {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const sendBatch = useLegacyEvmSendBatch();
  const sendToken = useLegacySendToken();
  // A session restored from Privy's own storage is not proof of who is sitting
  // here, and everything below spends real money on that basis. No signer is
  // handed out until the inherited one has been discarded and the old account
  // has signed in again.
  const fresh = useFreshLegacySession();
  // The wallet the backend linked and that provably holds the funds. When the
  // signed-in account has more than one embedded EVM wallet, getWalletAddress
  // returns the FIRST — which need not be the funded one, so discovery reads an
  // empty wallet and the review says "nothing to move" while the money sits at
  // the recorded address. Prefer that recorded address whenever it is one of
  // this account's own wallets; otherwise the account simply differs, and the
  // first wallet is the right fallback.
  const recorded = useMigrationStatus().data?.legacy ?? null;
  // The old account must belong to the person signed in to Decane — see the
  // hook. No signer means nothing links and nothing moves, on every path.
  const { mismatch } = useLegacyEmailMatch();

  return useMemo(() => {
    if (!fresh || !ready || !authenticated || mismatch) return null;
    // Prefer the wallet the backend recorded at link time — the one that
    // provably holds the funds — over getWalletAddress's "first embedded",
    // but only when it is one of THIS account's own wallets. Same reasoning on
    // both chains: an account can carry more than one embedded wallet.
    const own = (chain: "ethereum" | "solana") =>
      getEmbeddedWallets(user)
        .filter((w) => w.chainType === chain)
        .map((w) => w.address.toLowerCase());
    const prefer = (recordedAddr: string | null, chain: "ethereum" | "solana") =>
      recordedAddr && own(chain).includes(recordedAddr.toLowerCase())
        ? recordedAddr
        : getWalletAddress(user, chain);
    const evm = prefer(recorded?.evm ?? null, "ethereum");
    const solana = prefer(recorded?.solana ?? null, "solana");
    if (!evm && !solana) return null;
    // The ADDRESS is on the user record the moment sign-in lands; the wallet
    // OBJECT arrives later, once Privy's embedded-wallet iframe has initialised.
    // A signer handed out in between fails every send — "No EVM wallet is
    // connected", "iframe not initialized" — which is exactly what the
    // automatic sweep did when it fired on the first render after login. So no
    // signer until the wallet it would spend from is actually here.
    const matchesChosen = (w: (typeof wallets)[number]) =>
      w.walletClientType === "privy" &&
      Boolean(evm) &&
      w.address.toLowerCase() === evm!.toLowerCase();
    // The SPECIFIC funded wallet must be present, not merely any privy wallet:
    // signing from the wrong one of two embedded wallets moves nothing.
    if (evm && !wallets.some(matchesChosen)) return null;
    return {
      addresses: { evm, solana },
      // Bound to the wallets resolved above, so a send can never go out from
      // a different embedded wallet than the one discovery read.
      sendBatch: (calls, chainId) => sendBatch(calls, chainId, evm ?? undefined),
      sendToken: (params) =>
        sendToken({
          ...params,
          from: (params.network === "solana-mainnet" ? solana : evm) ?? undefined,
        }),
      async getEthereumProvider() {
        const wallet = wallets.find(matchesChosen);
        if (!wallet) throw new Error("Your old account isn't connected. Sign in again.");
        return (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      },
    };
  }, [
    fresh,
    ready,
    authenticated,
    mismatch,
    user,
    wallets,
    recorded?.evm,
    recorded?.solana,
    sendBatch,
    sendToken,
  ]);
}
