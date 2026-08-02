"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePrivy } from "@privy-io/react-auth";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ArrowDownIcon } from "@/components/ui/icons";
import { RwaIssuerCard } from "@/components/dashboard/rwa/rwa-issuer-card";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useRwaQuote, useRwaBuild } from "@/hooks/use-rwa-trade";
import { useExecuteRwa } from "@/hooks/use-execute-rwa";
import { tokenLogoKey, useTokenLogos } from "@/hooks/use-token-logos";
import {
  assetPriceUsd,
  rwaLogoUrl,
  USDC_BY_CHAIN,
  type RwaApiAsset,
  type RwaQuote,
  type RwaQuoteRequest,
} from "@/lib/rwa-api";
import { getWalletAddress } from "@/lib/user";
import { useSolanaFunding } from "@/hooks/use-solana-funding";
import { planAffordable, planSolanaFunding } from "@/lib/rwa/funding";
import { toast } from "@/lib/toast";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import {
  buildPayOptions,
  buyQuoteRequest,
  chainLabel,
  errorCode,
  estimateReceiveTokens,
  estimateReceiveUsdc,
  exceedsBalance,
  findRwaHolding,
  gasSymbolForChain,
  gradientFor,
  hasNativeGas,
  isIssuerAccess,
  isSellableChain,
  isTransientRwaError,
  minReceiveTokens,
  pctOfRawBalance,
  priceImpactPercent,
  quoteReceiveTokens,
  requiresNativeGas,
  routeLabel,
  rwaErrorInfo,
  sellQuoteRequest,
} from "@/lib/rwa/presenter";

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

// A quote older than this is not a price to execute against. Confirm refreshes
// it and asks the user to confirm again on the new numbers.
const QUOTE_TTL_MS = 60_000;

// Backoff schedule for transparently retrying a transient read (quote/build).
// These calls never submit a transaction, so a retry is safe and spares the user
// a rate-limit or "service busy" error for a blip that clears in a second.
const RETRY_BACKOFFS_MS = [800, 1600];

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
}

// Buy and sell surface for one RWA. Both directions run a live debounced quote,
// then on confirm build an action, sign every step through Privy, and refresh
// the portfolio. A buy pays with any held token on the asset's chain; a sell
// spends the held RWA (sized at the on-chain decimals its balance carries) for
// USDC. Sell is offered only where we can see the balance, so it is never
// presented for a size or a token we cannot verify.
export function RwaTradePanel({
  asset,
  bare = false,
  initialMode = "buy",
  initialAmount = "",
}: RwaTradePanelProps) {
  const t = useTranslations("rwa");
  // Only for the shared over-balance label; the rwa namespace has no such key.
  const tBuySell = useTranslations("buySell");
  const { user } = usePrivy();
  const portfolio = usePortfolio();
  const { mutateAsync: quoteAsync } = useRwaQuote();
  const { mutateAsync: buildAsync } = useRwaBuild();
  const execute = useExecuteRwa();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [amount, setAmount] = useState(initialAmount);
  const [phase, setPhase] = useState<Phase>("idle");
  const [quote, setQuote] = useState<RwaQuote | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [signStep, setSignStep] = useState<SignStep | null>(null);
  const [payKey, setPayKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const logos = useTokenLogos([{ chain: asset.chain, address: asset.address }]);
  const logo = logos[tokenLogoKey(asset.chain, asset.address)] ?? rwaLogoUrl(asset);

  const isBuy = mode === "buy";
  const price = assetPriceUsd(asset);
  const payValue = Number.parseFloat(amount) || 0;

  // Buy side: tokens the user can pay with on this asset's chain (USDC always
  // available).
  const payOptions = useMemo(
    () => buildPayOptions(portfolio.tokens, asset),
    [portfolio.tokens, asset]
  );
  const payOption = payOptions.find((o) => o.key === payKey) ?? payOptions[0] ?? null;

  // A Solana buy needs USDC (and a little SOL for the fee) on Solana. When the
  // wallet is short but holds Base USDC, the shortfall is bridgeable rather
  // than a dead end — both legs execute on Base, so they cost the user no gas.
  const funding = useSolanaFunding();
  const solanaPlan = useMemo(() => {
    if (asset.chain !== "solana" || !isBuy) return null;
    const balanceOf = (network: string, symbol: string) =>
      portfolio.tokens.find((t) => t.network === network && t.symbol.toUpperCase() === symbol)
        ?.balance ?? 0;
    return planSolanaFunding({
      spendUsdc: payValue,
      solanaUsdc: balanceOf("solana-mainnet", "USDC"),
      solanaSol: balanceOf("solana-mainnet", "SOL"),
      baseUsdc: balanceOf("base-mainnet", "USDC"),
    });
  }, [asset.chain, isBuy, payValue, portfolio.tokens]);
  const baseUsdcBalance =
    portfolio.tokens.find((t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;
  const needsFunding = solanaPlan != null && payValue > 0;
  const canFund = needsFunding && planAffordable(solanaPlan, baseUsdcBalance);
  const payInput = payOption?.input ?? null;
  const payPrice = payOption?.priceUsd ?? 1;

  // Sell side: the held RWA, which carries the exact on-chain decimals we need to
  // size the input. Absent when the chain isn't indexed or the asset isn't held.
  const holding = useMemo(() => findRwaHolding(portfolio.tokens, asset), [portfolio.tokens, asset]);
  const sellable = isSellableChain(asset.chain);
  const sellBlocked = !isBuy && !holding;

  // The token spent and received in the active direction.
  const spendSymbol = isBuy ? (payOption?.symbol ?? "USDC") : asset.symbol;
  const spendLogo = isBuy ? (payOption?.logo ?? undefined) : logo;
  const spendBalance = isBuy ? (payOption?.balance ?? 0) : (holding?.balance ?? 0);
  const recvSymbol = isBuy ? asset.symbol : "USDC";
  const recvLogo = isBuy ? logo : undefined;
  const canPickPay = isBuy && payOptions.length > 1;

  // Exact base-unit balance of the spend side, for sizing percent buttons and
  // the over-balance gate without float loss. A buy whose pay option shows no
  // balance (the injected USDC default) is not gated; we cannot tell "empty"
  // from "unindexed" there.
  const spendRaw = isBuy ? (payOption?.rawBalance ?? null) : (holding?.rawBalance ?? null);
  const spendDecimals = isBuy ? (payOption?.input.decimals ?? null) : (holding?.decimals ?? null);
  const overBalance =
    payValue > 0 &&
    spendBalance > 0 &&
    spendRaw != null &&
    spendDecimals != null &&
    exceedsBalance(amount, spendRaw, spendDecimals);

  // The quote/build request for the active direction, or null when the side is
  // not ready to quote (no pay token, or nothing held to sell).
  const buildReq = useCallback(
    (value: string): RwaQuoteRequest | null => {
      if (isBuy) {
        return payInput ? buyQuoteRequest(asset, value, SLIPPAGE_BPS, payInput) : null;
      }
      return holding ? sellQuoteRequest(asset, value, SLIPPAGE_BPS, holding.decimals) : null;
    },
    [isBuy, payInput, holding, asset]
  );

  // Monotonic id for quote requests. A response only lands if it is still the
  // newest request; editing the amount also bumps it, so a slow response for a
  // superseded amount is discarded instead of overwriting the live quote.
  const quoteSeqRef = useRef(0);
  // When the live quote landed, for the pre-execute staleness check. A ref
  // because it is written inside the async handler and never rendered.
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

  // A stable identity for the current quote request: the direction and the exact
  // token being traded (address + decimals). The portfolio refetches every 30s
  // and on window focus, handing back new `holding`/`payInput` object references
  // with identical values; keying the debounce on this string instead of on the
  // callback identity stops those refetches from firing a redundant quote and
  // needlessly spending the shared RWA rate budget.
  const quoteSig = isBuy
    ? payInput
      ? `buy:${payInput.address}:${payInput.decimals}`
      : null
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
    // Any in-flight quote priced the amount being replaced; drop its response.
    quoteSeqRef.current++;
    setAmount(value);
    const num = Number.parseFloat(value);
    if (num > 0) {
      setPhase("quoting");
    } else {
      setPhase("idle");
      setQuote(null);
      setNotice(null);
    }
  };

  const switchMode = (next: Mode) => {
    quoteSeqRef.current++;
    setMode(next);
    setAmount("");
    setPhase("idle");
    setQuote(null);
    setNotice(null);
    setSignStep(null);
    setPickerOpen(false);
  };

  const reset = () => {
    quoteSeqRef.current++;
    setAmount("");
    setPhase("idle");
    setQuote(null);
    setNotice(null);
    setSignStep(null);
  };

  const setPct = (pct: number) => {
    if (spendBalance <= 0) return;
    // Size from the exact base-unit balance so a Max sell stages exactly what
    // the wallet holds. The fallback clamps to a fixed-decimal string; a raw
    // float String() can emit exponent notation the input regex rejects.
    const exact =
      spendRaw != null && spendDecimals != null
        ? pctOfRawBalance(spendRaw, spendDecimals, Math.round(pct * 100))
        : null;
    onInput(exact ?? (spendBalance * pct).toFixed(6));
  };

  const selectPay = (key: string) => {
    setPayKey(key);
    setPickerOpen(false);
    reset();
  };

  const confirmTrade = async () => {
    if (!quote || overBalance) return;
    const req = buildReq(amount);
    if (!req) return;

    // Never execute against stale numbers. Refresh the quote and require a
    // second confirm; the notice is set after runQuote's synchronous start so
    // its setNotice(null) does not wipe it.
    if (Date.now() - quotedAtRef.current > QUOTE_TTL_MS) {
      void runQuote(amount);
      setNotice({ kind: "info", message: rwaErrorInfo("QUOTE_EXPIRED").message });
      return;
    }

    // Base trades are gas-sponsored, so the native-gas check only applies to
    // the chains where the wallet really pays its own fee.
    const gas = hasNativeGas(portfolio.tokens, asset.chain);
    const gasKnown = !portfolio.loading && !portfolio.error;
    if (requiresNativeGas(asset.chain) && gasKnown && gas === false) {
      setNotice({
        kind: "gas",
        message: t("gasNeeded", { symbol: gasSymbolForChain(asset.chain) }),
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
    // One processing toast that resolves in place. Signing is headless on Base
    // (gasless), so this plus the panel's confirming state is the feedback.
    const toastId = toast.loading(
      isBuy
        ? t("buyingSymbol", { symbol: asset.symbol })
        : t("sellingSymbol", { symbol: asset.symbol })
    );
    try {
      const action = await withTransientRetry(() => buildAsync({ ...req, taker, simulate: true }));
      await execute(action, asset.chain, (index, step) => {
        setSignStep({ index, total: action.steps.length, label: step.description });
      });
      toast.success(
        isBuy
          ? t("boughtSymbol", { symbol: asset.symbol })
          : t("soldSymbol", { symbol: asset.symbol }),
        { id: toastId }
      );
      await portfolio.refetch();
      setSignStep(null);
      setPhase("done");
    } catch (e) {
      const info = rwaErrorInfo(errorCode(e), e instanceof Error ? e.message : undefined);
      setSignStep(null);
      setNotice({ kind: "error", message: info.message });
      toast.error(info.message, { id: toastId });
      setPhase("quoted");
      if (info.requote) void runQuote(amount);
    }
  };

  if (isIssuerAccess(asset)) {
    return <RwaIssuerCard asset={asset} />;
  }

  const usdValue = payValue * (isBuy ? payPrice : (price ?? 0));
  // Once a quote exists, show its actual output rather than registry price
  // math. Output decimals are known for a sell (USDC) and for a buy of an asset
  // already held; otherwise fall back to the price-derived preview.
  const recvDecimals = isBuy ? (holding?.decimals ?? null) : USDC_BY_CHAIN[asset.chain].decimals;
  const quoteReceive = quoteReceiveTokens(quote, recvDecimals);
  const receiveEst =
    quoteReceive ??
    (isBuy ? estimateReceiveTokens(usdValue, price) : estimateReceiveUsdc(payValue, price));
  const minReceive = minReceiveTokens(receiveEst, quote);
  const impact = priceImpactPercent(quote?.priceImpactBps ?? null);
  const confirming = phase === "confirming";
  const canConfirm = phase === "quoted" && quote != null && !confirming && !overBalance;

  const sellBlockedMessage = !sellable
    ? t("sellChains")
    : portfolio.loading
      ? t("checkingBalance")
      : t("noHoldingsToSell", { symbol: asset.symbol });

  return (
    <div
      className={
        bare
          ? ""
          : "ws-card p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.85)] sm:p-[22px]"
      }
    >
      <div className="mb-1 flex items-center gap-2.5">
        <AssetIcon sym={asset.symbol} bg={gradientFor(asset.symbol)} logo={logo} size={30} />
        <div className="min-w-0">
          <div className="truncate font-sans text-[14px] font-semibold">{asset.name}</div>
          <div className="truncate text-[11.5px] font-normal text-white/50">
            {asset.symbol} · {asset.issuer}
          </div>
        </div>
      </div>

      <div className="ws-inset mt-3.5 mb-4 grid grid-cols-2 gap-1.5 rounded-[14px] p-[5px]">
        {(["buy", "sell"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`cursor-pointer rounded-[10px] p-2.5 font-sans text-sm font-semibold transition-colors ${
              mode === m
                ? "bg-accent/18 shadow-[inset_0_0_0_1px_rgba(255, 255, 255, 0.35)] text-white"
                : "bg-transparent text-white/55 hover:text-white"
            }`}
          >
            {m === "buy" ? t("buy") : t("sell")}
          </button>
        ))}
      </div>

      {sellBlocked ? (
        <div className="ws-inset p-[18px] text-center">
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
        <div className="ws-inset p-[18px] text-center">
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
          <div className="ws-inset relative p-[15px]">
            <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
              <span>{t("youPay")}</span>
              {spendBalance > 0 ? (
                <button
                  onClick={() => setPct(1)}
                  className="tnum cursor-pointer text-white/55 hover:text-white"
                >
                  {t("balanceOf", { amount: formatAmount(spendBalance), symbol: spendSymbol })}
                </button>
              ) : (
                <span>≈ {usdValue > 0 ? formatUsd(usdValue) : "$0"}</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <input
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => onInput(e.target.value)}
                className="ws-display tnum w-full min-w-0 bg-transparent text-[30px] text-white outline-none placeholder:text-white/30"
              />
              <button
                onClick={() => canPickPay && setPickerOpen((v) => !v)}
                disabled={!canPickPay}
                className="inline-flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full border border-white/12 bg-white/7 px-[11px] py-[7px] hover:bg-white/12 disabled:cursor-default"
              >
                <AssetIcon
                  sym={spendSymbol}
                  bg={gradientFor(spendSymbol)}
                  size={22}
                  logo={spendLogo}
                />
                <span className="font-sans text-[13.5px] font-medium">{spendSymbol}</span>
                {canPickPay ? <ArrowDownIcon size={12} className="text-white/50" /> : null}
              </button>
            </div>
            {pickerOpen && isBuy ? (
              <div className="bg-panel absolute top-[58px] right-[15px] z-10 max-h-[224px] w-[210px] overflow-auto rounded-[14px] border border-white/12 p-1.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]">
                {payOptions.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => selectPay(o.key)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-white/6 ${
                      o.key === payOption?.key ? "bg-white/6" : ""
                    }`}
                  >
                    <AssetIcon
                      sym={o.symbol}
                      bg={gradientFor(o.symbol)}
                      size={22}
                      logo={o.logo ?? undefined}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-sans text-[13px] font-medium">
                        {o.symbol}
                      </span>
                      <span className="tnum block text-[11px] text-white/45">
                        {formatAmount(o.balance)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex gap-1.5">
              {[0.25, 0.5, 1].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setPct(pct)}
                  disabled={spendBalance <= 0}
                  className="flex-1 cursor-pointer rounded-lg border border-white/10 bg-white/4 py-1.5 font-sans text-[12px] font-medium text-white/70 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pct === 1 ? t("max") : `${pct * 100}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="-my-2 flex justify-center">
            <span className="bg-panel text-accent z-[1] grid h-8 w-8 place-items-center rounded-[9px] border border-white/14">
              <ArrowDownIcon size={15} />
            </span>
          </div>

          <div className="ws-inset p-[15px]">
            <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
              <span>{t("youReceiveEst")}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="ws-display tnum text-accent min-w-0 truncate text-[30px]">
                {receiveEst != null ? formatAmount(receiveEst) : "—"}
              </span>
              <span className="inline-flex shrink-0 items-center gap-[7px] rounded-full border border-white/12 bg-white/7 px-[11px] py-[7px]">
                <AssetIcon
                  sym={recvSymbol}
                  bg={gradientFor(recvSymbol)}
                  size={22}
                  logo={recvLogo}
                />
                <span className="font-sans text-[13.5px] font-medium">{recvSymbol}</span>
              </span>
            </div>
          </div>

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

          {needsFunding ? (
            <div className="mt-3.5 rounded-[12px] border border-white/12 bg-white/5 p-3">
              <div className="text-[12.5px] leading-[1.5] font-medium text-white/80">
                {t("fundSolanaTitle", {
                  amount: formatUsd(solanaPlan.totalBaseUsdc),
                })}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.5] font-normal text-white/50">
                {solanaPlan.topUpGas ? t("fundSolanaWithGas") : t("fundSolanaBody")}
              </p>
              {funding.error ? (
                <p className="text-down mt-1.5 text-[11.5px] font-normal">{funding.error}</p>
              ) : null}
              <button
                onClick={() => void funding.fund(solanaPlan)}
                disabled={!canFund || funding.busy}
                className={`mt-2.5 w-full rounded-[12px] p-2.5 font-sans text-[13.5px] font-semibold ${
                  canFund && !funding.busy
                    ? "text-ink cursor-pointer bg-white hover:opacity-90"
                    : "cursor-not-allowed bg-white/10 text-white/40"
                }`}
              >
                {funding.busy
                  ? t("fundSolanaWorking")
                  : canFund
                    ? t("fundSolanaCta")
                    : t("fundSolanaShort")}
              </button>
            </div>
          ) : null}

          <button
            onClick={() => void confirmTrade()}
            disabled={!canConfirm || needsFunding}
            className={`mt-4 w-full rounded-[14px] p-[15px] font-sans text-[15px] font-semibold whitespace-nowrap transition-opacity ${
              canConfirm
                ? "text-ink cursor-pointer bg-white hover:opacity-90"
                : "cursor-not-allowed bg-white/10 text-white/40"
            }`}
          >
            {confirming
              ? signStep
                ? t("signingStep", { current: signStep.index + 1, total: signStep.total })
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

          {confirming && signStep ? (
            <p className="mt-2 text-center text-[12px] font-normal text-white/55">
              {signStep.label}
            </p>
          ) : null}

          <div className="mt-[15px] flex flex-col gap-[9px] text-[12.5px] font-normal text-white/60">
            <div className="flex justify-between">
              <span>{t("route")}</span>
              <span className="text-white/85">{quote ? routeLabel(quote) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>{t("priceImpact")}</span>
              <span className="text-white/85">
                {impact != null ? `${impact.toFixed(2)}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("minReceived")}</span>
              <span className="text-white/85">
                {minReceive != null ? `${formatAmount(minReceive)} ${recvSymbol}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t("maxSlippage")}</span>
              <span className="text-white/85">{(SLIPPAGE_BPS / 100).toFixed(2)}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
