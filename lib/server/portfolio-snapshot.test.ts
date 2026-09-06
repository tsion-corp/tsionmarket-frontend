import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const session = vi.hoisted(() => ({
  user: null as unknown,
}));

const alchemy = vi.hoisted(() => ({
  fetchPortfolio: vi.fn(),
}));

vi.mock("@/lib/server/session", () => ({
  getSessionUser: () => Promise.resolve(session.user),
}));

vi.mock("@/lib/server/alchemy", () => ({
  fetchPortfolio: alchemy.fetchPortfolio,
}));

import { dehydratedPortfolio } from "@/lib/server/portfolio-snapshot";

const signedIn = {
  id: "user_1",
  linked_accounts: [
    { type: "wallet", wallet_client_type: "privy", chain_type: "ethereum", address: "0xabc" },
    { type: "wallet", wallet_client_type: "privy", chain_type: "solana", address: "SoL1" },
  ],
};

describe("dehydratedPortfolio", () => {
  beforeEach(() => {
    alchemy.fetchPortfolio.mockReset();
    session.user = null;
  });

  it("returns nothing without a session, and never touches Alchemy", async () => {
    expect(await dehydratedPortfolio()).toBeNull();
    expect(alchemy.fetchPortfolio).not.toHaveBeenCalled();
  });

  it("returns nothing for a user with no embedded wallet", async () => {
    session.user = { id: "user_2", linked_accounts: [{ type: "email" }] };
    expect(await dehydratedPortfolio()).toBeNull();
    expect(alchemy.fetchPortfolio).not.toHaveBeenCalled();
  });

  it("prefetches the session's own wallets under the key the browser builds", async () => {
    session.user = signedIn;
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 42, tokens: [] });

    const state = await dehydratedPortfolio();

    expect(alchemy.fetchPortfolio).toHaveBeenCalledWith("0xabc", "SoL1");
    expect(state?.queries).toHaveLength(1);
    expect(state?.queries[0].queryKey).toEqual(["portfolio", "0xabc", "SoL1"]);
    expect(state?.queries[0].state.data).toEqual({ totalUsd: 42, tokens: [] });
  });

  it("keeps a null wallet in the key, as the browser does", async () => {
    session.user = { id: "user_3", linked_accounts: [signedIn.linked_accounts[0]] };
    alchemy.fetchPortfolio.mockResolvedValue({ totalUsd: 1, tokens: [] });

    const state = await dehydratedPortfolio();

    expect(alchemy.fetchPortfolio).toHaveBeenCalledWith("0xabc", undefined);
    expect(state?.queries[0].queryKey).toEqual(["portfolio", "0xabc", null]);
  });

  it("carries nothing when the balance read fails, so the browser fetches itself", async () => {
    session.user = signedIn;
    alchemy.fetchPortfolio.mockRejectedValue(new Error("alchemy down"));

    const state = await dehydratedPortfolio();

    expect(state?.queries ?? []).toHaveLength(0);
  });
});
