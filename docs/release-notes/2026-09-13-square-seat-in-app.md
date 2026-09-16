---
date: 2026-09-13
feature: The phone tab bar's Square seat opens the app's own Square page
scope: navigation
scenario-impact: updated
---

# The phone tab bar's Square seat opens the app's own Square page

## What changed

On a phone, the centre Square seat of the tab bar opened the Square's own
deployment in a new tab. It now opens `/square`, the app's own Square page,
exactly as the desktop rail's entry has since ADR-2026-09-12 — and it rides to
the centre while the reader is on that page, like every other seat on its route.
"Open the Square" on the page remains the way out to the Square itself.

## Why

The maintainer asked for the phone to behave like the desktop (2026-09-13): the
whole point of the in-app page is that people see the Square without leaving.

## How it was verified

`components/layout/curved-tab-bar.test.tsx`: the seat pushes `/square` and
opens no window (written red against the outbound behaviour first), and the
seat is marked current while the active section is `square`.

## Scenario impact

Updated: the phone tab bar's Square seat now stays in the app.
