# ADR-2026-09-09: Moving the new design to the live site (Plain English Guide / ADR for Dummies)

## Status

Proposed, 2026-09-09. Waiting for the maintainer to authorize. Nothing has
been changed yet.

## The Problem

The new 2.0 design was built on the staging site, which talks to a staging
backend. Some of what it shows, the perps desk, the Explore prediction
market, two new casino games, needs backends the live site does not have
yet, or is simply not wanted yet. The rest is ready.

## What We Do

Rather than copy the new design across piece by piece, which is slow and
easy to get wrong, we bring the whole of staging into a new branch and then
take out the parts that must not go live, one part at a time, checking
after each that everything still builds and passes its tests. The
maintainer then makes the small changes they want, and the branch goes to
the live site as one release.

The parts taken out: the new perps desk (the live site keeps its current,
hidden one), the Explore prediction market and the Market page, the Arkjet
and Chicken games (Arkball, Chess, Checkers and Last Man Standing stay),
the small RWA change, and three preview pages that were only for design
review.

## What Changes For Users

The live site gets the new look everywhere the old features exist. Nothing
new appears that cannot work yet.

## What Does Not Change

Every fix shipped to the live site this week, the faster trades, the lighter
portfolio and Last Man reads, the sponsorship fix, stays exactly as it is.

## What Comes Next

Each removed part comes back as its own small change once its backend is on
the live gateway. The maintainer decides where the new Market tab points
and whether three new public pages ship now.
