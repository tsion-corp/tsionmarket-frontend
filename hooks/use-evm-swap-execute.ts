"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { fetchLifiQuote } from "@/lib/trade/lifi";
import { useEvmSend } from "@/hooks/use-evm-send";
import {
  encodeAllowanceCall,
  encodeApprove,
  isNativeToken,
  parseAllowance,
} from "@/lib/trade/erc20";
import { awaitReceipt, publicClientForChain, type ChainReadClient } from "@/lib/trade/receipt";
import { getWalletAddress } from "@/lib/user";

export interface EvmSwapExecuteInput {
  fromChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
  slippageBps: number;
}

async function readAllowance(
  client: ChainReadClient,
  token: string,
  owner: string,
  spender: string
): Promise<bigint> {
  const { data } = await client.call({
    to: token as `0x${string}`,
    data: encodeAllowanceCall(owner, spender),
  });
  return parseAllowance(data ?? "0x");
}

// Executes an EVM swap on the token's own chain (Base, Arbitrum or Polygon)
// through LI.FI, signed by the Privy embedded EVM wallet. Fetches a fresh quote
// for the taker on input.fromChainId, grants the ERC-20 allowance if the router
// needs one, then sends the swap transaction. The backend never holds keys; the
// wallet signs client-side. Returns once the swap has confirmed on-chain so the
// caller's balance refetch reflects the received token.
export function useEvmSwapExecute() {
  const { user } = usePrivy();
  const evmSend = useEvmSend();

  return useCallback(
    async (input: EvmSwapExecuteInput): Promise<void> => {
      const owner = getWalletAddress(user, "ethereum");
      if (!owner) throw new Error("No EVM wallet is connected.");

      const client = publicClientForChain(input.fromChainId);

      const quote = await fetchLifiQuote({
        fromChain: input.fromChainId,
        toChain: input.fromChainId,
        fromToken: input.fromToken,
        toToken: input.toToken,
        fromAmount: input.fromAmount,
        fromAddress: owner,
        slippage: input.slippageBps / 10000,
      });

      if (!isNativeToken(input.fromToken)) {
        const allowance = await readAllowance(
          client,
          input.fromToken,
          owner,
          quote.approvalAddress
        );
        if (allowance < input.fromAmount) {
          const hash = await evmSend({
            to: input.fromToken as `0x${string}`,
            data: encodeApprove(quote.approvalAddress, input.fromAmount) as `0x${string}`,
            chainId: input.fromChainId,
          });
          await awaitReceipt(client, hash, "Token approval");
        }
      }

      const tx = quote.transactionRequest;
      // Sponsored chains route through the 7702 path; unsupported ones still
      // pay their own gas through the normal send flow.
      const hash = await evmSend({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: BigInt(tx.value),
        chainId: tx.chainId,
        gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
      });
      // Wait for the swap to mine so the caller's balance refetch reflects the
      // received token instead of the pre-swap balance.
      await awaitReceipt(client, hash, "The swap");
    },
    [user, evmSend]
  );
}
