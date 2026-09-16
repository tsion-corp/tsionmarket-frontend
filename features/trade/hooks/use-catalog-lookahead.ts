"use client";

import { useCallback, useEffect, useState } from "react";
import { CATALOG_PAGE_LIMIT } from "@/lib/meme/catalog";

// How many list pages the desk keeps loaded past the one showing. Enough that
// the numbered bar shows a real run of pages and Next is instant, without
// fetching the catalogue far beyond where anyone is reading.
export const CATALOG_LOOKAHEAD_PAGES = 5;

// Server rows the background fetch may pull without the view keeping one of
// them, before it stops and waits for the reader to ask. Curated keeps a few
// percent of a page, and deep in the catalogue it can keep none, so without a
// budget a lookahead that is never satisfied would walk every page there is.
const BARREN_ROW_BUDGET = 2 * CATALOG_PAGE_LIMIT;

export interface CatalogLookaheadInput {
  /** Off while something other than the catalogue fills the list, a search. */
  enabled: boolean;
  /** Loaded list pages after the one showing. */
  pagesAhead: number;
  /** Server rows fetched so far. */
  loaded: number;
  /** Of those, the rows the view keeps. */
  shownCount: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  /** The last page fetch failed; it is retried only when the reader asks. */
  failed: boolean;
  loadMore: () => void;
}

/**
 * Loads the catalogue's next server page in the background while the reader
 * is within CATALOG_LOOKAHEAD_PAGES of the end of what has loaded, so paging
 * never stops at a "Load more". `requestMore` is the reader asking outright
 * (Next on the last page, or a retry), which always fetches and restores the
 * background budget.
 */
export function useCatalogLookahead({
  enabled,
  pagesAhead,
  loaded,
  shownCount,
  hasMore,
  isLoading,
  isLoadingMore,
  failed,
  loadMore,
}: CatalogLookaheadInput): { stalled: boolean; requestMore: () => void } {
  // Where the view last gained a row. Rows fetched past this point that
  // brought nothing to show count against the budget. Adjusted while
  // rendering, the way React recommends for state derived from props.
  const [mark, setMark] = useState({ loaded, shownCount });
  if (shownCount !== mark.shownCount) setMark({ loaded, shownCount });

  const stalled = loaded - mark.loaded >= BARREN_ROW_BUDGET;
  const shouldFetch =
    enabled &&
    hasMore &&
    !isLoading &&
    !isLoadingMore &&
    !failed &&
    !stalled &&
    pagesAhead < CATALOG_LOOKAHEAD_PAGES;

  useEffect(() => {
    if (shouldFetch) loadMore();
  }, [shouldFetch, loadMore]);

  const requestMore = useCallback(() => {
    if (!hasMore) return;
    setMark({ loaded, shownCount });
    loadMore();
  }, [hasMore, loaded, shownCount, loadMore]);

  return { stalled, requestMore };
}
