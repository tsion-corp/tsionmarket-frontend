// Surfaces and buttons shared by every chess screen.
//
// These are the app's own greys, not the warm palette the screens were ported
// with. A chess page sits inside the same dashboard shell as the portfolio, so
// a #312E2B panel read as a different product bolted on: it was lighter and
// warmer than every other surface on the page. Panels here are the near-black
// sheet plus a faint white lift, exactly like the cards elsewhere.

// The page-level panel a board or a rail sits on.
export const CHESS_SURFACE_BG = "rgba(255, 255, 255, 0.04)";
// Recessed strips: player bars, clocks, the rail header.
export const CHESS_SHELL_BG = "rgba(0, 0, 0, 0.28)";
// The side rail, marginally lifted off the page so its edge reads.
export const CHESS_SIDEBAR_BG =
  "linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)";
export const CHESS_CARD_BG =
  "linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.025) 100%)";
export const CHESS_CARD_SHADOW =
  "inset 0 .1rem 0 0 rgba(255, 255, 255, 0.07), 0 .1rem .2rem 0 rgba(0, 0, 0, 0.20)";
export const CHESS_SHELL_SHADOW = "0 .1rem .1rem 0 rgba(0, 0, 0, 0.20)";
// The board is w-full with aspect-square cells, so its height follows its
// width and capping the width is how the whole board is kept on screen. The
// dvh term is what does that: without it the board grows to 780px, runs past
// the fold, and the page scrolls to reach the bottom rank. The subtraction
// covers the sticky topbar, the casino back link, and the player bars and
// clocks stacked above and below the board inside its panel.
export const CHESS_PAGE_BOARD_MAX_WIDTH = "min(100%, 780px, calc(100dvh - 300px))";

// White on ink is the app's primary button everywhere else, so chess uses it
// too rather than the tan it was ported with.
export const CHESS_PRIMARY_BUTTON_CLASS =
  "text-ink cursor-pointer rounded-full bg-white shadow-[0_12px_24px_rgba(0,0,0,0.18)] transition-[opacity,transform] hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";
export const CHESS_SECONDARY_BUTTON_CLASS =
  "cursor-pointer rounded-full border border-white/12 bg-white/4 text-white/82 transition-colors hover:border-white/24 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-45";

export const CHESS_MODAL_PANEL_CLASS =
  "bg-sheet border-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_-20px_90px_-30px_rgba(0,0,0,0.95)]";
export const CHESS_MODAL_CLOSE_BUTTON_CLASS =
  "border-white/10 bg-white/8 text-white/76 hover:bg-white/14 hover:text-white";
