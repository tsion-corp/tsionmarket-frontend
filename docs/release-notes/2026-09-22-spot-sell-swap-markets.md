---
date: 2026-09-22
feature: Selling a swap market from spot, and the meme relink retry
scope: fix
scenario-impact: none
---

# DOGE sells from spot, and a failed relink no longer sticks

DOGE could be bought on the spot desk and not sold there: the sell leg asked
Dextopus for a route to an asset Dextopus does not carry, which came back "The
primary provider found no route for this sale". Selling it from portfolio
holdings worked, because that path uses the Base swap engine instead. DOGE was
delisted from spot on 7 September because of this.

- A spot market that settles through a Base swap now sells through the same
  engine that buys it. The match is on the holding's address and chain, so the
  same ticker on another chain still sells through Dextopus.
- DOGE is listed on spot again, now that both legs work.
- A failed wallet relink no longer counts as the one attempt, so a transient
  failure recovers instead of leaving the sheet saying the wallet is not linked
  for as long as it stays open.
- The EVM path checks the signer is up before spending a challenge on a
  signature it cannot produce. Privy reports the address before the signer is
  ready; the Solana path already handled this.
- A refused preview is no longer shown over a running trade. The preview is off
  while a trade runs, so its last answer was stale.
