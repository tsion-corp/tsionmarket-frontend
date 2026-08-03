"use client";

import { useCallback } from "react";
import {
  getAccessToken,
  useSendTransaction,
  useSign7702Authorization,
  useWallets,
} from "@privy-io/react-auth";
import type { EIP1193Provider } from "viem";
import { sendSponsoredEvmCalls } from "@/lib/trade/sponsor";
import { getSponsoredEvmChainById, isSponsoredEvmChainId } from "@/lib/trade/sponsored-evm";

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
  // Optional gas-limit hint for the non-sponsored path (e.g. from a LI.FI
  // quote). The sponsored path ignores it, the bundler estimates its own userOp gas.
  gasLimit?: bigint;
}

// The single EVM send path for the app. Supported sponsored chains route
// through the 7702 + bundler flow; unsupported chains keep the normal EOA send
// path. The sponsored path already waits for the userOp receipt, so callers can
// treat its returned transaction hash as confirmed.
export function useEvmSend() {
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
    }: EvmSendInput): Promise<`0x${string}`> => {
      const sponsored = getSponsoredEvmChainById(chainId);
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
        return sendSponsoredEvmCalls({
          chainId,
          address: wallet.address as `0x${string}`,
          provider,
          signAuthorization,
          accessToken,
          calls: [{ to, data, value }],
        });
      }
      const { hash } = await sendTransaction(
        { to, data, value, chainId, gasLimit },
        address ? { address } : undefined
      );
      return hash as `0x${string}`;
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
      if (!isSponsoredEvmChainId(chainId)) {
        throw new Error("Batched transactions are only supported on sponsored EVM chains.");
      }
      if (calls.length === 0) throw new Error("Nothing to send.");
      const wallet = wallets.find((w) => w.walletClientType === "privy");
      if (!wallet) throw new Error("No EVM wallet is connected.");
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Your session expired. Sign in again.");
      const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      return sendSponsoredEvmCalls({
        chainId,
        address: wallet.address as `0x${string}`,
        provider,
        signAuthorization,
        accessToken,
        calls,
      });
    },
    [signAuthorization, wallets]
  );
}
