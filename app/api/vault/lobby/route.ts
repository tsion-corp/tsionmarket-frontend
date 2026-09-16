import { NextResponse } from "next/server";
import { wsapiService } from "@/lib/wsapi-base";
import { cached } from "@/lib/server/response-cache";
import { readLobbyFromChain } from "@/lib/server/vault-chain";

/**
 * The Last Man lobby: the vault service's index, or the chain when the index
 * cannot answer.
 *
 * The service is asked first and believed, including when it answers with an
 * empty lobby. The chain is read only when the service cannot be reached at
 * all. See ADR-2026-09-15-last-man-v5-usdc, decision 7.
 *
 * The fallback is deliberately the expensive path and deliberately rare: it
 * reads on the server so every viewer shares one answer, it is two RPC round
 * trips regardless of how many games exist (lib/server/vault-chain), and the
 * result is cached so a lobby full of browsers and a reconnecting socket
 * collapse onto one read.
 *
 * `source` says which answered. The UI uses it to tell the player the index is
 * catching up rather than presenting two sources as if they were one.
 */

const BASE = process.env.NEXT_PUBLIC_VAULT_API_URL ?? wsapiService("world-street-vault");
const VAULT = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;

// A game's clock is 60s and its pot moves on every wager, so the window is
// short. It exists to collapse concurrent pollers, not to hold state.
const CACHE_TTL_MS = 3_000;
const SERVICE_TIMEOUT_MS = 6_000;
const NO_STORE = "no-store, max-age=0, must-revalidate";

interface Lobby {
  games: unknown[];
  source: "index" | "chain";
}

async function fromService(): Promise<unknown[] | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/games?status=active`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const games = body?.data?.games;
    return Array.isArray(games) ? games : null;
  } catch (error) {
    console.warn("Vault lobby: the service did not answer; reading the chain", error);
    return null;
  }
}

async function loadLobby(): Promise<Lobby> {
  const indexed = await fromService();
  // The service is the source of truth, including when it says there is
  // nothing: an empty lobby is the normal state between games, and reading the
  // chain to confirm it would cost an RPC round trip on every poll, for ever,
  // to learn what we were just told.
  //
  // This deliberately no longer falls through on an empty list. It did while
  // the service's index was returning nothing for games that existed
  // (2026-09-15); that is fixed, the index now carries both contracts and
  // prices every row, so only an UNREACHABLE service is worth reading the
  // chain for.
  if (indexed !== null) return { games: indexed, source: "index" };
  if (!VAULT) throw new Error("Vault lobby: no contract address is configured");
  return { games: await readLobbyFromChain(VAULT), source: "chain" };
}

export async function GET() {
  try {
    const lobby = await cached("vault:lobby", loadLobby, CACHE_TTL_MS);
    return NextResponse.json(
      { success: true, data: lobby },
      { headers: { "cache-control": NO_STORE } }
    );
  } catch (error) {
    // An empty index and a chain that cannot answer is not an empty lobby, and
    // must not be served as one: the player would be told there is no game
    // when there may well be.
    console.error("Vault lobby failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "The game list is unavailable." },
      },
      { status: 502, headers: { "cache-control": NO_STORE } }
    );
  }
}
