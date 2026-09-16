import "server-only";
import {
  decodeAbiParameters,
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type Hex,
} from "viem";
import { readEvm } from "@/lib/server/evm-read";
import { KING_OF_NIGHT_V5_ABI } from "@/lib/vault/king-of-night-v5-abi";

/**
 * The Last Man lobby, read from the chain, for when the vault service's index
 * cannot answer.
 *
 * The service is the source of truth and is always asked first. This exists
 * because on 2026-09-15 its index returned no rows at all, and a lobby that
 * shows nothing because an index is behind is a broken game. See
 * ADR-2026-09-15-last-man-v5-usdc, decision 7.
 *
 * The cost is held down three ways, because a naive version of this is a read
 * per game per poll per viewer:
 *
 *   1. It runs here, not in the browser, so every viewer shares one read.
 *   2. It is two round trips regardless of how many games exist: one for the
 *      id range, one Multicall3 aggregate3 for every game in the window.
 *   3. The window is bounded. Reading every id from 1 is the cost the backend's
 *      own settlement notes describe as growing with every game ever played
 *      and never coming back down.
 *
 * Callers add the caching; this function does the reading.
 */

const BASE_CHAIN_ID = 8453;
const BASE_NETWORK = "base-mainnet";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
const NATIVE = "0x0000000000000000000000000000000000000000";

/** How many of the most recent game ids a chain-read lobby looks at. */
export const LOBBY_WINDOW = 40;

const multicall3Abi = parseAbi([
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) returns (Result[] returnData)",
]);

// getGameStatus's own tuple, from the generated v5 ABI rather than retyped.
const GAME_STATUS_OUTPUT = [
  { type: "bool" },
  { type: "address" },
  { type: "uint8" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
] as const;

/** One amount, in the shape the vault API describes money in. */
export interface ChainTokenAmount {
  amount: string;
  raw: string;
  token: string;
  tokenSymbol: string;
  decimals: number;
  usdValue: number;
  formattedUsd: string;
}

/** One lobby row, shaped like the service's own so the UI renders one type. */
export interface ChainGame {
  gameId: number;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  starter: string;
  king: string;
  pot: ChainTokenAmount;
  minWager: ChainTokenAmount;
  timeRemaining: number;
  settled: boolean;
  active: boolean;
}

// Only the two assets the vault is configured for. An asset we cannot name is
// shown by its address rather than guessed at, which is honest and rare.
function symbolFor(token: string): string {
  if (token.toLowerCase() === NATIVE) return "ETH";
  if (token.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913") return "USDC";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

/** A decimal string at the asset's own scale, with no invented precision. */
function format(raw: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = raw / unit;
  const fraction = (raw % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

// usdValue is native-only in the service's own contract and it has no price
// oracle here, so a chain-read row reports no dollar figure rather than a
// wrong one. The UI already renders "—" for that.
function amountOf(raw: bigint, token: string, decimals: number): ChainTokenAmount {
  return {
    amount: format(raw, decimals),
    raw: raw.toString(),
    token,
    tokenSymbol: symbolFor(token),
    decimals,
    usdValue: 0,
    formattedUsd: "—",
  };
}

function statusCall(vault: string, gameId: number) {
  return {
    target: vault as Hex,
    allowFailure: true,
    callData: encodeFunctionData({
      abi: KING_OF_NIGHT_V5_ABI,
      functionName: "getGameStatus",
      args: [BigInt(gameId)],
    }),
  };
}

function decodeUint(result: unknown): bigint | null {
  if (typeof result !== "string" || !result.startsWith("0x") || result.length < 4) return null;
  try {
    return decodeAbiParameters([{ type: "uint256" }], result as Hex)[0];
  } catch {
    return null;
  }
}

/**
 * Every live game on `vault`, newest last, from the chain.
 *
 * An id the chain could not answer for is left out rather than rendered as a
 * game with zeroes in it, and so is a game whose clock has run out: this is a
 * lobby, and a finished game belongs to history, which the service serves.
 */
export async function readLobbyFromChain(vault: string): Promise<ChainGame[]> {
  const nextGameId = decodeUint(
    (
      await readEvm(BASE_NETWORK, BASE_CHAIN_ID, [
        {
          id: 1,
          method: "eth_call",
          params: [
            {
              to: vault,
              data: encodeFunctionData({
                abi: KING_OF_NIGHT_V5_ABI,
                functionName: "nextGameId",
              }),
            },
            "latest",
          ],
        },
      ])
    )[0]?.result
  );
  if (nextGameId === null) throw new Error("Vault chain read: nextGameId was not answered");

  const newest = Number(nextGameId) - 1;
  if (newest < 1) return [];
  const oldest = Math.max(1, newest - LOBBY_WINDOW + 1);
  const ids = Array.from({ length: newest - oldest + 1 }, (_, i) => oldest + i);

  const data = encodeFunctionData({
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [ids.map((id) => statusCall(vault, id))],
  });
  const batched = await readEvm(BASE_NETWORK, BASE_CHAIN_ID, [
    { id: 1, method: "eth_call", params: [{ to: MULTICALL3, data }, "latest"] },
  ]);
  const raw = batched[0]?.result;
  if (typeof raw !== "string") throw new Error("Vault chain read: the batch was not answered");

  const results = decodeFunctionResult({
    abi: multicall3Abi,
    functionName: "aggregate3",
    data: raw as Hex,
  }) as { success: boolean; returnData: Hex }[];

  const games: ChainGame[] = [];
  results.forEach((result, index) => {
    if (!result.success || !result.returnData || result.returnData === "0x") return;
    let decoded: readonly unknown[];
    try {
      decoded = decodeAbiParameters(GAME_STATUS_OUTPUT, result.returnData);
    } catch {
      return;
    }
    const [active, token, decimals, pot, timeRemaining, king, starter, minWager] = decoded as [
      boolean,
      string,
      number,
      bigint,
      bigint,
      string,
      string,
      bigint,
    ];
    if (!active) return;
    games.push({
      gameId: ids[index],
      token,
      tokenSymbol: symbolFor(token),
      tokenDecimals: Number(decimals),
      starter,
      king,
      pot: amountOf(pot, token, Number(decimals)),
      minWager: amountOf(minWager, token, Number(decimals)),
      timeRemaining: Number(timeRemaining),
      settled: false,
      active: true,
    });
  });
  return games;
}
