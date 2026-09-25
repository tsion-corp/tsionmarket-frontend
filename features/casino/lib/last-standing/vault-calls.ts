"use client";

// Calldata and reads for the Last Standing vault that more than one flow
// needs: the game screen settles and claims for the signed-in wallet, the
// migration does the same from the old one.
//
// v5, not v4. The app moved to the USDC vault (ADR-2026-09-15) and this file
// did not follow, because the migration is the only caller left and nothing
// here is exercised by the game screen. Three things changed and every one of
// them is silent rather than loud:
//
//   claim()              -> claim(token)
//   pendingWithdrawals(a)-> pendingWithdrawals(owner, token)
//   games() gained `decimals` and `token` at positions 4 and 5, so a v4-shaped
//   decode returns plausible nonsense instead of an error — the ADR measured
//   v5's game 1 decoding as a pot of 7.49e29 wei.
//
// The call builders live in lib/vault/v5-calls and are shared with the game
// screen, so there is one definition of what a settle or a claim is.

import { base } from "viem/chains";
import { publicClientForChain } from "@/lib/trade/receipt";
import { KING_OF_NIGHT_V5_ABI } from "@/lib/vault/king-of-night-v5-abi";
import { GAME_ASSET, claimCall, settleCall } from "@/lib/vault/v5-calls";

export const VAULT_CHAIN_ID = base.id;

/** The asset the migration settles and claims in — USDC on Base. */
export { GAME_ASSET };

export function vaultAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS;
  if (!address) throw new Error("Vault isn't configured yet");
  return address as `0x${string}`;
}

export function isVaultConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS);
}

export function encodeVaultSettle(gameId: number): `0x${string}` {
  return settleCall(vaultAddress(), gameId).data;
}

export function encodeVaultClaim(): `0x${string}` {
  return claimCall(vaultAddress(), GAME_ASSET.address).data;
}

// The id the next game will take; every game so far has a smaller one.
export async function readNextGameId(): Promise<number> {
  const next = await publicClientForChain(VAULT_CHAIN_ID).readContract({
    address: vaultAddress(),
    abi: KING_OF_NIGHT_V5_ABI,
    functionName: "nextGameId",
  });
  return Number(next);
}

// USDC already credited to `owner` by a settlement, waiting for claim(). v5
// keeps a balance per token, so the asset is part of the question.
export async function readVaultPendingWithdrawal(
  owner: string,
  token: string = GAME_ASSET.address
): Promise<bigint> {
  return publicClientForChain(VAULT_CHAIN_ID).readContract({
    address: vaultAddress(),
    abi: KING_OF_NIGHT_V5_ABI,
    functionName: "pendingWithdrawals",
    args: [owner as `0x${string}`, token as `0x${string}`],
  });
}

/** One game's stored record, straight from the contract. */
export interface VaultGameRecord {
  starter: string;
  king: string;
  endTime: number;
  settled: boolean;
  /** The game's own token and its decimals — v5 games are not all one asset. */
  token: string;
  decimals: number;
  minWager: bigint;
  pot: bigint;
  exists: boolean;
}

/**
 * One game's stored record, settled or not.
 *
 * The last resort, not the first: the vault service serves every game and
 * falls through to the contract itself for an id its index has not reached.
 * This read exists for the case where the service cannot be reached at all,
 * so a game someone paid for is never shown as missing.
 */
export async function readGame(gameId: number): Promise<VaultGameRecord | null> {
  try {
    // Ten fields in v5. Destructured positionally, so this must stay in step
    // with the ABI — `decimals` and `token` sit between `king` and `minWager`.
    const [starter, endTime, settled, king, decimals, token, minWager, pot] =
      await publicClientForChain(VAULT_CHAIN_ID).readContract({
        address: vaultAddress(),
        abi: KING_OF_NIGHT_V5_ABI,
        functionName: "games",
        args: [BigInt(gameId)],
      });
    // An id that was never used reads back as a zeroed struct.
    const exists = starter !== "0x0000000000000000000000000000000000000000";
    return {
      starter,
      king,
      endTime: Number(endTime),
      settled,
      token,
      decimals: Number(decimals),
      minWager,
      pot,
      exists,
    };
  } catch {
    // Unreachable RPC or an out-of-range id: the caller treats null as "cannot
    // say", never as "no game", so nothing is reported as recovered on a read
    // that did not happen.
    return null;
  }
}
