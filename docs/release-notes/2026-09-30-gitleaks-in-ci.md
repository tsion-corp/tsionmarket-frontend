---
date: 2026-09-30
feature: Secret scanning in CI, with the allowlist the external scan lacked
scope: chore
scenario-impact: none
---

# gitleaks in CI

The 2026-09-29 external assessment reported 120 findings against this repo
and every one was a false positive: test fixtures read as credentials,
`RegExp.exec` read as code execution, a Lichess build tool read as a
deployed CORS endpoint. The repository had no way to prove otherwise.

Now it does. A `secrets` job runs gitleaks over the whole history on every
pull request and push, and the `quality` gate requires it. `.gitleaks.toml`
extends the default provider rules and allowlists what a scanner without it
gets wrong: `*.test.*` and `__tests__/` fixtures, the vendored bundles under
`public/npm`, `public/compiled`, `public/chess` and `reference/`, the chess
UI's `.build/` tooling, and the lockfile.

Running it for real turned up what the audit's tool never reached: the
generic rule reads contract addresses, localStorage key names, an icon file
name and a blank `.env.example` line as keys, so those are allowlisted by
value shape rather than by path. It also found one thing worth knowing: the
Vivid support widget's browser key sat in `app/layout.tsx` from 2026-08-01
to 2026-08-23, shipped to every visitor as `window.__VIVID_CONFIG`. Public
by design and gone with the widget, so it is allowlisted by commit; nothing
in the code reads it today.

Whole history rather than the diff, because a key that was committed and
later removed is still leaked. The binary runs from its own pinned image
rather than the marketplace action, which wants a licence for organisation
repositories.

Alongside, and outside this PR: GitHub secret scanning and push protection
are now on for the repository, with 0 alerts after the history scan.
