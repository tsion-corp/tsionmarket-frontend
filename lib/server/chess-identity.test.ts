import { describe, it, expect } from "vitest";
import type { User } from "@privy-io/node";
import {
  chessReadNeedsSession,
  walletOfUser,
  withChessReadIdentity,
  withChessIdentity,
} from "@/lib/server/chess-identity";

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

  it("prefers the embedded Privy wallet over an external wallet listed first", () => {
    const user = userWithWallet("0xembedded");
    (user as unknown as { linked_accounts: unknown[] }).linked_accounts.unshift({
      type: "wallet",
      chain_type: "ethereum",
      wallet_client_type: "metamask",
      connector_type: "injected",
      address: "0xexternal",
      first_verified_at: 0,
      latest_verified_at: 0,
      id: "wallet_ext",
    });
    expect(walletOfUser(user)).toBe("0xembedded");
  });

  it("falls back to any ethereum wallet when no embedded wallet exists", () => {
    const user = userWithWallet("0xembedded");
    const record = user as unknown as {
      linked_accounts: { type: string; wallet_client_type?: string }[];
    };
    const wallet = record.linked_accounts.find((a) => a.type === "wallet");
    if (wallet) wallet.wallet_client_type = "metamask";
    expect(walletOfUser(user)).toBe("0xembedded");
  });

  it("marks per-caller chess reads as session-bound", () => {
    expect(chessReadNeedsSession("cashier/players/0xabc/balance")).toBe(true);
    expect(chessReadNeedsSession("cashier/config")).toBe(false);
    expect(chessReadNeedsSession("betting/markets/match-1/bets")).toBe(true);
    expect(chessReadNeedsSession("matches/123/note")).toBe(true);
    expect(chessReadNeedsSession("matches/123/chat", new URLSearchParams("room=player"))).toBe(
      true
    );
    expect(chessReadNeedsSession("matches/123/chat", new URLSearchParams("room=spectator"))).toBe(
      false
    );
    expect(chessReadNeedsSession("matches/123")).toBe(false);
  });

  it("rewrites the wallet-bearing body fields to the verified wallet", () => {
    const oldWallet = "0x1111111111111111111111111111111111111111";
    expect(
      withChessIdentity(
        "matches/123/chat",
        JSON.stringify({
          author: oldWallet,
          creator: oldWallet,
          player: oldWallet,
          bettor: oldWallet,
          walletAddress: oldWallet,
          amountUsdc: "5",
        }),
        "0xabc"
      )
    ).toBe(
      JSON.stringify({
        author: "0xabc",
        creator: "0xabc",
        player: "0xabc",
        bettor: "0xabc",
        walletAddress: "0xabc",
        amountUsdc: "5",
      })
    );
  });

  it("adds missing private write identities from the verified wallet", () => {
    expect(
      withChessIdentity("matches/123/chat", JSON.stringify({ room: "player", text: "hi" }), "0xabc")
    ).toBe(JSON.stringify({ room: "player", text: "hi", author: "0xabc" }));
    expect(
      withChessIdentity("matches/123/note", JSON.stringify({ text: "prep line" }), "0xabc")
    ).toBe(JSON.stringify({ text: "prep line", player: "0xabc" }));
    expect(
      withChessIdentity("matches/123/comments", JSON.stringify({ ply: 4, text: "sharp" }), "0xabc")
    ).toBe(JSON.stringify({ ply: 4, text: "sharp", player: "0xabc" }));
  });

  it("keeps a Swiss seat name across the seat-gated endpoints, forcing wallet-shaped ids", () => {
    const proven = "0xDD07370000000000000000000000000000006C2E";
    // A managed-tournament seat is a short display name, not a wallet: it must
    // reach the service untouched so the seat check on moves, comments, notes and
    // player chat recognises the caller.
    expect(
      withChessIdentity(
        "matches/123/moves",
        JSON.stringify({ player: "0xDD0737-6C2E", uci: "e2e4" }),
        proven
      )
    ).toBe(JSON.stringify({ player: "0xDD0737-6C2E", uci: "e2e4" }));
    expect(
      withChessIdentity(
        "matches/123/comments",
        JSON.stringify({ player: "0xDD0737-6C2E", ply: 1, text: "x" }),
        proven
      )
    ).toBe(JSON.stringify({ player: "0xDD0737-6C2E", ply: 1, text: "x" }));
    expect(
      withChessIdentity(
        "matches/123/note",
        JSON.stringify({ player: "0xDD0737-6C2E", text: "x" }),
        proven
      )
    ).toBe(JSON.stringify({ player: "0xDD0737-6C2E", text: "x" }));
    expect(
      withChessIdentity(
        "matches/123/chat",
        JSON.stringify({ author: "0xDD0737-6C2E", room: "player", text: "x" }),
        proven
      )
    ).toBe(JSON.stringify({ author: "0xDD0737-6C2E", room: "player", text: "x" }));
    // An ordinary wallet game sends a wallet-shaped id, which is still forced.
    expect(
      withChessIdentity(
        "matches/123/moves",
        JSON.stringify({ player: "0x1111111111111111111111111111111111111111", uci: "e2e4" }),
        "0xabc"
      )
    ).toBe(JSON.stringify({ player: "0xabc", uci: "e2e4" }));
  });

  it("injects the verified wallet into private chess read query params", () => {
    expect(
      withChessReadIdentity("matches/123/note", new URLSearchParams(), "0xabc").toString()
    ).toBe("player=0xabc");
    expect(
      withChessReadIdentity(
        "matches/123/chat",
        new URLSearchParams("room=player&limit=100"),
        "0xabc"
      ).toString()
    ).toBe("room=player&limit=100&player=0xabc");
    expect(
      withChessReadIdentity(
        "matches/123/chat",
        new URLSearchParams("room=spectator&limit=100"),
        "0xabc"
      ).toString()
    ).toBe("room=spectator&limit=100");
  });
});
