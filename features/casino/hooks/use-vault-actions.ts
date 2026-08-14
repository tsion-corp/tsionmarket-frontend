"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { decodeEventLog, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { getWalletAddress } from "@/lib/user";
import { awaitReceipt, publicClientForChain } from "@/lib/trade/receipt";
import { useEvmSend } from "@/hooks/use-evm-send";

// The Last Standing vault contract lives on Base only.
const VAULT_CHAIN_ID = base.id;

// v4 is a factory: anyone opens a game with startGame(), and everyone else
// joins that game by id. The pot splits 50/40/10 between the last player, the
// treasury and whoever opened it.
const VAULT_ABI = [
  {
    type: "function",
    name: "minStartStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "startGame",
    stateMutability: "payable",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "wager",
    stateMutability: "payable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "nextGameId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getGameStatus",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "active", type: "bool" },
      { name: "pot", type: "uint256" },
      { name: "timeRemaining", type: "uint256" },
      { name: "king", type: "address" },
      { name: "starter", type: "address" },
      { name: "minWager", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "games",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "starter", type: "address" },
      { name: "endTime", type: "uint64" },
      { name: "settled", type: "bool" },
      { name: "king", type: "address" },
      { name: "minWager", type: "uint256" },
      { name: "pot", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "previewSplit",
    stateMutability: "view",
    inputs: [{ name: "pot", type: "uint256" }],
    outputs: [
      { name: "toWinner", type: "uint256" },
      { name: "toTreasury", type: "uint256" },
      { name: "toStarter", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "pendingWithdrawals",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "GameStarted",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "starter", type: "address", indexed: true },
      { name: "minWager", type: "uint256", indexed: false },
      { name: "endTime", type: "uint64", indexed: false },
    ],
  },
] as const;

function contractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
  if (!address) throw new Error("Vault isn't configured yet");
  return address as `0x${string}`;
}

/** The global floor a new game's stake has to clear. */
export async function readMinStartStake(): Promise<bigint> {
  const client = publicClientForChain(VAULT_CHAIN_ID);
  return client.readContract({
    address: contractAddress(),
    abi: VAULT_ABI,
    functionName: "minStartStake",
  });
}

/**
 * One game straight from the contract.
 *
 * The REST index trails the chain by the keeper's confirmation depth, so a
 * game a user just started is not in `GET /games` yet. Reading the contract is
 * how their own action confirms instantly instead of appearing to fail.
 */
export async function readGameStatus(gameId: number): Promise<{
  active: boolean;
  pot: bigint;
  timeRemaining: bigint;
  king: string;
  starter: string;
  minWager: bigint;
}> {
  const client = publicClientForChain(VAULT_CHAIN_ID);
  const [active, pot, timeRemaining, king, starter, minWager] = await client.readContract({
    address: contractAddress(),
    abi: VAULT_ABI,
    functionName: "getGameStatus",
    args: [BigInt(gameId)],
  });
  return { active, pot, timeRemaining, king, starter, minWager };
}

// The gameId is only knowable from the receipt: startGame() returns it, but a
// return value is not readable from a sent transaction, so it comes off the
// GameStarted log instead.
function gameIdFromReceipt(logs: readonly { data: string; topics: string[] }[]): number | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: VAULT_ABI,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === "GameStarted") {
        return Number((decoded.args as { gameId: bigint }).gameId);
      }
    } catch {
      // Not one of ours; every receipt carries logs from other contracts too.
    }
  }
  return null;
}

// Ids are sequential from 1, so the newest games are the highest ids. Only the
// tail is scanned: older games have settled and the lobby does not list them.
const CHAIN_SCAN_LIMIT = 20;

export interface ChainGame {
  gameId: number;
  starter: string;
  king: string;
  potWei: bigint;
  minWagerWei: bigint;
  endTime: number;
}

/**
 * One game's stored record, settled or not.
 *
 * getGameStatus() describes a game that is still running; once it settles the
 * pot is paid out and it reports nothing useful. The mapping keeps the record,
 * which is what lets a finished game still have a page: who won, what the pot
 * reached, when it ended.
 */
export async function readGame(gameId: number): Promise<{
  starter: string;
  endTime: number;
  settled: boolean;
  king: string;
  minWagerWei: bigint;
  potWei: bigint;
  exists: boolean;
} | null> {
  const client = publicClientForChain(VAULT_CHAIN_ID);
  try {
    const [starter, endTime, settled, king, minWager, pot] = await client.readContract({
      address: contractAddress(),
      abi: VAULT_ABI,
      functionName: "games",
      args: [BigInt(gameId)],
    });
    // An id that was never used reads back as a zeroed struct.
    const exists = starter !== "0x0000000000000000000000000000000000000000";
    return {
      starter,
      endTime: Number(endTime),
      settled,
      king,
      minWagerWei: minWager,
      potWei: pot,
      exists,
    };
  } catch {
    return null;
  }
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
export async function readActiveGames(): Promise<ChainGame[]> {
  const client = publicClientForChain(VAULT_CHAIN_ID);
  const address = contractAddress();
  const next = await client.readContract({
    address,
    abi: VAULT_ABI,
    functionName: "nextGameId",
  });

  const highest = Number(next) - 1;
  if (highest < 1) return [];
  const lowest = Math.max(1, highest - CHAIN_SCAN_LIMIT + 1);
  const ids = Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i);

  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address,
      abi: VAULT_ABI,
      functionName: "getGameStatus" as const,
      args: [BigInt(id)],
    })),
    allowFailure: true,
  });

  const now = Math.floor(Date.now() / 1000);
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

/**
 * startGame / wager / claim, signed by the user's own embedded wallet. The
 * backend never holds keys or signs on their behalf. Each waits for on-chain
 * confirmation so the caller's refetch reflects the result.
 */
export function useVaultActions() {
  const { user } = usePrivy();
  const evmSend = useEvmSend();
  const [starting, setStarting] = useState(false);
  const [wagering, setWagering] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const owner = useCallback((): `0x${string}` => {
    const address = getWalletAddress(user, "ethereum");
    if (!address) throw new Error("No EVM wallet is connected.");
    return address as `0x${string}`;
  }, [user]);

  /** Opens a game. The stake becomes that game's minimum for everyone else. */
  const startGame = useCallback(
    async (stakeWei: bigint): Promise<{ hash: string; gameId: number | null }> => {
      const address = owner();
      setStarting(true);
      try {
        const client = publicClientForChain(VAULT_CHAIN_ID);
        const hash = await evmSend({
          to: contractAddress(),
          data: encodeFunctionData({ abi: VAULT_ABI, functionName: "startGame" }),
          value: stakeWei,
          chainId: VAULT_CHAIN_ID,
          address,
        });
        const receipt = await awaitReceipt(client, hash, "Your game");
        return { hash, gameId: gameIdFromReceipt(receipt?.logs ?? []) };
      } finally {
        setStarting(false);
      }
    },
    [owner, evmSend]
  );

  /** Joins a game. `value` must clear that game's own minimum, not the floor. */
  const wager = useCallback(
    async (gameId: number, valueWei: bigint): Promise<string> => {
      const address = owner();
      setWagering(true);
      try {
        const client = publicClientForChain(VAULT_CHAIN_ID);
        const hash = await evmSend({
          to: contractAddress(),
          data: encodeFunctionData({
            abi: VAULT_ABI,
            functionName: "wager",
            args: [BigInt(gameId)],
          }),
          value: valueWei,
          chainId: VAULT_CHAIN_ID,
          address,
        });
        await awaitReceipt(client, hash, "Your wager");
        return hash;
      } finally {
        setWagering(false);
      }
    },
    [owner, evmSend]
  );

  // Only needed when a payout could not be pushed at settlement, which the
  // contract credits to pendingWithdrawals instead.
  const claim = useCallback(async (): Promise<string> => {
    const address = owner();
    setClaiming(true);
    try {
      const client = publicClientForChain(VAULT_CHAIN_ID);
      const hash = await evmSend({
        to: contractAddress(),
        data: encodeFunctionData({ abi: VAULT_ABI, functionName: "claim" }),
        chainId: VAULT_CHAIN_ID,
        address,
      });
      await awaitReceipt(client, hash, "Your claim");
      return hash;
    } finally {
      setClaiming(false);
    }
  }, [owner, evmSend]);

  return { startGame, starting, wager, wagering, claim, claiming };
}
