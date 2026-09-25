import { describe, expect, it } from "vitest";
import { parseUserBalance } from "@/lib/balance/schema";
import { balanceBody, emptyBalanceBody } from "@/lib/balance/fixture";
import { baseUnitsOf, toDecimalString } from "@/lib/balance/amount";

// A body with one field changed, so every case below differs from the real
// payload in exactly the one way it is about.
function bodyWith(edit: (body: Record<string, unknown>) => void): unknown {
  const body = balanceBody() as Record<string, unknown>;
  edit(body);
  return body;
}

function firstWallet(body: unknown): Record<string, unknown> {
  return (body as { wallets: Record<string, unknown>[] }).wallets[0];
}

describe("parseUserBalance", () => {
  it("maps the service's own sample payload", () => {
    const balance = parseUserBalance(balanceBody());

    expect(balance.generatedAt).toBe("2026-09-23T15:11:29.600Z");
    expect(balance.staleAt).toBe("2026-09-23T15:11:44.600Z");
    expect(balance.cached).toBe(false);
    expect(balance.chains).toEqual(["0x2105"]);
    expect(balance.wallets).toHaveLength(1);

    const wallet = balance.wallets[0];
    expect(wallet.chain).toBe("0x2105");
    expect(wallet.address).toBe("0x72f2578ade01ca5a844cb0a46dc1943bbd233aca");
    expect(wallet.blockNumber).toBe("51693471");
    expect(wallet.slot).toBeNull();

    expect(wallet.native).toEqual({
      symbol: "ETH",
      name: "Ether",
      address: null,
      amount: { baseUnits: "504709067444182", decimals: 18 },
    });
    expect(wallet.tokens).toEqual([
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        amount: { baseUnits: "128718", decimals: 6 },
      },
    ]);
  });

  it("keeps the base units as the string they arrived as", () => {
    const wallet = parseUserBalance(balanceBody()).wallets[0];
    // Not a number, at any depth: JSON.stringify would print 504709067444182
    // for both, so the check is on the type itself.
    expect(typeof wallet.native.amount.baseUnits).toBe("string");
    expect(typeof wallet.tokens[0].amount.baseUnits).toBe("string");
    expect(baseUnitsOf(wallet.native.amount)).toBe(504709067444182n);
    expect(toDecimalString(wallet.native.amount)).toBe("0.000504709067444182");
  });

  it("carries a balance that a float would round, digit for digit", () => {
    // 18-decimal base units well past 2^53. Number() renders this as
    // 123456789012345680000000 — the last five digits are invented.
    const huge = "123456789012345678912345";
    const body = bodyWith((draft) => {
      const native = firstWallet(draft).native as Record<string, unknown>;
      native.balance = huge;
      native.balanceFormatted = "123456.789012345678912345";
    });

    const amount = parseUserBalance(body).wallets[0].native.amount;
    expect(amount.baseUnits).toBe(huge);
    expect(baseUnitsOf(amount).toString()).toBe(huge);
    expect(toDecimalString(amount)).toBe("123456.789012345678912345");
    expect(String(Number(huge))).not.toBe(huge);
  });

  it("accepts an account with no linked wallets", () => {
    const balance = parseUserBalance(emptyBalanceBody());
    expect(balance.wallets).toEqual([]);
    expect(balance.cached).toBe(true);
    // An account with nothing is not an error and not a missing balance: it is
    // a balance of nothing, and the caller can tell the two apart.
    expect(balance).not.toHaveProperty("totalUsdValue");
  });

  it("refuses a balance that is not integer base units", () => {
    const body = bodyWith((draft) => {
      const native = firstWallet(draft).native as Record<string, unknown>;
      native.balance = "0.000504709067444182";
    });
    expect(() => parseUserBalance(body)).toThrow();
  });

  it("refuses a balance sent as a number", () => {
    // The shape that loses the digits before we ever see the body.
    const body = bodyWith((draft) => {
      const native = firstWallet(draft).native as Record<string, unknown>;
      native.balance = 504709067444182;
    });
    expect(() => parseUserBalance(body)).toThrow();
  });

  it("refuses a rendering that disagrees with the base units", () => {
    const body = bodyWith((draft) => {
      const native = firstWallet(draft).native as Record<string, unknown>;
      native.balanceFormatted = "0.0005047090674441";
    });
    expect(() => parseUserBalance(body)).toThrow(/balanceFormatted/u);
  });

  it("tolerates a usdValue and keeps it off the domain", () => {
    // This assertion used to be the reverse: a priced figure was refused so
    // the change would be noticed. It was changed deliberately, because the
    // noticing would have been every user's balance failing to load on a day
    // the backend shipped an additive field the app does not read.
    const body = bodyWith((draft) => {
      const native = firstWallet(draft).native as Record<string, unknown>;
      native.usdValue = "1.23";
    });
    const parsed = parseUserBalance(body);
    expect(parsed.wallets[0].native.amount.baseUnits).toBe("504709067444182");
    expect(parsed.wallets[0].native).not.toHaveProperty("usdValue");
  });

  it("refuses a decimal chain id where a hex one belongs", () => {
    const body = bodyWith((draft) => {
      firstWallet(draft).chain = "8453";
    });
    expect(() => parseUserBalance(body)).toThrow();
  });

  it("refuses a hex block number, which the service writes in decimal", () => {
    const body = bodyWith((draft) => {
      firstWallet(draft).blockNumber = "0x314b39f";
    });
    expect(() => parseUserBalance(body)).toThrow();
  });

  it("refuses a body missing the wallet list rather than reading it as empty", () => {
    const body = bodyWith((draft) => {
      delete draft.wallets;
    });
    expect(() => parseUserBalance(body)).toThrow();
  });

  it("ignores a field the service adds later", () => {
    const body = bodyWith((draft) => {
      draft.nextRefreshAt = "2026-09-23T15:11:44.600Z";
    });
    expect(parseUserBalance(body).wallets).toHaveLength(1);
  });
});

describe("parseUserBalance when the service starts pricing", () => {
  it("keeps reading balances once usdValue carries a figure", () => {
    // Pricing is an ADDITIVE change upstream: the day it ships, every balance
    // read in the app must keep working. Refusing the payload here would take
    // the feature down for every user until a frontend release caught up, and
    // this app does not consume the figure at all.
    const data = balanceBody() as Record<string, unknown>;
    data.totalUsdValue = 12.34;
    const wallet = (data.wallets as Record<string, unknown>[])[0];
    (wallet.native as Record<string, unknown>).usdValue = 1.75;
    ((wallet.tokens as Record<string, unknown>[])[0] as Record<string, unknown>).usdValue =
      "0.128718";

    const parsed = parseUserBalance(data);
    expect(parsed.wallets[0].native.amount.baseUnits).toBe("504709067444182");
    expect(parsed.wallets[0].tokens[0].amount.baseUnits).toBe("128718");
  });

  it("carries no dollar figure of its own, priced upstream or not", () => {
    // The app's prices come from its own source. A field that is always null
    // would be noise; a field that silently became a number would be a dollar
    // amount of unknown provenance. So the domain carries neither.
    const parsed = parseUserBalance(balanceBody());
    expect(parsed).not.toHaveProperty("totalUsdValue");
    expect(parsed.wallets[0].native).not.toHaveProperty("usdValue");
  });
});
