"use client";

import { friendlyError } from "@/lib/errors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { RwaIssuerCard } from "@/features/rwa/components/rwa-issuer-card";
import { useDepositStatus } from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useReroutedWithdraw } from "@/hooks/use-withdraw";
import { useRwaQuote, useRwaBuild } from "@/features/rwa/hooks/use-rwa-trade";
import { useExecuteRwa } from "@/features/rwa/hooks/use-execute-rwa";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import {
  assetPriceUsd,
  rwaLogoUrl,
  USDC_BY_CHAIN,
  type RwaApiAsset,
  type RwaQuote,
  type RwaQuoteRequest,
} from "@/features/rwa/lib/api";
import { getWalletAddress } from "@/lib/user";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { depositProgress, quoteFee, settlementFor } from "@/lib/deposit";
import {
  clearPendingRwaSettlement,
  savePendingRwaSettlement,
  type RwaSettlementDirection,
} from "@/lib/trade/pending-settlement";
import { formatAmount, formatUsd, toBaseUnits } from "@/lib/trade/math";
import { belowMinimumBuy, minimumBuyUsd } from "@/lib/trade/minimums";
import {
  buyQuoteRequest,
  chainLabel,
  chainNetwork,
  errorCode,
  estimateReceiveTokens,
  estimateReceiveUsdc,
  exceedsBalance,
  findRwaHolding,
  gasMinimumForChain,
  gasSymbolForChain,
  gradientFor,
  hasNativeGas,
  isIssuerAccess,
  isSellableChain,
  isTransientRwaError,
  pctOfRawBalance,
  quoteReceiveTokens,
  requiresNativeGas,
  rwaErrorInfo,
  sellQuoteRequest,
} from "@/features/rwa/lib/presenter";

type Mode = "buy" | "sell";
type Phase = "idle" | "quoting" | "quoted" | "confirming" | "done";

interface Notice {
  // "error" renders red; "gas" and "info" render as an amber advisory.
  kind: "error" | "gas" | "info";
  message: string;
}

interface SignStep {
  index: number;
  total: number;
  label: string;
}

interface SettlementRequest {
  id: string;
  direction: RwaSettlementDirection;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const SLIPPAGE_BPS = 50;
// Quick-buy dollar amounts, matching the portfolio buy sheet.
const BUY_PRESETS = [10, 50, 100];
// Quick-sell fractions of the balance, matching the portfolio sell sheet.
const SELL_PRESETS = [0.25, 0.5, 1];

// A quote older than this is not a price to execute against. Confirm refreshes
// it and asks the user to confirm again on the new numbers.
const QUOTE_TTL_MS = 60_000;

// Backoff schedule for transparently retrying a transient read (quote/build).
// These calls never submit a transaction, so a retry is safe and spares the user
// a rate-limit or "service busy" error for a blip that clears in a second.
const RETRY_BACKOFFS_MS = [800, 1600];

function positiveBaseUnits(value: string | undefined): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const amount = BigInt(value);
  return amount > 0n ? amount : null;
}

// Whether a quote is too old to execute against. Module-level so the compiler
// treats the wall-clock read as the event-time check it is, not render state.
function quoteIsStale(quotedAt: number): boolean {
  return Date.now() - quotedAt > QUOTE_TTL_MS;
}

async function withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : undefined;
      if (isTransientRwaError(errorCode(e), message) && attempt < RETRY_BACKOFFS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFFS_MS[attempt]));
        continue;
      }
      throw e;
    }
  }
}

interface RwaTradePanelProps {
  asset: RwaApiAsset;
  // Drop the card chrome when rendered inside a modal, which already provides
  // its own sheet surface and padding.
  bare?: boolean;
  // Which side to open on. Defaults to buy; holdings open it on sell.
  initialMode?: Mode;
  // Pre-fill the amount, e.g. from a spoken "buy $10 of Ondo". The user still
  // reviews and confirms — we only stage the form.
  initialAmount?: string;
  // Opens the deposit flow. An empty wallet is the most common reason a first
  // buy stalls, so the panel offers the way forward rather than a dead zero.
  onAddFunds?: () => void;
  // The Dextopus request is persisted at dashboard scope, so the user can
  // close this sheet after their source transfer is broadcast.
  onContinueInBackground?: () => void;
}

// Buy or sell surface for one RWA. Solana buys can fund their Solana USDC from
// Base USDC through a strict Dextopus request before the RWA transaction is
// built. Confirmed Solana sale proceeds are handed to the persistent worker
// and settled back to Base USDC without another user action.
export function RwaTradePanel({
  asset,
  bare = false,
  initialMode = "buy",
  initialAmount = "",
  onAddFunds,
  onContinueInBackground,
}: RwaTradePanelProps) {
  const t = useTranslations("rwa");
  const tBuySell = useTranslations("buySell");
  const { user } = usePrivy();
  const portfolio = usePortfolio();
  const { refetchFresh: refreshPortfolio } = portfolio;
  const { mutateAsync: quoteAsync } = useRwaQuote();
  const { mutateAsync: buildAsync } = useRwaBuild();
  const execute = useExecuteRwa();
  const {
    withdraw: routeUsdc,
    quoting: routeQuotePending,
    sending: routeSendPending,
  } = useReroutedWithdraw("trade");

  const mode: Mode = initialMode;
  const isBuy = mode === "buy";
  const [amount, setAmount] = useState(initialAmount);
  const [phase, setPhase] = useState<Phase>("idle");
  const [quote, setQuote] = useState<RwaQuote | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [signStep, setSignStep] = useState<SignStep | null>(null);
  const [settlementRequest, setSettlementRequest] = useState<SettlementRequest | null>(null);
  const settlementStatus = useDepositStatus(settlementRequest?.id ?? null, "trade");

  const logos = useTokenLogos([{ chain: asset.chain, address: asset.address }]);
  const logo = logos[tokenLogoKey(asset.chain, asset.address)] ?? rwaLogoUrl(asset);

  const price = assetPriceUsd(asset);
  const payValue = Number.parseFloat(amount) || 0;
  // Solana buys start at 2 USDC (lib/trade/minimums); Base keeps the default.
  const settlesOnSolana = asset.chain === "solana";
  const minBuyUsd = minimumBuyUsd(settlesOnSolana);
  const belowMin = isBuy && belowMinimumBuy(payValue, settlesOnSolana);

  // A buy always spends USDC. The dollar the user types is the USDC spent;
  // where that USDC currently sits is the panel's problem, not theirs.
  const payInput = USDC_BY_CHAIN[asset.chain];
  const balanceOf = useCallback(
    (network: string, symbol: string) =>
      portfolio.tokens.find((t) => t.network === network && t.symbol.toUpperCase() === symbol)
        ?.balance ?? 0,
    [portfolio.tokens]
  );
  const onChainUsdc = balanceOf(chainNetwork(asset.chain), "USDC");
  const baseUsdc = balanceOf("base-mainnet", "USDC");
  const solanaUsdcRaw = BigInt(
    portfolio.tokens.find(
      (token) =>
        token.network === "solana-mainnet" &&
        token.address?.toLowerCase() === settlementFor("solana").asset.toLowerCase()
    )?.rawBalance ?? "0"
  );
  // Solana assets can be funded only from Base USDC. The transfer is a strict
  // Dextopus request that lands in the user's Solana wallet before the RWA
  // trade is built and sponsored.
  const spendableUsd = asset.chain === "solana" ? onChainUsdc + baseUsdc : onChainUsdc;
  const walletEmpty = isBuy && !portfolio.loading && !portfolio.error && spendableUsd <= 0;
  const solanaFundingShortfall = Math.max(0, payValue - onChainUsdc);
  // Dextopus must receive at least the configured Solana buy floor. If a small
  // shortfall remains, fund that floor and retain the rest for the next buy.
  const solanaFundingAmount = Math.max(minBuyUsd, solanaFundingShortfall);
  const needsBaseToSolanaFunding =
    isBuy && asset.chain === "solana" && payValue > 0 && solanaFundingShortfall > 1e-6;
  const canFundSolana = baseUsdc + 1e-6 >= solanaFundingAmount;
  const settlementProgress = settlementStatus.data
    ? depositProgress(settlementStatus.data.status, settlementStatus.data.executionStatus)
    : null;
  const settlementBusy =
    routeQuotePending ||
    routeSendPending ||
    // A request is still pending while the first status fetch is in flight.
    // Otherwise a click between wallet confirmation and the first poll could
    // create a duplicate Base-USDC transfer.
    (settlementRequest !== null && (settlementProgress === null || !settlementProgress.terminal));

  // Sell side: the held RWA, which carries the exact on-chain decimals we need
  // to size the input. Absent when the chain isn't indexed or nothing is held.
  const holding = useMemo(() => findRwaHolding(portfolio.tokens, asset), [portfolio.tokens, asset]);
  const sellable = isSellableChain(asset.chain);
  const sellBlocked = !isBuy && !holding;

  const sellBalance = holding?.balance ?? 0;
  const sellRaw = holding?.rawBalance ?? null;
  const sellDecimals = holding?.decimals ?? null;

  const overBalance = isBuy
    ? payValue > 0 && spendableUsd > 0 && payValue > spendableUsd + 1e-6
    : payValue > 0 &&
      sellBalance > 0 &&
      sellRaw != null &&
      sellDecimals != null &&
      exceedsBalance(amount, sellRaw, sellDecimals);

  // The quote/build request for the active direction, or null when the side is
  // not ready to quote.
  const buildReq = useCallback(
    (value: string): RwaQuoteRequest | null => {
      if (isBuy) return buyQuoteRequest(asset, value, SLIPPAGE_BPS, payInput);
      return holding ? sellQuoteRequest(asset, value, SLIPPAGE_BPS, holding.decimals) : null;
    },
    [isBuy, payInput, holding, asset]
  );

  // Monotonic id for quote requests. A response only lands if it is still the
  // newest request; editing the amount also bumps it, so a slow response for a
  // superseded amount is discarded instead of overwriting the live quote.
  const quoteSeqRef = useRef(0);
  // When the live quote landed, for the pre-execute staleness check.
  const quotedAtRef = useRef(0);

  const runQuote = useCallback(
    async (value: string): Promise<RwaQuote | null> => {
      const num = Number.parseFloat(value);
      const req = buildReq(value);
      if (!(num > 0) || !req) return null;
      // Under the floor there is nothing to price: the button says the minimum.
      if (isBuy && belowMinimumBuy(num, asset.chain === "solana")) {
        setQuote(null);
        setPhase("idle");
        return null;
      }
      const seq = ++quoteSeqRef.current;
      setPhase("quoting");
      setNotice(null);
      try {
        const res = await withTransientRetry(() => quoteAsync(req));
        if (seq !== quoteSeqRef.current) return null;
        if (!res.best) {
          setQuote(null);
          setPhase("idle");
          setNotice({ kind: "error", message: rwaErrorInfo("NO_ROUTE").message });
          return null;
        }
        quotedAtRef.current = Date.now();
        setQuote(res.best);
        setPhase("quoted");
        return res.best;
      } catch (e) {
        if (seq !== quoteSeqRef.current) return null;
        const info = rwaErrorInfo(errorCode(e), e instanceof Error ? e.message : undefined);
        setQuote(null);
        setPhase("idle");
        setNotice({ kind: "error", message: info.message });
        return null;
      }
    },
    [quoteAsync, buildReq, isBuy, asset.chain]
  );

  // A stable identity for the current quote request; portfolio refetches hand
  // back new object references with identical values, and keying the debounce
  // on this string stops those from firing a redundant quote.
  const quoteSig = isBuy
    ? `buy:${payInput.address}:${payInput.decimals}`
    : holding
      ? `sell:${asset.address}:${holding.decimals}`
      : null;

  const runQuoteRef = useRef(runQuote);
  useEffect(() => {
    runQuoteRef.current = runQuote;
  }, [runQuote]);

  // Debounce the live quote. Only a changed amount or a changed traded token
  // reschedules it, so a background portfolio refetch never re-quotes.
  useEffect(() => {
    const num = Number.parseFloat(amount);
    if (!(num > 0) || !quoteSig || (isBuy && belowMinimumBuy(num, asset.chain === "solana"))) {
      return;
    }
    const timer = setTimeout(() => {
      void runQuoteRef.current(amount);
    }, 700);
    return () => clearTimeout(timer);
  }, [amount, quoteSig, isBuy, asset.chain]);

  const onInput = (value: string) => {
    if (!DECIMAL_INPUT.test(value)) return;
    quoteSeqRef.current++;
    setAmount(value);
    const num = Number.parseFloat(value);
    if (isBuy && belowMinimumBuy(num, asset.chain === "solana")) {
      setPhase("idle");
      setQuote(null);
      setNotice(null);
    } else if (num > 0) {
      setPhase("quoting");
      setNotice(null);
    } else {
      setPhase("idle");
      setQuote(null);
      setNotice(null);
    }
  };

  const reset = () => {
    quoteSeqRef.current++;
    setAmount("");
    setPhase("idle");
    setQuote(null);
    setNotice(null);
    setSignStep(null);
    setSettlementRequest(null);
  };

  const fillSellPct = (pct: number) => {
    if (sellBalance <= 0) return;
    const exact =
      sellRaw != null && sellDecimals != null
        ? pctOfRawBalance(sellRaw, sellDecimals, Math.round(pct * 100))
        : null;
    onInput(exact ?? (sellBalance * pct).toFixed(6));
  };

  const fillSpendable = () => {
    if (spendableUsd <= 0) return;
    onInput((Math.floor(spendableUsd * 100) / 100).toFixed(2));
  };

  // The trade itself. The build re-prices server-side, while the staleness
  // gate ensures the user never executes against an old displayed quote.
  useEffect(() => {
    track("market_viewed", { vertical: "real_asset", asset: asset.symbol });
  }, [asset.symbol]);

  // Refresh the portfolio as the Dextopus request advances. These reads use
  // `fresh=1`, so the Base debit and Solana/Base credit show in the UI without
  // waiting for the ordinary portfolio polling cadence.
  const settlementStage = settlementProgress?.stage;
  useEffect(() => {
    if (!settlementRequest || !settlementStatus.data || settlementProgress?.terminal) return;
    void refreshPortfolio();
  }, [refreshPortfolio, settlementProgress?.terminal, settlementRequest, settlementStatus.data]);

  const handledSettlementRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !settlementRequest ||
      !settlementStage ||
      handledSettlementRef.current === settlementRequest.id
    ) {
      return;
    }

    if (settlementStage === "settled") {
      // Base-to-Solana purchases are owned by the dashboard-level settlement
      // worker. It survives this sheet closing and completes the sponsored RWA
      // transaction without exposing a second bridge step to the user.
      if (settlementRequest.direction === "base-to-solana") return;
      handledSettlementRef.current = settlementRequest.id;
      void (async () => {
        clearPendingRwaSettlement(settlementRequest.id);
        await refreshPortfolio();
        // A terminal Dextopus status can arrive just before Alchemy indexes
        // the destination token account. Keep reconciling in the background so
        // the visible balance catches up without a page refresh.
        void portfolio.refetchUntilChanged();
        setSettlementRequest(null);
        setSignStep(null);
        setPhase("done");
        setNotice({ kind: "info", message: t("proceedsBaseReady") });
      })();
      return;
    }

    if (settlementStage === "failed" || settlementStage === "refunded") {
      handledSettlementRef.current = settlementRequest.id;
      void (async () => {
        // Keep terminal state changes out of the polling effect's synchronous
        // execution, matching the settled-path handling above.
        await Promise.resolve();
        clearPendingRwaSettlement(settlementRequest.id);
        setSettlementRequest(null);
        if (settlementRequest.direction === "base-to-solana") {
          setNotice({ kind: "error", message: t("fundSolanaFailed") });
        } else {
          setSignStep(null);
          setPhase("done");
          setNotice({ kind: "error", message: t("proceedsBaseFailed") });
        }
      })();
    }
  }, [amount, portfolio, refreshPortfolio, settlementRequest, settlementStage, t]);

  async function executeTrade() {
    const req = buildReq(amount);
    if (!req) return;

    // The attempt. `trade_completed` below only counts the ones that execute.
    track("trade_previewed", {
      vertical: "real_asset",
      asset: asset.symbol,
      side: isBuy ? "buy" : "sell",
      amount_usd: Number(amount),
    });

    // Sponsored chains never gate on native gas; the check only applies where
    // the wallet really pays its own fee.
    const gas = hasNativeGas(portfolio.tokens, asset.chain);
    const gasKnown = !portfolio.loading && !portfolio.error;
    if (requiresNativeGas(asset.chain) && gasKnown && gas === false) {
      setNotice({
        kind: "gas",
        message: t("gasNeeded", {
          symbol: gasSymbolForChain(asset.chain),
          amount: gasMinimumForChain(asset.chain),
        }),
      });
      return;
    }

    const taker = getWalletAddress(user, asset.chain === "solana" ? "solana" : "ethereum");
    if (!taker) {
      setNotice({ kind: "error", message: t("connectWallet") });
      return;
    }

    setPhase("confirming");
    setNotice(null);
    setSignStep(null);
    const toastId = toast.loading(
      isBuy
        ? t("buyingSymbol", { symbol: asset.symbol })
        : t("sellingSymbol", { symbol: asset.symbol })
    );
    let saleHandoffId: string | null = null;
    try {
      // Real execution needs an executable action. Asking the backend for a
      // simulated build here can produce a non-submittable Solana transaction.
      const action = await withTransientRetry(() =>
        buildAsync({
          ...req,
          taker,
          simulate: asset.chain === "solana" ? false : undefined,
        })
      );
      if (!isBuy && asset.chain === "solana") {
        const minimumProceedsRaw = positiveBaseUnits(
          action.quote?.output.amountMin ??
            action.quote?.output.amount ??
            quote?.output.amountMin ??
            quote?.output.amount
        );
        const expectedProceedsRaw = positiveBaseUnits(
          action.quote?.output.amount ??
            action.quote?.output.amountMin ??
            quote?.output.amount ??
            quote?.output.amountMin
        );
        if (!minimumProceedsRaw || !expectedProceedsRaw) {
          throw new Error("The sale quote is missing its proceeds.");
        }
        saleHandoffId = `rwa-sale:${crypto.randomUUID()}`;
        savePendingRwaSettlement({
          requestId: saleHandoffId,
          direction: "solana-to-base",
          assetSymbol: asset.symbol,
          createdAt: Date.now(),
          sale: {
            startingUsdcRaw: solanaUsdcRaw.toString(),
            minimumProceedsRaw: minimumProceedsRaw.toString(),
            expectedProceedsRaw: (expectedProceedsRaw < minimumProceedsRaw
              ? minimumProceedsRaw
              : expectedProceedsRaw
            ).toString(),
            slippageBps: SLIPPAGE_BPS,
          },
        });
      }
      await execute(action, asset.chain, (index, step) => {
        setSignStep({ index, total: action.steps.length, label: step.description });
      });
      track("trade_completed", {
        vertical: "real_asset",
        asset: asset.symbol,
        side: isBuy ? "buy" : "sell",
        amount_usd: Number(amount),
        issuer: asset.issuer,
      });
      toast.success(
        isBuy
          ? t("boughtSymbol", { symbol: asset.symbol })
          : t("soldSymbol", { symbol: asset.symbol }),
        { id: toastId }
      );
      setSignStep(null);

      if (saleHandoffId) {
        setPhase("done");
        setNotice({ kind: "info", message: t("proceedsBaseWorking") });
        void portfolio.refetchUntilChanged();
        onContinueInBackground?.();
        return;
      }

      setPhase("done");
      // Not awaited: the trade is settled and the user should see that now.
      void portfolio.refetchUntilChanged();
    } catch (e) {
      if (saleHandoffId) clearPendingRwaSettlement(saleHandoffId);
      const info = rwaErrorInfo(errorCode(e), e instanceof Error ? e.message : undefined);
      // The provider's own code, which is already a coded string. The raw
      // message is never sent: it can quote back what the user typed.
      track("trade_failed", {
        vertical: "real_asset",
        asset: asset.symbol,
        reason: errorCode(e) ?? "trade_failed",
      });
      setSignStep(null);
      setNotice({ kind: "error", message: info.message });
      toast.error(info.message, { id: toastId });
      setPhase("quoted");
      if (info.requote) void runQuote(amount);
    }
  }

  const confirmTrade = async () => {
    if (!quote || overBalance) return;
    if (needsBaseToSolanaFunding) {
      if (!canFundSolana) {
        setNotice({
          kind: "error",
          message: t("fundSolanaShortBody", { amount: formatUsd(solanaFundingAmount) }),
        });
        return;
      }

      const baseWallet = getWalletAddress(user, "ethereum");
      const solanaWallet = getWalletAddress(user, "solana");
      if (!baseWallet || !solanaWallet) {
        setNotice({ kind: "error", message: t("connectWallet") });
        return;
      }

      try {
        setNotice({ kind: "info", message: t("fundSolanaWorking") });
        const base = settlementFor("ethereum");
        const solana = settlementFor("solana");
        const result = await routeUsdc({
          originNetwork: "base-mainnet",
          originChainId: base.chainId,
          originTokenAddress: base.asset,
          originDecimals: base.decimals,
          destinationChainId: solana.chainId,
          destinationAsset: solana.asset,
          to: solanaWallet,
          amount: toBaseUnits(solanaFundingAmount.toFixed(6), base.decimals),
          refundTo: baseWallet,
        });
        savePendingRwaSettlement({
          requestId: result.depositRequestId,
          direction: "base-to-solana",
          assetSymbol: asset.symbol,
          createdAt: Date.now(),
          purchase: {
            assetAddress: asset.address,
            assetSymbol: asset.symbol,
            amountInRaw: toBaseUnits(amount, solana.decimals).toString(),
            startingUsdcRaw: solanaUsdcRaw.toString(),
            minimumDeliveryRaw: result.minAmountOut,
            slippageBps: SLIPPAGE_BPS,
          },
        });
        setSettlementRequest({ id: result.depositRequestId, direction: "base-to-solana" });
        toast.success(t("purchaseInitiated", { symbol: asset.symbol }));
        onContinueInBackground?.();
      } catch (error) {
        setNotice({
          kind: "error",
          message: friendlyError(error, t("fundSolanaFailed")),
        });
      }
      return;
    }
    if (quoteIsStale(quotedAtRef.current)) {
      void runQuote(amount);
      setNotice({ kind: "info", message: rwaErrorInfo("QUOTE_EXPIRED").message });
      return;
    }
    await executeTrade();
  };

  if (isIssuerAccess(asset)) {
    return <RwaIssuerCard asset={asset} />;
  }

  const usdValue = isBuy ? payValue : payValue * (price ?? 0);
  const recvDecimals = isBuy ? (holding?.decimals ?? null) : USDC_BY_CHAIN[asset.chain].decimals;
  const quoteReceive = quoteReceiveTokens(quote, recvDecimals);
  const receiveEst =
    quoteReceive ??
    (isBuy ? estimateReceiveTokens(usdValue, price) : estimateReceiveUsdc(payValue, price));
  // The fee a live quote implies; an estimate has none, so it stays hidden then.
  const receiveUsd = isBuy ? (receiveEst != null && price ? receiveEst * price : null) : receiveEst;
  const feeUsd = quoteReceive != null && receiveUsd != null ? quoteFee(usdValue, receiveUsd) : null;
  const confirming = phase === "confirming";
  const busy = confirming || settlementBusy;
  const canConfirm =
    phase === "quoted" &&
    quote != null &&
    !busy &&
    !overBalance &&
    !belowMin &&
    (!needsBaseToSolanaFunding || canFundSolana);

  const sellBlockedMessage = !sellable
    ? t("sellChains")
    : portfolio.loading
      ? t("checkingBalance")
      : t("noHoldingsToSell", { symbol: asset.symbol });

  const header = (
    <>
      <Eyebrow>{isBuy ? tBuySell("buy") : tBuySell("sell")}</Eyebrow>
      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={asset.symbol} bg={gradientFor(asset.symbol)} size={44} logo={logo} />
        <div className="min-w-0 flex-1">
          <div className="ws-display text-[22px]">{asset.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">
            {isBuy ? asset.symbol : `${asset.symbol} · ${chainLabel(asset.chain)}`}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div
      className={
        bare
          ? ""
          : "ws-card p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.85)] sm:p-[22px]"
      }
    >
      {header}

      {sellBlocked ? (
        <div className="ws-inset mt-4 p-[18px] text-center">
          <div className="font-sans text-[14px] font-semibold text-white/85">
            {sellable
              ? t("noSymbolToSell", { symbol: asset.symbol })
              : t("sellingOnChain", { symbol: asset.symbol, chain: chainLabel(asset.chain) })}
          </div>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] font-normal text-white/55">
            {sellBlockedMessage}
          </p>
        </div>
      ) : phase === "done" ? (
        <div className="ws-inset mt-4 p-[18px] text-center">
          <div className="text-up font-sans text-[15px] font-semibold">{t("orderFilled")}</div>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] font-normal text-white/55">
            {isBuy ? t("buySettled", { name: asset.name }) : t("sellSettled", { name: asset.name })}
          </p>
          <button
            onClick={reset}
            className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-[13px] font-sans text-[14px] font-semibold hover:opacity-90"
          >
            {isBuy ? t("buyMore") : t("sellMore")}
          </button>
        </div>
      ) : (
        <>
          <div className="ws-inset mt-4 p-[15px]">
            <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
              <span>{isBuy ? tBuySell("amount") : tBuySell("amountToSell")}</span>
              {isBuy ? (
                <button
                  onClick={fillSpendable}
                  className="tnum cursor-pointer text-white/55 hover:text-white"
                >
                  {tBuySell("balanceUsd", { amount: formatAmount(spendableUsd) })}
                </button>
              ) : (
                <button
                  onClick={() => fillSellPct(1)}
                  className="tnum cursor-pointer text-white/55 hover:text-white"
                >
                  {t("balanceOf", { amount: formatAmount(sellBalance), symbol: asset.symbol })}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              {isBuy ? <span className="ws-display text-[28px] text-white/70">$</span> : null}
              <input
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => onInput(e.target.value)}
                className={`ws-display tnum w-full min-w-0 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30 ${
                  isBuy ? "text-right" : ""
                }`}
              />
              {!isBuy ? (
                <span className="shrink-0 font-sans text-[14px] font-medium text-white/70">
                  {asset.symbol}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex gap-1.5">
            {isBuy
              ? BUY_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => onInput(String(p))}
                    className="flex-1 cursor-pointer rounded-[12px] border border-white/10 bg-white/4 py-2 font-sans text-[13px] font-medium text-white/75 transition-colors hover:bg-white/8"
                  >
                    ${p}
                  </button>
                ))
              : SELL_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => fillSellPct(pct)}
                    disabled={sellBalance <= 0}
                    className="flex-1 cursor-pointer rounded-[12px] border border-white/10 bg-white/4 py-2 font-sans text-[13px] font-medium text-white/75 transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pct === 1 ? tBuySell("max") : `${pct * 100}%`}
                  </button>
                ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-[13.5px] font-normal">
            <span className="text-white/55">{tBuySell("youGetAbout")}</span>
            <span className="tnum text-white">
              {receiveEst != null
                ? isBuy
                  ? `${formatAmount(receiveEst)} ${asset.symbol}`
                  : formatUsd(receiveEst)
                : "—"}
            </span>
          </div>

          {feeUsd != null && feeUsd > 0 ? (
            <div className="mt-2 flex items-center justify-between text-[13.5px] font-normal">
              <span className="text-white/55">{tBuySell("transactionFee")}</span>
              <span className="tnum text-white/75">≈ {formatUsd(feeUsd)}</span>
            </div>
          ) : null}

          {!isBuy ? (
            <p className="mt-2 text-[12px] leading-[1.5] font-normal text-white/45">
              {tBuySell("settlesToUsdc")}
            </p>
          ) : null}

          {notice ? (
            <div
              className={`mt-3.5 rounded-[12px] border p-3 text-[12.5px] font-medium ${
                notice.kind === "error"
                  ? "border-down/30 bg-down/10 text-down"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-200"
              }`}
            >
              {notice.message}
            </div>
          ) : null}
          {walletEmpty ? (
            <div className="mt-3.5 rounded-[12px] border border-white/12 bg-white/5 p-3">
              <div className="text-[12.5px] leading-[1.5] font-medium text-white/80">
                {t("noFundsTitle")}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/50">
                {t("noFundsBody")}
              </p>
              {onAddFunds ? (
                <button
                  onClick={onAddFunds}
                  className="text-ink mt-2.5 w-full cursor-pointer rounded-[12px] bg-white p-2.5 font-sans text-[13.5px] font-semibold hover:opacity-90"
                >
                  {t("addFunds")}
                </button>
              ) : null}
            </div>
          ) : needsBaseToSolanaFunding && !canFundSolana ? (
            <div className="mt-3.5 rounded-[12px] border border-white/12 bg-white/5 p-3">
              <div className="text-[12.5px] leading-[1.5] font-medium text-white/80">
                {t("fundSolanaShort")}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/50">
                {t("fundSolanaShortBody", { amount: formatUsd(solanaFundingAmount) })}
              </p>
            </div>
          ) : null}

          {settlementRequest ? (
            <div className="mt-3.5 rounded-[12px] border border-amber-400/30 bg-amber-400/10 p-3">
              <div className="text-[12.5px] leading-[1.5] font-medium text-amber-200">
                {settlementProgress?.label ??
                  (settlementRequest.direction === "base-to-solana"
                    ? t("fundSolanaWorking")
                    : t("proceedsBaseWorking"))}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/60">
                {settlementRequest.direction === "base-to-solana"
                  ? t("fundSolanaStatus")
                  : t("proceedsBaseStatus")}
              </p>
              {onContinueInBackground ? (
                <button
                  type="button"
                  onClick={onContinueInBackground}
                  className="mt-3 cursor-pointer rounded-[9px] border border-amber-200/25 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-100 hover:bg-amber-100/10"
                >
                  {t("continueInBackground")}
                </button>
              ) : null}
            </div>
          ) : null}

          {!walletEmpty ? (
            <button
              onClick={() => void confirmTrade()}
              disabled={!canConfirm}
              className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? settlementBusy
                  ? settlementRequest?.direction === "solana-to-base"
                    ? t("proceedsBaseWorking")
                    : t("fundSolanaWorking")
                  : signStep
                    ? t("signingStep", { current: signStep.index + 1, total: signStep.total })
                    : t("buildingOrder")
                : belowMin
                  ? tBuySell("minimumUsd", { amount: minBuyUsd })
                  : overBalance
                    ? tBuySell("notEnoughBalance")
                    : needsBaseToSolanaFunding
                      ? t("buySymbol", { symbol: asset.symbol })
                      : phase === "quoting"
                        ? t("fetchingBestPrice")
                        : quote
                          ? isBuy
                            ? t("buySymbol", { symbol: asset.symbol })
                            : t("sellSymbol", { symbol: asset.symbol })
                          : t("enterAmount")}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
