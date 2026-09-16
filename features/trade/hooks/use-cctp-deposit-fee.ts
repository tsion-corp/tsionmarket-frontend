"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCctpFeeQuote } from "@/features/trade/lib/cctp-api";
import { getCctpDepositConfig } from "@/features/trade/lib/hyperliquid-api";
import { CCTP_DOMAIN, CCTP_FINALITY } from "@/lib/cctp/config";
import { maxFeeFromQuote } from "@/lib/cctp/fees";

const CONFIG_STALE_MS = 5 * 60_000;
const QUOTE_STALE_MS = 60_000;

/**
 * What a top-up will cost, for the fund modal's fee line (llms.txt §6a). The
 * backend decides who pays the mint relay; only when the user pays is there a
 * fee to show, and then it is the most the burn can be charged, from Circle's
 * live quote. The burn itself re-quotes at send time, so this is display only.
 * Read only while the modal is open.
 */
export function useCctpDepositFee(open: boolean) {
  const config = useQuery({
    queryKey: ["cctp-deposit-config"],
    queryFn: getCctpDepositConfig,
    enabled: open,
    staleTime: CONFIG_STALE_MS,
  });
  const userPaysFee = config.data?.userPaysDepositFee ?? null;

  const quote = useQuery({
    queryKey: ["cctp-fee-quote", CCTP_DOMAIN.base, CCTP_DOMAIN.hyperevm, "forward"],
    queryFn: () =>
      getCctpFeeQuote(CCTP_DOMAIN.base, CCTP_DOMAIN.hyperevm, {
        forward: true,
        hyperCoreDeposit: true,
      }),
    enabled: open && userPaysFee === true,
    staleTime: QUOTE_STALE_MS,
  });

  const quoteData = quote.data;
  const maxFeeFor = useCallback(
    (amount: bigint): bigint | null =>
      quoteData
        ? maxFeeFromQuote({
            amount,
            quote: quoteData,
            finality: CCTP_FINALITY.fast,
            includeForwardFee: true,
          })
        : null,
    [quoteData]
  );

  return { userPaysFee, maxFeeFor };
}
