"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { useSponsoredSolanaSend } from "@/hooks/use-sponsored-solana";
import { useSendToken } from "@/hooks/use-withdraw";
import { fetchSellQuote, shouldFallbackFromSellQuote } from "@/lib/sell";
import { BASE_USDC, LIFI_BASE_CHAIN, LIFI_NATIVE_SOL } from "@/lib/trade/funding";
import { maxLifiNativeSolSellable } from "@/lib/trade/gas-buffer";
import { fetchSolanaBridgeQuote } from "@/lib/trade/lifi";
import { fetchConfirmedSolanaBalance, SolanaBalanceChangedError } from "@/lib/trade/solana-balance";
import { confirmSolanaSignature } from "@/lib/trade/solana-confirm";
import { getWalletAddress } from "@/lib/user";

export interface SolanaToBaseInput {
  asset: string | null;
  decimals: number;
  amount: bigint;
  slippageBps: number;
  maxRequested?: boolean;
}

export interface SolanaToBaseResult {
  rail: "dextopus" | "lifi";
  requestId: string;
  txHash: string;
  estimatedOutput: bigint;
}

// One Solana settlement executor for spot sales and post-RWA proceeds. It
// reads confirmed balances, prefers Dextopus's direct deposit route, falls
// back to LI.FI only for a minimum/no-route rejection, and always targets Base
// USDC. No path swaps the proceeds back into SOL.
export function useSolanaToBase() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { sendToken } = useSendToken();
  const sendSponsored = useSponsoredSolanaSend();

  return useCallback(
    async ({
      asset,
      decimals,
      amount,
      slippageBps,
      maxRequested = false,
    }: SolanaToBaseInput): Promise<SolanaToBaseResult> => {
      const recipient = getWalletAddress(user, "ethereum");
      const refundTo = getWalletAddress(user, "solana");
      if (!recipient) throw new Error("No Base wallet is connected.");
      if (!refundTo) throw new Error("No Solana wallet is connected.");

      const liveBalance = await fetchConfirmedSolanaBalance(refundTo, asset);

      // The portfolio index can lag a prior transaction. Determine the amount
      // that the eventual rail can really spend, update the UI, and require a
      // fresh confirmation instead of silently shrinking an interactive sale.
      if (amount > liveBalance) {
        let available = liveBalance;
        if (asset === null && liveBalance > 0n) {
          try {
            await fetchSellQuote({
              network: "solana-mainnet",
              asset,
              amount: liveBalance,
              recipient,
              refundTo,
              slippageBps,
            });
          } catch (error) {
            if (shouldFallbackFromSellQuote(error)) {
              available = maxLifiNativeSolSellable(liveBalance);
            }
          }
        }
        throw new SolanaBalanceChangedError(available, maxRequested);
      }

      const executeLifiFallback = async (): Promise<SolanaToBaseResult> => {
        const available = asset === null ? maxLifiNativeSolSellable(liveBalance) : liveBalance;
        if (amount > available) {
          throw new SolanaBalanceChangedError(available, maxRequested);
        }

        const wallet = wallets.find((candidate) => candidate.address === refundTo);
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
        const signature = await sendSponsored({ transaction: quote.transaction, wallet });
        await confirmSolanaSignature(signature).catch(() => {
          // LI.FI's settlement status is authoritative if RPC confirmation is
          // delayed after the sponsor has already submitted the transaction.
        });
        return {
          rail: "lifi",
          requestId: signature,
          txHash: signature,
          estimatedOutput: quote.toAmount,
        };
      };

      let quote: Awaited<ReturnType<typeof fetchSellQuote>>;
      try {
        quote = await fetchSellQuote({
          network: "solana-mainnet",
          asset,
          amount,
          recipient,
          refundTo,
          slippageBps,
        });
      } catch (error) {
        if (shouldFallbackFromSellQuote(error)) return executeLifiFallback();
        throw error;
      }

      try {
        const txHash = await sendToken({
          network: "solana-mainnet",
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
      } catch (error) {
        // A missing SPL deposit ATA can require rent from the source account
        // even though the sponsor pays the transaction fee. Blanket rent
        // prefunding would subsidize arbitrary accounts, so use the existing
        // LI.FI route only for this narrowly identified preflight failure.
        const message = error instanceof Error ? error.message : String(error);
        if (/(?:insufficient funds for rent|insufficient lamports)/i.test(message)) {
          return executeLifiFallback();
        }
        throw error;
      }
    },
    [user, wallets, sendToken, sendSponsored]
  );
}
