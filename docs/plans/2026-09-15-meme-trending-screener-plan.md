# Plan: Trending strip and market screener on the memecoin desk and phone tab

ADR: `docs/adr/ADR-2026-09-15-meme-trending-screener.md` (approved 2026-09-15,
with the phone tab and filtered Trending as amendments).
Branch: `feat/meme-trending-screener`, cut from `origin/staging` (`b130d664`).

## Ground rules for every slice

- Layers point down: `app/` to `features/trade/` to `components/ui/` and
  `hooks/` to `lib/`. No cross-feature imports. No `fetch` in components.
- Money and percentages stay decimal strings. Comparisons and arithmetic on
  them use bigint fixed point. A JS number is only allowed for a count
  (transactions, traders) and for a pixel or percentage width at the
  rendering edge.
- `null` renders `—` (or `memeScreener.changePending` where a label reads
  better). Never `0`, and no truthiness checks on market fields.
- Token identity is `catalogKey(token)` (`chainId:address`). Never lowercase an
  address.
- No swallowed errors, no `any`, no `@ts-ignore`. A storage failure is reported
  through the injected `warn`.
- Strings come from the `memeScreener` namespace, already in all five
  catalogues. A slice that needs a new string adds it to all five catalogues
  and runs `lib/i18n-catalogs.test.ts`.
- Comments are plain English, explain why, no em-dashes.
- Tests first for every pure module. Components get Testing Library tests.
- Touch only the files your slice owns (table below). Do not edit other
  slices' files. If you need a change there, report it.

## Slice ownership

| Slice | Owner          | Files (new unless marked "edit")                                                                                                                                                                                   |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | lead (done)    | `lib/meme/types.ts` (edit: `MemeTimeframe`, `MemeActivity`, `activity`, `pairCreatedAt`), `messages/*.json` (edit: `memeScreener`), ADRs, this plan                                                                |
| A1    | data agent     | `lib/api/schemas/trade.ts` (edit), `lib/meme/parse.ts` (edit), `lib/meme/screener.ts`, `lib/meme/momentum.ts`, `lib/meme/what-if.ts`, `lib/session-cache.ts`, plus their tests and the parse/schema test additions |
| A2    | hooks agent    | `lib/meme/api.ts` (edit: two new exports only), `features/trade/hooks/use-meme-screener.ts`, tests                                                                                                                 |
| B     | trending agent | `features/trade/components/meme-gamified-bits.tsx`, `features/trade/components/meme-trending-strip.tsx`, tests                                                                                                     |
| C     | screener agent | `features/trade/components/meme-screener-toolbar.tsx`, `features/trade/components/meme-screener-filters.tsx`, `features/trade/components/meme-sort-menu.tsx`, tests                                                |
| D1    | desk agent     | `features/trade/components/meme-desktop-board.tsx` (edit), `app/(session)/(app)/meme/page.tsx` (edit), their tests (edit)                                                                                          |
| D2    | phone agent    | `features/trade/components/mobile-market-view.tsx` (edit), its test (edit)                                                                                                                                         |
| E     | lead           | release note, preflight, manual pass                                                                                                                                                                               |

Order: A1 first, since everything imports it. Then A2, B and C in parallel.
Then D1 and D2 in parallel. Then E.

## Interface contracts

### `lib/meme/types.ts` (done)

```ts
export type MemeTimeframe = "5m" | "1h" | "6h" | "12h" | "24h";
export interface MemeActivity {
  volumeUsd: string | null;
  transactions: number | null;
  traders: number | null;
  priceChangePercent: string | null;
}
// MemeToken gains: activity?: Partial<Record<MemeTimeframe, MemeActivity>>; pairCreatedAt?: string | null;
```

### A1: schema and parser

- `tokenListItemSchema` gains
  `activity: z.record(z.enum(["5m","1h","6h","12h","24h"]), activityWindowSchema).optional()`.
  It must be a partial record: unknown window keys are dropped, not a failure.
  Each window is `{ volumeUsd: nullableDecimal.optional(), transactions: z.number().int().nonnegative().nullable().optional(), traders: same, priceChangePercent: nullableDecimal.optional() }`,
  and absent fields map to `null`. It also gains
  `pairCreatedAt: nullableString.optional()`.
- The detail schema is not changed.
- `toMemeToken` copies `activity`, normalising every window to the four keys
  with `null` for absent ones, and `pairCreatedAt` (`?? null`). Search rows
  without them leave `activity` undefined.
- Check `nullableDecimal` accepts float artifacts such as
  `"12.340000000000002"` and negatives such as `"-4.5"`. If it does not, the
  schema must accept them for `priceChangePercent`.

### A1: `lib/meme/screener.ts` (pure, no React)

```ts
export const MEME_TIMEFRAMES: readonly MemeTimeframe[]; // ["5m","1h","6h","12h","24h"]
export const DEFAULT_TIMEFRAME: MemeTimeframe; // "24h"
export type ScreenerMetric =
  "marketCap" | "price" | "age" | "transactions" | "volume" | "traders" | "liquidity";
export const SCREENER_METRICS: readonly ScreenerMetric[]; // that order
export const TIMEFRAME_SCOPED: ReadonlySet<ScreenerMetric>; // transactions, volume, traders
export type SortOrder = "asc" | "desc";
export interface ScreenerSort {
  by: ScreenerMetric;
  order: SortOrder;
}
export interface ScreenerBound {
  min?: string;
  max?: string;
} // canonical decimal strings
export interface ScreenerFilters {
  bounds: Partial<Record<ScreenerMetric, ScreenerBound>>;
  sort: ScreenerSort | null;
}
export const EMPTY_FILTERS: ScreenerFilters; // { bounds: {}, sort: null }

// "250k" -> "250000", "1.5m" -> "1500000", "2B" -> "2000000000", " 0.00001 " -> "0.00001",
// "1,000" -> "1000". Exact (string/bigint), no exponent, no sign.
// "" -> "" (empty is allowed = no bound). Anything else -> null (invalid).
export function parseBoundInput(raw: string): string | null;

export type BoundError = "notNumber" | "minAboveMax";
export interface BoundDraft {
  min: string;
  max: string;
} // raw input text
export type ScreenerDraft = Record<ScreenerMetric, BoundDraft>;
export function draftFrom(filters: ScreenerFilters): ScreenerDraft;
// Every field parsed; minAboveMax compared exactly. { ok: true, bounds } or { ok: false, errors }.
export function readDraft(
  draft: ScreenerDraft
):
  | { ok: true; bounds: ScreenerFilters["bounds"] }
  | { ok: false; errors: Partial<Record<ScreenerMetric, { min?: BoundError; max?: BoundError }>> };

export function compareDecimal(a: string, b: string): -1 | 0 | 1; // non-negative canonical decimals, exact
export function screenerActive(f: ScreenerFilters): boolean; // sort set or any min/max set
export function hasBounds(f: ScreenerFilters): boolean;
export function activeCount(f: ScreenerFilters): number; // one per set min, one per set max, plus one for a sort
export function usesTimeframe(f: ScreenerFilters, withSort: boolean): boolean; // a scoped bound, or (withSort && scoped sort)

// Canonical query without a leading "?" or "&": keys sorted, canonical names only,
// e.g. "maxMarketCapUsd=1000000&minLiquidityUsd=10000&sortBy=volume&sortOrder=desc&timeframe=1h".
// Returns "" when !screenerActive(f). timeframe only when usesTimeframe(f, true).
export function screenerQuery(f: ScreenerFilters, timeframe: MemeTimeframe): string;
// Bounds only (never sortBy/sortOrder). "" when !hasBounds(f). timeframe only when usesTimeframe(f, false).
export function trendingQuery(f: ScreenerFilters, timeframe: MemeTimeframe): string;
// Param names: marketCap->MarketCapUsd, price->PriceUsd, age->AgeMinutes, transactions->Transactions,
// volume->VolumeUsd, traders->Traders, liquidity->LiquidityUsd, as min<Name>/max<Name>.

export type ScreenerPresetId = "fresh" | "movers" | "micro" | "deep" | "crowd";
export const SCREENER_PRESETS: readonly { id: ScreenerPresetId; filters: ScreenerFilters }[];
//  fresh:  bounds.age.max "60", sort { by: "age", order: "asc" }   (asc = newest first)
//  movers: sort { by: "volume", order: "desc" }
//  micro:  bounds.marketCap.max "1000000"
//  deep:   bounds.liquidity.min "100000"
//  crowd:  sort { by: "traders", order: "desc" }
export function presetFor(f: ScreenerFilters): ScreenerPresetId | null; // exact structural match

// Runtime guard for state restored from sessionStorage. Rejects any non-canonical value.
export function isScreenerFilters(x: unknown): x is ScreenerFilters;
export function isMemeTimeframe(x: unknown): x is MemeTimeframe;

// Minutes since the pair was created, floored, or null for null/unparsable/future.
export function ageMinutes(pairCreatedAt: string | null | undefined, now: number): number | null;
// The value the table's extra column shows for a sort metric. Money as a decimal string, counts and age as numbers.
export function metricValue(
  token: MemeToken,
  metric: ScreenerMetric,
  timeframe: MemeTimeframe,
  now: number
):
  | { kind: "usd"; value: string | null }
  | { kind: "count"; value: number | null }
  | { kind: "age"; minutes: number | null };
// For volume at "24h", activity["24h"].volumeUsd ?? token.volume24hUsd. Other windows never fall back.
```

### A1: `lib/meme/momentum.ts` (pure)

```ts
// activity[tf].priceChangePercent; for "24h" only, falls back to priceChange24hPercent.
export function changeFor(token: MemeToken, timeframe: MemeTimeframe): string | null;
export function volumeFor(token: MemeToken, timeframe: MemeTimeframe): string | null; // same fallback rule for 24h
export type Momentum = "mooning" | "pumping" | "cooling" | "dumping";
// Exact decimal thresholds: >= 50 mooning, >= 10 pumping, <= -30 dumping, <= -10 cooling, else null. Null in, null out.
export function momentumOf(change: string | null): Momentum | null;
// Integer 0..100 width for a 2px change bar: |change| capped at 100, rounded down. Null in, null out.
export function changeBarPercent(change: string | null): number | null;
// Integer 0..100 per token: volumeFor / max volume among the given tokens, via bigint. Null volume -> null.
// All volumes null or max 0 -> every non-null volume maps to 0.
export function heatShares(
  tokens: MemeToken[],
  timeframe: MemeTimeframe
): Map<string, number | null>; // key catalogKey
// Up to n keys of tokens with a strictly positive change, highest first; ties by input order.
export function topGainerKeys(
  tokens: MemeToken[],
  timeframe: MemeTimeframe,
  n?: number
): Set<string>; // n default 3
```

### A1: `lib/meme/what-if.ts` (pure)

```ts
// stake * (1 + change/100), exact, rounded half-up to 2 decimals, floored at "0.00".
// whatIfValue("100", "12.34") === "112.34"; ("100", "-100") === "0.00"; ("100", "12.340000000000002") === "112.34"; (…, null) === null.
export function whatIfValue(stakeUsd: string, changePercent: string | null): string | null;
export const WHAT_IF_STAKE_USD = "100";
```

### A1: `lib/session-cache.ts` (pure, framework free)

```ts
export interface SessionCacheEntry<T> {
  data: T;
  savedAt: number;
}
export interface SessionCache {
  read<T>(key: string, maxAgeMs: number): SessionCacheEntry<T> | null; // expired, wrong version, corrupt -> null and removed
  write<T>(key: string, data: T): void; // evicts oldest beyond maxEntries; on quota error evict oldest and retry once, then warn
  remove(key: string): void;
}
export function createSessionCache(opts: {
  namespace: string; // stored as `${namespace}.${key}`
  version: number;
  maxEntries: number; // counts only this namespace's keys
  storage?: Storage | null; // default: window.sessionStorage when accessible, else null (no-op cache, no warn)
  now?: () => number;
  warn?: (message: string, error: unknown) => void; // default console.warn
}): SessionCache;
```

Accessing `window.sessionStorage` can itself throw (sandboxed iframe). Detect
that once, with a comment, and use a no-op cache. That is a capability check,
not a swallowed failure.

### A2: `lib/meme/api.ts` (add only)

```ts
export const SCREENER_PAGE_LIMIT = CATALOG_PAGE_LIMIT; // 500
export const TRENDING_BOARD_LIMIT = 100;
// GET /tokens?page=N&limit=500&<query>. Parsed, not judged (the view is applied in the hook).
export function fetchScreenerPage(page: number, query: string): Promise<Paged<MemeToken>>;
// GET /tokens/trending?limit=100[&<query>]. No fallback, no catch.
export function fetchTrendingBoard(query: string, limit?: number): Promise<Paged<MemeToken>>;
```

### A2: `features/trade/hooks/use-meme-screener.ts`

```ts
export const SCREENER_STALE_MS = 60_000;
export const SCREENER_SESSION_MAX_AGE_MS = 5 * 60_000;
export const TRENDING_REFRESH_MS = 120_000;

// Key ["meme-screener","trending",query]. initialData from session cache "trending:"+query (<= 5 min),
// initialDataUpdatedAt = savedAt. staleTime 60s. refetchInterval 120s. subscribed: useSectionActive().
// Writes each successful result back. tradableHere(page, view) applied in a memo (view not in key).
export function useTrendingBoard(opts: { query: string; view: DiscoveryView }): {
  tokens: MemeToken[];
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
};

// Key ["meme-screener","list",query]. useInfiniteQuery, initialPageParam 1, getNextPageParam nextCatalogPage,
// enabled only when `enabled`. initialData { pages, pageParams } from session cache "list:"+query.
// Same return shape as useMemeCatalog (tokens, total, loaded, shownCount, hasMore, loadMore,
// isLoadingMore, loadMoreFailed, isLoading, isFetching, error, refetch). isLoading is false while disabled.
export function useScreenerCatalog(opts: {
  query: string;
  view: DiscoveryView;
  enabled: boolean;
}): ReturnType<typeof useMemeCatalog>;

// The one controller both surfaces use.
export function useMemeScreener(opts: { view: DiscoveryView; trendingPageSize: number }): {
  timeframe: MemeTimeframe;
  setTimeframe(tf: MemeTimeframe): void;
  filters: ScreenerFilters; // applied
  active: boolean;
  count: number;
  preset: ScreenerPresetId | null;
  apply(bounds: ScreenerFilters["bounds"]): void; // keeps the sort
  setSort(sort: ScreenerSort | null): void;
  applyPreset(id: ScreenerPresetId): void; // replaces bounds and sort with the preset's
  clearBound(metric: ScreenerMetric, side: "min" | "max"): void;
  clearAll(): void;
  listQuery: string; // screenerQuery(filters, timeframe)
  list: ReturnType<typeof useScreenerCatalog>; // enabled = active
  trending: ReturnType<typeof useTrendingBoard> & {
    page: number;
    pages: number;
    pageTokens: MemeToken[];
    setPage(p: number): void;
    filtered: boolean;
  };
  resetKey: string; // changes whenever listQuery changes, so a list can go back to page 1
};
```

UI state (`timeframe`, `filters`) is mirrored to the session cache under key
`ui` (namespace `wsws.meme-screener`, version 1, maxEntries 12, no expiry for
`ui`). It is restored in an effect after mount and validated with
`isScreenerFilters`/`isMemeTimeframe`, so server and client render the same
first frame. The trending page clamps to `[1, pages]` and returns to 1 when the
trending query changes.

### B: `features/trade/components/meme-gamified-bits.tsx`

```tsx
export function RankRing({ rank }: { rank: number }): JSX.Element; // silver ring from winners-list; rank <= 3 stronger
export function MomentumTag({ momentum }: { momentum: Momentum | null }): JSX.Element | null; // emoji + t(momentumX); RiskBadge pill shape; up tones for mooning/pumping, down for cooling/dumping
export function WhatIfLine({
  change,
  timeframe,
}: {
  change: string | null;
  timeframe: MemeTimeframe;
}): JSX.Element | null; // "$100 → $112.34", title = whatIfHint
export function HeatBar({ share }: { share: number | null }): JSX.Element; // ProgressBar; null -> empty + heatNoData (sr text)
export function ChangeBar({ change }: { change: string | null }): JSX.Element | null; // 2px bar, bg-up/bg-down, width changeBarPercent
export function TimeframeLabel(tf: MemeTimeframe); // helper returning the t key: `timeframe${tf}`
export function formatMetric(value: ReturnType<typeof metricValue>, t): string; // usd -> compactUsd, count -> grouped, age -> ageMinutes/Hours/Days
```

### B: `features/trade/components/meme-trending-strip.tsx`

```tsx
interface MemeTrendingStripProps {
  variant: "desk" | "phone";
  tokens: MemeToken[]; // the current page's tokens
  rankOffset: number; // (page - 1) * pageSize, so ranks continue across pages
  heat: Map<string, number | null>; // heatShares over ALL trending tokens
  timeframe: MemeTimeframe;
  page: number;
  pages: number;
  onPageChange(page: number): void;
  filtered: boolean;
  isLoading: boolean;
  error: unknown;
  onRetry(): void;
  selectedKey: string | null;
  onSelect(token: MemeToken): void;
}
export const TRENDING_DESK_PAGE_SIZE = 4;
export const TRENDING_PHONE_PAGE_SIZE = 5;
export const TRENDING_DESK_HEIGHT = 172; // px, fixed on desk in every state so the list's fitted rows do not jump
```

- **Desk:**
  - `ws-card`-toned section (`border-hairline bg-surface rounded-card border`) with a fixed height.
  - Header: `FlameIcon`, `t("memeScreener.trendingTitle")`, subtitle (`trendingFiltered` when `filtered`), and the compact pager at the right (`trendingPrev`/`trendingNext` aria labels, `trendingPageOf` text).
  - A 4-column grid of cards. Each card is a `button` with `aria-label={trendingCardLabel}` and `aria-current` when selected.
  - Card contents: `RankRing`, `MemeCoin` (28), symbol, the change in `ws-display tnum` (`PctChange` colours), `MomentumTag`, `WhatIfLine`, `HeatBar`, and the price wrapped in `FlashPrice`.
- **Phone:** the same cards, horizontally scrollable (`flex snap-x snap-mandatory gap-2 overflow-x-auto ws-no-scrollbar`), each card `w-[212px] shrink-0`, pager under the row.
- **Loading:** skeleton cards (`animate-pulse rounded-[14px] bg-white/6`) with `aria-hidden`. Never use the `Loading…` label, because a board test counts that label.
- **Error:** `trendingUnavailable` plus the retry pill (`meme.retry`). Empty: `trendingEmpty` or `trendingEmptyFiltered`.
- **Motion:** stagger `motion` entry (0.04s each, capped at 0.3s), none under `useReducedMotion`.
- A card's accessible name must not contain the token's `name`. Page tests match rows by `/coin/` from fixture names.

### C: toolbar, sort menu, filters

```tsx
interface MemeScreenerToolbarProps {
  variant: "desk" | "phone";
  timeframe: MemeTimeframe;
  onTimeframeChange(tf: MemeTimeframe): void;
  filters: ScreenerFilters;
  count: number;
  preset: ScreenerPresetId | null;
  onApply(bounds: ScreenerFilters["bounds"]): void;
  onSortChange(sort: ScreenerSort | null): void;
  onPreset(id: ScreenerPresetId): void;
  onClearBound(metric: ScreenerMetric, side: "min" | "max"): void;
  onClearAll(): void;
  paused: boolean; // a search is showing: controls stay usable, a note says filters are paused
}
export const SCREENER_TOOLBAR_DESK_HEIGHT = 36; // px; chips scroll horizontally inside the same row
```

- **Timeframe:**
  - `role="group"` with `aria-label={timeframeLabel}` and `aria-pressed` buttons.
  - Track classes from `MemeViewSwitch`.
  - On phone the track scrolls horizontally.
- **`MemeSortMenu` (`meme-sort-menu.tsx`):**
  - Button label `sortLabel`, or `sortApplied` when a sort is set.
  - Opens a list: `sortNone` plus the seven metrics. Picking a metric sets `desc`, or `asc` for `age`.
  - A direction toggle per active metric reads `sortAsc`/`sortDesc`, or `sortNewest`/`sortOldest` for age.
  - Desk: popover with the `MemeFilterButton` panel classes, closed by outside click and Escape. Phone: `ModalShell`.
- **`MemeScreenerFilters` (`meme-screener-filters.tsx`):**
  - Button `filtersLabel`, with a count badge when `count > 0` (`MemeFilterButton` badge).
  - Panel contents:
    - `presetsLabel`, then preset chips (`RiskFilter` chip classes, `aria-pressed` for `preset`).
    - Seven rows with `bound<Metric>` label, and `min`/`max` text inputs (`inputMode="decimal"`, placeholder from `amountHint`, `ws-invalid` plus inline `errorNotNumber`/`errorMinAboveMax` when invalid).
    - **Reset** clears the draft. **Apply** is disabled while the draft is invalid; it calls `onApply` and closes.
  - The draft is local state seeded from `draftFrom(filters)` each time the panel opens. Typing never calls a prop.
  - A preset chip calls `onPreset` and closes.
  - Desk: popover, 340px wide, scrolls inside at `max-h-[min(70vh,560px)]`. Phone: `ModalShell`.
- **Chips:**
  - One per set bound (`chipMin`/`chipMax`/`chipRange`, values via `compactUsd`, grouped counts, or minutes), plus one for the sort (`sortApplied`), plus `clearAll` when `count > 1`.
  - Each chip's ✕ has `aria-label={removeChip}`.
  - The hint `windowScopedHint` shows when a scoped bound is applied. `pausedBySearch` shows when `paused`.
  - Desk: one row, `overflow-x-auto ws-no-scrollbar`, fixed height. Phone: wraps under the controls.

### D1: desk wiring

- **`MemeDesktopBoard` gains optional props:**
  - `trending?: ReactNode`
  - `screener?: ReactNode`
  - `timeframe?: MemeTimeframe` (default `"24h"`)
  - `sortMetric?: ScreenerMetric | null`
  - `now?: number`
  - `topGainers?: Set<string>`
- **With neither `trending` nor `screener`, the DOM is unchanged.**
  - The existing structure test must still pass unedited for that case.
  - When either is given, a `data-region="left-column"` wrapper (`flex min-w-0 flex-1 flex-col gap-3 self-stretch min-h-[682px]`) holds them above `token-list`.
  - In that case `token-list` drops `min-h-[682px]` and becomes `min-h-0 flex-1`. New tests cover this.
- **Change column:** the header shows `memeScreener.timeframe<tf>`, and the cell shows `PctChange value={changeFor(token, tf)}` with `ChangeBar` under it. At `24h` this is exactly today's value.
- **Metric column:** when `sortMetric` is set and is not price or market cap, a fifth 96px column shows `formatMetric(metricValue(...))`. The grid template gains `_96px` only in that case.
- **Top gainers:** a 🔥 (`aria-label={topGainer}`) sits after the symbol for keys in `topGainers`.
- **Page (`meme/page.tsx`):**
  - Calls `useMemeScreener({ view, trendingPageSize: TRENDING_DESK_PAGE_SIZE })`.
  - Rows come from search results when a search is active, otherwise from `screener.list.tokens` when `screener.active`, otherwise from `catalog.tokens`.
  - Paging, lookahead and `MemeCatalogMore` read from the same live source.
  - The list key used to reset the page includes `screener.resetKey`.
  - The rail and ticket code is not touched.
- **Tests:** `page.test.tsx` mocks `@/features/trade/hooks/use-meme-screener`. The inactive default must keep every existing assertion green. Add tests for the screener source, reset to page 1, search priority, and the trending card selecting into the rail.

### D2: phone wiring

- `mobile-market-view.tsx`'s Memecoins list area only:
  - calls `useMemeScreener({ view: memeView, trendingPageSize: TRENDING_PHONE_PAGE_SIZE })`;
  - renders the strip (variant phone), then the toolbar (variant phone), inside the scroll box after the view switch;
  - picks `memeRows` from search, then screener, then catalogue, with the same rule as the desk;
  - puts the timeframe change and `ChangeBar` in the row. When a sort metric other than price or market cap is applied, the metric value shows as the name line's trailing text.
- `MemeCatalogMore` reads the live source. A trending card opens the meme ticket, as a row does.
- **Tests:** extend `mobile-market-view.test.tsx` with a mock of the screener hook, and keep existing memecoin tab assertions green.

## Test strategy

Each pure module gets exact-value unit tests. The hooks are tested through
`renderHook` with a real `QueryClient`, a mocked `apiFetch`, and an in-memory
`Storage`. Components get Testing Library tests for: null values, the invalid
draft, keyboard close, aria labels and names, reduced motion, and the
loading, error and empty states. The page and phone tab get wiring tests. The
full gate is `./scripts/preflight.sh`.
