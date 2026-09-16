import type { ScreenerMetric } from "@/lib/meme/screener";

// The desk table's columns, described once.
//
// The header row and the row body used to spell the same four columns out
// separately and had to be kept in step by hand. This is the one description
// both read, and what the TanStack table instance is built from
// (ADR-2026-09-16-meme-table-tanstack).
//
// Rendering stays ours: the table is a CSS grid of buttons with a measured row
// count, not <table> markup, because the panel's height depends on the rows
// contributing nothing to it. TanStack supplies the row model and the sorting
// state, nothing else.

/** Which screener metric a column sorts by, when it can sort at all. */
export type MemeColumnId = "asset" | "price" | "change" | "marketCap" | "metric";

export interface MemeColumn {
  id: MemeColumnId;
  /**
   * The screener metric a click on this heading sorts by. Null for a column
   * with nothing to sort: the asset column is an identity, and the change
   * column has no matching screener bound.
   */
  sortsBy: ScreenerMetric | null;
  /** Right-aligned, as every figure column is. */
  numeric: boolean;
}

// Price and market cap already have columns of their own, so a sort by either
// never adds the extra metric column.
export const SHOWN_METRICS: ReadonlySet<ScreenerMetric> = new Set<ScreenerMetric>([
  "price",
  "marketCap",
]);

const BASE_COLUMNS: readonly MemeColumn[] = [
  { id: "asset", sortsBy: null, numeric: false },
  { id: "price", sortsBy: "price", numeric: true },
  // The change column reads the selected window and has no screener bound of
  // its own, so it is shown but not sortable from the heading.
  { id: "change", sortsBy: null, numeric: true },
  { id: "marketCap", sortsBy: "marketCap", numeric: true },
];

/**
 * The columns to draw, given the metric the extra column is showing.
 *
 * `metricColumn` is the sorted metric the table does not already have a column
 * for; null when the sort is by price or market cap, or when nothing is sorted.
 */
export function memeColumns(metricColumn: ScreenerMetric | null): MemeColumn[] {
  const columns = [...BASE_COLUMNS];
  if (metricColumn !== null) {
    columns.push({ id: "metric", sortsBy: metricColumn, numeric: true });
  }
  return columns;
}

/**
 * The extra column's metric, or null when the table already shows it.
 *
 * Kept here beside the column list so the two cannot disagree about when the
 * fifth column exists.
 */
export function metricColumnFor(sortMetric: ScreenerMetric | null): ScreenerMetric | null {
  return sortMetric !== null && !SHOWN_METRICS.has(sortMetric) ? sortMetric : null;
}

/**
 * What a click on `column`'s heading should set the sort to, given the sort in
 * force.
 *
 * A column that is not the sorted one starts descending, because the first
 * question asked of a screener is "which is the biggest". Clicking the sorted
 * column flips it, and clicking it a third time clears the sort rather than
 * cycling back to descending, so a heading can always be undone.
 *
 * Null for a column that cannot sort, and null means "no sort" for the caller.
 */
export function nextSortFor(
  column: MemeColumn,
  current: { by: ScreenerMetric; order: "asc" | "desc" } | null
): { by: ScreenerMetric; order: "asc" | "desc" } | null {
  if (column.sortsBy === null) return current;
  if (current === null || current.by !== column.sortsBy) {
    return { by: column.sortsBy, order: "desc" };
  }
  return current.order === "desc" ? { by: column.sortsBy, order: "asc" } : null;
}

/** The value for `aria-sort` on a heading cell. */
export function ariaSortFor(
  column: MemeColumn,
  current: { by: ScreenerMetric; order: "asc" | "desc" } | null
): "ascending" | "descending" | "none" | undefined {
  if (column.sortsBy === null) return undefined;
  if (current === null || current.by !== column.sortsBy) return "none";
  return current.order === "asc" ? "ascending" : "descending";
}
