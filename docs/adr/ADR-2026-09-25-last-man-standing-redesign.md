# ADR-2026-09-25: The Last Man, re-skinned onto its existing state machine

## Status

Approved by the maintainer on 2026-09-25, on the design in Figma
(`Market (Copy)`, section `Last Man`, node `781:52446`). The maintainer chose,
in the same conversation: keep every existing state and restyle it rather than
ship only the drawn ones; treat responsive as essential rather than
desktop-only; let the state pick the rail card while the pager reaches the rest;
and use Market Square profile pictures for player faces.

## Context

The designers rebranded the Last Man Standing arcade screen. The Figma section
holds seven full-screen frames at 1339x1149 plus three component details. The
frame names do not match what they draw (a frame called "User leading" is the
not-started state), so the states below were read from the badges and content.

**What the design covers:** four stage states (not started, live, round ended,
you won), the page frame (breadcrumb, title, status pill, tagline), two stat
tiles inside the stage (total pot, winner's share), four right-rail cards
(start, add to position, invite, claim) with a three-dot pager, and a bottom
panel with Activity, Game rules and Past rounds over a
Player / Action / Amount / Time table.

**What the code has:** one component, `last-standing-section.tsx`, 1541 lines,
carrying about sixteen distinct visual states. Eleven of them the design never
draws: loading, game-not-found, connection-lost (degraded), final-ten-seconds
urgency, needs-funds, wagering, round-ended-unsettled (which is where the
**settle** action lives), round-ended-settled, the calculating-to-reveal
sequence, pending winnings, and the empty feed. Money is in bigint base units
throughout, the clock freezes when the socket drops, and a round cannot be
collected without settling.

A design that draws four states is therefore not a specification for a screen
that has sixteen. Building only what is drawn would delete the settle step and
every failure state, on a screen that moves real money.

## Decision

**Re-skin, do not rewrite.** The state machine, the socket, the polling, the
money maths, the clock, the coin-flight, the music, the pop-out timer and the
settle and claim paths stay exactly as they are. Only the presentation changes.

### 1. Three presentational components, no logic in them

| Component                                  | Renders                                                                                   | Knows about                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `stage-card.tsx`                           | the stage: glyph, countdown and ring, caption, leader strip, pot and winner's-share tiles | nothing; every string, number and flag arrives as a prop |
| `rail-cards.tsx`                           | `RailActionCard`, `RailInviteCard`, `RailClaimCard`, `RailPager`, and the stake stepper   | nothing; the QR arrives as a node                        |
| `activity-panel.tsx` + `player-avatar.tsx` | the tabbed panel, the table, and one avatar                                               | nothing; rows arrive formatted                           |

None of them fetches, formats money, holds a timer or looks up a translation.
That is what makes them testable without the game, and it is why the section
keeps owning every decision that can be got wrong.

### 2. The rail is state-driven, with a pager over what applies

The state picks the card: **Start** when no round is running, **Add to
position** when one is live, **Claim** when this wallet has winnings. **Invite**
is always available, because it is a growth lever and "you earn 10%" is a real
incentive. A card whose action is impossible is never shown, so the pager's
length changes with the state, which is what the design's varying dot counts
already imply.

### 3. Undrawn states are restyled, not dropped

Each keeps its behaviour and is expressed in the new language: the degraded
state dims and freezes the clock, urgency keeps its red pulse, needs-funds
keeps its add-money CTA, the settle action keeps its place in the rail, and the
calculating-to-reveal overlay renders over the stage through its `children`
slot.

### 4. One avatar for the whole screen

The leader strip and the activity table share `player-avatar.tsx`, so a wallet
cannot appear as two different faces on one page. A missing picture falls back
to a deterministic mark derived from the address: same wallet, same mark, every
time.

**Square faces are not reachable yet.** The market-square proxy exposes
`profiles` and follow routes but no lookup from a wallet address to a profile,
so only the signed-in user's own face could be resolved today. Every avatar
therefore passes `avatarUrl: null` and renders the fallback. When the backend
adds a by-wallet, ideally batch, lookup, the faces appear with no change to
these components.

### 5. Figma values win over the screenshots

Where the exported design context disagreed with what the screenshots suggested,
the exported values were taken: the active tab is amber and not white, the
underline is 3px, both cards use a 15px radius, column headers are 14px,
avatars 29px, and the countdown is 48px inside a 222px ring whose arc is
`#D4B32D` on a `#2A2B2B` track.

### 6. Copy corrections

The design's text is used verbatim except three errors, fixed in the
catalogues: "winings" to "winnings", "Every players who join grows the pot" to
"Every player who joins grows the pot", and "The first confirm leader takes the
lead." to "The first confirmed play takes the lead." 56 new keys were added to
all five catalogues.

## Consequences

**Positive**

- The screen gets the new look without putting a single money path at risk.
- The presentational pieces are covered by 93 tests that need no game running.
- Responsive falls out of container queries rather than a breakpoint prop, so
  the stage behaves in any column.

**Negative and risks**

- The section stays a large file. This change re-skins it; splitting its state
  machine into hooks is worth doing later, on its own.
- Player faces are placeholders until the backend lookup exists.
- The design gives no guidance for eleven states, so their new styling is a
  judgement call and should be reviewed against the designers' intent.

## Alternatives considered

- **Build only the four drawn states.** Rejected: it deletes the settle step
  and every failure state.
- **Rewrite the section into hooks plus a new view.** Rejected under this
  deadline: the state machine is subtle, carries real money, and has no render
  test to catch a regression.
- **A preview route for the deadline.** Offered and declined in favour of doing
  the full wiring.

## Test plan

- The three components: 93 tests already passing, covering every phase, badge
  tone, stepper edge, pager name, tab interaction, table content, loading,
  empty, reduced motion and avatar determinism.
- A new section test with the hooks mocked: each phase renders, the rail shows
  the right card and never an impossible one, the pager reaches Invite, settle
  stays reachable when a round ended unsettled, the clock freezes when degraded,
  needs-funds still offers add-money, and the tabs reach rules and past rounds.
- Every existing `features/casino` and `app/api/vault` test passes unedited.
- `./scripts/preflight.sh` clean, then a manual pass over a live round.
