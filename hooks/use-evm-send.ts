"use client";

import { useCallback } from "react";
import {
  getAccessToken,
  useSendTransaction,
  useSign7702Authorization,
  useWallets,
} from "@privy-io/react-auth";
import { base } from "viem/chains";
import type { EIP1193Provider } from "viem";
import { sendSponsoredBaseCalls } from "@/lib/trade/base-sponsor";

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
  // Optional gas-limit hint for the non-Base path (e.g. from a LI.FI quote). The
  // Base sponsored path ignores it — the bundler estimates its own userOp gas.
  gasLimit?: bigint;
}

// The single EVM send path for the app. On Base every transaction is gasless:
// the embedded EOA is upgraded in place via EIP-7702 and the operation is
// sponsored through our bundler proxy, so the wallet never needs ETH and no
// approval modal appears (embeddedWallets.showWalletUIs is off globally). On
// every other chain it sends normally from the EOA, which pays its own gas.
// Returns the on-chain transaction hash; on Base the hash is already confirmed
// (the sponsored path waits for the user-operation receipt), so a caller's
// awaitReceipt on it is a cheap no-op.
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
      if (chainId === base.id) {
        const wallet = wallets.find((w) => w.walletClientType === "privy");
        if (!wallet) throw new Error("No EVM wallet is connected.");
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Your session expired. Sign in again.");
        const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
        return sendSponsoredBaseCalls({
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

// Sends several calls as ONE atomic sponsored operation on Base. Used where a
// flow would otherwise need sequential dependent transactions (approve, then a
// transferFrom-consuming action): batching removes the in-between state, so an
// allowance can never be observed stale between the two, and the user signs
// once. Base-only by design; other chains have no batch primitive here.
export function useEvmSendBatch() {
  const { signAuthorization } = useSign7702Authorization();
  const { wallets } = useWallets();

  return useCallback(
    async (calls: EvmBatchCall[], chainId: number): Promise<`0x${string}`> => {
      if (chainId !== base.id) {
        throw new Error("Batched transactions are only supported on Base.");
      }
      if (calls.length === 0) throw new Error("Nothing to send.");
      const wallet = wallets.find((w) => w.walletClientType === "privy");
      if (!wallet) throw new Error("No EVM wallet is connected.");
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Your session expired. Sign in again.");
      const provider = (await wallet.getEthereumProvider()) as unknown as EIP1193Provider;
      return sendSponsoredBaseCalls({
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
