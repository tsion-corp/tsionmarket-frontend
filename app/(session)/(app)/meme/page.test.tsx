import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { MemeToken } from "@/lib/meme/api";

// The desk is the whole memecoin route on a desktop, so this covers the wiring
// the route owns: which coin the rail is trading, which side the ticket is on,
// what the disclosures mount, and what the metrics panel is handed for the two
// figures the service does not publish.

const catalog = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  pageCount: 1,
  isLoading: false,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
const search = vi.hoisted(() => ({
  results: [] as MemeToken[],
  searching: false,
  active: false,
  error: null as unknown,
}));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeCatalog: () => catalog,
  useMemeSearch: () => search,
}));

const trade = vi.hoisted(() => vi.fn());
vi.mock("@/features/trade/hooks/use-meme-trade", () => ({
  useMemeTrade: () => ({
    walletFor: () => "0xwallet",
    phase: "idle",
    error: null,
    trade,
  }),
  useMemePreview: () => ({ data: null, isFetching: false, error: null }),
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

beforeEach(() => {
  catalog.tokens = [aaa, bbb];
  catalog.error = null;
  catalog.isLoading = false;
  search.active = false;
  search.results = [];
  search.error = null;
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

  it("mounts the chart only once the rail's chart row is opened", () => {
    renderDesk();
    expect(document.querySelector('[data-region="meme-chart"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View Chart" }));
    expect(document.querySelector('[data-region="meme-chart"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close Chart" }));
    expect(document.querySelector('[data-region="meme-chart"]')).toBeNull();
  });

  // The rail is already a bordered panel, so a bordered chart frame inside it
  // drew a card in a card. The chart sits in the open, the way the spot desk
  // draws it, and this is what stops a shell creeping back in.
  it("draws the chart area with no card around it", () => {
    renderDesk();
    fireEvent.click(screen.getByRole("button", { name: "View Chart" }));
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
