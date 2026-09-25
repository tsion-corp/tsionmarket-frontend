import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "@/messages/en.json";
import { memeToken } from "@/lib/meme/fixture";
import type { SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import type { MemeToken } from "@/lib/meme/api";
import type { DiscoveryView } from "@/lib/meme/catalog";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import type { ScreenerFilters } from "@/lib/meme/screener";
import type { MemeTimeframe } from "@/lib/meme/types";

// The chrome's six keys ship in the `markets` namespace now, so the suite reads
// the real catalogue rather than a local stand-in. That is the point: a stub
// here would keep passing if a key were ever dropped from messages/*.json.

const spot = vi.hoisted(() => ({
  markets: [] as SpotMarket[],
  loading: false,
  error: null as unknown,
}));
// The screen carries the Shine switch, which reads the account's own
// preference through React Query and the session. Stubbed: this test is about
// the screen, not the switch, which has its own suite in components/shine.
vi.mock("@/hooks/use-shine", () => ({
  useShine: () => ({
    preferences: null,
    isResolved: false,
    isLoading: false,
    isSignedIn: false,
    isSaving: false,
    error: null,
    isOn: () => true,
    mayPost: () => false,
    setShine: async () => {},
    refetch: () => {},
  }),
}));

vi.mock("@/features/trade/hooks/use-spot-markets", () => ({
  useSpotMarkets: () => spot,
}));

// The Memecoins tab lists the catalogue (slice 4), behind the same Curated /
// All switch as the desk and the grid. Like them it never says how much of the
// catalogue has loaded: it is cached whole, so the count had nothing to say.
const memes = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  // What the All view keeps, when a test gives the two views different rows.
  allTokens: null as MemeToken[] | null,
  total: null as number | null,
  loaded: 0,
  shownCount: 0,
  hasMore: false,
  isLoadingMore: false,
  // The walk behind the rows: the catalogue arrives 500 coins a server page.
  progress: {
    status: "complete" as "walking" | "rate-limited" | "stalled" | "complete",
    // The walk's own restart. Nothing else can clear a stall.
    retry: vi.fn(),
  },
  loadMore: vi.fn(),
  isLoading: false,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const memeSearch = vi.hoisted(() => ({
  results: [] as MemeToken[],
  searching: false,
  active: false,
  error: null as unknown,
  // Most of this suite drives the search hook by hand. The search cases at the
  // foot set this and get the real hook instead, running over the catalogue the
  // tab hands it, which is the only way to prove that wiring exists.
  real: false,
  catalogues: [] as (MemeToken[] | undefined)[],
}));
const memeViews = vi.hoisted(() => ({ catalog: [] as unknown[], search: [] as unknown[] }));
vi.mock("@/features/trade/hooks/use-meme-tokens", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/trade/hooks/use-meme-tokens")>();
  return {
    ...real,
    useMemeCatalog: (opts?: { view?: string }) => {
      memeViews.catalog.push(opts?.view);
      return opts?.view === "all" && memes.allTokens
        ? { ...memes, tokens: memes.allTokens }
        : memes;
    },
    // The real hook runs either way, so this is never a hook called
    // conditionally; which of the two answers the tab sees is the flag.
    useMemeSearch: (raw: string, view?: DiscoveryView, catalogue?: MemeToken[]) => {
      memeViews.search.push(view);
      memeSearch.catalogues.push(catalogue);
      const live = real.useMemeSearch(raw, view, catalogue);
      return memeSearch.real ? live : memeSearch;
    },
  };
});

// The phone never calls the service in this suite: the search cases below are
// about what the cached catalogue answers, so the provider returns nothing.
const searchTokens = vi.hoisted(() => vi.fn(async () => [] as MemeToken[]));
vi.mock("@/lib/meme/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meme/api")>()),
  searchTokens,
}));

// The Memecoins tab's Trending strip and screener read one controller
// (ADR-2026-09-15-meme-trending-screener, 1.1). Its default here is the
// inactive screener with nothing trending, so the catalogue cases above and
// below see the tab exactly as they did before the screener joined it.
function inactiveScreener() {
  return {
    timeframe: "24h" as MemeTimeframe,
    setTimeframe: vi.fn(),
    filters: { bounds: {}, sort: null } as ScreenerFilters,
    active: false,
    count: 0,
    preset: null,
    apply: vi.fn(),
    setSort: vi.fn(),
    applyPreset: vi.fn(),
    clearBound: vi.fn(),
    clearAll: vi.fn(),
    listQuery: "",
    refreshTrending: vi.fn(),
    trendingRefreshing: false,
    list: {
      tokens: [] as MemeToken[],
      total: null as number | null,
      loaded: 0,
      shownCount: 0,
      hasMore: false,
      loadMore: vi.fn(),
      isLoadingMore: false,
      loadMoreFailed: false,
      isLoading: false,
      isFetching: false,
      error: null as unknown,
      refetch: vi.fn(),
      progress: {
        status: "complete" as "walking" | "rate-limited" | "stalled" | "complete",
        retry: vi.fn(),
      },
    },
    trending: {
      tokens: [] as MemeToken[],
      isLoading: false,
      isFetching: false,
      error: null as unknown,
      refetch: vi.fn(),
      page: 1,
      pages: 1,
      pageTokens: [] as MemeToken[],
      setPage: vi.fn(),
      filtered: false,
    },
    resetKey: "",
  };
}
const screener = vi.hoisted(() => ({
  state: null as ReturnType<typeof inactiveScreener> | null,
  calls: [] as { view: string; trendingPageSize: number; enabled?: boolean }[],
}));
vi.mock("@/features/trade/hooks/use-meme-screener", () => ({
  useMemeScreener: (opts: { view: string; trendingPageSize: number; enabled?: boolean }) => {
    screener.calls.push(opts);
    if (screener.state === null) throw new Error("The screener mock was not reset.");
    return screener.state;
  },
}));

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
const search = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(search.query),
}));
// This suite mounts the phone view directly, so it always renders as mobile; the
// md handoff to /spot etc. is exercised by the route pages, not here.
vi.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => true }));

vi.mock("@/features/trade/components/perps-section", () => ({
  PerpsSection: () => <div data-testid="perps-desk" />,
}));

// The hosted panels are other agents' components. They are stubbed so this
// suite tests the chrome, and so a change inside them cannot fail it.
// The mobile Memecoins tab drives TradeTicket directly (its own trade
// state lives in mobile-market-view.tsx), so this suite mocks the hooks that
// state is built from, the same way meme-board.test.tsx does for the same
// wiring. TradeTicket itself has its own suite (meme-trade-ticket.test.tsx),
// so it is stubbed here too: this suite tests the hosting, not the ticket.
const memeTrade = vi.hoisted(() => vi.fn());
// What useMemePreview hands back, and whether each render let a preview go out
// past the risk consent.
const memePreview = vi.hoisted(() => ({
  state: {
    quote: null as unknown,
    expired: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  consented: [] as boolean[],
}));
vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  // The surfaces also read pure helpers (memeOutcomeToast) off this module.
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({
    walletFor: () => "0xwallet",
    phase: "idle",
    error: null,
    trade: memeTrade,
  }),
  useMemePreview: (_input: unknown, consented: boolean) => {
    memePreview.consented.push(consented);
    return memePreview.state;
  },
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [],
    refetchUntilChanged: vi.fn(),
    refetchFresh: vi.fn(),
  }),
}));

type MockTicketProps = {
  token: { symbol: string; address: string; chainId: number };
  side: "BUY" | "SELL";
  amount: string;
  onAmountChange: (amount: string) => void;
  preview: unknown;
  quoteExpired?: boolean;
  onRefreshQuote?: () => void;
  onSubmit: (input: {
    side: "BUY" | "SELL";
    tokenAddress: string;
    amount: string;
    chainId: number;
  }) => void;
};
const memeTicketProps = vi.hoisted(() => ({ last: null as MockTicketProps | null }));
vi.mock("@/features/trade/components/meme-trade-ticket", () => ({
  TradeTicket: (props: MockTicketProps) => {
    memeTicketProps.last = props;
    return (
      <div data-testid="meme-trade-ticket">
        <button
          type="button"
          onClick={() =>
            props.onSubmit({
              side: props.side,
              tokenAddress: props.token.address,
              amount: "1",
              chainId: props.token.chainId,
            })
          }
        >
          submit trade
        </button>
      </div>
    );
  },
  USD_DECIMALS: 6,
}));

// The sheet is only ever handed a Solana order from submitMemeTrade's own
// chain check, so this stub also proves which token and side it was handed.
const memeSheetProps = vi.hoisted(() => ({
  last: null as { token: { symbol: string }; defaultSide?: string } | null,
}));
// The memecoin ticket opens on its chart, which resolves a CoinGecko id over
// the network. This suite is about the tab's wiring, so the lookup answers
// "not listed" and the chart draws its own empty state.
vi.mock("@/hooks/use-coingecko-id", () => ({
  useCoingeckoId: () => ({ id: null, loading: false }),
}));

vi.mock("@/features/trade/components/meme-trade-sheet", () => ({
  MemeTradeSheet: (props: {
    token: { symbol: string };
    defaultSide?: string;
    onClose: () => void;
  }) => {
    memeSheetProps.last = props;
    return (
      <div data-testid="meme-sheet">
        <button type="button" onClick={props.onClose}>
          close sheet
        </button>
      </div>
    );
  },
}));

// The spot ticket is its own component with its own suite. Stubbed here so this
// suite tests the hosting: which market it is handed, and the way back.
const ticketProps = vi.hoisted(() => ({ last: null as { market: { symbol: string } } | null }));
vi.mock("@/features/trade/components/spot-ticket", () => ({
  SpotTicket: (props: { market: { symbol: string }; onChangeMarket: () => void }) => {
    ticketProps.last = props;
    return (
      <div data-testid="spot-ticket">
        <button type="button" onClick={props.onChangeMarket}>
          change market
        </button>
      </div>
    );
  },
}));

import { MobileMarketView } from "@/features/trade/components/mobile-market-view";

function market(over: Partial<SpotMarket> = {}): SpotMarket {
  return {
    symbol: "BTC",
    name: "Bitcoin",
    priceUsd: 64072.55,
    change24h: 2.2,
    marketCap: 1e12,
    logo: null,
    coingeckoId: "bitcoin",
    ...over,
  } as SpotMarket;
}

// The stalled bar's copy, not yet in messages/en.json: the locale catalogues
// are edited as one set in their own change. Drop this once they carry
// common.moreStalled, common.moreWaiting and common.moreResume.
const catalogue = {
  ...messages,
  common: {
    ...messages.common,
    moreStalled: "The list is incomplete",
    moreWaiting: "Paused, continuing shortly",
    moreResume: "Load the rest",
  },
};

function renderView() {
  const onOpenDetail = vi.fn();
  const onOpenBuy = vi.fn();
  // The search hook is the real one here, so the tab needs a query client even
  // when no test lets it reach the service.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={catalogue}>
        <MobileMarketView
          onOpenDetail={onOpenDetail}
          onOpenBuy={onOpenBuy}
          rwaSlot={<div data-testid="rwa-panel" />}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(view());
  // Renders again with whatever the mocks hold now, as a hook's new value would.
  return { onOpenDetail, onOpenBuy, rerender: () => rerender(view()) };
}

// The strip this build offers. TABS in the view is still the full catalogue;
// Leverage and Prediction are in HIDDEN_TABS, so they are not dealt.
const tabNames = ["Spot", "Memecoins", "Real assets"];
const [SPOT, MEMES, RWA] = [0, 1, 2];

// Each tab names its own field, so a test says which list it is searching.
// The Real assets and Prediction fields belong to those panels, not to this
// view, so they are asserted in those components' own suites.
const SPOT_SEARCH = "Search markets";
const MEME_SEARCH = "Search all memecoins";

function tabs() {
  return within(screen.getByRole("tablist")).getAllByRole("tab");
}

function marketList(): HTMLElement {
  return screen.getByTestId("spot-market-list");
}

function memeMarketList(): HTMLElement {
  return screen.getByTestId("meme-market-list");
}

// n markets, distinct symbols, so a pagination test can tell page 1 from
// page 2 by which symbols are on screen.
function markets(n: number): SpotMarket[] {
  return Array.from({ length: n }, (_, i) => market({ symbol: `SYM${i}`, name: `Symbol ${i}` }));
}

function memeTokens(n: number): MemeToken[] {
  return Array.from({ length: n }, (_, i) =>
    memeToken({ symbol: `MEME${i}`, name: `Meme ${i}`, address: `0xmeme${i}` })
  );
}

beforeEach(() => {
  spot.markets = [market()];
  spot.loading = false;
  spot.error = null;
  memes.tokens = [];
  memes.allTokens = null;
  memes.total = null;
  memes.loaded = 0;
  memes.shownCount = 0;
  memes.hasMore = false;
  memes.isLoadingMore = false;
  memes.progress.status = "complete";
  memes.progress.retry.mockClear();
  memes.loadMore.mockClear();
  memes.isLoading = false;
  memes.error = null;
  memeSearch.active = false;
  memeSearch.results = [];
  memeSearch.error = null;
  memeSearch.real = false;
  memeSearch.catalogues = [];
  searchTokens.mockClear();
  memeViews.catalog = [];
  memeViews.search = [];
  screener.state = inactiveScreener();
  screener.calls = [];
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
  memeTrade.mockClear();
  memeTicketProps.last = null;
  memeSheetProps.last = null;
  memePreview.state = {
    quote: null,
    expired: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  memePreview.consented = [];
});

describe("MobileMarketView chrome", () => {
  // Gap 3: the strip is a real tab control, not a row of buttons.
  it("renders a labelled tablist of the market categories it offers", () => {
    renderView();
    const strip = screen.getByRole("tablist", { name: "Market categories" });
    const found = within(strip)
      .getAllByRole("tab")
      .map((t) => t.textContent?.trim());
    expect(found).toEqual(tabNames);
  });

  it("marks only the active tab selected and keeps it the sole tab stop", () => {
    renderView();
    const spotTab = tabs()[SPOT];
    const memeTab = tabs()[MEMES];
    expect(spotTab).toHaveAttribute("aria-selected", "true");
    expect(spotTab).toHaveAttribute("tabindex", "0");
    expect(memeTab).toHaveAttribute("aria-selected", "false");
    expect(memeTab).toHaveAttribute("tabindex", "-1");

    fireEvent.click(memeTab);
    expect(tabs()[MEMES]).toHaveAttribute("aria-selected", "true");
    expect(tabs()[MEMES]).toHaveAttribute("tabindex", "0");
    expect(tabs()[SPOT]).toHaveAttribute("tabindex", "-1");
  });

  it("never mounts the perps desk, because the Leverage tab is not offered", () => {
    renderView();
    expect(screen.queryByRole("tab", { name: "Leverage" })).toBeNull();
    expect(screen.queryByTestId("perps-desk")).toBeNull();

    for (const tab of tabs()) {
      fireEvent.click(tab);
      expect(screen.queryByTestId("perps-desk")).toBeNull();
    }
  });

  // An old "Own the Market" link still carries ?tab=perps. It names a tab this
  // build does not offer, so it opens Spot rather than a tab with nothing
  // behind it.
  it("falls back to Spot when the link names a tab that is not offered", () => {
    search.query = "tab=perps";
    try {
      renderView();
      expect(tabs()[SPOT]).toHaveAttribute("aria-selected", "true");
      expect(screen.queryByTestId("perps-desk")).toBeNull();
    } finally {
      search.query = "";
    }
  });

  it("exposes the active panel as a tabpanel named by its tab", () => {
    renderView();
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAccessibleName("Spot");

    fireEvent.click(tabs()[MEMES]);
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Memecoins");
  });

  it("moves selection with arrow keys and Home/End, not with Tab", () => {
    renderView();
    fireEvent.keyDown(tabs()[SPOT], { key: "ArrowRight" });
    expect(tabs()[MEMES]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs()[MEMES], { key: "End" });
    expect(tabs()[RWA]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs()[RWA], { key: "Home" });
    expect(tabs()[SPOT]).toHaveAttribute("aria-selected", "true");

    // Wrapping backwards from the first tab lands on the last OFFERED tab. It
    // used to open Prediction's own route, which this build does not offer.
    fireEvent.keyDown(tabs()[SPOT], { key: "ArrowLeft" });
    expect(tabs()[RWA]).toHaveAttribute("aria-selected", "true");
    expect(router.push).not.toHaveBeenCalledWith("/prediction");
  });

  // Gap 5: the strip scrolls, so a selected tab off-screen must be brought in.
  it("scrolls the newly selected tab into view", () => {
    renderView();
    const scrollIntoView = vi.fn();
    const target = tabs()[RWA];
    target.scrollIntoView = scrollIntoView;
    fireEvent.keyDown(tabs()[SPOT], { key: "End" });
    expect(scrollIntoView).toHaveBeenCalled();
  });

  // One field above the strip could not say which list it filtered, and it was
  // still on screen inside a ticket, where there is no list to filter. Each tab
  // carries its own field now, named for the list under it.
  it("gives the spot and memecoin tabs a search field of their own", () => {
    renderView();
    expect(screen.getByRole("searchbox", { name: SPOT_SEARCH })).toBeEnabled();
    expect(screen.queryByRole("searchbox", { name: MEME_SEARCH })).toBeNull();

    fireEvent.click(tabs()[MEMES]);
    expect(screen.getByRole("searchbox", { name: MEME_SEARCH })).toBeEnabled();
    expect(screen.queryByRole("searchbox", { name: SPOT_SEARCH })).toBeNull();
  });

  // The field scrolls away with the rows rather than holding the top of the
  // screen, so it has to sit inside the list's own scroll box.
  it("puts each field inside the list that scrolls", () => {
    renderView();
    expect(marketList()).toContainElement(screen.getByRole("searchbox", { name: SPOT_SEARCH }));

    fireEvent.click(tabs()[MEMES]);
    expect(memeMarketList()).toContainElement(screen.getByRole("searchbox", { name: MEME_SEARCH }));
  });

  // The other two panels search themselves, so this view draws nothing for
  // them. A disabled field that swallowed what the reader typed is gone.
  it("draws no field of its own for the panels that search themselves", () => {
    renderView();
    fireEvent.click(tabs()[RWA]);
    expect(screen.queryAllByRole("searchbox")).toHaveLength(0);
  });

  // Gap 6: no user-facing literals left in the file.
  it("takes its chrome copy from the catalogue", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: SPOT_SEARCH })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Real assets" })).toBeInTheDocument();
  });

  it("shows the catalogue's empty and error copy for the spot list", () => {
    spot.markets = [];
    spot.error = new Error("down");
    renderView();
    expect(screen.getByText("Markets are unavailable right now.")).toBeInTheDocument();
  });

  it("shows the catalogue's empty and error copy for the memecoin list", () => {
    memes.error = new Error("down");
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.getByText("Memecoin markets are unavailable right now.")).toBeInTheDocument();
  });

  // Each tab holds its own query. The shared field had to be cleared on every
  // category change, since a term typed on Spot would otherwise blank the
  // memecoin list; separate fields cannot do that to each other.
  it("keeps each tab's query to itself", () => {
    spot.markets = [market({ symbol: "BTC" }), market({ symbol: "ETH", name: "Ether" })];
    renderView();
    fireEvent.change(screen.getByRole("searchbox", { name: SPOT_SEARCH }), {
      target: { value: "eth" },
    });
    expect(screen.queryByText("BTC")).toBeNull();

    fireEvent.click(tabs()[MEMES]);
    expect(screen.getByRole("searchbox", { name: MEME_SEARCH })).toHaveValue("");

    fireEvent.click(tabs()[SPOT]);
    expect(screen.getByRole("searchbox", { name: SPOT_SEARCH })).toHaveValue("eth");
    expect(screen.queryByText("BTC")).toBeNull();
  });

  // The Spot tab keeps its token list; a row tap opens the ticket for that one
  // market, the way the Memecoins tab opens its trade sheet.
  it("opens the ticket for the tapped market and puts the list away", () => {
    renderView();
    fireEvent.click(screen.getByText("BTC"));

    expect(screen.getByTestId("spot-ticket")).toBeInTheDocument();
    expect(ticketProps.last?.market.symbol).toBe("BTC");
    expect(marketList()).not.toBeVisible();
  });

  it("comes back to the list from the ticket without leaving the page", () => {
    renderView();
    fireEvent.click(screen.getByText("BTC"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByTestId("spot-ticket")).not.toBeInTheDocument();
    expect(marketList()).toBeVisible();
    expect(router.back).not.toHaveBeenCalled();
  });

  it("comes back to the list from the ticket's own market pill", () => {
    renderView();
    fireEvent.click(screen.getByText("BTC"));
    fireEvent.click(screen.getByRole("button", { name: "change market" }));

    expect(screen.queryByTestId("spot-ticket")).not.toBeInTheDocument();
    expect(marketList()).toBeVisible();
  });

  // The list is not thrown away and rebuilt: whoever was eighty rows down comes
  // back to where they were, not to the top.
  it("keeps the list's scroll position across a trip into the ticket", () => {
    renderView();
    const list = marketList();
    // jsdom does not lay anything out, so scrollTop is a no-op property on it.
    // Standing in a real one makes both the save and the restore observable,
    // and makes an unmounted list fail: the replacement node would not carry it.
    let scrollTop = 0;
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    list.scrollTop = 420;

    fireEvent.click(screen.getByText("BTC"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(marketList()).toBe(list);
    expect(list.scrollTop).toBe(420);
  });

  // A ticket has no list under it to filter, so the field goes away with the
  // list rather than sitting there disabled and taking up the top of a phone.
  it("takes the search field away while the ticket is open", () => {
    renderView();
    expect(screen.getByRole("searchbox", { name: SPOT_SEARCH })).toBeEnabled();

    fireEvent.click(screen.getByText("BTC"));
    expect(screen.queryByRole("searchbox", { name: SPOT_SEARCH })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("searchbox", { name: SPOT_SEARCH })).toBeEnabled();
  });

  it("puts the ticket away when the category changes", () => {
    renderView();
    fireEvent.click(screen.getByText("BTC"));
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(tabs()[SPOT]);

    expect(screen.queryByTestId("spot-ticket")).not.toBeInTheDocument();
    expect(marketList()).toBeVisible();
  });

  // The Real assets tab hosts the desk's own section, composed by the route,
  // and only while its tab is selected.
  it("mounts the real assets slot only on its own tab, in a scroll box", () => {
    renderView();
    expect(screen.queryByTestId("rwa-panel")).not.toBeInTheDocument();

    fireEvent.click(tabs()[RWA]);
    const panel = screen.getByTestId("rwa-panel-scroll");
    expect(panel).toContainElement(screen.getByTestId("rwa-panel"));

    fireEvent.click(tabs()[SPOT]);
    expect(screen.queryByTestId("rwa-panel")).not.toBeInTheDocument();
  });
});

// Prediction has one responsive product shell. The Market strip remains an
// entry point, but no longer mounts the retired phone-only market cards.
describe("MobileMarketView, routing to Prediction", () => {
  // Prediction is in HIDDEN_TABS, so there is no tab to open its route from.
  // The route itself still exists; nothing in this view leads to it.
  it("offers no Prediction tab to route from", () => {
    renderView();
    expect(screen.queryByRole("tab", { name: "Prediction" })).toBeNull();
    expect(router.push).not.toHaveBeenCalledWith("/prediction");
  });

  // A legacy ?tab=prediction URL used to be repaired by redirecting to
  // /prediction. Now that the tab is not offered it falls back to Spot like
  // any other unoffered tab — the reader lands somewhere that works instead of
  // being sent to a section this build does not serve.
  it("opens Spot for a legacy prediction query URL, and redirects nowhere", () => {
    search.query = "tab=prediction";
    try {
      renderView();
      expect(tabs()[SPOT]).toHaveAttribute("aria-selected", "true");
      expect(router.replace).not.toHaveBeenCalledWith("/prediction");
    } finally {
      search.query = "";
    }
  });
});

// Both list tabs fill the device: usePaged shows as many rows as the list box
// measures (useFitRows), then the shared foot pager
// (components/ui/list-pagination.tsx) walks the rest, the shared control. jsdom runs no layout, so the box measures zero and the
// page size falls back to eight, which is the size these cases page through.
describe("MobileMarketView, list pagination", () => {
  // The page label shows in two places at once: the visible pager and an
  // sr-only region that announces a page change to a screen reader. This is the
  // live region, which is unique and always reflects the current page (the
  // visible pager hides itself when there is only one page, the live region
  // does not).
  const liveStatus = () => document.querySelector('[aria-live="polite"].sr-only');

  it("shows only the first page of the spot list, with Prev disabled and Next enabled", () => {
    spot.markets = markets(10);
    renderView();

    expect(screen.getByText("SYM0")).toBeInTheDocument();
    expect(screen.getByText("SYM7")).toBeInTheDocument();
    expect(screen.queryByText("SYM8")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
  });

  it("pages the spot list forward and back, and disables Next on the last page", () => {
    spot.markets = markets(10);
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("SYM8")).toBeInTheDocument();
    expect(screen.getByText("SYM9")).toBeInTheDocument();
    expect(screen.queryByText("SYM0")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");

    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    expect(screen.getByText("SYM0")).toBeInTheDocument();
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
  });

  // A screen reader on the Next button must hear the page change without
  // focus moving off it.
  it("announces the spot list's page change through an aria-live region", () => {
    spot.markets = markets(10);
    renderView();

    const status = liveStatus();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Page 1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");
  });

  // Spot pages with the same shared pill control, not a
  // one-off icon button.
  it("gives the spot list the shared foot pager", () => {
    spot.markets = markets(10);
    renderView();

    expect(screen.getByRole("button", { name: "Prev" }).className).toMatch(/rounded-full/);
    expect(screen.getByRole("button", { name: "Next" }).className).toMatch(/rounded-full/);
  });

  it("resets the spot list to page 1 when a search narrows it", () => {
    spot.markets = markets(10);
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");

    // Narrow to a single match, then clear back to the full list: page 1
    // either way, not the page 2 the reader left. One match fits a single page,
    // so the visible pager hides and only the live region reports it.
    const field = screen.getByRole("searchbox", { name: SPOT_SEARCH });
    fireEvent.change(field, { target: { value: "SYM0" } });
    expect(liveStatus()).toHaveTextContent("Page 1 of 1");
    expect(screen.getByText("SYM0")).toBeInTheDocument();

    fireEvent.change(field, { target: { value: "" } });
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
    expect(screen.getByText("SYM0")).toBeInTheDocument();
  });

  it("shows only the first page of the memecoin list, and pages it the same way", () => {
    memes.tokens = memeTokens(9);
    renderView();
    fireEvent.click(tabs()[MEMES]);

    expect(screen.getByText("MEME0")).toBeInTheDocument();
    expect(screen.queryByText("MEME8")).not.toBeInTheDocument();
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("MEME8")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("resets the memecoin list to page 1 when a search narrows it", () => {
    memes.tokens = memeTokens(9);
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");

    const field = screen.getByRole("searchbox", { name: MEME_SEARCH });
    fireEvent.change(field, { target: { value: "MEME0" } });
    fireEvent.change(field, { target: { value: "" } });
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
  });

  // The catalogue is walked 500 coins a server page and runs past a hundred
  // thousand. The pager is built from the rows in hand, so it has to grow with
  // them and say, while it is growing, that the count is not the whole list.
  it("grows the memecoin page count as the catalogue fills", () => {
    memes.tokens = memeTokens(9);
    memes.hasMore = true;
    const { rerender } = renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");

    memes.tokens = memeTokens(25);
    rerender();
    expect(liveStatus()).toHaveTextContent("Page 1 of 4");
  });

  it("says the memecoin list is still filling rather than letting it look whole", () => {
    // Five coins fit one page, so without this the bar would be hidden
    // altogether over a catalogue that is 0.005% loaded.
    memes.tokens = memeTokens(5);
    memes.hasMore = true;
    memes.progress.status = "walking";
    renderView();
    fireEvent.click(tabs()[MEMES]);

    const list = memeMarketList();
    // The bar is up even though the rows in hand fit one page, and it says why.
    expect(within(list).getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(within(list).getByText("Loading more…")).toBeInTheDocument();
  });

  it("drops the hint once the walk is done", () => {
    memes.tokens = memeTokens(9);
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.queryByText("Loading more…")).toBeNull();
    expect(screen.queryByText("More pages")).toBeNull();
  });

  // A stalled walk is not a loading one. The count is still not final, and the
  // bar now says outright that the list is short rather than claiming rows are
  // on their way when none are.
  it("stops claiming rows are arriving once the walk has stalled", () => {
    memes.tokens = memeTokens(9);
    memes.hasMore = true;
    memes.progress.status = "stalled";
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.queryByText("Loading more…")).toBeNull();
    expect(screen.queryByText("More pages")).toBeNull();
    expect(screen.getByText("The list is incomplete")).toBeInTheDocument();
  });

  it("says nothing about the catalogue behind a search's own results", () => {
    memes.tokens = [];
    memes.hasMore = true;
    memes.progress.status = "walking";
    memeSearch.active = true;
    memeSearch.results = memeTokens(3);
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.queryByText("Loading more…")).toBeNull();
  });
});

// The design replaces the Memecoins tab's tap-to-modal flow with the same
// tap-to-screen pattern the Spot tab uses: the list is hidden, not unmounted,
// and a full-screen ticket takes its place.
describe("MobileMarketView, the memecoin tap-to-screen ticket", () => {
  it("opens a full-screen ticket for the tapped memecoin and puts the list away", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText("PEPE"));

    expect(screen.getByTestId("meme-trade-ticket")).toBeInTheDocument();
    expect(memeTicketProps.last?.token.symbol).toBe("PEPE");
    expect(memeMarketList()).not.toBeVisible();
  });

  // The phone ticket opens on the coin's chart, as the desk's rail does. The
  // chart unmounts when folded, so a closed row resolves and draws nothing.
  it("opens the ticket on the coin's chart, and folds it away on request", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText("PEPE"));

    const close = screen.getByRole("button", { name: "Close Chart" });
    expect(close).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector('[data-region="meme-chart"]')).not.toBeNull();

    fireEvent.click(close);
    expect(screen.getByRole("button", { name: "View Chart" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(document.querySelector('[data-region="meme-chart"]')).toBeNull();
  });

  it("comes back to the memecoin list from the ticket without leaving the page", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText("PEPE"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByTestId("meme-trade-ticket")).not.toBeInTheDocument();
    expect(memeMarketList()).toBeVisible();
    expect(router.back).not.toHaveBeenCalled();
  });

  // The list is not thrown away and rebuilt: whoever was scrolled down comes
  // back to where they were, not to the top. Same technique as the Spot tab's
  // own ticket, proven the same way: a real scrollTop, not jsdom's no-op.
  it("keeps the memecoin list's scroll position across a trip into the ticket", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    const list = memeMarketList();
    let scrollTop = 0;
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    list.scrollTop = 260;

    fireEvent.click(screen.getByText("PEPE"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(memeMarketList()).toBe(list);
    expect(list.scrollTop).toBe(260);
  });

  // Tapping the row opens the full-screen ticket, not the old overlay: the
  // sheet only ever appears from a submit inside the ticket (see the tests
  // below), never from the tap that used to open it directly.
  it("does not open the trade sheet from the row tap alone", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText("PEPE"));

    expect(screen.queryByTestId("meme-sheet")).not.toBeInTheDocument();
  });

  // Base executes inline through useMemeTrade().trade(), the same as before:
  // no sheet involved.
  it("executes a Base memecoin order inline on submit, without opening the sheet", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe", chainId: 8453 })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText("PEPE"));
    fireEvent.click(screen.getByRole("button", { name: "submit trade" }));

    expect(memeTrade).toHaveBeenCalledWith(
      expect.objectContaining({ tokenAddress: "0xpepe", chainId: 8453 })
    );
    expect(screen.queryByTestId("meme-sheet")).not.toBeInTheDocument();
  });

  // A Solana order needs the sheet's own pre-buy funding move and sale
  // settlement handoff (meme-board.tsx makes the same split for the same
  // reason), so submitting one hands it off rather than running it here.
  it("hands a Solana memecoin order to the trade sheet on submit, instead of running it inline", () => {
    memes.tokens = [memeToken({ symbol: "WIF", name: "dogwifhat", chainId: SOLANA_CHAIN_ID })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText("WIF"));
    fireEvent.click(screen.getByRole("button", { name: "submit trade" }));

    expect(memeTrade).not.toHaveBeenCalled();
    expect(screen.getByTestId("meme-sheet")).toBeInTheDocument();
    expect(memeSheetProps.last?.token.symbol).toBe("WIF");
    expect(memeSheetProps.last?.defaultSide).toBe("BUY");
  });

  // Closing the sheet clears the hand-off without also leaving the ticket:
  // the reader is still on the coin they were trading, not bounced to the list.
  it("closes the trade sheet back to the ticket, not out to the list", () => {
    memes.tokens = [memeToken({ symbol: "WIF", name: "dogwifhat", chainId: SOLANA_CHAIN_ID })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText("WIF"));
    fireEvent.click(screen.getByRole("button", { name: "submit trade" }));
    fireEvent.click(screen.getByRole("button", { name: "close sheet" }));

    expect(screen.queryByTestId("meme-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("meme-trade-ticket")).toBeInTheDocument();
    expect(memeMarketList()).not.toBeVisible();
  });

  it("puts the memecoin ticket away when the category changes", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText("PEPE"));
    fireEvent.click(tabs()[SPOT]);
    fireEvent.click(tabs()[MEMES]);

    expect(screen.queryByTestId("meme-trade-ticket")).not.toBeInTheDocument();
    expect(memeMarketList()).toBeVisible();
  });

  it("takes the search field away while the memecoin ticket is open", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.getByRole("searchbox", { name: MEME_SEARCH })).toBeEnabled();

    fireEvent.click(screen.getByText("PEPE"));
    expect(screen.queryByRole("searchbox", { name: MEME_SEARCH })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("searchbox", { name: MEME_SEARCH })).toBeEnabled();
  });
});

describe("MobileMarketView, the memecoin catalogue", () => {
  const switchGroup = () => screen.getByRole("group", { name: "Which memecoins to list" });

  it("opens on All, and Curated narrows the catalogue and the search", () => {
    memes.tokens = [memeToken({ symbol: "SAFE", name: "Safe" })];
    memes.allTokens = [
      memeToken({ symbol: "SAFE", name: "Safe" }),
      memeToken({ symbol: "WILD", name: "Wild", riskLevel: "HIGH" }),
    ];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(memeViews.catalog.at(-1)).toBe("all");
    expect(screen.getByText("WILD")).toBeInTheDocument();

    fireEvent.click(within(switchGroup()).getByRole("button", { name: "Curated" }));
    expect(screen.queryByText("WILD")).toBeNull();
    expect(memeViews.catalog.at(-1)).toBe("curated");
    expect(memeViews.search.at(-1)).toBe("curated");
  });

  it("lists the catalogue without reporting how much of it has loaded", () => {
    memes.tokens = memeTokens(3);
    memes.total = 11_502;
    memes.loaded = 500;
    memes.shownCount = 156;
    memes.hasMore = true;
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(within(memeMarketList()).queryByText("500 of 11,502")).toBeNull();
    expect(within(memeMarketList()).queryByText("156 shown")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(memeMarketList().querySelector('[data-region="catalog-status"]')).toBeNull();
    expect(memes.loadMore).not.toHaveBeenCalled();
  });

  it("lists search results in place of the catalogue", () => {
    memes.tokens = [memeToken({ symbol: "ONPAGE", name: "On page" })];
    memes.total = 11_502;
    memes.loaded = 500;
    memes.hasMore = true;
    memeSearch.active = true;
    memeSearch.results = [memeToken({ symbol: "FOUND", name: "Found" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.getByText("FOUND")).toBeInTheDocument();
    expect(screen.queryByText("ONPAGE")).toBeNull();
    expect(screen.queryByText("500 of 11,502")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  // A token is chainId + address. The same address on two chains is two coins,
  // and tapping one must open that one, not whichever the list found first.
  it("opens the coin that was tapped when two chains share its address", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    memes.tokens = [
      memeToken({ symbol: "BTWIN", name: "Base twin", address: "0xsame", chainId: 8453 }),
      memeToken({
        symbol: "STWIN",
        name: "Solana twin",
        address: "0xsame",
        chainId: SOLANA_CHAIN_ID,
      }),
    ];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.getByText("BTWIN")).toBeInTheDocument();
    expect(screen.getByText("STWIN")).toBeInTheDocument();
    fireEvent.click(screen.getByText("STWIN"));
    expect(memeTicketProps.last?.token.symbol).toBe("STWIN");
    expect(memeTicketProps.last?.token.chainId).toBe(SOLANA_CHAIN_ID);
    const keyWarnings = error.mock.calls.filter((call) =>
      call.some((part) => typeof part === "string" && part.includes("same key"))
    );
    expect(keyWarnings).toEqual([]);
    error.mockRestore();
  });
});

// The phone ticket against the trade contract: it is handed the live quote and
// told when that quote lapsed, and a LOW_LIQUIDITY coin is confirmed before any
// preview goes out. The ticket's own rendering of all of it (fee row, risk,
// warnings, lapsed line) is pinned in meme-trade-ticket.test.tsx.
describe("MobileMarketView, the memecoin ticket against the trade contract", () => {
  const LOW = { code: "LOW_LIQUIDITY", message: "Liquidity is below $50,000." };

  function openTicket(token: MemeToken) {
    memes.tokens = [token];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByText(token.symbol ?? ""));
  }

  it("hands the ticket the live quote", () => {
    const quote = { platformFeeAmountFormatted: "0.025" };
    memePreview.state.quote = quote;
    openTicket(memeToken({ symbol: "PEPE", name: "Pepe" }));
    expect(memeTicketProps.last?.preview).toBe(quote);
  });

  it("tells the ticket a lapsed quote lapsed, with the way to a fresh one", () => {
    memePreview.state.expired = true;
    openTicket(memeToken({ symbol: "PEPE", name: "Pepe" }));
    expect(memeTicketProps.last?.preview).toBeNull();
    expect(memeTicketProps.last?.quoteExpired).toBe(true);
    act(() => memeTicketProps.last?.onRefreshQuote?.());
    expect(memePreview.state.refetch).toHaveBeenCalled();
  });

  it("holds the preview for a LOW_LIQUIDITY coin until the consent is accepted", () => {
    // Before a coin is opened there is nothing to consent to; count from here.
    memes.tokens = [memeToken({ symbol: "THINPHONE", name: "Thin", warnings: [LOW] })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    const fromTicket = memePreview.consented.length;
    fireEvent.click(screen.getByText("THINPHONE"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    act(() => memeTicketProps.last?.onAmountChange("5"));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(LOW.message)).toBeInTheDocument();
    const whileOpen = memePreview.consented.slice(fromTicket);
    expect(whileOpen.length).toBeGreaterThan(0);
    expect(whileOpen.every((c) => c === false)).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "I understand, continue" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(memePreview.consented.at(-1)).toBe(true);
  });

  it("cancels the consent by clearing the amount", () => {
    openTicket(memeToken({ symbol: "THINPHONE2", name: "Thin 2", warnings: [LOW] }));
    act(() => memeTicketProps.last?.onAmountChange("5"));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" })
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(memeTicketProps.last?.amount).toBe("");
    expect(memePreview.consented.at(-1)).toBe(false);
  });

  it("never asks for a coin without the warning", () => {
    openTicket(memeToken({ symbol: "PEPE", name: "Pepe" }));
    act(() => memeTicketProps.last?.onAmountChange("5"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(memePreview.consented.every((c) => c === true)).toBe(true);
  });
});

// The phone Memecoins tab carries the desk's Trending strip and screener
// (ADR-2026-09-15-meme-trending-screener, 1.1): search, the view switch, the
// strip, the toolbar, then the list, all in the list's own scroll box. The
// list reads search results first, then the screener, then the catalogue.
describe("MobileMarketView, the memecoin Trending strip and screener", () => {
  function state() {
    if (screener.state === null) throw new Error("The screener mock was not reset.");
    return screener.state;
  }

  function region(name: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-region="${name}"]`);
  }

  function rowFor(symbol: string): HTMLElement {
    const row = screen.getByText(symbol).closest("button");
    if (row === null) throw new Error(`No row for ${symbol}.`);
    return row;
  }

  const before = (a: Node, b: Node) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("asks the controller for the phone's trending page in the tab's view", () => {
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screener.calls.at(-1)).toEqual({ view: "all", trendingPageSize: 3, enabled: true });

    fireEvent.click(
      within(screen.getByRole("group", { name: "Which memecoins to list" })).getByRole("button", {
        name: "All",
      })
    );
    expect(screener.calls.at(-1)).toEqual({ view: "all", trendingPageSize: 3, enabled: true });
  });

  it("keeps the screener from asking for data while another tab is open", () => {
    renderView();
    expect(screener.calls.at(-1)?.enabled).toBe(false);
    fireEvent.click(tabs()[MEMES]);
    expect(screener.calls.at(-1)?.enabled).toBe(true);
  });

  it("puts the strip and the toolbar between the view switch and the rows, only on this tab", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe" })];
    renderView();
    expect(region("trending")).toBeNull();
    expect(region("screener-toolbar")).toBeNull();

    fireEvent.click(tabs()[MEMES]);
    const list = memeMarketList();
    const strip = region("trending");
    const toolbar = region("screener-toolbar");
    if (strip === null || toolbar === null) throw new Error("The strip or toolbar is missing.");
    expect(list).toContainElement(strip);
    expect(list).toContainElement(toolbar);

    const field = screen.getByRole("searchbox", { name: MEME_SEARCH });
    const switcher = screen.getByRole("group", { name: "Which memecoins to list" });
    expect(before(field, switcher)).toBe(true);
    expect(before(switcher, strip)).toBe(true);
    expect(before(strip, toolbar)).toBe(true);
    expect(before(toolbar, rowFor("PEPE"))).toBe(true);
    expect(within(toolbar).getByRole("group", { name: "Time window" })).toBeInTheDocument();

    fireEvent.click(tabs()[SPOT]);
    expect(region("trending")).toBeNull();
    expect(region("screener-toolbar")).toBeNull();
  });

  it("shows the trending page's cards, ranked on from earlier pages", () => {
    const coins = memeTokens(7);
    state().trending.tokens = coins;
    // Page 2 of a three-a-page phone grid: the fourth coin onwards.
    state().trending.pageTokens = coins.slice(3, 6);
    state().trending.page = 2;
    state().trending.pages = 3;
    renderView();
    fireEvent.click(tabs()[MEMES]);

    const strip = region("trending");
    if (strip === null) throw new Error("The strip is missing.");
    expect(within(strip).getByRole("button", { name: /^MEME3, rank 4,/ })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: /^MEME5, rank 6,/ })).toBeInTheDocument();
    expect(within(strip).queryByRole("button", { name: /^MEME0,/ })).toBeNull();

    fireEvent.click(within(strip).getByRole("button", { name: "Previous trending page" }));
    expect(state().trending.setPage).toHaveBeenCalledWith(1);
  });

  // Trending's refresh reloads the page. The phone holds the same two cached
  // reads the desk does, the board and the catalogue, so refreshing one would
  // leave the other stale; the view hands the strip no refetch at all. The
  // press reaches window.location.reload, which makes jsdom log "Not
  // implemented: navigation": that log is the proof the real path ran. The
  // reload itself is covered in the strip's own suite.
  it("reloads the page from Trending's refresh rather than reading the board again", () => {
    renderView();
    fireEvent.click(tabs()[MEMES]);
    const strip = region("trending");
    if (strip === null) throw new Error("The strip is missing.");
    fireEvent.click(within(strip).getByRole("button", { name: "Refresh trending" }));
    expect(state().refreshTrending).not.toHaveBeenCalled();
    // Held down and spinning until the document is replaced, so the press does
    // not read as one that did nothing.
    expect(within(strip).getByRole("button", { name: "Refreshing trending" })).toBeDisabled();
  });

  it("draws the strip's skeletons while trending loads", () => {
    state().trending.isLoading = true;
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(document.querySelectorAll('[data-skeleton="trending-card"]')).toHaveLength(3);
  });

  it("opens the meme ticket for a tapped trending card, as a row does", () => {
    const hot = memeToken({ symbol: "HOT", name: "Hot", address: "0xhot" });
    state().trending.tokens = [hot];
    state().trending.pageTokens = [hot];
    renderView();
    fireEvent.click(tabs()[MEMES]);

    fireEvent.click(screen.getByRole("button", { name: /^HOT, rank 1,/ }));
    expect(screen.getByTestId("meme-trade-ticket")).toBeInTheDocument();
    expect(memeTicketProps.last?.token.symbol).toBe("HOT");
    expect(memeMarketList()).not.toBeVisible();
  });

  it("lists the screener's rows while it is active", () => {
    memes.tokens = [memeToken({ symbol: "CATALOG", name: "Catalogue" })];
    memes.total = 11_502;
    memes.loaded = 500;
    memes.shownCount = 156;
    const s = state();
    s.active = true;
    s.count = 1;
    s.filters = { bounds: { marketCap: { max: "1000000" } }, sort: null };
    s.list.tokens = [memeToken({ symbol: "SCREENED", name: "Screened" })];
    s.list.total = 40;
    s.list.loaded = 40;
    s.list.shownCount = 38;
    s.list.hasMore = true;
    renderView();
    fireEvent.click(tabs()[MEMES]);

    expect(screen.getByText("SCREENED")).toBeInTheDocument();
    expect(screen.queryByText("CATALOG")).toBeNull();
    expect(memeMarketList().querySelector('[data-region="catalog-status"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(s.list.loadMore).not.toHaveBeenCalled();
    expect(memes.loadMore).not.toHaveBeenCalled();
  });

  it("shows the screener's loading, empty and error states rather than the catalogue's", () => {
    memes.tokens = [memeToken({ symbol: "CATALOG", name: "Catalogue" })];
    const s = state();
    s.active = true;
    s.filters = { bounds: {}, sort: { by: "volume", order: "desc" } };
    s.list.isLoading = true;
    const { rerender } = renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.queryByText("CATALOG")).toBeNull();
    expect(memeMarketList().querySelectorAll(".animate-pulse.rounded-full.size-9")).toHaveLength(6);

    s.list.isLoading = false;
    rerender();
    expect(
      screen.getByText("No coins match these filters. Try widening a range.")
    ).toBeInTheDocument();

    s.list.error = new Error("scan timed out");
    rerender();
    expect(screen.getByText("These coins can't be filtered right now.")).toBeInTheDocument();
    expect(screen.queryByText("No coins match these filters. Try widening a range.")).toBeNull();
  });

  it("returns the list to page 1 when the applied filters change", () => {
    const s = state();
    s.active = true;
    s.filters = { bounds: {}, sort: { by: "liquidity", order: "desc" } };
    s.listQuery = "sortBy=liquidity&sortOrder=desc";
    s.resetKey = s.listQuery;
    s.list.tokens = memeTokens(9);
    const { rerender } = renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const liveStatus = () => memeMarketList().querySelector('[aria-live="polite"].sr-only');
    expect(liveStatus()).toHaveTextContent("Page 2 of 2");

    s.filters = { bounds: {}, sort: { by: "liquidity", order: "asc" } };
    s.listQuery = "sortBy=liquidity&sortOrder=asc";
    s.resetKey = s.listQuery;
    rerender();
    expect(liveStatus()).toHaveTextContent("Page 1 of 2");
  });

  it("lets a search take the list over while the screener waits, with Trending still showing", () => {
    const hot = memeToken({ symbol: "HOT", name: "Hot", address: "0xhot" });
    const s = state();
    s.active = true;
    s.count = 1;
    s.filters = { bounds: { liquidity: { min: "100000" } }, sort: null };
    s.list.tokens = [memeToken({ symbol: "SCREENED", name: "Screened" })];
    s.list.total = 40;
    s.list.loaded = 40;
    s.trending.tokens = [hot];
    s.trending.pageTokens = [hot];
    memeSearch.active = true;
    memeSearch.results = [memeToken({ symbol: "FOUND", name: "Found" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);

    expect(screen.getByText("FOUND")).toBeInTheDocument();
    expect(screen.queryByText("SCREENED")).toBeNull();
    expect(screen.queryByText("40 of 40")).toBeNull();
    expect(screen.getByText("Filters are paused while you search.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^HOT, rank 1,/ })).toBeInTheDocument();
  });

  it("does not say the filters are paused when nothing is being searched", () => {
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(screen.queryByText("Filters are paused while you search.")).toBeNull();
  });

  it("reads each row's change over the selected window, with a bar under it", () => {
    state().timeframe = "1h";
    memes.tokens = [
      memeToken({
        symbol: "MOVER",
        name: "Mover",
        priceChange24hPercent: "4.2",
        activity: {
          "1h": { volumeUsd: null, transactions: null, traders: null, priceChangePercent: "12.34" },
        },
      }),
      memeToken({
        symbol: "QUIET",
        name: "Quiet",
        address: "0xquiet",
        priceChange24hPercent: "4.2",
      }),
    ];
    renderView();
    fireEvent.click(tabs()[MEMES]);

    const mover = rowFor("MOVER");
    expect(within(mover).getByText("+12.34%")).toBeInTheDocument();
    expect(within(mover).queryByText("+4.20%")).toBeNull();
    const bar = mover.querySelector<HTMLElement>('[aria-hidden="true"] > .bg-up');
    expect(bar?.style.width).toBe("12%");

    // No 1h reading is not the 24h one: it stays pending, and draws no bar.
    const quiet = rowFor("QUIET");
    expect(within(quiet).getByText("—")).toBeInTheDocument();
    expect(within(quiet).queryByText("+4.20%")).toBeNull();
    expect(quiet.querySelector(".bg-up, .bg-down")).toBeNull();
  });

  it("keeps the 24h change the rows showed before the screener, at 24h", () => {
    memes.tokens = [memeToken({ symbol: "PEPE", name: "Pepe", priceChange24hPercent: "-3.5" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(within(rowFor("PEPE")).getByText("-3.50%")).toBeInTheDocument();
  });

  it("adds the sorted metric to the name line for a volume sort", () => {
    const s = state();
    s.active = true;
    s.filters = { bounds: {}, sort: { by: "volume", order: "desc" } };
    s.list.tokens = [memeToken({ symbol: "BUSY", name: "Busy coin", volume24hUsd: "1250000" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);

    const metric = rowFor("BUSY").querySelector('[data-row-metric="volume"]');
    expect(metric).toHaveTextContent("$1.25M");
    expect(within(rowFor("BUSY")).getByText("Busy coin")).toBeInTheDocument();
  });

  // Search results are not in the sort's order, so the figure would explain
  // nothing there.
  it("leaves the sorted metric off search results", () => {
    const s = state();
    s.active = true;
    s.filters = { bounds: {}, sort: { by: "volume", order: "desc" } };
    memeSearch.active = true;
    memeSearch.results = [memeToken({ symbol: "FOUND", name: "Found", volume24hUsd: "900" })];
    renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(rowFor("FOUND").querySelector("[data-row-metric]")).toBeNull();
  });

  it("reads an age sort against the clock", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    try {
      const s = state();
      s.active = true;
      s.filters = { bounds: {}, sort: { by: "age", order: "asc" } };
      s.list.tokens = [
        memeToken({ symbol: "YOUNG", name: "Young", pairCreatedAt: "2026-09-15T10:30:00Z" }),
      ];
      renderView();
      fireEvent.click(tabs()[MEMES]);
      expect(rowFor("YOUNG").querySelector('[data-row-metric="age"]')).toHaveTextContent("1h");
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds nothing to the name line for a price or market cap sort, which the row already shows", () => {
    const s = state();
    s.active = true;
    s.filters = { bounds: {}, sort: { by: "price", order: "desc" } };
    s.list.tokens = [memeToken({ symbol: "PRICEY", name: "Pricey" })];
    const { rerender } = renderView();
    fireEvent.click(tabs()[MEMES]);
    expect(rowFor("PRICEY").querySelector("[data-row-metric]")).toBeNull();

    s.filters = { bounds: {}, sort: { by: "marketCap", order: "desc" } };
    rerender();
    expect(rowFor("PRICEY").querySelector("[data-row-metric]")).toBeNull();
  });

  it("marks the top three gainers of the visible page", () => {
    memes.tokens = [
      memeToken({ symbol: "UP10", name: "a", address: "0x1", priceChange24hPercent: "10" }),
      memeToken({ symbol: "UP50", name: "b", address: "0x2", priceChange24hPercent: "50" }),
      memeToken({ symbol: "DOWN", name: "c", address: "0x3", priceChange24hPercent: "-5" }),
      memeToken({ symbol: "UP20", name: "d", address: "0x4", priceChange24hPercent: "20" }),
      memeToken({ symbol: "UP1", name: "e", address: "0x5", priceChange24hPercent: "1" }),
    ];
    renderView();
    fireEvent.click(tabs()[MEMES]);

    const flame = (symbol: string) =>
      within(rowFor(symbol)).queryByRole("img", { name: "Top gainer on this page" });
    expect(flame("UP50")).toBeInTheDocument();
    expect(flame("UP20")).toBeInTheDocument();
    expect(flame("UP10")).toBeInTheDocument();
    expect(flame("UP1")).toBeNull();
    expect(flame("DOWN")).toBeNull();
  });

  it("keeps a ticket opened from Trending on the fresher trending copy", () => {
    const hot = memeToken({ symbol: "HOT", name: "Hot", address: "0xhot", priceUsd: "1.11" });
    const s = state();
    s.trending.tokens = [hot];
    s.trending.pageTokens = [hot];
    const { rerender } = renderView();
    fireEvent.click(tabs()[MEMES]);
    fireEvent.click(screen.getByRole("button", { name: /^HOT, rank 1,/ }));
    expect(memeTicketProps.last?.token).toBe(hot);

    const fresher = { ...hot, priceUsd: "2.22" };
    s.trending.tokens = [fresher];
    s.trending.pageTokens = [fresher];
    rerender();
    expect(memeTicketProps.last?.token).toBe(fresher);
  });
});

// The phone's search box is wired to the cached catalogue, as the desk's is.
// The service matches a name or a symbol; a reader has a contract address, a
// market cap or a launch time, and those are answered from the rows the tab
// already holds.
describe("MobileMarketView, searching the Memecoins tab", () => {
  const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

  const sol = memeToken({
    symbol: "SOLCOIN",
    name: "Sol coin",
    chainId: SOLANA_CHAIN_ID,
    address: MINT,
    marketCapUsd: "1530000",
    pairCreatedAt: minutesAgo(3 * 1440 + 1),
  });
  const bse = memeToken({
    symbol: "BSECOIN",
    name: "Base coin",
    chainId: 8453,
    address: "0xFeEdFaCe00000000000000000000000000001111",
    marketCapUsd: "880000",
    pairCreatedAt: minutesAgo(400),
  });

  function openTab() {
    renderView();
    fireEvent.click(tabs()[MEMES]);
  }

  function type(text: string) {
    fireEvent.change(screen.getByLabelText(MEME_SEARCH), { target: { value: text } });
  }

  const listedSymbols = () =>
    [sol.symbol, bse.symbol].filter(
      (symbol) => within(memeMarketList()).queryByText(symbol as string) !== null
    );

  beforeEach(() => {
    memeSearch.real = true;
    memes.tokens = [sol, bse];
  });

  it("hands the search hook the cached catalogue", () => {
    openTab();
    expect(memeSearch.catalogues.at(-1)).toBe(memes.tokens);
  });

  it("shows the whole catalogue while nothing is typed", () => {
    openTab();
    expect(listedSymbols()).toEqual(["SOLCOIN", "BSECOIN"]);
    // And typing, then clearing, puts the list back rather than emptying it.
    type("SOLCOIN");
    expect(listedSymbols()).toEqual(["SOLCOIN"]);
    type("");
    expect(listedSymbols()).toEqual(["SOLCOIN", "BSECOIN"]);
  });

  it("finds a coin by its contract address", () => {
    openTab();
    type(MINT.slice(0, 12));
    expect(listedSymbols()).toEqual(["SOLCOIN"]);
    // Well inside the debounce, so the cache answered and the service was not
    // asked at all.
    expect(searchTokens).not.toHaveBeenCalled();
  });

  it("finds a coin by its market cap", () => {
    openTab();
    type("$1.5M");
    expect(listedSymbols()).toEqual(["SOLCOIN"]);
  });

  it("finds a coin by its age", () => {
    openTab();
    type("3d");
    expect(listedSymbols()).toEqual(["SOLCOIN"]);
    type("6h");
    expect(listedSymbols()).toEqual(["BSECOIN"]);
  });
});

// The walk gives up after a run of refusals and nothing restarted it, so the
// tab held part of the catalogue, said nothing, and read as a finished list.
// This is the way out of that state, and the only one the reader has.
describe("MobileMarketView when the catalogue walk has given up", () => {
  function openMemes() {
    renderView();
    fireEvent.click(tabs()[MEMES]);
    return memeMarketList();
  }

  it("offers the way on, and pressing it restarts the walk", () => {
    memes.tokens = memeTokens(9);
    memes.hasMore = true;
    memes.progress.status = "stalled";
    const list = openMemes();
    fireEvent.click(within(list).getByRole("button", { name: "Load the rest" }));
    expect(memes.progress.retry).toHaveBeenCalledOnce();
  });

  // The rule on this surface: it never says how much of the catalogue is held.
  // Being honest that the list is short does not need a figure.
  it("says the list is short without reporting a count", () => {
    memes.tokens = memeTokens(9);
    memes.hasMore = true;
    memes.progress.status = "stalled";
    const list = openMemes();
    expect(within(list).getByText("The list is incomplete").textContent).not.toMatch(/\d/);
    expect(list.querySelector('[data-region="catalog-status"]')).toBeNull();
  });

  it("is absent while the walk is still going", () => {
    memes.tokens = memeTokens(9);
    memes.hasMore = true;
    memes.progress.status = "walking";
    const list = openMemes();
    expect(within(list).queryByRole("button", { name: "Load the rest" })).toBeNull();
  });

  // Rate limited waits it out and resumes itself, so the bar says so and asks
  // for nothing: a press here would be wasted.
  it("is absent while the walk is only rate limited, which says it will resume", () => {
    memes.tokens = memeTokens(9);
    memes.hasMore = true;
    memes.progress.status = "rate-limited";
    const list = openMemes();
    expect(within(list).queryByRole("button", { name: "Load the rest" })).toBeNull();
    expect(within(list).getByText("Paused, continuing shortly")).toBeInTheDocument();
  });

  it("is absent once the catalogue is whole", () => {
    memes.tokens = memeTokens(25);
    const list = openMemes();
    expect(within(list).queryByRole("button", { name: "Load the rest" })).toBeNull();
  });

  // A search is its own finished list. The catalogue behind it may be stalled,
  // but these rows are not the ones missing anything.
  it("is absent over a search's own results", () => {
    memes.tokens = memeTokens(9);
    memes.hasMore = true;
    memes.progress.status = "stalled";
    memeSearch.active = true;
    memeSearch.results = memeTokens(9);
    const list = openMemes();
    expect(within(list).queryByRole("button", { name: "Load the rest" })).toBeNull();
  });
});
