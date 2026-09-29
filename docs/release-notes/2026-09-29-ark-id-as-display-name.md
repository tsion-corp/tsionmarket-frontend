---
date: 2026-09-29
feature: The shell names the person by their Ark ID
scope: feat
scenario-impact: none
---

# Ark ID as the display name

Where the shell names the person, it now shows the wallet's Ark ID once one
is held: the sidebar's account button, the account popover, the phone
topbar, and the account modal read `signor.ark` where the profile name was.
A wallet without an Ark ID sees the profile name exactly as before, and the
email line is unchanged everywhere.

Only a verified `.ark` reverse record counts, the same rule the Kash card
and the send form apply, and the lookup shares their cache, so this is no
extra request. Until it answers, or if it fails, the profile name stands, so
the shell never renders blank.

Two hooks carry it: `useArkName(wallet)` wraps the reverse lookup, and
`useDisplayName()` is what the four surfaces read. The avatar keeps its
stable seed and the profile name, so nobody's picture re-rolls.

Out of scope, by decision: the referral page's username and the referral
tree keep their own rules.
