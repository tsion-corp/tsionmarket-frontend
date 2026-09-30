# ADR for Dummies: Arkade campaign banner and a bigger campaign modal

- **Status:** Accepted 2026-09-30
- **Date:** 2026-09-30

## The Idea

The weekly Arkade challenge (win $50 by hitting three missions across
Arkjet, Chicken Cross and Spin da' Bottle) is hidden behind a tiny badge
inside each game. Two changes:

1. Put a big, colourful banner for the challenge at the top of the Arkade
   page and above the balance cards on the portfolio page. Tapping it opens
   the challenge details.
2. Make those details open in a proper wide window on a computer or tablet
   instead of the phone-sized box it uses now. On a phone it stays the same.

## What the Person Sees

1. On the portfolio page, above their balance, a crimson-and-gold ticket:
   a gift box with a `$50` tag, "7-Day Triple Challenge", one line saying
   what to do, three little round marks for the three games that fill in as
   they complete, a countdown ("Ends in 6d 2h"), and a "See missions"
   button. The same ticket sits at the top of Arkade.
2. Tapping anywhere on it opens the challenge. On a computer the window is
   wide: the prize, countdown and progress on the left, the three missions
   on the right. On a phone it is the same sheet as today.
3. The small badge inside each game still works and opens the same window.
4. Once all three missions are done, the ticket turns gold and says "Entry
   secured".
5. When there is no challenge running, the ticket simply is not there.

## Important Limitation

The banner shows the challenge only to someone who is signed in, because the
challenge progress is personal. A signed-out visitor sees the pages exactly
as they are today.

## What Changes

- New banner on two pages, one shared window behind it.
- The window is wide on tablets and computers.
- Banner text in all five languages.

## What Does Not Change

- The challenge rules, the prize, the draw, and the backend.
- The in-game badge.
- The window's own wording (still English only; noted for a later pass).
