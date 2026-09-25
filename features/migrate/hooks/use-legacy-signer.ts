"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";
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
// How long the signer waits for the old account's Solana wallet OBJECT after
// its address is known. The EVM side waits for its object outright (below);
// Solana's arrives through a separate provider and, seen live, later than
// the EVM one — the automatic sweep fired on the EVM wallet alone and every
// SOL send failed "isn't ready on Solana", a miss that counts toward the
// gate's "this keeps failing" exit. Bounded, not open-ended: an account whose
// Solana wallet never materialises must still move its EVM money.
export const SOLANA_WALLET_GRACE_MS = 8_000;

export function useLegacySigner(): LegacySigner | null {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();
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

  // The Solana grace clock starts once the old sign-in is real, and a
  // sign-out restarts it for the next one. Derived state, reset during
  // render the way React documents for it, so the reset is never a render
  // behind the session it belongs to.
  const sessionLive = fresh && ready && authenticated;
  const [grace, setGrace] = useState({ live: false, over: false });
  if (grace.live !== sessionLive) setGrace({ live: sessionLive, over: false });
  useEffect(() => {
    if (!sessionLive) return;
    const timer = setTimeout(
      () => setGrace((g) => (g.live ? { ...g, over: true } : g)),
      SOLANA_WALLET_GRACE_MS
    );
    return () => clearTimeout(timer);
  }, [sessionLive]);
  const solanaGraceOver = grace.live && grace.over;

  return useMemo(() => {
    if (!fresh || !ready || !authenticated || mismatch) return null;
    // Prefer the wallet the backend recorded at link time — the one that
    // provably holds the funds — over getWalletAddress's "first embedded",
    // but only when it is one of THIS account's own wallets. Same reasoning on
    // both chains: an account can carry more than one embedded wallet.
    // The address is taken from the ACCOUNT'S OWN wallet entry, never from the
    // recorded string, even when they name the same wallet. The service used
    // to store every old wallet lower-cased, and a lower-cased Solana address
    // is a different string that names no account: matched case-blind and
    // then handed back as recorded, it made discovery read 0 SOL at a wallet
    // holding 25. Case-blind matching is right for choosing the wallet;
    // Privy's own spelling is the one to spend from.
    const own = (chain: "ethereum" | "solana") =>
      getEmbeddedWallets(user).filter((w) => w.chainType === chain);
    const prefer = (recordedAddr: string | null, chain: "ethereum" | "solana") =>
      (recordedAddr &&
        own(chain).find((w) => w.address.toLowerCase() === recordedAddr.toLowerCase())?.address) ??
      getWalletAddress(user, chain);
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
    // The Solana wallet object too, for as long as the grace allows. After
    // it, the signer is handed out regardless and a SOL send that finds no
    // wallet fails retryably, as before.
    const solanaPresent = Boolean(solana) && solanaWallets.some((w) => w.address === solana);
    if (solana && !solanaPresent && !solanaGraceOver) return null;
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
    solanaWallets,
    solanaGraceOver,
    recorded?.evm,
    recorded?.solana,
    sendBatch,
    sendToken,
  ]);
}
