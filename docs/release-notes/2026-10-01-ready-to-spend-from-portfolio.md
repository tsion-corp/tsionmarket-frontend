---
date: 2026-10-01
feature: Ready to spend reads the portfolio again, not the user-management balance endpoint
scope: fix
scenario-impact: none
---

# Ready to spend, back on the portfolio

The balance card showed "Ready to spend unavailable" for everyone. #558
(2026-09-25, ADR-2026-09-23-user-balance-endpoint, §1a) had moved that one
figure to the user-management balance endpoint, deliberately with no
fallback to the portfolio. That endpoint is down, so the figure had nothing
to show and the withdraw gate had nothing to reason from.

By the maintainer's call the figure is back where it was before #558: the
stablecoin sum of the portfolio the card already holds, read on-chain
through the RPC pool like the headline total, the token list and the
breakdown. The three states #558 introduced are kept, so a portfolio still
loading draws a skeleton, one that failed with nothing cached says
"unavailable", and neither is ever drawn as a zero; the withdraw hold still
never fires on an unknown figure.

The endpoint, its proxy route, parser, hook and fixtures stay in the tree
unused by the card, for when the service is back and the ADR's reasoning
is revisited. Nothing else from #558 changes.
