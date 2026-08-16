"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { RwaIssuerCard } from "@/features/rwa/components/rwa-issuer-card";
import { RwaProgress, type ProgressStep } from "@/features/rwa/components/rwa-progress";
import { usePortfolio } from "@/hooks/use-portfolio";
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
import { useSolanaFunding } from "@/hooks/use-solana-funding";
import { planAffordable, planBaseFunding, planSolanaFunding } from "@/lib/trade/funding";
import { useSolanaProceeds } from "@/hooks/use-solana-proceeds";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import { formatAmount, formatUsd, toBaseUnits } from "@/lib/trade/math";
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

// The base units a bring-home leg should send: what the plan asks for, capped
// at what the wallet actually holds.
function bridgeHomeUnits(bridgeUsdc: number | undefined, rawBalance: string | undefined): string {
  if (bridgeUsdc == null || !rawBalance) return "0";
  const wanted = toBaseUnits(bridgeUsdc.toFixed(6), 6);
  const held = BigInt(rawBalance || "0");
  return (wanted < held ? wanted : held).toString();
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
}

// Buy or sell surface for one RWA, in the portfolio sheet idiom: a buy is a
// dollar amount spent from the account's USDC (wherever it sits — the panel
// moves it under the hood and the whole run is sponsored, so no network or gas
// ever surfaces); a sell is sized in the held token and settles to USDC. Both
// directions run a live debounced quote, then on confirm move any funds that
// need moving, build the action, sign every step through Privy, and refresh
// the portfolio.
export function RwaTradePanel({
  asset,
  bare = false,
  initialMode = "buy",
  initialAmount = "",
  onAddFunds,
}: RwaTradePanelProps) {
  const t = useTranslations("rwa");
  const tBuySell = useTranslations("buySell");
  const { user } = usePrivy();
  const portfolio = usePortfolio();
  const { mutateAsync: quoteAsync } = useRwaQuote();
  const { mutateAsync: buildAsync } = useRwaBuild();
  const execute = useExecuteRwa();

  const mode: Mode = initialMode;
  const isBuy = mode === "buy";
  const [amount, setAmount] = useState(initialAmount);
  const [phase, setPhase] = useState<Phase>("idle");
  const [quote, setQuote] = useState<RwaQuote | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [signStep, setSignStep] = useState<SignStep | null>(null);
  // The amount funding has already run for. Without this, a purchase that
  // stalled after its bridge offers to bridge again — the user pays twice and
  // still holds no asset.
  const [fundedFor, setFundedFor] = useState<string | null>(null);

  const logos = useTokenLogos([{ chain: asset.chain, address: asset.address }]);
  const logo = logos[tokenLogoKey(asset.chain, asset.address)] ?? rwaLogoUrl(asset);

  const price = assetPriceUsd(asset);
  const payValue = Number.parseFloat(amount) || 0;

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
  // Cross-chain funding exists only between Base and Solana; every other
  // chain spends the USDC it holds.
  const otherChainUsdc =
    asset.chain === "solana"
      ? balanceOf("base-mainnet", "USDC")
      : asset.chain === "base"
        ? balanceOf("solana-mainnet", "USDC")
        : 0;
  // Everything the buy can draw on, across both live chains. One number,
  // because the hop between them is automatic and sponsored.
  const spendableUsd = onChainUsdc + otherChainUsdc;

  // A Solana buy needs USDC (and a one-time wallet setup) on Solana. When the
  // wallet is short but holds Base USDC, the shortfall moves over as part of
  // the buy — every leg is sponsored, so it costs nothing extra.
  const funding = useSolanaFunding();
  const solanaPlan = useMemo(() => {
    if (asset.chain !== "solana" || !isBuy) return null;
    return planSolanaFunding({
      spendUsdc: payValue,
      solanaUsdc: balanceOf("solana-mainnet", "USDC"),
      solanaSol: balanceOf("solana-mainnet", "SOL"),
      baseUsdc: balanceOf("base-mainnet", "USDC"),
    });
  }, [asset.chain, isBuy, payValue, balanceOf]);
  const baseUsdcBalance = balanceOf("base-mainnet", "USDC");
  const proceeds = useSolanaProceeds();
  const solanaUsdcHolding = portfolio.tokens.find(
    (t) => t.network === "solana-mainnet" && t.symbol.toUpperCase() === "USDC"
  );
  const solanaUsdcBalance = solanaUsdcHolding?.balance ?? 0;

  // The mirror case: a Base asset while the USDC sits on Solana. Sponsored in
  // both directions, so it is only a hop, never a gate.
  const basePlan = useMemo(() => {
    if (asset.chain !== "base" || !isBuy) return null;
    return planBaseFunding({
      spendUsdc: payValue,
      baseUsdc: balanceOf("base-mainnet", "USDC"),
      solanaUsdc: balanceOf("solana-mainnet", "USDC"),
      solanaSol: balanceOf("solana-mainnet", "SOL"),
    });
  }, [asset.chain, isBuy, payValue, balanceOf]);

  const needsFunding = (solanaPlan != null || basePlan != null) && payValue > 0;
  const canFund =
    solanaPlan != null ? planAffordable(solanaPlan, baseUsdcBalance) : basePlan != null;

  // The exact base units to send home, never more than the wallet holds.
  const bridgeHomeRaw = bridgeHomeUnits(basePlan?.bridgeUsdc, solanaUsdcHolding?.rawBalance);

  // Funding cannot go further but the wallet does hold something spendable on
  // the asset's chain — the state a bridge that delivered less than it quoted
  // leaves behind. Offering the landed balance is the way out.
  const alreadyFunded = fundedFor !== null && fundedFor === amount;
  const offerSpendable =
    needsFunding &&
    solanaPlan != null &&
    (!canFund || alreadyFunded) &&
    onChainUsdc > 0 &&
    onChainUsdc < payValue &&
    !funding.busy;

  // Nothing anywhere to buy with: the deposit flow is the only way forward.
  const walletEmpty = isBuy && !portfolio.loading && !portfolio.error && spendableUsd <= 0;

  // Every step of the run, so a stall is attributable to a named leg rather
  // than to a spinner that only said "working". The purchase closes the list.
  const fundingSteps = funding.steps;
  const progressSteps = useMemo<ProgressStep[]>(() => {
    if (fundingSteps.length === 0 && phase !== "confirming") return [];
    const detailFor = (p: (typeof fundingSteps)[number]["phase"]) =>
      p === "quoting"
        ? t("stepQuoting")
        : p === "signing"
          ? t("stepSigning")
          : p === "settling"
            ? t("stepSettling")
            : undefined;
    const legs: ProgressStep[] = fundingSteps.map((s, i) => ({
      id: `${s.kind}-${i}`,
      label:
        s.kind === "gas"
          ? t("stepGas", { amount: formatUsd(s.usdc) })
          : t("stepBridge", { amount: formatUsd(s.usdc) }),
      detail: s.status === "active" ? detailFor(s.phase) : undefined,
      status: s.status,
    }));
    const buying = phase === "confirming";
    return [
      ...legs,
      {
        id: "trade",
        label: isBuy
          ? t("stepBuy", { symbol: asset.symbol })
          : t("sellSymbol", { symbol: asset.symbol }),
        detail: buying ? (signStep?.label ?? t("stepBuilding")) : undefined,
        status: phase === "done" ? "done" : buying ? "active" : "pending",
      },
    ];
  }, [fundingSteps, signStep, phase, asset.symbol, isBuy, t]);

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
    async (value: string) => {
      const num = Number.parseFloat(value);
      const req = buildReq(value);
      if (!(num > 0) || !req) return;
      const seq = ++quoteSeqRef.current;
      setPhase("quoting");
      setNotice(null);
      try {
        const res = await withTransientRetry(() => quoteAsync(req));
        if (seq !== quoteSeqRef.current) return;
        if (!res.best) {
          setQuote(null);
          setPhase("idle");
          setNotice({ kind: "error", message: rwaErrorInfo("NO_ROUTE").message });
          return;
        }
        quotedAtRef.current = Date.now();
        setQuote(res.best);
        setPhase("quoted");
      } catch (e) {
        if (seq !== quoteSeqRef.current) return;
        const info = rwaErrorInfo(errorCode(e), e instanceof Error ? e.message : undefined);
        setQuote(null);
        setPhase("idle");
        setNotice({ kind: "error", message: info.message });
      }
    },
    [quoteAsync, buildReq]
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
    if (!(num > 0) || !quoteSig) return;
    const timer = setTimeout(() => {
      void runQuoteRef.current(amount);
    }, 700);
    return () => clearTimeout(timer);
  }, [amount, quoteSig]);

  const onInput = (value: string) => {
    if (!DECIMAL_INPUT.test(value)) return;
    quoteSeqRef.current++;
    setAmount(value);
    setFundedFor(null);
    const num = Number.parseFloat(value);
    if (num > 0) {
      setPhase("quoting");
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
    funding.reset();
    proceeds.reset();
    setFundedFor(null);
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

  // The trade itself. Split from the confirm handler so funding can run
  // straight into it: the build re-prices server-side, so the staleness gate
  // is about what the USER last saw, and a purchase they already committed to
  // by funding must not stop to ask again.
  useEffect(() => {
    track("market_viewed", { vertical: "real_asset", asset: asset.symbol });
  }, [asset.symbol]);

  const executeTrade = async () => {
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
    try {
      // Real execution needs an executable action. Asking the backend for a
      // simulated build here can produce a non-submittable Solana transaction.
      const action = await withTransientRetry(() => buildAsync({ ...req, taker }));
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
      setPhase("done");
      // Not awaited: the trade is settled and the user should see that now.
      void portfolio.refetchUntilChanged();
    } catch (e) {
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
  };

  // One button does the whole run: move whatever needs moving, then trade.
  // Stopping between the two is how one purchase became two bridges and no
  // trade, so the legs chain without asking again.
  const confirmTrade = async () => {
    if (!quote || overBalance) return;
    if (quoteIsStale(quotedAtRef.current)) {
      void runQuote(amount);
      setNotice({ kind: "info", message: rwaErrorInfo("QUOTE_EXPIRED").message });
      return;
    }
    if (isBuy && solanaPlan && !alreadyFunded) {
      if (!canFund) return;
      setFundedFor(amount);
      const funded = await funding.fund(solanaPlan);
      if (!funded) return;
      // The buy is sized and simulated against the arrived balance, so it
      // cannot run until the balance index reflects it.
      await portfolio.refetchUntilChanged();
      await executeTrade();
      return;
    }
    if (isBuy && basePlan) {
      const ok = await proceeds.bringHome(bridgeHomeRaw);
      if (!ok) return;
      await portfolio.refetchUntilChanged();
      await executeTrade();
      return;
    }
    await executeTrade();
  };

  // After selling a Solana asset the proceeds are USDC on Solana; the rest of
  // the account lives on Base, so they come home on their own — sponsored, no
  // tap needed. The sheet's "settles to USDC on Base" promise is kept here.
  const autoProceedsRef = useRef(false);
  const showProceeds =
    phase === "done" && !isBuy && asset.chain === "solana" && solanaUsdcBalance > 0;
  useEffect(() => {
    if (!showProceeds || autoProceedsRef.current || proceeds.busy || proceeds.phase !== "idle") {
      return;
    }
    autoProceedsRef.current = true;
    void proceeds.bringHome(solanaUsdcHolding?.rawBalance ?? "0");
  }, [showProceeds, proceeds, solanaUsdcHolding?.rawBalance]);

  if (isIssuerAccess(asset)) {
    return <RwaIssuerCard asset={asset} />;
  }

  const usdValue = isBuy ? payValue : payValue * (price ?? 0);
  const recvDecimals = isBuy ? (holding?.decimals ?? null) : USDC_BY_CHAIN[asset.chain].decimals;
  const quoteReceive = quoteReceiveTokens(quote, recvDecimals);
  const receiveEst =
    quoteReceive ??
    (isBuy ? estimateReceiveTokens(usdValue, price) : estimateReceiveUsdc(payValue, price));
  const confirming = phase === "confirming";
  const busy = confirming || funding.busy || proceeds.busy;
  const canConfirm =
    phase === "quoted" &&
    quote != null &&
    !busy &&
    !overBalance &&
    (!isBuy || !needsFunding || (canFund && !alreadyFunded) || basePlan != null);

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
          {showProceeds ? (
            <div className="mt-3.5 rounded-[12px] border border-white/12 bg-white/5 p-3 text-left">
              <div className="text-[12.5px] leading-[1.5] font-medium text-white/80">
                {proceeds.phase === "done"
                  ? t("proceedsDone")
                  : t("proceedsTitle", { amount: formatUsd(solanaUsdcBalance) })}
              </div>
              {proceeds.phase !== "done" ? (
                <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/50">
                  {t("proceedsBody")}
                </p>
              ) : null}
              {proceeds.error ? (
                <>
                  <p className="text-down mt-1.5 text-[11.5px] font-normal">{proceeds.error}</p>
                  <button
                    onClick={() => void proceeds.bringHome(solanaUsdcHolding?.rawBalance ?? "0")}
                    disabled={proceeds.busy}
                    className="text-ink mt-2.5 w-full cursor-pointer rounded-[12px] bg-white p-2.5 font-sans text-[13.5px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("proceedsCta")}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

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
          {funding.error ? (
            <p className="text-down mt-3 text-[12.5px] font-normal">{funding.error}</p>
          ) : null}
          {proceeds.error && isBuy ? (
            <p className="text-down mt-3 text-[12.5px] font-normal">{proceeds.error}</p>
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
          ) : isBuy && needsFunding && solanaPlan && !canFund && !offerSpendable && !busy ? (
            <div className="mt-3.5 rounded-[12px] border border-white/12 bg-white/5 p-3">
              <div className="text-[12.5px] leading-[1.5] font-medium text-white/80">
                {t("fundSolanaShort")}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/50">
                {t("fundSolanaShortBody", { amount: formatUsd(solanaPlan.totalBaseUsdc) })}
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
          ) : offerSpendable ? (
            /* A bridge can deliver less than it quoted. Rather than strand the
               buy behind a top-up the wallet can no longer afford, offer to
               spend exactly what landed. */
            <button
              onClick={() => onInput((Math.floor(onChainUsdc * 1e6) / 1e6).toFixed(6))}
              className="text-ink mt-3.5 w-full cursor-pointer rounded-[12px] bg-white p-2.5 font-sans text-[13.5px] font-semibold hover:opacity-90"
            >
              {t("useLandedBalance", { amount: formatUsd(onChainUsdc) })}
            </button>
          ) : null}

          {progressSteps.length > 0 && busy ? (
            <div className="ws-inset mt-3.5 p-3">
              <RwaProgress steps={progressSteps} />
            </div>
          ) : null}

          {!walletEmpty ? (
            <button
              onClick={() => void confirmTrade()}
              disabled={!canConfirm}
              className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy
                ? signStep
                  ? t("signingStep", { current: signStep.index + 1, total: signStep.total })
                  : funding.busy || proceeds.busy
                    ? t("fundSolanaWorking")
                    : t("buildingOrder")
                : overBalance
                  ? tBuySell("notEnoughBalance")
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
