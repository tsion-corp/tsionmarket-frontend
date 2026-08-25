import { describe, expect, it } from "vitest";
import { apiError } from "@/lib/api/envelope";
import { friendlyError, isAlreadySettledError, supportDetail } from "@/lib/errors";

describe("friendlyError", () => {
  it("preserves the actionable confirmed-balance message", () => {
    const message = "Your Solana balance changed. Review the updated Max amount and try again.";
    expect(friendlyError(new Error(message), "Order rejected")).toBe(message);
  });

  it("maps wallet rejections", () => {
    expect(friendlyError(new Error("User rejected the request"))).toMatch(/cancelled/i);
    expect(friendlyError("MetaMask Tx Signature: User denied transaction")).toMatch(/cancelled/i);
  });

  it("maps an ERC-20 balance revert (the real DAI error)", () => {
    expect(
      friendlyError(new Error("Execution reverted with reason: Dai/insufficient-balance."))
    ).toMatch(/enough of this asset/i);
    expect(friendlyError("transfer amount exceeds balance")).toMatch(/enough of this asset/i);
  });

  it("maps native-fee shortfalls to the network-fee message", () => {
    expect(friendlyError(new Error("insufficient funds for gas * price + value"))).toMatch(
      /network's coin/i
    );
    expect(friendlyError("cannot estimate gas")).toMatch(/network's coin/i);
  });

  it("maps rate limits", () => {
    expect(friendlyError("Request failed with status 429: Too Many Requests")).toMatch(/busy/i);
  });

  it("maps connectivity errors", () => {
    expect(friendlyError(new Error("Failed to fetch"))).toMatch(/connection/i);
    expect(friendlyError("The operation timed out")).toMatch(/connection/i);
  });

  it("maps unsupported / no-route / quote errors", () => {
    expect(friendlyError("Origin asset 0x0000 is not supported on chain 137")).toMatch(
      /couldn't complete this/i
    );
    expect(friendlyError("No deposit quote available")).toMatch(/couldn't complete this/i);
    expect(friendlyError("Unsupported network")).toMatch(/couldn't complete this/i);
  });

  it("explains chess cashier balance failures precisely", () => {
    expect(friendlyError(apiError("CONFLICT", "insufficient available balance", 409))).toMatch(
      /chess balance/i
    );
    expect(
      friendlyError(apiError("PLAYER_BALANCE_INSUFFICIENT", "player balance insufficient", 409))
    ).toMatch(/deposit more usdc|smaller stake/i);
  });

  it("does not blame the player when the Stockfish reserve is too low", () => {
    expect(
      friendlyError(apiError("HOUSE_RESERVE_INSUFFICIENT", "house reserve insufficient", 503))
    ).toBe(
      "Stockfish staking is temporarily unavailable because the reward reserve is low. You can still play a free game."
    );
  });

  it("keeps safe gateway messages instead of flattening them to the fallback", () => {
    expect(
      friendlyError(apiError("BAD_REQUEST", "withdrawal amount must be greater than zero", 400))
    ).toBe("withdrawal amount must be greater than zero");
    expect(friendlyError(apiError("INTERNAL", "Internal server error", 500))).toBe(
      "Internal server error"
    );
  });

  it("uses the caller's fallback for unknown errors", () => {
    expect(friendlyError(new Error("weird internal thing"), "Couldn't buy right now.")).toBe(
      "Couldn't buy right now."
    );
  });

  it("uses the fallback for empty/nullish errors", () => {
    expect(friendlyError(null, "Try again.")).toBe("Try again.");
    expect(friendlyError(undefined, "Try again.")).toBe("Try again.");
    expect(friendlyError({}, "Try again.")).toBe("Try again.");
  });

  it("has a sensible default fallback", () => {
    expect(friendlyError(new Error("nope"))).toBe("Something went wrong. Please try again.");
  });
});

describe("contract reverts never reach the user as hex", () => {
  // Real shapes: viem/ethers wrap the selector differently, so each provider's
  // phrasing is exercised rather than one canonical string.
  it("translates ERC20InsufficientBalance from viem's wrapper", () => {
    const raw =
      'The contract function "transfer" reverted with the following signature:\n' +
      "0xe450d38c000000000000000000000000ab5801a7d398351b8be11c439e05c5b3259aec9b";
    expect(friendlyError(new Error(raw))).toBe(
      "You don't have enough of this asset for that. Try a smaller amount."
    );
  });

  it("translates ERC20InsufficientAllowance", () => {
    expect(friendlyError(new Error("execution reverted, data: 0xfb8f41b2"))).toBe(
      "This transfer hasn't been approved yet. Approve it and try again."
    );
  });

  it("translates an expired permit signature", () => {
    expect(friendlyError(new Error("reverted: 0x62791302"))).toBe(
      "The approval you signed has expired. Please try again."
    );
  });

  it("says something plain for a revert whose selector we do not know", () => {
    // The point of the catch-all: an unmapped selector must still not print.
    const message = friendlyError(new Error("execution reverted, data: 0xdeadbeef"));
    expect(message).toBe(
      "The network rejected this transaction. Nothing was charged, so please try again."
    );
    expect(message).not.toContain("0x");
  });

  it("never leaks calldata for a bare panic code", () => {
    const panic = "0x4e487b710000000000000000000000000000000000000000000000000000000000000011";
    expect(friendlyError(new Error(panic))).not.toContain("0x");
  });

  it("still prefers a cancellation over the revert catch-all", () => {
    // A wallet that reports both must read as "you cancelled", not "rejected
    // by the network" — one is the user's doing, the other looks like a fault.
    expect(friendlyError(new Error("User rejected the request. execution reverted"))).toBe(
      "You cancelled the request, so nothing was sent."
    );
  });

  it("does not treat a plain server sentence as a revert", () => {
    const e = Object.assign(new Error("That tier is already owned."), { status: 409 });
    expect(friendlyError(e)).toBe("That tier is already owned.");
  });

  it("names the vault's own reverts in plain words", () => {
    // Selectors from the compiled King of Night ABI. Before these existed a
    // wager under the game's minimum showed the player raw calldata.
    const wrap = (selector: string) =>
      new Error(`execution reverted (data: ${selector}${"0".repeat(64)}${"0".repeat(64)})`);
    expect(friendlyError(wrap("0x10169bd5"))).toMatch(/game's minimum/i);
    expect(friendlyError(wrap("0x78e030db"))).toMatch(/minimum to open/i);
    expect(friendlyError(wrap("0x3496ed15"))).toMatch(/round is over/i);
    expect(friendlyError(wrap("0x8fec535e"))).toMatch(/already been settled/i);
    expect(friendlyError(wrap("0xb52cb3ad"))).toMatch(/clock hasn't run out/i);
    expect(friendlyError(wrap("0x379a7ed9"))).toMatch(/paused/i);
    expect(friendlyError(wrap("0xd13b2677"))).toMatch(/doesn't exist/i);
    expect(friendlyError(wrap("0x64ab3466"))).toMatch(/nothing left to claim/i);
  });

  it("recognises AlreadySettled so the client can treat the keeper's win as its own", () => {
    expect(
      isAlreadySettledError(
        new Error(
          "reverted: 0x8fec535e0000000000000000000000000000000000000000000000000000000000000006"
        )
      )
    ).toBe(true);
    expect(isAlreadySettledError(new Error("reverted: 0xb52cb3ad"))).toBe(false);
    expect(isAlreadySettledError(null)).toBe(false);
  });

  it("maps Solana simulation failures instead of dumping RPC logs (the reported sell bug)", () => {
    const dump =
      "Solana RPC rejected transaction: Transaction simulation failed: Error processing Instruction 2: custom program error: 0x1 [39 log messages]";
    expect(friendlyError(new Error(dump), "Sale failed")).toMatch(/enough of this asset/i);
    expect(friendlyError(new Error("custom program error: 0x1771"), "Sale failed")).toMatch(
      /couldn't complete this right now/i
    );
    expect(
      friendlyError(new Error("Transaction simulation failed: InstructionError"), "Sale failed")
    ).toMatch(/network rejected/i);
    expect(friendlyError(new Error("Blockhash not found"), "Sale failed")).toMatch(/expired/i);
    expect(
      friendlyError(new Error("Transfer: insufficient lamports 5000, need 12000"), "Sale failed")
    ).toMatch(/network's coin/i);
  });
});

describe("supportDetail", () => {
  it("collapses whitespace and caps the length for fine print", () => {
    const wall = `Solana RPC rejected transaction:\n${"log ".repeat(200)}`;
    const detail = supportDetail(new Error(wall));
    expect(detail.length).toBeLessThanOrEqual(160);
    expect(detail.endsWith("\u2026")).toBe(true);
    expect(detail).not.toMatch(/\n/);
    expect(supportDetail(new Error("short reason"))).toBe("short reason");
  });
});
