import { describe, expect, it } from "vitest";
import { classifyKash, type KashInput } from "@/features/portfolio/lib/migration-adapter";
import type { KashAccount, KashSubscription } from "@/features/portfolio/lib/kash";

const TOKEN = "0x1111111111111111111111111111111111111111";

function account(unclaimed: string): KashAccount {
  return {
    wallet: "0xOld",
    balance: "0",
    balanceUsd: "0",
    lifetimeEarned: "0",
    purchased: "0",
    convertible: "0",
    week: { weekKey: "2026-W34", points: "120", unclaimed, settlesAt: "2026-08-31T00:00:00Z" },
    settlements: [],
    gate: { minHoldingUsd: "0", minHoldingKash: "0", met: true, shortfall: "0" },
    kashPriceUsd: "0.5",
  };
}

const subscription: KashSubscription = {
  wallet: "0xOld",
  tier: 2,
  paidTier: 2,
  expiresAt: null,
  active: true,
  periodDays: 30,
  lifetime: true,
};

function input(overrides: Partial<KashInput>): KashInput {
  return {
    tokenAddress: TOKEN,
    tokenBalance: 0n,
    account: null,
    subscription: null,
    pointsLive: false,
    ...overrides,
  };
}

describe("classifyKash", () => {
  it("moves KSH tokens valued at the engine price", () => {
    const [h] = classifyKash(input({ tokenBalance: 4n * 10n ** 18n, account: account("0") }));
    expect(h.id).toBe(`kash:token:${TOKEN}`);
    expect(h.decimals).toBe(18);
    expect(h.valueUsd).toBe(2);
    expect(h.settleability).toEqual({ state: "now" });
  });

  it("claims unclaimed points only when claiming is live", () => {
    const [gated] = classifyKash(input({ account: account("40") }));
    expect(gated.id).toBe("kash:points:unclaimed");
    expect(gated.settleability).toEqual({ state: "needsBackend", reason: "kashPoints" });

    const [live] = classifyKash(input({ account: account("40"), pointsLive: true }));
    expect(live.settleability).toEqual({ state: "now" });
  });

  it("hands a paid tier to the backend and ignores the free one", () => {
    const [tier] = classifyKash(input({ subscription }));
    expect(tier.id).toBe("kash:tier:2");
    expect(tier.settleability).toEqual({ state: "needsBackend", reason: "subscriptionTier" });
    expect(classifyKash(input({ subscription: { ...subscription, tier: 0 } }))).toEqual([]);
  });

  it("is empty without tokens, points, or a tier", () => {
    expect(classifyKash(input({ account: account("0") }))).toEqual([]);
  });
});
