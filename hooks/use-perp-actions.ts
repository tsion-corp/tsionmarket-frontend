"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { usePerpOrders } from "@/hooks/use-perp-orders";
import { usePerpPositions } from "@/hooks/use-perp-positions";
import { readUsdcAllowance } from "@/lib/perp/allowance";
import {
  buildApproveUsdc,
  buildCancelOrder,
  buildCloseTrade,
  buildOpenTrade,
  buildUpdateMargin,
  buildUpdateTpSl,
  fetchPerpOrders,
  fetchPerpPositions,
} from "@/lib/perp/api";
import { usePortfolio } from "@/hooks/use-portfolio";
import { LARGE_APPROVAL_USDC, PERP_CHAIN_ID, needsApproval } from "@/lib/perp/logic";
import { stepsTotalValueWei, toSignableCalls } from "@/lib/perp/steps";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { BuildResult, OpenPosition, OpenTradeRequest, PerpOrder } from "@/lib/perp/types";

// Orchestrates the non-custodial perp flows end to end. The backend only ever
// returns unsigned steps; everything here is signed by the user's embedded
// wallet through the app's single EVM send path.
//
// Account identity: the perp doc warns that under ERC-4337 the `trader` must
// be the smart-account address, not the EOA. Our gasless path is EIP-7702 —
// the embedded EOA is upgraded IN PLACE at the same address (see
// lib/trade/sponsor.ts) — so `trader` here and the sponsored sender are
// the same address by construction. Do not "fix" this to a separate
// smart-account address.
//
// Opening batches the (optional) USDC approval and the open into ONE atomic
// sponsored operation on Base. The doc's allowance race (an open sent right
// after an approve reverting on a stale RPC read) cannot happen in a batch:
// both calls execute in order inside a single transaction. It also means one
// signature instead of two, and the approval is large so later opens skip it.
//
// Market opens and closes are keeper-executed with a delay, so after the
// transaction confirms we poll positions until the change is visible and only
// then report success.

export type PerpPhase = "idle" | "building" | "signing" | "settling";

export function usePerpActions(live = true) {
  const t = useTranslations("perps");
  const sendBatch = useEvmSendBatch();
  const { positions, waitForChange, trader } = usePerpPositions(live);
  const { orders, waitForChange: waitForOrdersChange } = usePerpOrders(live);
  const portfolio = usePortfolio();
  const [phase, setPhase] = useState<PerpPhase>("idle");

  // Gas is sponsored, but the keeper execution fee on open/close is msg.value
  // from the user's own Base ETH. Checking before signing turns a cryptic
  // bundler failure into a plain "you need a little ETH" message. The
  // portfolio balance is a display float, so the compare allows a hair of
  // slack rather than blocking on rounding.
  const ensureExecutionFee = useCallback(
    (builds: BuildResult[]): string | null => {
      const totalWei = stepsTotalValueWei(builds);
      if (totalWei === 0n || portfolio.loading) return null;
      const needEth = Number(totalWei) / 1e18;
      const held = portfolio.tokens
        .filter((tok) => tok.network === "base-mainnet" && tok.symbol.toUpperCase() === "ETH")
        .reduce((sum, tok) => sum + tok.balance, 0);
      if (held + 1e-9 >= needEth) return null;
      return t("needExecutionFee", { amount: needEth.toFixed(5) });
    },
    [portfolio.loading, portfolio.tokens, t]
  );

  const openTrade = useCallback(
    async (req: Omit<OpenTradeRequest, "trader">, pairIndex?: number): Promise<boolean> => {
      if (!trader) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t("preparingTrade"));
      setPhase("building");
      try {
        // Fresh snapshots before the tx: a cold cache would make any
        // pre-existing entry read as "new".
        const resting = req.orderType === "limit" || req.orderType === "stop_limit";
        const before = new Set(
          (await fetchPerpPositions(trader).catch(() => positions)).map(
            (p) => `${p.pairIndex}:${p.index}`
          )
        );
        const beforeOrders = resting
          ? new Set(
              (await fetchPerpOrders(trader).catch(() => orders)).map(
                (o) => `${o.pairIndex}:${o.index}`
              )
            )
          : new Set<string>();

        // One allowance read decides whether the approve rides along. The
        // approve is large so the next open goes straight through.
        const allowance = await readUsdcAllowance(trader);
        const builds: BuildResult[] = [];
        if (needsApproval(allowance, req.collateralUsdc)) {
          builds.push(await buildApproveUsdc(LARGE_APPROVAL_USDC));
        }
        builds.push(await buildOpenTrade({ ...req, trader }));

        const feeShortfall = ensureExecutionFee(builds);
        if (feeShortfall) {
          toast.error(feeShortfall, { id: toastId });
          return false;
        }

        setPhase("signing");
        toast.loading(t("confirmingOnBase"), { id: toastId });
        await sendBatch(toSignableCalls(builds), PERP_CHAIN_ID);

        void portfolio.refetch();

        setPhase("settling");
        // Only a matching pair counts as this order's fill.
        const isOurs = (candidatePairIndex: number) =>
          pairIndex == null || candidatePairIndex === pairIndex;
        if (resting) {
          // A limit/stop order rests in /orders until its trigger — polling
          // positions for it would just burn the whole settle window. Confirm
          // the order itself appeared.
          toast.loading(t("confirmingOnBase"), { id: toastId });
          await waitForOrdersChange((fresh) =>
            fresh.some((o) => !beforeOrders.has(`${o.pairIndex}:${o.index}`) && isOurs(o.pairIndex))
          );
          toast.success(t("orderRestsUntilTrigger", { pair: req.pair }), { id: toastId });
          return true;
        }

        toast.loading(t("orderPlacedWaitingFill"), { id: toastId });
        const filled = await waitForChange((fresh) =>
          fresh.some((p) => !before.has(`${p.pairIndex}:${p.index}`) && isOurs(p.pairIndex))
        );
        if (filled) {
          toast.success(t(req.isLong ? "longOpen" : "shortOpen", { pair: req.pair }), {
            id: toastId,
          });
        } else {
          // The tx confirmed but the keeper has not filled inside our window;
          // for market orders that usually means a closed market or a stale
          // price. Say what actually happened rather than claiming a fill.
          toast.info(t("fillTakingLonger"), { id: toastId });
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error, t("tradeOpenFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [
      trader,
      positions,
      orders,
      portfolio,
      sendBatch,
      waitForChange,
      waitForOrdersChange,
      ensureExecutionFee,
      t,
    ]
  );

  const cancelOrder = useCallback(
    async (order: PerpOrder): Promise<boolean> => {
      if (!trader) {
        toast.error(t("noWalletConnected"));
        return false;
      }
      const toastId = toast.loading(t("cancellingOrder"));
      setPhase("building");
      try {
        const key = `${order.pairIndex}:${order.index}`;
        // An order vanishing from /orders is also what a keeper fill at the
        // trigger looks like; the before-set of positions lets the outcome be
        // reported honestly when the cancel loses that race.
        const positionsBefore = new Set(
          (await fetchPerpPositions(trader).catch(() => positions)).map(
            (p) => `${p.pairIndex}:${p.index}`
          )
        );
        const build = await buildCancelOrder({
          pairIndex: order.pairIndex,
          orderIndex: order.index,
        });

        const feeShortfall = ensureExecutionFee([build]);
        if (feeShortfall) {
          toast.error(feeShortfall, { id: toastId });
          return false;
        }

        setPhase("signing");
        toast.loading(t("confirmingOnBase"), { id: toastId });
        await sendBatch(toSignableCalls([build]), PERP_CHAIN_ID);

        setPhase("settling");
        const cleared = await waitForOrdersChange(
          (fresh) => !fresh.some((o) => `${o.pairIndex}:${o.index}` === key)
        );
        if (cleared) {
          const now = trader ? await fetchPerpPositions(trader).catch(() => []) : [];
          const filledInstead = now.some(
            (p) =>
              p.pairIndex === order.pairIndex && !positionsBefore.has(`${p.pairIndex}:${p.index}`)
          );
          if (filledInstead) {
            toast.info(t("orderFilledInstead", { pair: `#${order.pairIndex}` }), { id: toastId });
          } else {
            toast.success(t("orderCancelled"), { id: toastId });
          }
        } else {
          toast.info(t("cancelTakingLonger"), { id: toastId });
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error, t("cancelFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [trader, positions, sendBatch, waitForOrdersChange, ensureExecutionFee, t]
  );

  const closeTrade = useCallback(
    async (position: OpenPosition, collateralUsdc: string): Promise<boolean> => {
      const toastId = toast.loading(t("closingPosition"));
      setPhase("building");
      try {
        const key = `${position.pairIndex}:${position.index}`;
        const build = await buildCloseTrade({
          pairIndex: position.pairIndex,
          tradeIndex: position.index,
          collateralUsdc,
        });

        const feeShortfall = ensureExecutionFee([build]);
        if (feeShortfall) {
          toast.error(feeShortfall, { id: toastId });
          return false;
        }

        setPhase("signing");
        toast.loading(t("confirmingOnBase"), { id: toastId });
        await sendBatch(toSignableCalls([build]), PERP_CHAIN_ID);

        setPhase("settling");
        toast.loading(t("waitingCloseSettle"), { id: toastId });
        const cleared = await waitForChange((fresh) => {
          const still = fresh.find((p) => `${p.pairIndex}:${p.index}` === key);
          if (!still) return true;
          // A partial close shows as reduced collateral on the same trade.
          return still.initialCollateralUsdc !== position.initialCollateralUsdc;
        });
        void portfolio.refetch();
        if (cleared) {
          toast.success(t("positionClosed"), { id: toastId });
        } else {
          toast.info(t("closeTakingLonger"), { id: toastId });
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error, t("closeFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [sendBatch, waitForChange, ensureExecutionFee, portfolio, t]
  );

  // Both updates move money, so they take the same phase lifecycle as every
  // other action: without it `busy` stayed false for their whole flight and a
  // double-click could sign two silent sponsored userOps (margin deposited or
  // withdrawn twice).
  const updateTpSl = useCallback(
    async (position: OpenPosition, takeProfit: string, stopLoss: string): Promise<boolean> => {
      const toastId = toast.loading(t("updatingTpSl"));
      setPhase("building");
      try {
        const build = await buildUpdateTpSl({
          pairIndex: position.pairIndex,
          tradeIndex: position.index,
          takeProfit,
          stopLoss,
        });
        const feeShortfall = ensureExecutionFee([build]);
        if (feeShortfall) {
          toast.error(feeShortfall, { id: toastId });
          return false;
        }
        setPhase("signing");
        await sendBatch(toSignableCalls([build]), PERP_CHAIN_ID);
        setPhase("settling");
        const key = `${position.pairIndex}:${position.index}`;
        const applied = await waitForChange((fresh) => {
          const still = fresh.find((p) => `${p.pairIndex}:${p.index}` === key);
          if (!still) return true;
          return still.takeProfit !== position.takeProfit || still.stopLoss !== position.stopLoss;
        });
        if (applied) {
          toast.success(t("tpSlUpdated"), { id: toastId });
        } else {
          toast.info(t("updateTakingLonger"), { id: toastId });
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error, t("updateFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [sendBatch, waitForChange, ensureExecutionFee, t]
  );

  const updateMargin = useCallback(
    async (
      position: OpenPosition,
      marginUsdc: string,
      direction: "deposit" | "withdraw"
    ): Promise<boolean> => {
      const toastId = toast.loading(t(direction === "deposit" ? "addingMargin" : "removingMargin"));
      setPhase("building");
      try {
        const build = await buildUpdateMargin({
          pairIndex: position.pairIndex,
          tradeIndex: position.index,
          marginUsdc,
          direction,
        });
        const feeShortfall = ensureExecutionFee([build]);
        if (feeShortfall) {
          toast.error(feeShortfall, { id: toastId });
          return false;
        }
        setPhase("signing");
        await sendBatch(toSignableCalls([build]), PERP_CHAIN_ID);
        setPhase("settling");
        const key = `${position.pairIndex}:${position.index}`;
        const applied = await waitForChange((fresh) => {
          const still = fresh.find((p) => `${p.pairIndex}:${p.index}` === key);
          if (!still) return true;
          return still.initialCollateralUsdc !== position.initialCollateralUsdc;
        });
        void portfolio.refetch();
        if (applied) {
          toast.success(t("marginUpdated"), { id: toastId });
        } else {
          toast.info(t("updateTakingLonger"), { id: toastId });
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error, t("marginChangeFailed")), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [sendBatch, waitForChange, ensureExecutionFee, portfolio, t]
  );

  return {
    openTrade,
    closeTrade,
    cancelOrder,
    updateTpSl,
    updateMargin,
    phase,
    busy: phase !== "idle",
  };
}
