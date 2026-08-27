"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSell } from "@/features/trade/hooks/use-sell";
import { savePendingRwaSettlement } from "@/lib/trade/pending-settlement";
import { formatAmount, formatUsd, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { maxSellable } from "@/lib/trade/gas-buffer";
import { SolanaBalanceChangedError } from "@/lib/trade/solana-balance";
import { isSponsoredEvmNetwork } from "@/lib/trade/sponsored-evm";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { friendlyError, supportDetail } from "@/lib/errors";
import type { SellPayload } from "@/lib/modal-types";

// 1% price tolerance, hidden from the UI.
const SLIPPAGE_BPS = 100;
// Quick-sell fractions of the balance.
const PRESETS = [25, 50, 100];
const DECIMAL = /^\d*\.?\d*$/;

const NATIVE_SYMBOL: Record<string, string> = {
  "base-mainnet": "ETH",
  "eth-mainnet": "ETH",
  "arb-mainnet": "ETH",
  "opt-mainnet": "ETH",
  "polygon-mainnet": "POL",
  "solana-mainnet": "SOL",
};
const CHAIN_LABEL: Record<string, string> = {
  "base-mainnet": "Base",
  "eth-mainnet": "Ethereum",
  "arb-mainnet": "Arbitrum",
  "opt-mainnet": "Optimism",
  "polygon-mainnet": "Polygon",
  "solana-mainnet": "Solana",
};

interface SellSheetProps {
  payload: SellPayload;
  onClose: () => void;
}

export function SellSheet({ payload, onClose }: SellSheetProps) {
  const t = useTranslations("buySell");
  const portfolio = usePortfolio();
  const [amount, setAmount] = useState("");
  const [maxRequested, setMaxRequested] = useState(false);
  const sell = useSell();

  const nativeSym = NATIVE_SYMBOL[payload.network] ?? "";
  const chainLabel = CHAIN_LABEL[payload.network] ?? payload.network;

  // Sending the asset needs a little of the chain's native token for the fee,
  // except where the send is sponsored: EVM networks behind the bundler, and
  // Solana behind the platform gas sponsor.
  const sponsored = isSponsoredEvmNetwork(payload.network) || payload.network === "solana-mainnet";
  const hasGas = useMemo(
    () =>
      sponsored ||
      portfolio.tokens.some(
        (t) => t.network === payload.network && t.symbol === nativeSym && t.balance > 0
      ),
    [sponsored, portfolio.tokens, payload.network, nativeSym]
  );

  // Selling the chain's own gas token can't spend the whole balance: the fee
  // comes out of the same asset, so a full-balance send always fails. maxSell
  // holds back a small per-chain buffer for that case (Base keeps the full
  // balance, its sends are sponsored) and the max/percent fills stay under it.
  const maxSell = maxSellable(payload.network, payload.address, payload.balance);

  // Plain decimal string for the amount input. String() renders very small
  // numbers in scientific notation, which the input regex and base-unit
  // conversion both reject.
  const fillAmount = (n: number) => {
    const fixed = n.toFixed(payload.decimals);
    return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") || "0" : fixed;
  };

  const value = Number(amount) || 0;
  const overBalance = value > maxSell;
  const proceedsUsd = value * payload.priceUsd;
  const noFee = !portfolio.loading && !hasGas;
  const canSell = value > 0 && !overBalance && !noFee && !portfolio.loading && !sell.isPending;

  // Id of the processing toast opened on confirm.
  const toastRef = useRef<string | number | undefined>(undefined);

  // A loading toast never times out, and closing the sheet unmounts the settle
  // effect that would resolve it, leaving it spinning forever. Every resolution
  // path clears the ref, so on unmount anything still in it is an orphan to
  // dismiss.
  useEffect(
    () => () => {
      if (toastRef.current !== undefined) toast.dismiss(toastRef.current);
    },
    []
  );

  useEffect(() => {
    track("market_viewed", { vertical: "spot", asset: payload.symbol });
  }, [payload.symbol]);

  const confirm = async () => {
    track("trade_previewed", {
      vertical: "spot",
      asset: payload.symbol,
      side: "sell",
      amount_usd: value,
    });
    toastRef.current = toast.loading(t("sellingToast", { symbol: payload.symbol }));
    try {
      // Clamp to the exact on-chain balance so a "max" never sends more than the
      // wallet holds (the displayed balance is a rounded float).
      const entered = toBaseUnits(amount, payload.decimals);
      const max = BigInt(payload.rawBalance);
      const result = await sell.mutateAsync({
        network: payload.network,
        asset: payload.address,
        decimals: payload.decimals,
        amount: entered < max ? entered : max,
        slippageBps: SLIPPAGE_BPS,
        maxRequested,
      });
      savePendingRwaSettlement({
        requestId: result.requestId,
        direction: "solana-to-base",
        assetSymbol: payload.symbol,
        createdAt: Date.now(),
      });
      toast.success(t("takesAMoment"), { id: toastRef.current });
      toastRef.current = undefined;
      void portfolio.refetchUntilChanged();
      onClose();
    } catch (error) {
      if (error instanceof SolanaBalanceChangedError) {
        setAmount(fromBaseUnits(error.availableAmount, payload.decimals));
        setMaxRequested(true);
        void portfolio.refetch();
      }
      // The detailed message is surfaced from sell.error below; resolve the toast.
      toast.error(t("sellFailedToast", { symbol: payload.symbol }), { id: toastRef.current });
      toastRef.current = undefined;
    }
  };

  return (
    <div data-sensitive="other">
      <Eyebrow>{t("sell")}</Eyebrow>
      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={payload.symbol} bg="#26262b" size={44} logo={payload.logo} />
        <div className="min-w-0 flex-1">
          <div className="ws-display text-[22px]">{payload.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">
            {payload.symbol} · {chainLabel}
          </div>
        </div>
      </div>
      <div className="ws-inset mt-4 p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
          <span>{t("amountToSell")}</span>
          <button
            onClick={() => {
              setAmount(fillAmount(maxSell));
              setMaxRequested(true);
            }}
            className="tnum cursor-pointer text-white/55 hover:text-white"
          >
            {t("balanceToken", { amount: formatAmount(payload.balance), symbol: payload.symbol })}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              if (!DECIMAL.test(e.target.value)) return;
              setAmount(e.target.value);
              setMaxRequested(false);
            }}
            className="ws-display tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="shrink-0 font-sans text-sm font-medium text-white/70">
            {payload.symbol}
          </span>
        </div>
        {overBalance ? (
          <div className="text-down mt-1.5 text-[12px] font-normal">
            {t("overBalance", { symbol: payload.symbol })}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setAmount(fillAmount(Math.min((payload.balance * p) / 100, maxSell)));
              setMaxRequested(p === 100);
            }}
            className="flex-1 cursor-pointer rounded-[12px] border border-white/10 bg-white/4 py-2 font-sans text-[13px] font-medium text-white/75 transition-colors hover:bg-white/8"
          >
            {p === 100 ? t("max") : `${p}%`}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[13.5px] font-normal">
        <span className="text-white/55">{t("youGetAbout")}</span>
        <span className="tnum text-white">{value > 0 ? formatUsd(proceedsUsd) : "—"}</span>
      </div>
      <p className="mt-2 text-[12px] leading-[1.5] font-normal text-white/45">
        {t("settlesToUsdc")}
      </p>
      {noFee ? (
        <p className="mt-3 text-[12.5px] leading-[1.5] font-normal text-white/55">
          {t("needGasFee", { symbol: nativeSym, network: chainLabel })}
        </p>
      ) : null}
      {sell.error ? (
        <p className="text-down mt-3 text-[13px] font-normal">
          {friendlyError(sell.error, t("saleFailedFallback"))}
          {/* The raw reason as sized fine print: support can act on it, and a
              masked failure is undebuggable from a screenshot — but a Solana
              simulation dump is pages long, so it is collapsed and capped. */}
          <span className="mt-1 block text-[11px] leading-[1.4] font-normal text-white/40">
            {supportDetail(sell.error)}
          </span>
        </p>
      ) : null}
      <button
        onClick={() => void confirm()}
        disabled={!canSell}
        className="ws-chrome text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {value <= 0
          ? t("enterAmount")
          : overBalance
            ? t("notEnoughBalance")
            : sell.isPending
              ? t("confirming")
              : t("sellToken", { name: payload.name })}
      </button>
    </div>
  );
}
