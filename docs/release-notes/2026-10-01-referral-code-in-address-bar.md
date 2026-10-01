---
date: 2026-10-01
feature: A signed-in user's referral code stays in the address bar, so every copied link credits them
scope: feat
scenario-impact: needs_automation
---

# Your referral code in every link you copy

See `docs/adr/ADR-2026-10-01-referral-code-in-address-bar.md`.

Most pages have no share button, and most people share by copying the
address bar, so most shared links credited nobody. Now, while a user is
signed in and has a referral code, the address bar always carries
`?ref=<their code>`: `AddressBarReferral`, mounted once in the session
providers, writes it with `history.replaceState` on every page and query
change, keeping every other parameter and the hash, and only when the bar
differs. No reload, no extra history entry. It leaves `/auth`,
`/interests`, `/legacy-export` and `/r/*` alone, and writes nothing while
signed out or before the code has loaded.

The user's own code replaces any code already in the bar, so a recipient who
signs in shares under their own code from then on; the sharer was already
captured by the cookie.

The middleware no longer strips `ref` with a redirect: it still sets the
`ark_ref` cookie under the same rules (valid code, never overwrite) and now
attaches it to whatever response the launch and maintenance gates produce.
kash already refuses self-referral, so refreshing one's own link credits no
one.

Scenario to automate: copy a market URL signed in, open it in a private
window, sign up, deposit, see the referral in the sharer's network.
