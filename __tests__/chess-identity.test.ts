import { describe, it, expect } from "vitest";
import type { User } from "@privy-io/node";
import {
  chessReadNeedsSession,
  walletOfUser,
  withChessIdentity,
} from "@/lib/casino/chess-identity";

function userWithWallet(address: string): User {
  return {
    id: "user_1",
    created_at: 0,
    is_guest: false,
    linked_accounts: [
      { type: "email", address: "player@example.com", verified_at: 0, first_verified_at: 0 },
      {
        type: "wallet",
        chain_type: "ethereum",
        wallet_client_type: "privy",
        connector_type: "embedded",
        address,
        delegated: false,
        imported: false,
        first_verified_at: 0,
        latest_verified_at: 0,
        recovery_method: "privy",
        id: "wallet_1",
      },
    ],
    has_accepted_terms: true,
    mfa_methods: [],
  } as unknown as User;
}

describe("chess identity helper", () => {
  it("finds the caller's ethereum wallet on the verified Privy user", () => {
    expect(walletOfUser(userWithWallet("0xabc"))).toBe("0xabc");
    expect(walletOfUser(null)).toBeNull();
  });

  it("marks per-caller chess reads as session-bound", () => {
    expect(chessReadNeedsSession("cashier/players/0xabc/balance")).toBe(true);
    expect(chessReadNeedsSession("cashier/config")).toBe(false);
    expect(chessReadNeedsSession("betting/markets/match-1/bets")).toBe(true);
    expect(chessReadNeedsSession("matches/123")).toBe(false);
  });

  it("rewrites the wallet-bearing body fields to the verified wallet", () => {
    expect(
      withChessIdentity(
        JSON.stringify({
          creator: "0xold",
          player: "0xold",
          bettor: "0xold",
          walletAddress: "0xold",
          amountUsdc: "5",
        }),
        "0xabc"
      )
    ).toBe(
      JSON.stringify({
        creator: "0xabc",
        player: "0xabc",
        bettor: "0xabc",
        walletAddress: "0xabc",
        amountUsdc: "5",
      })
    );
  });
});
