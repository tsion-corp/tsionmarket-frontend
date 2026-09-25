import { describe, expect, it } from "vitest";
import { walletHoldings } from "@/features/migrate/lib/venues/wallet";
import { onrampHoldings } from "@/features/migrate/lib/venues/onramp";
import type { TokenBalance } from "@/lib/server/alchemy";

function token(partial: Partial<TokenBalance>): TokenBalance {
  return {
    symbol: "USDC",
    name: "USD Coin",
    network: "base-mainnet",
    address: "0x1111111111111111111111111111111111111111",
    decimals: 6,
    kind: "stablecoin",
    balance: 1,
    rawBalance: "1000000",
    priceUsd: 1,
    valueUsd: 1,
    logo: null,
    ...partial,
  } as TokenBalance;
}

describe("walletHoldings", () => {
  it("maps sweepable balances to deterministic holdings and unsponsored ones to stranded", () => {
    const holdings = walletHoldings([
      token({}),
      token({ symbol: "ETH", address: null, decimals: 18, rawBalance: "1000000000000000000" }),
      token({ symbol: "AVAX", network: "avax-mainnet", address: null, decimals: 18 }),
      token({ symbol: "DUST", rawBalance: "0" }),
    ]);

    expect(holdings.map((h) => [h.kind, h.symbol, h.settleability.state])).toEqual([
      ["token", "USDC", "now"],
      ["native", "ETH", "now"],
      ["native", "AVAX", "stranded"],
    ]);
    expect(holdings[0].id).toBe(
      "wallet:token:base-mainnet:0x1111111111111111111111111111111111111111"
    );
    expect(holdings[0].amount).toBe(1_000_000n);
    expect(holdings[0].label).toBe("USDC on Base");
    expect(holdings.every((h) => h.deterministic && !h.irreversible)).toBe(true);
  });
});

describe("onrampHoldings", () => {
  it("lists a live account, a settling bank deposit and a settling card deposit as pending", () => {
    const holdings = onrampHoldings({
      legacyEvm: "0xOld",
      cachedAccountOrderId: "ord_1",
      pendingBankDeposit: { orderId: "ord_2" },
      pendingPouchOnramp: { sessionId: "sess_3" },
    });

    expect(holdings.map((h) => h.id)).toEqual([
      "onramp:ramping-account:ord_1",
      "onramp:ramping-pending:ord_2",
      "onramp:pouch-pending:sess_3",
    ]);
    expect(holdings.every((h) => h.settleability.state === "pending")).toBe(true);
  });

  it("is empty when nothing is in flight", () => {
    expect(
      onrampHoldings({
        legacyEvm: "0xOld",
        cachedAccountOrderId: null,
        pendingBankDeposit: null,
        pendingPouchOnramp: null,
      })
    ).toEqual([]);
  });
});
