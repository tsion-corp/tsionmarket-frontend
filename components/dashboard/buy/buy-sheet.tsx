"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ProgressBar } from "@/components/ui/progress-bar";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useGasStatus } from "@/hooks/use-withdraw";
import { useDepositChains, useDepositStatus } from "@/hooks/use-deposit";
import { useBuyDestinations } from "@/hooks/use-buy-catalog";
import { useBuy } from "@/hooks/use-buy";
import { NetworkPicker, NetworkSelect } from "@/components/dashboard/buy/network-select";
import { routesForSymbol } from "@/lib/buy";
import { depositProgress, usdcBaseUnits, type DepositStage } from "@/lib/deposit";
import { formatAmount, fromBaseUnits } from "@/lib/trade/math";
import { toast } from "@/lib/toast";
import { friendlyError } from "@/lib/errors";
import type { BuyPayload } from "@/components/dashboard/modal-types";

// 1% price tolerance, kept out of the UI. Non-crypto users should not have to
// reason about slippage.
const SLIPPAGE_BPS = 100;
const MIN_USD = 1;
const PRESETS = [10, 50, 100];
const DECIMAL = /^\d*\.?\d*$/;

// Plain-language order status, no bridging or settlement jargon.
const STAGE_COPY: Record<DepositStage, string> = {
  waiting: "Placing your order",
  detected: "Payment received",
  processing: "Almost there",
  settled: "All done",
  refunded: "Money returned to your balance",
  failed: "Your order didn't go through",
};

interface BuySheetProps {
  payload: BuyPayload;
  onClose: () => void;
}

export function BuySheet({ payload, onClose }: BuySheetProps) {
  const portfolio = usePortfolio();
  const gas = useGasStatus("ethereum");
  const destinations = useBuyDestinations();

  const routes = useMemo(
    () => routesForSymbol(destinations.data ?? [], payload.symbol),
    [destinations.data, payload.symbol]
  );
  const [chainId, setChainId] = useState<number | null>(null);
  const route = routes.find((r) => r.destinationChainId === chainId) ?? routes[0] ?? null;

  // Network display name and logo come from the Dextopus chain catalog, keyed by
  // the route's destination chain.
  const chainMeta = useDepositChains();
  const networkOptions = useMemo(() => {
    const meta = new Map((chainMeta.data ?? []).map((c) => [c.chainId, c]));
    return routes.map((r) => {
      const c = meta.get(r.destinationChainId);
      return {
        chainId: r.destinationChainId,
        name: c?.name ?? r.chainName.charAt(0).toUpperCase() + r.chainName.slice(1),
        logoUrl: c?.logoUrl ?? null,
      };
    });
  }, [routes, chainMeta.data]);

  const [amount, setAmount] = useState("");
  const buy = useBuy();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [bought, setBought] = useState<string>("");
  const [picking, setPicking] = useState(false);
  const status = useDepositStatus(requestId);

  // Your spendable dollars: the USDC balance on Base, shown as a plain balance.
  const balance = useMemo(
    () =>
      portfolio.tokens
        .filter((t) => t.symbol === "USDC" && t.network === "base-mainnet")
        .reduce((sum, t) => sum + t.balance, 0),
    [portfolio.tokens]
  );

  const value = Number(amount) || 0;
  const notEnough = balance > 0 && value > balance;
  const belowMin = value > 0 && value < MIN_USD;
  const noFee = !gas.loading && !gas.hasGas;
  const canBuy =
    Boolean(route) && value >= MIN_USD && !notEnough && !noFee && !gas.loading && !buy.isPending;

  // Instant estimate from market price: dollars spent divided by the asset's
  // unit price. This is a preview; the exact amount is quoted at buy time and
  // confirmed on the receipt.
  const preview = value > 0 && payload.priceUsd > 0 ? formatAmount(value / payload.priceUsd) : "";

  const progress = useMemo(
    () =>
      status.data
        ? depositProgress(status.data.status, status.data.executionStatus)
        : depositProgress("", ""),
    [status.data]
  );
  const stage = progress.stage;

  // Once the order settles, refresh holdings so the new asset appears, and thank
  // the user once.
  const settledRef = useRef(false);
  useEffect(() => {
    if (stage === "settled" && !settledRef.current) {
      settledRef.current = true;
      toast.success(`You bought ${payload.name}`);
      void portfolio.refetch();
    }
  }, [stage, payload.name, portfolio]);

  const confirm = async () => {
    if (!route) return;
    try {
      const result = await buy.mutateAsync({
        route,
        amount: usdcBaseUnits(amount),
        slippageBps: SLIPPAGE_BPS,
      });
      setBought(formatAmount(Number(fromBaseUnits(result.estimatedOutput, route.decimals))));
      setRequestId(result.requestId);
    } catch {
      // The message is surfaced from buy.error below.
    }
  };

  // Order-tracking view: shown once the payment is on its way.
  if (requestId) {
    const failed = stage === "failed" || stage === "refunded";
    const done = stage === "settled";
    const color = failed ? "#f6a5a5" : done ? "#7ce7b0" : "#a78bfa";
    return (
      <div>
        <Eyebrow>{done ? "All done" : "Buying"}</Eyebrow>
        <div className="mt-3 flex items-center gap-[13px]">
          <AssetIcon sym={payload.symbol} bg="#26262b" size={44} logo={payload.logo} />
          <div className="min-w-0 flex-1">
            <div className="ws-serif text-[22px]">{payload.name}</div>
            <div className="truncate text-[12.5px] font-normal text-white/50">{payload.symbol}</div>
          </div>
        </div>

        <div className="ws-inset mt-4 p-4">
          <div className="mb-2.5 text-[13px] font-medium text-white">{STAGE_COPY[stage]}</div>
          <ProgressBar pct={progress.pct} color={color} />
          {done ? (
            <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/70">
              {bought ? `${bought} ${payload.symbol} ` : `Your ${payload.name} `}
              is now in your account.
            </p>
          ) : failed ? (
            <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/70">
              We couldn&apos;t complete your order. Your money has been returned to your balance.
            </p>
          ) : (
            <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/60">
              This usually takes a moment. You can close this and it&apos;ll keep going.
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          Done
        </button>
      </div>
    );
  }

  // Network chooser sub-screen, opened from the network row below.
  if (picking) {
    return (
      <NetworkPicker
        options={networkOptions}
        selected={route?.destinationChainId ?? networkOptions[0]?.chainId ?? 0}
        onSelect={(id) => {
          setChainId(id);
          setPicking(false);
        }}
        onBack={() => setPicking(false)}
      />
    );
  }

  // Order form.
  return (
    <div>
      <Eyebrow>Buy</Eyebrow>
      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={payload.symbol} bg="#26262b" size={44} logo={payload.logo} />
        <div className="min-w-0 flex-1">
          <div className="ws-serif text-[22px]">{payload.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">{payload.symbol}</div>
        </div>
      </div>

      <div className="ws-inset mt-4 p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
          <span>Amount</span>
          <button
            onClick={() => setAmount(String(balance))}
            className="tnum cursor-pointer text-white/55 hover:text-white"
          >
            Balance ${formatAmount(balance)}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="ws-serif text-[28px] text-white/70">$</span>
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
            className="ws-serif tnum w-full min-w-0 bg-transparent text-right text-[28px] text-white outline-none placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="mt-2 flex gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(String(p))}
            className="flex-1 cursor-pointer rounded-[12px] border border-white/10 bg-white/4 py-2 font-sans text-[13px] font-medium text-white/75 transition-colors hover:bg-white/8"
          >
            ${p}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[13.5px] font-normal">
        <span className="text-white/55">You get about</span>
        <span className="tnum text-white">{preview ? `${preview} ${payload.symbol}` : "—"}</span>
      </div>

      {networkOptions.length > 0 ? (
        <div className="mt-3">
          <NetworkSelect
            options={networkOptions}
            selected={route?.destinationChainId ?? networkOptions[0].chainId}
            onOpen={() => setPicking(true)}
          />
        </div>
      ) : null}

      {noFee ? (
        <p className="mt-3 text-[12.5px] leading-[1.5] font-normal text-white/55">
          You&apos;ll need a little ETH on Base to cover the network fee. Add some, then try again.
        </p>
      ) : null}
      {buy.error ? (
        <p className="text-down mt-3 text-[13px] font-normal">
          {friendlyError(buy.error, "We couldn't complete your purchase. Please try again.")}
        </p>
      ) : null}

      <button
        onClick={() => void confirm()}
        disabled={!canBuy}
        className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {!route
          ? "Unavailable"
          : value <= 0
            ? "Enter an amount"
            : belowMin
              ? `Minimum $${MIN_USD}`
              : notEnough
                ? "Not enough balance"
                : buy.isPending
                  ? "Confirming…"
                  : `Buy ${payload.name}`}
      </button>
    </div>
  );
}
