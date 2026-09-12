import { describe, expect, it, vi } from "vitest";
import type { User } from "@privy-io/node";

vi.mock("server-only", () => ({}));

import { embeddedWalletAddress } from "@/lib/server/embedded-wallets";

function userWith(accounts: unknown[]): User {
  return { id: "user_1", linked_accounts: accounts } as unknown as User;
}

const embeddedEvm = {
  type: "wallet",
  wallet_client_type: "privy",
  chain_type: "ethereum",
  address: "0xEmbedded",
};
const embeddedSolana = {
  type: "wallet",
  wallet_client_type: "privy",
  chain_type: "solana",
  address: "SoLEmbedded",
};
const externalEvm = {
  type: "wallet",
  wallet_client_type: "metamask",
  chain_type: "ethereum",
  address: "0xExternal",
};

describe("embeddedWalletAddress", () => {
  it("returns the embedded wallet on each chain", () => {
    const user = userWith([embeddedEvm, embeddedSolana]);
    expect(embeddedWalletAddress(user, "ethereum")).toBe("0xembedded");
    // A Solana address is base58, where case is part of the address: lowercase
    // it and it is a different account, or none at all. Only the EVM address
    // is folded, and only because its casing is a checksum the two SDKs
    // disagree on.
    expect(embeddedWalletAddress(user, "solana")).toBe("SoLEmbedded");
  });

  it("skips an external wallet even when it is listed first", () => {
    // The browser picks the embedded one too; the query key must agree.
    const user = userWith([externalEvm, embeddedEvm]);
    expect(embeddedWalletAddress(user, "ethereum")).toBe("0xembedded");
  });

  it("returns null when there is no embedded wallet on that chain", () => {
    expect(embeddedWalletAddress(userWith([externalEvm]), "ethereum")).toBeNull();
    expect(embeddedWalletAddress(userWith([embeddedEvm]), "solana")).toBeNull();
    expect(embeddedWalletAddress(userWith([{ type: "email" }]), "ethereum")).toBeNull();
    expect(embeddedWalletAddress(null, "ethereum")).toBeNull();
  });
});
