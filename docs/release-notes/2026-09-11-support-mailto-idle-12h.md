---
date: 2026-09-11
feature: Support bubble emails support, idle sign-out after 12 hours
scope: layout, auth
scenario-impact: updated
---

# Support bubble emails support, idle sign-out after 12 hours

## What changed

- The floating support button opens the user's mail client addressed to
  `support@tsionark.com` (the `SUPPORT_EMAIL` constant in `lib/brand.ts`),
  in the same tab. It used to open a Google Form in a new tab.
- An authenticated session is signed out after 12 hours without any
  interaction, up from two hours. The "signed out after N hours" toast reads
  the same constant, so it says 12 in every locale.

## Scenarios

- Tap the support bubble on any signed-in page: the mail client opens with
  the To field filled with support@tsionark.com.
- Leave a signed-in tab untouched for 12 hours: the session ends with the
  inactivity toast; before that, it stays signed in.

## Tests

`components/layout/support-button.test.tsx`, `components/auth/auth-guard.test.tsx`.
