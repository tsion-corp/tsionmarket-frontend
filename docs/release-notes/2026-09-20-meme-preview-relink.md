---
date: 2026-09-20
feature: Selling a token the service says is unlinked
scope: fix
scenario-impact: none
---

# A refused wallet link now actually re-links

A user could not sell their DOGE: every row of the sell preview read "—" under
"This wallet isn't linked to your account yet", and it never recovered.

The browser keeps a hint that a wallet has already been linked, so repeat
trades skip the signature. When the service refuses a preview because the
wallet is not linked, the app links once and asks again, but that link trusted
the hint and returned without doing anything. The preview then failed the same
way, for as long as the hint survived.

The link after a refusal is now forced: the service's word wins over the
browser's hint. The hint is also dropped one wallet at a time, so a failure on
Base no longer costs a second signature on Solana.
