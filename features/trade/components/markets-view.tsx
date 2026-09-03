"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { AssetChart } from "@/components/ui/asset-chart";
import { SearchIcon } from "@/components/ui/icons";
import { TradingViewChart } from "@/components/ui/tradingview-chart";
import { FlashPrice } from "@/features/trade/components/flash-price";
import { SpotPanel } from "@/features/trade/components/spot-panel";
import { MobileTradeSheet } from "@/features/trade/components/mobile-trade-sheet";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePaged } from "@/hooks/use-paged";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useCoingeckoId } from "@/hooks/use-coingecko-id";
import { useSpotMarkets, type SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import { defaultRouteForSymbol, holdingMatchesSymbol } from "@/lib/buy";
import { swapRouteForSymbol } from "@/lib/spot-swap";
import { formatUsd } from "@/lib/trade/math";
import { tokenBg } from "@/lib/trade/assets";
import { coingeckoId, coingeckoPlatform } from "@/lib/coingecko";
import { spotChartSource } from "@/lib/spot-chart";
import type { TokenBalance } from "@/lib/server/alchemy";

// Rows per page in the phone market list.
const MOBILE_PER_PAGE = 6;

// The markets pinned as one-tap chips in the simple interface, biggest first.
// A market's badge: built-in icon or real logo when one loads, and the same
// identicon gradient the perps desk uses for everything else — including a
// logo URL that 404s, which the old text badge turned into label soup.
function SpotCoin({ sym, logo, size }: { sym: string; logo: string | null; size: number }) {
  return <AssetIcon sym={sym} bg={tokenBg(sym)} logo={logo} size={size} fallback="gradient" />;
}

function changeLabel(chg: number): string {
  const v = Number.isFinite(chg) ? chg : 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// The pro spot terminal: candles, the searchable pair picker, the order ticket
// and the position card. The tradable list is the set of tokens Dextopus can
// actually deliver (its buyable destinations), so every market shown here can
// be executed. Prices come from the app's by-symbol price feed (which covers
// the whole set, not just the top coins); logos, 24h change and the chart id
// are enriched from the market feed when present. Renders as a bare body; the
// spot section provides the header and the simple/pro switch.
export function MarketsView() {
  const t = useTranslations("spot");
  const tCommon = useTranslations("common");
  const { markets, destinations, loading, error: marketsError } = useSpotMarkets();
  const portfolio = usePortfolio();

  const [selected, setSelected] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  // On a phone the chart and the ticket live in a sheet, opened by choosing a
  // market from the list below. Desktop keeps them on the page.
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const token: SpotMarket | null = markets.find((t) => t.symbol === selected) ?? markets[0] ?? null;
  const base = token?.symbol ?? "";
  const mark = token?.priceUsd ?? 0;

  // The USDC a buy spends from, on Base.
  const usdcBalance =
    portfolio.tokens.find((t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;

  // The held position a sell draws from: the most valuable holding of this
  // market's asset across chains, matched by route address and alias.
  const heldToken: TokenBalance | null = useMemo(() => {
    if (!base) return null;
    const owned = portfolio.tokens.filter((t) =>
      holdingMatchesSymbol(t, destinations.data ?? [], base)
    );
    if (owned.length === 0) return null;
    return owned.reduce((best, t) =>
      t.valueUsd > best.valueUsd || (t.valueUsd === best.valueUsd && t.balance > best.balance)
        ? t
        : best
    );
  }, [portfolio.tokens, destinations.data, base]);
  const heldBalance = heldToken?.balance ?? 0;

  // Every listed market is buyable by construction, so this resolves a route,
  // either a Dextopus cross-chain route or (for the small set of symbols
  // Dextopus does not offer, see lib/spot-swap.ts) a same-chain swap route.
  // A symbol never has both.
  const buyRoute = useMemo(
    () => (token ? defaultRouteForSymbol(destinations.data ?? [], token.symbol) : null),
    [destinations.data, token]
  );
  const swapRoute = useMemo(() => (token ? swapRouteForSymbol(token.symbol) : null), [token]);

  // Chart source. TradingView for the majors it carries, otherwise our CoinGecko
  // candle chart, which needs a coin id. The id comes from the market feed, the
  // static major map, or (for everything else) is resolved from the token's
  // contract address so long-tail buyable markets still chart.
  const chart = token ? spotChartSource(token.symbol) : null;
  const knownId = token ? (token.coingeckoId ?? coingeckoId(token.symbol)) : null;
  const needsResolve = token != null && !knownId && chart?.kind === "coingecko";
  const resolvePlatform = needsResolve && buyRoute ? coingeckoPlatform(buyRoute.chainName) : null;
  const resolveAddress = needsResolve && buyRoute ? buyRoute.asset : null;
  const resolved = useCoingeckoId(resolvePlatform, resolveAddress);
  const chartId = knownId ?? resolved.id;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    );
  }, [markets, search]);

  // Six to a page on the phone list, so the section stays one screen tall.
  const paged = usePaged(filtered, MOBILE_PER_PAGE);

  const pick = (t: SpotMarket) => {
    setSelected(t.symbol);
    setPickerOpen(false);
    setSearch("");
  };

  // Choosing from the phone list opens the market rather than swapping what a
  // hidden panel points at.
  const openMarket = (t: SpotMarket) => {
    setSelected(t.symbol);
    setSheetOpen(true);
  };

  // One row, drawn the same whether it is opening a market from the section or
  // switching to one from inside the trade screen.
  const marketRow = (m: SpotMarket, onPick: () => void) => (
    <button
      key={m.symbol}
      onClick={onPick}
      aria-label={tCommon("tradeAria", { symbol: m.symbol })}
      className="flex w-full cursor-pointer items-center gap-3 border-b border-white/6 px-4 py-3.5 text-left transition-colors last:border-b-0 active:bg-white/4"
    >
      <SpotCoin sym={m.symbol} logo={m.logo} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-sans text-[14.5px] font-medium">{m.symbol}</span>
        <span className="block truncate text-[11.5px] font-normal text-white/45">{m.name}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block font-sans text-[14px] font-medium">
          {m.priceUsd > 0 ? formatUsd(m.priceUsd) : "—"}
        </span>
        <span className={`tnum block text-[12px] ${m.change24h >= 0 ? "text-up" : "text-down"}`}>
          {changeLabel(m.change24h)}
        </span>
      </span>
    </button>
  );

  const chartHeight = 360;

  // Pair header with the searchable market picker.
  const pairHeader = (
    <div className="ws-card relative p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <SpotCoin sym={base || "?"} logo={token?.logo ?? null} size={34} />
        <button
          onClick={() => setPickerOpen((v) => !v)}
          disabled={markets.length === 0}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left disabled:cursor-default"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-sans text-[16px] font-semibold">
              {/* The token alone, not a BASE/QUOTE pair. Every spot market here
                  is quoted in USDC, so naming the quote on every row said
                  nothing and read as a pair-trading venue this is not. */}
              {token ? base : loading ? t("loadingMarkets") : t("noMarkets")}
              {markets.length > 0 ? <span className="text-white/40">▾</span> : null}
            </div>
            <div className="truncate text-xs font-normal text-white/50">{token?.name ?? "—"}</div>
          </div>
        </button>
        <div className="text-right">
          <FlashPrice value={mark} className="ws-display tnum block text-[19px]">
            {mark > 0 ? formatUsd(mark) : "—"}
          </FlashPrice>
          {token ? (
            <div
              className={`tnum text-xs font-medium ${
                token.change24h >= 0 ? "text-up" : "text-down"
              }`}
            >
              {changeLabel(token.change24h)}
            </div>
          ) : null}
        </div>
      </div>

      {pickerOpen ? (
        <div className="bg-panel absolute inset-x-4 top-[calc(100%-8px)] z-20 mt-1 overflow-hidden rounded-2xl border border-white/12 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-2 border-b border-white/8 px-3.5 py-2.5">
            <SearchIcon />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13.5px] font-normal text-white outline-none"
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] font-normal text-white/40">
                {t("noMatch")}
              </div>
            ) : (
              filtered.slice(0, 60).map((t) => (
                <button
                  key={t.symbol}
                  onClick={() => pick(t)}
                  className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/6"
                >
                  <SpotCoin sym={t.symbol} logo={t.logo} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-sans text-[13.5px] font-medium">{t.symbol}</div>
                    <div className="truncate text-[11.5px] font-normal text-white/45">{t.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-[13px] font-normal">
                      {t.priceUsd > 0 ? formatUsd(t.priceUsd) : "—"}
                    </div>
                    <div
                      className={`tnum text-[11px] ${t.change24h >= 0 ? "text-up" : "text-down"}`}
                    >
                      {changeLabel(t.change24h)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  // Candles: TradingView for the majors (same embed as the perps chart),
  // our CoinGecko candle feed when we have an id.
  const chartCard = (
    <div className="ws-card p-4 sm:p-5">
      {loading ? (
        <div style={{ height: chartHeight }} className="animate-pulse rounded-xl bg-white/6" />
      ) : marketsError && !token ? (
        <div
          style={{ height: chartHeight }}
          className="grid place-items-center text-center text-[13.5px] font-normal text-white/45"
        >
          {t("unavailable")}
        </div>
      ) : !token || !chart ? (
        <div
          style={{ height: chartHeight }}
          className="grid place-items-center text-center text-[13.5px] font-normal text-white/45"
        >
          {t("noSelection")}
        </div>
      ) : chart.kind === "tradingview" ? (
        <TradingViewChart symbol={chart.symbol} height={chartHeight} />
      ) : chartId ? (
        <AssetChart
          coingeckoId={chartId}
          allowCandles
          defaultType="candles"
          height={chartHeight - 36}
          up={(token?.change24h ?? 0) >= 0}
        />
      ) : resolved.loading ? (
        <div style={{ height: chartHeight }} className="animate-pulse rounded-xl bg-white/6" />
      ) : (
        <div
          style={{ height: chartHeight }}
          className="grid place-items-center text-center text-[13.5px] font-normal text-white/45"
        >
          {t("noChart", { symbol: base })}
        </div>
      )}
    </div>
  );

  // Holding for the selected market.
  const holdingCard = (
    <div className="ws-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="font-sans text-[13px] font-semibold text-white/80">
          {t("holdingTitle", { symbol: base || "—" })}
        </span>
        <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10.5px] font-medium text-white/40">
          {t("holdingTag")}
        </span>
      </div>
      {heldToken && heldBalance > 0 ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <SpotCoin sym={base} logo={heldToken.logo} size={26} />
            <span className="tnum text-[14px] font-medium">
              {heldBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} {base}
            </span>
          </span>
          <span className="tnum text-[14px] font-semibold">{formatUsd(heldToken.valueUsd)}</span>
        </div>
      ) : (
        <div className="grid place-items-center py-8 text-center text-[13px] font-normal text-white/40">
          {t("noHolding", { symbol: base || "—" })}
        </div>
      )}
    </div>
  );

  const ticket = (
    <SpotPanel
      token={token}
      mark={mark}
      usdcBalance={usdcBalance}
      heldToken={heldToken}
      buyRoute={buyRoute}
      swapRoute={swapRoute}
    />
  );

  // The phone view: a searchable market list, and nothing else until a market
  // is chosen. Everything that makes this section long on a phone (candles, the
  // ticket, the holding card) moves into the sheet.
  if (isMobile) {
    return (
      <>
        <div className="ws-inset flex items-center gap-2.5 px-3.5 py-2.5">
          <SearchIcon size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-[14px] font-normal text-white outline-none"
          />
        </div>

        <div className="ws-card mt-3 overflow-hidden">
          {loading ? (
            [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b border-white/6 px-4 py-3.5">
                <span className="size-9 shrink-0 animate-pulse rounded-full bg-white/8" />
                <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
                <span className="ml-auto h-4 w-16 animate-pulse rounded bg-white/8" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] font-normal text-white/45">
              {marketsError ? t("unavailable") : t("noMatch")}
            </div>
          ) : (
            paged.pageItems.map((m) => marketRow(m, () => openMarket(m)))
          )}
          {!loading && filtered.length > 0 ? (
            <ListPagination
              page={paged.page + 1}
              pages={paged.pageCount}
              onPage={(p) => (p > paged.page + 1 ? paged.goNext() : paged.goPrev())}
            />
          ) : null}
        </div>

        <MobileTradeSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={base || "—"}
          subtitle={token?.name}
          priceSlot={
            <FlashPrice value={mark} className="ws-display tnum block text-[15px]">
              {mark > 0 ? formatUsd(mark) : "—"}
            </FlashPrice>
          }
          marketPicker={(close) => (
            <>
              <div className="ws-inset mb-2 flex items-center gap-2.5 px-3.5 py-2.5">
                <SearchIcon size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-normal text-white outline-none"
                />
              </div>
              <div className="ws-card overflow-hidden">
                {filtered.slice(0, 60).map((m) =>
                  marketRow(m, () => {
                    setSelected(m.symbol);
                    close();
                  })
                )}
              </div>
            </>
          )}
        >
          {chartCard}
          {ticket}
          {holdingCard}
        </MobileTradeSheet>
      </>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 min-[980px]:grid-cols-[minmax(0,420px)_1fr]">
      {ticket}

      <div className="flex flex-col gap-4">
        {pairHeader}
        {chartCard}

        {holdingCard}
      </div>
    </div>
  );
}
