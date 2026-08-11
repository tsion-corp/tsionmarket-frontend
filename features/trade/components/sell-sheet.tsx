"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ProgressBar } from "@/components/ui/progress-bar";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useDepositStatus } from "@/hooks/use-deposit";
import { useLifiSettlement } from "@/hooks/use-lifi-settlement";
import { useSell } from "@/features/trade/hooks/use-sell";
import { depositProgress, type DepositStage } from "@/lib/deposit";
import { formatAmount, formatUsd, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { maxSellable } from "@/lib/trade/gas-buffer";
import { isSponsoredEvmNetwork } from "@/lib/trade/sponsored-evm";
import { toast } from "@/lib/toast";
import { friendlyError } from "@/lib/errors";
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

// Plain-language order status, no bridging jargon. Values are message keys in
// the buySell namespace.
const STAGE_KEY: Record<DepositStage, string> = {
  waiting: "stagePlacingOrder",
  detected: "stageSaleReceived",
  processing: "stageAlmostThere",
  settled: "stageAllDone",
  refunded: "stageAssetReturned",
  failed: "stageSaleFailed",
};

interface SellSheetProps {
  payload: SellPayload;
  onClose: () => void;
}

export function SellSheet({ payload, onClose }: SellSheetProps) {
  const t = useTranslations("buySell");
  const portfolio = usePortfolio();
  const [amount, setAmount] = useState("");
  const sell = useSell();
  const [requestId, setRequestId] = useState<string | null>(null);
  // Which rail carried the sale: Dextopus polls a deposit request, LI.FI polls
  // the Solana transaction signature. Both feed the same stage UI below.
  const [rail, setRail] = useState<"dextopus" | "lifi">("dextopus");
  const [proceeds, setProceeds] = useState<string>("");
  const status = useDepositStatus(rail === "dextopus" ? requestId : null);
  const lifiProgress = useLifiSettlement(rail === "lifi" ? requestId : null);

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

  const dextopusProgress = useMemo(
    () =>
      status.data
        ? depositProgress(status.data.status, status.data.executionStatus)
        : depositProgress("", ""),
    [status.data]
  );
  const progress = rail === "lifi" ? lifiProgress : dextopusProgress;
  const stage = progress.stage;

  const settledRef = useRef(false);
  // Id of the processing toast opened on confirm, resolved when the order settles.
  const toastRef = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (settledRef.current) return;
    if (stage === "settled") {
      settledRef.current = true;
      toast.success(t("soldToast", { symbol: payload.symbol }), { id: toastRef.current });
      toastRef.current = undefined;
      void portfolio.refetchUntilChanged();
    } else if (stage === "failed" || stage === "refunded") {
      settledRef.current = true;
      toast.error(t("saleRefundedToast"), { id: toastRef.current });
      toastRef.current = undefined;
    }
  }, [stage, payload.symbol, portfolio, t]);

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

  const confirm = async () => {
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
      });
      setProceeds(formatAmount(Number(fromBaseUnits(result.estimatedOutput, 6))));
      setRail(result.rail);
      setRequestId(result.requestId);
    } catch {
      // The detailed message is surfaced from sell.error below; resolve the toast.
      toast.error(t("sellFailedToast", { symbol: payload.symbol }), { id: toastRef.current });
      toastRef.current = undefined;
    }
  };

  if (requestId) {
    const failed = stage === "failed" || stage === "refunded";
    const done = stage === "settled";
    const color = failed ? "#f6a5a5" : done ? "#7ce7b0" : "#d4d4d8";
    return (
      <div>
        <Eyebrow>{done ? t("allDone") : t("selling")}</Eyebrow>
        <div className="mt-3 flex items-center gap-[13px]">
          <AssetIcon sym={payload.symbol} bg="#26262b" size={44} logo={payload.logo} />
          <div className="min-w-0 flex-1">
            <div className="ws-display text-[22px]">{payload.name}</div>
            <div className="truncate text-[12.5px] font-normal text-white/50">{payload.symbol}</div>
          </div>
        </div>

        <div className="ws-inset mt-4 p-4">
          <div className="mb-2.5 text-[13px] font-medium text-white">{t(STAGE_KEY[stage])}</div>
          <ProgressBar pct={progress.pct} color={color} />
          {done ? (
            <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/70">
              {proceeds ? t("proceedsAdded", { amount: proceeds }) : t("proceedsAddedFallback")}
            </p>
          ) : failed ? (
            <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/70">
              {t("saleFailedBody", { symbol: payload.symbol })}
            </p>
          ) : (
            <p className="mt-3 text-[13px] leading-[1.5] font-normal text-white/60">
              {t("takesAMoment")}
            </p>
          )}
        </div>

        <button
          onClick={onClose}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("done")}
        </button>
      </div>
    );
  }

  return (
    <div>
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
            onClick={() => setAmount(fillAmount(maxSell))}
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
            onChange={(e) => DECIMAL.test(e.target.value) && setAmount(e.target.value)}
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
            onClick={() => setAmount(fillAmount(Math.min((payload.balance * p) / 100, maxSell)))}
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
          {/* The raw reason as fine print: support can act on it, and a masked
              failure is undebuggable from a screenshot. */}
          <span className="mt-1 block text-[11px] leading-[1.4] font-normal text-white/40">
            {sell.error.message}
          </span>
        </p>
      ) : null}

      <button
        onClick={() => void confirm()}
        disabled={!canSell}
        className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
