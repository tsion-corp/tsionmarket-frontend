---
title: A refused registration no longer fails a delivered memecoin trade
date: 2026-09-09
area: memecoins
scenario-impact: needs_automation
---

# Release Note: a 409 at registration is a recording refusal, not a failed trade

## What happened

A production recording on 2026-09-09: a two-call Base quote (approval, then
swap). Call 0 registered 201. By call 1 the trade service had verified the
approval, failed its transaction-target check on the sponsored user
operation, marked the swap FAILED, and answered 409 "Swap cannot accept
another submission". The swap had executed and the wallet held the coin,
but the sheet said "The trade didn't complete": the hook threw inside the
registration loop, before the on-chain delivery proof from #392 could run.
The same happened on the sell.

## What changed

A 409 at registration is caught, logged, and remembered. The remaining
calls still execute, the balance delta is read, and the outcome is decided
on it: delivered means done, with `trade_recording_mismatch` tracked for the
trade team; nothing delivered means the original error. Any other
registration error still fails as before.

The backend fault is unchanged and still reported: the verifier compares a
sponsored user operation's bundle transaction with the prepared call.
