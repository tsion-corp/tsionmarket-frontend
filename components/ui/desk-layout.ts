"use client";

import { useSyncExternalStore } from "react";

// The geometry the 2.0 trading desks are built to: the market list on the left,
// the order ticket on the right, one search field over both. Spot was drawn to
// it first and Real assets follows it, so the numbers live here rather than in
// either desk. Two copies of a clamp drift; one does not.

// The two columns. The ticket column holds the order form and its controls, so
// it takes the sized track and the market list absorbs the rest.
//
// The ticket is 40% of the content column, floored at 430px and capped at
// 480px. Measured in the app shell, that is 430px below about a 1390px window,
// 451px at 1440px, and 480px from 1512px up to the container's 1520px maximum,
// where the list takes 960px. The floor is what keeps the desk's minimum width
// where it was, since nothing below 1390px gets narrower. The list carries
// 410px of fixed numeric columns, so at the xl breakpoint it is already down to
// 522px, and taking another 50px off the asset name there would leave it
// nothing to sit in.
//
// One track rather than a second breakpoint: Tailwind emits an arbitrary
// `min-[1440px]:` rule ahead of the named `xl:` one, so a wider track declared
// that way loses to the narrower one at every width. Measured, not assumed.
//
// The row stretches, and the market list is the panel that answers to it. The
// table carries `self-stretch` and grows the region above its pager, so it
// fills the row and reaches the bottom of the window. The ticket opts out with
// `self-start` on its own aside: stretching it left roughly 110px of empty card
// on a 900px window between the quick amounts and the summary its `mt-auto`
// block pins to the foot. The stretch is removed at the one panel that must not
// have it rather than by turning the whole row to `items-start`, so the row's
// alignment is still the grid default anything else dropped into it inherits.
//
// `grow` is the last link in the chain that carries the viewport's height down
// to the panels: the container is at least a screen tall from xl up, the column
// inside it grows to that height, and this grid takes what the search field
// leaves. A grid whose single implicit row is auto sized stretches that row to
// fill the container, and `items-stretch` hands the height to the list. Below
// xl the container has no minimum height, so `grow` finds no free space and the
// stacked page keeps scrolling normally.
export const DESK_GRID =
  "grid grow items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_clamp(430px,40%,480px)]";

// The order ticket's own box, shared with the loading skeleton so the two stand
// at the same width and the same floor.
export const TICKET_PANEL =
  "border-hairline bg-surface flex flex-col self-start rounded-3xl border p-[11px] xl:min-h-[590px]";

// The desk is a screen tall from xl up, which is what lets the market list
// reach the bottom of the window instead of stopping under its last row.
// Stretching the panel inside the grid row is not enough on its own: nothing
// between the viewport and this container passes a height down, so the row is
// only ever as tall as its taller child and the window below it is page
// background.
//
// The subtraction is short because this box is the one the height is set on.
// Border-box sizing puts its own padding inside the figure, so the padding is
// spent from the screen rather than added to it, and the shell's main already
// reserves the broadcast bar as its own bottom padding, so only the topbar
// (79px from md up, in flow above this) and that same bar come off.
//
// dvh, not vh: on a mobile browser vh is the tallest the viewport ever gets and
// would run the desk under the browser's own chrome. min-h, not h, so a window
// too short for the desk grows the container and scrolls the page instead of
// spilling rows out of the panel. And xl only, because below it the two columns
// stack, and a stacked desk pinned to the viewport would put the ticket
// permanently below the fold.
export const DESK_CONTAINER =
  "mx-auto flex w-full max-w-[1520px] flex-col p-4 sm:p-6 lg:p-8 xl:min-h-[calc(100dvh-79px-var(--ws-live-bar,0px))]";

// The outer height of one asset row, border included. Read off the rendered
// table in Chrome rather than taken from the design: the 33px asset chip in
// `py-3` makes 57px of box and `border-b` adds the last pixel, so consecutive
// rows are 58px apart. The last row drops its rule and is 57.
//
// A fitted count divides the space by this and floors, so a value under the
// truth compounds over a page and fits a row the panel would then clip.
export const ASSET_ROW_HEIGHT = 58;

// Rows to a page, the number the Figma frame draws, and the size a list pages
// at until its panel has been measured. It is what the server renders and what
// the first client render hydrates with, before any box exists to read, so it
// must not be derived from anything.
export const ASSET_PAGE_SIZE = 9;

// The width DESK_GRID puts the two columns side by side at, which is Tailwind's
// `xl`.
const SIDE_BY_SIDE = "(min-width: 1280px)";

function subscribeToDeskWidth(notify: () => void): () => void {
  const query = window.matchMedia(SIDE_BY_SIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

// True once a desk lays its two columns out side by side.
//
// Only then is the desk a screen tall, and only then is there spare panel
// height for the market list to fill: below xl the columns stack, the container
// drops its minimum height and the page scrolls, so the list keeps the design's
// fallback rows. Measuring there would read the rows' own height back and drift
// a row at a time, which is exactly the runaway useFittedRowCount warns about.
//
// The server has no viewport and answers false, which is also what the fitted
// count falls back to, so the first client render matches the HTML it hydrates
// and the correction happens after.
export function useSideBySideDesk(): boolean {
  return useSyncExternalStore(
    subscribeToDeskWidth,
    () => window.matchMedia(SIDE_BY_SIDE).matches,
    () => false
  );
}
