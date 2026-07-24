"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { fetchJupiterQuote } from "@/lib/trade/jupiter";
import { fetchLifiQuote } from "@/lib/trade/lifi";
import { fromBaseUnits, receiveFromPrices, toBaseUnits } from "@/lib/trade/math";
import { isEvmRoutable, isRoutable, type TradeAsset } from "@/lib/trade/assets";
import { getWalletAddress } from "@/lib/user";

export type QuoteSource = "jupiter" | "lifi" | "price";

export interface TradeQuote {
  source: QuoteSource;
  // Human amount of the receive asset for the given pay amount.
  receiveAmount: number;
  // Pay-asset units per one receive-asset unit.
  rate: number;
  // Price impact as a percentage. Null when derived from prices, not a route.
  priceImpactPct: number | null;
  route: { label: string; percent: number }[];
  loading: boolean;
  error: boolean;
}

interface UseTradeQuoteArgs {
  pay: TradeAsset;
  receive: TradeAsset;
  amount: string;
  prices: Record<string, number>;
  slippageBps: number;
}

const TEN_SECONDS = 10 * 1000;
// LI.FI proxies through one shared key with a 100 RPM ceiling, so the EVM quote
// refreshes less often than the keyless Jupiter quote. React Query does not poll
// a backgrounded tab, so this only ticks while the panel is on screen.
const EVM_QUOTE_INTERVAL = 20 * 1000;

export function useTradeQuote({
  pay,
  receive,
  amount,
  prices,
  slippageBps,
}: UseTradeQuoteArgs): TradeQuote {
  const { user } = usePrivy();
  const evmAddress = getWalletAddress(user, "ethereum");

  const amountNum = parseFloat(amount) || 0;
  const routable = isRoutable(pay, receive) && amountNum > 0;
  const rawAmount = routable ? toBaseUnits(amount, pay.decimals as number) : 0n;

  // The EVM preview needs a taker address to quote against. Fall back to the
  // price-derived preview when no embedded EVM wallet is connected yet.
  const evmRoutable = !routable && isEvmRoutable(pay, receive) && amountNum > 0;
  const evmRawAmount = evmRoutable ? toBaseUnits(amount, pay.evmDecimals as number) : 0n;
  const evmEnabled = evmRoutable && evmRawAmount > 0n && Boolean(evmAddress);

  const query = useQuery({
    queryKey: ["trade-quote", pay.mint, receive.mint, rawAmount.toString(), slippageBps],
    enabled: routable && rawAmount > 0n,
    staleTime: TEN_SECONDS,
    refetchInterval: TEN_SECONDS,
    queryFn: ({ signal }) =>
      fetchJupiterQuote({
        inputMint: pay.mint as string,
        outputMint: receive.mint as string,
        amount: rawAmount,
        slippageBps,
        signal,
      }),
  });

  const evmQuery = useQuery({
    queryKey: [
      "trade-quote-evm",
      pay.evmAddress,
      receive.evmAddress,
      evmRawAmount.toString(),
      slippageBps,
      evmAddress,
    ],
    enabled: evmEnabled,
    staleTime: EVM_QUOTE_INTERVAL,
    refetchInterval: EVM_QUOTE_INTERVAL,
    queryFn: ({ signal }) =>
      fetchLifiQuote({
        fromChain: pay.evmChainId as number,
        toChain: pay.evmChainId as number,
        fromToken: pay.evmAddress as string,
        toToken: receive.evmAddress as string,
        fromAmount: evmRawAmount,
        fromAddress: evmAddress as string,
        slippage: slippageBps / 10000,
        signal,
      }),
  });

  return useMemo<TradeQuote>(() => {
    if (routable) {
      const data = query.data;
      const receiveAmount = data
        ? Number(fromBaseUnits(data.outAmount, receive.decimals as number))
        : 0;
      const rate = receiveAmount > 0 ? amountNum / receiveAmount : 0;
      return {
        source: "jupiter",
        receiveAmount,
        rate,
        priceImpactPct: data ? data.priceImpactPct * 100 : null,
        route: data?.route ?? [],
        loading: query.isFetching,
        error: query.isError,
      };
    }

    if (evmRoutable) {
      const data = evmQuery.data;
      const receiveAmount = data
        ? Number(fromBaseUnits(data.toAmount, receive.evmDecimals as number))
        : 0;
      const rate = receiveAmount > 0 ? amountNum / receiveAmount : 0;
      return {
        source: "lifi",
        receiveAmount,
        rate,
        priceImpactPct: data ? data.priceImpactPct : null,
        route: [{ label: data?.toolName ?? "LI.FI", percent: 100 }],
        loading: evmQuery.isFetching,
        error: evmQuery.isError,
      };
    }

    const payPrice = prices[pay.symbol] ?? 0;
    const receivePrice = prices[receive.symbol] ?? 0;
    const receiveAmount = receiveFromPrices(amountNum, payPrice, receivePrice);
    const rate = payPrice > 0 && receivePrice > 0 ? receivePrice / payPrice : 0;
    return {
      source: "price",
      receiveAmount,
      rate,
      priceImpactPct: null,
      route: [{ label: "Live price", percent: 100 }],
      loading: false,
      error: false,
    };
  }, [
    routable,
    query.data,
    query.isFetching,
    query.isError,
    evmRoutable,
    evmQuery.data,
    evmQuery.isFetching,
    evmQuery.isError,
    amountNum,
    prices,
    pay.symbol,
    receive.symbol,
    receive.decimals,
    receive.evmDecimals,
  ]);
}
