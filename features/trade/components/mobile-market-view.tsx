"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MarketLogo } from "@/components/ui/market-logo";
import { AssetIcon } from "@/components/ui/asset-icon";
import { MemeCoin, PctChange, priceLabel } from "@/features/trade/components/meme-bits";
import { parseBaseUnits } from "@/features/trade/components/meme-base-units";
import { MemeTradeSheet } from "@/features/trade/components/meme-trade-sheet";
import { TradeTicket, USD_DECIMALS } from "@/features/trade/components/meme-trade-ticket";
import {
  MemeMarketMetrics,
  type MemeMarketMetricsData,
  type MemeMetricValue,
} from "@/features/trade/components/meme-market-metrics";
import { SpotTicket } from "@/features/trade/components/spot-ticket";
import { ListPagination } from "@/components/ui/list-pagination";
import { useSpotMarkets, type SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import { useTrendingMemes } from "@/features/trade/hooks/use-meme-tokens";
import { useFitRows } from "@/hooks/use-fit-rows";
import {
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
   * The Prediction tab's content, supplied by the route. Prediction is its own
   * feature, and features never import each other, so the route composes it.
   */
  predictionSlot: ReactNode;
  /**
   * The Real assets tab's content, supplied by the route for the same reason:
   * real assets is its own feature.
   */
  rwaSlot: (query: string) => ReactNode;
}

// The Market design's phone Spot page (Figma 173:42337): its own MARKET head on
// the ray fan, a search box and the market-category tabs, then the full token
// list — every asset you can buy or sell, like the desktop desk. Tapping a token
// opens the spot ticket for it (Figma 1:7825) in the list's place, the way the
// Memecoins tab opens its trade sheet. The list is kept, not replaced.

// All four categories render inline on this page: nothing here navigates, so
// the strip is a tab control rather than a set of links. The order is the
// rail's: Spot, Memecoins, Real assets, Prediction. The design's Leverage tab
// is not on this build, since perpetuals are not; it returns as one entry here
// when they do.
//
// `searchable` says whether the search field can act on the panel below it.
// Spot and Memecoins are lists this view filters itself, and Real assets is a
// list its own feature filters by the query handed to it; prediction owns its
// own selection and takes no query from us.
const TABS = [
  { id: "spot", labelKey: "tabSpot", searchable: true },
  { id: "memecoins", labelKey: "tabMemecoins", searchable: true },
  { id: "rwa", labelKey: "tabRealAssets", searchable: true },
  { id: "prediction", labelKey: "tabPrediction", searchable: false },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Each tab's standalone desktop screen. Spot goes to the desk (with the app
// sidebar), and Memecoins, Real assets and Prediction to their own routes.
// Every tab has one, so md and up always leaves this phone column for the
// matching desktop surface.
const DESKTOP_ROUTE: Partial<Record<TabId, string>> = {
  spot: "/spot",
  memecoins: "/meme",
  rwa: "/rwa",
  prediction: "/prediction",
};

function changeLabel(chg: number): string {
  const v = Number.isFinite(chg) ? chg : 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// A coin-feed USD field as a market-metric value, the same mapping meme-board
// makes: compactUsd's em dash (a zero or a missing figure) becomes the null the
// metrics panel draws as "Unavailable" rather than as "$0".
function usdMetric(value: string | null): MemeMetricValue {
  if (value === null) return { display: null };
  const shown = compactUsd(value);
  return { display: shown === "—" ? null : shown };
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
}: {
  items: T[];
  pageSize: number;
  renderRow: (item: T) => ReactNode;
}) {
  const tCommon = useTranslations("common");
  const paged = usePaged(items, pageSize);
  if (items.length === 0) return null;
  return (
    <>
      {paged.pageItems.map(renderRow)}
      {/* The visible page text lives inside ListPagination; this is only the
          live region that announces a page change to a screen reader. */}
      <p aria-live="polite" className="sr-only">
        {tCommon("pageOf", { page: paged.page + 1, pages: paged.pageCount })}
      </p>
      <ListPagination
        page={paged.page + 1}
        pages={paged.pageCount}
        onPage={(target) => (target > paged.page + 1 ? paged.goNext() : paged.goPrev())}
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
 * This duplicates features/square/components/square-tabs.tsx, which solves the
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
      className="mt-4 flex shrink-0 [scrollbar-width:none] gap-4 overflow-x-auto border-b border-white/8 [&::-webkit-scrollbar]:hidden"
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

export function MobileMarketView({ predictionSlot, rwaSlot }: MobileMarketViewProps) {
  const router = useRouter();
  const t = useTranslations("markets");
  const tCommon = useTranslations("common");
  const tSpot = useTranslations("spot");
  const tMeme = useTranslations("meme");
  const { markets, loading, error } = useSpotMarkets();
  const [query, setQuery] = useState("");
  // Open on the tab named in the URL (?tab=), so a handoff from a desktop route
  // that shrank below md lands the reader back on the tab they were on. Falls
  // back to Spot, and ignores anything that is not a real tab.
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const wanted = searchParams.get("tab");
    return TABS.some((tab) => tab.id === wanted) ? (wanted as TabId) : "spot";
  });

  // A tab with a desktop route hands off to it at md and up, so md gets the full
  // desk rather than this phone column. Driven off the same breakpoint hook as the render gate below, so the
  // column is never painted at desktop width on the way out. Tabs with no
  // desktop route stay on this page at every width.
  const isMobile = useIsMobile();
  const desktopRoute = DESKTOP_ROUTE[activeTab];
  useEffect(() => {
    if (!isMobile && desktopRoute) router.replace(desktopRoute);
  }, [isMobile, desktopRoute, router]);

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

  const { tokens: memes, isLoading: memeLoading, error: memeError } = useTrendingMemes();

  // A memecoin's own ticket opens in the list's place, the same hide-not-
  // unmount and scroll-restore pattern the Spot tab uses above. Held by
  // address rather than by object for the same reason ticketSymbol is: a
  // trending-list refresh must not leave the ticket pointed at a stale copy.
  const [memeTicketAddress, setMemeTicketAddress] = useState<string | null>(null);
  const ticketMeme = useMemo(
    () => (memeTicketAddress ? (memes.find((m) => m.address === memeTicketAddress) ?? null) : null),
    [memes, memeTicketAddress]
  );
  // The market-metrics disclosure on the meme ticket. Open by default (the comp
  // opens on "Close Market Metrics"); age and the buy/sell split are not in the
  // feed, so they draw as Unavailable rather than invented.
  const [metricsOpen, setMetricsOpen] = useState(true);
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
    setMemeTicketAddress(token.address);
  }, []);

  const closeMemeTicket = useCallback(() => setMemeTicketAddress(null), []);

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

  const tabs = useMemo(() => TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) })), [t]);
  // Neither open ticket is a list this field can filter, so the same rule the
  // perps and prediction panels get applies to both.
  const searchable =
    (TABS.find((tab) => tab.id === activeTab)?.searchable ?? false) &&
    ticketSymbol === null &&
    memeTicketAddress === null;

  // Reset the query on a category change, so a term typed on Spot does not
  // silently filter (and blank) the Memecoins list, and vice versa.
  const selectTab = useCallback((id: TabId) => {
    setActiveTab(id);
    setQuery("");
    setTicketSymbol(null);
    setMemeTicketAddress(null);
  }, []);

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
  const memePreview = useMemePreview(memePreviewInput);

  // Base executes here in full. A Solana order does not: buying one may need
  // the USDC moved to the Solana wallet first, and selling one has to record
  // what the sale should deliver so the settlement tracker can route the
  // proceeds back to the USD balance. Both of those live in MemeTradeSheet,
  // so a Solana order is handed there rather than run here with half the
  // plumbing, the same split meme-board.tsx makes for its own TradeTicket.
  // The tap-to-screen fix stands either way: the sheet only ever appears from
  // a submit, never from the row tap that used to open it directly.
  async function submitMemeTrade(input: MemeTradeInput) {
    if (!ticketMeme) return;
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
      await runMemeTrade(input);
      toast.success(
        input.side === "BUY" ? tMeme("toastBought", { symbol }) : tMeme("toastSold", { symbol }),
        { id: toastId }
      );
      setMemeAmount("");
      void memePortfolio.refetchUntilChanged(tradedNetworks);
    } catch (e) {
      toast.error(friendlyError(e, tMeme("orderFailed")), { id: toastId });
      void memePortfolio.refetchFresh(tradedNetworks);
    }
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? markets.filter((m) => `${m.symbol} ${m.name}`.toLowerCase().includes(q)) : markets;
  }, [markets, query]);

  const memeRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? memes.filter((m) => `${m.symbol ?? ""} ${m.name ?? ""}`.toLowerCase().includes(q))
      : memes;
  }, [memes, query]);

  // While a tab is handing off to its desktop screen, render nothing rather than
  // flash this phone column at desktop width until the target route paints.
  if (!isMobile && desktopRoute) return null;

  // A phone design: full-bleed on a phone, but capped to a phone-width column on
  // desktop (centered, framed) instead of stretching edge to edge.
  return (
    <div className="fixed inset-0 mx-auto flex flex-col overflow-hidden bg-[#0f0f0f] md:max-w-[440px] md:border-x md:border-white/8">
      {/* MARKET head on the ray fan. 76px (was 100px): the ray art is a
          background-image stretched with bg-size-[100%_100%], so it crops and
          reflows with the box rather than distorting. */}
      <div className="relative flex h-[76px] shrink-0 items-end justify-center overflow-hidden bg-[#232323] bg-[url('/market/topbar-rays.svg')] bg-size-[100%_100%] bg-no-repeat pb-[15px]">
        <button
          type="button"
          // Inside either ticket, Back is the way out of the ticket. Only
          // from a list does it leave the page.
          onClick={() => {
            if (ticketSymbol !== null) {
              closeTicket();
              return;
            }
            if (memeTicketAddress !== null) {
              closeMemeTicket();
              return;
            }
            if (window.history.length > 1) router.back();
            else router.push("/portfolio");
          }}
          aria-label={tCommon("back")}
          // 44px hit area around a 20px glyph, kept centred in the shorter
          // header: (76 - 44) / 2 = 16px, i.e. bottom-4.
          className="absolute bottom-4 left-[14px] flex size-11 cursor-pointer items-center justify-center rounded-full text-white/80 hover:text-white"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <MarketLogo className="h-5 w-auto" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-6">
        {/* Search. The comp carries it on all four screens, so it stays mounted
            rather than unmounting and lurching the strip up by 51px. On a tab
            whose panel owns its own selection it is disabled: a field that
            cannot filter what is under it must say so rather than swallow what
            the user types. Giving perps and prediction a real query needs a
            prop on those panels, which this view does not own. */}
        <div
          className={`flex h-[51px] shrink-0 items-center gap-1 rounded-[50px] border-2 border-white/2 px-6 ${
            searchable ? "bg-white/5" : "bg-white/2"
          }`}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className="shrink-0"
          >
            <circle cx="11" cy="11" r="7" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
            <path
              d="m20 20-3.5-3.5"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchLabel")}
            aria-label={t("searchLabel")}
            disabled={!searchable}
            className="min-w-0 flex-1 bg-transparent font-serif text-[13px] font-semibold tracking-[-0.39px] text-white outline-none placeholder:text-white/45 disabled:cursor-not-allowed disabled:placeholder:text-white/25"
          />
        </div>

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
          {activeTab === "rwa" ? (
            // The real assets slot is the desk's own section: category tabs,
            // search and the asset table, with its detail and trade sheets.
            // Mounted only while this tab is selected, so its registry read is
            // not made for someone who never opens it.
            <div data-testid="rwa-panel-scroll" className="flex min-h-0 flex-1 flex-col">
              {rwaSlot(query)}
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
                      preview={memePreview.data ?? null}
                      previewLoading={memePreview.isFetching}
                      previewError={memePreview.error}
                      onSubmit={submitMemeTrade}
                      phase={memePhase}
                      error={memeTradeError}
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
                {memeLoading && memeRows.length === 0 ? (
                  [0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex h-[60px] items-center gap-3 px-1">
                      <span className="size-9 shrink-0 animate-pulse rounded-full bg-white/8" />
                      <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
                    </div>
                  ))
                ) : (
                  <PagedRows
                    key={query}
                    items={memeRows}
                    pageSize={memePageSize}
                    renderRow={(token) => (
                      <button
                        key={token.address}
                        type="button"
                        onClick={() => openMemeTicket(token)}
                        className="flex h-[60px] w-full items-center gap-3 border-b border-white/6 px-1 text-left transition-colors active:bg-white/5"
                      >
                        <span className="shrink-0">
                          <MemeCoin token={token} size={36} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-serif text-[14px] font-semibold text-white">
                            {token.symbol ?? "?"}
                          </span>
                          <span className="block truncate text-[11.5px] font-normal text-white/50">
                            {token.name ?? "—"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tnum block font-serif text-[13.5px] font-semibold text-white">
                            {priceLabel(token.priceUsd)}
                          </span>
                          <span className="block text-[12px] font-semibold">
                            <PctChange value={token.priceChange24hPercent} />
                          </span>
                        </span>
                      </button>
                    )}
                  />
                )}
                {!memeLoading && (memeError || memeRows.length === 0) ? (
                  <p className="mt-8 text-center text-[13px] font-normal text-white/45">
                    {memeError ? tMeme("unavailable") : tMeme("noResults")}
                  </p>
                ) : null}
              </div>
            </>
          ) : activeTab === "prediction" ? (
            // The prediction slot is the phone market list
            // (features/prediction/components/prediction-market-list.tsx). It is
            // mounted only while this tab is selected, so its feed is not
            // fetched for someone who never opens it.
            //
            // Geometry from the comp (Figma 1:16194): the card stack sits 24px
            // under the strip and in 16px gutters, four narrower than this
            // page's own 20px, which is the same bleed the spot and memecoin
            // lists take.
            <div
              data-testid="prediction-panel-scroll"
              className="-mx-1 mt-6 min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden"
            >
              {predictionSlot}
            </div>
          ) : (
            <>
              {ticketMarket ? (
                <div className="min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden">
                  <SpotTicket market={ticketMarket} onChangeMarket={closeTicket} />
                </div>
              ) : null}
              <div
                ref={listRef}
                data-testid="spot-market-list"
                hidden={ticketMarket !== null}
                className="-mx-1 mt-2 min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto [&::-webkit-scrollbar]:hidden"
              >
                {loading && rows.length === 0 ? (
                  [0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex h-[60px] items-center gap-3 px-1">
                      <span className="size-9 shrink-0 animate-pulse rounded-[10px] bg-white/8" />
                      <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
                    </div>
                  ))
                ) : (
                  <PagedRows
                    key={query}
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
