import { describe, expect, it } from "vitest";
import { isWithdrawHeld, readyToSpendOf } from "@/features/portfolio/lib/ready-to-spend";
import { readyToSpendUsd } from "@/features/portfolio/lib/breakdown";
import { compareCashFigures, embeddedWallets, spendableCash } from "@/lib/balance/spendable";
import { parseUserBalance } from "@/lib/balance/schema";
import { balanceBody } from "@/lib/balance/fixture";
import { OFFRAMP_MIN_USDC } from "@/lib/ramping/orders";
import type { TokenBalance } from "@/lib/server/alchemy";
import type { BalanceAsset, UserBalance, WalletBalance } from "@/lib/balance/types";

// The wallet in the sample payload, as Privy hands it back rather than as the
// service writes it.
const OURS = "0x72F2578adE01ca5a844Cb0a46dC1943BbD233ACa";
// A wallet the user connected themselves: linked to the DID, so the endpoint
// reports it, and not embedded, so no button in this app can move its money.
const THEIRS = "0x1111111111111111111111111111111111111111";

describe("readyToSpendOf", () => {
  it("reads a decimal string as the figure to show", () => {
    expect(readyToSpendOf({ cash: "0.128718", pending: false, error: null })).toEqual({
      state: "known",
      usd: 0.128718,
    });
  });

  it("reads a zero as a figure, not as an absence", () => {
    // The distinction the whole type exists for: someone with an empty wallet
    // is told so.
    expect(readyToSpendOf({ cash: "0", pending: false, error: null })).toEqual({
      state: "known",
      usd: 0,
    });
  });

  it("is loading, not failed, while the first read is on its way", () => {
    // spendableCash answers null for a balance that has not landed AND for a
    // session Privy has not finished loading. Rendering either as "couldn't
    // load" would flash a failure at someone whose balance is about to appear.
    expect(readyToSpendOf({ cash: null, pending: true, error: null })).toEqual({
      state: "loading",
    });
  });

  it("is unknown once a read has actually failed", () => {
    expect(readyToSpendOf({ cash: null, pending: true, error: new Error("502") })).toEqual({
      state: "unknown",
    });
    expect(readyToSpendOf({ cash: null, pending: false, error: null })).toEqual({
      state: "unknown",
    });
  });

  it("refuses a figure it cannot read rather than rendering one", () => {
    // Number("") is 0 and Number("what") is NaN. Neither may reach a card that
    // shows people their money, and neither is replaced by a made-up figure:
    // the caller is told it is not known.
    for (const cash of ["", "  ", "what", "1e21", "0x10"]) {
      expect(readyToSpendOf({ cash, pending: false, error: null })).toEqual({ state: "unknown" });
    }
  });
});

describe("isWithdrawHeld", () => {
  it("holds nothing while no deposit is settling", () => {
    expect(isWithdrawHeld(false, { state: "known", usd: 0 })).toBe(false);
    expect(isWithdrawHeld(false, { state: "unknown" })).toBe(false);
  });

  it("holds the button on a settling deposit with nothing spendable", () => {
    expect(isWithdrawHeld(true, { state: "known", usd: 0 })).toBe(true);
    expect(isWithdrawHeld(true, { state: "known", usd: OFFRAMP_MIN_USDC - 0.01 })).toBe(true);
  });

  it("leaves the button alone for someone who can already withdraw", () => {
    expect(isWithdrawHeld(true, { state: "known", usd: OFFRAMP_MIN_USDC })).toBe(false);
    expect(isWithdrawHeld(true, { state: "known", usd: 500 })).toBe(false);
  });

  it("never holds the button on a figure that is not known", () => {
    // The defect this change exists for. `?? 0` here reads as "you have
    // nothing" and shuts the button on someone who has money, with no error
    // anywhere on the card to explain it.
    expect(isWithdrawHeld(true, { state: "unknown" })).toBe(false);
    expect(isWithdrawHeld(true, { state: "loading" })).toBe(false);
  });
});

// THE TWO SOURCES, MEASURED AGAINST EACH OTHER
//
// readyToSpendUsd() sums `valueUsd` — a float balance times a float price —
// across the portfolio's stablecoins. spendableCash() sums base units of the
// same stablecoins out of the balance endpoint. They are built from different
// services, so this asserts agreement inside lib/balance/spendable.ts's own
// tolerance rather than equality.
//
// A failure here is NOT a tolerance to widen. It means the two sources have
// stopped describing the same money — a wallet set or a chain coverage
// difference, per that module's own header — and it is a finding to report.

function stablecoin(balance: number, priceUsd: number): TokenBalance {
  return {
    symbol: "USDC",
    name: "USD Coin",
    network: "base-mainnet",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
    kind: "stablecoin",
    balance,
    rawBalance: String(Math.round(balance * 1e6)),
    priceUsd,
    // Exactly how lib/server/alchemy.ts builds it: float times float.
    valueUsd: balance * priceUsd,
    logo: null,
  };
}

function usdcAsset(baseUnits: string): BalanceAsset {
  return {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    amount: { baseUnits, decimals: 6 },
  };
}

function walletHolding(address: string, baseUnits: string): WalletBalance {
  return {
    chain: "0x2105",
    address,
    native: {
      symbol: "ETH",
      name: "Ether",
      address: null,
      amount: { baseUnits: "0", decimals: 18 },
    },
    tokens: [usdcAsset(baseUnits)],
    blockNumber: "51693471",
    slot: null,
  };
}

function balanceOf(wallets: WalletBalance[]): UserBalance {
  return {
    generatedAt: "2026-09-23T15:11:29.600Z",
    staleAt: "2026-09-23T15:11:44.600Z",
    cached: false,
    chains: ["0x2105"],
    wallets,
  };
}

describe("the endpoint's cash against the incumbent float sum", () => {
  it("agrees on the sample payload", () => {
    // The one real response body we have: 0.128718 USDC in the embedded
    // wallet, which the incumbent path would price at par.
    const exact = spendableCash(embeddedWallets(parseUserBalance(balanceBody()), [OURS]));
    const incumbent = readyToSpendUsd([stablecoin(0.128718, 1)]);

    expect(exact).toBe("0.128718");
    const agreement = compareCashFigures(exact, incumbent);
    expect(agreement.verdict).toBe("agree");
    // Not "0": the incumbent's 0.128718 is a double, and compareCashFigures
    // writes the expansion the double actually holds rather than the decimal
    // it was typed as. The residue is ~5e-18 of a dollar — the float path's
    // own error, stated instead of hidden, and eighteen orders of magnitude
    // inside the cent floor.
    expect(Number(agreement.differenceUsd)).toBeLessThan(1e-15);
  });

  it("agrees on a real-size balance priced off par by the incumbent's feed", () => {
    // The incumbent values a stablecoin at its live feed price rather than at
    // $1. At 1,250.75 USDC and a feed 3 bps below par that is 37c of honest
    // difference, well inside the 0.5% the shared tolerance allows.
    const exact = spendableCash(
      embeddedWallets(balanceOf([walletHolding(OURS, "1250750000")]), [OURS])
    );
    const incumbent = readyToSpendUsd([stablecoin(1250.75, 0.9997)]);

    const agreement = compareCashFigures(exact, incumbent);
    expect(agreement.verdict).toBe("agree");
    expect(Number(agreement.differenceUsd)).toBeLessThan(Number(agreement.toleranceUsd));
  });

  it("catches a wallet-set divergence, which is what this comparison is for", () => {
    // The endpoint reports every LINKED wallet, including one the user
    // connected themselves; the incumbent reads the embedded wallets only. If
    // the narrowing were ever dropped, the two figures would part by the whole
    // of that wallet — real money in the wrong column, and not a rounding bug.
    const linked = balanceOf([
      walletHolding(OURS, "1250750000"),
      walletHolding(THEIRS, "500000000"),
    ]);
    const incumbent = readyToSpendUsd([stablecoin(1250.75, 0.9997)]);

    const narrowed = compareCashFigures(spendableCash(embeddedWallets(linked, [OURS])), incumbent);
    expect(narrowed.verdict).toBe("agree");

    const unnarrowed = compareCashFigures(spendableCash(linked.wallets), incumbent);
    expect(unnarrowed.verdict).toBe("diverged");
    // The whole of the connected wallet, to the cent: $500 of someone's money
    // counted on one side and not the other.
    expect(Number(unnarrowed.differenceUsd)).toBeCloseTo(500.375, 2);
  });

  it("judges nothing when the exact figure was never established", () => {
    // A balance that has not loaded is not a disagreement about money.
    expect(compareCashFigures(spendableCash(embeddedWallets(null, [OURS])), 12).verdict).toBe(
      "unknown"
    );
  });

  it("does not let a broken incumbent figure pass as agreement", () => {
    // A NaN total is a defect in the float path. compareCashFigures throws on
    // it rather than returning a verdict, and this test holds that throw
    // rather than catching it — swallowing it here is how it would reach a
    // user as a silently wrong comparison.
    expect(() => compareCashFigures("10", readyToSpendUsd([stablecoin(1, Number.NaN)]))).toThrow(
      /finite/u
    );
  });
});
