// What the discovery cards need in order to feature something.
//
// The cards rotate through live content, but discovery must not reach into
// trade, prediction, meme or square to get it: features never import each
// other. So each card takes a plain array of the shapes below and the route
// composes them, mapping whatever its own feature hooks return into these.
//
// Everything here is already display-ready. A card formats nothing and rounds
// nothing, which keeps money formatting in one place rather than in four cards.
//
// A few fields below are the exception, and they are additive, not a change
// of policy: `priceUsd`, `token` and `chain`/`address` are raw values a card
// never draws. They exist because the Buy pill now opens a trade sheet
// (BuySheet, MemeTradeSheet, RwaTradeModal) instead of a link, and a trade
// sheet needs the number or identity a formatted string has already thrown
// away. A card still renders only its formatted fields; the raw ones ride
// alongside for whatever opens the sheet to pass on untouched.
//
// All of them are optional on the type, not because a real adapter ever
// skips one: `tokens.ts`, `memecoins.ts` and `real-assets.ts` always fill
// them in. They are optional so this stays a purely additive change: a
// fixture built before this change, listing every field of the old shape by
// hand, still satisfies the type without editing files outside this task.

import type { MemeToken } from "@/lib/meme/api";
import type { RwaChain } from "@/lib/rwa/catalog";

/** One token the "Stay Ahead of Token Moves" card can feature. */
export interface TokenSpot {
  symbol: string;
  name: string;
  /** Formatted for display, e.g. "$1,876,617". Never a raw number. */
  price: string;
  /**
   * The same price as `price`, unrounded. Not for the card: it is what the
   * buy sheet's "you get about" estimate is computed from (`BuyPayload.priceUsd`).
   */
  priceUsd?: number;
  /**
   * The token's CoinGecko coin id, so the detail sheet charts the real series.
   * The market feed is CoinGecko's own top-coins list, so it carries an id for
   * everything it returns. Without this only the dozen tickers in
   * `COINGECKO_IDS` would chart and the rest of the row would fall back to an
   * empty state, despite CoinGecko having their full history.
   */
  coingeckoId?: string;
  /** Formatted and signed, e.g. "+12.8%". */
  change: string;
  /** Whether `change` is a gain, so the card can colour it without parsing. */
  up: boolean;
  /** Absolute percentage, for the tip's copy. Formatted, e.g. "12.8%". */
  movePercent: string;
  logo: string | null;
  href: string;
}

/** One market the "Your Next Prediction Starts Here" card can feature. */
export interface PredictionSpot {
  id: string;
  /** The market's question, as the card's headline. */
  question: string;
  /**
   * When the market resolves, epoch milliseconds, or null when it has no
   * deadline.
   *
   * The raw instant, not a formatted string. A countdown is the one figure on
   * these cards that cannot be formatted upstream: it changes every second, so
   * only the view that ticks it can turn it into text. This field replaced a
   * pre-formatted `countdown`, which had been filled from a clock face typed
   * into the message catalogue and so read the same on every card forever.
   */
  closesAt: number | null;
  /** The collage takes two; fewer is fine, more is ignored. */
  images: readonly string[];
  href: string;
}

/** One room the "Join the Conversation" card can feature. */
export interface SpaceSpot {
  id: string;
  /** The room's name, e.g. "Mitolyx Playroom". */
  room: string;
  headline: string;
  /** Member avatars for the scatter. The card uses as many as it draws. */
  avatars: readonly string[];
  /** Where the primary pill leads. */
  href: string;
  /** Where the secondary pill leads. */
  actionHref: string;
}

/** One trending memecoin the "Find the next 100X" card can feature. */
export interface MemeSpot {
  symbol: string;
  name: string;
  /** Formatted and signed, e.g. "+1000%". */
  change: string;
  up: boolean;
  image: string | null;
  href: string;
  /**
   * The whole token, untouched. `MemeTradeSheet` takes a full `MemeToken`,
   * not the handful of fields this card draws, and the adapter already has
   * one in hand, so carrying it through is simpler and more honest than
   * picking fields back out into a second shape that would need to be kept
   * in sync with the sheet's own. The card still reads only the fields
   * above; this rides alongside for the Buy pill to hand to the sheet.
   */
  token?: MemeToken;
}

/** One tokenised asset the "Own the Real World" cards can feature. */
export interface RwaSpot {
  id: string;
  symbol: string;
  name: string;
  /** Who stands behind it, e.g. "Ondo Finance". */
  issuer: string;
  /** The registry's category: commodity, treasury, real-estate, equity, ... */
  category: string;
  /** Formatted, e.g. "$403.83", or null when the feed has no price. */
  price: string | null;
  /** Formatted and signed, e.g. "+0.26%", or null when the feed has no move. */
  change: string | null;
  up: boolean;
  /** Formatted published yield, e.g. "3.76%", or null for an asset that pays none. */
  apy: string | null;
  logo: string | null;
  href: string;
  /**
   * The registry chain and contract address, needed to build an
   * `RwaTradePayload` for `RwaTradeModal`. Not the same vocabulary as that
   * payload's `network`: the registry names chains like "base" and "solana",
   * while `RwaTradePayload.network` and the portfolio's own RWA holdings
   * flow use Alchemy network ids like "base-mainnet" and "solana-mainnet"
   * (see `chainNetwork` in `features/rwa/lib/presenter.ts`, the mapping the
   * portfolio's `findRwaAsset` already inverts). Whoever opens the trade
   * sheet from this card converts `chain` through that function; it is not
   * done here because it is a feature-layer concern.
   */
  chain?: RwaChain;
  address?: string;
}
