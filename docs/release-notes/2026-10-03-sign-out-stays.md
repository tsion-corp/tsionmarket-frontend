---
date: 2026-10-03
feature: Signing out keeps you on the page you were on
scope: fix
scenario-impact: updated
---

# Signing out keeps you on the page

Since browse-first every page opens without a session, so there is no reason
to send someone to the sign-in page when they sign out. Found on staging after
#612.

- **Account menu (desktop) and account sheet (phone):** Sign out ends the
  session and closes the menu or sheet. The page stays, the rail and topbar
  switch to the Sign in button, and the cached account data is cleared by the
  existing session cache guard.
- **Chess lobby:** a session the chess backend refuses is signed out and the
  page shows its "Sign in to play" panel, instead of going to `/auth`.

Unchanged: the migration flow's "use a different account" still goes to the
sign-in page, because signing in again is the point of that button.

## Scenario impact

Updated: sign out from the account menu on any page and check the page stays,
with Sign in in the rail.
