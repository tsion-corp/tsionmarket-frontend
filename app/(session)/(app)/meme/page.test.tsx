import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import { TradeApiError, type MemeToken, type SwapPreview } from "@/lib/meme/api";

// The desk is the whole memecoin route on a desktop, so this covers the wiring
// the route owns: which coin the rail is trading, which side the ticket is on,
// what the disclosures mount, and what the metrics panel is handed for the two
// figures the service does not publish.

const catalog = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  // What the All view keeps, when a test gives the two views different rows.
  allTokens: null as MemeToken[] | null,
  total: null as number | null,
  loaded: 0,
  shownCount: 0,
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
  isLoading: false,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
// The view each hook was last asked for.
const views = vi.hoisted(() => ({ catalog: [] as unknown[], search: [] as unknown[] }));
const search = vi.hoisted(() => ({
  results: [] as MemeToken[],
  searching: false,
  active: false,
  error: null as unknown,
}));
// The desk re-reads the selected coin before trading on it, as the sheet does.
const fresh = vi.hoisted(() => ({
  token: null as MemeToken | null,
  identities: [] as ({ address: string; chainId: number } | null)[],
}));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeCatalog: (opts?: { view?: string }) => {
    views.catalog.push(opts?.view);
    return opts?.view === "all" && catalog.allTokens
      ? { ...catalog, tokens: catalog.allTokens }
      : catalog;
  },
  useMemeSearch: (_raw: string, view?: string) => {
    views.search.push(view);
    return search;
  },
  useMemeToken: (identity: { address: string; chainId: number } | null) => {
    fresh.identities.push(identity);
    return { token: fresh.token, isLoading: false, unavailable: null };
  },
}));

// The screener controller. Inactive by default, so the desk reads the
// catalogue exactly as it did before the screener existed.
const screenerList = vi.hoisted(() => ({
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
}));
const screener = vi.hoisted(() => ({
  active: false,
  resetKey: "",
  timeframe: "24h" as "5m" | "1h" | "6h" | "12h" | "24h",
  sort: null as { by: "volume" | "price"; order: "asc" | "desc" } | null,
  trending: [] as MemeToken[],
  calls: [] as unknown[],
}));
vi.mock("@/features/trade/hooks/use-meme-screener", () => ({
  useMemeScreener: (opts: unknown) => {
    screener.calls.push(opts);
    return {
      timeframe: screener.timeframe,
      setTimeframe: vi.fn(),
      filters: { bounds: {}, sort: screener.sort },
      active: screener.active,
      count: screener.sort === null ? 0 : 1,
      preset: null,
      apply: vi.fn(),
      setSort: vi.fn(),
      applyPreset: vi.fn(),
      clearBound: vi.fn(),
      clearAll: vi.fn(),
      listQuery: screener.resetKey,
      list: screenerList,
      trending: {
        tokens: screener.trending,
        pageTokens: screener.trending,
        page: 1,
        pages: 1,
        setPage: vi.fn(),
        filtered: false,
        isLoading: false,
        isFetching: false,
        error: null,
        refetch: vi.fn(),
      },
      resetKey: screener.resetKey,
    };
  },
}));

const trade = vi.hoisted(() => vi.fn());
const linkForPreview = vi.hoisted(() => vi.fn(async () => {}));
// What useMemePreview hands back, and what each render asked it: the input and
// whether the risk consent let a preview go out.
const preview = vi.hoisted(() => ({
  state: {
    quote: null as unknown,
    expired: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  calls: [] as { input: unknown; consented: boolean }[],
}));
vi.mock("@/features/trade/hooks/use-meme-trade", async (importOriginal) => ({
  // The surfaces also read pure helpers (memeOutcomeToast, usePreviewRelink)
  // off this module.
  ...(await importOriginal<typeof import("@/features/trade/hooks/use-meme-trade")>()),
  useMemeTrade: () => ({
    walletFor: () => "0xwallet",
    phase: "idle",
    error: null,
    trade,
    linkForPreview,
  }),
  useMemePreview: (input: unknown, consented: boolean) => {
    preview.calls.push({ input, consented });
    return preview.state;
  },
}));

vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [
      {
        network: "base-mainnet",
        symbol: "USDC",
        address: "0xusdc",
        balance: 250,
        rawBalance: "250000000",
        decimals: 6,
      },
      {
        network: "base-mainnet",
        symbol: "AAA",
        address: "0xaaa",
        // Past 2^53 base units on purpose: the sell ticket must read the
        // string, not a float.
        balance: 12345.6789,
        rawBalance: "12345678900000000000000",
        decimals: 18,
      },
    ],
    refetchUntilChanged: vi.fn(),
    refetchFresh: vi.fn(),
  }),
}));

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => viewport.mobile }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/hooks/use-coingecko-id", () => ({
  useCoingeckoId: () => ({ id: null, loading: false }),
}));
vi.mock("@/features/trade/components/meme-settlement-tracker", () => ({
  MemeSettlementTracker: () => null,
}));
vi.mock("@/features/trade/components/meme-trade-sheet", () => ({
  MemeTradeSheet: () => <div>trade sheet</div>,
}));

import MemePage from "@/app/(session)/(app)/meme/page";

const aaa = memeToken({ symbol: "AAA" });
const bbb = memeToken({
  symbol: "BBB",
  // The service publishes no figures for this one. compactUsd would turn each
  // of these into an em dash, which reads as a value.
  marketCapUsd: null,
  volume24hUsd: null,
  liquidityUsd: null,
});

function renderDesk() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemePage />
    </NextIntlClientProvider>
  );
}

function swapPreview(overrides: Partial<SwapPreview> = {}): SwapPreview {
  return {
    side: "BUY",
    chainId: 8453,
    walletAddress: "0xwallet",
    sellToken: { address: "0xusdc", symbol: "USDC" },
    buyToken: { address: "0xaaa", symbol: "AAA" },
    sellAmountAtomic: "5000000",
    sellAmountFormatted: "5",
    expectedBuyAmountAtomic: "4065000000000000000",
    expectedBuyAmountFormatted: "4.065",
    minimumBuyAmountAtomic: "3983000000000000000",
    minimumBuyAmountFormatted: "3.983",
    priceImpactBps: 20,
    slippageBps: 100,
    platformFeeAmountAtomic: "25000",
    platformFeeAmountFormatted: "0.025",
    riskLevel: "LOW",
    warnings: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

const LOW = {
  code: "LOW_LIQUIDITY",
  message: "Liquidity is below $50,000. Proceed at your own risk.",
};
const lastConsented = () => preview.calls.at(-1)?.consented;

beforeEach(() => {
  preview.state = {
    quote: null,
    expired: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  preview.calls = [];
  fresh.token = null;
  fresh.identities = [];
  linkForPreview.mockClear();
  catalog.tokens = [aaa, bbb];
  catalog.allTokens = null;
  catalog.total = null;
  catalog.loaded = 0;
  catalog.shownCount = 0;
  catalog.hasMore = false;
  catalog.isLoadingMore = false;
  catalog.loadMore.mockClear();
  views.catalog = [];
  views.search = [];
  catalog.error = null;
  catalog.isLoading = false;
  search.active = false;
  search.results = [];
  search.error = null;
  screener.active = false;
  screener.resetKey = "";
  screener.timeframe = "24h";
  screener.sort = null;
  screener.trending = [];
  screener.calls = [];
  screenerList.tokens = [];
  screenerList.total = null;
  screenerList.loaded = 0;
  screenerList.shownCount = 0;
  screenerList.hasMore = false;
  screenerList.isLoadingMore = false;
  screenerList.loadMoreFailed = false;
  screenerList.isLoading = false;
  screenerList.error = null;
  screenerList.loadMore.mockClear();
  screenerList.refetch.mockClear();
});

describe("the memecoin desk", () => {
  it("lists the catalogue and trades the first coin until one is picked", () => {
    renderDesk();
    // The row carries the coin's name too, which the ticket's CTA does not.
    expect(screen.getByRole("button", { name: /AAA coin/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("button", { name: "Buy AAA" })).toBeInTheDocument();
  });

  it("moves the ticket to the coin that was picked", () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: /BBB/ }));
    expect(screen.getByRole("button", { name: "Buy BBB" })).toBeInTheDocument();
  });

  it("swaps the ticket for the sell one, sized off the exact held balance", () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(screen.getByRole("button", { name: "Sell AAA" })).toBeInTheDocument();
    // 12,345.6789 AAA, read from the base-unit string rather than the float.
    expect(screen.getByText("Balance 12,345.6789 AAA")).toBeInTheDocument();
  });

  // The rail opens on the chart. Closing it unmounts the chart, so a folded
  // chart resolves no id and subscribes to no series.
  it("opens with the chart showing, and unmounts it when the row is closed", () => {
    renderDesk();
    expect(document.querySelector('[data-region="meme-chart"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close Chart" }));
    expect(document.querySelector('[data-region="meme-chart"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Chart" }));
    expect(document.querySelector('[data-region="meme-chart"]')).not.toBeNull();
  });

  // The rail is already a bordered panel, so a bordered chart frame inside it
  // drew a card in a card. The chart sits in the open, the way the spot desk
  // draws it, and this is what stops a shell creeping back in.
  it("draws the chart area with no card around it", () => {
    renderDesk();
    const area = document.querySelector('[data-region="meme-chart"]') as HTMLElement;
    // ChartPanelShell's frame is that card: a surface fill, a hairline border
    // and a rounded corner. Nothing in the chart area may be one.
    expect(document.querySelector('[data-region="chart-panel-frame"]')).toBeNull();
    for (const node of [area, ...area.querySelectorAll("*")]) {
      expect(node.getAttribute("class") ?? "").not.toMatch(
        /(^|\s)(border|bg-surface|rounded-card)/
      );
    }
    // The id lookup missed, so the area says so rather than standing empty.
    expect(within(area).getByText("No chart for this token yet.")).toBeInTheDocument();
  });

  // The list panel is a fixed height, so an unpaged catalogue clipped its last
  // row in half. The board draws the bar but holds no page; the route does.
  it("cuts the catalogue into pages so the list ends on a whole row", () => {
    catalog.tokens = Array.from({ length: 12 }, (_, i) =>
      memeToken({ symbol: `C${String(i).padStart(2, "0")}` })
    );
    renderDesk();
    expect(screen.getAllByRole("button", { name: /coin/ })).toHaveLength(10);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("button", { name: /coin/ })).toHaveLength(2);
    // Paging past the coin being traded does not change which coin that is.
    expect(screen.getByRole("button", { name: "Buy C00" })).toBeInTheDocument();
  });

  it("opens the market metrics with the coin's figures", () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Market Metrics" }));
    const marketCap = document.querySelector('[data-metric="Market Cap"]') as HTMLElement;
    expect(marketCap).toHaveAttribute("data-unavailable", "false");
    expect(within(marketCap).getByText("$1M")).toBeInTheDocument();
  });

  // Neither figure exists upstream. The tiles stay and say so: a zero age or an
  // empty buy/sell split would read as a fact about the coin.
  it("says Age and Active Traders are unavailable rather than showing zeros", () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Market Metrics" }));
    const age = document.querySelector('[data-metric="Age"]') as HTMLElement;
    expect(age).toHaveAttribute("data-unavailable", "true");
    expect(within(age).getByText("Unavailable")).toBeInTheDocument();
    const traders = screen.getByTestId("meme-traders-card");
    expect(traders).toHaveAttribute("data-unavailable", "true");
    expect(within(traders).getByText("Unavailable")).toBeInTheDocument();
  });

  // compactUsd answers "—" for a missing figure, and that dash renders as
  // though it were a real one. The route has to hand the panel a null.
  it("says a coin with no published figures is unavailable, not an em dash", () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: /BBB/ }));
    fireEvent.click(screen.getByRole("button", { name: "Market Metrics" }));
    for (const label of ["Market Cap", "Volume (24h)", "Liquidity"]) {
      const tile = document.querySelector(`[data-metric="${label}"]`) as HTMLElement;
      expect(tile).toHaveAttribute("data-unavailable", "true");
      expect(within(tile).queryByText("—")).toBeNull();
    }
  });

  // The desk stopped where its content stopped, with the page showing black
  // underneath the card, because nothing between the window and the desk passes
  // a height down: the shell's main only carries min-h-screen. So the route,
  // which is the one place that knows where the desk sits in the shell, hands
  // it the window less the 79px topbar above it and whatever the live bar is
  // holding at the bottom. dvh, not vh, so a phone browser's collapsing address
  // bar does not make the figure a lie.
  it("gives the desk the height of the window under the topbar", () => {
    renderDesk();
    const desk = document.querySelector('[data-region="meme-desk"]') as HTMLElement;
    expect(desk).toHaveClass("md:min-h-[calc(100dvh-79px-var(--ws-live-bar,0px))]");
    expect(desk).toHaveClass("flex", "flex-col");
  });

  // A floor, not a fixed height. A rail with the chart and the metrics both
  // open runs past a short window, and the desk has to grow and let the page
  // scroll rather than crop it.
  it("lets the desk grow past the window rather than capping it", () => {
    renderDesk();
    const desk = document.querySelector('[data-region="meme-desk"]') as HTMLElement;
    expect(desk.className).not.toMatch(/(^|\s)(md:)?(max-)?h-\[calc\(100dvh/);
  });

  // Below md the Memecoins surface is the phone Market page's tab, so this route
  // hands off to it and mounts nothing here: no desk, and no second catalogue to
  // poll twice or disagree with the phone's about the selected coin.
  it("hands off to the Market page below md, mounting no desk", () => {
    viewport.mobile = true;
    renderDesk();
    expect(document.querySelector('[data-region="meme-desk"]')).toBeNull();
    expect(screen.queryByLabelText("Search all memecoins")).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/market?tab=memecoins");
    viewport.mobile = false;
  });
});

// The contract's trade-surface rules, on the desk: the risk and warnings are on
// both halves of the ticket, the fee is the preview's, a lapsed quote is
// blanked, the coin is re-read before trading, and a LOW_LIQUIDITY coin is
// confirmed before any preview goes out.
// Slice 4: the desk reads the paged catalogue behind a Curated / All switch,
// counts it against the server's total and loads the next page on demand.
describe("the memecoin desk's catalogue", () => {
  const switchGroup = () => screen.getByRole("group", { name: "Which memecoins to list" });

  it("opens on All, and Curated narrows the catalogue and the search", () => {
    const wild = memeToken({ symbol: "WILD", riskLevel: "HIGH" });
    catalog.allTokens = [aaa, bbb, wild];
    renderDesk();
    expect(views.catalog.at(-1)).toBe("all");
    expect(screen.getByRole("button", { name: /WILD/ })).toBeInTheDocument();

    fireEvent.click(within(switchGroup()).getByRole("button", { name: "Curated" }));
    expect(screen.queryByRole("button", { name: /WILD/ })).toBeNull();
    expect(views.catalog.at(-1)).toBe("curated");
    expect(views.search.at(-1)).toBe("curated");
  });

  it("counts the loaded rows against the server's total and shows the view's size", () => {
    catalog.total = 11_502;
    catalog.loaded = 500;
    catalog.shownCount = 156;
    renderDesk();
    expect(screen.getByText("500 of 11,502")).toBeInTheDocument();
    expect(screen.getByText("156 shown")).toBeInTheDocument();
  });

  // The catalogue runs to thousands of coins. Rather than stopping at a "Load
  // more", the desk fetches the next server page itself while the reader is
  // near the end of what has loaded, and numbers the pages it has.
  it("loads the pages ahead on its own, with no Load more to press", () => {
    catalog.total = 1_200;
    catalog.loaded = 500;
    catalog.hasMore = true;
    renderDesk();
    expect(catalog.loadMore).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("numbers the pages, and says more are coming while the server has them", () => {
    catalog.tokens = Array.from({ length: 25 }, (_, i) =>
      memeToken({ symbol: `C${String(i).padStart(2, "0")}` })
    );
    catalog.total = 1_200;
    catalog.loaded = 500;
    catalog.hasMore = true;
    renderDesk();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 3" })).toBeInTheDocument();
    expect(screen.getByText("More pages")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    expect(screen.getAllByRole("button", { name: /coin/ })).toHaveLength(5);
  });

  it("asks for the next server page when Next is pressed on the last loaded page", () => {
    catalog.tokens = Array.from({ length: 12 }, (_, i) =>
      memeToken({ symbol: `C${String(i).padStart(2, "0")}` })
    );
    catalog.total = 1_200;
    catalog.loaded = 500;
    catalog.hasMore = true;
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    const before = catalog.loadMore.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(catalog.loadMore.mock.calls.length).toBeGreaterThan(before);
    // The page it asked for is not here yet, so the last loaded one stays.
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
  });

  it("leaves the catalogue alone while a search fills the list", () => {
    catalog.total = 1_200;
    catalog.loaded = 500;
    catalog.hasMore = true;
    search.active = true;
    search.results = [aaa];
    renderDesk();
    expect(catalog.loadMore).not.toHaveBeenCalled();
    expect(screen.queryByText("More pages")).toBeNull();
  });

  it("stops at the last page once the pages cover the total", () => {
    catalog.total = 2;
    catalog.loaded = 2;
    catalog.hasMore = false;
    renderDesk();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(catalog.loadMore).not.toHaveBeenCalled();
    expect(screen.queryByText("More pages")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("the memecoin desk against the trade contract", () => {
  const risky = memeToken({
    symbol: "RISKY",
    riskLevel: "HIGH",
    warnings: [{ code: "HOLDER_CONCENTRATION", message: "Top holders own 60% of supply." }],
  });

  it("shows the risk badge and the warnings on the buy ticket and the sell panel", () => {
    catalog.tokens = [risky];
    renderDesk();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Top holders own 60% of supply.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Top holders own 60% of supply.")).toBeInTheDocument();
  });

  it("shows the preview's platform fee in USDC on the buy ticket", () => {
    preview.state.quote = swapPreview({ platformFeeAmountFormatted: "0.025" });
    renderDesk();
    const row = screen.getByText("Platform fee").parentElement as HTMLElement;
    expect(row).toHaveTextContent("0.025 USDC");
  });

  it("blanks a lapsed quote and asks for a fresh one", () => {
    preview.state.expired = true;
    renderDesk();
    expect(screen.getByText(messages.meme.quoteExpired)).toBeInTheDocument();
    expect(screen.queryByText(/4\.065/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.meme.retry }));
    expect(preview.state.refetch).toHaveBeenCalled();
  });

  it("re-reads the selected coin and trades on the fresh read, not the catalogue row", () => {
    fresh.token = { ...aaa, buyEnabled: false, riskLevel: "CRITICAL" };
    renderDesk();
    expect(fresh.identities).toContainEqual(
      expect.objectContaining({ address: aaa.address, chainId: aaa.chainId })
    );
    // The catalogue row says it can be bought; the fresh read says it cannot.
    expect(screen.getByRole("button", { name: messages.meme.sideDisabled })).toBeDisabled();
    expect(screen.getByText(messages.meme.riskCritical)).toBeInTheDocument();
  });

  it("links the wallet and asks again when the preview is refused for an unlinked wallet", async () => {
    preview.state.error = new TradeApiError("WALLET_OWNERSHIP_MISMATCH", "not linked", 403);
    renderDesk();
    await waitFor(() => expect(linkForPreview).toHaveBeenCalledWith(aaa.chainId));
    await waitFor(() => expect(preview.state.refetch).toHaveBeenCalled());
    expect(linkForPreview).toHaveBeenCalledTimes(1);
  });

  it("holds every preview for a LOW_LIQUIDITY coin behind the consent, and continues on it", () => {
    catalog.tokens = [memeToken({ symbol: "THINDESK", riskLevel: "HIGH", warnings: [LOW] })];
    renderDesk();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(lastConsented()).toBe(false);

    fireEvent.change(screen.getByLabelText("You pay"), { target: { value: "5" } });
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(LOW.message)).toBeInTheDocument();
    expect(lastConsented()).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "I understand, continue" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(lastConsented()).toBe(true);
  });

  it("cancels the consent by clearing the amount, and still sends nothing", () => {
    catalog.tokens = [memeToken({ symbol: "THINCANCEL", warnings: [LOW] })];
    renderDesk();
    fireEvent.change(screen.getByLabelText("You pay"), { target: { value: "5" } });
    act(() => {
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" })
      );
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("You pay") as HTMLInputElement).value).toBe("");
    expect(lastConsented()).toBe(false);
  });

  it("never asks a coin without the LOW_LIQUIDITY warning", () => {
    renderDesk();
    fireEvent.change(screen.getByLabelText("You pay"), { target: { value: "5" } });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(preview.calls.every((call) => call.consented)).toBe(true);
  });
});

// ADR-2026-09-15-meme-trending-screener: Trending and the screener join the
// table on the left. The list reads search results first, then the screener's
// filtered list while filters apply, then the catalogue.
describe("the memecoin desk's screener", () => {
  const ccc = memeToken({ symbol: "CCC" });
  const listPanel = () => document.querySelector('[data-region="token-list"]') as HTMLElement;

  it("asks the controller for the desk's Trending page size and view", () => {
    renderDesk();
    expect(screener.calls.at(-1)).toEqual({ view: "all", trendingPageSize: 4 });
  });

  it("draws Trending and the toolbar in the left column, beside the rail", () => {
    renderDesk();
    const column = document.querySelector('[data-region="left-column"]') as HTMLElement;
    expect(within(column).getByRole("heading", { name: "Trending now" })).toBeInTheDocument();
    expect(column.querySelector('[data-region="screener-toolbar"]')).not.toBeNull();
    expect(column).toContainElement(listPanel());
    expect(column).not.toContainElement(screen.getByRole("button", { name: "Buy AAA" }));
  });

  it("lists the screener's coins while filters apply, and counts and loads those", () => {
    catalog.total = 11_502;
    catalog.loaded = 500;
    catalog.shownCount = 156;
    catalog.hasMore = true;
    screener.active = true;
    screenerList.tokens = [ccc];
    screenerList.total = 57;
    screenerList.loaded = 40;
    screenerList.shownCount = 12;
    screenerList.hasMore = true;
    renderDesk();

    expect(screen.getByRole("button", { name: /CCC coin/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AAA coin/ })).toBeNull();
    // With no coin picked, the rail trades the first row of the live list.
    expect(screen.getByRole("button", { name: "Buy CCC" })).toBeInTheDocument();
    expect(screen.getByText("40 of 57")).toBeInTheDocument();
    expect(screen.getByText("12 shown")).toBeInTheDocument();
    expect(screen.queryByText("500 of 11,502")).toBeNull();
    expect(screen.getByText("More pages")).toBeInTheDocument();
    expect(screenerList.loadMore).toHaveBeenCalled();
    expect(catalog.loadMore).not.toHaveBeenCalled();
  });

  it("draws placeholders while the filtered list loads", () => {
    screener.active = true;
    screenerList.isLoading = true;
    renderDesk();
    expect(within(listPanel()).getByLabelText("Loading\u2026")).toBeInTheDocument();
  });

  it("says filters matched nothing rather than that there are no tokens", () => {
    screener.active = true;
    renderDesk();
    expect(screen.getByText(messages.memeScreener.noMatches)).toBeInTheDocument();
    expect(screen.queryByText(messages.meme.empty)).toBeNull();
  });

  it("says the filtered list failed, and retries the filtered list", () => {
    screener.active = true;
    screenerList.error = new Error("down");
    renderDesk();
    expect(screen.getByText(messages.memeScreener.listUnavailable)).toBeInTheDocument();
    fireEvent.click(within(listPanel()).getByRole("button", { name: messages.meme.retry }));
    expect(screenerList.refetch).toHaveBeenCalled();
  });

  it("returns the list to page 1 when the applied filters change", () => {
    const coins = Array.from({ length: 25 }, (_, i) =>
      memeToken({ symbol: `C${String(i).padStart(2, "0")}` })
    );
    catalog.tokens = coins;
    screenerList.tokens = coins;
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
    // Another render that changes nothing about the list keeps the page.
    fireEvent.click(screen.getByRole("button", { name: "Market Metrics" }));
    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");

    screener.active = true;
    screener.resetKey = "sortBy=volume&sortOrder=desc&timeframe=24h";
    fireEvent.click(screen.getByRole("button", { name: "Market Metrics" }));
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  });

  it("lets a search take over the list from the screener", () => {
    screener.active = true;
    screenerList.tokens = [ccc];
    screenerList.total = 57;
    screenerList.loaded = 40;
    screenerList.hasMore = true;
    search.active = true;
    search.results = [aaa];
    renderDesk();
    expect(screen.getByRole("button", { name: /AAA coin/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CCC coin/ })).toBeNull();
    expect(screen.queryByText("40 of 57")).toBeNull();
    expect(screenerList.loadMore).not.toHaveBeenCalled();
  });

  it("tells the toolbar its filters are paused while a search is showing", () => {
    renderDesk();
    expect(screen.queryByText(messages.memeScreener.pausedBySearch)).toBeNull();
    cleanup();
    search.active = true;
    search.results = [aaa];
    renderDesk();
    expect(screen.getByText(messages.memeScreener.pausedBySearch)).toBeInTheDocument();
  });

  it("trades a Trending coin in the rail when its card is picked", () => {
    const ddd = memeToken({ symbol: "DDD" });
    screener.trending = [ddd];
    renderDesk();
    const card = screen.getByRole("button", { name: /^DDD, rank 1/ });
    fireEvent.click(card);
    expect(screen.getByRole("button", { name: "Buy DDD" })).toBeInTheDocument();
    expect(screen.getByText("DDD/USDC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^DDD, rank 1/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("heads the change column with the window and adds the sorted metric", () => {
    screener.active = true;
    screener.timeframe = "1h";
    screener.sort = { by: "volume", order: "desc" };
    screenerList.tokens = [ccc];
    renderDesk();
    const header = listPanel().firstElementChild as HTMLElement;
    expect(header.children[2]).toHaveTextContent(/^1h$/);
    expect(header.children[4]).toHaveTextContent("Volume");
  });

  it("marks the page's top gainers", () => {
    catalog.tokens = [aaa, memeToken({ symbol: "DOWN", priceChange24hPercent: "-5" })];
    renderDesk();
    expect(
      within(screen.getByRole("button", { name: /AAA coin/ })).getByRole("img", {
        name: messages.memeScreener.topGainer,
      })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /DOWN coin/ })).queryByRole("img", {
        name: messages.memeScreener.topGainer,
      })
    ).toBeNull();
  });
});
