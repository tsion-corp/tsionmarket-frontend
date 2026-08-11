"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { encodeFunctionData } from "viem";
import { useEvmSend, useEvmSendBatch, type EvmBatchCall } from "@/hooks/use-evm-send";
import { awaitReceipt, publicClientForChain } from "@/lib/trade/receipt";
import { encodeApprove } from "@/lib/trade/erc20";
import { getWalletAddress } from "@/lib/user";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { PREDICTION_ABI } from "@/features/prediction/lib/abi";
import { fromBaseUnits } from "@/lib/trade/math";
import { minOut, quoteBuy, quoteSell } from "@/features/prediction/lib/math";
import {
  readPoolState,
  readShareBalance,
  readUsdcAllowance,
  readUsdcBalance,
} from "@/features/prediction/lib/chain-reads";
import {
  CREATION_FEE_USDC,
  LARGE_APPROVAL_USDC,
  PREDICTION_CHAIN_ID,
  USDC_ADDRESS,
  needsApproval,
  predictionContractAddress,
  sideToUint,
} from "@/features/prediction/lib/logic";
import { USDC_DECIMALS, type Outcome, type Side } from "@/features/prediction/lib/types";

// Thrown when a spend would exceed the wallet's on-chain USDC balance. Carries
// the human-readable required/available amounts for a specific error message.
class InsufficientUsdcError extends Error {
  constructor(
    readonly required: string,
    readonly balance: string
  ) {
    super("Insufficient USDC balance");
    this.name = "InsufficientUsdcError";
  }
}

// Orchestrates every on-chain prediction-market action from the user's embedded
// wallet, gaslessly on Base. Value-moving calls that spend USDC (buy, create,
// add liquidity) batch an allowance-gated approve with the action into ONE
// atomic sponsored operation, so the allowance can never be read stale between
// the two and the user signs once. Slippage guards are always computed from a
// FRESH on-chain reserve read, never a cached REST/WS value.

export type PredictionPhase = "idle" | "reading" | "signing" | "settling";

// Default slippage tolerance for quote-guarded trades (0.5%).
const DEFAULT_TOLERANCE_BPS = 50;

// Maps our resolution outcome to the contract's uint8 (1 = Yes, 2 = No).
function outcomeToUint(outcome: Exclude<Outcome, "Unresolved">): 1 | 2 {
  return outcome === "Yes" ? 1 : 2;
}

export interface BuyInput {
  marketId: bigint;
  side: Side;
  usdcIn: bigint;
  toleranceBps?: number;
}

export interface SellInput {
  marketId: bigint;
  side: Side;
  sharesIn: bigint;
  toleranceBps?: number;
}

export interface AddLiquidityInput {
  marketId: bigint;
  usdcIn: bigint;
  minLpOut?: bigint;
}

export interface RemoveLiquidityInput {
  marketId: bigint;
  lpIn: bigint;
  minUsdcOut?: bigint;
}

export interface ReturnLiquidityInput {
  marketId: bigint;
  // The whole LP position: this is a full exit, never partial.
  lpIn: bigint;
  // The side that resolved Yes, whose shares redeem 1:1.
  side: Side;
}

export interface CreateMarketInput {
  marketId: bigint;
  closeTime: number; // unix seconds
  seedUsdc: bigint;
}

export function usePredictionActions() {
  const t = useTranslations("prediction");
  const { user } = usePrivy();
  const sendBatch = useEvmSendBatch();
  const send = useEvmSend();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<PredictionPhase>("idle");

  const wallet = getWalletAddress(user, "ethereum");

  // Refetch everything the action could have changed. Broad by design: a trade
  // moves reserves, positions, trades, and the chart at once.
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["prediction"] });
  }, [queryClient]);

  // One send-and-confirm for a batch of calls, with the shared phase lifecycle.
  const runBatch = useCallback(
    async (calls: EvmBatchCall[]): Promise<boolean> => {
      setPhase("signing");
      const hash = await sendBatch(calls, PREDICTION_CHAIN_ID);
      setPhase("settling");
      await awaitReceipt(publicClientForChain(PREDICTION_CHAIN_ID), hash, t("confirmingOnChain"));
      invalidate();
      return true;
    },
    [sendBatch, invalidate, t]
  );

  // Reads the wallet's live USDC balance and throws a specific
  // InsufficientUsdcError when it cannot cover `spend`, so the caller can show a
  // clear "insufficient balance" message instead of letting the sponsored tx
  // revert on transferFrom with an opaque reason.
  const ensureUsdcBalance = useCallback(
    async (spend: bigint): Promise<void> => {
      if (!wallet) throw new Error("No wallet connected.");
      const balance = await readUsdcBalance(wallet);
      if (balance < spend) {
        throw new InsufficientUsdcError(
          fromBaseUnits(spend, USDC_DECIMALS),
          fromBaseUnits(balance, USDC_DECIMALS)
        );
      }
    },
    [wallet]
  );

  // Builds the USDC approve call when the current allowance does not cover the
  // spend. A large approval means later trades skip this step.
  const approveIfNeeded = useCallback(
    async (spend: bigint): Promise<EvmBatchCall[]> => {
      if (!wallet) throw new Error("No wallet connected.");
      const allowance = await readUsdcAllowance(wallet);
      if (!needsApproval(allowance, spend)) return [];
      return [
        {
          to: USDC_ADDRESS as `0x${string}`,
          data: encodeApprove(predictionContractAddress(), LARGE_APPROVAL_USDC),
        },
      ];
    },
    [wallet]
  );

  const buyShares = useCallback(
    async ({
      marketId,
      side,
      usdcIn,
      toleranceBps = DEFAULT_TOLERANCE_BPS,
    }: BuyInput): Promise<boolean> => {
      if (!wallet) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t("placingBet"));
      try {
        setPhase("reading");
        const pool = await readPoolState(marketId);
        const { sharesOut } = quoteBuy(pool.rYes, pool.rNo, side, usdcIn, pool.feeBps);
        const minSharesOut = minOut(sharesOut, toleranceBps);

        await ensureUsdcBalance(usdcIn);
        const calls = await approveIfNeeded(usdcIn);
        calls.push({
          to: predictionContractAddress(),
          data: encodeFunctionData({
            abi: PREDICTION_ABI,
            functionName: "buy",
            args: [marketId, sideToUint(side), usdcIn, minSharesOut],
          }),
        });
        toast.loading(t("confirmingOnChain"), { id: toastId });
        await runBatch(calls);
        toast.success(t(side === "yes" ? "betPlacedYes" : "betPlacedNo"), { id: toastId });
        return true;
      } catch (error) {
        if (error instanceof InsufficientUsdcError) {
          toast.error(t("insufficientUsdc", { required: error.required, balance: error.balance }), {
            id: toastId,
          });
          return false;
        }
        // Log the raw reason: friendlyError hides RPC/sponsorship text from the
        // toast, so the console is where a failed trade's real cause shows up.
        console.error("[prediction] buy failed", error);
        toast.error(friendlyError(error, t("betFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [wallet, ensureUsdcBalance, approveIfNeeded, runBatch, t]
  );

  const sellShares = useCallback(
    async ({
      marketId,
      side,
      sharesIn,
      toleranceBps = DEFAULT_TOLERANCE_BPS,
    }: SellInput): Promise<boolean> => {
      if (!wallet) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t("cashingOutPosition"));
      try {
        setPhase("reading");
        const pool = await readPoolState(marketId);
        const { usdcOut } = quoteSell(pool.rYes, pool.rNo, side, sharesIn, pool.feeBps);
        const minUsdcOut = minOut(usdcOut, toleranceBps);

        // Selling burns the user's ERC-1155 shares; no USDC is spent, so no
        // approve is needed.
        toast.loading(t("confirmingOnChain"), { id: toastId });
        await runBatch([
          {
            to: predictionContractAddress(),
            data: encodeFunctionData({
              abi: PREDICTION_ABI,
              functionName: "sell",
              args: [marketId, sideToUint(side), sharesIn, minUsdcOut],
            }),
          },
        ]);
        toast.success(t("positionSold"), { id: toastId });
        return true;
      } catch (error) {
        console.error("[prediction] sell failed", error);
        toast.error(friendlyError(error, t("sellFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [wallet, runBatch, t]
  );

  const addLiquidity = useCallback(
    async ({ marketId, usdcIn, minLpOut = 0n }: AddLiquidityInput): Promise<boolean> => {
      if (!wallet) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t("addingLiquidity"));
      try {
        setPhase("reading");
        await ensureUsdcBalance(usdcIn);
        const calls = await approveIfNeeded(usdcIn);
        calls.push({
          to: predictionContractAddress(),
          data: encodeFunctionData({
            abi: PREDICTION_ABI,
            functionName: "addLiquidity",
            args: [marketId, usdcIn, minLpOut],
          }),
        });
        toast.loading(t("confirmingOnChain"), { id: toastId });
        await runBatch(calls);
        toast.success(t("liquidityAdded"), { id: toastId });
        return true;
      } catch (error) {
        if (error instanceof InsufficientUsdcError) {
          toast.error(t("insufficientUsdc", { required: error.required, balance: error.balance }), {
            id: toastId,
          });
          return false;
        }
        toast.error(friendlyError(error, t("liquidityFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [wallet, ensureUsdcBalance, approveIfNeeded, runBatch, t]
  );

  const removeLiquidity = useCallback(
    async ({ marketId, lpIn, minUsdcOut = 0n }: RemoveLiquidityInput): Promise<boolean> => {
      if (!wallet) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t("removingLiquidity"));
      try {
        // LP shares are burned; nothing is spent, so no approve.
        toast.loading(t("confirmingOnChain"), { id: toastId });
        await runBatch([
          {
            to: predictionContractAddress(),
            data: encodeFunctionData({
              abi: PREDICTION_ABI,
              functionName: "removeLiquidity",
              args: [marketId, lpIn, minUsdcOut],
            }),
          },
        ]);
        toast.success(t("liquidityRemoved"), { id: toastId });
        return true;
      } catch (error) {
        toast.error(friendlyError(error, t("liquidityFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [wallet, runBatch, t]
  );

  const createMarket = useCallback(
    async ({ marketId, closeTime, seedUsdc }: CreateMarketInput): Promise<boolean> => {
      if (!wallet) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t("creatingMarket"));
      try {
        setPhase("reading");
        // The spend is the seed plus the flat creation fee; both the balance
        // check and the approval are gated on it.
        const spend = seedUsdc + CREATION_FEE_USDC;
        await ensureUsdcBalance(spend);
        const calls = await approveIfNeeded(spend);
        calls.push({
          to: predictionContractAddress(),
          data: encodeFunctionData({
            abi: PREDICTION_ABI,
            functionName: "createMarket",
            args: [marketId, BigInt(closeTime), seedUsdc],
          }),
        });
        toast.loading(t("confirmingOnChain"), { id: toastId });
        await runBatch(calls);
        toast.success(t("marketCreated"), { id: toastId });
        return true;
      } catch (error) {
        if (error instanceof InsufficientUsdcError) {
          toast.error(t("insufficientUsdc", { required: error.required, balance: error.balance }), {
            id: toastId,
          });
          return false;
        }
        // Log the raw reason: friendlyError hides RPC/sponsorship text from the
        // toast, so the console is where a failed creation's real cause shows up.
        console.error("[prediction] createMarket failed", error);
        toast.error(friendlyError(error, t("createMarketFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [wallet, ensureUsdcBalance, approveIfNeeded, runBatch, t]
  );

  // One-call actions that spend nothing: run through the single send path.
  const runSingle = useCallback(
    async (
      data: `0x${string}`,
      loadingKey: string,
      successKey: string,
      failKey: string
    ): Promise<boolean> => {
      if (!wallet) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t(loadingKey));
      try {
        setPhase("signing");
        const hash = await send({
          to: predictionContractAddress(),
          data,
          chainId: PREDICTION_CHAIN_ID,
        });
        setPhase("settling");
        await awaitReceipt(publicClientForChain(PREDICTION_CHAIN_ID), hash, t("confirmingOnChain"));
        invalidate();
        toast.success(t(successKey), { id: toastId });
        return true;
      } catch (error) {
        toast.error(friendlyError(error, t(failKey)), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [wallet, send, invalidate, t]
  );

  const resolveMarket = useCallback(
    (marketId: bigint, outcome: Exclude<Outcome, "Unresolved">) =>
      runSingle(
        encodeFunctionData({
          abi: PREDICTION_ABI,
          functionName: "resolve",
          args: [marketId, outcomeToUint(outcome)],
        }),
        "resolvingMarket",
        "marketResolved",
        "resolveFailed"
      ),
    [runSingle]
  );

  // Returns a market creator's seed liquidity after resolution, end to end.
  //
  // There is no manual withdrawal any more, so this is the only path that pays a
  // creator back, and it has to leave nothing behind. Withdrawing LP from a
  // resolved pool returns USDC plus leftover outcome shares; the winning shares
  // are worth $1 each but only once redeemed, and redeemed value lands in
  // pendingWithdrawals rather than the wallet. Stopping after the withdrawal
  // would strand most of the money one step short.
  //
  // Two transactions, not one: the exact share count is only knowable after the
  // withdrawal has executed, so it is READ from the chain in between rather than
  // predicted. Redeeming a predicted amount that came out one unit high reverts
  // and strands the lot.
  const returnLiquidity = useCallback(
    async ({ marketId, lpIn, side }: ReturnLiquidityInput): Promise<boolean> => {
      if (!wallet) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t("lpReturning"));
      try {
        // 1. Burn the LP position. minUsdcOut is 0 because a resolved market's
        // reserves no longer move: there is no trade left to slip against.
        toast.loading(t("confirmingOnChain"), { id: toastId });
        await runBatch([
          {
            to: predictionContractAddress(),
            data: encodeFunctionData({
              abi: PREDICTION_ABI,
              functionName: "removeLiquidity",
              args: [marketId, lpIn, 0n],
            }),
          },
        ]);

        // 2. Redeem whatever winning shares that actually produced, then pull
        // the credited balance out. Both in one batch so the money cannot come
        // to rest in pendingWithdrawals if the second leg fails.
        setPhase("reading");
        const shares = await readShareBalance(wallet, marketId, side);
        if (shares > 0n) {
          await runBatch([
            {
              to: predictionContractAddress(),
              data: encodeFunctionData({
                abi: PREDICTION_ABI,
                functionName: "redeem",
                args: [marketId, sideToUint(side), shares],
              }),
            },
            {
              to: predictionContractAddress(),
              data: encodeFunctionData({ abi: PREDICTION_ABI, functionName: "claim", args: [] }),
            },
          ]);
        }
        toast.success(t("lpReturned"), { id: toastId });
        return true;
      } catch (error) {
        console.error("[prediction] returnLiquidity failed", { marketId, lpIn, side, error });
        toast.error(friendlyError(error, t("lpReturnFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [wallet, runBatch, t]
  );

  // Resolves a whole neg-risk event in one transaction: the winner settles Yes
  // and every sibling settles No, atomically. This is the ONLY way to resolve a
  // grouped market, since resolve() on a member reverts with "neg-risk member".
  const resolveEvent = useCallback(
    (groupId: bigint, winnerMarketId: bigint) =>
      runSingle(
        encodeFunctionData({
          abi: PREDICTION_ABI,
          functionName: "resolveNegRiskGroup",
          args: [groupId, winnerMarketId],
        }),
        "resolvingMarket",
        "marketResolved",
        "resolveFailed"
      ),
    [runSingle]
  );

  const closeMarket = useCallback(
    (marketId: bigint) =>
      runSingle(
        encodeFunctionData({ abi: PREDICTION_ABI, functionName: "close", args: [marketId] }),
        "closingMarket",
        "marketClosed",
        "closeFailed"
      ),
    [runSingle]
  );

  // Success copy is this market's own, not the Polymarket flow's: redeeming
  // here credits the contract's pendingWithdrawals, it does not send USDC to
  // Base. The old shared string promised a transfer that never happened.
  const redeem = useCallback(
    (marketId: bigint, side: Side, shares: bigint) =>
      runSingle(
        encodeFunctionData({
          abi: PREDICTION_ABI,
          functionName: "redeem",
          args: [marketId, sideToUint(side), shares],
        }),
        "toastClaiming",
        "toastRedeemSuccess",
        "toastClaimFailed"
      ),
    [runSingle]
  );

  const claim = useCallback(
    () =>
      runSingle(
        encodeFunctionData({ abi: PREDICTION_ABI, functionName: "claim", args: [] }),
        "toastClaiming",
        "toastClaimSuccess",
        "toastClaimFailed"
      ),
    [runSingle]
  );

  // Reads the wallet's share balance for a side, so a "sell all" can pass the
  // exact on-chain amount.
  const shareBalance = useCallback(
    (marketId: bigint, side: Side): Promise<bigint> => {
      if (!wallet) return Promise.resolve(0n);
      return readShareBalance(wallet, marketId, side);
    },
    [wallet]
  );

  return {
    buyShares,
    sellShares,
    addLiquidity,
    removeLiquidity,
    createMarket,
    returnLiquidity,
    resolveMarket,
    resolveEvent,
    closeMarket,
    redeem,
    claim,
    shareBalance,
    phase,
    busy: phase !== "idle",
    wallet,
  };
}
