---
date: 2026-09-19
feature: Chess in-play balance recovery
scope: fix
scenario-impact: none
---

# Chess reads the correct in-play balance

Production Chess requests now use the production Chess ledger instead of the
staging service. Local development can still override the service explicitly.

The in-play amount is derived from available plus locked ledger funds and uses
the same stable session wallet as the portfolio. Loading or failed reads no
longer appear to users as a zero balance.
