// The casino's card surface and buttons, shared by any casino screen rather
// than by one game. These are the app's own greys: a casino panel sits inside
// the same dashboard shell as the portfolio, so it uses the near-black sheet
// plus a faint white lift, exactly like the cards elsewhere.

export const CASINO_CARD_BG =
  "linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.025) 100%)";
export const CASINO_CARD_SHADOW =
  "inset 0 .1rem 0 0 rgba(255, 255, 255, 0.07), 0 .1rem .2rem 0 rgba(0, 0, 0, 0.20)";

// White on ink is the app's primary button everywhere else.
export const CASINO_PRIMARY_BUTTON_CLASS =
  "text-ink cursor-pointer rounded-full bg-white shadow-[0_12px_24px_rgba(0,0,0,0.18)] transition-[opacity,transform] hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";
export const CASINO_SECONDARY_BUTTON_CLASS =
  "cursor-pointer rounded-full border border-white/12 bg-white/4 text-white/82 transition-colors hover:border-white/24 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-45";
