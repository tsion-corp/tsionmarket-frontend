# Plan: memecoin board (2026-09-07)

Companion to ADR-2026-09-07-memecoin-board. Built on `feat/solana-memecoin-trading`
because the board shows both chains and needs that branch's `lib/meme/chain.ts`.

## Source

The stash `memecoin rebuild: fixed sidebar, grid, filters` on
`feat/memecoin-page-shell` (2026-09-02). Ported, not applied: the tree has
moved (route groups, chain-aware `lib/meme`, feed-driven dashboard).

## Steps

1. Red: `catalog.test.ts` (wrapped majors), `api.chain.test.ts` (`?chain=`
   on the catalogue), `meme-grid.test.tsx` (chain tag, chain lane, catalogue
   down, search failed). Confirm each fails for its own reason.
2. Green, lib: `isWrappedMajor`, `isMemecoinHere` in `lib/meme/catalog.ts`;
   `fetchTokenCatalog(page, limit, chain?)`; `searchTokens` through the same
   boundary filter.
3. Green, hooks: `useMemeCatalog(page, limit, chain?)` with `error`,
   `refetch`; `useMemeSearch` with `error`.
4. Locale keys in en, de, es, fr, pt: riskAll, allTitle, noneInBands,
   colRisk, clearSearch, searchAllLabel, searchTrendingLabel, filters,
   chainAll, chainBase, chainSolana, retry.
5. Components: `ChainTag` in `meme-bits`; `meme-chain-filter`,
   `meme-unavailable`; port `meme-grid`, `meme-trending`,
   `meme-filter-button`, `meme-risk-filter`, `meme-search-input`,
   `lib/meme-fixture`; `meme-board` composes; route renders the board.
6. Delete `meme-section`, `meme-mode`, `meme-simple-view`, `meme-pro-view`,
   `interface-mode`.
7. Gates: format, lint, typecheck, vitest, build.
8. Verify the board's requests against the dev proxy: catalogue (all, base,
   solana), trending, search. Record timings and any upstream faults.

## Interface contracts

- `MemeTrending({ onOpen })`, `MemeGrid({ onOpen })`: `onOpen(token: MemeToken)`.
- `MemeChainFilter({ active: MemeChainSlug | undefined, onChange })`.
- `MemeUnavailable({ onRetry? })`.
- Cards keyed by `${chainId}:${address}`.

## Test strategy

Component tests mock `use-meme-tokens` and render with the English catalog,
so a missing key fails loudly. Lib tests mock `apiFetch` and assert the URL.
