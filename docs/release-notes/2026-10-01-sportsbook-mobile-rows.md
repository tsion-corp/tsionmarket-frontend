---
date: 2026-10-01
feature: Sportsbook rows on a phone show every word of the bet
scope: fix
scenario-impact: none
---

# Sportsbook rows on a phone

On a phone each row of the first-party book (`/prediction/local`) was split
46/54 into two columns of about 120px, and every piece of text in it was
truncated: the market chip ("Carte…", "Fight …"), the fight ("Carter Efe vs
Speed …"), the fighters ("Speed Darling…") and, worst, the outcome labels
above the odds ("Carter Efe by K…", "Completes all …", "Decision, draw,…").
Those are the words that say which bet a button places.

Under 1280px the row now stacks:

- time, day and sport on the first line;
- the market's question as the row's heading, full width, wrapping;
- the fight on one line with both fighters' faces overlapped before it;
- the outcomes across the full width, each button carrying its own label
  above the odds, wrapping onto as many lines as it needs.

From 1280px the desk keeps its two columns, with the labels now inside the
buttons there too and nothing truncated. Tests assert that none of the
market question, fight, fighters or outcome labels sits under a truncating
class, and that each label is inside its own button.
