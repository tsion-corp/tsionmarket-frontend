import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { startGameCalls } from "./v5-calls";
import { KING_OF_NIGHT_V5_ABI } from "./king-of-night-v5-abi";

const VAULT = "0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0";

function startCall(calls: ReturnType<typeof startGameCalls>) {
  // The approve comes first; the start is the one that names the game.
  return decodeFunctionData({ abi: KING_OF_NIGHT_V5_ABI, data: calls[1].data });
}

// The v5.1 upgrade added `bool isPrivate` overloads. Before it, a private game
// was a note in the starter's own browser and nobody else could know; the
// contract now records the choice and the service serves it on every row.
describe("startGameCalls", () => {
  it("asks the contract for a private game when that is what was chosen", () => {
    const decoded = startCall(startGameCalls(VAULT, 380000n, true));
    expect(decoded.functionName).toBe("startGame");
    expect(decoded.args?.[2]).toBe(true);
  });

  it("asks for a public one otherwise", () => {
    expect(startCall(startGameCalls(VAULT, 380000n, false)).args?.[2]).toBe(false);
  });

  // A caller that says nothing gets a public game, which is what every game
  // was before the flag existed.
  it("defaults to public", () => {
    expect(startCall(startGameCalls(VAULT, 380000n)).args?.[2]).toBe(false);
  });

  it("still carries the asset and the stake", () => {
    const decoded = startCall(startGameCalls(VAULT, 380000n, true));
    expect(decoded.args?.[1]).toBe(380000n);
  });

  it("refuses a zero stake, as it always has", () => {
    expect(() => startGameCalls(VAULT, 0n, true)).toThrow();
  });
});
