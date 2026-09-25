import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { memeToken } from "@/lib/meme/fixture";
import type { MemeToken } from "@/lib/meme/api";

const catalog = vi.hoisted(() => ({
  tokens: [] as MemeToken[],
  // What the All view keeps, when a test gives the two views different rows.
  allTokens: null as MemeToken[] | null,
  isLoading: false,
  isFetching: false,
  error: null as unknown,
  refetch: vi.fn(),
  // The walk behind the rows: the catalogue arrives 500 coins a server page.
  hasMore: false,
  isLoadingMore: false,
  progress: {
    status: "complete" as "walking" | "rate-limited" | "stalled" | "complete",
    // The walk's own restart. Nothing else can clear a stall.
    retry: vi.fn(),
  },
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

function renderTable(onOpen = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={catalogue}>
      <MemeGrid onOpen={onOpen} />
    </NextIntlClientProvider>
  );
  return onOpen;
}

// The same render, plus a way to draw it again after the mocked hook has been
// handed more rows: that is what a server page landing looks like from here.
function renderRerenderable() {
  // A fresh element each time: React bails out of a re-render handed the very
  // same element object, and the mocked hook would never be read again.
  const tree = () => (
    <NextIntlClientProvider locale="en" messages={catalogue}>
      <MemeGrid onOpen={vi.fn()} />
    </NextIntlClientProvider>
  );
  const view = render(tree());
  return { rerender: () => view.rerender(tree()) };
}

afterEach(() => {
  catalog.tokens = [];
  catalog.allTokens = null;
  catalog.isLoading = false;
  catalog.error = null;
  catalog.hasMore = false;
  catalog.isLoadingMore = false;
  catalog.progress.status = "complete";
  catalog.progress.retry.mockClear();
});

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

  // The catalogue is walked 500 coins a server page and runs past a hundred
  // thousand. A bar that appeared only once the rows in hand overflowed a page,
  // and then counted only those rows, read as a finished list for the whole
  // walk.
  it("pages over every row held and grows the count as more land", () => {
    catalog.tokens = Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `C${i}` }));
    catalog.hasMore = true;
    const { rerender } = renderRerenderable();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    catalog.tokens = Array.from({ length: 64 }, (_, i) => memeToken({ symbol: `C${i}` }));
    rerender();
    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
  });

  it("says the list is still filling rather than letting a first page look whole", () => {
    catalog.tokens = Array.from({ length: 5 }, (_, i) => memeToken({ symbol: `C${i}` }));
    catalog.hasMore = true;
    catalog.progress.status = "walking";
    renderTable();
    // One page of rows so far, and the bar is up anyway saying why.
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Loading more…")).toBeInTheDocument();
  });

  it("drops the hint once the walk is done", () => {
    catalog.tokens = Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `C${i}` }));
    renderTable();
    expect(screen.queryByText("Loading more…")).toBeNull();
    expect(screen.queryByText("More pages")).toBeNull();
  });

  // A stalled walk is not a loading one. The count is still not final, and the
  // bar now says outright that the list is short rather than claiming rows are
  // on their way when none are.
  it("stops claiming rows are arriving once the walk has stalled", () => {
    catalog.tokens = Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `C${i}` }));
    catalog.hasMore = true;
    catalog.progress.status = "stalled";
    renderTable();
    expect(screen.queryByText("Loading more…")).toBeNull();
    expect(screen.queryByText("More pages")).toBeNull();
    expect(screen.getByText("The list is incomplete")).toBeInTheDocument();
  });

  it("says nothing about the catalogue behind a search's own results", () => {
    catalog.tokens = [];
    catalog.hasMore = true;
    catalog.progress.status = "walking";
    search.active = true;
    search.results = [memeToken({ symbol: "FOUND" })];
    renderTable();
    expect(screen.queryByText("Loading more…")).toBeNull();
    search.active = false;
    search.results = [];
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
    expect(screen.queryByText("No tokens match.")).toBeNull();
    search.active = false;
    search.error = null;
  });
});

// Slice 4: the grid reads the cached catalogue. A Curated / All switch picks
// the discovery view. The grid no longer says how much of the catalogue has
// loaded and no longer offers a "Load more": the whole catalogue is cached up
// front, so a loaded-so-far count had nothing left to report.
describe("MemeGrid discovery view", () => {
  afterEach(() => {
    catalog.allTokens = null;
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

  it("pages the cached catalogue without reporting how much of it loaded", () => {
    catalog.tokens = Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `C${i}` }));
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemeGrid onOpen={vi.fn()} />
      </NextIntlClientProvider>
    );
    expect(container.querySelector('[data-region="catalog-status"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    // The numbered pager is what walks the catalogue now.
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("C21")).toBeInTheDocument();
  });

  it("pages a search result set, and still says nothing about the catalogue", () => {
    catalog.tokens = [memeToken({ symbol: "ONPAGE" })];
    search.active = true;
    search.results = Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `S${i}` }));
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemeGrid onOpen={vi.fn()} />
      </NextIntlClientProvider>
    );
    expect(container.querySelector('[data-region="catalog-status"]')).toBeNull();
    expect(screen.queryByText("ONPAGE")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("S21")).toBeInTheDocument();
    search.active = false;
    search.results = [];
  });

  it("shows the empty state, not a pager, when a search matches nothing", () => {
    catalog.tokens = [memeToken({ symbol: "ONPAGE" })];
    search.active = true;
    search.results = [];
    renderTable();
    expect(screen.getByText("No tokens match.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
    search.active = false;
  });
});

// The walk gives up after a run of refusals and nothing restarted it, so the
// grid held part of the catalogue, said nothing, and read as a finished list.
// This is the way out of that state, and the only one the reader has.
describe("MemeGrid when the catalogue walk has given up", () => {
  const fullPage = () => Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `C${i}` }));

  it("offers the way on, and pressing it restarts the walk", () => {
    catalog.tokens = fullPage();
    catalog.hasMore = true;
    catalog.progress.status = "stalled";
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Load the rest" }));
    expect(catalog.progress.retry).toHaveBeenCalledOnce();
  });

  // The rule on this surface: it never reports how much of the catalogue is
  // held. Being honest that the list is short does not need a figure.
  it("says the list is short without reporting a count", () => {
    catalog.tokens = fullPage();
    catalog.hasMore = true;
    catalog.progress.status = "stalled";
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={catalogue}>
        <MemeGrid onOpen={vi.fn()} />
      </NextIntlClientProvider>
    );
    const notice = screen.getByText("The list is incomplete");
    expect(container.querySelector('[data-region="catalog-status"]')).toBeNull();
    // The page count is fine, it is a fact about the pager. What the bar must
    // not do is report the catalogue: no rows held, no total, no percentage.
    expect(notice.textContent).not.toMatch(/\d/);
    expect(screen.getByRole("button", { name: "Load the rest" }).textContent).not.toMatch(/\d/);
  });

  it("is absent while the walk is still going", () => {
    catalog.tokens = fullPage();
    catalog.hasMore = true;
    catalog.progress.status = "walking";
    renderTable();
    expect(screen.queryByRole("button", { name: "Load the rest" })).toBeNull();
  });

  // Rate limited waits it out and resumes itself, so the bar says so and asks
  // for nothing: a press here would be wasted.
  it("is absent while the walk is only rate limited, which says it will resume", () => {
    catalog.tokens = fullPage();
    catalog.hasMore = true;
    catalog.progress.status = "rate-limited";
    renderTable();
    expect(screen.queryByRole("button", { name: "Load the rest" })).toBeNull();
    expect(screen.getByText("Paused, continuing shortly")).toBeInTheDocument();
  });

  it("is absent once the catalogue is whole", () => {
    catalog.tokens = fullPage();
    renderTable();
    expect(screen.queryByRole("button", { name: "Load the rest" })).toBeNull();
  });

  // A search is its own finished list. The catalogue behind it may be stalled,
  // but these rows are not the ones missing anything.
  it("is absent over a search's own results", () => {
    catalog.tokens = fullPage();
    catalog.hasMore = true;
    catalog.progress.status = "stalled";
    search.active = true;
    search.results = Array.from({ length: 25 }, (_, i) => memeToken({ symbol: `S${i}` }));
    renderTable();
    expect(screen.queryByRole("button", { name: "Load the rest" })).toBeNull();
    search.active = false;
    search.results = [];
  });
});
