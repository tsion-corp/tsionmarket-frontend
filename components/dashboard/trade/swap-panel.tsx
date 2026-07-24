"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AmountField } from "@/components/dashboard/trade/amount-field";
import { RouteSummary } from "@/components/dashboard/trade/route-summary";
import { ArrowDownIcon } from "@/components/ui/icons";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTradeQuote } from "@/hooks/use-trade-quote";
import { useSwapExecute } from "@/hooks/use-swap-execute";
import { useEvmSwapExecute } from "@/hooks/use-evm-swap-execute";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatAmount, toBaseUnits } from "@/lib/trade/math";
import {
  isEvmRoutable,
  isRoutable,
  SWAP_NETWORKS,
  SWAP_NETWORK_ORDER,
  SWAP_TOKENS,
  type SwapChainKey,
  type TradeAsset,
} from "@/lib/trade/assets";
import { toast } from "@/lib/toast";
import type { StatLine } from "@/components/dashboard/modal-types";

type Phase = "idle" | "signing" | "done";

interface SwapPanelProps {
  network: SwapChainKey;
  pay: TradeAsset;
  receive: TradeAsset;
  onNetwork: (network: SwapChainKey) => void;
  onPay: (asset: TradeAsset) => void;
  onReceive: (asset: TradeAsset) => void;
  onFlip: () => void;
  prices: Record<string, number>;
}

const SLIPPAGE_OPTIONS = [
  { bps: 10, label: "0.1%" },
  { bps: 50, label: "0.5%" },
  { bps: 100, label: "1%" },
];

export function SwapPanel({
  network,
  pay,
  receive,
  onNetwork,
  onPay,
  onReceive,
  onFlip,
  prices,
}: SwapPanelProps) {
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const executeSwap = useSwapExecute();
  const executeEvmSwap = useEvmSwapExecute();
  const portfolio = usePortfolio();
  const debounced = useDebouncedValue(amount, 350);
  const quote = useTradeQuote({ pay, receive, amount: debounced, prices, slippageBps });

  const net = SWAP_NETWORKS[network];
  const netTokens = SWAP_TOKENS[network];

  // Balances scoped to the selected network, so ETH on Base never stands in for
  // ETH on Arbitrum and the "Max"/insufficient checks match the actual chain.
  const netBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of portfolio.tokens) {
      if (t.network === net.alchemyNetwork) map[t.symbol] = (map[t.symbol] ?? 0) + t.balance;
    }
    return map;
  }, [portfolio.tokens, net.alchemyNetwork]);

  const amountNum = parseFloat(amount) || 0;
  const payBalance = netBalances[pay.symbol] ?? 0;
  const payUsd = amountNum * (prices[pay.symbol] ?? 0);
  const receiveUsd = quote.receiveAmount * (prices[receive.symbol] ?? 0);
  const insufficient = payBalance > 0 && amountNum > payBalance;
  const routed = isRoutable(pay, receive);
  const evmRouted = !routed && isEvmRoutable(pay, receive);
  const actionable = routed || evmRouted;
  const signing = phase === "signing";
  // The network fee is paid in the chain's own native token, on that chain.
  const gasSymbol = net.nativeSymbol;
  const noGas =
    !portfolio.loading &&
    !portfolio.tokens.some(
      (t) => t.symbol === gasSymbol && t.network === net.alchemyNetwork && t.balance > 0
    );
  const disabled =
    !actionable ||
    amountNum <= 0 ||
    quote.loading ||
    insufficient ||
    quote.receiveAmount <= 0 ||
    signing;

  const rows: StatLine[] = [];
  if (quote.priceImpactPct != null) {
    rows.push({
      k: "Price impact",
      v: `${quote.priceImpactPct.toFixed(2)}%`,
      c: quote.priceImpactPct < 1 ? "#7CE7B0" : "#F6A5A5",
    });
  }
  rows.push({ k: "Max slippage", v: `${(slippageBps / 100).toFixed(2)}%` });
  rows.push({ k: "Network", v: net.name });
  rows.push({
    k: "Route",
    v: quote.route.length ? quote.route.map((r) => r.label).join(" · ") : "Live price",
  });

  const swap = async () => {
    if (!actionable) return;
    if (noGas) {
      setError(`You need a little ${gasSymbol} on ${net.name} for the network fee`);
      return;
    }
    setError(null);
    setPhase("signing");
    try {
      if (routed) {
        if (!pay.mint || !receive.mint || pay.decimals == null) return;
        await executeSwap({
          inputMint: pay.mint,
          outputMint: receive.mint,
          amount: toBaseUnits(amount, pay.decimals),
          slippageBps,
        });
      } else {
        if (
          !pay.evmAddress ||
          !receive.evmAddress ||
          pay.evmChainId == null ||
          pay.evmDecimals == null
        ) {
          return;
        }
        await executeEvmSwap({
          fromChainId: pay.evmChainId,
          fromToken: pay.evmAddress,
          toToken: receive.evmAddress,
          fromAmount: toBaseUnits(amount, pay.evmDecimals),
          slippageBps,
        });
      }
      toast.success(`Swapped ${pay.symbol} to ${receive.symbol} on ${net.name}`);
      await portfolio.refetch();
      setAmount("");
      setPhase("done");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "The swap didn't go through. Try again.");
    }
  };

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SWAP_NETWORK_ORDER.map((key) => {
          const on = key === network;
          return (
            <button
              key={key}
              onClick={() => onNetwork(key)}
              className={`cursor-pointer rounded-full border px-3 py-1.5 font-sans text-[12.5px] font-medium transition-colors ${
                on
                  ? "border-accent/45 bg-accent/12 text-white"
                  : "border-white/10 bg-white/4 text-white/70 hover:bg-white/8"
              }`}
            >
              {SWAP_NETWORKS[key].name}
            </button>
          );
        })}
      </div>

      <AmountField
        label="You pay"
        amount={amount}
        onAmountChange={setAmount}
        asset={pay}
        onAsset={onPay}
        prices={prices}
        balances={netBalances}
        assets={netTokens}
        excludeSymbol={receive.symbol}
        balance={payBalance}
        onMax={() => setAmount(String(payBalance))}
        usdValue={payUsd}
      />

      <div className="z-[1] -my-2.5 flex justify-center">
        <motion.button
          onClick={onFlip}
          whileTap={reduce ? undefined : { rotate: 180 }}
          aria-label="Flip tokens"
          className="bg-panel text-accent grid h-[36px] w-[36px] cursor-pointer place-items-center rounded-xl border border-white/14 hover:bg-white/5"
        >
          <ArrowDownIcon />
        </motion.button>
      </div>

      <AmountField
        label="You receive"
        amount={quote.receiveAmount > 0 ? String(quote.receiveAmount) : ""}
        asset={receive}
        onAsset={onReceive}
        prices={prices}
        balances={netBalances}
        assets={netTokens}
        excludeSymbol={pay.symbol}
        usdValue={receiveUsd}
        accent
        loading={quote.loading}
      />

      {actionable ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[12.5px] font-normal text-white/45">Max slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_OPTIONS.map((o) => (
              <button
                key={o.bps}
                onClick={() => setSlippageBps(o.bps)}
                className={`cursor-pointer rounded-lg px-2.5 py-1 font-sans text-xs font-medium transition-colors ${
                  slippageBps === o.bps
                    ? "bg-accent/16 text-white"
                    : "text-white/45 hover:text-white"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <RouteSummary
          summaryLabel="Rate"
          summaryValue={
            quote.rate > 0 ? `1 ${receive.symbol} = ${formatAmount(quote.rate)} ${pay.symbol}` : "—"
          }
          rows={rows}
          source={routed ? "Jupiter" : evmRouted ? "LI.FI" : "Live price"}
          loading={quote.loading}
        />
      </div>

      {error ? <p className="text-down mt-3 text-[13px] font-normal">{error}</p> : null}

      <button
        onClick={swap}
        disabled={disabled}
        className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-[15px] font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!actionable
          ? `${pay.symbol}/${receive.symbol} swaps are coming soon`
          : insufficient
            ? `Not enough ${pay.symbol}`
            : amountNum <= 0
              ? "Enter an amount"
              : quote.loading
                ? "Finding best price…"
                : signing
                  ? "Confirm in your wallet…"
                  : "Swap"}
      </button>
    </div>
  );
}
