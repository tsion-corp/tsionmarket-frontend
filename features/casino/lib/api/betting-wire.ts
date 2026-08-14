// Normalizers for the spectator betting endpoints. The chess service documents
// the odds and bets responses in prose, not JSON, so the wire types keep every
// field optional and tolerate both camelCase and snake_case. The service is the
// authority on the exact keys; this is the one seam to adjust if they differ.
// Nothing here throws on a missing field: a malformed market renders as an empty
// one rather than breaking the spectator view.

import type {
  BetSelection,
  BetSlip,
  BetState,
  MarketOdds,
  MarketOutcome,
  MarketStatus,
} from "@/features/casino/lib/api/types";

const SELECTIONS: readonly BetSelection[] = ["white", "draw", "black"];

// A per-outcome value keyed by side, however the service groups it: a map
// (`{ white, draw, black }`) or a list of `{ outcome, ... }` rows.
type OutcomeMap<T> = Partial<Record<BetSelection, T>>;

interface OutcomePoolWire {
  poolUsdc?: string | number;
  pool_usdc?: string | number;
  decimalOdds?: string | number | null;
  decimal_odds?: string | number | null;
}

export interface MarketOddsWire {
  status?: string;
  total?: string | number;
  totalPool?: string | number;
  total_pool?: string | number;
  totalPoolUsdc?: string | number;
  total_pool_usdc?: string | number;
  rakeBps?: number;
  rake_bps?: number;
  pools?: OutcomeMap<string | number>;
  odds?: OutcomeMap<string | number>;
  outcomes?: Array<{ outcome?: string; pool?: string | number; odds?: string | number | null }>;
  white?: OutcomePoolWire;
  draw?: OutcomePoolWire;
  black?: OutcomePoolWire;
  winningOutcome?: string | null;
  winning_outcome?: string | null;
  voidReason?: string | null;
  void_reason?: string | null;
}

export interface BetSlipWire {
  id?: string;
  matchId?: string;
  match_id?: string;
  outcome?: string;
  selection?: string;
  stakeUsdc?: string | number;
  stake_usdc?: string | number;
  stake?: string | number;
  status?: string;
  state?: string;
  payout?: string | number | null;
  payoutUsdc?: string | number | null;
  payout_usdc?: string | number | null;
  createdAt?: string | null;
  created_at?: string | null;
  placedAt?: string | null;
}

function asString(value: string | number | null | undefined, fallback = "0"): string {
  if (value === null || value === undefined) return fallback;
  return typeof value === "number" ? String(value) : value;
}

function asSelection(value: string | null | undefined): BetSelection | null {
  return SELECTIONS.includes(value as BetSelection) ? (value as BetSelection) : null;
}

function asMarketStatus(value: string | undefined): MarketStatus {
  return value === "settled" || value === "voided" ? value : "open";
}

function asBetState(value: string | undefined): BetState {
  return value === "won" || value === "lost" || value === "refunded" ? value : "active";
}

// The decimal odds for one outcome. Prefer a server-sent price; when it is
// absent, derive the pari-mutuel price (total / pool) so the UI still shows a
// number. Null only when the pool is empty and no price exists.
function outcomeOdds(
  pool: string,
  sentOdds: string | number | null | undefined,
  total: string
): number | null {
  if (sentOdds !== null && sentOdds !== undefined && sentOdds !== "") {
    const n = Number(sentOdds);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const poolN = Number(pool);
  const totalN = Number(total);
  if (!Number.isFinite(poolN) || poolN <= 0 || !Number.isFinite(totalN)) return null;
  return totalN / poolN;
}

export function toMarketOdds(wire: MarketOddsWire): MarketOdds {
  // Fold the list form into a map so both shapes are handled the same way.
  const poolBy: OutcomeMap<string | number> = { ...wire.pools };
  const oddsBy: OutcomeMap<string | number> = { ...wire.odds };
  for (const row of wire.outcomes ?? []) {
    const side = asSelection(row.outcome);
    if (!side) continue;
    if (row.pool !== undefined) poolBy[side] = row.pool;
    if (row.odds !== undefined && row.odds !== null) oddsBy[side] = row.odds;
  }

  for (const side of SELECTIONS) {
    const direct = wire[side];
    if (!direct) continue;
    const pool = direct.poolUsdc ?? direct.pool_usdc;
    const odds = direct.decimalOdds ?? direct.decimal_odds;
    if (pool !== undefined) poolBy[side] = pool;
    if (odds !== undefined && odds !== null) oddsBy[side] = odds;
  }

  const total = asString(
    wire.total ?? wire.totalPool ?? wire.total_pool ?? wire.totalPoolUsdc ?? wire.total_pool_usdc
  );
  const outcomes = SELECTIONS.reduce(
    (acc, side) => {
      const pool = asString(poolBy[side]);
      acc[side] = { pool, odds: outcomeOdds(pool, oddsBy[side], total) };
      return acc;
    },
    {} as Record<BetSelection, MarketOutcome>
  );

  return {
    status: asMarketStatus(wire.status),
    total,
    outcomes,
    rakeBps: wire.rakeBps ?? wire.rake_bps,
    winningOutcome: asSelection(wire.winningOutcome ?? wire.winning_outcome),
    voidReason: wire.voidReason ?? wire.void_reason ?? null,
  };
}

export function toBetSlip(wire: BetSlipWire): BetSlip {
  const payout = wire.payoutUsdc ?? wire.payout_usdc ?? wire.payout;
  const state = asBetState(wire.status ?? wire.state);
  return {
    id: wire.id ?? "",
    matchId: wire.matchId ?? wire.match_id ?? "",
    selection: asSelection(wire.outcome ?? wire.selection) ?? "white",
    stakeUsdc: asString(wire.stakeUsdc ?? wire.stake_usdc ?? wire.stake),
    state,
    payoutUsdc:
      payout === null || payout === undefined || (state === "active" && Number(payout) === 0)
        ? null
        : asString(payout),
    placedAt: wire.createdAt ?? wire.created_at ?? wire.placedAt ?? null,
  };
}
