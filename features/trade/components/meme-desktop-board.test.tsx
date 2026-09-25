import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { catalogKey } from "@/lib/meme/catalog";
import { memeToken } from "@/lib/meme/fixture";
// The Shine toggle reads the account's preference through React Query. These
// tests are about this surface's layout, not about that read, so the control
// is stubbed and only its placement and its service are checked here. Its own
// behaviour is covered in components/shine/shine-toggle.test.tsx.
vi.mock("@/components/shine/shine-toggle", () => ({
  ShineToggle: ({ service }: { service: string }) => (
    <div data-testid="shine-toggle" data-service={service} />
  ),
}));

import {
  MEME_LIST_PAGE_SIZE,
  MEME_LIST_ROW_HEIGHT,
  MemeDesktopBoard,
  type MemeDesktopBoardProps,
} from "@/features/trade/components/meme-desktop-board";

const sol = memeToken({
  symbol: "SOL",
  name: "Solana",
  priceUsd: "75.88",
  priceChange24hPercent: "-1",
  marketCapUsd: "103240000000",
});

function renderBoard(overrides: Partial<MemeDesktopBoardProps> = {}) {
  const props: MemeDesktopBoardProps = {
    tokens: [sol],
    selected: sol,
    onSelect: vi.fn(),
    query: "",
    onQueryChange: vi.fn(),
    side: "BUY",
    onSideChange: vi.fn(),
    chartOpen: false,
    onChartToggle: vi.fn(),
    metricsOpen: false,
    onMetricsToggle: vi.fn(),
    ticket: <div>ticket slot</div>,
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemeDesktopBoard {...props} />
    </NextIntlClientProvider>
  );
  return props;
}

describe("MemeDesktopBoard rows", () => {
  it("renders a row with the display values for that coin", () => {
    renderBoard();
    const row = screen.getByRole("button", { name: /SOL/ });
    expect(row).toHaveTextContent("SOL");
    expect(row).toHaveTextContent("Solana");
    expect(row).toHaveTextContent("$75.88");
    expect(row).toHaveTextContent("-1.00%");
    expect(row).toHaveTextContent("$103.24B");
  });

  it("hands the coin back when its row is picked", () => {
    const props = renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /SOL/ }));
    expect(props.onSelect).toHaveBeenCalledWith(sol);
  });

  it("marks the traded coin as the selected row", () => {
    renderBoard();
    expect(screen.getByRole("button", { name: /SOL/ })).toHaveAttribute("aria-current", "true");
  });
});

// Slice 4: the route hands the board the Curated / All switch. The board stays
// presentational; it only decides where it sits.
describe("MemeDesktopBoard catalogue controls", () => {
  it("draws the view switch beside the search", () => {
    renderBoard({ listControls: <div>switch slot</div> });
    expect(screen.getByText("switch slot").closest('[data-region="list-controls"]')).not.toBeNull();
  });
});

describe("MemeDesktopBoard when there is nothing to list", () => {
  it("says the catalogue is empty rather than drawing a bare table", () => {
    renderBoard({ tokens: [], selected: null });
    expect(screen.getByText("No tokens yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SOL/ })).toBeNull();
  });

  it("says nothing matched when a search comes back empty", () => {
    renderBoard({ tokens: [], selected: null, query: "zzz" });
    expect(screen.getByText("No tokens match.")).toBeInTheDocument();
    expect(screen.queryByText("No tokens yet.")).toBeNull();
  });

  it("shows placeholders instead of an empty message while loading", () => {
    renderBoard({ tokens: [], selected: null, isLoading: true });
    expect(screen.queryByText("No tokens yet.")).toBeNull();
    expect(screen.getByLabelText("Loading…")).toBeInTheDocument();
  });
});

describe("MemeDesktopBoard when the catalogue is down", () => {
  it("says so and offers a retry instead of an empty table", () => {
    const props = renderBoard({ tokens: [], selected: null, failed: true, onRetry: vi.fn() });
    expect(screen.getByText("Memecoin markets are unavailable right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  // The upstream drops in bursts and the catalogue is persisted for exactly
  // this: the coins already on screen are still real, so a failed refresh says
  // the prices are stale, it does not wipe the list.
  it("keeps the coins on screen when a refresh fails", () => {
    renderBoard({ failed: true, onRetry: vi.fn() });
    expect(screen.getByRole("button", { name: /SOL/ })).toBeInTheDocument();
    expect(screen.getByText("Memecoin markets are unavailable right now.")).toBeInTheDocument();
  });
});

describe("MemeDesktopBoard rail", () => {
  it("leaves the chart unmounted until the caller opens it", () => {
    const props = renderBoard({ chart: <div>chart slot</div> });
    expect(screen.queryByText("chart slot")).toBeNull();
    const toggle = screen.getByRole("button", { name: "View Chart" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(props.onChartToggle).toHaveBeenCalledOnce();
  });

  it("renders the chart slot once opened", () => {
    renderBoard({ chartOpen: true, chart: <div>chart slot</div> });
    expect(screen.getByText("chart slot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Chart" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  // The metrics slot is the one panel the rail does not gate. It is handed a
  // panel that draws figures the route already holds and that owns its own
  // collapse (MemeMarketMetrics reads the same `metricsOpen`), so mounting it
  // costs nothing and leaving it mounted is what lets it fold shut instead of
  // vanishing. Anything with a cost belongs in the `chart` slot's category.
  it("leaves the metrics slot mounted so the panel it holds can fold itself shut", () => {
    const props = renderBoard({ metrics: <div>metrics slot</div> });
    expect(screen.getByText("metrics slot")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Market Metrics" }));
    expect(props.onMetricsToggle).toHaveBeenCalledOnce();
  });

  it("renders the metrics slot once opened", () => {
    renderBoard({ metricsOpen: true, metrics: <div>metrics slot</div> });
    expect(screen.getByText("metrics slot")).toBeInTheDocument();
  });

  // The defect on the desk: both rows swapped their panel in and out, so the
  // chevron turned smoothly and the rail snapped. The chart cannot stay mounted
  // (it resolves an id and boots a chart), so the panel animates around it and
  // the chart itself stays gated inside.
  it("animates the chart panel open while leaving the chart unmounted when closed", () => {
    renderBoard({ chart: <div>chart slot</div> });
    const toggle = screen.getByRole("button", { name: "View Chart" });
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls") as string
    ) as HTMLElement;

    expect(panel.className).toContain("[grid-template-rows:0fr]");
    expect(panel.className).toContain("transition-[grid-template-rows,opacity]");
    expect(panel).toHaveAttribute("inert");
    expect(screen.queryByText("chart slot")).toBeNull();
  });

  it("unfolds the chart panel to the chart's own height once it is open", () => {
    renderBoard({ chartOpen: true, chart: <div>chart slot</div> });
    const toggle = screen.getByRole("button", { name: "Close Chart" });
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls") as string
    ) as HTMLElement;

    expect(panel.className).toContain("[grid-template-rows:1fr]");
    expect(panel).not.toHaveAttribute("inert");
    expect(screen.getByText("chart slot")).toBeInTheDocument();
  });

  // The rail stacks on 13px. That gap has to fold with the panel rather than
  // sit on the column as a flex gap, or a closed row would carry 13px of empty
  // rail under it that the design never draws. It cannot ride on the
  // Disclosure's className either: that lands on the grid item, whose padding
  // counts towards the 0fr track and holds the shut panel 13px tall.
  it("folds the rail's gap under each row away with its panel", () => {
    renderBoard({
      chartOpen: true,
      chart: <div>chart slot</div>,
      metrics: <div>metrics slot</div>,
    });

    for (const label of ["Close Chart", "Market Metrics"]) {
      const row = screen.getByRole("button", { name: label });
      expect((row.parentElement as HTMLElement).className).not.toContain("gap-");
    }
    const chartToggle = screen.getByRole("button", { name: "Close Chart" });
    const chartPanel = document.getElementById(chartToggle.getAttribute("aria-controls") as string);
    const clip = chartPanel?.firstElementChild as HTMLElement;
    expect(clip.className).not.toMatch(/(^|\s)-?(m|p)(t|b|y)?-/);
    expect((clip.firstElementChild as HTMLElement).className).toContain("pt-[13px]");
  });

  // Disclosure shouts in development when a caller puts spacing on its
  // className, because that spacing never collapses. Nothing in this rail may
  // trip it, in either state.
  it("trips no spacing warning from the disclosure primitive", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderBoard({ chart: <div>chart slot</div>, metrics: <div>metrics slot</div> });
    renderBoard({ chartOpen: true, metricsOpen: true, chart: <div>c</div>, metrics: <div>m</div> });

    const shouted = spy.mock.calls.filter((call) => String(call[0]).startsWith("Disclosure:"));
    expect(shouted).toEqual([]);
    spy.mockRestore();
  });

  it("renders the ticket and the side the caller picked", () => {
    const props = renderBoard();
    expect(screen.getByText("ticket slot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    expect(props.onSideChange).toHaveBeenCalledWith("SELL");
  });

  it("shows nothing to trade until a coin is picked", () => {
    renderBoard({ selected: null, tokens: [] });
    expect(screen.queryByText("ticket slot")).toBeNull();
    expect(screen.queryByRole("button", { name: "Buy" })).toBeNull();
  });
});

describe("MemeDesktopBoard disclosure marks", () => {
  // The design fills the dot and the glyph with #FFD62F, which is --color-kash.
  // The label and the chevron stay white. This holds the yellow on the two
  // marks so a later pass cannot quietly let them inherit the row's ink.
  it("draws the dot and the glyph in the kash yellow", () => {
    renderBoard();
    for (const label of ["View Chart", "Market Metrics"]) {
      const row = screen.getByRole("button", { name: label });
      expect(row).toHaveClass("text-white");
      const dot = row.querySelector("span.rounded-full");
      expect(dot).toHaveClass("bg-kash");
      const glyph = row.querySelector("svg")?.parentElement;
      expect(glyph).toHaveClass("text-kash");
    }
  });
});

describe("MemeDesktopBoard list footer", () => {
  it("draws no pagination bar until the caller pages the list", () => {
    renderBoard();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prev" })).toBeNull();
  });

  it("says which page of how many the list is showing", () => {
    renderBoard({ page: 2, pageCount: 4, onPageChange: vi.fn() });
    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
  });

  it("asks the caller for the next page and the previous one", () => {
    const props = renderBoard({ page: 2, pageCount: 4, onPageChange: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(props.onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    expect(props.onPageChange).toHaveBeenCalledWith(1);
  });

  it("stops at the first page and at the last", () => {
    renderBoard({ page: 1, pageCount: 3, onPageChange: vi.fn() });
    expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables next once the last page is showing", () => {
    renderBoard({ page: 3, pageCount: 3, onPageChange: vi.fn() });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("numbers the pages and lets the reader jump straight to one", () => {
    const props = renderBoard({ page: 1, pageCount: 4, onPageChange: vi.fn() });
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Page 4" }));
    expect(props.onPageChange).toHaveBeenCalledWith(4);
  });

  it("keeps Next open past the last loaded page while the catalogue has more", () => {
    const props = renderBoard({ page: 3, pageCount: 3, onPageChange: vi.fn(), pageMore: true });
    expect(screen.getByText("More pages")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(props.onPageChange).toHaveBeenCalledWith(4);
  });

  it("holds Next on the last loaded page while its rows are still arriving", () => {
    renderBoard({
      page: 3,
      pageCount: 3,
      onPageChange: vi.fn(),
      pageMore: true,
      pageLoadingMore: true,
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("hides the bar on a single page rather than drawing a dead control", () => {
    renderBoard({ page: 1, pageCount: 1, onPageChange: vi.fn() });
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("keeps the footer slot for a caller that does not page", () => {
    renderBoard({ listFooter: <span>Manage tokens</span> });
    expect(screen.getByText("Manage tokens")).toBeInTheDocument();
  });

  it("puts the pagination bar in place of the footer slot", () => {
    renderBoard({
      page: 1,
      pageCount: 3,
      onPageChange: vi.fn(),
      listFooter: <span>Manage tokens</span>,
    });
    expect(screen.queryByText("Manage tokens")).toBeNull();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  // The placeholder block is a full page, so the list is the same height
  // loading as settled and turning a page does not move the desk.
  it("draws a page of placeholders while the catalogue is in flight", () => {
    renderBoard({ tokens: [], selected: null, isLoading: true });
    const placeholders = screen.getByLabelText("Loading\u2026").querySelectorAll(".animate-pulse");
    expect(placeholders).toHaveLength(MEME_LIST_PAGE_SIZE);
  });
});

// The panel's height, which is what put a half row on screen. The frame was a
// fixed 682px with the rows scrolling inside it, so the rows got 641px, and
// 641px is 11.2 rows of 57px: the twelfth row was sliced by the panel's edge.
// These hold the shape that ends the list on a row boundary.
describe("MemeDesktopBoard list height", () => {
  const panel = () => document.querySelector<HTMLElement>('[data-region="token-list"]');
  const rows = () => document.querySelector<HTMLElement>('[data-region="token-rows"]');
  const layer = () => document.querySelector<HTMLElement>('[data-region="token-rows-layer"]');
  const footer = () => document.querySelector<HTMLElement>('[data-region="list-footer"]');

  const page = Array.from({ length: MEME_LIST_PAGE_SIZE }, (_, i) =>
    memeToken({ symbol: `T${i}` })
  );

  it("draws every coin on the page, so none is left half in the frame", () => {
    renderBoard({ tokens: page, page: 1, pageCount: 4, onPageChange: vi.fn() });
    for (const token of page) {
      expect(
        screen.getByRole("button", { name: new RegExp(`${token.symbol} coin`) })
      ).toBeVisible();
    }
  });

  it("lets the panel grow to its rows instead of capping and cutting one", () => {
    renderBoard({ tokens: page, page: 1, pageCount: 4, onPageChange: vi.fn() });
    expect(panel()).toHaveClass("min-h-[682px]");
    expect(panel()).not.toHaveClass("h-[682px]");
    // Fills the column when the rail beside it is the taller of the two, the
    // same way the spot market list does, so the card does not stop short of
    // the bottom with the page showing under the pager.
    expect(panel()).toHaveClass("self-stretch");
    // No scroll box, so there is no viewport edge to slice a row against.
    expect(rows()).not.toHaveClass("overflow-y-auto");
    // The shape that makes the rows block measurable: its height has to come
    // from the panel alone. If the rows could push it taller, fitting rows to
    // that height would add a row, which would make the block taller, which
    // would fit another row. So the block is `flex-1` against a header and a
    // pager of fixed height, and the rows live in an absolutely positioned
    // layer that contributes no height to anything.
    expect(rows()).toHaveClass("flex-1");
    expect(rows()).toHaveClass("min-h-0");
    expect(rows()).toHaveClass("relative");
    expect(rows()).toHaveClass("overflow-hidden");
    expect(layer()).toHaveClass("absolute");
    expect(layer()).toHaveClass("inset-0");
    expect(layer()?.parentElement).toBe(rows());
  });

  it("pins the pagination bar to the foot of the panel, under the rows", () => {
    renderBoard({ tokens: page, page: 2, pageCount: 4, onPageChange: vi.fn() });
    expect(footer()).toBe(panel()?.lastElementChild);
    expect(rows()?.compareDocumentPosition(footer() as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
  });

  // The stale-prices strip is a third band in the panel. Against a fixed height
  // it stole 35px from the rows; against a floor it grows the panel instead, so
  // the bar stays on screen and the last row stays whole.
  it("keeps the pagination bar in the panel when the stale-prices strip shows", () => {
    renderBoard({
      tokens: page,
      failed: true,
      onRetry: vi.fn(),
      page: 2,
      pageCount: 4,
      onPageChange: vi.fn(),
    });
    expect(screen.getByText("Memecoin markets are unavailable right now.")).toBeInTheDocument();
    expect(footer()).toBe(panel()?.lastElementChild);
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("keeps the footer slot on the floor of the panel too", () => {
    renderBoard({ tokens: page, listFooter: <span>Manage tokens</span> });
    expect(footer()).toBe(panel()?.lastElementChild);
    expect(footer()).toHaveTextContent("Manage tokens");
  });
});

// The desk is given the window's height by the route, because nothing between
// the viewport and this component passes one down. These are the two links that
// carry it from the desk's own box to the list panel's `self-stretch`.
//
// Both are `grow` with the basis left at `auto`, not `flex-1`. `flex-1` sets
// the basis to zero, which drops the rows, the ticket and an open chart out of
// the height each box asks for, so a window shorter than the desk would crop
// them instead of scrolling. With an `auto` basis the box is never shorter than
// its content and spare height is the only thing that gets handed down.
describe("MemeDesktopBoard height chain", () => {
  const board = () => document.querySelector<HTMLElement>('[data-region="meme-board"]');
  const columns = () => document.querySelector<HTMLElement>('[data-region="desk-columns"]');

  it("passes the desk's spare height down to the list panel", () => {
    renderBoard();
    expect(board()).toHaveClass("grow");
    expect(columns()).toHaveClass("grow");
    for (const box of [board(), columns()]) {
      expect(box).not.toHaveClass("flex-1");
      expect(box).not.toHaveClass("min-h-0");
      expect(box).not.toHaveClass("h-full");
    }
  });

  it("keeps the rail hugging its own content while the list takes the height", () => {
    renderBoard();
    expect(columns()).toHaveClass("lg:items-start");
    expect(document.querySelector('[data-region="token-list"]')).toHaveClass("self-stretch");
  });
});

// The desk is drawn for a wide window: the rail alone is 468px, and the table
// needs about 360px, so under about 1024px the two cannot sit side by side
// without the page scrolling sideways. Below lg the columns stack instead, the
// table takes the full width, and the rail with its ticket follows underneath.
// At lg and above nothing changes: the ticket is on the right as before.
describe("MemeDesktopBoard on a tablet", () => {
  const columns = () => document.querySelector<HTMLElement>('[data-region="desk-columns"]');
  const rail = () => columns()?.lastElementChild as HTMLElement;

  it("stacks the columns under lg and puts them side by side from lg", () => {
    renderBoard();
    expect(columns()).toHaveClass("flex-col", "lg:flex-row");
    expect(columns()).not.toHaveClass("items-start");
  });

  it("gives the rail the full width under lg and its fixed width from lg", () => {
    renderBoard();
    expect(rail()).toHaveClass("w-full", "lg:w-[468px]", "lg:shrink-0");
    expect(rail()).not.toHaveClass("w-[468px]");
  });

  it("keeps the slots in the left column when it stacks, with the rail after it", () => {
    renderBoard({
      trending: <div data-testid="trending-slot" />,
      screener: <div data-testid="screener-slot" />,
    });
    const left = document.querySelector<HTMLElement>('[data-region="left-column"]');
    expect(left?.parentElement).toBe(columns());
    expect(columns()?.lastElementChild).toBe(rail());
    expect(left).toHaveClass("min-w-0");
  });
});

// The page size follows the panel's height rather than the ten the design was
// drawn at. The desk stretches to the window, so on a tall one the fixed ten
// left a band of empty card between the last row and the pager.
//
// jsdom lays nothing out, reports every box as 0x0 and ships no
// ResizeObserver, so these supply both: an observer that reports the box as
// soon as it is watched, which is what the browser's does, and a height for the
// rows region that a real panel of that window would give it.
describe("MemeDesktopBoard fitted rows", () => {
  const rowsRegion = () => document.querySelector<HTMLElement>('[data-region="token-rows"]');
  const rowButtons = () =>
    document.querySelectorAll<HTMLElement>('[data-region="token-rows-layer"] > button');

  // The one behaviour of ResizeObserver the hook relies on: observing a box
  // reports its size straight away, without waiting for it to change.
  class ReportOnObserve {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }

  // Only the rows region answers with a height. Everything else keeps jsdom's
  // own zeroes, so nothing but the measured element is affected.
  function giveRowsRegion(height: number) {
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.dataset.region !== "token-rows") return real.call(this);
      return { ...real.call(this), height, bottom: height } as DOMRect;
    });
  }

  const catalogue = (count: number) =>
    Array.from({ length: count }, (_, i) => memeToken({ symbol: `T${i}` }));

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ReportOnObserve);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fills the height it was given with whole rows", () => {
    // 1200px of rows region holds 21 rows of 57 and 3px short of a 22nd.
    giveRowsRegion(21 * MEME_LIST_ROW_HEIGHT + 3);
    renderBoard({ tokens: catalogue(40), page: 1, pageCount: 2, onPageChange: vi.fn() });
    expect(rowButtons()).toHaveLength(21);
  });

  it("tells the caller the page size the panel now holds", () => {
    giveRowsRegion(21 * MEME_LIST_ROW_HEIGHT + 3);
    const onPageSizeChange = vi.fn();
    renderBoard({ tokens: catalogue(40), onPageSizeChange });
    expect(onPageSizeChange).toHaveBeenLastCalledWith(21);
  });

  // The server renders before there is anything to measure, so the first client
  // render has to agree with it. Ten is the count the design draws.
  it("holds the design's ten until the panel has been measured", () => {
    const onPageSizeChange = vi.fn();
    renderBoard({ tokens: catalogue(40), onPageSizeChange });
    expect(rowsRegion()?.getBoundingClientRect().height).toBe(0);
    expect(rowButtons()).toHaveLength(MEME_LIST_PAGE_SIZE);
    expect(onPageSizeChange).toHaveBeenLastCalledWith(MEME_LIST_PAGE_SIZE);
  });

  // The invariant the hidden overflow rests on. A caller that is still paging at
  // the old size hands over more coins than the panel can hold, and drawing all
  // of them would put a row under the pager and, worse, make the block taller
  // than the space it was measured from.
  it("never draws more rows than the height holds", () => {
    // Room for seven, twenty coins handed over.
    giveRowsRegion(7 * MEME_LIST_ROW_HEIGHT + 40);
    renderBoard({ tokens: catalogue(20), page: 1, pageCount: 2, onPageChange: vi.fn() });
    expect(rowButtons()).toHaveLength(7);
  });

  // With Trending and the toolbar above it the list has less room, and it is
  // still the rows block that is measured, so fewer whole rows fit.
  it("fits whole rows into what the left column leaves the list", () => {
    giveRowsRegion(6 * MEME_LIST_ROW_HEIGHT + 20);
    const onPageSizeChange = vi.fn();
    renderBoard({
      tokens: catalogue(20),
      trending: <div>trending slot</div>,
      screener: <div>screener slot</div>,
      page: 1,
      pageCount: 2,
      onPageChange: vi.fn(),
      onPageSizeChange,
    });
    expect(rowButtons()).toHaveLength(6);
    expect(onPageSizeChange).toHaveBeenLastCalledWith(6);
  });

  it("draws one placeholder per fitted row, so the table does not jump", () => {
    giveRowsRegion(14 * MEME_LIST_ROW_HEIGHT);
    renderBoard({ tokens: [], selected: null, isLoading: true });
    const placeholders = screen.getByLabelText("Loading…").querySelectorAll(".animate-pulse");
    expect(placeholders).toHaveLength(14);
  });

  // The row height the count divides by is the row's real outer height, border
  // included, measured in the browser. A pixel under the truth compounds and
  // fits one row too many.
  it("divides by the row height the rows are actually drawn at", () => {
    renderBoard({ tokens: catalogue(3) });
    expect(MEME_LIST_ROW_HEIGHT).toBe(57);
    expect(rowButtons()[0]).toHaveClass(`h-[${MEME_LIST_ROW_HEIGHT}px]`);
  });
});

// ADR-2026-09-15-meme-trending-screener, section 1: the Trending strip and the
// screener toolbar join the table in the left column, and the rail beside it
// is not touched. Without either slot the board is exactly what it was.
describe("MemeDesktopBoard screener slots", () => {
  const columns = () => document.querySelector<HTMLElement>('[data-region="desk-columns"]');
  const leftColumn = () => document.querySelector<HTMLElement>('[data-region="left-column"]');
  const panel = () => document.querySelector<HTMLElement>('[data-region="token-list"]');
  const rail = () => columns()?.lastElementChild as HTMLElement;

  const slots = {
    trending: <div data-testid="trending-slot">trending slot</div>,
    screener: <div data-testid="screener-slot">screener slot</div>,
  };

  it("adds no column wrapper when neither slot is passed", () => {
    renderBoard();
    expect(leftColumn()).toBeNull();
    expect(panel()?.parentElement).toBe(columns());
  });

  it("stacks Trending, the toolbar and the list in one left column", () => {
    renderBoard(slots);
    const column = leftColumn();
    expect(column?.parentElement).toBe(columns());
    expect(columns()?.firstElementChild).toBe(column);
    expect(Array.from(column?.children ?? [])).toEqual([
      screen.getByTestId("trending-slot"),
      screen.getByTestId("screener-slot"),
      panel(),
    ]);
  });

  it("opens the column for either slot on its own", () => {
    renderBoard({ trending: slots.trending });
    expect(leftColumn()).toContainElement(screen.getByTestId("trending-slot"));
    expect(leftColumn()).toContainElement(panel());
  });

  // The 682px floor moves up to the column, so the desk keeps its height, and
  // the list takes what Trending and the toolbar leave.
  it("moves the 682px floor to the column and lets the list take the rest", () => {
    renderBoard(slots);
    expect(leftColumn()).toHaveClass(
      "flex",
      "min-w-0",
      "flex-1",
      "flex-col",
      "gap-3",
      "self-stretch",
      "min-h-[682px]"
    );
    expect(panel()).toHaveClass("min-h-0", "flex-1", "min-w-0", "flex", "flex-col");
    expect(panel()).toHaveClass("overflow-hidden", "rounded-card", "border", "bg-surface");
    expect(panel()).not.toHaveClass("min-h-[682px]");
    expect(panel()).not.toHaveClass("self-stretch");
  });

  // The toolbar's Sort and Filters popovers hang down over the list, so the
  // column must not clip them.
  it("clips nothing at the column, so the toolbar's popovers can hang over the list", () => {
    renderBoard(slots);
    expect(leftColumn()?.className).not.toMatch(/(^|\s)overflow-/);
  });

  it("leaves the rail exactly as it was", () => {
    // The chart panel's id comes from useId, which differs per render.
    const markup = () => rail().outerHTML.replace(/meme-desk-chart-[^"]*/g, "meme-desk-chart");
    renderBoard();
    const before = markup();
    cleanup();
    renderBoard(slots);
    expect(markup()).toBe(before);
    expect(rail()).toHaveClass("lg:w-[468px]", "lg:shrink-0");
  });
});

describe("MemeDesktopBoard change column", () => {
  const header = () => document.querySelector<HTMLElement>('[data-region="token-header"]');
  const slots = { trending: <div>trending slot</div>, screener: <div>screener slot</div> };

  const active = memeToken({
    symbol: "HOT",
    priceChange24hPercent: "-1",
    activity: {
      "1h": { volumeUsd: "900", transactions: 1234, traders: 56, priceChangePercent: "12.5" },
    },
  });
  const quiet = memeToken({ symbol: "QUIET", priceChange24hPercent: "-3" });

  it("heads the column with the selected window", () => {
    renderBoard({ ...slots, timeframe: "1h" });
    expect(header()?.children[2]).toHaveTextContent(/^1h$/);
  });

  it("keeps today's 24h heading without slots", () => {
    renderBoard();
    expect(header()?.children[2]).toHaveTextContent(messages.meme.col24h);
  });

  it("reads the window's change, and only falls back to the flat field at 24h", () => {
    renderBoard({ ...slots, tokens: [active, quiet], selected: null, timeframe: "1h" });
    expect(screen.getByRole("button", { name: /HOT coin/ })).toHaveTextContent("+12.50%");
    expect(screen.getByRole("button", { name: /HOT coin/ })).not.toHaveTextContent("-1.00%");
    // No 1h reading is not the 24h one.
    expect(screen.getByRole("button", { name: /QUIET coin/ })).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: /QUIET coin/ })).not.toHaveTextContent("-3.00%");
  });

  it("shows the flat 24h change at 24h, as the table always has", () => {
    renderBoard({ ...slots, tokens: [quiet], selected: null });
    expect(screen.getByRole("button", { name: /QUIET coin/ })).toHaveTextContent("-3.00%");
  });

  it("draws the change bar under the percentage, at the row's height", () => {
    renderBoard({ ...slots, tokens: [active], selected: null, timeframe: "1h" });
    const row = screen.getByRole("button", { name: /HOT coin/ });
    const fill = row.querySelector<HTMLElement>(".bg-up");
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe("12%");
    expect(row).toHaveClass(`h-[${MEME_LIST_ROW_HEIGHT}px]`);
  });

  it("draws no change bar without slots", () => {
    renderBoard();
    const row = screen.getByRole("button", { name: /SOL/ });
    expect(row.querySelector('[aria-hidden="true"] > .bg-down')).toBeNull();
  });
});

describe("MemeDesktopBoard sorted metric column", () => {
  const panel = () => document.querySelector<HTMLElement>('[data-region="token-list"]');
  const header = () => panel()?.querySelector('[data-region="token-header"]') as HTMLElement;
  const rowButtons = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-region="token-rows-layer"] > button'));
  const slots = { trending: <div>trending slot</div>, screener: <div>screener slot</div> };
  const NOW = Date.parse("2026-09-15T12:00:00Z");

  const coin = memeToken({
    symbol: "HOT",
    liquidityUsd: "12500",
    volume24hUsd: "5000",
    pairCreatedAt: "2026-09-15T11:55:00Z",
    activity: {
      "1h": { volumeUsd: "900", transactions: 1234, traders: 56, priceChangePercent: "1" },
    },
  });

  // The grid template, whatever else the class list holds.
  const template = (el: Element) => el.className.match(/grid-cols-\[[^\]]+\]/)?.[0];

  it.each([
    ["volume", "1h", "Volume", "$900"],
    ["transactions", "1h", "Transactions", "1,234"],
    ["traders", "1h", "Traders", "56"],
    ["liquidity", "24h", "Liquidity", "$12.5K"],
    ["age", "24h", "Age", "5m"],
  ] as const)("adds a column for a %s sort", (sortMetric, timeframe, label, value) => {
    renderBoard({ ...slots, tokens: [coin], selected: null, sortMetric, timeframe, now: NOW });
    expect(header().children).toHaveLength(5);
    expect(header().children[4]).toHaveTextContent(label);
    const row = screen.getByRole("button", { name: /HOT coin/ });
    expect(row.children).toHaveLength(5);
    expect(row.children[4]).toHaveTextContent(value);
    expect(template(header())).toBe("grid-cols-[minmax(0,1fr)_88px_110px_121px_96px]");
  });

  it("says a missing figure is missing rather than zero", () => {
    renderBoard({
      ...slots,
      tokens: [memeToken({ symbol: "BARE" })],
      selected: null,
      sortMetric: "traders",
      timeframe: "5m",
    });
    const row = screen.getByRole("button", { name: /BARE coin/ });
    expect(row.children[4]).toHaveTextContent(/^—$/);
  });

  it.each(["price", "marketCap"] as const)(
    "adds no column for a %s sort, which the table already shows",
    (sortMetric) => {
      renderBoard({ ...slots, tokens: [coin], selected: null, sortMetric });
      expect(header().children).toHaveLength(4);
      expect(template(header())).toBe("grid-cols-[minmax(0,1fr)_88px_110px_121px]");
    }
  );

  it("adds no column without a sort", () => {
    renderBoard({ ...slots, tokens: [coin], selected: null, sortMetric: null });
    expect(header().children).toHaveLength(4);
  });

  it("lays the header and every row on the same template", () => {
    const tokens = [coin, memeToken({ symbol: "TWO" }), memeToken({ symbol: "THREE" })];
    renderBoard({ ...slots, tokens, selected: null, sortMetric: "volume" });
    const expected = template(header());
    expect(rowButtons()).toHaveLength(3);
    for (const row of rowButtons()) expect(template(row)).toBe(expected);
  });
});

describe("MemeDesktopBoard top gainers", () => {
  const slots = { trending: <div>trending slot</div>, screener: <div>screener slot</div> };
  const up = memeToken({ symbol: "UP" });
  const flat = memeToken({ symbol: "FLAT" });

  it("marks the page's top gainers after the symbol", () => {
    renderBoard({
      ...slots,
      tokens: [up, flat],
      selected: null,
      topGainers: new Set([catalogKey(up)]),
    });
    const row = screen.getByRole("button", { name: /UP coin/ });
    expect(within(row).getByRole("img", { name: "Top gainer on this page" })).toHaveTextContent(
      "🔥"
    );
    expect(
      within(screen.getByRole("button", { name: /FLAT coin/ })).queryByRole("img", {
        name: "Top gainer on this page",
      })
    ).toBeNull();
  });

  it("marks nothing when no gainers are passed", () => {
    renderBoard({ ...slots, tokens: [up], selected: null });
    expect(screen.queryByRole("img", { name: "Top gainer on this page" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sortable headings and the search box
// ---------------------------------------------------------------------------

describe("MemeDesktopBoard headings", () => {
  // The sort is the screener's, not the table's: a heading click and a choice
  // in the sort menu reach the same setter, so the two can never disagree and
  // whichever is used is also what goes to the backend.
  it("asks for a descending sort the first time a heading is clicked", () => {
    const onSortChange = vi.fn();
    renderBoard({ onSortChange });

    fireEvent.click(screen.getByRole("button", { name: /mkt cap/i }));

    expect(onSortChange).toHaveBeenCalledWith({ by: "marketCap", order: "desc" });
  });

  it("flips the heading already sorted, then clears it", () => {
    const onSortChange = vi.fn();
    renderBoard({ onSortChange, sortMetric: "marketCap", sortOrder: "desc" });
    fireEvent.click(screen.getByRole("button", { name: /mkt cap/i }));
    expect(onSortChange).toHaveBeenLastCalledWith({ by: "marketCap", order: "asc" });

    cleanup();
    renderBoard({ onSortChange, sortMetric: "marketCap", sortOrder: "asc" });
    fireEvent.click(screen.getByRole("button", { name: /mkt cap/i }));
    // Third click clears it, rather than cycling back to descending and
    // leaving no way to undo a sort from the heading.
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  // A screen reader should hear which column is sorted and which way, not just
  // see an arrow.
  it("announces the sorted column", () => {
    renderBoard({ onSortChange: vi.fn(), sortMetric: "price", sortOrder: "asc" });

    const price = screen.getByRole("button", { name: /price/i }).parentElement;
    expect(price).toHaveAttribute("aria-sort", "ascending");
  });

  // The asset and change columns have no screener bound behind them, so a
  // button there would look pressable and do nothing.
  it("leaves the columns that cannot sort as plain text", () => {
    renderBoard({ onSortChange: vi.fn() });

    expect(screen.queryByRole("button", { name: /^asset$/i })).toBeNull();
  });

  // Without a setter the board is read-only, as the phone's callers leave it.
  it("draws plain headings when no setter is given", () => {
    renderBoard();

    expect(screen.queryByRole("button", { name: /mkt cap/i })).toBeNull();
  });
});

// Slice: long figures are approximated so no cell runs past its column. Every
// figure below is one that overflowed on the desk before the table was wired
// to lib/meme/format (the cards already were).
describe("MemeDesktopBoard long figures", () => {
  const slots = { trending: <div>trending slot</div>, screener: <div>screener slot</div> };

  const whale = memeToken({
    symbol: "WHALE",
    priceUsd: "0.00000000121495281918",
    marketCapUsd: "3491589227.1234567890123",
    priceChange24hPercent: "12345.6789",
    liquidityUsd: "0.004",
    activity: {
      "24h": {
        volumeUsd: "8200000000",
        transactions: 1284339,
        traders: 98765,
        priceChangePercent: "12345.6789",
      },
    },
  });

  const row = () => screen.getByRole("button", { name: /WHALE coin/ });

  it("approximates a market cap in the billions", () => {
    renderBoard({ tokens: [whale], selected: null });
    expect(row().children[3]).toHaveTextContent(/^\$3\.49B$/);
  });

  it("never prints a sub-cent price as $0", () => {
    renderBoard({ tokens: [whale], selected: null });
    const price = row().children[1].textContent ?? "";
    expect(price).not.toBe("$0");
    expect(price).not.toBe("$0.00");
    // priceLabel counts the zero run rather than spelling it out.
    expect(price).toBe("$0.0\u20881215");
  });

  it("approximates a five-figure change and keeps the exact one for a screen reader", () => {
    renderBoard({ tokens: [whale], selected: null });
    const change = row().children[2];
    expect(change.querySelector('[aria-hidden="true"]')).toHaveTextContent("+12.35K%");
    expect(change).toHaveTextContent("+12345.68%");
  });

  it("approximates a seven-figure transaction count", () => {
    renderBoard({ ...slots, tokens: [whale], selected: null, sortMetric: "transactions" });
    expect(row().children[4]).toHaveTextContent(/^1\.28M$/);
  });

  it("never prints a thin pool's liquidity as $0", () => {
    renderBoard({ ...slots, tokens: [whale], selected: null, sortMetric: "liquidity" });
    expect(row().children[4]).toHaveTextContent(/^<\$0\.01$/);
  });

  it("still draws a dash for a figure the service did not publish", () => {
    const bare = memeToken({ symbol: "BARE", marketCapUsd: null, priceChange24hPercent: null });
    renderBoard({ tokens: [bare], selected: null });
    const bareRow = screen.getByRole("button", { name: /BARE coin/ });
    expect(bareRow.children[3]).toHaveTextContent(/^\u2014$/);
    expect(bareRow.children[2]).toHaveTextContent(/^\u2014$/);
  });

  it("keeps every figure cell short enough for its column", () => {
    renderBoard({ ...slots, tokens: [whale], selected: null, sortMetric: "volume" });
    // Ten is priceLabel's own bound and the widest cell on the row; the money,
    // count and change cells all stop at eight. The asset cell is a name, not
    // a figure, so it is not measured. The change cell carries the exact
    // figure for a screen reader, so its visible half is the one measured.
    const cells = Array.from(row().children).slice(1);
    for (const cell of cells) {
      const hidden = cell.querySelector('[aria-hidden="true"]');
      const shown = (hidden ?? cell).textContent ?? "";
      expect(shown.trim().length).toBeLessThanOrEqual(10);
    }
  });
});

// The box searches the catalogue on more than a name, so it says so rather
// than borrowing the spot market's "Search tokens".
describe("MemeDesktopBoard search box", () => {
  it("tells the reader everything the search matches", () => {
    renderBoard();
    expect(screen.getByLabelText("Search all memecoins")).toHaveAttribute(
      "placeholder",
      "Search by name, symbol, address, market cap, price or age"
    );
  });
});

// Shine is on by default and posts a confirmed trade publicly with no
// per-post confirmation, so the desk someone trades from is where the control
// has to be. Placement is wiring, and wiring is what this file covers.
describe("MemeDesktopBoard Shine", () => {
  it("carries the memecoin Shine toggle on the desk", () => {
    renderBoard();

    expect(screen.getByTestId("shine-toggle")).toHaveAttribute("data-service", "memecoin");
  });
});
