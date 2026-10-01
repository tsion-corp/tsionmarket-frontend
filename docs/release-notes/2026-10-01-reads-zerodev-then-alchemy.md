---
date: 2026-10-01
feature: EVM reads go ZeroDev then Alchemy; the Base node from #527 is out of the pool
scope: fix
scenario-impact: none
---

# Reads: ZeroDev, then Alchemy

The balance card showed `$0.00` for wallets that hold money. #527
(2026-09-19) had put a Base node of our own (`BASE_READ_RPC_URL` +
`BASE_READ_RPC_TOKEN`) in front of the read pool for every Base read:
portfolio balances, the vault status, gas. By the maintainer's call that
node is out of the order for now: its answers are not trusted, and a wrong
answer is worse than a slow one, because the pool only falls back on an
error or a timeout, never on a figure that is merely wrong.

`readEvm` is what it was before #527: ZeroDev first, the Alchemy key pool
when ZeroDev cannot serve the chain or the method. The two environment
variables are ignored if set and leave `.env.example`. Nothing else from
#527 changes.

Red-green: a test that sets the two variables and expects the first read to
reach ZeroDev fails against the old pool and passes against this one.
