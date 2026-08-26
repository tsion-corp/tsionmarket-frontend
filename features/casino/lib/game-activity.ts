// Turns a player's off-chain game history into activity entries. Chess,
// checkers and ArkBall settle in the shared cashier ledger, not on-chain, so
// their plays never appear in the transfer feed. Each game's own history endpoint
// is the source instead, normalized here into the same ActivityEntry the on-chain
// feed uses, so a route can merge the two into one list.
//
// Real-money only: a match counts when it settled with a stake; a lottery ticket
// always cost money. Free and practice games never reach the money feed.
//
// Pure: no framework, no network, so every branch here is unit tested.

import type { ChessMatch } from "@/features/casino/lib/api/types";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";
import type { LotteryTicket } from "@/lib/api/schemas/lottery";
import type { ActivityEntry, ActivityKind } from "@/lib/activity/entries";

type Outcome = "won" | "lost" | "draw";
type Game = "chess" | "checkers";

// A non-explorer network id: a game entry has no on-chain transaction, so the
// row must not build a block-explorer link for it.
const OFFCHAIN = "arkade";

function usd(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// The wallet's outcome in a settled two-player game, or null when the wallet did
// not play it. `winnerSide` is null for a draw.
function outcomeFor(
  wallet: string,
  whiteWallet: string | undefined,
  blackWallet: string | undefined,
  winnerSide: "white" | "black" | null
): { outcome: Outcome; opponent: string | null } | null {
  const w = wallet.toLowerCase();
  const white = whiteWallet?.toLowerCase();
  const black = blackWallet?.toLowerCase();
  const side = white === w ? "white" : black === w ? "black" : null;
  if (!side) return null;
  const opponent = (side === "white" ? blackWallet : whiteWallet) ?? null;
  if (winnerSide === null) return { outcome: "draw", opponent };
  return { outcome: winnerSide === side ? "won" : "lost", opponent };
}

const GAME_KIND: Record<Game, Record<Outcome, ActivityKind>> = {
  chess: { won: "won_chess", lost: "lost_chess", draw: "drew_chess" },
  checkers: { won: "won_checkers", lost: "lost_checkers", draw: "drew_checkers" },
};

// One settled real-money match, as the money that moved for this wallet: a win
// pays roughly the stake (the exact payout is not on the match, so the stake is
// the honest summary), a loss forfeits the stake, a draw refunds it (amount 0).
function matchEntry(
  game: Game,
  matchId: string,
  outcome: Outcome,
  stake: number,
  opponent: string | null,
  createdAt: string
): ActivityEntry {
  return {
    id: `game:${game}:${matchId}`,
    hash: matchId,
    network: OFFCHAIN,
    timestamp: Date.parse(createdAt) || 0,
    kind: GAME_KIND[game][outcome],
    symbol: "USD",
    amount: outcome === "draw" ? 0 : stake,
    direction: outcome === "won" ? "in" : "out",
    counterparty: opponent,
    logo: null,
  };
}

export function chessMatchesToEntries(matches: ChessMatch[], wallet: string): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const m of matches) {
    if (m.state !== "settled" || !m.result) continue;
    const stake = usd(m.stakeUsdc);
    if (stake <= 0) continue;
    // Chess reports the winner as "w"/"b"; the seats are white/black.
    const winnerSide =
      m.result.kind === "draw" ? null : m.result.winner === "w" ? "white" : "black";
    const decided = outcomeFor(wallet, m.white?.walletAddress, m.black?.walletAddress, winnerSide);
    if (!decided) continue;
    out.push(matchEntry("chess", m.id, decided.outcome, stake, decided.opponent, m.createdAt));
  }
  return out;
}

export function draughtsMatchesToEntries(
  matches: DraughtsMatch[],
  wallet: string
): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const m of matches) {
    if (m.state !== "settled" || !m.result || !m.wager) continue;
    const stake = usd(m.wager.stakeUsdc);
    if (stake <= 0) continue;
    const winnerSide = m.result.kind === "draw" ? null : m.result.winner;
    const decided = outcomeFor(wallet, m.white?.walletAddress, m.black?.walletAddress, winnerSide);
    if (!decided) continue;
    out.push(matchEntry("checkers", m.id, decided.outcome, stake, decided.opponent, m.createdAt));
  }
  return out;
}

// Each ArkBall ticket: a purchase (the price left the wallet), and a separate
// win when it hits. A refunded ticket nets to zero and is dropped.
export function lotteryTicketsToEntries(tickets: LotteryTicket[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const t of tickets) {
    if (t.status === "refunded") continue;
    if (t.status === "won") {
      out.push({
        id: `game:arkball-won:${t.id}`,
        hash: t.id,
        network: OFFCHAIN,
        timestamp: Date.parse(t.settledAt ?? t.acceptedAt) || 0,
        kind: "arkball_won",
        symbol: "USD",
        amount: usd(t.payoutUsdc),
        direction: "in",
        counterparty: null,
        logo: null,
      });
      continue;
    }
    out.push({
      id: `game:arkball:${t.id}`,
      hash: t.id,
      network: OFFCHAIN,
      timestamp: Date.parse(t.acceptedAt) || 0,
      kind: "arkball_ticket",
      symbol: "USD",
      amount: usd(t.priceUsdc),
      direction: "out",
      counterparty: null,
      logo: null,
    });
  }
  return out;
}
