import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CATALOG_LOOKAHEAD_PAGES,
  useCatalogLookahead,
  type CatalogLookaheadInput,
} from "@/features/trade/hooks/use-catalog-lookahead";
import { CATALOG_PAGE_LIMIT } from "@/lib/meme/catalog";

// The memecoin desk pages through the catalogue without a "Load more": the
// next server page is fetched in the background while the reader is within a
// few pages of the end of what has loaded. What these pin is when it fetches,
// and that it gives up on a run of server pages the view keeps nothing from
// rather than walking the whole catalogue on its own.

function input(over: Partial<CatalogLookaheadInput> = {}): CatalogLookaheadInput {
  return {
    enabled: true,
    pagesAhead: 1,
    loaded: CATALOG_PAGE_LIMIT,
    shownCount: 20,
    hasMore: true,
    isLoading: false,
    isLoadingMore: false,
    failed: false,
    loadMore: vi.fn(),
    ...over,
  };
}

describe("useCatalogLookahead", () => {
  it("fetches the next server page while few pages are left ahead", () => {
    const args = input({ pagesAhead: CATALOG_LOOKAHEAD_PAGES - 1 });
    renderHook(() => useCatalogLookahead(args));
    expect(args.loadMore).toHaveBeenCalledOnce();
  });

  it("waits once enough pages are loaded ahead", () => {
    const args = input({ pagesAhead: CATALOG_LOOKAHEAD_PAGES });
    renderHook(() => useCatalogLookahead(args));
    expect(args.loadMore).not.toHaveBeenCalled();
  });

  it.each([
    ["the catalogue is complete", { hasMore: false }],
    ["the first page is still loading", { isLoading: true }],
    ["a page is already on its way", { isLoadingMore: true }],
    ["the last page failed", { failed: true }],
    ["a search has replaced the catalogue", { enabled: false }],
  ])("does not fetch when %s", (_, over) => {
    const args = input({ pagesAhead: 0, ...over });
    renderHook(() => useCatalogLookahead(args));
    expect(args.loadMore).not.toHaveBeenCalled();
  });

  it("keeps fetching as each page lands, until the pages ahead are enough", () => {
    const loadMore = vi.fn();
    const { rerender } = renderHook((props: CatalogLookaheadInput) => useCatalogLookahead(props), {
      initialProps: input({ pagesAhead: 0, loadMore }),
    });
    expect(loadMore).toHaveBeenCalledTimes(1);

    rerender(input({ pagesAhead: 0, loadMore, isLoadingMore: true }));
    rerender(input({ pagesAhead: 2, loadMore, loaded: 2 * CATALOG_PAGE_LIMIT, shownCount: 40 }));
    expect(loadMore).toHaveBeenCalledTimes(2);

    rerender(input({ pagesAhead: 2, loadMore, isLoadingMore: true }));
    rerender(
      input({
        pagesAhead: CATALOG_LOOKAHEAD_PAGES,
        loadMore,
        loaded: 3 * CATALOG_PAGE_LIMIT,
        shownCount: 80,
      })
    );
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it("stops after two server pages the view kept nothing from", () => {
    const loadMore = vi.fn();
    const { rerender } = renderHook((props: CatalogLookaheadInput) => useCatalogLookahead(props), {
      initialProps: input({ pagesAhead: 0, loadMore, loaded: 500, shownCount: 20 }),
    });
    expect(loadMore).toHaveBeenCalledTimes(1);

    // A page of 500 that added no row the view shows.
    rerender(input({ pagesAhead: 0, loadMore, loaded: 500, shownCount: 20, isLoadingMore: true }));
    rerender(input({ pagesAhead: 0, loadMore, loaded: 1000, shownCount: 20 }));
    expect(loadMore).toHaveBeenCalledTimes(2);

    // A second barren page: the budget is spent.
    rerender(input({ pagesAhead: 0, loadMore, loaded: 1000, shownCount: 20, isLoadingMore: true }));
    rerender(input({ pagesAhead: 0, loadMore, loaded: 1500, shownCount: 20 }));
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it("asks again when the reader does, even after the budget is spent", () => {
    const loadMore = vi.fn();
    const { result, rerender } = renderHook(
      (props: CatalogLookaheadInput) => useCatalogLookahead(props),
      { initialProps: input({ pagesAhead: 0, loadMore, loaded: 500, shownCount: 20 }) }
    );
    rerender(input({ pagesAhead: 0, loadMore, loaded: 1500, shownCount: 20 }));
    expect(result.current.stalled).toBe(true);
    const before = loadMore.mock.calls.length;

    act(() => result.current.requestMore());
    expect(loadMore.mock.calls.length).toBeGreaterThan(before);
    expect(result.current.stalled).toBe(false);
  });

  it("starts a fresh budget once a page brings rows the view shows", () => {
    const loadMore = vi.fn();
    const { result, rerender } = renderHook(
      (props: CatalogLookaheadInput) => useCatalogLookahead(props),
      { initialProps: input({ pagesAhead: 0, loadMore, loaded: 500, shownCount: 20 }) }
    );
    rerender(input({ pagesAhead: 0, loadMore, loaded: 1500, shownCount: 20 }));
    expect(result.current.stalled).toBe(true);

    rerender(input({ pagesAhead: 0, loadMore, loaded: 2000, shownCount: 31 }));
    expect(result.current.stalled).toBe(false);
  });
});
