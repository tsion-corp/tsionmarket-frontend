---
date: 2026-09-29
feature: Chicken Cross traffic always approaches the player without exposing outcomes
scope: fix
scenario-impact: needs_automation
---

# Chicken traffic moves consistently forward

Ambient planes now always travel from the far end of the lane toward the
player. Arrival delay, flight duration and plane texture remain independently
sampled with browser cryptographic randomness, so removing reverse flights does
not introduce a repeating traffic schedule.

Ambient traffic is visual only and receives no session, seed, step or outcome
data. It is hidden while a resolved step animates. A collision plane is shown
only after the backend has settled a losing step and returned the result, while
the interaction remains locked.

Liquidity-settled losses use the same player-facing loss presentation as other
losses. Proof and audit data continue to retain the authoritative outcome
reason.

## Verification

The traffic sampler test covers bounded delays and durations, non-periodic
arrivals and plane texture variation. A 200,000-round independence audit found
effectively zero correlation between HMAC outcomes and ambient delay, duration
or texture. Prettier, ESLint, TypeScript, Vitest, production build, bundle
budget and release-note checks must pass before release.
