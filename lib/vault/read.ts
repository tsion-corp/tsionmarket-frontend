import type { PublicClient } from "viem";
import { KING_OF_NIGHT_ABI } from "@/lib/vault/king-of-night-abi";
import { vaultContractAddress } from "@/lib/vault/contract";

// Reads of the Last Standing contract that both sides need: the arcade in the
// browser through the RPC proxy, and the dashboard feed on the server through
// the provider directly. The client is passed in, so this file knows nothing
// about where the RPC lives.

// Ids are sequential from 1, so the newest games are the highest ids. Only the
// tail is scanned: older games have settled and the lobby does not list them.
export const CHAIN_SCAN_LIMIT = 20;

export interface ChainGame {
  gameId: number;
  starter: string;
  king: string;
  potWei: bigint;
  minWagerWei: bigint;
  endTime: number;
}

/**
 * The live games straight from the contract.
 *
 * The indexed lobby trails the chain, so a game the user just paid for is not
 * in `GET /games` yet and the screen says nothing is running. Reading the
 * contract is what the service's own docs recommend for exactly this window.
 *
 * One multicall rather than a request per id, so the whole tail costs a single
 * round trip.
 */
// Only the two reads this needs, so a client built for a specific chain and
// transport and one built generically are both accepted; the full PublicClient
// type carries generics that make the two incompatible for no reason that
// matters here.
export type VaultReadClient = Pick<PublicClient, "readContract" | "multicall">;

export async function readActiveGamesWith(
  client: VaultReadClient,
  now = Math.floor(Date.now() / 1000)
): Promise<ChainGame[]> {
  const address = vaultContractAddress();
  const next = await client.readContract({
    address,
    abi: KING_OF_NIGHT_ABI,
    functionName: "nextGameId",
  });

  const highest = Number(next) - 1;
  if (highest < 1) return [];
  const lowest = Math.max(1, highest - CHAIN_SCAN_LIMIT + 1);
  const ids = Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i);

  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address,
      abi: KING_OF_NIGHT_ABI,
      functionName: "getGameStatus" as const,
      args: [BigInt(id)],
    })),
    allowFailure: true,
  });

  const games: ChainGame[] = [];
  results.forEach((result, i) => {
    if (result.status !== "success") return;
    const [active, pot, timeRemaining, king, starter, minWager] = result.result as readonly [
      boolean,
      bigint,
      bigint,
      string,
      string,
      bigint,
    ];
    if (!active) return;
    games.push({
      gameId: ids[i],
      starter,
      king,
      potWei: pot,
      minWagerWei: minWager,
      endTime: now + Number(timeRemaining),
    });
  });
  return games;
}
