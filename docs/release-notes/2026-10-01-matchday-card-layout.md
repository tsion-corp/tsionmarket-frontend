---
date: 2026-10-01
feature: Matchday cards lay themselves out by their own width; nothing overlaps the headline or the border
scope: fix
scenario-impact: none
---

# Matchday cards: faces at the ends, responsive

The two matchday cards from #608 placed the fighters the way the boxers'
cut-out was placed: centred and hanging off the panel's lower edge, a
position measured for a 222px card. At the slide sizes the dashboard and the
phone actually deal, the faces climbed into the headline on desktop and ran
past the card's border on a phone.

Everything now sits inside the white panel on a named grid that follows the
card's own width (a container query, since the slide decides it, not the
viewport):

- **From 520px** (desktop and tablet slides): a face at each end of the
  panel, 118px, with the headline, the VS roundel and the pill stacked in
  the column between them.
- **Under 520px** (phone slides): the two faces and the VS on one row, the
  headline under them, the pill at the foot. Each face takes half of what
  the row leaves after the panel's insets, the VS and the gaps, between 52
  and 96px, so a 270px slide gets 60px faces.

The panel's 20px padding keeps every face off the card's border at every
width. Captions truncate rather than wrap under a narrow face.
