---
scenario-impact: updated
---

# Release Note: EVM balances read on-chain through the read pool

## Summary

Every portfolio refresh paid Alchemy's Portfolio API (360 CU per request,
two requests for 28 EVM networks, up to ten pages each because of spam
tokens) to download every token a wallet had ever received, then kept only
the allowlist. EVM balances now come from the chain: per network one
`eth_getBalance` and one Multicall3 `aggregate3` of `balanceOf` for exactly
the allowed contracts, standard JSON-RPC, through ZeroDev first and the
Alchemy key pool when ZeroDev cannot serve the chain or the method. Solana is
unchanged for now.

Decision record: `docs/adr/ADR-2026-09-07-portfolio-balances-via-multicall.md`
and its plain-English companion, with the per-chain ZeroDev capability table.
Plan: `docs/plans/2026-09-07-portfolio-balances-via-multicall-plan.md`.

## What changed

- `lib/server/evm-read.ts` (new): the read pool. ZeroDev first; a chain or
  method ZeroDev cannot serve is remembered for ten minutes; a ZeroDev 429
  backs the provider off for a minute; other failures fall through once.
- `lib/server/portfolio-holdings.ts` (new): one batch per network; hot
  networks (Base, Ethereum, Arbitrum, Optimism, Polygon) cached 75 s, the
  other 23 ten minutes, or hot for an hour once the wallet is seen holding
  something there; `fresh=1` bypasses as before. Metadata from the contracts,
  cached a day; a best-effort logo from Alchemy; prices by address for held
  tokens only, cached per token and shared across users.
- `lib/server/alchemy.ts`: `allowedContracts(network, rwa, buyable)`;
  `fetchPortfolio`'s EVM branch uses the new reader. Signature, result shape,
  `normalize`, baseline rows and route error semantics unchanged.

## Operations note (separate from this change)

With #398's key pool, a free Alchemy key placed first in `ALCHEMY_API_KEY`
with a blank slot in the policy lists serves reads and prices from the free
30M CU before the paid key, while sponsorship uses the paid pair alone.

## Verification

- Red then green: 22 new cases across the three modules, including the
  provider-order cooldowns, one batch per network with every allowed
  contract, decoding, hot/cold cadence, `fresh`, and that `fetchPortfolio`
  never calls the Portfolio API for an EVM wallet and still does for Solana.
- `./scripts/preflight.sh` in full.
- After deploy: Alchemy dashboard shows Portfolio API calls falling to the
  Solana-only rate; a signed-in wallet's holdings match the previous list.

## Scenario impact

`updated`: on the 23 cold networks a deposit that did not come through the
app appears within ten minutes instead of one; a few tokens may show a badge
instead of a logo. Nothing else visible.
