import { NextResponse } from "next/server";
import { wsapiService } from "@/lib/wsapi-base";

// Every winner the vault has ever recorded, for the all-time board.
//
// The service pages its winners feed: 25 by default, 100 at most, with an
// opaque `nextCursor`. The lobby only ever asked for the first page, so the
// board it fed was the last 25 games rather than the history.
//
// The walk happens here rather than in the browser for three reasons: it is
// one upstream conversation instead of one per reader, the gateway rate-limits
// per IP and every reader shares this server's, and the browser gets a single
// small response instead of six round-trips it has to sequence itself.
const BASE = process.env.NEXT_PUBLIC_VAULT_API_URL ?? wsapiService("world-street-vault");

const PAGE_SIZE = 100;
// A ceiling, not an expectation: 577 rows today, so this is several years of
// headroom while still bounding the walk if a cursor ever failed to terminate.
const MAX_PAGES = 40;
// Winners only change when a game settles, so a minute of staleness costs a
// reader nothing and saves the gateway every walk but the first.
const CACHE_TTL_MS = 60_000;

interface UpstreamAmount {
  amount?: string;
  raw?: string;
  tokenSymbol?: string;
  token?: string;
  decimals?: number;
}

interface UpstreamWinner {
  gameId?: number;
  winner?: string;
  starter?: string;
  toWinner?: UpstreamAmount;
  paidToWinner?: UpstreamAmount;
  settledAt?: string | number;
}

// Only the fields the board reads. The full rows carry pot, treasury and
// starter splits per game, which would roughly triple a payload nothing uses.
// The client parses this back with onlyLeaderboardWinners; the two shapes are
// checked against each other in leaderboard-wire.test.ts.
type LeaderboardRow = {
  gameId: number;
  winner: string;
  paid: UpstreamAmount;
  settledAt: string | number | null;
};

function projectAmount(amount: UpstreamAmount): UpstreamAmount {
  return {
    amount: amount.amount,
    raw: amount.raw,
    tokenSymbol: amount.tokenSymbol,
    token: amount.token,
    decimals: amount.decimals,
  };
}

// A row we cannot attribute or price is not a leaderboard entry. Dropped here
// rather than rendered as a blank rank.
function projectWinner(row: UpstreamWinner): LeaderboardRow | null {
  const paid = row.paidToWinner ?? row.toWinner;
  if (!row.winner || typeof row.gameId !== "number" || !paid) return null;
  return {
    gameId: row.gameId,
    winner: row.winner,
    paid: projectAmount(paid),
    settledAt: row.settledAt ?? null,
  };
}

interface Cached {
  expires: number;
  body: string;
}

let cached: Cached | null = null;
// Concurrent readers on a cold cache share one walk instead of each starting
// their own; without this a busy lobby multiplies the upstream calls by the
// number of tabs open.
let inFlight: Promise<string> | null = null;

async function fetchPage(cursor: string | null): Promise<{
  rows: UpstreamWinner[];
  nextCursor: string | null;
}> {
  const url = new URL(`${BASE}/game/winners`);
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`winners page failed: ${res.status}`);
  const body = (await res.json()) as {
    data?: { winners?: unknown; nextCursor?: unknown };
  };
  const rows = Array.isArray(body.data?.winners) ? (body.data.winners as UpstreamWinner[]) : [];
  const next = typeof body.data?.nextCursor === "string" ? body.data.nextCursor : null;
  return { rows, nextCursor: next };
}

async function walkWinners(): Promise<string> {
  const winners: LeaderboardRow[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;

  for (; pages < MAX_PAGES; pages++) {
    const page: { rows: UpstreamWinner[]; nextCursor: string | null } = await fetchPage(cursor);
    for (const row of page.rows) {
      const projected = projectWinner(row);
      if (projected) winners.push(projected);
    }
    if (!page.nextCursor || page.rows.length === 0) break;
    // A cursor that repeats would otherwise walk until MAX_PAGES, paying for
    // pages that add nothing.
    if (seen.has(page.nextCursor)) break;
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
    if (pages === MAX_PAGES - 1) truncated = true;
  }

  return JSON.stringify({
    success: true,
    data: { winners, pages: pages + 1, truncated },
  });
}

export async function GET() {
  if (!BASE) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_CONFIGURED", message: "Vault isn't configured" } },
      { status: 503 }
    );
  }

  const hit = cached;
  if (hit && hit.expires > Date.now()) {
    return new NextResponse(hit.body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    inFlight ??= walkWinners();
    const body = await inFlight;
    cached = { expires: Date.now() + CACHE_TTL_MS, body };
    return new NextResponse(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Vault leaderboard walk failed:", error);
    // A stale board beats no board: the feed only grows, so yesterday's ranks
    // are still broadly true while the service is unreachable.
    if (hit) {
      return new NextResponse(hit.body, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return NextResponse.json(
      { success: false, error: { code: "UPSTREAM_ERROR", message: "Vault request failed" } },
      { status: 502 }
    );
  } finally {
    inFlight = null;
  }
}
