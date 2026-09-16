---
date: 2026-09-12
feature: A dev branch carries everything, beside staging and main
scope: repo
scenario-impact: none
---

# A dev branch carries everything, beside staging and main

## What changed

The repository has a third long-lived branch. `dev` is cut from `staging` as
it stands today, so it carries every feature and every service the product
has, whether or not the production gateway serves it yet: the perps desk,
Arkjet and Pilot Chicken, the Explore market, the ArkStore ticket, and
everything that was already on staging.

- **`dev`** is the full set, and the branch a new feature is cut from.
- **`staging`** is what the staging deployment runs.
- **`main`** is production, and carries only what the production gateway can
  serve.

A change moves `dev` to `staging` to `main`, and the step into `main` stays a
decision: it is where someone confirms the backend is live in production.

## What this commit does

- **CI runs on `dev`.** The workflow watched `main` and `staging` only, so a
  pull request into `dev` would have had no `quality` check to pass.
- **Lint ignores sibling worktrees.** `.worktrees/**` holds whole checkouts of
  this repo, build output included, so a lint run from the main checkout read
  megabytes of bundled vendor code out of each one's `.next`. That is what made
  the pre-push gate crawl before a push that carried no code at all.
- **The three branches are written down**, in `CONTRIBUTING.md` for people and
  in `AGENTS.md` and the engineering standards skill for agents, which both
  said to branch off `main` and open pull requests against it.

Creating the branch and protecting it are the two steps that live outside a
commit: `ship-dev-branch.sh` cuts and pushes it, `protect-dev-branch.sh` gives
it the same protection `staging` has (the `quality` check, up-to-date before
merge, admins included, pushes restricted to the maintainer).
