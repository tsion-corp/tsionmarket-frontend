---
date: 2026-10-01
feature: The first-party sportsbook reaches production, and the portfolio's prediction row deals a card per fight
scope: feat
scenario-impact: needs_automation
---

# The first-party sportsbook on main, and two matchday cards

## Ported from staging

Three PRs that landed on staging today come to `main` as they are:
#604 (the first-party sportsbook UI at `/prediction/local`, `features/
prediction/book`), #606 (the prediction proxy routes `book/*` to the Rust
`prediction` service, `PREDICTION_BOOK_API_URL` as the override) and #607
(the independent fight markets, with the matchday poster). Cherry-picked,
no conflicts, their own tests green.

**Backend:** `api.tsionark.com/v1/prediction/book/*` answers 404 today;
only staging's prediction service serves the book, and it lists exactly the
two fights, both starting 2026-10-01 21:00 UTC. For the book to work on
production before that, the `wsws` project needs `PREDICTION_BOOK_API_URL`
pointed at a service that serves it (staging's, or a production deploy of
the same). Without it `/prediction/local` reports the service unavailable.

## Matchday cards on the portfolio

The prediction row on the dashboard used to deal a generic title-fight card
("Who's Gonna take the Belt Home"). It now deals one card per fight, on
that card's own red-and-white design: the fight as the headline with
"Predict Now!" in bold, the two fighters' faces (cut from the poster) tilted
towards each other over the panel's lower edge with a VS roundel between,
and the dark pill under them. Each card, and its pill, leads to its event:
`/prediction/local?event=carter-efe-vs-speed-darlington` and
`/prediction/local?event=phyna-vs-nkechi-blessing`. Copy in five locales,
mirroring the belt card's own call to action. The market card and the end
cap are unchanged; the market card's repeat, which only existed so a pair
could cycle, is gone now that the row has four slides.

The mobile prediction page's own belt card (`prediction-mobile.tsx`) is not
touched.
