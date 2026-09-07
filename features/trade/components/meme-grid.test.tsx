import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { MemeToken } from "@/lib/meme/api";

const catalog = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  pageCount: 1,
  isLoading: false,
  error: null as unknown,
  refetch: vi.fn(),
  lastChain: undefined as string | undefined,
}));
const search = vi.hoisted(() => ({
  results: [] as MemeToken[],
  searching: false,
  active: false,
  error: null as unknown,
}));
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useMemeCatalog: (_page: number, _limit: number, chain?: string) => {
    catalog.lastChain = chain;
    return catalog;
  },
  useMemeSearch: () => search,
}));

import { MemeGrid } from "@/features/trade/components/meme-grid";

function renderTable(onOpen = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeGrid onOpen={onOpen} />
    </NextIntlClientProvider>
  );
  return onOpen;
}

describe("MemeGrid", () => {
  it("renders a card per coin with its market numbers", () => {
    catalog.tokens = [memeToken({ symbol: "AAA" })];
    renderTable();
    expect(screen.getByText("AAA")).toBeInTheDocument();
    expect(screen.getByText(/Liquidity/)).toBeInTheDocument();
    expect(screen.getByText(/Mkt cap/)).toBeInTheDocument();
  });

  it("closes the filter panel on Escape", () => {
    catalog.tokens = [memeToken({ symbol: "AAA" })];
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the coin modal from a card", () => {
    catalog.tokens = [memeToken({ symbol: "AAA" })];
    const onOpen = renderTable();
    fireEvent.click(screen.getByText("AAA"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("narrows the page by risk band, from the filter panel", () => {
    catalog.tokens = [memeToken({ symbol: "SAFE", riskLevel: "LOW" })];
    renderTable();
    // The bands live behind the button now, so they have to be opened first.
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Critical/ }));
    expect(screen.queryByText("SAFE")).not.toBeInTheDocument();
    expect(screen.getByText("No coins in the bands you picked.")).toBeInTheDocument();
  });

  it("searches the catalogue rather than the fetched page", () => {
    catalog.tokens = [memeToken({ symbol: "ONPAGE" })];
    search.active = true;
    search.results = [memeToken({ symbol: "FOUND" })];
    renderTable();
    expect(screen.getByText("FOUND")).toBeInTheDocument();
    expect(screen.queryByText("ONPAGE")).not.toBeInTheDocument();
    search.active = false;
    search.results = [];
  });
});

describe("MemeGrid paging", () => {
  // The bug this replaced: the wrapped-major filter ran after the server cut
  // the page, so a page holding cbBTC came back one short and the last row of
  // three was ragged. Filtering first and cutting after is what keeps a page
  // full.
  it("fills a page even when the catalogue contains a coin it drops", () => {
    catalog.tokens = Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `C${i}` }));
    renderTable();
    const cards = screen.getAllByRole("button").filter((b) => b.textContent?.startsWith("C"));
    expect(cards).toHaveLength(21);
  });

  it("pages the remainder rather than dropping it", () => {
    catalog.tokens = Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `C${i}` }));
    renderTable();
    expect(screen.queryByText("C21")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("C21")).toBeInTheDocument();
  });
});

describe("MemeGrid across chains", () => {
  it("says which chain each coin lives on", () => {
    catalog.tokens = [
      memeToken({ symbol: "ONBASE", chainId: 8453 }),
      memeToken({
        symbol: "ONSOL",
        chainId: 101,
        address: "So11111111111111111111111111111111111111112",
      }),
    ];
    renderTable();
    const base = screen.getByText("ONBASE").closest("button");
    const sol = screen.getByText("ONSOL").closest("button");
    expect(base).toHaveTextContent("Base");
    expect(sol).toHaveTextContent("Solana");
  });

  it("narrows to one chain and asks the catalogue for that chain", () => {
    catalog.tokens = [memeToken({ symbol: "ONBASE", chainId: 8453 })];
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: /^Solana$/ }));
    expect(catalog.lastChain).toBe("solana");
  });
});

describe("MemeGrid when the catalogue is down", () => {
  it("says so and offers a retry instead of an empty list", () => {
    catalog.tokens = [];
    catalog.error = new Error("SERVICE_UNAVAILABLE");
    renderTable();
    expect(screen.getByText("Memecoin markets are unavailable right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(catalog.refetch).toHaveBeenCalledOnce();
    catalog.error = null;
  });

  it("says a search failed rather than that nothing matched", () => {
    catalog.tokens = [memeToken({ symbol: "ONPAGE" })];
    search.active = true;
    search.results = [];
    search.error = new Error("RATE_LIMITED");
    renderTable();
    expect(screen.getByText("Memecoin markets are unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing matched that search.")).toBeNull();
    search.active = false;
    search.error = null;
  });
});
