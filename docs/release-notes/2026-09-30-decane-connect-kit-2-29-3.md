---
date: 2026-09-30
feature: decane-connect-kit 2.29.3, the signer 0.2.13 attestation
scope: chore
scenario-impact: none
---

# decane-connect-kit 2.29.2 -> 2.29.3

A runtime-only patch: no type declaration, dependency or export changed
between the two versions (diffed tarball to tarball). What changed is the
enclave the kit trusts. The Decane CVM was restarted on 2026-09-30 with
signer 0.2.13, which moved the platform-recorded RTMR3 measurement while
the app-id and compose hash stayed the same; 2.29.3 carries that new
measurement (captured 18:36 UTC) and the new signer version. A frontend on
2.29.2 would refuse the restarted enclave, so production needs this before
its next deploy.

Preflight on the bump: the whole suite, the production build, the bundle
budget.
