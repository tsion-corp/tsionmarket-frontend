import type { LeaderboardWinner, PaidAmount } from "@/features/casino/lib/vault-api";
import { usdOf } from "@/features/casino/lib/last-standing/pricing";

// The all-time board: one row per wallet, ranked by everything it has won.
//
// A game is played in whichever asset its starter chose, so a wallet's wins can
// span tokens. Amounts are summed as raw base units PER TOKEN and priced once
// at the end, so nothing accumulates float error across a wallet's history and
// a 6-decimal USDC win is never added to an 18-decimal one.

export interface LeaderboardEntry {
  address: string;
  totalUsd: number;
  wins: number;
  // The biggest single payout, for the row's secondary figure.
  bestUsd: number;
}

function tokenKey(amount: PaidAmount): string {
  return (amount.token ?? amount.tokenSymbol ?? "native").toLowerCase();
}

interface Tally {
  address: string;
  wins: number;
  bestUsd: number;
  // Raw base units per token, kept exact until the final conversion.
  byToken: Map<string, { raw: bigint; sample: PaidAmount }>;
}

function rawUnits(amount: PaidAmount): bigint | null {
  if (typeof amount.raw !== "string" || amount.raw.trim() === "") return null;
  try {
    return BigInt(amount.raw);
  } catch {
    return null;
  }
}

/**
 * Every wallet that has ever won, biggest total first.
 *
 * A payout that cannot be priced contributes nothing to the total but still
 * counts as a win, so a wallet never disappears from the board because one of
 * its games was played in an asset we have no price for.
 */
export function buildLeaderboard(
  winners: readonly LeaderboardWinner[],
  ethPriceUsd: number
): LeaderboardEntry[] {
  const tallies = new Map<string, Tally>();

  for (const winner of winners) {
    const address = winner.winner?.trim();
    if (!address) continue;
    const amount = winner.paid;
    if (!amount) continue;

    const key = address.toLowerCase();
    const tally = tallies.get(key) ?? {
      address,
      wins: 0,
      bestUsd: 0,
      byToken: new Map<string, { raw: bigint; sample: PaidAmount }>(),
    };
    tally.wins += 1;

    const raw = rawUnits(amount);
    if (raw !== null) {
      const token = tokenKey(amount);
      const held = tally.byToken.get(token);
      tally.byToken.set(token, {
        raw: (held?.raw ?? 0n) + raw,
        sample: held?.sample ?? amount,
      });
    }

    const usd = usdOf(amount, ethPriceUsd);
    if (usd !== null && usd > tally.bestUsd) tally.bestUsd = usd;

    tallies.set(key, tally);
  }

  const rows = [...tallies.values()].map((tally) => {
    let totalUsd = 0;
    for (const { raw, sample } of tally.byToken.values()) {
      // Back to a decimal amount from the exact base-unit sum, then priced by
      // the asset's own rule.
      const summed: PaidAmount = { ...sample, raw: raw.toString(), amount: fromRaw(raw, sample) };
      totalUsd += usdOf(summed, ethPriceUsd) ?? 0;
    }
    return {
      address: tally.address,
      totalUsd,
      wins: tally.wins,
      bestUsd: tally.bestUsd,
    };
  });

  // Ties break on wins, then address, so the order is stable between renders
  // rather than shifting under a reader as the feed refreshes.
  return rows.sort(
    (a, b) => b.totalUsd - a.totalUsd || b.wins - a.wins || a.address.localeCompare(b.address)
  );
}

function fromRaw(raw: bigint, sample: PaidAmount): string {
  const decimals = sample.decimals ?? 18;
  if (decimals <= 0) return raw.toString();
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const rest = (raw % base).toString().padStart(decimals, "0");
  return `${whole}.${rest}`;
}
