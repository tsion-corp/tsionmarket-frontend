"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { decodeEventLog, encodeFunctionData } from "viem";
import { getWalletAddress } from "@/lib/user";
import { awaitReceipt, publicClientForChain } from "@/lib/trade/receipt";
import { useEvmSend } from "@/hooks/use-evm-send";
import { KING_OF_NIGHT_ABI } from "@/lib/vault/king-of-night-abi";
import { VAULT_CHAIN_ID, vaultContractAddress } from "@/lib/vault/contract";
import { vaultLog } from "@/features/casino/lib/last-standing/log";

// The compiled artifact, never a transcription: a hand-typed GameStarted with
// four fields hashed to a topic that matched no log and lost every gameId.
const VAULT_ABI = KING_OF_NIGHT_ABI;

const contractAddress = vaultContractAddress;

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

/**
 * One game's stored record, settled or not, straight from the contract.
 *
 * The last resort, not the first: the vault service serves every game and
 * falls through to the contract itself for an id its index has not reached.
 * This read exists for the case where the service cannot be reached at all,
 * so a game someone paid for is never shown as missing.
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
    vaultLog(`RPC games(${gameId})`, { exists, settled, king });
    return {
      starter,
      endTime: Number(endTime),
      settled,
      king,
      minWagerWei: minWager,
      potWei: pot,
      exists,
    };
  } catch (error) {
    vaultLog(`RPC games(${gameId}) failed`, { error: String(error) });
    return null;
  }
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
        const gameId = gameIdFromReceipt(receipt?.logs ?? []);
        vaultLog("tx startGame confirmed", { hash, gameId });
        return { hash, gameId };
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
        vaultLog("tx wager confirmed", { gameId, hash });
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
      vaultLog("tx claim confirmed", { hash });
      return hash;
    } finally {
      setClaiming(false);
    }
  }, [owner, evmSend]);

  /**
   * Closes a game whose clock has run out and pays the split.
   *
   * The contract does not settle itself. The backend keeper does, within
   * seconds of expiry (measured at five on 2026-09-10), and anyone may. The
   * winner's client only sends this when the keeper has not, after a grace,
   * so a payout never depends on the keeper being up and a round normally
   * costs one settlement transaction rather than two.
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
        vaultLog("tx settle confirmed", { gameId, hash });
        return hash;
      } finally {
        setSettling(false);
      }
    },
    [owner, evmSend]
  );

  return { startGame, starting, wager, wagering, claim, claiming, settle, settling };
}
