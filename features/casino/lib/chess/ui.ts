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
// The card surface and the buttons are the casino's, not chess's. They keep
// their chess names here so the screens that use them do not all have to
// change, but there is one definition.
export {
  CASINO_CARD_BG as CHESS_CARD_BG,
  CASINO_CARD_SHADOW as CHESS_CARD_SHADOW,
  CASINO_PRIMARY_BUTTON_CLASS as CHESS_PRIMARY_BUTTON_CLASS,
  CASINO_SECONDARY_BUTTON_CLASS as CHESS_SECONDARY_BUTTON_CLASS,
} from "@/features/casino/lib/surface";
export const CHESS_SHELL_SHADOW = "0 .1rem .1rem 0 rgba(0, 0, 0, 0.20)";
// The board is w-full with aspect-square cells, so its height follows its
// width and capping the width is how the whole board is kept on screen. The
// dvh term is what does that: without it the board grows to 780px, runs past
// the fold, and the page scrolls to reach the bottom rank. The subtraction
// covers the sticky topbar, the casino back link, and the player bars and
// clocks stacked above and below the board inside its panel.
export const CHESS_PAGE_BOARD_MAX_WIDTH = "min(100%, 780px, var(--chess-page-board-cap, 780px))";

export const CHESS_MODAL_PANEL_CLASS =
  "bg-sheet border-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_-20px_90px_-30px_rgba(0,0,0,0.95)]";
export const CHESS_MODAL_CLOSE_BUTTON_CLASS =
  "border-white/10 bg-white/8 text-white/76 hover:bg-white/14 hover:text-white";
