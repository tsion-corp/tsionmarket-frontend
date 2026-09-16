import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys factory", () => {
  it("generates stable user query keys", () => {
    expect(queryKeys.user.me()).toEqual(["user", "me"]);
    expect(queryKeys.user.session()).toEqual(["user", "session"]);
  });

  it("generates portfolio query keys with null defaults", () => {
    expect(queryKeys.portfolio.byWallet("0x123", "So111")).toEqual(["portfolio", "0x123", "So111"]);
    expect(queryKeys.portfolio.byWallet(undefined, null)).toEqual(["portfolio", null, null]);
    expect(queryKeys.portfolio.baseByWallet("0x123")).toEqual(["portfolio", "base", "0x123"]);
  });

  it("generates activity query keys with null defaults", () => {
    expect(queryKeys.activity.byWallet("0xabc", undefined)).toEqual(["activity", "0xabc", null]);
  });

  it("generates kash query keys", () => {
    expect(queryKeys.kash.status()).toEqual(["kash", "status"]);
    expect(queryKeys.kash.account("0x123")).toEqual(["kash", "account", "0x123"]);
  });

  it("generates dextopus query keys matching persisted prefixes", () => {
    expect(queryKeys.dextopus.chains()).toEqual(["deposit-chains"]);
    expect(queryKeys.dextopus.tokens(8453)).toEqual(["deposit-tokens", 8453]);
    expect(queryKeys.dextopus.status("req-1", "deposit")).toEqual([
      "dextopus",
      "status",
      "deposit",
      "req-1",
    ]);
  });
});
