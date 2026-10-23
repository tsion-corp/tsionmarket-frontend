import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import messages from "@/messages/en.json";
import { ASSET_PAGE_SIZE } from "@/components/ui/desk-layout";
import { RwaDeskView } from "@/features/rwa/components/rwa-desk-view";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";

// How many rows the panel reports it can hold. The real hook measures a box in
// a browser; jsdom has none, so the number is set per test and the desk is
// judged on what it does with it.
let fittedRows = ASSET_PAGE_SIZE;

vi.mock("@/hooks/use-fitted-row-count", () => ({
  useFittedRowCount: () => ({ ref: () => {}, rows: fittedRows }),
}));

const registry = {
  assets: [] as RwaAssetView[],
  loading: false,
  error: false,
};

vi.mock("@/features/rwa/hooks/use-rwa-assets", () => ({
  useListedRwaAssets: () => ({
    assets: registry.assets,
    loading: registry.loading,
    error: registry.error,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/rwa/hooks/use-rwa-prices", () => ({
  useRwaEnrichedAssets: (assets: RwaAssetView[]) => assets,
}));

vi.mock("@/hooks/use-token-logos", () => ({
  useTokenLogos: () => ({}),
  tokenLogoKey: (chain: string, address: string) => `${chain}:${address}`,
}));

// The real ticket pulls the whole trade panel in behind it: quotes, wallets and
// two settlement legs. This suite is about the desk's geometry and its list, so
// the ticket stands in as the asset it was pointed at.
vi.mock("@/features/rwa/components/rwa-ticket", () => ({
  RwaTicket: ({ asset }: { asset: RwaAssetView }) => (
    <div data-testid="rwa-ticket">{asset.symbol}</div>
  ),
}));

function asset(i: number, over: Partial<RwaAssetView> = {}): RwaAssetView {
  return {
    id: `base:t${i}`,
    chain: "base",
    address: `0xT${i}`,
    symbol: `T${i}`,
    name: `Token ${i}`,
    issuer: `Issuer ${i}`,
    category: "treasury",
    decimals: 6,
    priceUsd: String(100 + i),
    market: { change24h: 1.5, liquidityUsd: 1_200_000, marketCapUsd: 9_900_000_000 },
    ...over,
  } as unknown as RwaAssetView;
}

function renderDesk() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RwaDeskView />
    </NextIntlClientProvider>
  );
}

function rerenderDesk(rerender: (ui: ReactElement) => void) {
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RwaDeskView />
    </NextIntlClientProvider>
  );
}

// Data rows carry aria-selected; the column header does not.
function dataRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((el) => el.hasAttribute("aria-selected"));
}

function ticketPanel(): HTMLElement {
  const aside = document.querySelector("aside");
  if (!aside) throw new Error("the order ticket is not on the desk");
  return aside as HTMLElement;
}

function deskGrid(): HTMLElement {
  const parent = ticketPanel().parentElement;
  if (!parent) throw new Error("the desk grid is not where the test expects it");
  return parent;
}

function search(): HTMLElement {
  return screen.getByRole("searchbox", { name: messages.rwa.searchPlaceholder });
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
  fittedRows = ASSET_PAGE_SIZE;
  registry.assets = Array.from({ length: 25 }, (_, i) => asset(i));
  registry.loading = false;
  registry.error = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("RwaDeskView layout", () => {
  // The same two assertions the spot desk test makes, for the same reason: the
  // list is what fills the window, and a stretched ticket would leave a band of
  // empty card under the block its foot is pinned to.
  it("leaves the order ticket at its own height, at the top of the row", () => {
    renderDesk();

    expect(ticketPanel()).toHaveClass("self-start");
  });

  it("keeps the asset list filling the row", () => {
    renderDesk();

    expect(deskGrid()).toHaveClass("items-stretch");
    const panel = screen.getByRole("grid").parentElement?.parentElement;
    expect(panel).toHaveClass("self-stretch");
  });
});

describe("RwaDeskView list", () => {
  it("draws one row per asset, at the design's nine before anything is measured", () => {
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

  // Base is where a buy is funded from, so the assets that need no bridge sit
  // at the top, whichever order the registry served them in.
  it("lists Base assets first", () => {
    registry.assets = [
      asset(1, { id: "solana:sol1", chain: "solana", symbol: "SOL1" } as Partial<RwaAssetView>),
      asset(2, { id: "base:base1", chain: "base", symbol: "BASE1" } as Partial<RwaAssetView>),
    ];
    renderDesk();

    expect(dataRows()[0]).toHaveTextContent("BASE1");
    expect(dataRows()[1]).toHaveTextContent("SOL1");
  });

  it("carries liquidity in the fourth column, not market cap", () => {
    renderDesk();

    expect(screen.getByRole("columnheader", { name: messages.rwa.liquidity })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: messages.rwa.marketCap })).toBeNull();
    expect(screen.getAllByText("$1.2M")).toHaveLength(9);
    expect(screen.queryByText("$9.9B")).toBeNull();
  });

  it("pills the APY only for an asset that pays one", () => {
    registry.assets = [asset(1, { yieldApyBps: 485 } as Partial<RwaAssetView>), asset(2), asset(3)];
    renderDesk();

    expect(screen.getByText("4.85% APY")).toBeInTheDocument();
    expect(screen.getAllByText(/^\d+\.\d\d% APY$/)).toHaveLength(1);
  });

  it("does not strand a viewer on a page a shrinking catalogue removed", () => {
    const { rerender } = renderDesk();

    // Page 3 of 3 at nine rows a page.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();

    // The registry comes back shorter and there is no third page.
    registry.assets = Array.from({ length: 12 }, (_, i) => asset(i));
    rerenderDesk(rerender);

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(dataRows()).toHaveLength(3);
  });
});

describe("RwaDeskView search", () => {
  beforeEach(() => {
    renderDesk();
  });

  it("narrows the list to what was typed", () => {
    fireEvent.change(search(), { target: { value: "Token 7" } });

    expect(dataRows()).toHaveLength(1);
    expect(dataRows()[0]).toHaveTextContent("T7");
  });

  it("matches on the issuer as well as the ticker", () => {
    fireEvent.change(search(), { target: { value: "Issuer 11" } });

    expect(dataRows()).toHaveLength(1);
    expect(dataRows()[0]).toHaveTextContent("T11");
  });

  // The results are a different list, so the page someone was on says nothing
  // about where to open the new one.
  it("starts a new search on the first page", () => {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    fireEvent.change(search(), { target: { value: "Token 1" } });

    expect(screen.getByText(/^Page 1 of/)).toBeInTheDocument();
  });

  it("says so when nothing matches", () => {
    fireEvent.change(search(), { target: { value: "nothing here" } });

    expect(screen.getByText(messages.rwa.noSearchMatches)).toBeInTheDocument();
    expect(screen.queryAllByRole("row").filter((el) => el.hasAttribute("aria-selected"))).toEqual(
      []
    );
  });

  // A search narrows the list, never the ticket: the asset someone is part way
  // through pricing stays open even once it scrolls out of the results.
  it("leaves the open ticket alone", () => {
    fireEvent.click(dataRows()[4]);
    expect(screen.getByTestId("rwa-ticket")).toHaveTextContent("T4");

    fireEvent.change(search(), { target: { value: "Token 21" } });

    expect(screen.getByTestId("rwa-ticket")).toHaveTextContent("T4");
  });
});

describe("RwaDeskView selection", () => {
  it("opens the first asset before anything is chosen", () => {
    renderDesk();

    expect(screen.getByTestId("rwa-ticket")).toHaveTextContent("T0");
  });

  it("points the ticket at the row that was picked", () => {
    renderDesk();

    fireEvent.click(dataRows()[3]);

    expect(screen.getByTestId("rwa-ticket")).toHaveTextContent("T3");
    expect(dataRows()[3]).toHaveAttribute("aria-selected", "true");
  });
});

describe("RwaDeskView async states", () => {
  it("draws the fitted number of placeholder rows, so nothing jumps on arrival", () => {
    fittedRows = 13;
    registry.loading = true;
    registry.assets = [];
    renderDesk();

    const status = screen.getByRole("status");
    expect(status.querySelectorAll("[data-skeleton-row]")).toHaveLength(13);
    expect(screen.getByText(messages.rwa.loadingAssets)).toBeInTheDocument();
    expect(search()).toBeDisabled();
  });

  it("explains a registry that could not be reached, and offers a retry", () => {
    registry.error = true;
    registry.assets = [];
    renderDesk();

    expect(screen.getByText("Couldn't load the real asset registry.")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(search()).toBeDisabled();
  });

  it("says the registry is empty rather than drawing an empty desk", () => {
    registry.assets = [];
    renderDesk();

    expect(screen.getByText(messages.rwa.noCategoryAssets)).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
  });
});
