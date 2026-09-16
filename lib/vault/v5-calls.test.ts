import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import { KING_OF_NIGHT_V5_ABI } from "@/lib/vault/king-of-night-v5-abi";
import {
  GAME_ASSET,
  claimCall,
  settleCall,
  startGameCalls,
  wagerCalls,
} from "@/lib/vault/v5-calls";

const VAULT = "0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0";

function asVault(data: `0x${string}`) {
  return decodeFunctionData({ abi: KING_OF_NIGHT_V5_ABI, data });
}
function asToken(data: `0x${string}`) {
  return decodeFunctionData({ abi: erc20Abi, data });
}

describe("starting a game", () => {
  // v5 pulls the stake with transferFrom, so the allowance has to exist first.
  // Sent as one sponsored batch these are atomic: a reverting startGame takes
  // the approval down with it rather than leaving a standing allowance. Nothing
  // here prompts the player; signing is headless and stays that way.
  it("approves exactly the stake, then starts the game in that asset", () => {
    const calls = startGameCalls(VAULT, 100_000n);

    expect(calls).toHaveLength(2);
    expect(calls[0].to).toBe(GAME_ASSET.address);
    expect(asToken(calls[0].data)).toMatchObject({
      functionName: "approve",
      args: [VAULT, 100_000n],
    });
    expect(calls[1].to).toBe(VAULT);
    expect(asVault(calls[1].data)).toMatchObject({
      functionName: "startGame",
      args: [GAME_ASSET.address, 100_000n],
    });
  });

  // Never an unbounded allowance. The batch already spares the player a second
  // transaction, so the usual reason to approve more than needed buys nothing
  // and leaves the vault able to pull again later.
  it("never approves more than the stake", () => {
    const [approval] = startGameCalls(VAULT, 250_000n);
    expect(asToken(approval.data).args?.[1]).toBe(250_000n);
  });

  // Sending native value to a token game reverts with NativeValueNotAccepted,
  // and the player pays gas for the revert.
  it("sends no native value with a token game", () => {
    for (const call of startGameCalls(VAULT, 100_000n)) {
      expect(call.value ?? 0n).toBe(0n);
    }
  });

  it("refuses to build a batch for nothing", () => {
    expect(() => startGameCalls(VAULT, 0n)).toThrow(/stake/i);
    expect(() => startGameCalls(VAULT, -1n)).toThrow(/stake/i);
  });
});

describe("joining a game", () => {
  it("approves the amount, then wagers it on that game", () => {
    const calls = wagerCalls(VAULT, 12, 500_000n);

    expect(asToken(calls[0].data)).toMatchObject({
      functionName: "approve",
      args: [VAULT, 500_000n],
    });
    expect(asVault(calls[1].data)).toMatchObject({
      functionName: "wager",
      args: [12n, 500_000n],
    });
  });

  it("refuses a wager of nothing", () => {
    expect(() => wagerCalls(VAULT, 12, 0n)).toThrow(/amount/i);
  });
});

describe("collecting and closing", () => {
  // claim() took no argument in v4 and does not exist in v5: the selector is
  // absent from the deployed bytecode, so a v4-shaped claim reverts.
  it("claims the asset the game was played in", () => {
    const call = claimCall(VAULT);

    expect(call.to).toBe(VAULT);
    expect(asVault(call.data)).toMatchObject({
      functionName: "claim",
      args: [GAME_ASSET.address],
    });
  });

  it("claims whatever asset it is handed, so an ETH payout still collects", () => {
    const native = "0x0000000000000000000000000000000000000000";
    expect(asVault(claimCall(VAULT, native).data).args).toEqual([native]);
  });

  it("settles one game by id", () => {
    expect(asVault(settleCall(VAULT, 433).data)).toMatchObject({
      functionName: "settle",
      args: [433n],
    });
  });
});
