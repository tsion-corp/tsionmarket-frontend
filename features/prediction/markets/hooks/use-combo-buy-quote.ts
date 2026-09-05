"use client";

import { useCallback, useState } from "react";
import { OrderSide, RfqStatus, type ComboQuote } from "@polymarket/client";
import { usePolymarketSession } from "@/features/prediction/hooks/use-polymarket-session";
import { MAX_SLIP_SELECTIONS, type MarketSlipSelection } from "../bet-slip";
import { comboErrorMessage } from "../combo-error";
import { createComboBetReceipt, type ComboBetReceipt } from "../combo-receipt";

type ComboQuotePhase = "idle" | "connecting" | "requesting" | "accepting" | "settling";

interface QuoteResult {
  requestKey: string;
  quote: ComboQuote;
  selections: MarketSlipSelection[];
}

function e6ToDecimal(value: string): string {
  if (!/^\d+$/u.test(value)) throw new Error("Combo stake must be a base-unit integer.");
  const amount = BigInt(value);
  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function quoteUnavailableMessage(reason: string): string {
  return reason === "SIZE_TOO_LARGE"
    ? "No quote is available for this stake. Try a smaller amount."
    : "No executable Combo quote is available right now. Try again shortly.";
}

export function useComboBuyQuote() {
  const { ensureReady, status: sessionStatus } = usePolymarketSession();
  const [phase, setPhase] = useState<ComboQuotePhase>("idle");
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [receipt, setReceipt] = useState<ComboBetReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestQuote = useCallback(
    async (selections: MarketSlipSelection[], notionalE6: string, requestKey: string) => {
      if (selections.length < 2 || selections.length > MAX_SLIP_SELECTIONS) {
        throw new Error(`A sports Combo requires 2–${MAX_SLIP_SELECTIONS} selections.`);
      }

      const positionIds = selections.map((selection) => selection.positionId);
      if (positionIds.some((positionId) => positionId == null)) {
        throw new Error("Every Combo selection must have a position ID.");
      }
      if (new Set(positionIds).size !== positionIds.length) {
        throw new Error("Every Combo selection must use a unique position ID.");
      }

      setError(null);
      setResult(null);
      setPhase("connecting");
      try {
        const client = await ensureReady();
        setPhase("requesting");
        const response = await client.requestComboQuote({
          legPositionIds: positionIds as string[],
          direction: OrderSide.BUY,
          amount: e6ToDecimal(notionalE6),
        });
        if (response.quote === null) {
          throw new Error(quoteUnavailableMessage(response.reason));
        }
        const next = { requestKey, quote: response.quote, selections: [...selections] };
        setResult(next);
        return response.quote;
      } catch (cause) {
        setError(comboErrorMessage(cause, "Couldn't get a Combo quote. Try again."));
        throw cause;
      } finally {
        setPhase("idle");
      }
    },
    [ensureReady]
  );

  const placeQuote = useCallback(
    async (requestKey: string) => {
      if (!result || result.requestKey !== requestKey) {
        throw new Error("Get a fresh Combo quote before submitting this order.");
      }
      if (Date.now() >= result.quote.expiresAt) {
        setResult(null);
        throw new Error("This Combo quote expired. Get a fresh quote.");
      }

      setError(null);
      setPhase("connecting");
      try {
        const client = await ensureReady();
        setPhase("accepting");
        const acceptance = await client.acceptComboQuote(result.quote);
        if (acceptance.status === "failed") {
          throw new Error(`Combo placement failed: ${acceptance.reason}.`);
        }

        setPhase("settling");
        const fill = await client.waitForComboFill({
          rfqId: acceptance.rfqId,
          timeoutMs: 120_000,
        });
        if (fill.status !== RfqStatus.Filled) {
          throw new Error(`Combo execution ended with ${fill.status.toLowerCase()}.`);
        }

        const nextReceipt = createComboBetReceipt({
          quote: result.quote,
          transactionHash: fill.txHash,
          selections: result.selections.map(({ eventTitle, marketLabel, outcome }) => ({
            eventTitle,
            marketLabel,
            outcome,
          })),
        });
        setReceipt(nextReceipt);
        setResult(null);
        return nextReceipt;
      } catch (cause) {
        setError(comboErrorMessage(cause, "Couldn't place this Combo. Try again."));
        throw cause;
      } finally {
        setPhase("idle");
      }
    },
    [ensureReady, result]
  );

  return {
    requestQuote,
    placeQuote,
    result,
    receipt,
    dismissReceipt: () => setReceipt(null),
    phase,
    sessionStatus,
    error,
  };
}
