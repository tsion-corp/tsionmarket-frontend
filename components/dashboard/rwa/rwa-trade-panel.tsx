"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  type RwaApiAsset,
  type RwaQuote,
  type RwaQuoteRequest,
} from "@/lib/rwa-api";
import { getWalletAddress } from "@/lib/user";
import { toast } from "@/lib/toast";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import {
  buildPayOptions,
  buyQuoteRequest,
  chainLabel,
  errorCode,
  estimateReceiveTokens,
  estimateReceiveUsdc,
  findRwaHolding,
  gasSymbolForChain,
  gradientFor,
  hasNativeGas,
  isIssuerAccess,
  isSellableChain,
  minReceiveTokens,
  priceImpactPercent,
  routeLabel,
  rwaErrorInfo,
  sellQuoteRequest,
} from "@/lib/rwa/presenter";

type Mode = "buy" | "sell";
type Phase = "idle" | "quoting" | "quoted" | "confirming" | "done";

interface Notice {
  kind: "error" | "gas";
  message: string;
}

interface SignStep {
  index: number;
  total: number;
  label: string;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const SLIPPAGE_BPS = 50;

interface RwaTradePanelProps {
  asset: RwaApiAsset;
}

// Buy and sell surface for one RWA. Both directions run a live debounced quote,
// then on confirm build an action, sign every step through Privy, and refresh
// the portfolio. A buy pays with any held token on the asset's chain; a sell
// spends the held RWA (sized at the on-chain decimals its balance carries) for
// USDC. Sell is offered only where we can see the balance, so it is never
// presented for a size or a token we cannot verify.
export function RwaTradePanel({ asset }: RwaTradePanelProps) {
  const { user } = usePrivy();
  const portfolio = usePortfolio();
  const { mutateAsync: quoteAsync } = useRwaQuote();
  const { mutateAsync: buildAsync } = useRwaBuild();
  const execute = useExecuteRwa();

  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");
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

  const runQuote = useCallback(
    async (value: string) => {
      const num = Number.parseFloat(value);
      const req = buildReq(value);
      if (!(num > 0) || !req) return;
      setPhase("quoting");
      setNotice(null);
      try {
        const res = await quoteAsync(req);
        if (!res.best) {
          setQuote(null);
          setPhase("idle");
          setNotice({ kind: "error", message: rwaErrorInfo("NO_ROUTE").message });
          return;
        }
        setQuote(res.best);
        setPhase("quoted");
      } catch (e) {
        const info = rwaErrorInfo(errorCode(e), e instanceof Error ? e.message : undefined);
        setQuote(null);
        setPhase("idle");
        setNotice({ kind: "error", message: info.message });
      }
    },
    [quoteAsync, buildReq]
  );

  // Debounce the live quote. All state changes happen inside runQuote or event
  // handlers, so this effect only schedules the fetch.
  useEffect(() => {
    const num = Number.parseFloat(amount);
    if (!(num > 0)) return;
    const timer = setTimeout(() => {
      void runQuote(amount);
    }, 700);
    return () => clearTimeout(timer);
  }, [amount, runQuote]);

  const onInput = (value: string) => {
    if (!DECIMAL_INPUT.test(value)) return;
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
    setMode(next);
    setAmount("");
    setPhase("idle");
    setQuote(null);
    setNotice(null);
    setSignStep(null);
    setPickerOpen(false);
  };

  const reset = () => {
    setAmount("");
    setPhase("idle");
    setQuote(null);
    setNotice(null);
    setSignStep(null);
  };

  const setPct = (pct: number) => {
    if (spendBalance <= 0) return;
    onInput(String(spendBalance * pct));
  };

  const selectPay = (key: string) => {
    setPayKey(key);
    setPickerOpen(false);
    reset();
  };

  const confirmTrade = async () => {
    if (!quote) return;
    const req = buildReq(amount);
    if (!req) return;

    const gas = hasNativeGas(portfolio.tokens, asset.chain);
    const gasKnown = !portfolio.loading && !portfolio.error;
    if (gasKnown && gas === false) {
      setNotice({
        kind: "gas",
        message: `You need a little ${gasSymbolForChain(asset.chain)} for the network fee`,
      });
      return;
    }

    const taker = getWalletAddress(user, asset.chain === "solana" ? "solana" : "ethereum");
    if (!taker) {
      setNotice({ kind: "error", message: "Connect your wallet to trade" });
      return;
    }

    setPhase("confirming");
    setNotice(null);
    setSignStep(null);
    try {
      const action = await buildAsync({ ...req, taker, simulate: true });
      await execute(action, (index, step) => {
        setSignStep({ index, total: action.steps.length, label: step.description });
      });
      toast.success(`${isBuy ? "Bought" : "Sold"} ${asset.symbol}`);
      await portfolio.refetch();
      setSignStep(null);
      setPhase("done");
    } catch (e) {
      const info = rwaErrorInfo(errorCode(e), e instanceof Error ? e.message : undefined);
      setSignStep(null);
      setNotice({ kind: "error", message: info.message });
      setPhase("quoted");
      if (info.requote) void runQuote(amount);
    }
  };

  if (isIssuerAccess(asset)) {
    return <RwaIssuerCard asset={asset} />;
  }

  const usdValue = payValue * (isBuy ? payPrice : (price ?? 0));
  const receiveEst = isBuy
    ? estimateReceiveTokens(usdValue, price)
    : estimateReceiveUsdc(payValue, price);
  const minReceive = minReceiveTokens(receiveEst, quote);
  const impact = priceImpactPercent(quote?.priceImpactBps ?? null);
  const confirming = phase === "confirming";
  const canConfirm = phase === "quoted" && quote != null && !confirming;

  const sellBlockedMessage = !sellable
    ? "Selling is available on Base, Arbitrum, Polygon and Solana."
    : portfolio.loading
      ? "Checking your balance…"
      : `You don't hold any ${asset.symbol} to sell.`;

  return (
    <div className="ws-card p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.85)] sm:p-[22px]">
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
            className={`cursor-pointer rounded-[10px] p-2.5 font-sans text-sm font-semibold capitalize transition-colors ${
              mode === m
                ? "bg-accent/18 text-white shadow-[inset_0_0_0_1px_rgba(167,139,250,0.35)]"
                : "bg-transparent text-white/55 hover:text-white"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {sellBlocked ? (
        <div className="ws-inset p-[18px] text-center">
          <div className="font-sans text-[14px] font-semibold text-white/85">
            {sellable
              ? `No ${asset.symbol} to sell`
              : `Selling ${asset.symbol} on ${chainLabel(asset.chain)}`}
          </div>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] font-normal text-white/55">
            {sellBlockedMessage}
          </p>
        </div>
      ) : phase === "done" ? (
        <div className="ws-inset p-[18px] text-center">
          <div className="text-up font-sans text-[15px] font-semibold">Order filled</div>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12.5px] font-normal text-white/55">
            {isBuy
              ? `Your ${asset.name} buy settled and is landing in your portfolio.`
              : `Your ${asset.name} sale settled and the USDC is landing in your portfolio.`}
          </p>
          <button
            onClick={reset}
            className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-[13px] font-sans text-[14px] font-semibold hover:opacity-90"
          >
            {isBuy ? "Buy more" : "Sell more"}
          </button>
        </div>
      ) : (
        <>
          <div className="ws-inset relative p-[15px]">
            <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
              <span>You pay</span>
              {spendBalance > 0 ? (
                <button
                  onClick={() => setPct(1)}
                  className="tnum cursor-pointer text-white/55 hover:text-white"
                >
                  Balance {formatAmount(spendBalance)} {spendSymbol}
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
                className="ws-serif tnum w-full min-w-0 bg-transparent text-[30px] text-white outline-none placeholder:text-white/30"
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
                  {pct === 1 ? "Max" : `${pct * 100}%`}
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
              <span>You receive (est.)</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="ws-serif tnum text-accent min-w-0 truncate text-[30px]">
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
                notice.kind === "gas"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                  : "border-down/30 bg-down/10 text-down"
              }`}
            >
              {notice.message}
            </div>
          ) : null}

          <button
            onClick={() => void confirmTrade()}
            disabled={!canConfirm}
            className={`mt-4 w-full rounded-[14px] p-[15px] font-sans text-[15px] font-semibold whitespace-nowrap transition-opacity ${
              canConfirm
                ? "text-ink cursor-pointer bg-white hover:opacity-90"
                : "cursor-not-allowed bg-white/10 text-white/40"
            }`}
          >
            {confirming
              ? signStep
                ? `Signing step ${signStep.index + 1} of ${signStep.total}…`
                : "Building your order…"
              : phase === "quoting"
                ? "Fetching best price…"
                : quote
                  ? `${isBuy ? "Buy" : "Sell"} ${asset.symbol}`
                  : "Enter an amount"}
          </button>

          {confirming && signStep ? (
            <p className="mt-2 text-center text-[12px] font-normal text-white/55">
              {signStep.label}
            </p>
          ) : null}

          <div className="mt-[15px] flex flex-col gap-[9px] text-[12.5px] font-normal text-white/60">
            <div className="flex justify-between">
              <span>Route</span>
              <span className="text-white/85">{quote ? routeLabel(quote) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>Price impact</span>
              <span className="text-white/85">
                {impact != null ? `${impact.toFixed(2)}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Min received</span>
              <span className="text-white/85">
                {minReceive != null ? `${formatAmount(minReceive)} ${recvSymbol}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Max slippage</span>
              <span className="text-white/85">{(SLIPPAGE_BPS / 100).toFixed(2)}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
