"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { decodeEventLog, encodeFunctionData, getAbiItem } from "viem";
import { base } from "viem/chains";
import { getWalletAddress } from "@/lib/user";
import { awaitReceipt, publicClientForChain } from "@/lib/trade/receipt";
import { useEvmSend } from "@/hooks/use-evm-send";
import { KING_OF_NIGHT_ABI } from "@/features/casino/lib/last-standing/king-of-night-abi";
import { winnerPayoutWei, type SplitBps } from "@/features/casino/lib/last-standing/split";

// The Last Standing vault contract lives on Base only.
const VAULT_CHAIN_ID = base.id;

// The compiled artifact, never a transcription: a hand-typed GameStarted with
// four fields hashed to a topic that matched no log and lost every gameId.
const VAULT_ABI = KING_OF_NIGHT_ABI;

function contractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
  if (!address) throw new Error("Vault isn't configured yet");
  return address as `0x${string}`;
}

/**
 * The contract's current split, in basis points. Owner-tunable, so the live
 * estimate a winner sees before settlement reads it rather than assuming.
 */
export async function readSplitBps(): Promise<SplitBps> {
  const client = publicClientForChain(VAULT_CHAIN_ID);
  const address = contractAddress();
  const [winner, starter] = await Promise.all([
    client.readContract({ address, abi: VAULT_ABI, functionName: "winnerBps" }),
    client.readContract({ address, abi: VAULT_ABI, functionName: "starterBps" }),
  ]);
  return { winner: Number(winner), starter: Number(starter) };
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

export interface ChainSettledGame {
  gameId: number;
  winner: string;
  starter: string;
  potWei: bigint;
  /** Everything the winner was paid: their share plus the starter's when they opened it. */
  toWinnerWei: bigint;
  /** When the round was won: the clock ran out then, whenever it was settled. */
  endTime: number;
  /** The settle() transaction, when its log is inside the scanned window. */
  settlementTx: string | null;
  /** Unix seconds the settlement landed, when its log is inside the window. */
  settledAt: number | null;
}

/**
 * Every settled game in the tail, newest first, straight from the contract.
 *
 * The indexed winners feed has never carried a row for this contract, and a
 * settled game's record is a mapping read away, so the Hall of Winners is built
 * from the chain. previewSplit is what settle() paid the winner, so the amount
 * shown is the amount credited rather than the whole pot. Where the settle()
 * log is still inside the scanned block window, the row also gets its
 * transaction and the time it landed, so it can link to the explorer.
 */
export async function readSettledGames(): Promise<ChainSettledGame[]> {
  const client = publicClientForChain(VAULT_CHAIN_ID);
  const address = contractAddress();
  const next = await client.readContract({ address, abi: VAULT_ABI, functionName: "nextGameId" });
  const highest = Number(next) - 1;
  if (highest < 1) return [];
  const lowest = Math.max(1, highest - CHAIN_SCAN_LIMIT + 1);
  const ids = Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i);

  const records = await client.multicall({
    contracts: ids.map((id) => ({
      address,
      abi: VAULT_ABI,
      functionName: "games" as const,
      args: [BigInt(id)],
    })),
    allowFailure: true,
  });

  const settled: {
    gameId: number;
    starter: string;
    king: string;
    potWei: bigint;
    endTime: number;
  }[] = [];
  records.forEach((result, i) => {
    if (result.status !== "success") return;
    const [starter, endTime, isSettled, king, , pot] = result.result as readonly [
      string,
      bigint,
      boolean,
      string,
      bigint,
      bigint,
    ];
    if (!isSettled) return;
    settled.push({ gameId: ids[i], starter, king, potWei: pot, endTime: Number(endTime) });
  });
  if (settled.length === 0) return [];

  // What each pot paid its winner. One more multicall, not one call per game.
  const splits = await client.multicall({
    contracts: settled.map((g) => ({
      address,
      abi: VAULT_ABI,
      functionName: "previewSplit" as const,
      args: [g.potWei],
    })),
    allowFailure: true,
  });

  const settlements = await readSettlementLogs(client, address);

  return settled
    .map((g, i) => {
      const split = splits[i];
      // What the winner was paid: their share, plus the starter's when the
      // same wallet opened the game, which is what settle() actually sends.
      const toWinnerWei =
        split.status === "success"
          ? (() => {
              const [toWinner, , toStarter] = split.result as readonly [bigint, bigint, bigint];
              return winnerPayoutWei(toWinner, toStarter, g.king, g.starter);
            })()
          : 0n;
      const log = settlements.get(g.gameId);
      return {
        gameId: g.gameId,
        winner: g.king,
        starter: g.starter,
        potWei: g.potWei,
        toWinnerWei,
        endTime: g.endTime,
        settlementTx: log?.transactionHash ?? null,
        settledAt: log?.timestamp ?? null,
      };
    })
    .sort((a, b) => b.gameId - a.gameId);
}

// The public RPC caps eth_getLogs at 10,000 blocks per call, and Base makes a
// block every two seconds, so this is roughly the last five and a half hours.
// Enough for a live feed; the indexer is meant to hold history.
const LOG_WINDOW = 9_999n;

type VaultClient = ReturnType<typeof publicClientForChain>;

async function logWindow(client: VaultClient): Promise<{ fromBlock: bigint; toBlock: bigint }> {
  const head = await client.getBlockNumber();
  return { fromBlock: head > LOG_WINDOW ? head - LOG_WINDOW : 0n, toBlock: head };
}

// A log carries a block number and no time. One block read per distinct block
// gives a feed real timestamps rather than "just now" on every poll.
async function blockTimestamps(
  client: VaultClient,
  logs: readonly { blockNumber: bigint }[]
): Promise<Map<bigint, number>> {
  const numbers = [...new Set(logs.map((log) => log.blockNumber))];
  const blocks = await Promise.all(numbers.map((blockNumber) => client.getBlock({ blockNumber })));
  return new Map(blocks.map((b) => [b.number, Number(b.timestamp)]));
}

async function readSettlementLogs(
  client: VaultClient,
  address: `0x${string}`
): Promise<Map<number, { transactionHash: string; timestamp: number }>> {
  const logs = await client.getLogs({
    address,
    event: getAbiItem({ abi: VAULT_ABI, name: "GameSettled" }),
    ...(await logWindow(client)),
  });
  const timestampOf = await blockTimestamps(client, logs);
  return new Map(
    logs.map((log) => [
      Number(log.args.gameId),
      { transactionHash: log.transactionHash, timestamp: timestampOf.get(log.blockNumber) ?? 0 },
    ])
  );
}

export type ChainActivityAction = "started" | "joined" | "won";

export interface ChainActivity {
  gameId: number;
  action: ChainActivityAction;
  address: string;
  /** What moved: the opening stake, the wager, or what the winner was paid. */
  amountWei: bigint;
  transactionHash: string;
  /** Unix seconds, from the block the action landed in. */
  timestamp: number;
}

/**
 * Recent player actions, newest first, from the contract's own logs.
 *
 * The contract emits one event per player action: GameStarted for an opening,
 * WagerPlaced for a join, GameSettled for a win. Read together they are the
 * activity feed the indexer is meant to serve, over the window the RPC allows.
 * Three log queries share one block-timestamp lookup.
 */
export async function readRecentActivity(): Promise<ChainActivity[]> {
  const client = publicClientForChain(VAULT_CHAIN_ID);
  const address = contractAddress();
  const window = await logWindow(client);
  const [starts, wagers, settlements] = await Promise.all([
    client.getLogs({
      address,
      event: getAbiItem({ abi: VAULT_ABI, name: "GameStarted" }),
      ...window,
    }),
    client.getLogs({
      address,
      event: getAbiItem({ abi: VAULT_ABI, name: "WagerPlaced" }),
      ...window,
    }),
    client.getLogs({
      address,
      event: getAbiItem({ abi: VAULT_ABI, name: "GameSettled" }),
      ...window,
    }),
  ]);
  const timestampOf = await blockTimestamps(client, [...starts, ...wagers, ...settlements]);
  const at = (log: { blockNumber: bigint }) => timestampOf.get(log.blockNumber) ?? 0;

  const rows: ChainActivity[] = [
    ...starts.map((log) => ({
      gameId: Number(log.args.gameId),
      action: "started" as const,
      address: String(log.args.starter),
      amountWei: log.args.pot ?? 0n,
      transactionHash: log.transactionHash,
      timestamp: at(log),
    })),
    ...wagers.map((log) => ({
      gameId: Number(log.args.gameId),
      action: "joined" as const,
      address: String(log.args.player),
      amountWei: log.args.amount ?? 0n,
      transactionHash: log.transactionHash,
      timestamp: at(log),
    })),
    ...settlements.map((log) => ({
      gameId: Number(log.args.gameId),
      action: "won" as const,
      address: String(log.args.winner),
      amountWei: winnerPayoutWei(
        log.args.toWinner ?? 0n,
        log.args.toStarter ?? 0n,
        String(log.args.winner),
        String(log.args.starter)
      ),
      transactionHash: log.transactionHash,
      timestamp: at(log),
    })),
  ];
  return rows.sort((a, b) => b.timestamp - a.timestamp || b.gameId - a.gameId);
}

/**
 * startGame / wager / settle / claim, signed by the user's own embedded wallet. The
 * backend never holds keys or signs on their behalf. Each waits for on-chain
 * confirmation so the caller's refetch reflects the result.
 */
export function useVaultActions() {
  const { user } = usePrivy();
  const evmSend = useEvmSend();
  const [starting, setStarting] = useState(false);
  const [wagering, setWagering] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [settling, setSettling] = useState(false);

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

  // Collects a payout that settle() could not push. Settlement pays the winner
  // and the starter directly; only a transfer that fails (a contract recipient
  // that rejects ETH) is credited to pendingWithdrawals, and this sweeps it.
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

  /**
   * Closes a game whose clock has run out and pays the split.
   *
   * The contract does not settle itself. Until someone calls this, a finished
   * game stays "unsettled" forever: the winner is never paid and the winners
   * feed never has a row for it. Every one of the first six games on Base sat
   * in exactly that state for a day. The backend keeper is meant to do this
   * within seconds of expiry; anyone may, and the winner does here the moment
   * they win, so a payout never depends on the keeper being up.
   */
  const settle = useCallback(
    async (gameId: number): Promise<string> => {
      const address = owner();
      setSettling(true);
      try {
        const client = publicClientForChain(VAULT_CHAIN_ID);
        const hash = await evmSend({
          to: contractAddress(),
          data: encodeFunctionData({
            abi: VAULT_ABI,
            functionName: "settle",
            args: [BigInt(gameId)],
          }),
          chainId: VAULT_CHAIN_ID,
          address,
        });
        await awaitReceipt(client, hash, "Settling the round");
        return hash;
      } finally {
        setSettling(false);
      }
    },
    [owner, evmSend]
  );

  return { startGame, starting, wager, wagering, claim, claiming, settle, settling };
}
