# Spec: the Arktivity screens (All Activity / In Progress), desktop and phone

Recon only. This document records what the Figma says, exactly, and where it
contradicts itself. It is not an implementation plan and no ADR has been
written or approved yet.

Figma file key: `CkZb2luFfxbn5ptrVHng0n`

| Node       | Surface | Frame name (in Figma)                | Frame size  |
| ---------- | ------- | ------------------------------------ | ----------- |
| `730:1288` | Desktop | `Desktop - arktivity - all activity` | 1339 × 1824 |
| `730:1748` | Desktop | `Desktop - arktivity - in progress`  | 1339 × 1824 |
| `730:788`  | Phone   | `Back`                               | 402 × 1365  |
| `730:1134` | Phone   | `Back`                               | 402 × ~1365 |

Both phone frames are named `Back`, a leftover component name rather than a
screen name. Nothing hangs on it, but do not read it as a route.

Existing code this lands on top of: `app/(session)/(app)/activity/page.tsx` →
`features/activity/` (`activity-view.tsx`, `activity-row.tsx`, `pnl-cards.tsx`,
`hooks/use-activity.ts`). That implementation has **no** tabs, no filters, no
status chips, no product column and no "In Progress" concept, so the design is a
replacement rather than a restyle. `messages/*.json` already carries a full
57-key `activity` namespace in all five locales.

---

## 1. Token mapping — what the repo already has

`app/globals.css` defines one `@theme inline` block. Tailwind v4, no spacing,
font-size, leading or tracking tokens: sizes are arbitrary values everywhere.

### Values that map to an existing token — use the token

| Figma value              | Token                                                                    | Class                     |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------- |
| `#f4f4f4`                | `--color-grey-100`                                                       | `text-grey-100`           |
| `rgba(244,244,244,0.4)`  | `--color-grey-100` + opacity modifier                                    | `text-grey-100/40`        |
| `#1c1c1c`                | `--color-grey-800`                                                       | `bg-grey-800`             |
| `#0f0f0f`                | `--color-grey-900`                                                       | `bg-grey-900`             |
| `#0a0a0a`                | `--color-ink` (identical: `--color-panel`, `--color-primary-foreground`) | `text-ink`                |
| `#232323`                | `--color-topbar`                                                         | `bg-topbar`               |
| `rgba(255,255,255,0.04)` | `--color-topbar-ray`                                                     | —                         |
| `rgba(255,255,255,0.05)` | `--color-surface`                                                        | `bg-surface`              |
| `rgba(255,255,255,0.1)`  | `--color-surface-strong`                                                 | `bg-surface-strong`       |
| `rgba(255,255,255,0.12)` | `--color-hairline`                                                       | `border-hairline`         |
| `#000000` / `#ffffff`    | —                                                                        | `bg-black` / `text-white` |

The Figma variables `color/grey/20` and `Tsion Grey/100` both resolve to
`#f4f4f4`, i.e. `--color-grey-100`. `Labels/Primary` is `#000000`.
`typography/family/body` is `Geist`. `var(--sds-size-space-200|300|400)` are
`8 | 12 | 16` and `var(--sds-color-text-default-default)` is `#ffffff` — these
are the stock Figma design-system variables on the sidebar, which is existing
chrome and out of scope.

### Values with no token — raw, and why

| Figma value              | Nearest token (NOT equal)                                 | Use                              |
| ------------------------ | --------------------------------------------------------- | -------------------------------- |
| `#121212`                | none; `#0f0f0f` = `grey-900`, `#1c1c1c` = `grey-800`      | `bg-[#121212]`                   |
| `#9d9da8`                | `--color-grey-400` `#9b9b9b`, `--color-arrow` `#8a8a8f`   | `text-[#9d9da8]`                 |
| `#00b147` (positive)     | `--color-buy` `#0ecb81`, `--color-up` `#7ce7b0`           | `text-[#00b147]`                 |
| `#c10226` (negative)     | `--color-sell` `#d93025`, `--color-destructive` `#ef4444` | `text-[#c10226]`                 |
| `#f5c518` (pending)      | `--color-kash` `#ffd62f`                                  | `text-[#f5c518]`                 |
| `rgba(255,255,255,0.08)` | `--color-rule` is `0.07`, not `0.08`                      | `bg-white/8`                     |
| `rgba(255,255,255,0.02)` | none                                                      | `border-white/2`                 |
| `rgba(255,255,255,0.45)` | none                                                      | `text-white/45`                  |
| `rgba(255,236,236,0.1)`  | none (a _warm_ white, not neutral)                        | `border-[rgba(255,236,236,0.1)]` |
| `rgba(255,246,246,0.5)`  | none (a _warm_ white, not neutral)                        | `border-[rgba(255,246,246,0.5)]` |

Radii: the design uses `13`, `13.75`, `12.222`, `25`, `26.723`, `22.222`, `20`,
`14`, `2.4`, `50`, `1000`, `40000`, `100000`. The repo has `--radius-card: 20px`
and `@utility ws-card { border-radius: 22px }`. **None of the design's card radii
match either.** See §6.

Fonts: every string in these four nodes is `Mona Sans` (SemiBold 600 / Bold 700)
except the phone header title, which is `Inter:Bold`. The repo loads Mona Sans
as `--font-display` / `--font-serif` (weights 500–700, surfaced by
`@utility ws-display` at 700 with `letter-spacing: -0.01em`), and the _body_
family is **Geist** (`--font-sans`, `body { font-weight: 500 }`). **Inter is not
loaded anywhere in this repo.** See §6.

---

## 2. Shared chrome (already built — do not rebuild)

### Desktop top band and sidebar

Node `730:1291` (`Mobile head`, despite the name) is 1071 × 79 with
`public/market/topbar-rays.svg` as its fill. This is
`components/layout/topbar.tsx`, which already renders `bg-topbar` +
`/rollout/chrome/topbar-starburst.svg` at `md:h-[79px]`.

Node `730:1638` (`Sidebar`) is 248 wide, `bg-[#0a0a0a]` (`--color-panel`),
`border-right: 1px solid rgba(255,255,255,0.08)`, `px-[16px] py-[20px]`.
Nav buttons: `w-215 px-[12px] py-[11px] rounded-[12px] gap-[12px]`, icon 20,
label Geist Medium `14.5px / 21.75px` at `rgba(255,255,255,0.6)`; the active row
is `bg-[rgba(255,255,255,0.14)]` with a white label. `Arktivity` is the active
item on all four nodes. This is `components/layout/sidebar.tsx`.

Main content is `left: 248` inside the 1319-wide body, so **1071px wide**, and
every measurement below is relative to that.

### Phone back-header (nodes `730:1122`, `730:1276`)

This is the one piece of chrome the phone screens introduce.

- Band: `h 64.16`, `bg #232323` = `bg-topbar`. Rays vector 532.304 × 212.667 at
  `opacity 0.04`, centred, `top -9.35% / bottom -222.11%`. That file is
  **byte-identical to `public/topbar-rays.svg`**, which is already in the repo.
- Header row: `w 402`, `px 24 py 12`, `flex items-center justify-between`,
  vertically centred in the band.
- Back button: `size 40`, `rounded-[20px]` (full),
  `bg rgba(255,255,255,0.1)` = `bg-surface-strong`; chevron-left glyph `20px`,
  stroke white, width 2, round cap.
- Title `Arktivity`: **Inter Bold**, `18px`, `leading normal`,
  `letter-spacing +0.18px` (= `+0.01em`, positive), `text-center`, fixed `w 79`.
- Right slot: a second `40 × 40` `rounded-[20px]` `bg rgba(255,255,255,0.1)`
  button holding a `20px` search glyph — with **`opacity: 0`**. It is an
  invisible spacer that keeps the title optically centred. Ship it as a
  `size-10` spacer div, not as a hidden button.

---

## 3. The header region (identical on both tabs, different per surface)

### 3.1 Search field

| Property      | Desktop (`730:1331` / `730:1791`)                                                           | Phone (`730:1093` / `730:1136`)                                                |
| ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Position      | `absolute top-[126px]`, centred at `calc(50% + 2px)`                                        | inside a `flex-col gap-12` at `left 16, top 76.16`                             |
| Width         | `993` (spans x = 41 → 1034 of 1071)                                                         | `370`                                                                          |
| Height        | `51`                                                                                        | `51`                                                                           |
| Fill          | `rgba(255,255,255,0.05)` → `bg-surface`                                                     | same                                                                           |
| Border        | `2px solid rgba(255,255,255,0.02)` → `border-2 border-white/2`                              | same                                                                           |
| Radius        | `50px`                                                                                      | `50px`                                                                         |
| Padding / gap | `px-24 py-12`, `gap-4`                                                                      | `px-24 py-12`, `gap-4`                                                         |
| Icon          | `14 × 14` search glyph, stroke `rgba(255,255,255,0.45)`, width 2, round cap                 | same                                                                           |
| Placeholder   | Mona Sans SemiBold **14px**, `leading normal`, `tracking -0.42px`, `rgba(255,255,255,0.45)` | Mona Sans SemiBold **13px**, `leading normal`, `tracking -0.39px`, same colour |

Both are `-0.03em`. The string is **`Search activity`** on all four nodes.

### 3.2 Tab switch

Two visible tabs plus a **third, empty, unlabelled 101px tab** on all four nodes
(`730:1354`, `730:1814`, `730:1106`, `730:1149`). It has no text and no
`overflow-clip`. Treat it as a stray frame, not a third tab.

| Property         | Desktop                                                                                   | Phone                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Row origin       | `absolute left-[40px] top-[201px]`                                                        | in the `gap-12` header stack                               |
| Gap between tabs | `12`                                                                                      | `12`                                                       |
| Tab box          | `w 101`, `h 38` (tab 1 has no fixed height), `p 10`, `rounded-[40000px]`, `overflow-clip` | identical                                                  |
| Label            | Mona Sans SemiBold **14px / 16px**, `tracking -0.42px`                                    | Mona Sans SemiBold **12px / 16px**, `tracking -0.36px`     |
| Active colour    | `#ffffff` on `730:1288`, `#f4f4f4` on `730:1748` — **inconsistent, see §6**               | same inconsistency (`730:788` white, `730:1134` `#f4f4f4`) |
| Inactive colour  | `rgba(244,244,244,0.4)` → `text-grey-100/40`                                              | same                                                       |

The phone label's font size is bound to the Figma variable `item spacing/12` — a
**spacing** variable used as a font size. The value is 12 either way.

Rule and indicator:

| Property    | Desktop                                                                                            | Phone                                         |
| ----------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Rule        | `h 3`, `left 40 → right 625` of 1071 ⇒ **`w 406`**, `rounded-[2.4px]`, `bg rgba(255,255,255,0.08)` | `h 3`, **`w 406`**, same radius and fill      |
| Indicator   | `h 3`, `w 101`, `rounded-[50px]`, `bg white`                                                       | identical                                     |
| Indicator x | All Activity `left 41`; In Progress `left 158`                                                     | All Activity `ml 1px`; In Progress `ml 111px` |

`406` is the same literal on both surfaces. On desktop it is arbitrary (the
three tabs occupy 101·3 + 12·2 = 327). On phone, `16 + 406 = 422` against a
402-wide frame — **it overflows the right edge by 20px**. See §6.

### 3.3 Filter dropdowns

Two pills, `All Products` and `Last 30 Days`, both with a trailing chevron-down.
Neither carries an open state, a menu, or a selected variant anywhere in these
four nodes.

| Property   | Desktop (`730:1336`)                                                                     | Phone (`730:1111` / `730:1154`)                                           |
| ---------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Row origin | `absolute left-[40px] top-[275px]`                                                       | in the header stack                                                       |
| Row gap    | `9.62`                                                                                   | `8`                                                                       |
| Pill       | `h 48.102`, `px 19.241`, `py 6.681`, `rounded-[26.723px]`                                | `h 40`, `px 16`, `py 5.556`, `rounded-[22.222px]`                         |
| Fill       | `rgba(255,255,255,0.05)` → `bg-surface`                                                  | same                                                                      |
| Border     | `2.004px solid rgba(255,255,255,0.12)` → `border-hairline`                               | `1.667px solid` same colour                                               |
| Inner gap  | `6.681`                                                                                  | `5.556`                                                                   |
| Label      | Mona Sans SemiBold **15px**, `leading 1`, `tracking -0.3px`, `#f4f4f4` → `text-grey-100` | Mona Sans SemiBold **12px**, `leading 1`, `tracking -0.24px`, same colour |
| Chevron    | `13.362`                                                                                 | `11.111`                                                                  |

Both trackings are `-0.02em`.

---

## 4. All Activity — the day-grouped list

### 4.1 Group container and heading

**Desktop.** Group 1 is a `flex-col gap-[24px]` at `left 42, top 367, w 1004`
(`730:1359`). Group 2 is a `flex-col gap-[22px]` at `left 41, top 1114, w 1005`
(`730:1512`). The heading sits between them at `left 41, top 1052, w 1005`
(`730:1635`): `flex items-center justify-between`, Mona Sans SemiBold
`14px / 17.191px`, `tracking -0.14px`, `#9d9da8`, `capitalize`, nowrap.
**Group 1 has no heading at all on desktop.**

**Phone.** The list root (`730:789`) is `absolute left-16 top-256.16`,
`flex-col gap-[24px] items-start`. Each group is `flex-col gap-[12px] w-[371px]`
and _does_ open with a heading: `flex justify-between w-full`, Mona Sans
SemiBold **`11px / 16.5px`**, `tracking -0.11px`, `#9d9da8`, `capitalize`,
nowrap. Rows sit in a nested `flex-col gap-[12px] w-full`.

Heading strings: `Today, 9th September` (phone group 1 only) and
`Yesterday, 8th September`; right side `5 Activities` on every heading.

### 4.2 Row — desktop (e.g. `730:1360`)

A filled card, one per row:

- Card: `bg-[#121212]`, `rounded-[13px]`, `px-[20px] py-[15px]`, `w-full`,
  `flex-col items-start`. No border, no shadow, no hover state in the design.
- Inner: `flex items-start justify-between w-full`.
- **Left block is a fixed `h 72 × w 191` box with absolutely positioned
  children** — it is not auto-layout:
  - Token icon: `left 0 top 5`, `size 45`, `bg-[#0f0f0f]` → `bg-grey-900`,
    `rounded-[13.75px]`, `overflow-clip`, centred. Inner icon box `55.023`
    square; the glyph is inset `16.67%` top/bottom and `29.17%` left/right.
  - Title: `left 55 top 7` with `translateY(-50%)`. Mona Sans SemiBold `14px`,
    `leading 1`, `tracking -0.14px`, white, `capitalize`, nowrap.
  - Time · product: `left 55 top 24`, `flex gap-[8px] items-center` —
    time, a `3px` dot, product. Both Mona Sans SemiBold `12px / 16.5px`,
    `tracking -0.12px`, `#9d9da8`, `capitalize`.
  - Status: `left 57 top 55` (note: 57, not 55), `flex gap-[8px] items-center` —
    a `3px` dot filled with the status colour, then the label at Mona Sans
    SemiBold `12px / 16.5px`, `tracking -0.12px`, `capitalize`, in the status
    colour.
- Right block: `flex-col gap-[8px] items-end w-[101px]` (four of the nine rows
  add `justify-center`, which is inert at this height):
  - Chevron: a `28 × 28` `rounded-[14px]` box containing a `19px` chevron-left,
    wrapped in `rotate(180deg) scaleY(-1)` so it renders **pointing right**. No
    fill, no border.
  - Amount: Mona Sans **Bold** `14px / 16.5px`, `tracking -0.14px`,
    `text-right`, `capitalize`. Colour is `#00b147` for a win, `#c10226` for a
    loss, `#f5c518` for the reward row, white otherwise.
  - Caption: `flex items-center justify-end w-full`; Mona Sans SemiBold
    `12px / 15.675px`, `tracking -0.12px`, `#9d9da8`, `capitalize`. Two-part
    captions (`Net Profit • USD`) use `gap-[7.6px]` and a **`2.85px`** dot.

### 4.3 Row — phone (e.g. `730:795`)

A divider row, not a card. This is the largest structural difference.

- Row: `flex gap-[8px] items-start py-[16px] w-full`,
  `border-bottom: 1px solid rgba(255,236,236,0.1)`. **No background, no radius,
  no horizontal padding.** The border is on _every_ row, including the last of
  each group.
- Token icon: `size 40`, `bg-[#0f0f0f]` → `bg-grey-900`,
  `rounded-[12.222px]`, `overflow-clip`; inner icon box `40` square, same glyph
  insets.
- Body: `w 322`, `flex-col gap-[12px]`. It is real auto-layout, three lines:
  1. Sub-block `flex-col gap-[4px]`:
     - Line 1 — `h 18`, `flex items-center justify-between`: title (Mona Sans
       SemiBold `13px`, `leading 1`, `tracking -0.13px`, white, `capitalize`)
       and the `28 × 28` rotated chevron (`19px` glyph).
     - Line 2 — `flex items-center justify-between`: `[time · 3px dot · product]`
       at `gap-[8px]`, Mona Sans SemiBold `11px / 16.5px`, `tracking -0.11px`,
       `#9d9da8`, `capitalize`; then the amount, `w 93`, Mona Sans **Bold**
       `13px / 16.5px`, `tracking -0.13px`, `text-right`, `capitalize`.
  2. Line 3 — `flex items-center justify-between`: `[3px dot + status label]` at
     `gap-[8px]`, Mona Sans SemiBold `11px / 16.5px`, `tracking -0.11px`,
     `capitalize`, in the status colour; then the caption box at `w 88.35`
     (`justify-end`, or `gap-[7.6px]` with a `2.85px` dot for the two-part
     captions), label Mona Sans SemiBold `10px / 15.675px`, `tracking -0.1px`,
     `#9d9da8`, `capitalize`.

So on **desktop** the amount and caption stack in a right-hand column under the
chevron; on **phone** the amount sits on the time/product line and the caption
on the status line. Same five data points, two different grids.

---

## 5. In Progress — the product-grouped cards

### 5.1 Card shells

**Desktop (`730:1748`) — the three cards are absolutely positioned, not a list,
and they do not share a shell:**

| Card        | Node       | Geometry                                                                   | Fill          | Padding             | Gap  |
| ----------- | ---------- | -------------------------------------------------------------------------- | ------------- | ------------------- | ---- |
| Withdrawal  | `730:1894` | `left 40, top 360, w 1006, h 298` (fixed height)                           | `#121212`     | `pt 35 pb 24 px 24` | `30` |
| Predictions | `730:1856` | `left 40, top 682, w 1006`                                                 | `#121212`     | `p 24`              | `24` |
| Arkade      | `730:1820` | inside a bare `#121212` wrapper (`730:1819`) at `left 41, top 984, w 1005` | **`#1c1c1c`** | `p 24`              | `24` |

All three: `border: 1px solid rgba(255,255,255,0.05)`, `rounded-[25px]`,
`flex-col items-start`. Note the border colour is `--color-surface` used as a
_border_, not `--color-hairline`.

**Phone (`730:1134`).** One clean list: `absolute left-16 top-244 w-370`,
`flex-col gap-[12px]`; three cards, each `w-full`, `bg-[#121212]`,
`border 1px solid rgba(255,255,255,0.05)`, `rounded-[25px]`, `p 24`, `gap 24`.
Order on both surfaces: Withdrawal, Predictions, Arkade.

### 5.2 Card body (`flex-col gap-[16px] w-full`)

**1 — Head row.** `flex items-center justify-between w-full`.

| Element       | Desktop                                                                                                      | Phone                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Product label | Mona Sans SemiBold `14px / 16.5px`, `tracking -0.14px`, `#9d9da8`, `capitalize`                              | `11px / 16.5px`, `tracking -0.11px`, same colour |
| Status        | `flex gap-[8px] items-center`: `3px` dot + label at the same size as the product label, in the status colour | same, at `11px / -0.11px`                        |

**2 — Identity row.** `flex gap-[8px] items-center`.

- Icon: `size 40`, `bg-[#0f0f0f]`, `rounded-[12.222px]`, `overflow-clip`, inner
  box `40` square. Identical on both surfaces.
- Text column: `flex-col gap-[4px] capitalize`.

| Element   | Desktop                                                                                                          | Phone                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Title     | Mona Sans SemiBold `16px`, `leading 1`, `tracking -0.16px`, white                                                | `14px`, `leading 1`, `tracking -0.14px`, white |
| Subtitle  | `12px / 16.5px`, `tracking -0.12px`, `#9d9da8`                                                                   | `11px / 16.5px`, `tracking -0.11px`            |
| Col width | `141` (Arkade), `161` with a `164` title (Predictions), `160` with a `164` title (Withdrawal) — **inconsistent** | `141` on all three                             |

**3 — Figures block.** `flex-col gap-[12px] w-full capitalize`;
`items-end` on Predictions and Arkade, `items-start` on Withdrawal.

- Pair row: `flex items-center justify-between w-full`.
  - Left pair: `flex-col gap-[4px] items-start`, **`w 141` fixed on both
    surfaces**. Key: `#9d9da8`, desktop `12px / 16.5px tracking -0.12px`, phone
    `11px / 16.5px tracking -0.11px`. Value: `14px`, `leading 1`,
    `tracking -0.14px`, white — **same on both surfaces**.
  - Right pair: `flex-col gap-[4px] items-end justify-center text-right`, same
    type scale. On the **Withdrawal** card the whole right pair carries
    **`opacity: 0`** — the one-value layout is the two-value layout with the
    second column hidden, still occupying its width.
- Fine print: `w-full`, `#9d9da8`, desktop `12px / 16.5px tracking -0.12px`,
  phone `11px / 16.5px tracking -0.11px`. `text-right` on Predictions and
  Arkade; left-aligned on Withdrawal.

### 5.3 Buttons

**Primary, full width** (`View Details` alone — Withdrawal and Arkade cards):

- Box: `flex-col items-center justify-center`, `px-[11px] py-[13px]`,
  `rounded-[1000px]`, `w-full`. Desktop's Withdrawal card pins `h 56`; the
  other instances have no fixed height.
- Fill: `linear-gradient(179.86deg, #FFFFFF 2.3594%, #EDEDF0 38.566%,
#CBCBD1 62.387%, #F5F5F8 97.641%)` over a flat `#FFFFFF`. (The angle is
  recorded as `179.8585°`, `179.8241°` and `179.5777°` on different instances —
  the same gradient, three roundings.)
- Drop shadow: the Figma variable `button drop` is
  `0 1.6265px 6.506px rgba(0,0,0,0.5)` plus an inner
  `0 0.8133px 0 rgba(255,255,255,0.95)`. The generated CSS halved the blur to
  `3.253px`; **use `6.506px`, the variable's own value.**
- Label: Mona Sans SemiBold `14px`, `line-height 1.1`, `tracking -0.14px`,
  `#0a0a0a` → `text-ink`, centred, `gap-[8px]` to a `19px` arrow-up-right.
- This is the repo's existing chrome-pill treatment
  (`@utility ws-chrome-pill` / `.ws-chrome` in `app/globals.css`).

**Two-button row** (Predictions card): `flex gap-[8px] items-center w-full`.

| Button            | Desktop                                                                                                                                                                        | Phone                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Review Cash out` | `bg-white`, `rounded-[1000px]`, **fixed `w 592`**, `h 51`, `px 20.5`; label Mona Sans SemiBold `14px`, `leading normal`, `tracking +0.14px`, black                             | `bg-white`, `rounded-[20.5px]`, **`flex-1 min-w-0`**, `h 41`, `px 20.5`; label `13px`, `tracking +0.13px`, black                           |
| `View Details ↗`  | transparent, `border-2 rgba(255,246,246,0.5)`, `rounded-[100000px]`, **fixed `w 356`**, `h 51`, `px 20.5`, `gap 4`; label `14px`, `tracking +0.14px`, white; icon `19px` white | same border, `rounded-[20.5px]`, **fixed `w 157`**, `h 41`, `px 20.5`, `gap 4`; label `13px`, `tracking +0.13px`, white; icon `19px` white |

Tracking on these two buttons is **positive** (`+0.01em`), unlike every other
string in the design. Desktop widths are hard-coded to fill exactly
(`592 + 8 + 356 = 956 = 1006 − 24 − 24 − 2`); phone mixes `flex-1` with a fixed
`157`. Both are brittle under translation — the German for "Review Cash out" will
not fit a frozen 592/155px box.

---

## 6. The complete status set

Every label is stored in Figma with `text-transform: capitalize` applied, so the
stored string and the rendered string differ on the desktop All Activity node.
The rendered form is the one to author as English; the stored column shows why
the four nodes disagree.

| Rendered (author this) | Colour    | Stored, `730:1288` | Stored, `730:788`  | Stored, In Progress nodes |
| ---------------------- | --------- | ------------------ | ------------------ | ------------------------- |
| `Won`                  | `#00b147` | `Won`              | `Won`              | —                         |
| `Lost`                 | `#c10226` | `Lost`             | `Lost`             | —                         |
| `Live`                 | see below | `Live`             | `Live`             | `Live`                    |
| `Processing`           | `#f5c518` | `Processing`       | `Processing`       | `Processing`              |
| `Completed`            | `#9d9da8` | `Completed`        | `Completed`        | —                         |
| `Earned`               | `#9d9da8` | `Earned`           | `Earned`           | —                         |
| `Failed`               | `#c10226` | `failed`           | `Failed`           | —                         |
| `Awaiting Results`     | `#f5c518` | `awaiting results` | `Awaiting Results` | `Awaiting Results`        |

The status dot is always the same colour as its label, `3px`, fully round.

**`Live` has two different colours.** It is `#00b147` (green) in both All
Activity lists and `#f5c518` (amber) in both In Progress card lists. Green reads
as "settled in your favour" alongside `Won`; amber reads as "still pending"
alongside `Processing` and `Awaiting Results`. The In Progress reading is the
coherent one — a live position is by definition unsettled — but this needs a
decision, not a guess.

Three semantic buckets fall out: positive `#00b147`, negative `#c10226`, pending
`#f5c518`, neutral `#9d9da8`. None of the four has a repo token.

---

## 7. The complete caption set

The small grey line under (desktop) or beside (phone) the amount on an All
Activity row.

| Rendered (author this) | Stored, `730:1288`   | Stored, `730:788`                        |
| ---------------------- | -------------------- | ---------------------------------------- |
| `Net Profit` · `USD`   | `Net Profit` + `USD` | `Net Profit` + `USD`                     |
| `Net Loss` · `USD`     | `Net Loss` + `USD`   | `Net Loss` + `USD`                       |
| `Amount Sent`          | `Amount Sent`        | `Amount sent`                            |
| `Amount Received`      | `Amount received`    | `Amount Received`                        |
| `Paid 750 USDC`        | `Paid 750USDC`       | `Paid 750 USDC`                          |
| `Reward Points`        | `reward points`      | `Reward Points`                          |
| `Not Debited`          | `not debited`        | `Not Debited`                            |
| `Stake Committed`      | `Stake commited`     | `Stake Committed` _and_ `Stake Commited` |

`Paid 750 USDC` and `Stake 2.40x Odds` interpolate a value into the label. They
must be ICU messages (`paidAmount: "Paid {amount}"`,
`stakeOdds: "Stake {odds} Odds"`), not frozen strings.

`Stake Committed` is spelled three ways across the four nodes: `Stake commited`
(desktop list, and both In Progress cards), `Stake Committed` (phone World Cup
row) and `Stake Commited` (phone Chess Match row). **`Committed`, two t's, is
correct.**

### In Progress key/value labels and fine print

| Rendered                                 | Stored                                   | Card                   |
| ---------------------------------------- | ---------------------------------------- | ---------------------- |
| `Amount`                                 | `Amount`                                 | Withdrawal             |
| `Stake 2.40x Odds`                       | `Stake 2.40x Odds`                       | Predictions            |
| `Stake Committed`                        | `Stake commited`                         | Arkade                 |
| `Payout If You Win`                      | `Payout if you win`                      | Predictions, Arkade    |
| `Confirmation Pending. Do Not Resend`    | `Confirmation Pending. Do not resend`    | Withdrawal             |
| `210 USDC Profit Before Fees`            | `210 USDC profit before fees`            | Predictions            |
| `60 USDC Profit Before Fees`             | `60 USDC profit before fees`             | Arkade                 |
| `Ethereum`                               | `Ethereum`                               | Withdrawal (subtitle)  |
| `Fighter A To Win By KO`                 | `Fighter A to win by KO`                 | Predictions (subtitle) |
| `Result Submitted · Awaiting Settlement` | `Result submitted · Awaiting settlement` | Arkade (subtitle)      |

The Arkade subtitle separator is a literal `·` (U+00B7) inside the string, not
the 3px vector dot used elsewhere. The `… Profit Before Fees` lines interpolate
an amount: `profitBeforeFees: "{amount} Profit Before Fees"`.

The Withdrawal card also carries a hidden placeholder key, the string
`"Amount "` with a trailing space, inside the `opacity: 0` column. It is not
content.

### Product set

Rendered across the four nodes: `Predictions`, `Prediction`, `Withdrawal`,
`Memecoins`, `Deposit`, `Rewards`, `Arkade`. `Predictions` and `Prediction` are
the same product spelled two ways (§9). Stored casing is lowercase on the
desktop list (`withdrawal`, `arkade`) and title case everywhere else.

### Other fixed strings

`Search activity`, `All Activity`, `In Progress`, `All Products`,
`Last 30 Days`, `5 Activities`, `Today, 9th September`,
`Yesterday, 8th September`, `Review Cash out`, `View Details`, `Arktivity`.

`5 Activities` must be a plural-aware ICU message. `Today, 9th September` and
`Yesterday, 8th September` are a _composed_ heading — `Today` and `Yesterday`
already exist as `activity.today` / `activity.yesterday` in all five catalogues,
and the ordinal date must come from `Intl.DateTimeFormat`, never from a frozen
English string. `Last 30 Days` is a filter value that will need its own message
per option.

---

## 8. Every asset

**No asset in these four nodes is genuinely new. Nothing was downloaded into
`public/`.**

| #   | Figma asset                                                                                                                                            | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ETH-Graphic` (`a5eac.svg`), 16.67 × 26.66, three-tone Ethereum diamond (`#8FFCF3` / `#CABCF8` / …)                                                    | **Placeholder, not content.** The identical glyph is used on all 18 list rows and all 6 cards, including the PEPE, KASH+, Chess Match and Withdrawal rows. Resolve the real icon through the existing `AssetIcon` (`components/ui/asset-icon.tsx`), which already covers ETH, PEPE, USDC (via `components/ui/usdc-coin.tsx`), USDT and KASH+ (`public/kash/kash-plus-coin.png`), and falls back to `CoinBadge`. Do **not** commit this file. |
| 2   | search, `14px` (`dccad.svg`) and `20px` (`9f889.svg`) — circle + diagonal handle, round caps                                                           | Existing glyph: **`SearchBoldIcon`** in `components/ui/icons.tsx` (itself drawn from Figma node `173:42025`). Same construction. The whole pill is already `components/ui/search-field.tsx` — see §9 for the geometry gap.                                                                                                                                                                                                                   |
| 3   | chevron-down, `13.362px` / `11.111px` (`c5702`, `04258`, `0d78f`) — `M2.778 4.167 L5.556 6.945 L8.334 4.167`, stroke `1.5`, round cap                  | Existing glyph: **`ChevronDownIcon`** — `M2.81066 4.21568 L5.62128 7.02631 L8.43191 4.21568` in an `11.2425` box. Geometrically the same V. Only the weight differs: repo `2.2485` (≈20% of the box) vs Figma `1.5` (≈13.5%). Reuse; note the design's line is lighter.                                                                                                                                                                      |
| 4   | chevron-left, `19px` (`e18a8`) `M11.875 14 L7.125 9.25 L11.875 4.5` stroke `1.9`; `20px` (`30066`) `M12.5 15 L7.5 10 L12.5 5` stroke `2`               | Existing glyph: **`ChevronLeftIcon`** (`M15 6l-6 6 6 6`, 24 box, stroke 2). The row's right-pointing chevron is `ChevronLeftIcon` under `rotate-180` — which `features/activity/components/activity-view.tsx` already does for its pager.                                                                                                                                                                                                    |
| 5   | arrow-up-right, `19px`, black (`1aa94`) and white (`37d8d`) — `M5.53993 13.8764 L13.4566 5.95972 M13.4566 13.8764 V5.95972 H5.53993`, stroke `1.74167` | Existing glyph: **`ArrowUpRightIcon`** (`M7 17 17 7M7 7h10v10`, 24 box, stroke `2.2`) — the same diagonal shaft plus top-right corner bracket. Pass `size={19}`; it inherits `currentColor`, so one component serves both the black and white instances.                                                                                                                                                                                     |
| 6   | status dots, `3px` and `2.85px` (`07bd5`, `fe410`, `91227`, `20631`, `551ea`, `eddd3`, `8d4e6`, …) — `<circle r="1.5" fill="#…"/>`                     | Not an asset. `size-[3px] rounded-full bg-current`.                                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | phone header rays (`6948d.svg`), 532.304 × 212.667, `opacity="0.04"`                                                                                   | **Byte-identical to `public/topbar-rays.svg`**, already committed. Reuse.                                                                                                                                                                                                                                                                                                                                                                    |
| 8   | desktop top band (`f64b5.svg`), 1071 × 79 `welcome tab`                                                                                                | Already `public/market/topbar-rays.svg`; already rendered by `components/layout/topbar.tsx` via `/rollout/chrome/topbar-starburst.svg`.                                                                                                                                                                                                                                                                                                      |
| 9   | sidebar wordmark (`imgVector`, `imgGroup`–`imgGroup3`)                                                                                                 | `components/ui/market-logo.tsx` / `public/market-logo.png`.                                                                                                                                                                                                                                                                                                                                                                                  |
| 10  | sidebar nav glyphs (`imgIcon1`–`imgIcon8`, `Group 48098407`)                                                                                           | `public/market/sidebar-icon-{portfolio,spot,meme,rwa,prediction,arkade,arktivity}.svg` + `public/rollout/nav/icon-marketsquare.svg`. The Arktivity glyph (`sidebar-icon-arktivity.svg`) already exists.                                                                                                                                                                                                                                      |
| 11  | account avatar (`imgVector427/428`, `imgEllipse`–`imgEllipse4`, `imgEllipse11`–`imgEllipse15`)                                                         | `components/ui/identicon.tsx` / `components/ui/avatar.tsx`, `public/avatar/avatar-0*.jpg`.                                                                                                                                                                                                                                                                                                                                                   |
| 12  | topbar bell / EN globe / chevron (`imgIcon`, `imgFrame2147225711`, `imgElements`), sidebar account chevron (`imgIcon9`)                                | `public/market/topbar-icon-{bell,globe,chevron}.svg`; existing chrome.                                                                                                                                                                                                                                                                                                                                                                       |

Note `SearchIcon` (the legacy export) hard-codes `stroke="rgba(255,255,255,0.4)"`
rather than `currentColor`, and its own in-file comment says new work should use
`SearchBoldIcon`. The design's search stroke is `rgba(255,255,255,0.45)`, close
but not equal to that hard-coded `0.4`.

---

## 9. Desktop vs phone — what actually changes

Beyond width:

1. **Page chrome.** Desktop has the 248px sidebar and the 1071 × 79 top band,
   and no screen title. Phone drops both and gains a `64.16px` `#232323` back
   header carrying a `40px` round back button, the centred **Inter Bold 18px**
   title `Arktivity`, and an `opacity: 0` `40px` search button acting as a
   spacer. Nothing else is hidden on either surface.

2. **The All Activity row is a different component, not a resized one.**
   Desktop: a `#121212` card, `rounded-[13px]`, `px 20 py 15`, with a fixed
   `72 × 191` absolutely-positioned left block and a `w 101` right column that
   stacks chevron → amount → caption. Phone: a transparent `py 16` row with a
   `rgba(255,236,236,0.1)` bottom divider, real auto-layout, and three
   `justify-between` lines — the amount moves up beside time/product and the
   caption moves down beside the status. The chevron moves from the top of the
   right column to the end of the title line.

3. **Row icon.** `45px` at `rounded-[13.75px]` on desktop; `40px` at
   `rounded-[12.222px]` on phone. The In Progress card icon is `40` /
   `12.222` on **both** surfaces.

4. **Type scale, All Activity.**

   | Element        | Desktop                         | Phone                           |
   | -------------- | ------------------------------- | ------------------------------- |
   | Day heading    | `14px / 17.191px`, `-0.14px`    | `11px / 16.5px`, `-0.11px`      |
   | Row title      | `14px`, `-0.14px`               | `13px`, `-0.13px`               |
   | Time · product | `12px / 16.5px`, `-0.12px`      | `11px / 16.5px`, `-0.11px`      |
   | Status         | `12px / 16.5px`, `-0.12px`      | `11px / 16.5px`, `-0.11px`      |
   | Amount         | Bold `14px / 16.5px`, `-0.14px` | Bold `13px / 16.5px`, `-0.13px` |
   | Caption        | `12px / 15.675px`, `-0.12px`    | `10px / 15.675px`, `-0.1px`     |

   The day heading drops three steps (14 → 11) while everything else drops one.

5. **Type scale, In Progress.** Product label and status `14 → 11`; card title
   `16 → 14`; subtitle, keys and fine print `12 → 11`. The pair **value** stays
   `14px / -0.14px` on both surfaces, so on phone the value is _larger_ than its
   own key by 3px instead of 2px.

6. **Card layout, In Progress.** Desktop absolutely positions three cards at
   `top 360 / 682 / 984` with three different shells (see §5.1). Phone is a
   single `flex-col gap-[12px]` list of three identical shells. The phone
   version is the correct one.

7. **Header controls.** Search `993 → 370` wide and `14px → 13px`; filter pills
   `h 48.102 / px 19.241 / 15px` → `h 40 / px 16 / 12px`, row gap `9.62 → 8`;
   tab labels `14px → 12px`. The tab rule stays `406px` on both.

8. **Buttons.** Desktop freezes `592` and `356`; phone uses `flex-1` plus a
   frozen `157`. Heights `51 → 41`, labels `14px → 13px`, radius `1000`/`100000`
   → `20.5`.

9. **Day headings.** Phone shows a heading above _both_ groups. Desktop shows
   one only above the second.

---

## 10. Ambiguities and contradictions

Listed plainly. None of these should be smoothed over in implementation; each
needs a decision.

### Contradictions between the four nodes

1. **`Live` is two colours.** `#00b147` in both All Activity lists, `#f5c518` in
   both In Progress lists. §6.

2. **The active tab is two colours.** `#ffffff` on `730:1288` and `730:788`
   (All Activity selected), `#f4f4f4` = `grey-100` on `730:1748` and `730:1134`
   (In Progress selected). Same component, same state, two fills.

3. **The Arkade In Progress card is a different colour on desktop.** `#1c1c1c`
   (`grey-800`), nested inside a bare `#121212` wrapper, while the Withdrawal
   and Predictions cards are `#121212` directly. On phone all three are
   `#121212`. Verified against a high-resolution render — the third card is
   visibly lighter. Almost certainly an accident.

4. **Row 3 of All Activity is a different row on each surface.**
   Desktop: `World cup prediction / 14:38 / Predictions / -250 USDT / Live /
Amount Sent`. Phone: `World Cup prediction / 15:22 / Predictions /
150␣␣USDC / Live / Stake Committed`. Different time, different amount,
   different sign, different caption. The phone reading (a committed stake on a
   live market) is the coherent one; the desktop reading duplicates row 2's
   withdrawal figures.

5. **Row 5's product differs.** `Funds deposit` is filed under **`Memecoins`**
   on desktop and **`Deposit`** on phone. `Deposit` is right.

6. **Row 9 is a different activity entirely.** Desktop: `withdrawal
unsuccessful` under product `arkade` with status `awaiting results` — a
   copy-paste of row 8's title onto an Arkade row. Phone: `Chess Match` under
   `Arkade`. Phone is right.

7. **Row 7's amount differs by three orders of magnitude.** `+25k KASH+`
   (desktop) vs `+25 Kash+` (phone). Also two casings of the ticker; the repo
   uses `KASH+` (`messages/en.json`: `"bought_kash": "Bought KASH+"`).

8. **`Predictions` vs `Prediction`.** Row 6's product is `Predictions` on
   desktop and `Prediction` on phone. The repo's sidebar label is `Prediction`
   (`sections.prediction`), the route is `/prediction`, but every other row in
   the design says `Predictions`. Pick one.

9. **`Stake Committed` is spelled three ways**, and `Paid 750USDC` is missing
   its space on desktop. §7.

10. **Times.** Desktop uses `14:32` / `14:38` throughout; phone uses `14:32`,
    `14:38`, then `15:22` for the remaining seven rows. Every desktop time
    string also carries a **trailing space** (`"14:32 "`), which would render as
    a gap before the separator dot.

### Internal problems in a single node

11. **The tab rule overflows the phone frame.** `w 406` at `left 16` inside a
    402-wide frame → the rule runs 20px past the right edge. On desktop the same
    406 is arbitrary (the tabs span 327).

12. **The active-indicator offsets do not follow the tabs.** Desktop: All
    Activity indicator at `left 41` (tab starts at 40, so +1); In Progress at
    `left 158` (tab 2 starts at `40 + 101 + 12 = 153`, so +5). Phone: `ml 1px`
    and `ml 111px` where `1 + 101 + 12 = 114` would be consistent. Derive the
    offset, do not hard-code these four numbers.

13. **A phantom third tab.** All four nodes carry an empty, unlabelled 101px tab
    after `In Progress`.

14. **Desktop group 1 has no day heading.** Phone has `Today, 9th September`
    above the same five rows. The heading is almost certainly missing on
    desktop, not deliberately suppressed.

15. **Both headings say `5 Activities` but group 2 holds 4 rows** — on both
    surfaces.

16. **Left-block geometry is absolute, not auto-layout,** on every desktop All
    Activity row: a fixed `h 72 × w 191` box with children pinned at `left 55`
    (title, time) and `left 57` (status). The 2px difference between 55 and 57
    is not intentional. A long title (`withdrawal unsuccessful` already runs to
    the edge) will clip or overlap the right column, and a translated title
    certainly will.

17. **The group gap changes between groups on desktop:** `24` for group 1,
    `22` for group 2. Likewise the left origin drifts `40 / 41 / 42` between the
    tab row, the day heading, and the two lists, and the search box is centred
    on `calc(50% + 2px)` rather than aligned to any of them.

18. **The single-value In Progress layout is the two-value layout with
    `opacity: 0`.** On both surfaces the Withdrawal card's right pair still
    occupies its width while invisible, and its hidden key is `11px / -0.11px`
    on desktop where its visible siblings are `12px / -0.12px`. Render one pair
    when there is one pair.

19. **Fine-print alignment is inconsistent within one screen.**
    `Confirmation Pending. Do not resend` is left-aligned; `210 USDC profit
before fees` and `60 USDC profit before fees` are right-aligned. Both sit in
    the same slot of the same card body.

20. **The identity-column width is three different numbers on desktop:** `141`,
    `161` (with a `164` title inside it — wider than its own parent), `160`
    (same). Phone uses `141` throughout.

21. **Button widths are frozen.** `592`/`356` on desktop, `157` plus `flex-1` on
    phone. `Review Cash out` in German (`Auszahlung prüfen`) and Portuguese
    (`Rever levantamento`) will not hold those boxes.

22. **The primary button's drop shadow is recorded twice with different blur.**
    The `button drop` variable says `6.506px`; the generated CSS says
    `3.253px`. Use the variable.

23. **`fontVariationSettings: '"wdth" 100'`** is set on every Mona Sans node.
    The repo's `mona-sans-latin.woff2` is loaded as `weight: "500 700"` with no
    width axis exposed, so this is inert — but it means the design was drawn in
    the full variable Mona Sans, not the subset the app ships.

### Conflicts with the repo

24. **`Inter` is not loaded in this repo.** The phone title is the only Inter
    string in the four nodes. Either add the face or render it in Mona Sans
    (`ws-display`) — which is what every other title on these screens uses
    anyway.

25. **Mona Sans is the _display_ family here, Geist is the body family.** The
    design sets Mona Sans SemiBold/Bold on _every_ string, including 10px
    captions. The repo's `body { font-family: var(--font-sans) }` is Geist at
    weight 500, and `--font-display` is reached only through `ws-display` (which
    forces weight 700 and `-0.01em`). Rendering these screens as drawn means
    opting every node out of the body font — a departure from the rest of the
    app that should be an explicit decision.

26. **`text-transform: capitalize` is on almost every text node.** It is how the
    desktop list's lowercase strings (`failed`, `awaiting results`, `not
debited`) render correctly. It will mangle German nouns and force title case
    on French, Spanish and Portuguese, where sentence case is correct. Author
    the English in its final case and drop the transform; the five catalogues
    then each carry their own correct casing.

27. **No card radius in the design matches a repo token.** `--radius-card` is
    `20px` and `ws-card` is `22px`; the design uses `13` (list row), `25` (In
    Progress card), `13.75` / `12.222` (icon), `26.723` / `22.222` (filter
    pill). Either extend the token set or accept arbitrary values, but do not
    silently round `25` to `22` and call it `ws-card`.

28. **`ws-card` cannot be reused for these surfaces.** It is
    `rgba(255,255,255,0.05)` on a `rgba(255,255,255,0.12)` border with an inset
    highlight. The design's cards are opaque `#121212` on a
    `rgba(255,255,255,0.05)` border with no highlight.

29. **`SearchField` does not match the design's pill.** The component is
    `h-[42px]`, `px-[9px]`, `gap-[6px]`, `rounded-full`, `border-hairline`
    (`0.12`), with a `13px` input and a `size-13` `SearchBoldIcon` at
    `text-grey-500`. The design is `h 51`, `px 24`, `gap 4`, `border-2` at
    `0.02`, a `14px` (desktop) / `13px` (phone) placeholder at
    `rgba(255,255,255,0.45)` and a `14px` icon. Reusing it means changing it for
    Spot as well, or giving it size variants.

30. **No shared tab-switch or back-header primitive exists.** The three nearest
    tab implementations are `features/square/components/square-tabs.tsx` (the
    only generic one, with proper roving tabindex), `features/portfolio/
components/holdings-view-switch.tsx` (hard-coded to two holdings ids) and
    `components/ui/trade-side-switch.tsx` (a radiogroup, not a tablist). The
    back-header is copy-pasted across 30+ screens; `components/ui/sheet-nav.tsx`
    is the closest but hard-codes `useTranslations("fundsFlow")` and reads
    `t("back")`, so it cannot be reused without generalising it.

31. **Every `button` in this repo gets `ws-pressable` automatically** (hover
    lift `translateY(-2px) scale(1.02)`, plus a click ripple) unless it carries
    `data-no-ripple`. The design shows no hover or press state at all. Decide
    per element whether the lift is wanted on a full-width list row.

32. **`@source` in `app/globals.css` lists only `../app ../components ../features
../lib ../hooks`.** Any new directory holding markup must be added there or
    its utility classes are dropped from the stylesheet silently — no error, no
    warning.

33. **The existing `activity` namespace collides.** `messages/en.json` already
    defines `activity.today`, `activity.yesterday`, `activity.eyebrow`,
    `activity.subtitle` and 53 other keys, all populated in `de`, `es`, `fr` and
    `pt`. The new statuses, captions and product labels need a nested namespace
    (`activity.status.*`, `activity.caption.*`, `activity.product.*`,
    `activity.filter.*`) rather than flat additions that would sit beside the
    existing 43 `kind` keys and be impossible to tell apart.

34. **`AssetIcon`'s corner-radius rule fights the design.** It hard-codes
    `round = size > 24 ? 11 : 999`. The design wants `13.75` at `45px` and
    `12.222` at `40px`. Either pass a radius through or wrap it.

### Open questions no node answers

35. Neither filter pill has an open, hovered, focused or selected state, and
    there is no menu, no option list, and no indication of what `All Products`
    expands to. `Last 30 Days` implies a range picker that does not exist here.
36. There is no loading, empty, error or partial state for either tab. The
    existing `ActivityView` has all four (`loading`, `errorBody`, `emptyTitle`,
    `partialBody`), and the repo's rules require explicit loading and error
    states — so four states per tab must be designed or derived.
37. There is no pagination, infinite scroll or "load more" anywhere, though the
    existing implementation pages at 12 rows.
38. The row chevron implies a detail screen that is not in these four nodes.
    Neither is the destination of `View Details ↗`.
39. `Review Cash out` implies a cash-out flow with no design here.
40. The search field has no clear button, no results state and no empty-results
    state.
41. Nothing indicates focus rings or keyboard affordances on the tabs, pills,
    rows or buttons.
42. Amounts are shown as `+$420.00`, `-250 USDT`, `+23.5M PEPE`, `+500 USDC`,
    `+25 Kash+`, `90 USD`, `30 USD` — a mix of fiat, token quantity and
    abbreviated quantity, with the sign sometimes present and sometimes not
    (`90 USD`, `30 USD`, `150␣␣USDC` carry no sign). The repo's rules require
    base units and `bigint` for asset amounts, converted only at the display
    edge; the design gives no rule for when a sign appears or how `23.5M` is
    abbreviated.

---

## 11. What is in and out of scope for a first slice

Not a plan — just what the four nodes do and do not cover.

**Covered by these nodes:** the phone back header; the search field; the two-tab
switch and its rule; the two filter pills (resting state only); the day-grouped
All Activity list at both breakpoints; the three In Progress card layouts
(one-pair + one button, two-pair + two buttons, two-pair + one button) at both
breakpoints; the complete status and caption vocabulary.

**Not covered anywhere:** filter menus; loading / empty / error / partial states;
pagination; the row detail destination; the `View Details` destination; the cash
-out flow; focus and hover states; tablet (nothing between 402 and 1339 exists).
