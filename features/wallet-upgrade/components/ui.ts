/**
 * The upgrade's shared look, in one place so every panel agrees.
 *
 * Built on the app's own vocabulary: the black canvas, `ws-card` surfaces, the
 * Mona Sans display face (`ws-display`), the silver accent, and the gold the
 * earlier upgrade used for progress. Nothing here is new colour.
 */

/** A surface. The only box the page uses, so it reads as one system. */
export const PANEL = "ws-card flex flex-col gap-5 p-6 sm:p-8";

/** A smaller surface inside a panel (an address, a chain, a word). */
export const WELL = "rounded-2xl border border-white/8 bg-black/35";

export const TITLE =
  "ws-display text-[26px] leading-[1.1] tracking-[-0.02em] text-white sm:text-[30px]";
export const SUBTITLE = "ws-display text-[20px] leading-[1.15] tracking-[-0.015em] text-white";
export const BODY = "text-[14.5px] leading-relaxed text-white/60";
export const SMALL = "text-[12.5px] leading-snug text-white/45";

export const FIELD =
  "w-full rounded-2xl border border-white/12 bg-black/40 px-4 py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/50 focus:bg-black/60";

export const PRIMARY =
  "ws-pressable ws-chrome flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-center text-[15px] font-semibold text-ink hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40";

export const SECONDARY =
  "ws-pressable flex w-full items-center justify-center rounded-full border border-white/20 px-6 py-3.5 text-[15px] font-medium text-white/85 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40";

export const LINK =
  "self-center text-[13px] text-white/50 underline underline-offset-4 transition-colors hover:text-white";

export const NOTICE = {
  warn: "rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-[13.5px] leading-snug text-amber-100",
  error:
    "rounded-2xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-[13.5px] leading-snug text-red-100",
  good: "rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-[13.5px] leading-snug text-emerald-100",
} as const;

/** A small label above a title or a group. */
export const KICKER = "text-[11.5px] font-medium tracking-[0.14em] text-white/45 uppercase";
