---
date: 2026-09-10
feature: Terms of Service page
scope: legal pages, sign in
scenario-impact: updated
---

# Terms of Service page

## What changed

- New guest page at `/terms`, the terms on which people use Ark. Written in
  plain language, structured the way terms for a trading and gaming platform
  are expected to be: who can use it, the non custodial wallet, what the
  platform does and does not do, the risks, games and wagers in Arkade,
  Kash+ rewards, fees, conduct, content in Market Square, intellectual
  property, availability, disclaimers, limits on liability, indemnity,
  ending the agreement, governing law and disputes, changes, contact.
- The privacy policy and the terms now share one layout,
  `components/ui/legal-document.tsx`, so the two documents cannot drift in
  appearance. The privacy page's content and tests are unchanged.
- The sign in page's "Terms" and "Privacy Policy" links pointed at `#`.
  They now open `/terms` and `/privacy` in a new tab.
- `/terms` stays open under maintenance, like `/privacy`.
- **Consent on the sign in page.** Two checkboxes replace the "by
  continuing you agree" line: accepting the Terms of Service and Privacy
  Policy, which every sign in method now waits on (the buttons stay disabled
  with a line saying why), and an optional opt in to product email, off by
  default. The answers are kept on the device (`wsws.consent.v1`) so they
  survive an OAuth round trip and a returning person is not asked again; an
  acceptance of an older terms version does not carry over.
- **Consent endpoint.** `POST /api/consent` records the answers on the
  signed in account as Privy custom metadata (`terms_version`,
  `terms_accepted_at`, `marketing_opt_in`, `consent_updated_at`), which is
  the user store the campaign sender already reads. A yes to email also
  adds the account's sign in address to the platform's subscriber list
  (`POST /v1/perp/waitlist`, source `auth-optin`). `GET /api/consent`
  reads the record back. The client sends it once per account after a sign
  in completes, off the critical path, and retries on the next sign in if
  it failed.
- The waitlist route accepts a `source` from a fixed list (`waitlist-page`,
  `auth-optin`).
- New strings in all five locales: `auth.agreeCheckbox`,
  `auth.marketingOptIn`, `auth.agreeToContinue`; `auth.agree` is gone.

## To confirm before merging

- The governing law section names "the country in which the company
  operating Ark is incorporated" rather than a specific country, because
  the entity is not named anywhere in the codebase. Replace it with the real
  jurisdiction when that is settled.

## Tests

`app/terms/terms.test.tsx` (sections, anchors, contact address, custody and
finality statements, no em-dashes), `app/privacy/privacy.test.tsx`
(unchanged, passing against the shared layout), `proxy.test.ts`,
`lib/consent.test.ts` (storage, versioning, the once-per-account record),
`components/auth/consent-checks.test.tsx` (both boxes, both links, storage
on each click), `app/api/consent/route.test.ts` (record kept alongside
existing metadata, subscribe on yes, nothing on no or without an email,
401 and 400 paths, account store down, list down).
