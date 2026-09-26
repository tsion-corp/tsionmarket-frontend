import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { KING_OF_NIGHT_V5_ABI } from "@/lib/vault/king-of-night-v5-abi";

/**
 * The calls that play a Last Man game on the v5 vault, in USDC.
 *
 * Pure: it builds calldata and nothing else, so what a player signs can be
 * decoded and asserted in a test rather than inspected in a wallet. The hook
 * that sends them lives in features/casino.
 *
 * v5 pulls an ERC-20 stake with transferFrom, so every stake needs an allowance
 * first. The migration guide ranks EIP-3009, then EIP-2612, then approve-then-
 * call, but those rankings are about saving a wallet prompt and we show none:
 * signing here is headless through the Privy embedded account, and it must stay
 * that way.
 *
 * The reason to batch is the 60-second timer. Two sequential operations leave a
 * window where the game can settle between them, and the second call reverts on
 * an allowance that is already standing. Our sponsored batch sends both as ONE
 * atomic user operation (hooks/use-evm-send, useEvmSendBatch), so a reverting
 * startGame takes the approval down with it.
 *
 * See ADR-2026-09-15-last-man-v5-usdc.
 */

/** The asset every game this app starts is played in: USDC on Base. */
export const GAME_ASSET = {
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Hex,
  symbol: "USDC",
  decimals: 6,
} as const;

export interface VaultCall {
  to: Hex;
  data: Hex;
  /**
   * Always absent for a token game. Sending native value alongside one reverts
   * with NativeValueNotAccepted, which is the right behaviour but is still a
   * revert the player paid gas for.
   */
  value?: bigint;
}

function approve(vault: string, amount: bigint): VaultCall {
  return {
    to: GAME_ASSET.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      // The exact amount, never unbounded: the batch already spares the player
      // a second transaction, so approving more buys nothing and leaves the
      // vault able to pull again later.
      args: [vault as Hex, amount],
    }),
  };
}

function positive(amount: bigint, what: string): bigint {
  if (amount <= 0n) throw new Error(`Enter a ${what} above zero.`);
  return amount;
}

/**
 * Opens a game at `stake` base units of the game asset.
 *
 * The stake becomes that game's own minimum for everyone who joins, so it is
 * the number the sheet must show before signing, not a floor.
 */
export function startGameCalls(vault: string, stake: bigint, isPrivate = false): VaultCall[] {
  positive(stake, "stake");
  return [
    approve(vault, stake),
    {
      to: vault as Hex,
      data: encodeFunctionData({
        abi: KING_OF_NIGHT_V5_ABI,
        functionName: "startGame",
        // The three-argument overload, added by the v5.1 privacy upgrade. The
        // contract records the choice and emits GamePrivacySet, which is what
        // puts isPrivate on every row the service serves. Before this, private
        // was a note in the starter's own browser that nobody else could read.
        args: [GAME_ASSET.address, stake, isPrivate],
      }),
    },
  ];
}

/** Joins `gameId` with `amount` base units, which must clear its own minWager. */
export function wagerCalls(vault: string, gameId: number, amount: bigint): VaultCall[] {
  positive(amount, "amount");
  return [
    approve(vault, amount),
    {
      to: vault as Hex,
      data: encodeFunctionData({
        abi: KING_OF_NIGHT_V5_ABI,
        functionName: "wager",
        args: [BigInt(gameId), amount],
      }),
    },
  ];
}

/**
 * Collects a payout settlement could not push, in one asset.
 *
 * v4's `claim()` took no argument and does not exist on v5 — the selector is
 * absent from the deployed bytecode, so the old call reverts. A wallet can be
 * owed in more than one asset, which is why this takes one rather than
 * assuming the game asset; it defaults to it because that is every game we
 * start.
 */
export function claimCall(vault: string, token: string = GAME_ASSET.address): VaultCall {
  return {
    to: vault as Hex,
    data: encodeFunctionData({
      abi: KING_OF_NIGHT_V5_ABI,
      functionName: "claim",
      args: [token as Hex],
    }),
  };
}

/**
 * Closes an expired game and pays the split.
 *
 * Permissionless and idempotent, and normally the keeper's job within seconds
 * of expiry. The winner's client sends it only after a grace period, so a
 * payout never depends on the keeper being up.
 */
export function settleCall(vault: string, gameId: number): VaultCall {
  return {
    to: vault as Hex,
    data: encodeFunctionData({
      abi: KING_OF_NIGHT_V5_ABI,
      functionName: "settle",
      args: [BigInt(gameId)],
    }),
  };
}
