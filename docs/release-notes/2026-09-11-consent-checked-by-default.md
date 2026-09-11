---
date: 2026-09-11
feature: Consent boxes on the sign in page start ticked
scope: auth
scenario-impact: updated
---

# Consent boxes on the sign in page start ticked

## What changed

- **Both boxes start ticked.** Accepting the terms and the privacy policy,
  and product email, are offered ticked, so the usual sign in is one tap
  fewer. Product email can be turned off with no comment.
- **Unticking the terms says why at once.** Every sign in method goes dark
  as before, and an error toast now says that the terms and privacy policy
  must be agreed to before continuing. The hint under the boxes stays as
  well. Ticking the box again clears it.
- **An offered tick is not an acceptance.** Nothing is stamped as accepted
  until the person proceeds with the box ticked. The acceptance time is set
  when the sign in completes, which is when the answers are recorded on the
  account, so the record still says when they agreed.
- **An untick is remembered.** A person who unticks the terms and reloads
  sees it unticked, not offered again. An acceptance of an older version of
  the terms is offered ticked again, and a fresh acceptance is stamped when
  they proceed.

## Tests

`components/auth/consent-checks.test.tsx` (default state, the toast on
untick and not on re-tick or on product email), `lib/consent.test.ts` (the
offered default, the older-version case, the acceptance stamped at sign in).

## Scenarios

- Open the sign in page fresh: both boxes ticked, no hint, buttons live.
- Untick the terms: toast "You need to agree to the Terms of Service and
  Privacy Policy to continue.", buttons dark, hint shown. Tick again: hint
  gone, no second toast, buttons live.
- Sign in with the boxes as offered: `POST /api/consent` carries the sign in
  time as `acceptedAt` and `marketing: true`.
