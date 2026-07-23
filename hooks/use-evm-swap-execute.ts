"use client";

import { useCallback } from "react";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import type { EIP1193Provider } from "@privy-io/react-auth";
import { fetchLifiQuote } from "@/lib/trade/lifi";
import {
  encodeAllowanceCall,
  encodeApprove,
  isNativeToken,
  parseAllowance,
} from "@/lib/trade/erc20";
import { getWalletAddress } from "@/lib/user";

export interface EvmSwapExecuteInput {
  fromChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: bigint;
  slippageBps: number;
}

// Poll for a mined receipt so the approve transaction confirms before the swap
// spends the allowance. Caps the wait so a stuck transaction surfaces an error
// instead of hanging the flow.
const RECEIPT_POLL_ATTEMPTS = 40;
const RECEIPT_POLL_INTERVAL_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readAllowance(
  provider: EIP1193Provider,
  token: string,
  owner: string,
  spender: string
): Promise<bigint> {
  const result: string = await provider.request({
    method: "eth_call",
    params: [{ to: token, data: encodeAllowanceCall(owner, spender) }, "latest"],
  });
  return parseAllowance(result);
}

async function waitForReceipt(provider: EIP1193Provider, hash: string): Promise<void> {
  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt++) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash],
    });
    if (receipt) {
      if (receipt.status === "0x0") throw new Error("Token approval failed on-chain.");
      return;
    }
    await delay(RECEIPT_POLL_INTERVAL_MS);
  }
  throw new Error("Token approval is taking too long. Try again.");
}

// Executes an EVM swap on Base through LI.FI, signed by the Privy embedded EVM
// wallet. Fetches a fresh quote for the taker, grants the ERC-20 allowance if
// the router needs one, then sends the swap transaction. The backend never
// holds keys; the wallet signs client-side. Returns once the swap is submitted.
export function useEvmSwapExecute() {
  const { user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();

  return useCallback(
    async (input: EvmSwapExecuteInput): Promise<void> => {
      const owner = getWalletAddress(user, "ethereum");
      if (!owner) throw new Error("No EVM wallet is connected.");
      const wallet = wallets.find((w) => w.address.toLowerCase() === owner.toLowerCase());
      if (!wallet) throw new Error("The EVM wallet is not ready. Try again.");

      const quote = await fetchLifiQuote({
        fromChain: input.fromChainId,
        toChain: input.fromChainId,
        fromToken: input.fromToken,
        toToken: input.toToken,
        fromAmount: input.fromAmount,
        fromAddress: owner,
        slippage: input.slippageBps / 10000,
      });

      const provider = await wallet.getEthereumProvider();

      if (!isNativeToken(input.fromToken)) {
        const allowance = await readAllowance(
          provider,
          input.fromToken,
          owner,
          quote.approvalAddress
        );
        if (allowance < input.fromAmount) {
          const { hash } = await sendTransaction({
            to: input.fromToken,
            data: encodeApprove(quote.approvalAddress, input.fromAmount),
            chainId: input.fromChainId,
          });
          await waitForReceipt(provider, hash);
        }
      }

      const tx = quote.transactionRequest;
      await sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        chainId: tx.chainId,
        gasLimit: tx.gasLimit,
      });
    },
    [user, sendTransaction, wallets]
  );
}
