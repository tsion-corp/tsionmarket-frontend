"use client";

import { useMemo } from "react";
import { useSocialWallet } from "decane-connect-kit";
import type { EIP1193Provider } from "viem";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { useSendToken } from "@/hooks/use-withdraw";
import { ensureUnlocked } from "@/lib/decane";
import type { LegacySigner } from "@/lib/migration/types";
import { toDecaneTransaction } from "../lib/decane-tx";

// The refusal that may degrade a sponsored send to a user-paid one, and only
// this one. Anything broader would charge the person for a send meant to be
// sponsored; see hooks/use-evm-send.
const EIP7702_REFUSED = /EIP-7702 is not supported/i;

/**
 * The CURRENT (Decane) wallet as the sweep's signer, so the sweep that moves
 * money out of an old wallet can move it out of this one. Null until the session
 * has an address. Every send is bound to the address resolved here, so nothing
 * can go out from a different wallet than the one that was read.
 */
export function useDecaneSigner(): LegacySigner | null {
  const wallet = useSocialWallet();
  const session = useAuthSession();
  const sendBatch = useEvmSendBatch();
  const { sendToken } = useSendToken();
  const { authenticated, evmAddress, solanaAddress } = session;

  return useMemo(() => {
    if (!authenticated || (!evmAddress && !solanaAddress)) return null;

    const userPaid = async (
      call: { to: string; data?: `0x${string}`; value?: bigint },
      chainId: number
    ) => {
      await ensureUnlocked(wallet);
      return (await wallet.sendTransaction({
        chain: `evm:${chainId}`,
        to: call.to,
        ...(call.data ? { data: call.data } : {}),
        ...(call.value !== undefined ? { value: call.value } : {}),
      })) as `0x${string}`;
    };

    return {
      addresses: { evm: evmAddress, solana: solanaAddress },
      async sendBatch(calls, chainId) {
        try {
          return await sendBatch(calls, chainId, evmAddress ?? undefined);
        } catch (error) {
          const refused = EIP7702_REFUSED.test(
            error instanceof Error ? error.message : String(error)
          );
          // One call only: a batch has no honest user-paid equivalent.
          if (refused && calls.length === 1) return userPaid(calls[0]!, chainId);
          throw error;
        }
      },
      sendToken: (params) => sendToken(params),
      async getEthereumProvider() {
        return wallet.getEthereumProvider() as unknown as EIP1193Provider;
      },
      // Decane addresses each chain by name on every call; there is nothing to switch.
      async switchChain() {},
      async sendTransaction(tx) {
        await ensureUnlocked(wallet);
        return wallet.sendTransaction(toDecaneTransaction(tx));
      },
    };
  }, [wallet, authenticated, evmAddress, solanaAddress, sendBatch, sendToken]);
}
