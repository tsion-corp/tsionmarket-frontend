import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import {
  SpotAssetTable,
  SPOT_ASSET_PAGE_SIZE,
  SPOT_ASSET_ROW_HEIGHT,
  spotAssetPageCount,
  spotAssetPageRows,
  type SpotAssetRowView,
} from "@/features/trade/components/spot-asset-table";

function row(over: Partial<SpotAssetRowView> = {}): SpotAssetRowView {
  return {
    id: "BTC",
    symbol: "BTC",
    name: "Bitcoin",
    logo: null,
    price: "$80,005.50",
    change24h: "+0.02%",
    changeDirection: "up",
    marketCap: "$1.3T",
    ...over,
  };
}

function renderTable(props: Partial<React.ComponentProps<typeof SpotAssetTable>> = {}) {
  const onPageChange = props.onPageChange ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SpotAssetTable rows={[]} page={1} pageCount={1} {...props} onPageChange={onPageChange} />
    </NextIntlClientProvider>
  );
  return onPageChange;
}

describe("SpotAssetTable", () => {
  it("keeps the header when there are no rows", () => {
    renderTable({ rows: [] });

    expect(screen.getByText("Asset")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("24h")).toBeInTheDocument();
    expect(screen.getByText("Mcap")).toBeInTheDocument();
    expect(screen.getByText(messages.markets.noResults)).toBeInTheDocument();
    // The header is itself a row, so the absence of data shows as no cells.
    expect(screen.queryAllByRole("row")).toHaveLength(1);
    expect(screen.queryAllByRole("gridcell")).toHaveLength(0);
  });

  it("renders a row with its symbol, name and display figures", () => {
    renderTable({ rows: [row()] });

    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText("Bitcoin")).toBeInTheDocument();
    expect(screen.getByText("$80,005.50")).toBeInTheDocument();
    expect(screen.getByText("$1.3T")).toBeInTheDocument();
  });

  it("paints a positive 24h change with the gain colour", () => {
    renderTable({ rows: [row({ change24h: "+2.52%", changeDirection: "up" })] });

    const change = screen.getByText("+2.52%");
    expect(change).toHaveClass("text-up");
    expect(change).not.toHaveClass("text-down");
  });

  it("paints a negative 24h change with the loss colour", () => {
    renderTable({
      rows: [row({ id: "SOL", symbol: "SOL", change24h: "-1.00%", changeDirection: "down" })],
    });

    const change = screen.getByText("-1.00%");
    expect(change).toHaveClass("text-down");
    expect(change).not.toHaveClass("text-up");
  });

  it("leaves a flat 24h change unpainted", () => {
    renderTable({ rows: [row({ change24h: "0.00%", changeDirection: "flat" })] });

    const change = screen.getByText("0.00%");
    expect(change).not.toHaveClass("text-up");
    expect(change).not.toHaveClass("text-down");
  });

  it("reports the row id when a row is chosen", () => {
    const onSelect = vi.fn();
    renderTable({ rows: [row({ id: "ETH", symbol: "ETH", name: "Ethereum" })], onSelect });

    fireEvent.click(screen.getByRole("row", { name: /ETH/ }));

    expect(onSelect).toHaveBeenCalledWith("ETH");
  });

  it("marks the selected row for assistive tech", () => {
    renderTable({
      rows: [row(), row({ id: "ETH", symbol: "ETH", name: "Ethereum" })],
      selectedId: "BTC",
    });

    expect(screen.getByRole("row", { name: /BTC/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("row", { name: /ETH/ })).toHaveAttribute("aria-selected", "false");
  });

  // The four roles the design draws in Mona Sans (--font-display, reached
  // through font-serif) and the three beside them that really are Geist. jsdom
  // has no layout engine, so the family is asserted as the class that carries
  // it, not as a computed style.
  describe("type roles", () => {
    it("sets the display face on the header labels", () => {
      renderTable({ rows: [row()] });

      const header = screen.getByText("Asset").closest('[role="row"]');
      expect(header).toHaveClass("font-serif");
    });

    it("sets the display face on the row symbol and drops the stale body face", () => {
      renderTable({ rows: [row()] });

      const symbol = screen.getByText("BTC");
      expect(symbol).toHaveClass("font-serif");
      expect(symbol).not.toHaveClass("font-sans");
    });

    it("sets the display face on the market cap", () => {
      renderTable({ rows: [row()] });

      expect(screen.getByText("$1.3T")).toHaveClass("font-serif");
    });

    it("leaves the coin name, the price and the 24h change in the body face", () => {
      renderTable({ rows: [row()] });

      for (const text of ["Bitcoin", "$80,005.50", "+0.02%"]) {
        expect(screen.getByText(text)).not.toHaveClass("font-serif");
      }
    });
  });

  // The foot used to hold a "Manage tokens" action. It now carries the shared
  // ListPagination, the same bar the meme board and the markets list page with.
  // The whole spot universe arrives in one response, so the caller slices it
  // and this table only reports which page to show next.
  describe("pagination", () => {
    it("shows which page of how many is open", () => {
      renderTable({ rows: [row()], page: 2, pageCount: 5 });

      expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
    });

    it("no longer offers the manage tokens action", () => {
      renderTable({ rows: [row()] });

      expect(screen.queryByText("Manage tokens")).not.toBeInTheDocument();
    });

    it("asks for the next page", () => {
      const onPageChange = renderTable({ rows: [row()], page: 2, pageCount: 5 });

      fireEvent.click(screen.getByRole("button", { name: "Next" }));

      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it("asks for the previous page", () => {
      const onPageChange = renderTable({ rows: [row()], page: 2, pageCount: 5 });

      fireEvent.click(screen.getByRole("button", { name: "Prev" }));

      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it("disables prev on the first page and next on the last", () => {
      renderTable({ rows: [row()], page: 1, pageCount: 3 });
      expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

      cleanup();

      renderTable({ rows: [row()], page: 3, pageCount: 3 });
      expect(screen.getByRole("button", { name: "Prev" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("hides itself when the whole list fits on one page", () => {
      renderTable({ rows: [row()], page: 1, pageCount: 1 });

      expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    });

    it("shows no pager at all for a caller that does not page", () => {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <SpotAssetTable rows={[row()]} />
        </NextIntlClientProvider>
      );

      expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    });

    it("cuts the list into pages of the design's nine rows", () => {
      const rows = Array.from({ length: 20 }, (_, i) =>
        row({ id: `T${i}`, symbol: `T${i}`, name: `Token ${i}` })
      );

      expect(SPOT_ASSET_PAGE_SIZE).toBe(9);
      expect(spotAssetPageCount(rows.length)).toBe(3);
      expect(spotAssetPageRows(rows, 1).map((r) => r.id)).toEqual(
        rows.slice(0, 9).map((r) => r.id)
      );
      expect(spotAssetPageRows(rows, 3).map((r) => r.id)).toEqual(["T18", "T19"]);
    });

    it("reports one page for an empty list", () => {
      expect(spotAssetPageCount(0)).toBe(1);
      expect(spotAssetPageRows([], 1)).toEqual([]);
    });

    // The page size follows the panel's height once it has been measured, so
    // both helpers take the size rather than reading the constant.
    it("cuts the list at whatever size the caller pages at", () => {
      const rows = Array.from({ length: 20 }, (_, i) =>
        row({ id: `T${i}`, symbol: `T${i}`, name: `Token ${i}` })
      );

      expect(spotAssetPageCount(rows.length, 12)).toBe(2);
      expect(spotAssetPageRows(rows, 1, 12)).toHaveLength(12);
      expect(spotAssetPageRows(rows, 2, 12).map((r) => r.id)).toEqual(
        rows.slice(12).map((r) => r.id)
      );
    });
  });

  // The panel is as tall as the window, and nine rows left a black band between
  // the last row and the pager. The count now follows the space, which the
  // caller reads through `rowsRef`. jsdom has no layout engine, so what is
  // asserted here is the structure that makes the reading stable: the block the
  // ref lands on takes its height from the panel and never from its own rows.
  describe("fitting the rows to the panel", () => {
    it("publishes the row's real outer height, border included", () => {
      // 58px, measured in Chrome off the rendered table: a 33px asset chip in
      // 12px of vertical padding, plus the 1px bottom rule.
      expect(SPOT_ASSET_ROW_HEIGHT).toBe(58);
    });

    it("hands the caller the block the rows sit in", () => {
      const seen: (HTMLElement | null)[] = [];
      renderTable({ rows: [row()], rowsRef: (node) => seen.push(node) });

      const block = seen.find(Boolean);
      expect(block).toBeTruthy();
      expect(block).toHaveAttribute("role", "rowgroup");
      expect(block).toContainElement(screen.getByRole("row", { name: /BTC/ }));
    });

    it("sizes that block from the panel alone, so the count cannot run away", () => {
      renderTable({ rows: [row()] });

      const block = screen.getByRole("rowgroup");
      expect(block).toHaveClass("grow", "min-h-0", "overflow-hidden");
    });

    it("carries the panel's height down to the rows block", () => {
      renderTable({ rows: [row()] });

      const listRegion = screen.getByRole("grid").parentElement;
      expect(listRegion).toHaveClass("grow", "min-h-0");
      expect(screen.getByRole("grid")).toHaveClass("grow", "min-h-0");
    });

    it("holds the column header at its own height", () => {
      renderTable({ rows: [row()] });

      expect(screen.getByText("Asset").closest('[role="row"]')).toHaveClass("shrink-0");
    });

    it("says there are no results inside the rows block, under the header", () => {
      renderTable({ rows: [] });

      expect(screen.getByRole("rowgroup")).toContainElement(
        screen.getByText(messages.markets.noResults)
      );
    });
  });

  // The panel used to stop under its ninth row while the order ticket beside it
  // ran on, leaving the page background showing below the card. It now fills its
  // grid cell, with the list taking the spare height and the pager at the foot.
  // jsdom has no layout engine, so the fill is asserted as the structure and the
  // classes that produce it, not as a measured height. The heights themselves
  // were measured in Chrome: at 1512px the ticket is 590px with its chart closed
  // against this panel's 625.61px, and 677px with it open.
  describe("filling the panel", () => {
    // The root card. Reached through the grid rather than by a test id, so the
    // assertions below break if the panel's own box is restructured.
    function panel(): HTMLElement {
      const list = screen.getByRole("grid").parentElement;
      const root = list?.parentElement;
      if (!root) throw new Error("the table panel is not where the test expects it");
      return root;
    }

    it("stretches the panel to the height of its grid cell", () => {
      renderTable({ rows: [row()] });

      expect(panel()).toHaveClass("self-stretch");
      expect(panel()).toHaveClass("flex", "flex-col");
    });

    it("gives the spare height to the list region above the pager", () => {
      renderTable({ rows: [row()] });

      const list = screen.getByRole("grid").parentElement;
      expect(list).toHaveClass("grow");
      expect(list).toHaveClass("flex", "flex-col");
    });

    it("puts the pager last, at the foot of the panel", () => {
      renderTable({ rows: [row()], page: 2, pageCount: 5 });

      const children = Array.from(panel().children);
      expect(children).toHaveLength(2);
      expect(children[0]).toContainElement(screen.getByRole("grid"));
      expect(children[1]).toContainElement(screen.getByRole("button", { name: "Next" }));
    });

    it("keeps the empty message under the header rather than at the foot", () => {
      renderTable({ rows: [], page: 2, pageCount: 5 });

      const list = screen.getByRole("grid").parentElement;
      expect(list).toContainElement(screen.getByText(messages.markets.noResults));
    });

    // A taller panel must not push rows behind a scrollbar nobody can see. The
    // panel caps no height and scrolls in neither direction, so its grid cell is
    // always at least as tall as the rows in it.
    it("caps no height and adds no scroller", () => {
      renderTable({ rows: [row()] });

      for (const cls of Array.from(panel().classList)) {
        expect(cls).not.toMatch(/^(max-h-|h-\[|min-h-)/);
        expect(cls).not.toMatch(/^overflow(-[xy])?-(auto|scroll)$/);
      }
    });

    // ListPagination draws nothing on a single page, and nothing stands in for
    // it: the panel is the list region and then the panel's own edge, with no
    // empty bar reserving space for a control that is not there.
    it("reserves no room for the pager on a single page", () => {
      renderTable({ rows: [row()], page: 1, pageCount: 1 });

      const children = Array.from(panel().children);
      expect(children).toHaveLength(1);
      expect(children[0]).toContainElement(screen.getByRole("grid"));
    });

    it("keeps the caller's own classes alongside the stretch", () => {
      renderTable({ rows: [row()], className: "border-red-500" });

      expect(panel()).toHaveClass("self-stretch", "border-red-500");
    });
  });

  // Both rows size themselves from their content, so the leading is what sets
  // their height. Tailwind's 1.5 default inflated the header past the design's
  // 40.85px and the asset row past its 57.24px.
  describe("leading", () => {
    it("gives the header row an explicit leading", () => {
      renderTable({ rows: [row()] });

      expect(screen.getByText("Asset").closest('[role="row"]')).toHaveClass("leading-[1.13]");
    });

    it("gives the asset row an explicit leading", () => {
      renderTable({ rows: [row()] });

      expect(screen.getByRole("row", { name: /BTC/ })).toHaveClass("leading-[1.2]");
    });

    it("does not pin a fixed row height, so a long coin name can grow the box", () => {
      renderTable({
        rows: [row({ name: "A very long coin name that would clip at a fixed height" })],
      });

      const assetRow = screen.getByRole("row", { name: /BTC/ });
      for (const cls of Array.from(assetRow.classList)) {
        expect(cls).not.toMatch(/^h-\[/);
      }
    });
  });
});
