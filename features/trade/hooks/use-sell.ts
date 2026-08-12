"use client";

import { useMutation } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { useSendToken } from "@/hooks/use-withdraw";
import { getWalletAddress } from "@/lib/user";
import { fetchSellQuote } from "@/lib/sell";
import { fetchSolanaBridgeQuote } from "@/lib/trade/lifi";
import { confirmSolanaSignature } from "@/lib/trade/solana-confirm";
import { useSponsoredSolanaSend } from "@/hooks/use-sponsored-solana";
import { BASE_USDC, LIFI_BASE_CHAIN, LIFI_NATIVE_SOL } from "@/lib/trade/funding";

export interface SellExecuteInput {
  // Alchemy network id of the held asset.
  network: string;
  // Held token address, or null for a native balance.
  asset: string | null;
  decimals: number;
  amount: bigint;
  slippageBps: number;
}

export interface SellExecuteResult {
  // Which rail carried the sale, deciding how settlement is tracked: a
  // Dextopus deposit is polled by requestId, a LI.FI transfer by the Solana
  // transaction signature.
  rail: "dextopus" | "lifi";
  requestId: string;
  txHash: string;
  // Expected USDC proceeds, in base units (6 decimals).
  estimatedOutput: bigint;
}

// Executes a sell into USDC on Base.
//
// EVM assets go through Dextopus: quote the asset, send it to the returned
// deposit address on its own chain, and Dextopus settles USDC to the user's
// Base wallet.
//
// Solana assets — native SOL included — go through LI.FI in one sponsored
// leg: LI.FI returns a Solana transaction that swaps/bridges straight to USDC
// on Base, the platform sponsor pays its fee, the embedded wallet signs, and
// settlement is polled by the transaction signature. One rail, one signature,
// no SOL required.
export function useSell() {
  const { user } = usePrivy();
  const { sendToken } = useSendToken();
  const sendSponsored = useSponsoredSolanaSend();
  const { wallets: solanaWallets } = useWallets();

  return useMutation<SellExecuteResult, Error, SellExecuteInput>({
    onError: (error) => {
      // The sheet shows a friendly line; the console keeps the raw failure so
      // a masked error is never undebuggable.
      console.error("Sell failed:", error);
    },
    mutationFn: async ({ network, asset, decimals, amount, slippageBps }) => {
      // Proceeds settle as USDC on Base, an EVM asset, so the recipient is the
      // EVM wallet. Refunds go back to the wallet on the asset's own chain.
      const recipient = getWalletAddress(user, "ethereum");
      const originChainType = network === "solana-mainnet" ? "solana" : "ethereum";
      const refundTo = getWalletAddress(user, originChainType);
      if (!recipient) throw new Error("No Base wallet is connected.");
      if (!refundTo) throw new Error("No wallet for this asset's network.");

      if (network === "solana-mainnet") {
        const wallet = solanaWallets[0];
        if (!wallet) throw new Error("No Solana wallet is connected.");
        const quote = await fetchSolanaBridgeQuote({
          fromToken: asset ?? LIFI_NATIVE_SOL,
          toChain: LIFI_BASE_CHAIN,
          toToken: BASE_USDC,
          fromAmount: amount,
          fromAddress: refundTo,
          toAddress: recipient,
          slippage: slippageBps / 10_000,
        });
        const sig = await sendSponsored({ transaction: quote.transaction, wallet });
        await confirmSolanaSignature(sig).catch(() => {
          // The LI.FI settlement poll is the real signal; a slow RPC
          // confirmation must not fail a sale that is already in flight.
        });
        return { rail: "lifi", requestId: sig, txHash: sig, estimatedOutput: quote.toAmount };
      }

      const quote = await fetchSellQuote({
        network,
        asset,
        amount,
        recipient,
        refundTo,
        slippageBps,
      });
      const txHash = await sendToken({
        network,
        tokenAddress: asset,
        decimals,
        to: quote.depositAddress,
        amount,
      });
      return {
        rail: "dextopus",
        requestId: quote.requestId,
        txHash,
        estimatedOutput: quote.estimatedOutput,
      };
    },
  });
}
