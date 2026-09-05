"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPerpQuote, isPerpUnavailable } from "@/lib/perp/api";
import { isPositiveWireDecimal } from "@/lib/perp/logic";
import type { TradeQuote } from "@/lib/perp/types";

// Prices a prospective trade. Inputs are debounced so typing a collateral
// amount does not fire a quote per keystroke, and a quote is only requested
// once both amounts are valid wire decimals.

const DEBOUNCE_MS = 450;

export interface QuoteInputs {
  pair: string | null;
  isLong: boolean;
  collateralUsdc: string;
  leverage: string;
}

export function usePerpQuote(inputs: QuoteInputs) {
  const [settled, setSettled] = useState(inputs);

  useEffect(() => {
    const id = setTimeout(() => setSettled(inputs), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [inputs.pair, inputs.isLong, inputs.collateralUsdc, inputs.leverage]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid =
    settled.pair != null &&
    isPositiveWireDecimal(settled.collateralUsdc) &&
    isPositiveWireDecimal(settled.leverage);

  const query = useQuery<TradeQuote>({
    queryKey: [
      "perp-quote",
      settled.pair,
      settled.isLong,
      settled.collateralUsdc,
      settled.leverage,
    ],
    queryFn: () =>
      fetchPerpQuote({
        pair: settled.pair as string,
        isLong: settled.isLong,
        collateralUsdc: settled.collateralUsdc,
        leverage: settled.leverage,
      }),
    enabled: valid,
    staleTime: 10_000,
    retry: (count, error) => !isPerpUnavailable(error) && count < 1,
  });

  return {
    quote: query.data ?? null,
    loading: valid && query.isLoading,
    // True while the on-screen inputs differ from the quoted ones.
    stale:
      valid &&
      (settled.collateralUsdc !== inputs.collateralUsdc ||
        settled.leverage !== inputs.leverage ||
        settled.isLong !== inputs.isLong ||
        settled.pair !== inputs.pair),
  };
}
