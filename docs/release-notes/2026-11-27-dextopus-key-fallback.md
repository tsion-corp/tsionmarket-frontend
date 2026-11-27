---
date: 2026-11-27
branch: fix/dextopus-key-fallback
base: main
scenario-impact: none
---

# Send works even when the withdrawal Dextopus key is dead

Production's `DEXTOPUS_WITHDRAW_API_KEY` named an integration Dextopus had
deactivated. Every withdrawal call got 401 "Invalid or inactive API key", so
Send couldn't list tokens, while the deposit key still worked.

`lib/server/dextopus.ts` now retries a call once with `DEXTOPUS_API_KEY` when
Dextopus rejects a purpose-specific key with 401, and logs an error that
names the dead key. A rejected deposit key, or a purpose already using
`DEXTOPUS_API_KEY`, isn't retried. Locked by a regression test that fails
without the fix.

The dead key should still be replaced in the server env.
