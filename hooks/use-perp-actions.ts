"use client";

import { useCallback, useState } from "react";
import { useEvmSendBatch } from "@/hooks/use-evm-send";
import { usePerpPositions } from "@/hooks/use-perp-positions";
import { readUsdcAllowance } from "@/lib/perp/allowance";
import {
  buildApproveUsdc,
  buildCloseTrade,
  buildOpenTrade,
  buildUpdateMargin,
  buildUpdateTpSl,
} from "@/lib/perp/api";
import { LARGE_APPROVAL_USDC, PERP_CHAIN_ID, needsApproval } from "@/lib/perp/logic";
import { toSignableCalls } from "@/lib/perp/steps";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { BuildResult, OpenPosition, OpenTradeRequest } from "@/lib/perp/types";

// Orchestrates the non-custodial perp flows end to end. The backend only ever
// returns unsigned steps; everything here is signed by the user's embedded
// wallet through the app's single EVM send path.
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

export function usePerpActions() {
  const sendBatch = useEvmSendBatch();
  const { positions, waitForChange, refetch, trader } = usePerpPositions();
  const [phase, setPhase] = useState<PerpPhase>("idle");

  const openTrade = useCallback(
    async (req: Omit<OpenTradeRequest, "trader">): Promise<boolean> => {
      if (!trader) {
        toast.error("No wallet is connected.");
        return false;
      }
      const toastId = toast.loading("Preparing your trade…");
      setPhase("building");
      try {
        const before = new Set(positions.map((p) => `${p.pairIndex}:${p.index}`));

        // One allowance read decides whether the approve rides along. The
        // approve is large so the next open goes straight through.
        const allowance = await readUsdcAllowance(trader);
        const builds: BuildResult[] = [];
        if (needsApproval(allowance, req.collateralUsdc)) {
          builds.push(await buildApproveUsdc(LARGE_APPROVAL_USDC));
        }
        builds.push(await buildOpenTrade({ ...req, trader }));

        setPhase("signing");
        toast.loading("Confirming on Base…", { id: toastId });
        await sendBatch(toSignableCalls(builds), PERP_CHAIN_ID);

        setPhase("settling");
        toast.loading("Order placed. Waiting for the fill…", { id: toastId });
        const filled = await waitForChange((fresh) =>
          fresh.some((p) => !before.has(`${p.pairIndex}:${p.index}`))
        );
        if (filled) {
          toast.success(`${req.isLong ? "Long" : "Short"} ${req.pair} is open.`, { id: toastId });
        } else if (req.orderType === "market" || req.orderType === "market_zero_fee") {
          // The tx confirmed but the keeper has not filled inside our window;
          // for market orders that usually means a closed market or a stale
          // price. Say what actually happened rather than claiming a fill.
          toast.info(
            "Order registered. The fill is taking longer than usual; check back shortly.",
            {
              id: toastId,
            }
          );
        } else {
          // Limit and stop orders rest until their trigger; not appearing in
          // open positions is the expected outcome.
          toast.success(`${req.pair} order placed. It fills when your price is reached.`, {
            id: toastId,
          });
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error, "The trade could not be opened."), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [trader, positions, sendBatch, waitForChange]
  );

  const closeTrade = useCallback(
    async (position: OpenPosition, collateralUsdc: string): Promise<boolean> => {
      const toastId = toast.loading("Closing your position…");
      setPhase("building");
      try {
        const key = `${position.pairIndex}:${position.index}`;
        const build = await buildCloseTrade({
          pairIndex: position.pairIndex,
          tradeIndex: position.index,
          collateralUsdc,
        });

        setPhase("signing");
        toast.loading("Confirming on Base…", { id: toastId });
        await sendBatch(toSignableCalls([build]), PERP_CHAIN_ID);

        setPhase("settling");
        toast.loading("Waiting for the close to settle…", { id: toastId });
        const cleared = await waitForChange((fresh) => {
          const still = fresh.find((p) => `${p.pairIndex}:${p.index}` === key);
          if (!still) return true;
          // A partial close shows as reduced collateral on the same trade.
          return still.initialCollateralUsdc !== position.initialCollateralUsdc;
        });
        if (cleared) {
          toast.success("Position closed. Funds return to your USDC balance.", { id: toastId });
        } else {
          toast.info("Close registered. Settlement is taking longer than usual.", { id: toastId });
        }
        return true;
      } catch (error) {
        toast.error(friendlyError(error, "The position could not be closed."), { id: toastId });
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [sendBatch, waitForChange]
  );

  const updateTpSl = useCallback(
    async (position: OpenPosition, takeProfit: string, stopLoss: string): Promise<boolean> => {
      const toastId = toast.loading("Updating take profit and stop loss…");
      try {
        const build = await buildUpdateTpSl({
          pairIndex: position.pairIndex,
          tradeIndex: position.index,
          takeProfit,
          stopLoss,
        });
        await sendBatch(toSignableCalls([build]), PERP_CHAIN_ID);
        toast.success("Take profit and stop loss updated.", { id: toastId });
        void refetch();
        return true;
      } catch (error) {
        toast.error(friendlyError(error, "The update did not go through."), { id: toastId });
        return false;
      }
    },
    [sendBatch, refetch]
  );

  const updateMargin = useCallback(
    async (
      position: OpenPosition,
      marginUsdc: string,
      direction: "deposit" | "withdraw"
    ): Promise<boolean> => {
      const toastId = toast.loading(
        direction === "deposit" ? "Adding margin…" : "Removing margin…"
      );
      try {
        const build = await buildUpdateMargin({
          pairIndex: position.pairIndex,
          tradeIndex: position.index,
          marginUsdc,
          direction,
        });
        await sendBatch(toSignableCalls([build]), PERP_CHAIN_ID);
        toast.success("Margin updated.", { id: toastId });
        void refetch();
        return true;
      } catch (error) {
        toast.error(friendlyError(error, "The margin change did not go through."), { id: toastId });
        return false;
      }
    },
    [sendBatch, refetch]
  );

  return { openTrade, closeTrade, updateTpSl, updateMargin, phase, busy: phase !== "idle" };
}
