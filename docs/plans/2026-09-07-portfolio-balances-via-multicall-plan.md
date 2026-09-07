# Plan: EVM balances through Multicall3 over the read pool

Decision: `docs/adr/ADR-2026-09-07-portfolio-balances-via-multicall.md`.
Branch: `perf/portfolio-reads-via-multicall`, off `origin/main`.

## Scope

Two new server modules, one function change in `lib/server/alchemy.ts`, and
tests. No route, hook, component or type seen by the client changes.

## Steps

1. **Research.** ZeroDev per-chain capability, Multicall3 deployment on all 28
   networks, Alchemy CU costs, registry shapes. Done; in the ADR.
2. **Red.**
   - `lib/server/evm-read.test.ts`: ZeroDev answers, Alchemy untouched; HTTP
     400 from ZeroDev goes to Alchemy and the chain is skipped for ten
     minutes; a "method not found" envelope does the same; a 429 backs
     ZeroDev off for a minute; a transport failure falls through once.
   - `lib/server/portfolio-holdings.test.ts`: one HTTP batch per network
     with `eth_getBalance` and one Multicall3 `eth_call` whose calldata names
     every allowed contract; decoding into rows; a cold network is not
     re-read within ten minutes while a hot one is after 75 s; `fresh`
     bypasses; the chain-id map covers every `EVM_NETWORKS` entry.
   - `lib/server/alchemy.test.ts`: `fetchPortfolio(evm)` never calls
     `assets/tokens/by-address`; `fetchPortfolio(undefined, solana)` still
     does; held tokens carry on-chain metadata and by-address prices.
3. **Green.** `lib/server/evm-read.ts`, `lib/server/portfolio-holdings.ts`,
   `allowedContracts` and the EVM branch of `fetchPortfolio`.
4. **Audit.** Adversarial pass: decoding edge cases (failed sub-calls, short
   return data, non-standard `symbol()` bytes32), cache-key collisions,
   concurrency, fallback loops, CU under ZeroDev outage.
5. **Release note.** `docs/release-notes/2026-09-07-portfolio-balances-via-multicall.md`,
   `scenario-impact: updated`.
6. **Verify.** `./scripts/preflight.sh`; dev server holdings compared with
   production for the same wallet.
7. **Deliver.** PR against `main`.

## Interface contracts

- `readEvm(network, chainId, calls) → RpcEnvelope[]` in batch order.
- `readEvmPortfolioTokens(address, networks, contractsFor, fresh) → AlchemyToken[]`.
- `fetchPortfolio(evm?, solana?, skipCache?) → Portfolio` unchanged.

## Out of scope

Solana balances (Helius); moving the identity of the read pool; per-network
spending caps.
