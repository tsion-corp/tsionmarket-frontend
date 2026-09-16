"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Disclosure } from "@/components/ui/disclosure";
import { ChartBarsIcon, TrendIcon } from "@/components/ui/icons";
import { parseBaseUnits } from "@/features/trade/components/meme-base-units";
import { MemeCoin, PctChange, priceLabel } from "@/features/trade/components/meme-bits";
import { BoardChart } from "@/features/trade/components/meme-board-chart";
import { BoardDisclosure, Caret } from "@/features/trade/components/meme-board-disclosure";
import { MemeGrid } from "@/features/trade/components/meme-grid";
import { LiveTransactions } from "@/features/trade/components/meme-live-transactions";
import {
  MemeMarketMetrics,
  type MemeMarketMetricsData,
  type MemeMetricValue,
} from "@/features/trade/components/meme-market-metrics";
import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";
import { MemeRiskConsent } from "@/features/trade/components/meme-risk-consent";
import { TradeTicket, USD_DECIMALS } from "@/features/trade/components/meme-trade-ticket";
import { useRiskConsent } from "@/features/trade/hooks/use-risk-consent";
import { MemeTrending } from "@/features/trade/components/meme-trending";
import { MemeUnavailable } from "@/features/trade/components/meme-unavailable";
import { useMemeSwaps } from "@/features/trade/hooks/use-meme-swaps";
import { useMemeCatalog } from "@/features/trade/hooks/use-meme-tokens";
import {
  memeOutcomeToast,
  useMemePreview,
  useMemeTrade,
  type MemeTradeInput,
} from "@/features/trade/hooks/use-meme-trade";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePortfolio } from "@/hooks/use-portfolio";
import { displaySymbol } from "@/lib/buy";
import { friendlyError } from "@/lib/errors";
import { compactUsd, isValidTradeAmount, type MemeToken } from "@/lib/meme/api";
import { SOLANA_CHAIN_ID, networkOf } from "@/lib/meme/chain";
import { buyFunding } from "@/lib/meme/funding";
import { exceedsHeld } from "@/lib/meme/sell-amount";
import { toast } from "@/lib/toast";
import { scopeOf } from "@/lib/portfolio/fresh-scope";
import { belowMinimumBuy } from "@/lib/trade/minimums";

// The memecoin screen on a phone (Figma 121:6811, and its two other states,
// 122:7205 with the metrics open and 122:7351 on the sell side): the coin being
// traded at the top, the chart and the metrics behind disclosures, the ticket,
// and the transactions feed under it.
//
// One surface in three orthogonal states, not three screens: which side is
// selected, whether the chart is disclosed, whether the metrics are. So the
// board is one component holding those three pieces of state, the way the
// desktop route holds them for MemeDesktopBoard.
//
// The catalogue is still reachable: the pair control at the top opens it, and
// the trending shelf and the grid mount only while it is open, so a closed
// picker costs no request and runs no poll.
//
// What is left here is state and composition. The pieces the screen stacks
// live next door and are wired in below: BoardChart, TradeTicket,
// LiveTransactions, and the swap history behind useMemeSwaps.

// Long enough that typing an amount does not spend a quote per keystroke, short
// enough that the ticket settles while you look at it. The quote endpoint is
// rate limited at 20/min.
const PREVIEW_DEBOUNCE_MS = 600;

// compactUsd renders an em dash only for a figure it cannot read (a published
// zero is "$0"), and a dash in the metrics panel reads as a figure rather than
// as a missing one. So the absent case is decided here and the panel gets the
// null it draws as an explicit "Unavailable".
function usdMetric(value: string | null): MemeMetricValue {
  if (value === null) return { display: null };
  const shown = compactUsd(value);
  return { display: shown === "—" ? null : shown };
}

export function MemeBoard() {
  const t = useTranslations("meme");
  const tErr = useTranslations("tradeErrors");

  const [picked, setPicked] = useState<MemeToken | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  // The ticket opens on the chart, as on the desk: the price is in view first.
  const [chartOpen, setChartOpen] = useState(true);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  // A Solana order is finished in the sheet; see runTrade below.
  const [sheetToken, setSheetToken] = useState<MemeToken | null>(null);

  const chartPanelId = `meme-chart-${useId()}`;
  const metricsPanelId = `meme-metrics-${useId()}`;
  const pickerPanelId = `meme-picker-${useId()}`;

  // The first page of the curated catalogue, which picks the coin on screen
  // until one is chosen. Same query key as MemeGrid's pages, so opening the
  // picker reuses this entry rather than asking again.
  const catalog = useMemeCatalog();
  const portfolio = usePortfolio();
  const { walletFor, phase, error, trade } = useMemeTrade();

  // The picked coin keeps its place while the catalogue refreshes, but takes
  // the fresher row whenever the catalogue still carries it.
  const rows = catalog.tokens;
  const selected = picked
    ? (rows.find((row) => row.address === picked.address && row.chainId === picked.chainId) ??
      picked)
    : (rows[0] ?? null);

  const buying = side === "BUY";
  const wallet = selected ? walletFor(selected.chainId) : null;
  const debouncedAmount = useDebouncedValue(amount, PREVIEW_DEBOUNCE_MS);

  // The user has one USD balance, their Base USDC. A coin on Solana is paid for
  // by moving that USDC across first, so on Solana both sides count as
  // spendable. Which chain any of it sits on is never shown.
  const usdcOn = (network: string) =>
    portfolio.tokens.find((p) => p.network === network && p.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;
  const funding = buyFunding({
    chainId: selected?.chainId ?? 0,
    payUsd: isValidTradeAmount(debouncedAmount, USD_DECIMALS) ? Number(debouncedAmount) : 0,
    baseUsdc: usdcOn("base-mainnet"),
    solanaUsdc: usdcOn("solana-mainnet"),
  });

  // The wallet's holding of the selected coin, in exact base units. A float
  // here would lose real digits: a memecoin balance routinely runs past 2^53
  // base units.
  const network = selected ? networkOf(selected.chainId) : null;
  const onSolana = selected?.chainId === SOLANA_CHAIN_ID;
  const held =
    selected && network
      ? portfolio.tokens.find(
          (p) =>
            p.network === network &&
            (onSolana
              ? p.address === selected.address
              : p.address?.toLowerCase() === selected.address.toLowerCase())
        )
      : undefined;
  const heldRaw = held?.rawBalance ?? "0";
  const heldDecimals = held?.decimals ?? selected?.decimals ?? 18;

  const maxDecimals = buying ? USD_DECIMALS : heldDecimals;
  const amountValid = isValidTradeAmount(debouncedAmount, maxDecimals);
  const sideEnabled = selected ? (buying ? selected.buyEnabled : selected.sellEnabled) : false;
  // A holding the portfolio reports in a form we cannot read covers nothing, so
  // every sell amount is over it. exceedsHeld parses the string as an integer
  // and would throw on anything else, and a quote is not worth asking for
  // against a balance nobody can verify.
  const overBalance =
    amountValid &&
    (buying
      ? Number(debouncedAmount) > funding.spendableUsd + 1e-9
      : parseBaseUnits(heldRaw) === null || exceedsHeld(debouncedAmount, heldRaw, heldDecimals));
  const belowMin = buying && belowMinimumBuy(Number(debouncedAmount || "0"), Boolean(onSolana));

  // The quote is only worth asking for once the order could actually be placed.
  // A Solana buy short of its USDC is the one case the service refuses outright.
  const previewInput =
    selected &&
    wallet &&
    amountValid &&
    sideEnabled &&
    !overBalance &&
    !belowMin &&
    !(buying && funding.needsFunding)
      ? {
          side,
          tokenAddress: selected.address,
          amount: debouncedAmount,
          walletAddress: wallet,
          chainId: selected.chainId,
        }
      : null;
  // A LOW_LIQUIDITY coin is confirmed before any preview goes out: the dialog
  // opens the first time an amount is typed for it, and Cancel clears it.
  const consent = useRiskConsent(selected, amount);
  const preview = useMemePreview(previewInput, consent.consented);

  // The transactions feed. The hook holds the request and the poll; the card
  // filters the page down to the coin on screen.
  const swaps = useMemeSwaps();

  function selectToken(token: MemeToken) {
    setPicked(token);
    setPickerOpen(false);
    // The amount means a different thing on each coin and on each side, so it
    // never carries over.
    setAmount("");
  }

  function changeSide(next: "BUY" | "SELL") {
    setSide(next);
    setAmount("");
  }

  // Base executes here. A Solana order does not: buying one may need the USDC
  // moved to the Solana wallet first, and selling one has to record what the
  // sale should deliver so the settlement tracker can route the proceeds back
  // to the USD balance. Both of those live in MemeTradeSheet, so a Solana order
  // is handed there rather than run here with half the plumbing.
  async function runTrade(input: MemeTradeInput) {
    // No quote for a LOW_LIQUIDITY coin the user has not confirmed.
    if (!selected || !consent.consented) return;
    if (input.chainId === SOLANA_CHAIN_ID) {
      setSheetToken(selected);
      return;
    }
    const symbol = displaySymbol(selected.symbol ?? "");
    // The fresh read after the trade is scoped to the networks it touched:
    // the traded chain, and Base, where a buy is funded from.
    const tradedNetworks = scopeOf("base-mainnet", networkOf(input.chainId));
    const toastId = toast.loading(
      input.side === "BUY" ? t("buyingToast", { symbol }) : t("sellingToast", { symbol })
    );
    try {
      const result = await trade(input);
      toast.success(memeOutcomeToast(t, result, input.side, symbol), { id: toastId });
      setAmount("");
      void portfolio.refetchUntilChanged(tradedNetworks);
      swaps.refetch();
    } catch (e) {
      // The trade hook keeps the failure for the ticket's inline error; the
      // toast is for the case where the user has already looked away.
      toast.error(friendlyError(e, t("orderFailed"), tErr), { id: toastId });
      void portfolio.refetchFresh(tradedNetworks);
    }
  }

  const metrics: MemeMarketMetricsData | null = selected
    ? {
        marketCap: usdMetric(selected.marketCapUsd),
        volume24h: usdMetric(selected.volume24hUsd),
        liquidity: usdMetric(selected.liquidityUsd),
        // The service publishes neither a listing date nor a buy/sell trader
        // split. Both tiles stay, and say Unavailable: a zero age or an empty
        // split would read as a fact about the coin.
        ageDays: null,
        traders: null,
      }
    : null;

  return (
    <div
      data-region="meme-mobile-board"
      className="mx-auto flex w-full max-w-[430px] flex-col gap-3 px-5 pt-3 pb-6"
    >
      {selected ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setPickerOpen((was) => !was)}
                aria-expanded={pickerOpen}
                aria-controls={pickerPanelId}
                className="flex h-11 shrink-0 cursor-pointer items-center"
              >
                <span className="border-hairline bg-surface flex h-[36px] items-center gap-[5px] rounded-[15px] border-[1.5px] px-[10px]">
                  <MemeCoin token={selected} size={17} />
                  <span className="text-grey-100 font-serif text-[13px] font-semibold tracking-[-0.39px]">
                    {`${displaySymbol(selected.symbol ?? "") || "?"}/USDC`}
                  </span>
                  <Caret open={pickerOpen} />
                </span>
              </button>
              <span className="font-serif text-[13.5px] font-semibold tracking-[-0.405px]">
                <PctChange value={selected.priceChange24hPercent} />
              </span>
            </div>
            <span className="tnum shrink-0 font-serif text-[18px] font-extrabold text-white">
              {priceLabel(selected.priceUsd)}
            </span>
          </div>

          {pickerOpen ? (
            // The catalogue, mounted only while it is being used: the trending
            // shelf polls and the grid holds the whole list, and neither should
            // run behind a screen that is trading one coin.
            <div id={pickerPanelId} className="flex flex-col gap-6">
              <MemeTrending onOpen={selectToken} />
              <MemeGrid onOpen={selectToken} />
            </div>
          ) : (
            <>
              {/* Row and panel in one gapless box, so the screen's 12px rhythm
                  reaches the row rather than the panel: the panel stays mounted
                  while it is shut so it can fold, and a gap on the column would
                  hold 12px of empty screen under a closed row. The 12px rides
                  on the panel's content instead, and folds with it. */}
              <div className="flex flex-col">
                <BoardDisclosure
                  icon={<TrendIcon size={11} />}
                  label={chartOpen ? t("mobileCloseChart") : t("mobileViewChart")}
                  open={chartOpen}
                  onToggle={() => setChartOpen((was) => !was)}
                  controls={chartPanelId}
                />
                {/* The chart is gated inside the panel, not wrapped by it: it
                    resolves a CoinGecko id and pulls the chart bundle, so a
                    closed disclosure must not be holding one open. The box
                    still animates. The 12px lead rides on the gated wrapper,
                    where the clip cuts it away; on the Disclosure's className
                    it would sit on the grid item and hold the shut panel
                    12px tall. */}
                <Disclosure open={chartOpen} id={chartPanelId}>
                  {chartOpen ? (
                    <div className="pt-3">
                      <BoardChart token={selected} />
                    </div>
                  ) : null}
                </Disclosure>
              </div>

              <div
                role="group"
                aria-label={t("tradeAction")}
                className="bg-grey-800 flex gap-2 rounded-full p-2"
              >
                {(["BUY", "SELL"] as const).map((option) => {
                  const on = side === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => changeSide(option)}
                      aria-pressed={on}
                      // Fill against outline, not one colour against another:
                      // the selected half is solid and the resting half is a
                      // bordered transparent pill, so the state reads without
                      // colour.
                      className={`flex h-12 flex-1 cursor-pointer items-center justify-center rounded-3xl font-[family-name:var(--font-sportsbook)] text-base font-semibold transition-colors ${
                        on
                          ? `${option === "BUY" ? "bg-buy" : "bg-sell"} text-white`
                          : "border border-white/8 bg-[rgba(54,54,54,0.16)] text-[#e9fff7]"
                      }`}
                    >
                      {option === "BUY" ? t("buy") : t("sell")}
                    </button>
                  );
                })}
              </div>

              {/* Same gapless pairing as the chart row above, and for the same
                  reason: the metrics panel keeps its place in the column while
                  it is shut so it can fold, and it carries its own 12px lead
                  on its content. */}
              <div className="flex flex-col">
                <BoardDisclosure
                  icon={<ChartBarsIcon size={13} />}
                  label={metricsOpen ? t("metricsHide") : t("metricsShow")}
                  open={metricsOpen}
                  onToggle={() => setMetricsOpen((was) => !was)}
                  controls={metricsPanelId}
                />
                {/* The panel keeps its own trigger for screens with nowhere to
                    put one; here the row above is it, so its trigger is off and
                    the two share one panel id. The panel owns its own collapse:
                    it draws figures the board already holds, so nothing is
                    gained by unmounting it. */}
                <MemeMarketMetrics
                  expanded={metricsOpen}
                  onToggle={setMetricsOpen}
                  metrics={metrics}
                  showTrigger={false}
                  panelId={metricsPanelId}
                />
              </div>

              <TradeTicket
                token={selected}
                side={side}
                amount={amount}
                onAmountChange={setAmount}
                funding={funding}
                heldRaw={heldRaw}
                heldDecimals={heldDecimals}
                preview={preview.quote}
                previewLoading={preview.isFetching}
                previewError={preview.error}
                quoteExpired={preview.expired}
                onRefreshQuote={() => void preview.refetch()}
                onSubmit={runTrade}
                phase={phase}
                error={error}
              />
              <MemeRiskConsent
                open={consent.prompting}
                token={selected}
                onContinue={consent.accept}
                onCancel={() => setAmount("")}
              />

              <LiveTransactions
                token={selected}
                swaps={swaps.swaps}
                status={swaps.status}
                onRetry={swaps.refetch}
              />
            </>
          )}
        </>
      ) : catalog.isLoading ? (
        <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
          <div className="h-[36px] animate-pulse rounded-[15px] bg-white/6" />
          <div className="h-[64px] animate-pulse rounded-[26px] bg-white/6" />
          <div className="h-[150px] animate-pulse rounded-[20px] bg-white/6" />
        </div>
      ) : catalog.error ? (
        <MemeUnavailable onRetry={() => void catalog.refetch()} />
      ) : (
        <div className="ws-card grid place-items-center px-4 py-12 text-center text-[13px] font-normal text-white/45">
          {t("empty")}
        </div>
      )}

      {sheetToken ? (
        <MemeTradeSheet token={sheetToken} defaultSide={side} onClose={() => setSheetToken(null)} />
      ) : null}
    </div>
  );
}
