"use client";

import { useCallback, useState } from "react";
import { OrderSide, OrderType } from "@polymarket/client";
import { approveErc1155ForAll, fetchNegRisk } from "@polymarket/client/actions";
import { friendlyError } from "@/lib/errors";
import { usePolymarketSession } from "@/features/prediction/hooks/use-polymarket-session";
import { refreshCollateralUsd } from "@/features/prediction/lib/polymarket/collateral";
import { sellFloorPrice } from "@/features/prediction/lib/positions";
import { BUILDER_CODE, CONTRACTS } from "@/lib/polymarket/config";
import type { SecureClient } from "@/features/prediction/lib/polymarket/secure-client";

export type CashoutPhase = "idle" | "selling" | "approving" | "settling";

// A user-facing error whose message is already friendly. Every failure leaves
// this hook as one of these, so a caller can read the reason off the error it
// catches instead of the `error` state below: state read inside the caller's
// own catch is still the previous render's value, which is always null.
export class CashoutError extends Error {}

function isNoLiquidity(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /no orders found to match|no match|not enough liquidity|no liquidity/.test(m);
}

function isApprovalError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /allowance|approval|not approved/.test(m);
}

const NO_LIQUIDITY_MESSAGE =
  "Nobody is buying this outcome right now. Try again in a moment or hold to resolution.";

// Grants the approvals a sell needs, for the case the SDK's own setup misses.
//
// setupTradingApprovals covers the exchanges and the collateral adapters, but
// its required-approvals list has no entry for the neg-risk adapter. Selling a
// position in a multi-candidate market goes through that adapter, so the CLOB
// rejects the order with "the allowance is not enough -> spender: 0xd91E80…"
// and the SDK's setup, having granted everything it knows about, reports
// success. Binary markets settle through the standard exchange, which is on the
// list, which is why only multi-candidate markets fail this way.
//
// Granting an approval that already exists is a no-op on-chain, so this only
// runs on the retry path, after the CLOB has actually complained.
async function grantSellApprovals(client: SecureClient, tokenId: string): Promise<void> {
  await client.setupTradingApprovals();
  if (!(await fetchNegRisk(client, { tokenId }))) return;
  const handle = await approveErc1155ForAll(client, {
    operatorAddress: CONTRACTS.negRiskAdapter,
    tokenAddress: CONTRACTS.conditionalTokens,
  });
  // The order is rejected again unless the approval has actually landed.
  await handle.wait();
}

export interface CashOutInput {
  // CLOB token of the held outcome (the position's tokenId).
  tokenId: string;
  // Shares to sell — the whole position for a full cash-out.
  shares: number;
}

export interface CashOutResult {
  // Actual pUSD received from the matched sell.
  proceedsUsd: number;
  settlementPending: boolean;
}

// Sells a held position back into the market before resolution — the standard
// Polymarket early cash-out. A market SELL crosses the spread at the current
// bid; the floor price tolerates a small book move but never a silent dump far
// below the estimate. Proceeds land as pUSD in the prediction balance, where
// the existing cash-out-to-Base flow can move them home.
export function usePolymarketCashout() {
  const { ensureReady } = usePolymarketSession();
  const [phase, setPhase] = useState<CashoutPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const placeSell = useCallback(async (client: SecureClient, input: CashOutInput) => {
    const shares = String(input.shares);
    const [book, estimate] = await Promise.all([
      client.fetchOrderBook({ tokenId: input.tokenId }),
      client.estimateMarketPrice({
        tokenId: input.tokenId,
        side: OrderSide.SELL,
        shares,
        orderType: OrderType.FOK,
      }),
    ]);
    // No bid depth to sell into: the book is empty on the buy side.
    if (book.bids.length === 0 || !(estimate > 0)) {
      throw new CashoutError(NO_LIQUIDITY_MESSAGE);
    }

    const res = await client.placeMarketOrder({
      tokenId: input.tokenId,
      side: OrderSide.SELL,
      shares,
      minPrice: sellFloorPrice(estimate, book.tickSize),
      orderType: OrderType.FOK,
      ...(BUILDER_CODE ? { builderCode: BUILDER_CODE as `0x${string}` } : {}),
    });
    if (!res.ok) throw new Error(res.message || "The sell was not accepted.");
    return res;
  }, []);

  const cashOut = useCallback(
    async (input: CashOutInput): Promise<CashOutResult> => {
      setError(null);
      setPhase("selling");
      try {
        const client = await ensureReady();
        let response;
        try {
          response = await placeSell(client, input);
        } catch (e) {
          if (!isApprovalError(e)) throw e;
          // Selling conditional tokens needs an ERC-1155 operator approval;
          // grant whatever is missing and retry once.
          setPhase("approving");
          await grantSellApprovals(client, input.tokenId);
          setPhase("selling");
          response = await placeSell(client, input);
        }

        setPhase("settling");
        let settlementPending = false;
        try {
          await client.waitForOrderFillSettlement(response, { timeoutMs: 60_000 });
          await refreshCollateralUsd(client);
        } catch (settlementError) {
          // The FOK order was already accepted and matched. A local settlement
          // timeout must not invite a duplicate sell; the next refresh retries
          // the balance-cache update safely.
          settlementPending = true;
          console.warn("Polymarket cash-out settlement is still pending", {
            orderId: response.orderId,
            error: settlementError,
          });
        }
        return {
          proceedsUsd: Number(response.takingAmount),
          settlementPending,
        };
      } catch (e) {
        // The message the user sees is deliberately plain, so log what actually
        // failed. Without this the CLOB's own reason for a rejection is only
        // visible as a bare 400 in the network panel, with no body.
        console.error("Polymarket cash-out failed", {
          tokenId: input.tokenId,
          shares: input.shares,
          error: e,
        });
        const message =
          e instanceof CashoutError
            ? e.message
            : isNoLiquidity(e)
              ? NO_LIQUIDITY_MESSAGE
              : friendlyError(e, "Couldn't cash out this position. Try again.");
        setError(message);
        // Rethrow carrying the message, with the original kept as `cause` so
        // the CLOB's own rejection is still there to inspect in the console.
        throw e instanceof CashoutError ? e : new CashoutError(message, { cause: e });
      } finally {
        setPhase("idle");
      }
    },
    [ensureReady, placeSell]
  );

  return { cashOut, phase, error };
}
