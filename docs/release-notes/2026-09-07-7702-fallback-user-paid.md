---
scenario-impact: updated
---

# Release Note: Monad and Frax back to user-paid; sponsored sends fall back when a bundler refuses EIP-7702

## Summary

A real send on Monad was refused by Alchemy's bundler with "EIP-7702 is not
supported on entry point 0x4337…ff108 or is disabled", the v0.8 entry point
the app's 7702 account uses, and only at send time; Frax's bundler has no
v0.8 entry point at all. Both are unflagged. Because no probe short of a real
send reveals this and most sponsored chains have not had one, the send hook
now falls back once to the ordinary user-paid transaction when a sponsored
send is refused with an EIP-7702 message; every other failure is reported
as before.

Decision record: second addendum in `docs/adr/ADR-2026-09-07-sponsor-all-evm-mainnets.md`.

## What changed

- `config/alchemy-bso-evm-networks.json`: `monad-mainnet` and `frax-mainnet`
  unflagged.
- `hooks/use-evm-send.ts`: fallback to `sendTransaction` on an EIP-7702
  refusal, with a warning; no fallback on any other sponsored error.
- Tests: registry set; fallback taken on the refusal, not taken on AA21.

## Verification

Red then green; full preflight. After deploy: a Monad send from a wallet
holding MON for gas completes user-paid; a Base sponsored send is unchanged.

## Scenario impact

`updated`: on Monad and Frax the sell sheet asks for native gas again; on
any other chain whose bundler refuses 7702, the send completes user-paid
instead of failing, and asks for gas only if the wallet has none.
