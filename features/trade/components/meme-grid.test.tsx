import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import type { MemeToken } from "@/lib/meme/api";

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

  it("closes the filter panel on Escape", async () => {
    catalog.tokens = [memeToken({ symbol: "AAA" })];
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    // The panel now plays an exit animation before it unmounts.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
    // Cards are the C0…C24 coins; the Curated / All switch also starts with a C.
    const cards = screen.getAllByRole("button").filter((b) => /^C\d/.test(b.textContent ?? ""));
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

// Slice 4: the grid reads the paged catalogue. A Curated / All switch picks
// the discovery view, the count is the server's total, and "Load more" asks
// for the next page of 500.
describe("MemeGrid discovery view and paging", () => {
  afterEach(() => {
    catalog.allTokens = null;
    catalog.total = null;
    catalog.loaded = 0;
    catalog.shownCount = 0;
    catalog.hasMore = false;
    catalog.isLoadingMore = false;
    catalog.loadMore.mockClear();
    views.catalog = [];
    views.search = [];
  });

  const switchGroup = () => screen.getByRole("group", { name: "Which memecoins to list" });

  it("opens on All, and switching to Curated narrows the catalogue and the search", () => {
    catalog.tokens = [memeToken({ symbol: "SAFE" })];
    catalog.allTokens = [memeToken({ symbol: "SAFE" }), memeToken({ symbol: "WILD" })];
    renderTable();
    expect(views.catalog.at(-1)).toBe("all");
    expect(screen.getByText("WILD")).toBeInTheDocument();

    fireEvent.click(within(switchGroup()).getByRole("button", { name: "Curated" }));
    expect(screen.queryByText("WILD")).toBeNull();
    expect(views.catalog.at(-1)).toBe("curated");
    expect(views.search.at(-1)).toBe("curated");
    expect(within(switchGroup()).getByRole("button", { name: "Curated" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("counts the loaded rows against the server's total, beside what the view shows", () => {
    catalog.tokens = [memeToken({ symbol: "SAFE" })];
    catalog.total = 11_502;
    catalog.loaded = 500;
    catalog.shownCount = 156;
    renderTable();
    expect(screen.getByText("500 of 11,502")).toBeInTheDocument();
    expect(screen.getByText("156 shown")).toBeInTheDocument();
  });

  it("asks for the next page from Load more, and offers none once it is all loaded", () => {
    catalog.tokens = [memeToken({ symbol: "SAFE" })];
    catalog.total = 1_200;
    catalog.loaded = 500;
    catalog.hasMore = true;
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemeGrid onOpen={vi.fn()} />
      </NextIntlClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(catalog.loadMore).toHaveBeenCalledOnce();
    unmount();

    catalog.loaded = 1_200;
    catalog.hasMore = false;
    renderTable();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("drops the catalogue count while a search is showing", () => {
    catalog.tokens = [memeToken({ symbol: "ONPAGE" })];
    catalog.total = 11_502;
    catalog.loaded = 500;
    catalog.hasMore = true;
    search.active = true;
    search.results = [memeToken({ symbol: "FOUND" })];
    renderTable();
    expect(screen.queryByText("500 of 11,502")).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    search.active = false;
    search.results = [];
  });
});
