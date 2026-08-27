"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useBuy } from "@/features/trade/hooks/use-buy";
import { useSell } from "@/features/trade/hooks/use-sell";
import { useMemeTrade, type TradePhase } from "@/features/trade/hooks/use-meme-trade";
import { useDepositStatus } from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useInvalidateKash } from "@/hooks/use-kash-invalidate";
import { savePendingRwaSettlement } from "@/lib/trade/pending-settlement";
import { usdcBaseUnits, depositProgress, type DepositStage } from "@/lib/deposit";
import { canSellAsset } from "@/lib/sell";
import { gasBufferFor, maxSellable } from "@/lib/trade/gas-buffer";
import { isSponsoredEvmNetwork } from "@/lib/trade/sponsored-evm";
import { formatAmount, formatUsd, fromBaseUnits, toBaseUnits } from "@/lib/trade/math";
import { SolanaBalanceChangedError } from "@/lib/trade/solana-balance";
import { belowMinimumBuy, isSolanaChainId, minimumBuyUsd } from "@/lib/trade/minimums";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { BuyRoute } from "@/lib/buy";
import type { SwapRoute } from "@/lib/spot-swap";
import type { TokenBalance } from "@/lib/server/alchemy";

// The order ticket only needs the selected market's ticker and logo; price comes
// in separately as `mark`.
export interface SpotTicketToken {
  symbol: string;
  logo: string | null;
}
import {
  SpotConfirmSheet,
  type SpotConfirmRow,
  type SpotOrderPhase,
} from "@/features/trade/components/spot-confirm-sheet";

// The spot order ticket: buy with USDC or sell a held balance, market orders
// only (there is no order-monitoring backend for limit or TP/SL yet). The amount
// is entered here; the CTA opens a bottom confirm sheet that executes through the
// same buy/sell mutations the rest of the app uses, so nothing is re-entered.

type Side = "buy" | "sell";

interface SpotPanelProps {
  token: SpotTicketToken | null;
  mark: number;
  usdcBalance: number;
  // The held position in the base asset, if any (drives selling). Null when the
  // user holds none.
  heldToken: TokenBalance | null;
  // The Dextopus route a buy would settle through, or null when the asset is not
  // buyable. Presence of a route is what enables buying.
  buyRoute: BuyRoute | null;
  // The same-chain swap route for a symbol Dextopus does not offer (see
  // lib/spot-swap.ts). A market has buyRoute or swapRoute, never both.
  swapRoute: SwapRoute | null;
}

// Maps the meme swap engine's phases onto the same four states the Dextopus
// settlement flow reports, so the confirm sheet does not need to know which
// rail is running.
function swapOrderPhase(phase: TradePhase): SpotOrderPhase {
  if (phase === "idle") return "confirm";
  if (phase === "confirmed") return "settled";
  if (phase === "failed") return "failed";
  return "working";
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const PERCENTS = [25, 50, 75, 100];
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
// Indicative taker fee shown on the ticket — mirrors apps/trade's
// SWAP_PLATFORM_FEE_BPS (0.15%). The real price tolerance is applied by the
// quote at execution.
const FEE_PCT = 0.0015;
const SLIPPAGE_BPS = 100;

// Plain-language settlement stage message keys for the confirm sheet.
const STAGE_KEY: Record<DepositStage, string> = {
  waiting: "stageWaiting",
  detected: "stageDetected",
  processing: "stageProcessing",
  settled: "stageSettled",
  refunded: "stageRefunded",
  failed: "stageFailed",
};

export function SpotPanel({
  token,
  mark,
  usdcBalance,
  heldToken,
  buyRoute,
  swapRoute,
}: SpotPanelProps) {
  const t = useTranslations("spot");
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [maxRequested, setMaxRequested] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  const buy = useBuy();
  const sell = useSell();
  const memeTrade = useMemeTrade();
  const portfolio = usePortfolio();
  const invalidateKash = useInvalidateKash();
  const status = useDepositStatus(requestId, "trade");

  const base = token?.symbol ?? "";
  const buying = side === "buy";
  // A symbol with a swap route settles through the meme swap engine instead
  // of Dextopus for both sides of the ticket.
  const isSwapMarket = swapRoute != null;
  const canBuy = buyRoute != null || swapRoute != null;
  const heldBalance = heldToken?.balance ?? 0;

  // Sell-side gates, mirroring the sell sheet. A swap market always sells
  // (the swap engine handles its own gas sponsorship via useEvmSend, the
  // same mechanism every EVM network here already uses), so none of
  // Dextopus's per-network sell rules apply to it.
  const notSellable =
    !isSwapMarket && heldToken != null && !canSellAsset(heldToken.network, heldToken.address);
  const maxSell = isSwapMarket
    ? heldBalance
    : heldToken
      ? maxSellable(heldToken.network, heldToken.address, heldToken.balance)
      : 0;
  // Same sponsorship rule as the sell sheet: every registered EVM network
  // sends gas-free, and Solana sells ride the platform co-signer. Hardcoding
  // Base here is what blocked spot sells of assets the portfolio sheet sold
  // fine.
  const sellSponsored =
    heldToken != null &&
    (isSponsoredEvmNetwork(heldToken.network) || heldToken.network === "solana-mainnet");
  const sellNativeSym = heldToken ? (NATIVE_SYMBOL[heldToken.network] ?? "") : "";
  const sellHasGas =
    heldToken == null ||
    sellSponsored ||
    portfolio.tokens.some(
      (p) => p.network === heldToken.network && p.symbol === sellNativeSym && p.balance > 0
    );
  const sellNeedsGas =
    !isSwapMarket && !buying && heldToken != null && !portfolio.loading && !sellHasGas;

  // Clear the amount when the market or side changes, so a figure meant for one
  // asset never carries into another.
  const [seen, setSeen] = useState(`${base}:${side}`);
  const key = `${base}:${side}`;
  if (seen !== key) {
    setSeen(key);
    setAmount("");
    setMaxRequested(false);
  }

  const balance = buying ? usdcBalance : maxSell;
  const amountNum = parseFloat(amount) || 0;

  // Buy: pay USDC, receive base. Sell: sell base, receive USDC. Fee comes off the
  // received side either way.
  const receive = useMemo(() => {
    if (mark <= 0 || amountNum <= 0) return 0;
    const gross = buying ? amountNum / mark : amountNum * mark;
    return gross * (1 - FEE_PCT);
  }, [buying, amountNum, mark]);
  const feeUsd = buying ? amountNum * FEE_PCT : amountNum * mark * FEE_PCT;

  const notBuyable = buying && !canBuy;
  const overBalance = amountNum > balance + 1e-9;
  // Solana buys start at 2 USDC, everything else at 1 (lib/trade/minimums).
  const minBuyUsd = minimumBuyUsd(isSolanaChainId(buyRoute?.destinationChainId));
  const belowMin =
    buying && belowMinimumBuy(amountNum, isSolanaChainId(buyRoute?.destinationChainId));
  // A missing mark only blocks buys; a sell prices at the quote.
  const invalid =
    amountNum <= 0 ||
    overBalance ||
    belowMin ||
    notBuyable ||
    !token ||
    (buying && mark <= 0) ||
    (!buying && (notSellable || sellNeedsGas));

  // Buy settlement stays in the confirm sheet. Sells are handed to the
  // dashboard-level Dextopus tracker as soon as their source transfer lands.
  // A swap market reports its own phase directly from useMemeTrade instead,
  // since it never goes through Dextopus's deposit-status polling.
  const dextopusProgress = status.data
    ? depositProgress(status.data.status, status.data.executionStatus)
    : depositProgress("", "");
  // received is an on-chain-verified balanceOf delta that lands before the
  // backend's own slower confirmation — treated as settled immediately, so
  // this screen never sits on "working" for a trade that has already landed
  // in the wallet.
  const swapSettled = memeTrade.phase === "confirmed" || memeTrade.received != null;
  const swapStage: DepositStage = swapSettled
    ? "settled"
    : memeTrade.phase === "failed"
      ? "failed"
      : memeTrade.phase === "signing" || memeTrade.phase === "confirming"
        ? "processing"
        : "waiting";
  const swapPct: Record<TradePhase, number> = {
    idle: 0,
    linking: 10,
    quoting: 25,
    signing: 50,
    confirming: 75,
    confirmed: 100,
    failed: 0,
  };
  const progress = isSwapMarket
    ? { stage: swapStage, pct: swapSettled ? 100 : swapPct[memeTrade.phase] }
    : dextopusProgress;
  const stage = progress.stage;
  const phase: SpotOrderPhase = isSwapMarket
    ? swapSettled
      ? "settled"
      : swapOrderPhase(memeTrade.phase)
    : !requestId
      ? "confirm"
      : stage === "settled"
        ? "settled"
        : stage === "failed" || stage === "refunded"
          ? "failed"
          : "working";

  // Fire the result toast and refresh holdings once, when the order resolves.
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (isSwapMarket) {
      if (memeTrade.phase === "idle" || resolvedRef.current) return;
      if (memeTrade.phase === "confirmed") {
        resolvedRef.current = true;
        toast.success(
          buying ? t("toastBought", { symbol: base }) : t("toastSold", { symbol: base })
        );
        void portfolio.refetchUntilChanged();
        invalidateKash();
      } else if (memeTrade.phase === "failed") {
        resolvedRef.current = true;
        toast.error(memeTrade.error ?? t("orderFailedNote"));
      }
      return;
    }
    if (!requestId || resolvedRef.current) return;
    if (stage === "settled") {
      resolvedRef.current = true;
      toast.success(buying ? t("toastBought", { symbol: base }) : t("toastSold", { symbol: base }));
      void portfolio.refetchUntilChanged();
      invalidateKash();
    } else if (stage === "failed" || stage === "refunded") {
      resolvedRef.current = true;
      toast.error(t("orderFailedNote"));
    }
  }, [
    isSwapMarket,
    memeTrade.phase,
    memeTrade.error,
    stage,
    requestId,
    buying,
    base,
    portfolio,
    t,
    invalidateKash,
  ]);

  const handleAmount = (raw: string) => {
    const next = raw.replace(/,/g, "");
    if (next === "" || DECIMAL_INPUT.test(next)) {
      setAmount(next);
      setMaxRequested(false);
    }
  };
  const setPercent = (pct: number) => {
    if (balance <= 0) return;
    const v = (balance * pct) / 100;
    // Floor buys to cents so 100% never rounds above the USDC balance; sells keep
    // full precision and settle the exact held amount via rawBalance below.
    if (buying) {
      setAmount((Math.floor(v * 100) / 100).toFixed(2));
      setMaxRequested(false);
      return;
    }
    // String() emits scientific notation for dust, which the regex rejects.
    const fixed = v.toFixed(heldToken?.decimals ?? 18);
    setAmount(fixed.includes(".") ? fixed.replace(/\.?0+$/, "") || "0" : fixed);
    setMaxRequested(pct === 100);
  };

  const submit = () => {
    if (invalid) return;
    setConfirmOpen(true);
  };

  const runOrder = async () => {
    if (isSwapMarket) {
      if (!swapRoute) return;
      try {
        await memeTrade.trade({
          side: buying ? "BUY" : "SELL",
          tokenAddress: swapRoute.tokenAddress,
          amount,
          slippageBps: SLIPPAGE_BPS,
        });
        if (buying) return; // buy stays in the sheet, matching the Dextopus path
        setConfirmOpen(false);
        setAmount("");
        setMaxRequested(false);
        void portfolio.refetchUntilChanged();
      } catch (e) {
        // useMemeTrade already records phase "failed" and its own error
        // message; only the sheet needs closing for a sell, matching the
        // Dextopus sell branch below.
        if (!buying) setConfirmOpen(false);
        toast.error(friendlyError(e, t("orderRejected")));
      }
      return;
    }
    try {
      if (buying) {
        if (!buyRoute) return;
        const result = await buy.mutateAsync({
          route: buyRoute,
          amount: usdcBaseUnits(amount),
          slippageBps: SLIPPAGE_BPS,
        });
        setRequestId(result.requestId);
      } else {
        if (!heldToken) return;
        // Exact-balance sends only when nothing is held back for gas.
        const amountUnits =
          amountNum >= heldBalance && gasBufferFor(heldToken.network, heldToken.address) === 0
            ? BigInt(heldToken.rawBalance)
            : toBaseUnits(amount, heldToken.decimals);
        const result = await sell.mutateAsync({
          network: heldToken.network,
          asset: heldToken.address,
          decimals: heldToken.decimals,
          amount: amountUnits,
          slippageBps: SLIPPAGE_BPS,
          maxRequested,
        });
        savePendingRwaSettlement({
          requestId: result.requestId,
          direction: "solana-to-base",
          assetSymbol: base,
          createdAt: Date.now(),
        });
        setConfirmOpen(false);
        setAmount("");
        setMaxRequested(false);
        toast.success(t("workingNote"));
        void portfolio.refetchUntilChanged();
      }
    } catch (e) {
      if (e instanceof SolanaBalanceChangedError && heldToken) {
        setAmount(fromBaseUnits(e.availableAmount, heldToken.decimals));
        setMaxRequested(true);
        void portfolio.refetch();
      }
      setConfirmOpen(false);
      toast.error(friendlyError(e, t("orderRejected")));
    }
  };

  // Cancel (before signing) just closes. Done (after a resolved order) resets the
  // ticket so the next order starts clean.
  const closeSheet = () => {
    if (phase === "working") return;
    setConfirmOpen(false);
    if (isSwapMarket) {
      if (memeTrade.phase === "idle") return;
      resolvedRef.current = false;
      memeTrade.reset();
      if (phase === "settled") {
        setAmount("");
        setMaxRequested(false);
      }
      return;
    }
    if (requestId) {
      setRequestId(null);
      resolvedRef.current = false;
      if (phase === "settled") setAmount("");
      if (phase === "settled") setMaxRequested(false);
    }
  };

  const confirmRows: SpotConfirmRow[] = buying
    ? [
        { label: t("market"), value: base },
        { label: t("youPay"), value: formatUsd(amountNum) },
        { label: t("youReceive"), value: `${formatAmount(receive)} ${base}`, tone: "up" },
        { label: t("price"), value: formatUsd(mark) },
        { label: t("estFee"), value: formatUsd(feeUsd) },
      ]
    : [
        { label: t("market"), value: base },
        { label: t("youSellRow"), value: `${formatAmount(amountNum)} ${base}` },
        { label: t("youReceive"), value: formatUsd(receive), tone: "up" },
        { label: t("price"), value: formatUsd(mark) },
        { label: t("estFee"), value: formatUsd(feeUsd) },
      ];

  const cta = !token
    ? t("ctaSelect")
    : notBuyable
      ? t("ctaNotBuyable", { symbol: base })
      : !buying && notSellable
        ? t("ctaNotSellable", { symbol: base })
        : sellNeedsGas
          ? t("ctaNeedsGas", {
              symbol: sellNativeSym,
              chain: heldToken ? (CHAIN_LABEL[heldToken.network] ?? heldToken.network) : "",
            })
          : amountNum <= 0
            ? t("ctaEnterAmount")
            : belowMin
              ? t("ctaMin", { amount: formatUsd(minBuyUsd) })
              : overBalance
                ? t("ctaNoBalance")
                : buying
                  ? t("ctaBuy", { symbol: base })
                  : t("ctaSell", { symbol: base });

  return (
    <div className="ws-card p-4 sm:p-5" data-sensitive="other">
      {/* Buy / Sell. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide("buy")}
          className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
            buying
              ? "border-up/40 bg-up/16 text-up border"
              : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
          }`}
        >
          {t("buy")}
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
            !buying
              ? "border-down/40 bg-down/14 text-down border"
              : "border border-white/10 bg-white/4 text-white/55 hover:text-white/80"
          }`}
        >
          {t("sell")}
        </button>
      </div>

      {/* Amount. */}
      <div className={`ws-inset mt-3 p-4 ${overBalance || belowMin ? "ws-invalid" : ""}`}>
        <div className="mb-2 flex items-center justify-between text-xs font-normal text-white/55">
          <span>{buying ? t("youPay") : t("youSell")}</span>
          <span className="flex items-center gap-2">
            <span className="tnum">
              {t("balance", { amount: formatAmount(balance), symbol: buying ? "USD" : base })}
            </span>
            {balance > 0 ? (
              <button
                onClick={() => setPercent(100)}
                className="text-accent cursor-pointer font-medium hover:opacity-80"
              >
                {t("max")}
              </button>
            ) : null}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            value={amount}
            onChange={(e) => handleAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="ws-display tnum min-w-0 flex-1 bg-transparent text-[30px] text-white outline-none placeholder:text-white/30"
          />
          <span className="shrink-0 font-sans text-sm font-medium text-white/70">
            {buying ? "USD" : base}
          </span>
        </div>
      </div>

      {/* Percent-of-balance quick fills. */}
      <div className="mt-2 grid grid-cols-4 gap-2">
        {PERCENTS.map((p) => (
          <button
            key={p}
            onClick={() => setPercent(p)}
            disabled={balance <= 0}
            className="tnum cursor-pointer rounded-lg border border-white/10 bg-white/4 py-1.5 text-xs font-medium text-white/60 transition-colors hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {p}%
          </button>
        ))}
      </div>

      {/* Summary. */}
      <div className="ws-inset mt-3 flex flex-col gap-2 p-4 text-[12.5px] font-normal">
        <div className="flex justify-between">
          <span className="text-white/55">{t("price")}</span>
          <span className="tnum text-white">{mark > 0 ? formatUsd(mark) : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/55">{t("youReceive")}</span>
          <span className="tnum text-white">
            {receive > 0 ? (buying ? `${formatAmount(receive)} ${base}` : formatUsd(receive)) : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/55">{t("estFee")}</span>
          <span className="tnum text-white">{amountNum > 0 ? formatUsd(feeUsd) : "—"}</span>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={invalid}
        className={`mt-3 w-full rounded-[14px] p-[15px] font-sans text-[15px] font-semibold transition-opacity ${
          buying ? "bg-up text-up-ink" : "bg-down text-down-ink"
        } ${invalid ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:opacity-90"}`}
      >
        {cta}
      </button>
      {notBuyable ? (
        <p className="mt-2 text-center text-xs font-normal text-white/45">
          {t("notBuyableNote", { symbol: base })}
        </p>
      ) : !buying && token && heldBalance <= 0 ? (
        <p className="mt-2 text-center text-xs font-normal text-white/45">
          {t("noSellBalance", { symbol: base })}
        </p>
      ) : null}

      <SpotConfirmSheet
        open={confirmOpen}
        side={side}
        base={base}
        logo={token?.logo}
        rows={confirmRows}
        phase={phase}
        progressPct={progress.pct}
        stageLabel={t(STAGE_KEY[stage])}
        onConfirm={() => void runOrder()}
        onClose={closeSheet}
      />
    </div>
  );
}
