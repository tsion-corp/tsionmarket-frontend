"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi } from "viem";
import { friendlyError } from "@/lib/errors";
import { usePolymarketSession } from "@/features/prediction/hooks/use-polymarket-session";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { useSendToken } from "@/hooks/use-withdraw";
import { getWalletAddress } from "@/lib/user";
import { CONTRACTS, POLYGON_CHAIN_ID } from "@/lib/polymarket/config";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { fetchSellQuote } from "@/lib/sell";
import { publicClientForChain, type ChainReadClient } from "@/lib/trade/receipt";

// Turns pUSD (Polymarket collateral, on Polygon) into USDC on Base, in the
// user's own wallet. Polymarket's offramp only exists on Polygon, so the path is
// pUSD -> USDC.e (offramp) -> USDC on Base (Dextopus bridge; it accepts USDC.e
// directly, so no on-Polygon swap is needed). The EOA's Polygon transactions use
// the app's existing Alchemy-sponsored send path, so users do not need POL.
//
// It is balance-driven and resumable: it offramps whatever pUSD the account
// holds, then bridges whatever USDC.e the wallet holds. A run that failed after
// unwrapping (funds sitting as USDC.e) is recovered by simply running again.

// CollateralOfframp.unwrap(asset, to, amount): burns pUSD, sends USDC.e to `to`.
const OFFRAMP_ABI = [
  {
    type: "function",
    name: "unwrap",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_asset", type: "address" },
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export type SettlePhase = "idle" | "unwrapping" | "bridging";

// A user-facing settle error whose message is shown verbatim.
class SettleError extends Error {}

function readErc20(client: ChainReadClient, token: string, owner: string): Promise<bigint> {
  return client.readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner as `0x${string}`],
  });
}

export function useSettleToBase() {
  const { user } = usePrivy();
  const { ensureReady } = usePolymarketSession();
  const sendBatch = useEvmSendBatch();
  const { sendToken } = useSendToken();
  const [phase, setPhase] = useState<SettlePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const settleToBase = useCallback(async (): Promise<void> => {
    setError(null);
    setPhase("unwrapping");
    try {
      const eoa = getWalletAddress(user, "ethereum");
      if (!eoa) throw new SettleError("No wallet connected.");

      const polygon = publicClientForChain(POLYGON_CHAIN_ID);

      const client = await ensureReady();
      const depositWallet = client.account.wallet;

      // 1) Move pUSD from the Deposit Wallet into the EOA. A previous attempt
      // may already have completed this transfer before failing, so the unwrap
      // below always reads and consumes the EOA's actual balance.
      const depositPusd = await readErc20(polygon, CONTRACTS.pusd, depositWallet);
      if (depositPusd > 0n) {
        setPhase("unwrapping");
        const transfer = await client.transferErc20({
          tokenAddress: CONTRACTS.pusd,
          recipientAddress: eoa,
          amount: depositPusd,
        });
        await transfer.wait();
      }

      const walletPusd = await readErc20(polygon, CONTRACTS.pusd, eoa);
      if (walletPusd > 0n) {
        // Approve and unwrap in one sponsored Polygon batch.
        await sendBatch(
          [
            {
              to: CONTRACTS.pusd,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [CONTRACTS.collateralOfframp as `0x${string}`, walletPusd],
              }),
            },
            {
              to: CONTRACTS.collateralOfframp,
              data: encodeFunctionData({
                abi: OFFRAMP_ABI,
                functionName: "unwrap",
                args: [CONTRACTS.usdcE as `0x${string}`, eoa as `0x${string}`, walletPusd],
              }),
            },
          ],
          POLYGON_CHAIN_ID
        );
      }

      // 2) Bridge all the USDC.e the wallet holds to USDC on Base (Dextopus takes
      // USDC.e directly, so no on-Polygon swap). Read the real balance so we send
      // exactly what's there.
      setPhase("bridging");
      const usdce = await readErc20(polygon, CONTRACTS.usdcE, eoa);
      if (usdce <= 0n) throw new SettleError("There's nothing to cash out right now.");

      const quote = await fetchSellQuote({
        network: "polygon-mainnet",
        asset: CONTRACTS.usdcE,
        amount: usdce,
        recipient: eoa,
        refundTo: eoa,
        slippageBps: 100,
      });
      await sendToken({
        network: "polygon-mainnet",
        tokenAddress: CONTRACTS.usdcE,
        decimals: SETTLE_CHAINS.polygon.decimals,
        to: quote.depositAddress,
        amount: usdce,
      });
    } catch (e) {
      setError(
        e instanceof SettleError ? e.message : friendlyError(e, "Couldn't cash out. Try again.")
      );
      throw e;
    } finally {
      setPhase("idle");
    }
  }, [user, ensureReady, sendBatch, sendToken]);

  return { settleToBase, phase, error };
}
