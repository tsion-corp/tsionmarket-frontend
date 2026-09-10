import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { SpotDesktopView } from "@/features/trade/components/spot-desktop-view";
import { SPOT_ASSET_PAGE_SIZE } from "@/features/trade/components/spot-asset-table";
import type { SpotMarket } from "@/lib/spot-markets";

// How many rows the panel reports it can hold. The real hook measures a box in
// a browser; jsdom has none, so the number is set per test and the view is
// judged on what it does with it.
let fittedRows = SPOT_ASSET_PAGE_SIZE;

vi.mock("@/hooks/use-fitted-row-count", () => ({
  useFittedRowCount: () => ({ ref: () => {}, rows: fittedRows }),
}));

const marketsState = {
  markets: [] as SpotMarket[],
  loading: false,
  error: false,
};

vi.mock("@/features/trade/hooks/use-spot-markets", () => ({
  useSpotMarkets: () => ({
    markets: marketsState.markets,
    destinations: { error: null, refetch: vi.fn() },
    loading: marketsState.loading,
    error: marketsState.error,
  }),
}));

vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ tokens: [] }),
}));

vi.mock("@/features/trade/hooks/use-spot-buy", () => ({
  useSpotBuy: () => ({ pending: false, submit: vi.fn() }),
}));

function market(i: number): SpotMarket {
  return {
    symbol: `T${i}`,
    name: `Token ${i}`,
    priceUsd: 100 + i,
    change24h: 1.5,
    logo: null,
    coingeckoId: null,
    marketCap: 1_000_000 - i,
  };
}

function renderDesk() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SpotDesktopView onSell={vi.fn()} />
    </NextIntlClientProvider>
  );
}

// Data rows carry aria-selected; the column header does not.
function dataRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((el) => el.hasAttribute("aria-selected"));
}

function ticket(): HTMLElement {
  const aside = document.querySelector("aside");
  if (!aside) throw new Error("the order ticket is not on the desk");
  return aside as HTMLElement;
}

function deskGrid(): HTMLElement {
  const parent = ticket().parentElement;
  if (!parent) throw new Error("the desk grid is not where the test expects it");
  return parent;
}

// The desk asks the browser whether its two columns are side by side, to decide
// whether there is a panel height worth fitting rows to. jsdom ships no
// matchMedia, so it is stubbed as a desk-width window, which is the case every
// test below is about.
beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
});

beforeEach(() => {
  fittedRows = SPOT_ASSET_PAGE_SIZE;
  marketsState.markets = Array.from({ length: 25 }, (_, i) => market(i));
  marketsState.loading = false;
  marketsState.error = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SpotDesktopView columns", () => {
  // The ticket was stretched to the height of the market list, which left a
  // band of empty card between the quick amounts and the purchase summary at
  // the foot. It goes back to its own content height, top aligned, while the
  // list keeps filling the window.
  it("leaves the order ticket at its own height, at the top of the row", () => {
    renderDesk();

    expect(ticket()).toHaveClass("self-start");
  });

  it("keeps the market list filling the row", () => {
    renderDesk();

    expect(deskGrid()).toHaveClass("items-stretch");
    const panel = screen.getByRole("grid").parentElement?.parentElement;
    expect(panel).toHaveClass("self-stretch");
  });
});

describe("SpotDesktopView paging", () => {
  it("draws the design's nine rows before anything has been measured", () => {
    renderDesk();

    expect(dataRows()).toHaveLength(9);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("pages at the number of rows the panel can hold", () => {
    fittedRows = 13;
    renderDesk();

    expect(dataRows()).toHaveLength(13);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });

  it("does not strand a viewer on a page that a taller window removed", () => {
    const { rerender } = renderDesk();

    // Page 3 of 3 at nine rows a page.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

    // The window grows, the page size with it, and there is no third page.
    fittedRows = 13;
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SpotDesktopView onSell={vi.fn()} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(dataRows()).toHaveLength(12);
  });
});

describe("SpotDesktopView loading skeleton", () => {
  it("draws the fitted number of placeholder rows, so nothing jumps on arrival", () => {
    fittedRows = 13;
    marketsState.loading = true;
    marketsState.markets = [];
    renderDesk();

    const status = screen.getByRole("status");
    expect(status.querySelectorAll("[data-skeleton-row]")).toHaveLength(13);
  });
});
