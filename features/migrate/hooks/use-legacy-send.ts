"use client";

// The Privy-signed send paths, preserved verbatim for the migration sweep
// after the rest of the app moved to Decane. The sweep moves assets OUT of
// the old Privy embedded wallets, so it must keep signing with them.
// Everything here dies with the migration window; only surfaces wrapped in
// LegacyPrivyProvider (the Update Balance button, the prediction reclaim
// page) may use these hooks.

import { useCallback } from "react";
import {
  getAccessToken,
  usePrivy,
  useSign7702Authorization,
  useWallets,
} from "@privy-io/react-auth";
import { useSignTransaction, useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";
import type { EIP1193Provider } from "viem";
import { recordSelfInitiated } from "@/lib/analytics/self-initiated";
import { sendSponsoredEvmCalls } from "@/lib/trade/sponsor";
import { canSponsorEvmChainId } from "@/lib/trade/sponsored-evm";
import {
  prepareSponsoredSolanaTransaction,
  sponsorAndSubmitSolanaTransaction,
} from "@/lib/trade/solana-sponsor";
import { buildSolanaSolTransfer, buildSolanaTokenTransfer } from "@/lib/trade/solana-transfer";
import { getWalletAddress } from "@/lib/user";
import { encodeErc20Transfer } from "@/lib/deposit";
import type { EvmBatchCall } from "@/hooks/use-evm-send";

// EVM chain ids by Alchemy network. Keep in sync with the portfolio's
// supported chains (lib/server/alchemy).
const EVM_CHAIN_ID: Record<string, number> = {
  "base-mainnet": 8453,
  "eth-mainnet": 1,
  "arb-mainnet": 42161,
  "opt-mainnet": 10,
  "polygon-mainnet": 137,
};

// The old sponsored batch: sign with the Privy embedded wallet, 7702-delegate,
// send through the bundler proxy. Copied from hooks/use-evm-send before that
// hook moved to Decane.
export function useLegacyEvmSendBatch() {
  const { signAuthorization } = useSign7702Authorization();
  const { wallets } = useWallets();

  return useCallback(
    // `from` names the embedded wallet to sign with. An account can carry
    // more than one, and the migration signer resolves the FUNDED one
    // (use-legacy-signer); without this the batch went out from whichever
    // Privy listed first, and a sweep from the wrong wallet moves nothing —
    // every transfer reverts on a balance that is not there.
    async (calls: EvmBatchCall[], chainId: number, from?: string): Promise<`0x${string}`> => {
      if (!canSponsorEvmChainId(chainId)) {
        throw new Error("Batched transactions are only supported on sponsored EVM chains.");
      }
      if (calls.length === 0) throw new Error("Nothing to send.");
      const wallet = wallets.find(
        (w) =>
          w.walletClientType === "privy" &&
          (from === undefined || w.address.toLowerCase() === from.toLowerCase())
      );
      if (!wallet) throw new Error("Your old account isn't connected. Sign in again.");
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Your old session expired. Sign in again.");
      const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      const hash = await sendSponsoredEvmCalls({
        chainId,
        address: wallet.address as `0x${string}`,
        provider,
        signAuthorization,
        accessToken,
        calls,
      });
      recordSelfInitiated([hash]);
      return hash;
    },
    [signAuthorization, wallets]
  );
}

export interface LegacySendTokenParams {
  network: string;
  tokenAddress: string | null;
  decimals: number;
  to: string;
  amount: bigint;
  // The old wallet to spend from, when the caller has resolved which one
  // (see useLegacyEvmSendBatch). Defaults to the account's first wallet on
  // that chain.
  from?: string;
}

// The old any-token send, Privy-signed: EVM through the legacy batch (one
// call), Solana through prepare, Privy sign, sponsor submit.
export function useLegacySendToken() {
  const { user } = usePrivy();
  const sendBatch = useLegacyEvmSendBatch();
  const { signTransaction } = useSignTransaction();
  const { wallets: solanaWallets } = useSolanaWallets();

  return useCallback(
    async ({
      network,
      tokenAddress,
      decimals,
      to,
      amount,
      from: chosen,
    }: LegacySendTokenParams): Promise<string> => {
      const isSolana = network === "solana-mainnet";
      const from = chosen ?? getWalletAddress(user, isSolana ? "solana" : "ethereum");
      if (!from) throw new Error("Your old account isn't connected. Sign in again.");

      if (!isSolana) {
        const chainId = EVM_CHAIN_ID[network];
        if (!chainId) throw new Error("Unsupported network");
        const call: EvmBatchCall =
          tokenAddress === null
            ? { to: to as `0x${string}`, value: amount }
            : { to: tokenAddress as `0x${string}`, data: encodeErc20Transfer(to, amount) };
        return sendBatch([call], chainId, from);
      }

      const wallet = solanaWallets.find((w) => w.address === from);
      if (!wallet) throw new Error("Your old account isn't ready on Solana. Sign in again.");
      const transaction =
        tokenAddress === null
          ? await buildSolanaSolTransfer(from, to, amount)
          : await buildSolanaTokenTransfer(from, to, amount, tokenAddress, decimals);
      // The gas-sponsor service still verifies Privy tokens, and this spends
      // from the old wallet anyway, so both hops name the legacy identity.
      const prepared = await prepareSponsoredSolanaTransaction(transaction, {
        prefundRent: tokenAddress !== null,
        identity: "legacy",
      });
      const { signedTransaction } = await signTransaction({ transaction: prepared, wallet });
      const result = await sponsorAndSubmitSolanaTransaction(signedTransaction, {
        identity: "legacy",
      });
      if (!result.submittedSignature) {
        throw new Error("The gas sponsor did not submit the transaction.");
      }
      return result.submittedSignature;
    },
    [user, sendBatch, signTransaction, solanaWallets]
  );
}
