"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MarketLogo } from "@/components/ui/market-logo";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Disclosure } from "@/components/ui/disclosure";
import { ChevronLeftIcon, TrendIcon } from "@/components/ui/icons";
import { MemeCoin, PctChange, priceLabel } from "@/features/trade/components/meme-bits";
import { parseBaseUnits } from "@/features/trade/components/meme-base-units";
import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";
import { PerpsSection } from "@/features/trade/components/perps-section";
import { MemeRiskConsent } from "@/features/trade/components/meme-risk-consent";
import { TradeTicket, USD_DECIMALS } from "@/features/trade/components/meme-trade-ticket";
import { BoardChart } from "@/features/trade/components/meme-board-chart";
import { BoardDisclosure } from "@/features/trade/components/meme-board-disclosure";
import { useRiskConsent } from "@/features/trade/hooks/use-risk-consent";
import {
  MemeMarketMetrics,
  type MemeMarketMetricsData,
  type MemeMetricValue,
} from "@/features/trade/components/meme-market-metrics";
import { SpotTicket } from "@/features/trade/components/spot-ticket";
import { ListPagination } from "@/components/ui/list-pagination";
import { SearchField } from "@/components/ui/search-field";
import { useSpotMarkets, type SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import { useMemeCatalog, useMemeSearch } from "@/features/trade/hooks/use-meme-tokens";
import { MemeViewSwitch } from "@/features/trade/components/meme-catalog-controls";
import { ChangeBar, formatMetric } from "@/features/trade/components/meme-gamified-bits";
import { MemeScreenerToolbar } from "@/features/trade/components/meme-screener-toolbar";
import { METRIC_KEYS } from "@/features/trade/components/meme-sort-menu";
import {
  MemeTrendingStrip,
  TRENDING_PHONE_PAGE_SIZE,
} from "@/features/trade/components/meme-trending-strip";
import { useMemeScreener } from "@/features/trade/hooks/use-meme-screener";
import { useFitRows } from "@/hooks/use-fit-rows";
import {
  memeOutcomeToast,
  useMemePreview,
  useMemeTrade,
  type MemeTradeInput,
} from "@/features/trade/hooks/use-meme-trade";
import { usePaged } from "@/hooks/use-paged";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { displaySymbol } from "@/lib/buy";
import { friendlyError } from "@/lib/errors";
import { compactUsd, isValidTradeAmount, type MemeToken } from "@/lib/meme/api";
import { SOLANA_CHAIN_ID, networkOf } from "@/lib/meme/chain";
import { DEFAULT_DISCOVERY_VIEW, catalogKey, type DiscoveryView } from "@/lib/meme/catalog";
import { changeFor, heatShares, topGainerKeys } from "@/lib/meme/momentum";
import { metricValue, type ScreenerMetric } from "@/lib/meme/screener";
import { scopeOf } from "@/lib/portfolio/fresh-scope";
import { buyFunding } from "@/lib/meme/funding";
import { exceedsHeld } from "@/lib/meme/sell-amount";
import { toast } from "@/lib/toast";
import { belowMinimumBuy } from "@/lib/trade/minimums";
import { tokenBg } from "@/lib/trade/assets";
import { formatUsd } from "@/lib/trade/math";
import type { BuyPayload, DetailPayload } from "@/lib/modal-types";

interface MobileMarketViewProps {
  /**
   * The route's modal openers. Neither is called any more: a spot row used to
   * open the asset sheet and buy from there, and it now opens the ticket on
   * this page instead. They stay in the contract, optional, so the route keeps
   * compiling until someone touches it and drops them.
   */
  onOpenDetail?: (detail: DetailPayload) => void;
  onOpenBuy?: (buy: BuyPayload) => void;
  /**
   * The Real assets tab's content, supplied by the route for the same reason:
   * real assets is its own feature. It carries its own search field, so this
   * view hands it no query.
   */
  rwaSlot: ReactNode;
  /**
   * Opens the deposit flow. The Spot and Memecoins tickets grow an "Add funds"
   * button beside a disabled Buy when the balance can't cover it; the route
   * supplies this from its own modal host.
   */
  onAddFunds?: () => void;
}

// The Market design's phone Spot page (Figma 173:42337): its own MARKET head on
// the ray fan, a search box and the market-category tabs, then the full token
// list — every asset you can buy or sell, like the desktop desk. Tapping a token
// opens the spot ticket for it (Figma 1:7825) in the list's place, the way the
// Memecoins tab opens its trade sheet. The list is kept, not replaced.

// Trading categories render inline on this page. Prediction keeps its seat in
// the strip but opens its own full product route, where its navigation, market
// detail and bet slip remain identical on desktop and mobile.
//
// Every tab carries its own search field, at the top of its own list. Spot and
// Memecoins are the two this view filters itself; Real assets and Prediction
// are their own features and filter themselves, so nothing about their search
// is decided here.
const TABS = [
  { id: "spot", labelKey: "tabSpot" },
  { id: "perps", labelKey: "tabLeverage" },
  { id: "memecoins", labelKey: "tabMemecoins" },
  { id: "rwa", labelKey: "tabRealAssets" },
  { id: "prediction", labelKey: "tabPrediction" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Tabs this build does not offer.
 *
 * A visibility switch, like HIDDEN_NAV_SECTIONS in lib/sections.ts, and it
 * tracks it entry for entry. Prediction came off on 2026-09-16, went back on
 * in #517, and came off again on 2026-09-25. Perpetuals came off on the same
 * day, which empties the list: the desk was held back as a product decision
 * while it was exercised on staging, and that decision is reversed.
 *
 * TABS above stays the full catalogue so TabId keeps naming every tab and the
 * handoff routes below still typecheck; only the strip the reader is offered
 * is filtered, and a ?tab= pointing at a hidden one falls back to Spot rather
 * than opening a tab with nothing behind it. That fallback is why this list
 * can be emptied without touching anything else.
 *
 * Put an id back to hide a tab again.
 */
const HIDDEN_TABS: readonly TabId[] = [];

function isOfferedTab(id: string | null): id is TabId {
  return TABS.some((tab) => tab.id === id) && !HIDDEN_TABS.includes(id as TabId);
}

// Each tab's standalone desktop screen. Spot goes to the desk (with the app
// sidebar), and Leverage, Memecoins, Real assets and Prediction to their own
// routes.
// Every tab has one, so md and up always leaves this phone column for the
// matching desktop surface.
const DESKTOP_ROUTE: Partial<Record<TabId, string>> = {
  spot: "/spot",
  perps: "/perps",
  memecoins: "/meme",
  rwa: "/rwa",
  prediction: "/prediction",
};

function changeLabel(chg: number): string {
  const v = Number.isFinite(chg) ? chg : 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// A coin-feed USD field as a market-metric value, the same mapping meme-board
// makes: compactUsd's em dash (a figure it cannot read) becomes the null the
// metrics panel draws as "Unavailable"; a published zero stays "$0".
function usdMetric(value: string | null): MemeMetricValue {
  if (value === null) return { display: null };
  const shown = compactUsd(value);
  return { display: shown === "—" ? null : shown };
}

// The row's sorted metric shows an age against the wall clock, read as the
// external system it is (the same store shape as meme-live-transactions.tsx).
// Whole minutes, because the snapshot is compared by identity on every render
// and an age is only ever shown in minutes. The clock only ticks while an age
// is on screen; the server's snapshot is 0, which reads as no age yet.
const MINUTE_MS = 60_000;

function subscribeToMinute(onStoreChange: () => void): () => void {
  const id = setInterval(onStoreChange, MINUTE_MS);
  return () => clearInterval(id);
}

const subscribeToNothing = () => () => undefined;

function readMinute(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

function useMinuteClock(ticking: boolean): number {
  return useSyncExternalStore(
    ticking ? subscribeToMinute : subscribeToNothing,
    readMinute,
    () => 0
  );
}

/**
 * One page of `items`, paginated with `usePaged` at a caller-measured page
 * size, under the shared foot pager (components/ui/list-pagination.tsx) the
 * perps and prediction lists use, so the Market page's lists all page the same
 * way. Keyed by the caller on the search query, so a term that narrows the list
 * resets to page 1 rather than stranding the reader on a page the shorter list
 * may not have.
 */
function PagedRows<T>({
  items,
  pageSize,
  renderRow,
  more = false,
  loadingMore = false,
  stalled = false,
  waiting = false,
  onResume,
}: {
  items: T[];
  pageSize: number;
  /** Also handed the visible page, for a row that is judged against its neighbours. */
  renderRow: (item: T, pageItems: T[]) => ReactNode;
  /**
   * The list behind `items` is still filling. The page count is over the rows
   * in hand, so it grows as more land; this is what stops the bar reading as a
   * final count while it does.
   */
  more?: boolean;
  /** Of those rows, a batch is in flight right now. */
  loadingMore?: boolean;
  /** Filling stopped short of the whole list and will not start again alone. */
  stalled?: boolean;
  /** Filling is paused and will carry on by itself. */
  waiting?: boolean;
  /** Restarts a stalled fill. Drawn as a button in the pager only when given. */
  onResume?: () => void;
}) {
  const tCommon = useTranslations("common");
  const paged = usePaged(items, pageSize);
  if (items.length === 0) return null;
  const { pageItems } = paged;
  return (
    <>
      {pageItems.map((item) => renderRow(item, pageItems))}
      {/* The visible page text lives inside ListPagination; this is only the
          live region that announces a page change to a screen reader. */}
      <p aria-live="polite" className="sr-only">
        {tCommon("pageOf", { page: paged.page + 1, pages: paged.pageCount })}
      </p>
      <ListPagination
        page={paged.page + 1}
        pages={paged.pageCount}
        onPage={(target) => (target > paged.page + 1 ? paged.goNext() : paged.goPrev())}
        more={more}
        loadingMore={loadingMore}
        stalled={stalled}
        waiting={waiting}
        onResume={onResume}
      />
    </>
  );
}

/**
 * The market-category strip.
 *
 * It is a real tablist: `role="tablist"`/`role="tab"` with `aria-selected`, and
 * a roving tabindex so a keyboard user steps into the strip once and arrows
 * across rather than pressing Tab past four controls. Home and End jump to the
 * ends. The strip is wider than the phone, so selecting a tab also scrolls it
 * into view; without that, choosing Prediction on a 390px screen left it
 * half-clipped at the right edge.
 *
 * This duplicates components/ui/tabs.tsx, which solves the
 * same problem for the feed. The two should be merged into a shared primitive
 * under components/ui/ once the screens in flight have landed; features cannot
 * import each other, so neither can reuse the other where they sit today.
 */
function MarketTabs({
  active,
  onSelect,
  label,
  tabId,
  tabs,
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
  label: string;
  tabId: (id: TabId) => string;
  tabs: { id: TabId; label: string }[];
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  const select = useCallback(
    (id: TabId, moveFocus: boolean) => {
      onSelect(id);
      const node = stripRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab-id="${CSS.escape(id)}"]`
      );
      if (moveFocus) node?.focus();
      // Optional-called on purpose: bringing the tab into view is a nicety and
      // must never be the reason selection fails. jsdom does not implement it.
      node?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    },
    [onSelect]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const index = tabs.findIndex((tab) => tab.id === active);
      if (index < 0) return;
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;

      event.preventDefault();
      const target = tabs[next];
      if (target) select(target.id, true);
    },
    [tabs, active, select]
  );

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className="mt-2 flex shrink-0 [scrollbar-width:none] gap-4 overflow-x-auto border-b border-white/8 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            id={tabId(tab.id)}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(tab.id, false)}
            onKeyDown={onKeyDown}
            className="relative flex min-h-[44px] shrink-0 items-center justify-center px-3 focus-visible:outline-none"
          >
            <span
              className={`font-serif text-[13px] font-semibold tracking-[-0.36px] whitespace-nowrap ${
                selected ? "text-white" : "text-white/40"
              }`}
            >
              {tab.label}
            </span>
            {selected ? (
              <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-white" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function MobileMarketView({ rwaSlot, onAddFunds }: MobileMarketViewProps) {
  const router = useRouter();
  const t = useTranslations("markets");
  const tCommon = useTranslations("common");
  const tSpot = useTranslations("spot");
  const tMeme = useTranslations("meme");
  const tScreener = useTranslations("memeScreener");
  const tErr = useTranslations("tradeErrors");
  const { markets, loading, error } = useSpotMarkets();
  // A query per list. They were one field and one term until each tab grew
  // its own field; keeping them apart is what lets a tab hold what was typed
  // on it while the reader looks at another.
  const [spotQuery, setSpotQuery] = useState("");
  const [memeQuery, setMemeQuery] = useState("");
  // Open on the tab named in the URL (?tab=), so a handoff from a desktop route
  // that shrank below md lands the reader back on the tab they were on. Falls
  // back to Spot, and ignores anything that is not a real tab.
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const wanted = searchParams.get("tab");
    return isOfferedTab(wanted) ? wanted : "spot";
  });

  // A tab with a desktop route hands off to it at md and up, so md gets the full
  // desk rather than this phone column. Driven off the same breakpoint hook as the render gate below, so the
  // column is never painted at desktop width on the way out. Tabs with no
  // desktop route stay on this page at every width.
  const isMobile = useIsMobile();
  const desktopRoute = DESKTOP_ROUTE[activeTab];
  useEffect(() => {
    if (activeTab === "prediction") {
      router.replace("/prediction");
      return;
    }
    if (!isMobile && desktopRoute) router.replace(desktopRoute);
  }, [isMobile, activeTab, desktopRoute, router]);

  // A market's own ticket opens in the list's place. The market is held by
  // symbol rather than by object, so a price tick that rebuilds the catalogue
  // does not leave the ticket pointed at a stale copy.
  const [ticketSymbol, setTicketSymbol] = useState<string | null>(null);
  const ticketMarket = useMemo(
    () => (ticketSymbol ? (markets.find((m) => m.symbol === ticketSymbol) ?? null) : null),
    [markets, ticketSymbol]
  );

  // The list is hidden rather than unmounted, and its scroll offset is put back
  // by hand on the way out: `hidden` takes the element out of layout, which
  // drops the offset the browser was holding. Someone eighty rows down comes
  // back to where they were, not to the top.
  const listRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);

  const openTicket = useCallback((m: SpotMarket) => {
    listScrollTop.current = listRef.current?.scrollTop ?? 0;
    setTicketSymbol(m.symbol);
  }, []);

  const closeTicket = useCallback(() => setTicketSymbol(null), []);

  useLayoutEffect(() => {
    if (ticketMarket === null && listRef.current) {
      listRef.current.scrollTop = listScrollTop.current;
    }
  }, [ticketMarket]);

  // The Memecoins tab lists the catalogue, a server page of 500 at a time
  // behind the same Curated / All switch as the desk and the grid
  // (ADR-2026-09-14-memecoins-trade-contract, slice 4). A search replaces the
  // list with its own results, in the same view: the cached rows matched here
  // from the first character, plus the service's answer from the second.
  //
  // It also carries the desk's Trending strip and market screener
  // (ADR-2026-09-15-meme-trending-screener, 1.1). While filters or a sort
  // apply, the screener's list stands in for the catalogue. A search still
  // wins over both, as on the desk.
  const [memeView, setMemeView] = useState<DiscoveryView>(DEFAULT_DISCOVERY_VIEW);
  const memeCatalog = useMemeCatalog({ view: memeView });
  // Same two-source search as the desk: the cached catalogue answers an
  // address, a figure or an age here in the browser, and the service is still
  // asked about the coins the catalogue does not hold. It is handed the whole
  // catalogue rather than the screener's cut, because a search wins over the
  // filters.
  const memeSearch = useMemeSearch(memeQuery, memeView, memeCatalog.tokens);
  // The view renders every tab's hooks, so the screener only asks for data
  // while its tab is open. Spot readers never pay for a trending poll.
  const screener = useMemeScreener({
    view: memeView,
    trendingPageSize: TRENDING_PHONE_PAGE_SIZE,
    enabled: activeTab === "memecoins",
  });
  const memeList = screener.active ? screener.list : memeCatalog;
  const memeScreening = screener.active && !memeSearch.active;
  const memes = memeSearch.active ? memeSearch.results : memeList.tokens;
  const memeLoading = memeSearch.active ? memeSearch.searching : memeList.isLoading;
  const memeError = memeSearch.active ? memeSearch.error : memeList.error;
  const memeTimeframe = screener.timeframe;
  // Heat compares a coin's volume with the busiest on the whole board, not
  // just the page on screen, so a card's bar does not change with the page.
  const trendingTokens = screener.trending.tokens;
  const trendingHeat = useMemo(
    () => heatShares(trendingTokens, memeTimeframe),
    [trendingTokens, memeTimeframe]
  );
  // The metric the rows are sorted by joins each row's name line, so the order
  // explains itself. Price and market cap are left out: the row already shows
  // the price, and the name line has no room for a second money figure. A
  // search is not in that order, so it shows none.
  const sortMetric = screener.filters.sort?.by ?? null;
  const rowMetric: ScreenerMetric | null =
    memeScreening && sortMetric !== null && sortMetric !== "price" && sortMetric !== "marketCap"
      ? sortMetric
      : null;
  const memeNow = useMinuteClock(rowMetric === "age");

  // A memecoin's own ticket opens in the list's place, the same hide-not-
  // unmount and scroll-restore pattern the Spot tab uses above. The ticket
  // takes the fresher row whenever the list still carries the coin, matched by
  // chainId:address (the same address on two chains is two coins), so a
  // catalogue refresh does not leave it pointed at a stale copy. A coin opened
  // from Trending that the list does not carry follows the trending board.
  const [memeTicketToken, setMemeTicketToken] = useState<MemeToken | null>(null);
  const ticketMeme = useMemo(() => {
    if (!memeTicketToken) return null;
    const key = catalogKey(memeTicketToken);
    return (
      memes.find((m) => catalogKey(m) === key) ??
      trendingTokens.find((m) => catalogKey(m) === key) ??
      memeTicketToken
    );
  }, [memes, trendingTokens, memeTicketToken]);
  // The market-metrics disclosure on the meme ticket. Closed by default, like
  // the desk board and the meme page: the comp draws it open, but the ticket
  // leads with the trade, and the reader opens the figures if they want them.
  // Age and the buy/sell split are not in the feed, so they draw as
  // Unavailable rather than invented.
  const [metricsOpen, setMetricsOpen] = useState(false);
  // The coin's chart, above the side switch as on the desk's rail. Open by
  // default on every trade ticket: the price is in view before a trade.
  // Closing it unmounts the chart, so a folded row resolves no chart id.
  const [memeChartOpen, setMemeChartOpen] = useState(true);
  const memeChartPanelId = useId();
  const memeMetrics: MemeMarketMetricsData | null = ticketMeme
    ? {
        marketCap: usdMetric(ticketMeme.marketCapUsd),
        volume24h: usdMetric(ticketMeme.volume24hUsd),
        liquidity: usdMetric(ticketMeme.liquidityUsd),
        ageDays: null,
        traders: null,
      }
    : null;

  const memeListRef = useRef<HTMLDivElement>(null);
  const memeListScrollTop = useRef(0);

  const openMemeTicket = useCallback((token: MemeToken) => {
    memeListScrollTop.current = memeListRef.current?.scrollTop ?? 0;
    setMemeTicketToken(token);
  }, []);

  const closeMemeTicket = useCallback(() => setMemeTicketToken(null), []);

  useLayoutEffect(() => {
    if (ticketMeme === null && memeListRef.current) {
      memeListRef.current.scrollTop = memeListScrollTop.current;
    }
  }, [ticketMeme]);

  // Each list shows as many rows as its own box can hold, so the page fills the
  // phone rather than fixing a count that fits some phones and not others. Both
  // refs are the lists' scroll boxes. The active flag re-measures when a tab
  // mounts its list: a list behind an inactive tab is not in the DOM, so its box
  // cannot be measured until its tab is shown.
  const spotPageSize = useFitRows(listRef, activeTab === "spot");
  const memePageSize = useFitRows(memeListRef, activeTab === "memecoins");

  const panelId = useId();
  const tabDomId = useCallback((id: TabId) => `${panelId}-tab-${id}`, [panelId]);

  const tabs = useMemo(
    () =>
      TABS.filter((tab) => !HIDDEN_TABS.includes(tab.id)).map((tab) => ({
        id: tab.id,
        label: t(tab.labelKey),
      })),
    [t]
  );

  // A category change puts both tickets away. The queries stay: each belongs to
  // one list, and the reader gets that list back as they left it.
  const selectTab = useCallback(
    (id: TabId) => {
      if (id === "prediction") {
        router.push("/prediction");
        return;
      }
      setActiveTab(id);
      setTicketSymbol(null);
      setMemeTicketToken(null);
    },
    [router]
  );

  // The ticket's own trade state: which side, how much, and the trade
  // machine's phase/error. Mirrors the wiring meme-board.tsx does for the
  // same TradeTicket, since that is the orchestration this composes into.
  const [memeSide, setMemeSide] = useState<"BUY" | "SELL">("BUY");
  const [memeAmount, setMemeAmount] = useState("");
  // A Solana order is finished in the sheet; see submitMemeTrade below, same
  // split meme-board.tsx makes for its own TradeTicket.
  const [memeSheetToken, setMemeSheetToken] = useState<MemeToken | null>(null);
  const {
    walletFor: memeWalletFor,
    phase: memePhase,
    error: memeTradeError,
    trade: runMemeTrade,
  } = useMemeTrade();
  const memePortfolio = usePortfolio();
  const debouncedMemeAmount = useDebouncedValue(memeAmount, 600);

  const changeMemeSide = useCallback((side: "BUY" | "SELL") => {
    setMemeSide(side);
    setMemeAmount("");
  }, []);

  const memeBuying = memeSide === "BUY";
  const memeWallet = ticketMeme ? memeWalletFor(ticketMeme.chainId) : null;
  const memeUsdcOn = (network: string) =>
    memePortfolio.tokens.find((p) => p.network === network && p.symbol.toUpperCase() === "USDC")
      ?.balance ?? 0;
  const memeFunding = buyFunding({
    chainId: ticketMeme?.chainId ?? 0,
    payUsd: isValidTradeAmount(debouncedMemeAmount, USD_DECIMALS) ? Number(debouncedMemeAmount) : 0,
    baseUsdc: memeUsdcOn("base-mainnet"),
    solanaUsdc: memeUsdcOn("solana-mainnet"),
  });

  const memeNetwork = ticketMeme ? networkOf(ticketMeme.chainId) : null;
  const memeOnSolana = ticketMeme?.chainId === SOLANA_CHAIN_ID;
  const memeHeld =
    ticketMeme && memeNetwork
      ? memePortfolio.tokens.find(
          (p) =>
            p.network === memeNetwork &&
            (memeOnSolana
              ? p.address === ticketMeme.address
              : p.address?.toLowerCase() === ticketMeme.address.toLowerCase())
        )
      : undefined;
  const memeHeldRaw = memeHeld?.rawBalance ?? "0";
  const memeHeldDecimals = memeHeld?.decimals ?? ticketMeme?.decimals ?? 18;

  const memeMaxDecimals = memeBuying ? USD_DECIMALS : memeHeldDecimals;
  const memeAmountValid = isValidTradeAmount(debouncedMemeAmount, memeMaxDecimals);
  const memeSideEnabled = ticketMeme
    ? memeBuying
      ? ticketMeme.buyEnabled
      : ticketMeme.sellEnabled
    : false;
  const memeOverBalance =
    memeAmountValid &&
    (memeBuying
      ? Number(debouncedMemeAmount) > memeFunding.spendableUsd + 1e-9
      : parseBaseUnits(memeHeldRaw) === null ||
        exceedsHeld(debouncedMemeAmount, memeHeldRaw, memeHeldDecimals));
  const memeBelowMin =
    memeBuying && belowMinimumBuy(Number(debouncedMemeAmount || "0"), Boolean(memeOnSolana));

  // Only worth asking for a quote once the order could actually be placed,
  // same gate meme-board.tsx uses: the preview endpoint is rate limited
  // (20/min) and the trade service refuses to price a Solana buy short of
  // its pre-move USDC anyway.
  const memePreviewInput =
    ticketMeme &&
    memeWallet &&
    memeAmountValid &&
    memeSideEnabled &&
    !memeOverBalance &&
    !memeBelowMin &&
    !(memeBuying && memeFunding.needsFunding)
      ? {
          side: memeSide,
          tokenAddress: ticketMeme.address,
          amount: debouncedMemeAmount,
          walletAddress: memeWallet,
          chainId: ticketMeme.chainId,
        }
      : null;
  // A LOW_LIQUIDITY coin is confirmed before any preview goes out: the dialog
  // opens the first time an amount is typed for it, and Cancel clears it.
  const memeConsent = useRiskConsent(ticketMeme, memeAmount);
  const memePreview = useMemePreview(memePreviewInput, memeConsent.consented);

  // Base executes here in full. A Solana order does not: buying one may need
  // the USDC moved to the Solana wallet first, and selling one has to record
  // what the sale should deliver so the settlement tracker can route the
  // proceeds back to the USD balance. Both of those live in MemeTradeSheet,
  // so a Solana order is handed there rather than run here with half the
  // plumbing, the same split meme-board.tsx makes for its own TradeTicket.
  // The tap-to-screen fix stands either way: the sheet only ever appears from
  // a submit, never from the row tap that used to open it directly.
  async function submitMemeTrade(input: MemeTradeInput) {
    // No quote for a LOW_LIQUIDITY coin the user has not confirmed.
    if (!ticketMeme || !memeConsent.consented) return;
    if (input.chainId === SOLANA_CHAIN_ID) {
      setMemeSheetToken(ticketMeme);
      return;
    }
    const symbol = displaySymbol(ticketMeme.symbol ?? "");
    // The fresh read after the trade is scoped to the networks it touched:
    // the traded chain, and Base, where a buy is funded from.
    const tradedNetworks = scopeOf("base-mainnet", networkOf(input.chainId));
    const toastId = toast.loading(
      input.side === "BUY" ? tMeme("buyingToast", { symbol }) : tMeme("sellingToast", { symbol })
    );
    try {
      const result = await runMemeTrade(input);
      toast.success(memeOutcomeToast(tMeme, result, input.side, symbol), { id: toastId });
      setMemeAmount("");
      void memePortfolio.refetchUntilChanged(tradedNetworks);
    } catch (e) {
      toast.error(friendlyError(e, tMeme("orderFailed"), tErr), { id: toastId });
      void memePortfolio.refetchFresh(tradedNetworks);
    }
  }

  const rows = useMemo(() => {
    const q = spotQuery.trim().toLowerCase();
    return q ? markets.filter((m) => `${m.symbol} ${m.name}`.toLowerCase().includes(q)) : markets;
  }, [markets, spotQuery]);

  // A search builds its own list, from the cached catalogue and the service
  // together, so the list is either the catalogue or that result, never a
  // filter laid over the rows on screen.
  const memeRows = memes;

  // While a tab is handing off to its desktop screen, render nothing rather than
  // flash this phone column at desktop width until the target route paints.
  if (activeTab === "prediction" || (!isMobile && desktopRoute)) return null;

  // A phone design: full-bleed on a phone, but capped to a phone-width column on
  // desktop (centered, framed) instead of stretching edge to edge.
  return (
    <div className="fixed inset-0 mx-auto flex flex-col overflow-hidden bg-[#0f0f0f] md:max-w-[440px] md:border-x md:border-white/8">
      {/* MARKET head on the ray fan. 52px: the head was taking a fifth of a
          phone screen before the list even started. The ray art is a
          background-image stretched with bg-size-[100%_100%], so it crops and
          reflows with the box rather than distorting. */}
      <div className="relative flex h-[52px] shrink-0 items-center justify-center overflow-hidden bg-[#232323] bg-[url('/market/topbar-rays.svg')] bg-size-[100%_100%] bg-no-repeat">
        <button
          type="button"
          // Inside either ticket, Back is the way out of the ticket. Only
          // from a list does it leave the page.
          //
          // The Real assets tab is not handled here on purpose. Its ticket
          // lives inside the opaque rwaSlot, and this view cannot reach into
          // it: features never import each other, and the slot is a ReactNode
          // the route builds, so there is no handle to call. That ticket's own
          // asset pill is the way back to its list. A tab change still clears
          // it, because the slot is unmounted when its tab is not selected.
          onClick={() => {
            if (ticketSymbol !== null) {
              closeTicket();
              return;
            }
            if (memeTicketToken !== null) {
              closeMemeTicket();
              return;
            }
            if (window.history.length > 1) router.back();
            else router.push("/portfolio");
          }}
          aria-label={tCommon("back")}
          // 44px hit area around the 40px disc the design draws. The head is
          // shorter than the hit area is tall, so the button is centred on it
          // rather than inset, and the disc sits inside the tap target so the
          // hit area stays 44px while the visible circle stays 40px.
          className="absolute top-1/2 left-[14px] flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center text-white/80 hover:text-white"
        >
          <span className="grid size-10 place-items-center rounded-full bg-white/10">
            <ChevronLeftIcon size={20} />
          </span>
        </button>
        <MarketLogo className="h-5 w-auto" />
      </div>

      {/* pb clears the curved bottom nav the Market page now carries (it is
          fixed over the foot of this full-screen view). Mobile only, since the
          bar is md:hidden. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-2 pb-[92px] md:pb-0">
        <MarketTabs
          active={activeTab}
          onSelect={selectTab}
          label={t("tabsAria")}
          tabId={tabDomId}
          tabs={tabs}
        />

        {/* One panel, named by the tab that selected it. */}
        <div
          role="tabpanel"
          aria-labelledby={tabDomId(activeTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {activeTab === "perps" ? (
            // The perps desk renders inline, the same section /perps shows.
            // Mounted only while this tab is selected, so its market reads are
            // not made for someone who never opens it.
            <div
              data-testid="perps-panel-scroll"
              className="mt-3 min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden"
            >
              {/* The scroller above already provides the side gutter; a second
                  one here cost 16px a side on a phone. */}
              <PerpsSection gutter={false} />
            </div>
          ) : activeTab === "rwa" ? (
            // The real assets slot is that feature's own phone tab: its list,
            // its search field, and the order ticket a tapped row swaps the
            // list for, all inside the slot. Mounted only while this tab is
            // selected, so its registry read is not made for someone who never
            // opens it, and so leaving the tab puts its ticket away.
            <div data-testid="rwa-panel-scroll" className="flex min-h-0 flex-1 flex-col">
              {rwaSlot}
            </div>
          ) : activeTab === "memecoins" ? (
            <>
              {ticketMeme ? (
                <div className="min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden">
                  <div className="flex flex-col gap-3 px-1 pt-1 pb-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0">
                          <MemeCoin token={ticketMeme} size={32} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-serif text-[14px] font-semibold text-white">
                            {ticketMeme.symbol ?? "?"}
                          </span>
                          <span className="block truncate text-[11.5px] font-normal text-white/50">
                            {ticketMeme.name ?? "—"}
                          </span>
                        </span>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="tnum block font-serif text-[15px] font-semibold text-white">
                          {priceLabel(ticketMeme.priceUsd)}
                        </span>
                        <span className="block text-[12px] font-semibold">
                          <PctChange value={ticketMeme.priceChange24hPercent} />
                        </span>
                      </span>
                    </div>

                    {/* Row and panel in one gapless box, as on the board: the
                        panel stays mounted while shut so it can fold, and the
                        12px lead rides on the gated wrapper where the clip cuts
                        it away, not on the Disclosure, where a shut panel would
                        keep it. The chart itself is gated so a closed row holds
                        no chart open. */}
                    <div className="flex flex-col">
                      <BoardDisclosure
                        icon={<TrendIcon size={11} />}
                        label={memeChartOpen ? tMeme("mobileCloseChart") : tMeme("mobileViewChart")}
                        open={memeChartOpen}
                        onToggle={() => setMemeChartOpen((open) => !open)}
                        controls={memeChartPanelId}
                      />
                      <Disclosure open={memeChartOpen} id={memeChartPanelId}>
                        {memeChartOpen ? (
                          <div className="pt-3">
                            <BoardChart token={ticketMeme} />
                          </div>
                        ) : null}
                      </Disclosure>
                    </div>

                    <div
                      role="group"
                      aria-label={tMeme("tradeAction")}
                      className="bg-grey-800 flex gap-2 rounded-full p-2"
                    >
                      {(["BUY", "SELL"] as const).map((option) => {
                        const on = memeSide === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => changeMemeSide(option)}
                            aria-pressed={on}
                            className={`flex h-11 flex-1 cursor-pointer items-center justify-center rounded-3xl font-[family-name:var(--font-sportsbook)] text-base font-semibold transition-colors ${
                              on
                                ? `${option === "BUY" ? "bg-buy" : "bg-sell"} text-white`
                                : "border border-white/8 bg-[rgba(54,54,54,0.16)] text-[#e9fff7]"
                            }`}
                          >
                            {option === "BUY" ? tMeme("buy") : tMeme("sell")}
                          </button>
                        );
                      })}
                    </div>

                    {/* Market metrics disclosure (Figma 173:44998), from the
                        coin feed's real stats. */}
                    <MemeMarketMetrics
                      expanded={metricsOpen}
                      onToggle={setMetricsOpen}
                      metrics={memeMetrics}
                    />

                    <TradeTicket
                      token={ticketMeme}
                      side={memeSide}
                      amount={memeAmount}
                      onAmountChange={setMemeAmount}
                      funding={memeFunding}
                      heldRaw={memeHeldRaw}
                      heldDecimals={memeHeldDecimals}
                      preview={memePreview.quote}
                      previewLoading={memePreview.isFetching}
                      previewError={memePreview.error}
                      quoteExpired={memePreview.expired}
                      onRefreshQuote={() => void memePreview.refetch()}
                      onSubmit={submitMemeTrade}
                      phase={memePhase}
                      error={memeTradeError}
                      onAddFunds={onAddFunds}
                    />
                    <MemeRiskConsent
                      open={memeConsent.prompting}
                      token={ticketMeme}
                      onContinue={memeConsent.accept}
                      onCancel={() => setMemeAmount("")}
                    />
                  </div>
                </div>
              ) : null}
              <div
                ref={memeListRef}
                data-testid="meme-market-list"
                hidden={ticketMeme !== null}
                className="-mx-1 mt-2 min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden"
              >
                {/* Inside the scroll box on purpose: the field belongs to this
                    list, and it scrolls away with it rather than holding the
                    top of a phone screen. px-1 is the rows' own gutter, which
                    puts its edges on theirs. */}
                <div className="px-1 pb-2">
                  <SearchField
                    value={memeQuery}
                    onChange={setMemeQuery}
                    label={tMeme("searchAllLabel")}
                    placeholder={tMeme("searchAllLabel")}
                  />
                </div>
                <div className="px-1 pb-2">
                  <MemeViewSwitch value={memeView} onChange={setMemeView} />
                </div>
                {/* Trending follows the applied filters, not the search, so it
                    stays up while a search holds the list. The list is hidden
                    while a ticket is open, so no card is ever marked selected. */}
                <div className="px-1 pb-2">
                  <MemeTrendingStrip
                    variant="phone"
                    tokens={screener.trending.pageTokens}
                    rankOffset={(screener.trending.page - 1) * TRENDING_PHONE_PAGE_SIZE}
                    heat={trendingHeat}
                    timeframe={memeTimeframe}
                    page={screener.trending.page}
                    pages={screener.trending.pages}
                    onPageChange={screener.trending.setPage}
                    filtered={screener.trending.filtered}
                    isLoading={screener.trending.isLoading}
                    error={screener.trending.error}
                    onRetry={screener.trending.refetch}
                    selectedKey={null}
                    onSelect={openMemeTicket}
                  />
                </div>
                <div className="px-1 pb-2">
                  <MemeScreenerToolbar
                    variant="phone"
                    timeframe={memeTimeframe}
                    onTimeframeChange={screener.setTimeframe}
                    filters={screener.filters}
                    count={screener.count}
                    preset={screener.preset}
                    onApply={screener.apply}
                    onSortChange={screener.setSort}
                    onPreset={screener.applyPreset}
                    onClearBound={screener.clearBound}
                    onClearAll={screener.clearAll}
                    paused={memeSearch.active}
                  />
                </div>
                {memeLoading && memeRows.length === 0 ? (
                  [0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex h-[60px] items-center gap-3 px-1">
                      <span className="size-9 shrink-0 animate-pulse rounded-full bg-white/8" />
                      <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
                    </div>
                  ))
                ) : (
                  <PagedRows
                    // A search resets to page 1 as the query changes. Outside
                    // one, so does a change to the applied filters, which
                    // changes the rows under the reader.
                    key={
                      memeSearch.active
                        ? `search:${memeQuery}`
                        : `list:${memeQuery}:${screener.resetKey}`
                    }
                    items={memeRows}
                    pageSize={memePageSize}
                    // The catalogue runs past a hundred thousand coins and
                    // arrives a server page at a time, so the bar below pages
                    // over whatever is in hand and grows with it. Without this
                    // a list 3% loaded would read as a complete three pages.
                    // A search is its own finished list, so it says nothing.
                    more={!memeSearch.active && memeList.hasMore}
                    // The walk's own status, not isLoadingMore: the walk paces
                    // itself between server pages, and a flag that went false
                    // in each gap would flicker the hint on and off all the way
                    // through. It also tells the truth when the walk has
                    // stalled or been rate limited, where nothing is arriving.
                    loadingMore={!memeSearch.active && memeList.progress.status === "walking"}
                    // The walk gives up after a run of refusals and nothing
                    // restarts it, so the reader was left holding part of the
                    // catalogue with the bar gone quiet and the list reading as
                    // finished. This is the way back.
                    stalled={!memeSearch.active && memeList.progress.status === "stalled"}
                    // A 429 is a pause, not a stop: the walk resumes itself at
                    // progress.resumesAt, so it says so and offers no button.
                    waiting={!memeSearch.active && memeList.progress.status === "rate-limited"}
                    onResume={memeList.progress.retry}
                    renderRow={(token, pageItems) => {
                      const key = catalogKey(token);
                      const change = changeFor(token, memeTimeframe);
                      // A page is a dozen rows at most, so ranking it again
                      // per row costs nothing worth caching.
                      const topGainer = topGainerKeys(pageItems, memeTimeframe).has(key);
                      const metricText =
                        rowMetric === null
                          ? null
                          : formatMetric(
                              metricValue(token, rowMetric, memeTimeframe, memeNow),
                              tScreener
                            );
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => openMemeTicket(token)}
                          className="flex h-[60px] w-full items-center gap-3 border-b border-white/6 px-1 text-left transition-colors active:bg-white/5"
                        >
                          <span className="shrink-0">
                            <MemeCoin token={token} size={36} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1">
                              <span className="truncate font-serif text-[14px] font-semibold text-white">
                                {token.symbol ?? "?"}
                              </span>
                              {topGainer ? (
                                <span
                                  role="img"
                                  aria-label={tScreener("topGainer")}
                                  className="shrink-0 text-[11px] leading-none"
                                >
                                  🔥
                                </span>
                              ) : null}
                            </span>
                            {/* The name gives way before the metric does. */}
                            <span className="flex min-w-0 items-baseline gap-1 text-[11.5px] font-normal text-white/50">
                              <span className="truncate">{token.name ?? "—"}</span>
                              {rowMetric !== null && metricText !== null ? (
                                <span
                                  data-row-metric={rowMetric}
                                  className="tnum shrink-0 text-white/70"
                                >
                                  <span aria-hidden="true">· </span>
                                  <span className="sr-only">
                                    {tScreener(METRIC_KEYS[rowMetric])}{" "}
                                  </span>
                                  {metricText}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="tnum block font-serif text-[13.5px] font-semibold text-white">
                              {priceLabel(token.priceUsd)}
                            </span>
                            <span className="block text-[12px] font-semibold">
                              <PctChange value={change} />
                            </span>
                            <ChangeBar change={change} className="mt-0.5 ml-auto max-w-10" />
                          </span>
                        </button>
                      );
                    }}
                  />
                )}
                {!memeLoading && (memeError || memeRows.length === 0) ? (
                  <p className="mt-8 text-center text-[13px] font-normal text-white/45">
                    {memeError
                      ? memeScreening
                        ? tScreener("listUnavailable")
                        : tMeme("unavailable")
                      : memeScreening
                        ? tScreener("noMatches")
                        : tMeme("noResults")}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              {ticketMarket ? (
                <div className="min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden">
                  <SpotTicket
                    market={ticketMarket}
                    onChangeMarket={closeTicket}
                    onAddFunds={onAddFunds}
                  />
                </div>
              ) : null}
              <div
                ref={listRef}
                data-testid="spot-market-list"
                hidden={ticketMarket !== null}
                className="-mx-1 mt-2 min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden"
              >
                {/* Inside the scroll box, for the reason the memecoin field is. */}
                <div className="px-1 pb-2">
                  <SearchField
                    value={spotQuery}
                    onChange={setSpotQuery}
                    label={tSpot("searchPlaceholder")}
                    placeholder={tSpot("searchPlaceholder")}
                  />
                </div>
                {loading && rows.length === 0 ? (
                  [0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex h-[60px] items-center gap-3 px-1">
                      <span className="size-9 shrink-0 animate-pulse rounded-[10px] bg-white/8" />
                      <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
                    </div>
                  ))
                ) : (
                  <PagedRows
                    key={spotQuery}
                    items={rows}
                    pageSize={spotPageSize}
                    renderRow={(m) => {
                      const up = m.change24h >= 0;
                      return (
                        <button
                          key={m.symbol}
                          type="button"
                          onClick={() => openTicket(m)}
                          className="flex h-[60px] w-full items-center gap-3 border-b border-white/6 px-1 text-left transition-colors active:bg-white/5"
                        >
                          <span className="shrink-0 overflow-hidden rounded-[10px]">
                            <AssetIcon
                              sym={m.symbol}
                              bg={tokenBg(m.symbol)}
                              logo={m.logo}
                              fallback="gradient"
                              size={36}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-serif text-[14px] font-semibold text-white">
                              {m.symbol}
                            </span>
                            <span className="block truncate text-[11.5px] font-normal text-white/50">
                              {m.name}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="tnum block font-serif text-[13.5px] font-semibold text-white">
                              {m.priceUsd > 0 ? formatUsd(m.priceUsd) : "—"}
                            </span>
                            <span
                              className={`tnum block text-[12px] font-semibold ${up ? "text-up" : "text-down"}`}
                            >
                              {changeLabel(m.change24h)}
                            </span>
                          </span>
                        </button>
                      );
                    }}
                  />
                )}
                {!loading && rows.length === 0 ? (
                  <p className="mt-8 text-center text-[13px] font-normal text-white/45">
                    {error ? tSpot("unavailable") : t("noResults")}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* A Solana order handed off from submitMemeTrade above, self-rendered
          as an overlay on top of the ticket screen the same way it sits atop
          meme-board.tsx. */}
      {memeSheetToken ? (
        <MemeTradeSheet
          token={memeSheetToken}
          defaultSide={memeSide}
          onClose={() => setMemeSheetToken(null)}
        />
      ) : null}
    </div>
  );
}
