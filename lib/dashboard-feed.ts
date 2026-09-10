import type { PerpBriefRow } from "@/lib/perp/brief";

// What the dashboard shows that is the same for every user, composed once on
// the server and delivered as one value: the four briefs and the marquee's
// live events. Client-safe, so the browser's hook and the server's composer
// share the type.
//
// A section is null when its upstream could not answer. The brief then shows
// its unavailable state, and no browser ever asks that upstream itself, which
// is the point: a dead game gateway used to be polled by every open tab.

export type { PerpBriefRow } from "@/lib/perp/brief";

export interface SpotBriefRow {
  symbol: string;
  name: string;
  logo: string | null;
  priceUsd: number;
  change24h: number;
}

export interface MemeBriefRow {
  address: string;
  symbol: string | null;
  name: string | null;
  logoUrl: string | null;
  /** Decimal string, as the trade service sends it; formatted at the edge. */
  priceUsd: string | null;
  change24h: number | null;
}

export interface RwaBriefRow {
  id: string;
  symbol: string;
  name: string;
  /** Route-relative logo URL, resolved by the token-logo handler. */
  logo: string;
  priceUsd: number | null;
  change24h: number | null;
}

/** A Last Man Standing round that can still be joined. */
export interface LiveRound {
  gameId: number;
  /** Unix seconds. The browser drops the round the moment this passes. */
  endTime: number;
  potUsd: number;
  /** Formatted pot, ready to show. */
  pot: string;
}

export interface LiveMatch {
  id: string;
}

export interface DashboardLive {
  rounds: LiveRound[];
  chess: LiveMatch[];
  checkers: LiveMatch[];
}

export interface DashboardFeed {
  /** Epoch ms when the server composed this. */
  asOf: number;
  spot: SpotBriefRow[] | null;
  perps: PerpBriefRow[] | null;
  memes: MemeBriefRow[] | null;
  rwa: RwaBriefRow[] | null;
  live: DashboardLive | null;
}

export const DASHBOARD_FEED_KEY = ["dashboard-feed"] as const;

// Rows per brief carried in the feed. The briefs show four; eight leaves room
// for a row count change without a server change.
export const DASHBOARD_FEED_ROWS = 8;

/** One live thing happening right now, whichever game it belongs to. */
export interface LiveEvent {
  key: string;
  kind: "lastman" | "chess" | "checkers";
  href: string;
  /** Formatted pot, Last Man only. */
  pot?: string;
}

// The marquee's chips from the feed's live section, at a moment in time.
// Rounds whose clock has run out since the feed was composed are dropped
// here, which is what lets the browser re-run this on a timer without asking
// the server again.
export function liveEventsFrom(live: DashboardLive | null, nowSeconds: number): LiveEvent[] {
  if (!live) return [];
  return [
    ...live.rounds
      .filter((round) => round.endTime > nowSeconds)
      .map<LiveEvent>((round) => ({
        key: `lastman-${round.gameId}`,
        kind: "lastman",
        href: `/casino/last-standing/${round.gameId}`,
        pot: round.pot,
      })),
    ...live.chess.map<LiveEvent>((m) => ({
      key: `chess-${m.id}`,
      kind: "chess",
      href: `/casino/chess/watch?match=${encodeURIComponent(m.id)}`,
    })),
    ...live.checkers.map<LiveEvent>((m) => ({
      key: `checkers-${m.id}`,
      kind: "checkers",
      href: `/casino/checkers/play?match=${encodeURIComponent(m.id)}`,
    })),
  ];
}
