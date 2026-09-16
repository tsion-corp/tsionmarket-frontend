"use client";

import { useCallback } from "react";
import {
  getAccessToken,
  useSendTransaction,
  useSign7702Authorization,
  useWallets,
} from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { recordSelfInitiated } from "@/lib/analytics/self-initiated";
import { sendSponsoredEvmCallsWithReceipt } from "@/lib/trade/sponsor";
import type { ReceiptLog } from "@/lib/meme/delivery";
import { getSponsoredEvmChainById, hasGasPolicyForChainId } from "@/lib/trade/sponsored-evm";

export interface EvmSendInput {
  to: `0x${string}`;
  data?: `0x${string}`;
  // Native value to attach, in wei. Sponsorship covers gas only — any value
  // here still comes from the user's own balance.
  value?: bigint;
  chainId: number;
  // Which embedded wallet to send from (non-Base path). Defaults to the account
  // Privy picks; Base always uses the embedded Privy wallet.
  address?: string;
  // Optional gas-limit hint for a non-sponsored provider transaction. The
  // sponsored path ignores it; the bundler estimates its own userOp gas.
  gasLimit?: bigint;
}

// The single EVM send path for the app. Supported sponsored chains route
// through the 7702 + bundler flow; unsupported chains keep the normal EOA send
// path. The sponsored path already waits for the userOp receipt, so callers can
// treat its returned transaction hash as confirmed.
const EIP7702_REFUSED = /EIP-7702 is not supported/i;

function refusesEip7702(error: unknown): boolean {
  return EIP7702_REFUSED.test(error instanceof Error ? error.message : String(error));
}

export interface EvmSendResult {
  hash: `0x${string}`;
  // The operation's own receipt logs on the sponsored path; null when the
  // send went user-paid or the receipt had to be recovered without them.
  logs: ReceiptLog[] | null;
}

export function useEvmSend() {
  const sendWithReceipt = useEvmSendWithReceipt();
  return useCallback(
    async (input: EvmSendInput): Promise<`0x${string}`> => (await sendWithReceipt(input)).hash,
    [sendWithReceipt]
  );
}

// The same send, also handing back what the receipt recorded, for a caller
// that wants to read a delivery off it instead of paying for balance reads.
export function useEvmSendWithReceipt() {
  const { sendTransaction } = useSendTransaction();
  const { signAuthorization } = useSign7702Authorization();
  const { wallets } = useWallets();

  return useCallback(
    async ({
      to,
      data,
      value,
      chainId,
      address,
      gasLimit,
    }: EvmSendInput): Promise<EvmSendResult> => {
      // Registry membership alone is not enough: a chain with no Gas Manager
      // policy has its userOp rejected by the bundler, so it takes the ordinary
      // user-paid path instead of failing.
      const sponsored = hasGasPolicyForChainId(chainId) ? getSponsoredEvmChainById(chainId) : null;
      if (sponsored) {
        const wallet = wallets.find((w) => w.walletClientType === "privy");
        if (!wallet) throw new Error("No EVM wallet is connected.");
        if (address && address.toLowerCase() !== wallet.address.toLowerCase()) {
          throw new Error(
            `Sponsored ${sponsored.chain.name} sends must use your connected embedded wallet.`
          );
        }
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Your session expired. Sign in again.");
        const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
        try {
          const receipt = await sendSponsoredEvmCallsWithReceipt({
            chainId,
            address: wallet.address as `0x${string}`,
            provider,
            signAuthorization,
            accessToken,
            calls: [{ to, data, value }],
          });
          recordSelfInitiated([receipt.transactionHash]);
          return { hash: receipt.transactionHash, logs: receipt.logs };
        } catch (error) {
          // Alchemy's bundler refuses the EIP-7702 authorization on some chains
          // only at send time ("EIP-7702 is not supported on entry point … or
          // is disabled", Monad, 2026-09-07), which no probe short of a real
          // send reveals. That one refusal falls through to the ordinary
          // user-paid transaction, so the chain degrades to a send that
          // completes instead of a dead end. Every other failure is the
          // sponsored path's own and is reported as such.
          if (!refusesEip7702(error)) throw error;
          console.warn(
            `Sponsored send refused on chain ${chainId}; sending user-paid instead`,
            error instanceof Error ? error.message : error
          );
        }
      }
      const { hash } = await sendTransaction(
        { to, data, value, chainId, gasLimit },
        address ? { address } : undefined
      );
      recordSelfInitiated([hash]);
      return { hash: hash as `0x${string}`, logs: null };
    },
    [sendTransaction, signAuthorization, wallets]
  );
}

export interface EvmBatchCall {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

// Sends several calls as one atomic sponsored operation on a supported EVM
// chain. Used where a flow would otherwise need sequential dependent
// transactions (approve, then consume the allowance): batching removes the
// in-between state and keeps the user to one signature.
export function useEvmSendBatch() {
  const { signAuthorization } = useSign7702Authorization();
  const { wallets } = useWallets();

  return useCallback(
    async (calls: EvmBatchCall[], chainId: number): Promise<`0x${string}`> => {
      if (!hasGasPolicyForChainId(chainId)) {
        throw new Error("Batched transactions are only supported on sponsored EVM chains.");
      }
      if (calls.length === 0) throw new Error("Nothing to send.");
      const wallet = wallets.find((w) => w.walletClientType === "privy");
      if (!wallet) throw new Error("No EVM wallet is connected.");
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Your session expired. Sign in again.");
      const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      const { transactionHash: hash } = await sendSponsoredEvmCallsWithReceipt({
        chainId,
        address: wallet.address as `0x${string}`,
        provider,
        signAuthorization,
        accessToken,
        calls,
      });
      // Anything this transaction pays back to the wallet, a closed perp's
      // collateral, a game balance being cashed out, a claimed payout, arrives
      // as inbound stablecoin and is indistinguishable from a deposit in
      // activity. It is not one: the user signed for it here.
      recordSelfInitiated([hash]);
      return hash;
    },
    [signAuthorization, wallets]
  );
}
