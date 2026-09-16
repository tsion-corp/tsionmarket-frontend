import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AssetTable,
  assetPageCount,
  assetPageRows,
  type AssetTableLabels,
} from "@/components/ui/asset-table";
import { ASSET_PAGE_SIZE } from "@/components/ui/desk-layout";
import type { AssetRowView } from "@/components/ui/asset-table-row";

// Every render below is done with no NextIntlClientProvider around it, which is
// the point of the suite: the promoted table draws the copy it is handed, and a
// catalogue read anywhere inside it would throw rather than pass quietly.
//
// ListPagination is the one child that does read the catalogue, and it reads it
// through a hook called before its single-page early return, so even a
// one-page render would throw on the provider it does not have. It is stubbed
// here so the assertion above stays about the table. The real pager, in its
// real place at the foot of the panel, is covered by
// features/trade/components/spot-asset-table.test.tsx.
vi.mock("@/components/ui/list-pagination", () => ({
  ListPagination: ({ page, pages }: { page: number; pages: number }) =>
    pages <= 1 ? null : <div data-testid="pager">{`${page}/${pages}`}</div>,
}));

// Deliberately not English and not in any catalogue: if the table ever reached
// for `markets` again, these would stop appearing.
const LABELS: AssetTableLabels = {
  grid: "GRID LABEL",
  asset: "ASSET LABEL",
  price: "PRICE LABEL",
  change24h: "CHANGE LABEL",
  metric: "METRIC LABEL",
  noResults: "NOTHING HERE",
};

function row(over: Partial<AssetRowView> = {}): AssetRowView {
  return {
    id: "BTC",
    symbol: "BTC",
    name: "Bitcoin",
    logo: null,
    bg: "#f7931a",
    price: "$80,005.50",
    change24h: "+0.02%",
    changeDirection: "up",
    metric: "$1.3T",
    ...over,
  };
}

function renderTable(props: Partial<React.ComponentProps<typeof AssetTable>> = {}) {
  render(<AssetTable rows={[]} labels={LABELS} {...props} />);
}

describe("AssetTable", () => {
  it("draws the labels it is handed and reads no catalogue", () => {
    renderTable({ rows: [row()] });

    expect(screen.getByRole("grid")).toHaveAccessibleName("GRID LABEL");
    for (const label of ["ASSET LABEL", "PRICE LABEL", "CHANGE LABEL", "METRIC LABEL"]) {
      expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
    }
    // The spot wording the table used to hardcode.
    expect(screen.queryByText("Mcap")).not.toBeInTheDocument();
  });

  it("renders one row per entry", () => {
    renderTable({
      rows: [row(), row({ id: "ETH", symbol: "ETH", name: "Ethereum", metric: "$400B" })],
    });

    // The header is a row too, so two assets make three.
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("row", { name: /BTC/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /ETH/ })).toBeInTheDocument();
    expect(screen.getByText("$400B")).toBeInTheDocument();
  });

  it("says there are no results, in the caller's words, under the header", () => {
    renderTable({ rows: [] });

    expect(screen.getByRole("rowgroup")).toContainElement(screen.getByText("NOTHING HERE"));
    expect(screen.queryAllByRole("gridcell")).toHaveLength(0);
  });

  it("drops the no-results line as soon as there is a row", () => {
    renderTable({ rows: [row()] });

    expect(screen.queryByText("NOTHING HERE")).not.toBeInTheDocument();
  });

  it("marks and paints the selected row, and only that one", () => {
    renderTable({
      rows: [row(), row({ id: "ETH", symbol: "ETH", name: "Ethereum" })],
      selectedId: "BTC",
    });

    const selected = screen.getByRole("row", { name: /BTC/ });
    const other = screen.getByRole("row", { name: /ETH/ });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(selected).toHaveClass("bg-white/6");
    expect(other).toHaveAttribute("aria-selected", "false");
    expect(other).not.toHaveClass("bg-white/6");
  });

  it("reports the row id when a row is chosen", () => {
    const onSelect = vi.fn();
    renderTable({ rows: [row({ id: "ETH", symbol: "ETH", name: "Ethereum" })], onSelect });

    fireEvent.click(screen.getByRole("row", { name: /ETH/ }));

    expect(onSelect).toHaveBeenCalledWith("ETH");
  });

  it("hands the caller the block the rows sit in", () => {
    const seen: (HTMLElement | null)[] = [];
    renderTable({ rows: [row()], rowsRef: (node) => seen.push(node) });

    const block = seen.find(Boolean);
    expect(block).toHaveAttribute("role", "rowgroup");
    expect(block).toContainElement(screen.getByRole("row", { name: /BTC/ }));
  });

  describe("paging", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ id: `T${i}`, symbol: `T${i}`, name: `Token ${i}` })
    );

    it("cuts the list at the shared page size by default", () => {
      expect(ASSET_PAGE_SIZE).toBe(9);
      expect(assetPageCount(rows.length)).toBe(3);
      expect(assetPageRows(rows, 1).map((r) => r.id)).toEqual(rows.slice(0, 9).map((r) => r.id));
      expect(assetPageRows(rows, 3).map((r) => r.id)).toEqual(["T18", "T19"]);
    });

    it("cuts the list at whatever size the caller pages at", () => {
      expect(assetPageCount(rows.length, 12)).toBe(2);
      expect(assetPageRows(rows, 1, 12)).toHaveLength(12);
      expect(assetPageRows(rows, 2, 12).map((r) => r.id)).toEqual(rows.slice(12).map((r) => r.id));
    });

    it("treats a page below one as the first page", () => {
      expect(assetPageRows(rows, 0, 5).map((r) => r.id)).toEqual(rows.slice(0, 5).map((r) => r.id));
    });

    // An empty list is still a page you are standing on, so the pager reads
    // "Page 1 of 1" rather than "Page 1 of 0".
    it("reports at least one page, whatever it is asked", () => {
      expect(assetPageCount(0)).toBe(1);
      expect(assetPageCount(-5)).toBe(1);
      expect(assetPageCount(20, 0)).toBe(1);
      expect(assetPageRows([], 1)).toEqual([]);
    });

    it("renders the page it is told to show", () => {
      renderTable({ rows: assetPageRows(rows, 2), page: 2, pageCount: 3 });

      expect(screen.getByRole("row", { name: /T9/ })).toBeInTheDocument();
      expect(screen.queryByRole("row", { name: /T0/ })).not.toBeInTheDocument();
      expect(screen.getByTestId("pager")).toHaveTextContent("2/3");
    });
  });
});
