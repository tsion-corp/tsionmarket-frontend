# ADR-2026-09-07: Gas-free sends on every EVM chain (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-07, on the maintainer's instruction ("all evm chains").

---

## What Is This Document?

The plain-English companion to
[`ADR-2026-09-07-sponsor-all-evm-mainnets.md`](ADR-2026-09-07-sponsor-all-evm-mainnets.md).
It explains why selling USDC on Arbitrum asked for ETH, and what changes.

---

## The Problem

A user tried to sell USDC on Arbitrum and the app said "Your Arbitrum wallet
needs a little ETH before it can send". The first guess was that the gas
sponsorship budget had run out. It had not.

The real reason: three days ago the app was changed so that it only pays gas
on chains it has been told have a sponsorship policy, and it was told about
two, Base and Polygon. On every other chain it assumes the user pays their own
gas, checks their wallet for the chain's coin, and stops if there is none. It
never even asks Alchemy.

We checked Alchemy directly, chain by chain. The one policy the team has
already covers every mainnet our key can reach: Ethereum, Arbitrum, Optimism,
BNB, HyperEVM and eighteen more. The app simply did not know.

## What We Do

Tell the app. Twenty-three mainnets are now marked as sponsored, all through
the same paymaster path that Base and Polygon already use. No new code: it is
one setting per chain and the tests that lock the list in.

Left out on purpose: testnets (no sponsorship there), two mainnets our key
cannot reach (Arbitrum Nova, Polynomial), and one the app cannot read
transaction results from (Edge). Sponsoring those would break sends that work
today.

## What Changes For Users

Selling and buying on those chains no longer needs a gas coin in the wallet.
Selling "max" of a chain's own coin sells all of it.

## What To Watch

- **Budget.** All of these chains spend from the same sponsorship budget.
  Ethereum mainnet is expensive; one transaction there can cost what hundreds
  cost on the L2s. You asked for it included, so it is. Per-network spending
  limits live in the Alchemy dashboard.
- **First send on the smaller chains.** The sponsored path relies on a wallet
  feature (EIP-7702) that the big chains all support. For a few of the smaller
  ones the first real send is the proof. If one refuses, the server log says
  exactly why, and turning that chain back off is one line.
