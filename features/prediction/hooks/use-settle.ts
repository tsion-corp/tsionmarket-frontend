"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi } from "viem";
import { friendlyError } from "@/lib/errors";
import { usePolymarketSession } from "@/features/prediction/hooks/use-polymarket-session";
import { refreshCollateralUsd } from "@/features/prediction/lib/polymarket/collateral";
import { savePendingPredictionCashout } from "@/features/prediction/lib/pending-cashout";
import { executeGaslessCalls } from "@/features/prediction/lib/polymarket/secure-client";
import { useEvmSend } from "@/hooks/use-evm-send";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSendToken } from "@/hooks/use-withdraw";
import { getWalletAddress } from "@/lib/user";
import { CONTRACTS, POLYGON_CHAIN_ID } from "@/lib/polymarket/config";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { fetchSellQuote } from "@/lib/sell";
import { publicClientForChain, type ChainReadClient } from "@/lib/trade/receipt";

// Turns pUSD (Polymarket collateral, on Polygon) into USDC on Base, in the
// user's own wallet. Polymarket's offramp only exists on Polygon, so the path is
// pUSD -> USDC.e (offramp) -> USDC on Base (Dextopus bridge; it accepts USDC.e
// directly, so no on-Polygon swap is needed). The unwrap runs inside the
// Polymarket Deposit Wallet through its relayer. Alchemy sponsors the embedded
// wallet's ERC-20 sends, so users do not need POL.
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

export type SettlePhase = "idle" | "transferring" | "unwrapping" | "quoting" | "bridging";

export interface SettleToBaseResult {
  requestId: string;
  originTxHash: string;
  estimatedBaseUsd: number;
}

// A user-facing settle error whose message is shown verbatim.
export class SettleError extends Error {}

function readErc20(client: ChainReadClient, token: string, owner: string): Promise<bigint> {
  return client.readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner as `0x${string}`],
  });
}

const BALANCE_TIMEOUT_MS = 30_000;
const BALANCE_POLL_MS = 750;

async function waitForErc20Balance(
  client: ChainReadClient,
  token: string,
  owner: string,
  atLeast: bigint,
  label: string
): Promise<bigint> {
  const deadline = Date.now() + BALANCE_TIMEOUT_MS;
  let balance = 0n;
  while (Date.now() < deadline) {
    balance = await readErc20(client, token, owner);
    if (balance >= atLeast) return balance;
    await new Promise((resolve) => setTimeout(resolve, BALANCE_POLL_MS));
  }
  throw new SettleError(`${label} is still confirming. Your funds are safe; try Cashout again.`);
}

export function useSettleToBase() {
  const { user } = usePrivy();
  const { ensureReady } = usePolymarketSession();
  const sendEvm = useEvmSend();
  const { sendToken } = useSendToken();
  const { refetchFresh } = usePortfolio();
  const [phase, setPhase] = useState<SettlePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const settleToBase = useCallback(async (): Promise<SettleToBaseResult> => {
    setError(null);
    setPhase("transferring");
    let failedPhase: Exclude<SettlePhase, "idle"> = "transferring";
    const advance = (next: Exclude<SettlePhase, "idle">) => {
      failedPhase = next;
      setPhase(next);
    };
    try {
      const eoa = getWalletAddress(user, "ethereum");
      if (!eoa) throw new SettleError("No wallet connected.");

      const polygon = publicClientForChain(POLYGON_CHAIN_ID);

      const client = await ensureReady();
      const depositWallet = client.account.wallet;

      // A previous version moved pUSD into the EOA before unwrapping. Recover
      // that balance first, then perform the supported approve + unwrap batch
      // directly from the Deposit Wallet.
      let [depositPusd, walletPusd] = await Promise.all([
        readErc20(polygon, CONTRACTS.pusd, depositWallet),
        readErc20(polygon, CONTRACTS.pusd, eoa),
      ]);
      if (walletPusd > 0n && depositWallet.toLowerCase() !== eoa.toLowerCase()) {
        advance("transferring");
        await sendEvm({
          to: CONTRACTS.pusd,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [depositWallet as `0x${string}`, walletPusd],
          }),
          chainId: POLYGON_CHAIN_ID,
          address: eoa,
        });
        depositPusd = await waitForErc20Balance(
          polygon,
          CONTRACTS.pusd,
          depositWallet,
          depositPusd + walletPusd,
          "The sponsored pUSD recovery"
        );
        walletPusd = 0n;
      }

      if (walletPusd > 0n) {
        throw new SettleError("This Polymarket account type cannot cash out pUSD yet.");
      }

      if (depositPusd > 0n) {
        advance("unwrapping");
        const startingUsdce = await readErc20(polygon, CONTRACTS.usdcE, eoa);
        const conversion = await executeGaslessCalls(
          client,
          [
            {
              to: CONTRACTS.pusd,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [CONTRACTS.collateralOfframp as `0x${string}`, depositPusd],
              }),
            },
            {
              to: CONTRACTS.collateralOfframp,
              data: encodeFunctionData({
                abi: OFFRAMP_ABI,
                functionName: "unwrap",
                args: [CONTRACTS.usdcE as `0x${string}`, eoa as `0x${string}`, depositPusd],
              }),
            },
          ],
          `Cash out ${depositPusd} pUSD to USDC.e`
        );
        await conversion.wait();
        await refreshCollateralUsd(client).catch(() => 0);
        await waitForErc20Balance(
          polygon,
          CONTRACTS.usdcE,
          eoa,
          startingUsdce + depositPusd,
          "The Polymarket pUSD conversion"
        );
      }

      // 2) Bridge all the USDC.e the wallet holds to USDC on Base (Dextopus takes
      // USDC.e directly, so no on-Polygon swap). Read the real balance so we send
      // exactly what's there.
      advance("bridging");
      const usdce = await readErc20(polygon, CONTRACTS.usdcE, eoa);
      if (usdce <= 0n) throw new SettleError("There's nothing to cash out right now.");

      advance("quoting");
      const quote = await fetchSellQuote({
        network: "polygon-mainnet",
        asset: CONTRACTS.usdcE,
        amount: usdce,
        recipient: eoa,
        refundTo: eoa,
        slippageBps: 100,
      });
      advance("bridging");
      const pending = {
        requestId: quote.requestId,
        wallet: eoa,
        expectedBaseUsdcRaw: quote.estimatedOutput.toString(),
        createdAt: Date.now(),
      };
      // Persist before the sponsored send. If the browser loses the response
      // after broadcast, the background tracker can still reconcile this exact
      // Dextopus request instead of asking the user to send the funds twice.
      savePendingPredictionCashout(pending);
      let originTxHash: string;
      try {
        originTxHash = await sendToken({
          network: "polygon-mainnet",
          tokenAddress: CONTRACTS.usdcE,
          decimals: SETTLE_CHAINS.polygon.decimals,
          to: quote.depositAddress,
          amount: usdce,
        });
      } catch (cause) {
        throw new SettleError(
          "The Base transfer was interrupted after it started. Do not resend it; status tracking will continue automatically.",
          { cause }
        );
      }
      savePendingPredictionCashout({ ...pending, originTxHash });
      void refetchFresh();
      return {
        requestId: quote.requestId,
        originTxHash,
        estimatedBaseUsd: Number(quote.estimatedOutput) / 10 ** SETTLE_CHAINS.base.decimals,
      };
    } catch (e) {
      console.error("Prediction cashout settlement failed", { phase: failedPhase, error: e });
      const normalized =
        e instanceof SettleError ? e.message : friendlyError(e, "Couldn't cash out. Try again.");
      const phaseMessage: Record<Exclude<SettlePhase, "idle">, string> = {
        transferring:
          "Your market sale is safe, but pUSD could not be returned to the Polymarket wallet. Use Move to Base to retry.",
        unwrapping:
          "Your market sale is safe, but Polymarket could not convert the pUSD yet. Use Move to Base to retry.",
        quoting:
          "Your USDC.e is safe on Polygon, but no Base cashout route is available yet. Use Move to Base to retry.",
        bridging:
          "Your USDC.e is safe on Polygon, but the Base transfer did not start. Use Move to Base to retry.",
      };
      const message = normalized.startsWith("The network rejected this transaction")
        ? phaseMessage[failedPhase]
        : normalized;
      setError(message);
      throw e instanceof SettleError ? e : new SettleError(message, { cause: e });
    } finally {
      setPhase("idle");
    }
  }, [user, ensureReady, sendEvm, sendToken, refetchFresh]);

  return { settleToBase, phase, error };
}
