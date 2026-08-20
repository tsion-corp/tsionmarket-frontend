import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCachedOnrampAccount,
  loadCachedOnrampAccount,
  saveCachedOnrampAccount,
} from "@/lib/ramping/account-cache";

const ACCOUNT = { accountNumber: "8881724103", accountName: "Onramp x", bankName: "Rubies MFB" };
const WALLET = "0xD59a229641DD869e34888013D1C4c1868f62af59";

describe("onramp account cache", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns the saved account for the same wallet, any casing", () => {
    saveCachedOnrampAccount(WALLET, "ord-1", ACCOUNT);
    expect(loadCachedOnrampAccount(WALLET.toUpperCase())?.orderId).toBe("ord-1");
    expect(loadCachedOnrampAccount(WALLET)?.account.accountNumber).toBe("8881724103");
  });

  it("never hands one wallet another wallet's account", () => {
    saveCachedOnrampAccount(WALLET, "ord-1", ACCOUNT);
    expect(loadCachedOnrampAccount("0x1111111111111111111111111111111111111111")).toBeNull();
  });

  it("keeps one entry per wallet on the same device", () => {
    const other = "0x2222222222222222222222222222222222222222";
    saveCachedOnrampAccount(WALLET, "ord-1", ACCOUNT);
    saveCachedOnrampAccount(other, "ord-2", { ...ACCOUNT, accountNumber: "0000000000" });
    expect(loadCachedOnrampAccount(WALLET)?.orderId).toBe("ord-1");
    expect(loadCachedOnrampAccount(other)?.orderId).toBe("ord-2");
  });

  it("clears only the asked wallet", () => {
    const other = "0x2222222222222222222222222222222222222222";
    saveCachedOnrampAccount(WALLET, "ord-1", ACCOUNT);
    saveCachedOnrampAccount(other, "ord-2", ACCOUNT);
    clearCachedOnrampAccount(WALLET);
    expect(loadCachedOnrampAccount(WALLET)).toBeNull();
    expect(loadCachedOnrampAccount(other)?.orderId).toBe("ord-2");
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem("wsws.ramping.onramp-account.v1", "{not json");
    expect(loadCachedOnrampAccount(WALLET)).toBeNull();
    saveCachedOnrampAccount(WALLET, "ord-1", ACCOUNT);
    expect(loadCachedOnrampAccount(WALLET)?.orderId).toBe("ord-1");
  });
});
