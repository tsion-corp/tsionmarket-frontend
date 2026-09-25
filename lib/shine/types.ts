// What a feature reports to Shine: a confirmed thing that happened, and the
// facts about it. Nothing else.
//
// There is deliberately no free-text field on any event. A composer builds the
// sentence from these fields alone, so the only way a figure reaches a public
// post is through a branded type from lib/shine/money, and the only figures
// that have a constructor there are a price, a percentage return and odds.
//
// Every optional fact is `T | null` and REQUIRED as a key. A wiring agent that
// cannot get the entry price has to write `price: null` and say so, rather
// than leaving a field off and later filling it with whatever was to hand.

import type { EntryPrice, Odds, PnlPercent } from "@/lib/shine/money";

export type ShineService =
  "memecoin" | "spot" | "rwa" | "prediction" | "perps" | "arcade" | "sports";

export const SHINE_SERVICES: readonly ShineService[] = [
  "memecoin",
  "spot",
  "rwa",
  "prediction",
  "perps",
  "arcade",
  "sports",
];

/**
 * A trade entry and its exit, shared by the three spot-shaped services.
 *
 * `id` is the service's own natural id, the thing the dedup store keys by:
 * `swapId` for memecoins, `requestId` for spot and cross-chain RWA, the action
 * id or transaction hash for a direct RWA settlement.
 */
interface TradeBuy {
  id: string;
  kind: "buy";
  /** The ticker alone. Rendered as a cashtag, so it must look like one. */
  symbol: string;
  price: EntryPrice | null;
}

interface TradeSell {
  id: string;
  kind: "sell";
  symbol: string;
  price: EntryPrice | null;
  /** A sale closes the position, so the outcome is known and may be stated. */
  pnl: PnlPercent | null;
}

export type ShineEvent =
  | ({ service: "memecoin" } & (TradeBuy | TradeSell))
  | ({ service: "spot" } & (TradeBuy | TradeSell))
  | ({ service: "rwa" } & (TradeBuy | TradeSell))
  | {
      service: "prediction";
      /** The Polymarket order id. */
      id: string;
      /** The market question, as the market itself words it. */
      market: string;
      /** The outcome bought, "Yes" or a named candidate. */
      outcome: string;
      /** Price per share, which is what a prediction market quotes. */
      price: EntryPrice | null;
    }
  | {
      service: "perps";
      /** The entry order id, or the position id once it exists. */
      id: string;
      kind: "open";
      symbol: string;
      side: "long" | "short";
      /** A multiplier, not money. Null when the app did not read one. */
      leverage: number | null;
      price: EntryPrice | null;
    }
  | {
      service: "perps";
      id: string;
      kind: "close";
      symbol: string;
      side: "long" | "short";
      price: EntryPrice | null;
      pnl: PnlPercent | null;
    }
  | {
      service: "arcade";
      /** `match.id` for chess and draughts, the ticket id for ArkBall. */
      id: string;
      /** The game's own name, as the arcade lists it. */
      game: string;
      outcome: "won" | "drawn";
      /** Return on the stake, not the stake. */
      pnl: PnlPercent | null;
    }
  | {
      service: "sports";
      /** `ticketId`. */
      id: string;
      kind: "placed";
      /** The fixture, as the sportsbook names it. */
      event: string;
      /** The selection on the slip. */
      selection: string;
      odds: Odds | null;
    }
  | {
      service: "sports";
      id: string;
      kind: "won";
      event: string;
      selection: string;
      pnl: PnlPercent | null;
    };
