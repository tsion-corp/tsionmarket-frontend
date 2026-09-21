---
date: 2026-09-21
feature: Dust balances and the funding screens
scope: fix
scenario-impact: none
---

# Balances read $0.00, and the funding flows fill the phone

Unsolicited tokens worth a fraction of a cent were counted in the balance, so
the card read "<$0.01" for anyone who had been sent them, new accounts included.

- The balance totals only what it can show as a figure, so a wallet holding
  nothing but dust reads "$0.00".
- The holdings table's toggle now covers dust as well as zero-value rows, and
  reads "Hide small balances". Those rows are one switch away, not gone.
- Every deposit and withdraw step fills the phone, with Back on the same row as
  the close button and no scroll inside a scroll. The two entry sheets are
  unchanged.
- The deposit address screen fits without scrolling.
- "How to deposit?" opens a plain-English guide.
- The withdraw flow's search box filters the token and network lists. It was
  wired to state nothing read.
