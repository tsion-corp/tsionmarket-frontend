import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnrampWatch } from "@/lib/ramping/onramp-watch";

const WALLET = "0xaaaa000000000000000000000000000000000001";
const NOW = 1_000_000;

function watch(over: Partial<OnrampWatch> = {}): OnrampWatch {
  return {
    wallet: WALLET,
    orderId: "order-1",
    reused: false,
    // ₦5,000 at ₦1,450 buys 3.448275 USDC.
    expectedNgn: 5000,
    quotedRate: 1450,
    provider: "Rubies MFB",
    openedAt: NOW,
    ...over,
  };
}

// The module caches the parsed store, so each scenario gets its own instance.
async function load() {
  vi.resetModules();
  window.localStorage.clear();
  return import("@/lib/ramping/onramp-watch");
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("matching an arrival to a bank deposit", () => {
  it("takes the rail's own figure when the order has settled", async () => {
    const { matchWatch } = await load();
    const settled = watch({ orderId: "settled", settledNgn: 5000, settledUsd: 3.448275 });
    expect(matchWatch([settled], WALLET, 3.448275, NOW)?.orderId).toBe("settled");
  });

  it("matches a reused account from the amount the user was quoted", async () => {
    // A reused payment account has no order to poll: the rail completed it on
    // an earlier deposit and never moves it again. The quote is all there is.
    const { matchWatch } = await load();
    expect(matchWatch([watch({ reused: true })], WALLET, 3.448275, NOW)).not.toBeNull();
  });

  it("still matches when the rate moved between the quote and the payment", async () => {
    // ₦5,000 converted at 1,500 rather than the 1,450 quoted.
    const { matchWatch } = await load();
    expect(matchWatch([watch()], WALLET, 3.333333, NOW)).not.toBeNull();
  });

  it("refuses an arrival the quote cannot explain", async () => {
    // A 25 USDC deposit is nothing like ₦5,000 at any plausible rate, so it is
    // a crypto deposit that happened to land while a transfer was open.
    const { matchWatch } = await load();
    expect(matchWatch([watch()], WALLET, 25, NOW)).toBeNull();
  });

  it("never claims another wallet's deposit", async () => {
    // A device can hold more than one login. Attributing across them would put
    // the wrong rail on both deposits.
    const { matchWatch } = await load();
    expect(
      matchWatch([watch()], "0xbbbb000000000000000000000000000000000002", 3.448275, NOW)
    ).toBeNull();
  });

  it("lets a deposit age out rather than holding arrivals back forever", async () => {
    const { matchWatch, WATCH_TTL_MS } = await load();
    expect(matchWatch([watch()], WALLET, 3.448275, NOW + WATCH_TTL_MS)).toBeNull();
  });

  it("prefers the newest deposit when two are open", async () => {
    const { matchWatch } = await load();
    const older = watch({ orderId: "older", openedAt: NOW - 60_000 });
    const newer = watch({ orderId: "newer" });
    expect(matchWatch([older, newer], WALLET, 3.448275, NOW)?.orderId).toBe("newer");
  });
});

describe("the Naira leg reported for a match", () => {
  it("derives the rate from the two legs, so it is the one actually applied", async () => {
    const { bankFigures } = await load();
    // ₦5,000 that bought 3.333333 USDC was converted at 1,500, whatever the
    // 1,450 on screen said.
    const figures = bankFigures(watch(), 3.333333);
    expect(figures?.amount_ngn).toBe(5000);
    expect(figures?.fx_rate).toBeCloseTo(1500, 3);
    expect(figures!.amount_ngn / figures!.fx_rate).toBeCloseTo(3.333333, 6);
  });

  it("uses what the rail says it moved over what the user typed", async () => {
    const { bankFigures } = await load();
    expect(bankFigures(watch({ settledNgn: 4900, settledUsd: 3.37931 }), 3.37931)?.amount_ngn).toBe(
      4900
    );
  });
});

describe("the store", () => {
  it("claims a deposit once, so one transfer cannot name two arrivals", async () => {
    const { openOnrampWatch, claimOnrampWatch } = await load();
    openOnrampWatch(
      {
        wallet: WALLET,
        orderId: "order-1",
        reused: true,
        expectedNgn: 5000,
        quotedRate: 1450,
        provider: "Rubies MFB",
      },
      NOW
    );
    expect(claimOnrampWatch(WALLET, 3.448275, NOW)).not.toBeNull();
    expect(claimOnrampWatch(WALLET, 3.448275, NOW)).toBeNull();
  });

  it("reports a deposit as in flight until it is claimed", async () => {
    const { openOnrampWatch, claimOnrampWatch, hasOpenOnrampWatch } = await load();
    expect(hasOpenOnrampWatch(WALLET, NOW)).toBe(false);
    openOnrampWatch(
      {
        wallet: WALLET,
        orderId: "order-1",
        reused: false,
        expectedNgn: 5000,
        quotedRate: 1450,
        provider: "Rubies MFB",
      },
      NOW
    );
    expect(hasOpenOnrampWatch(WALLET, NOW)).toBe(true);
    claimOnrampWatch(WALLET, 3.448275, NOW);
    expect(hasOpenOnrampWatch(WALLET, NOW)).toBe(false);
  });

  it("replaces the expectation with the rail's figures once it reports", async () => {
    const { openOnrampWatch, settleOnrampWatch, claimOnrampWatch } = await load();
    openOnrampWatch(
      {
        wallet: WALLET,
        orderId: "order-1",
        reused: false,
        expectedNgn: 5000,
        quotedRate: 1450,
        provider: "Rubies MFB",
      },
      NOW
    );
    // The user actually sent ₦4,000, not the ₦5,000 they typed.
    settleOnrampWatch("order-1", { amountNgn: 4000, amountUsd: 2.75862 }, NOW);
    expect(claimOnrampWatch(WALLET, 2.75862, NOW)?.amount_ngn).toBe(4000);
  });

  it("matches a wallet whatever case it arrives in", async () => {
    const { openOnrampWatch, hasOpenOnrampWatch } = await load();
    openOnrampWatch(
      {
        wallet: WALLET.toUpperCase(),
        orderId: "order-1",
        reused: true,
        expectedNgn: 5000,
        quotedRate: 1450,
        provider: "Rubies MFB",
      },
      NOW
    );
    expect(hasOpenOnrampWatch(WALLET, NOW)).toBe(true);
  });

  it("survives a corrupt store rather than taking the app down", async () => {
    const { onrampWatches } = await load();
    window.localStorage.setItem("wsws.ramping.onramp-watch.v1", "{not json");
    expect(onrampWatches()).toEqual([]);
  });
});
