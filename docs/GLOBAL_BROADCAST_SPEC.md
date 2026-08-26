# Ark — Global Go Live spec

Research-backed (Material 3, Chrome screen-sharing controls, MDN Document PiP / Page Lifecycle, Apple + AOSP privacy indicators). Goal: stream ANY Ark surface — a trade, portfolio, prediction market, game — not just Arkade, and keep it alive across navigation.

## 1. The control

**Mobile — the centre node of the existing bottom tab bar**, a violet-ringed circle breaking the bar's top edge so it reads as floating, WITHOUT overlaying content. Material 3 is explicit that a FAB must never obstruct the navigation bar, and a free-floating button permanently covers content beneath it (worse on zoom). This gets the "floating" affordance with none of the occlusion. Easy-thumb-zone by construction. Bar padded with `env(safe-area-inset-bottom)`.

**Desktop — pinned at the top of the icon rail**, above a divider (M3's navigation-rail FAB position). Never a floating overlay on desktop.

Always **icon + label** ("Go Live") — never a bare icon (mystery-meat navigation; NN/g on unlabelled nav icons).

Tapping opens an **M3-style FAB Menu** (2–6 items, not a speed dial): Go Live · Share screen · Invite viewers.

## 2. Share flow — three steps, never one tap

1. **What to broadcast**: "This view (Ark only)" [default, recommended] · "Camera + Ark" · "Screen". The Ark-only path composes in-app and never calls `getDisplayMedia`, so nothing outside Ark can leak.
2. **Sensitive-data interstitial** (Screen path only). Not a checkbox — a scannable list of what Ark can see on screen right now that it classes as sensitive (balances, positions, PnL, wallet address), a default-ON **"Blur balances & wallet while live"**, and the line: _never share a screen while a seed phrase or private key is visible — Ark cannot detect these._ Requires a deliberate "I understand".
3. `getDisplayMedia({ video: { displaySurface: "browser", monitorTypeSurfaces: "exclude", selfBrowserSurface: "include", surfaceSwitching: "exclude" }, audio: false })` — `monitorTypeSurfaces:"exclude"` **removes Entire Screen from the picker**. Single highest-value line in this spec for a trading app.

**Hard rules** (mirroring Android FLAG_SECURE precedent):

- Any route matching seed phrase / private key / export key / 2FA setup **auto-suspends the outgoing video track** (black frame + "Paused — sensitive screen"), resumes on exit.
- Full suspend during order confirmation / transaction signing.
- Elements marked `data-sensitive` blur automatically while `.broadcasting` is on the root — opt-out per element, never reliant on the user remembering.

## 3. Persistent live indicator — non-dismissible

Chrome's "Sharing this tab" banner is deliberately non-dismissible; ours follows that.

- **Mobile**: full-width strip pinned directly ABOVE the tab bar — it compresses the scroll container, never covers content. ~44px. Left→right: pulsing violet dot + the word **LIVE** · elapsed (mm:ss) · viewer count · **mute** · **end**. Whole bar taps back to the broadcast console.
- **Desktop**: same bar docked to the bottom of the content column; compact pill at the rail's foot when collapsed.
- **Never colour-only** — always the dot AND the word LIVE, plus a distinct shape (Apple's Differentiate-Without-Color precedent).
- **Always show the surface**: a persistent chip — "Sharing: Ark tab" / "Sharing: Camera". Not knowing what is shared is the top complaint in the research.
- **End** requires a confirm sheet with session stats. Cross-domain navigation warns first (Chrome pauses capture on cross-domain navigation anyway — pre-empt it rather than dying silently).

## 4. Minimised while live

- **Mobile: no PiP.** Document PiP is not Baseline and has effectively no mobile support. Minimised = the bar above, plus an optional 96×128 self-view that drags and snaps to corners (corner persisted in localStorage).
- **Desktop: opt-in Document PiP** "pop out" for the console (self-view + mute + end), feature-detected on `window.documentPictureInPicture`, falling back to the fixed panel. One PiP window per tab, position not controllable, dies with its opener — so the bar stays the source of truth and PiP is an enhancement.

## 5. Lifecycle

- `track.onended` → the user hit Chrome's own "Stop sharing". Reconcile immediately; this is the most common desync bug.
- `visibilitychange → hidden`: flush state, drop publish bitrate/framerate, keep audio. On return, re-acquire tracks rather than assuming they survived (backgrounding typically stops the camera).
- `pagehide`: `sendBeacon` an end-broadcast so viewers see "ended", not a frozen frame.
- Network loss: bar turns amber, "Reconnecting… 0:12", auto-end at 60s. Never silently end.
- Elapsed time computed from a start timestamp — never `setTimeout` (background throttling).

## 6. Anti-patterns (do not ship)

Floating button over content or the tab bar · icon-only FAB · speed-dial mini-FAB stacks · dismissible or auto-hiding live indicator · colour-only live state · one-tap go-live · not showing what is shared · offering Entire Screen on a trading app · relying on the user to hide balances · silent stream death on background/navigation · FAB colliding with toasts and scroll-to-top · ending without confirm.
