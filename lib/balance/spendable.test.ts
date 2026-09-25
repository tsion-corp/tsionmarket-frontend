import { describe, expect, it } from "vitest";
import {
  CASH_TOLERANCE_FLOOR_USD,
  CASH_TOLERANCE_RELATIVE,
  compareCashFigures,
  embeddedWallets,
  spendableCash,
} from "@/lib/balance/spendable";
import { parseUserBalance } from "@/lib/balance/schema";
import { balanceBody, emptyBalanceBody } from "@/lib/balance/fixture";
import type { BalanceAsset, HexChainId, UserBalance, WalletBalance } from "@/lib/balance/types";

// The address in the sample payload, as the service writes it (lowercase).
const OURS = "0x72f2578ade01ca5a844cb0a46dc1943bbd233aca";
// The same wallet as Privy hands it back: EIP-55 checksummed, so a
// case-sensitive comparison would drop it and report someone's money as gone.
const OURS_CHECKSUMMED = "0x72F2578adE01ca5a844Cb0a46dC1943BbD233ACa";
// A wallet the user connected themselves. Linked, so the endpoint reports it;
// not embedded, so this app cannot sign for it.
const THEIRS = "0x1111111111111111111111111111111111111111";

const eth = (baseUnits: string): BalanceAsset => ({
  symbol: "ETH",
  name: "Ether",
  address: null,
  amount: { baseUnits, decimals: 18 },
});

const token = (
  symbol: string,
  baseUnits: string,
  decimals: number,
  address = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
): BalanceAsset => ({
  symbol,
  name: symbol,
  address,
  amount: { baseUnits, decimals },
});

const wallet = (
  address: string,
  tokens: BalanceAsset[],
  { native = eth("0"), chain = "0x2105" as HexChainId } = {}
): WalletBalance => ({
  chain,
  address,
  native,
  tokens,
  blockNumber: "51693471",
  slot: null,
});

const balanceOf = (wallets: WalletBalance[]): UserBalance => ({
  generatedAt: "2026-09-23T15:11:29.600Z",
  staleAt: "2026-09-23T15:11:44.600Z",
  cached: false,
  chains: ["0x2105"],
  wallets,
});

describe("embeddedWallets", () => {
  it("keeps the wallets this app controls and drops the ones it does not", () => {
    const mine = wallet(OURS, [token("USDC", "128718", 6)]);
    const theirs = wallet(THEIRS, [token("USDC", "500000000", 6)]);

    expect(embeddedWallets(balanceOf([mine, theirs]), [OURS])).toEqual([mine]);
  });

  it("matches addresses case-insensitively in both directions", () => {
    // The endpoint writes lowercase, Privy writes checksummed, and the same
    // wallet must be recognised whichever way round the two arrive.
    const lower = wallet(OURS, [token("USDC", "128718", 6)]);
    const checksummed = wallet(OURS_CHECKSUMMED, [token("USDC", "128718", 6)]);

    expect(embeddedWallets(balanceOf([lower]), [OURS_CHECKSUMMED])).toEqual([lower]);
    expect(embeddedWallets(balanceOf([checksummed]), [OURS])).toEqual([checksummed]);
  });

  it("is unknown, not empty, when no address is known", () => {
    // getEmbeddedWallets() answers [] for a user it has not loaded yet, which
    // is not the same statement as "this person controls no wallets".
    expect(embeddedWallets(balanceOf([wallet(OURS, [token("USDC", "128718", 6)])]), [])).toBeNull();
  });

  it("is unknown when the balance has not loaded", () => {
    expect(embeddedWallets(null, [OURS])).toBeNull();
    expect(embeddedWallets(undefined, [OURS])).toBeNull();
  });

  it("is a known empty when the addresses are known and none of them holds anything", () => {
    // Different from the two cases above: here we know whose wallets they are
    // and the service reported none of them.
    expect(embeddedWallets(balanceOf([wallet(THEIRS, [])]), [OURS])).toEqual([]);
    expect(embeddedWallets(parseUserBalance(emptyBalanceBody()), [OURS])).toEqual([]);
  });
});

describe("spendableCash", () => {
  it("reads the sample payload end to end", () => {
    const wallets = embeddedWallets(parseUserBalance(balanceBody()), [OURS_CHECKSUMMED]);
    expect(spendableCash(wallets)).toBe("0.128718");
  });

  it("sums stablecoins of different decimals exactly", () => {
    const wallets = [
      wallet(OURS, [token("USDC", "128718", 6), token("DAI", "1500000000000000000", 18)]),
    ];
    // 0.128718 + 1.5, with no float anywhere in between.
    expect(spendableCash(wallets)).toBe("1.628718");
  });

  it("keeps every digit of a holding a double would round", () => {
    const wallets = [
      wallet(OURS, [
        // 2^53 + 1 base units of USDC: the first integer a double cannot hold.
        token("USDC", "9007199254740993", 6),
        // One base unit of an 18-decimal stable, 12 places below USDC's last.
        token("DAI", "1", 18),
      ]),
    ];
    expect(spendableCash(wallets)).toBe("9007199254.740993000000000001");
  });

  it("sums across every wallet handed to it", () => {
    const wallets = [
      wallet(OURS, [token("USDC", "2500000", 6)]),
      wallet(OURS_CHECKSUMMED, [token("USDC", "1000000", 6)]),
    ];
    expect(spendableCash(wallets)).toBe("3.5");
  });

  it("counts no cash as zero, and an absent balance as unknown", () => {
    // A real asset at its own contract. It is worth something and belongs in
    // the main balance; it is not settled USDC, so it is not ready to spend.
    const none = spendableCash([
      wallet(OURS, [
        token("GLDx", "5000000000000000000", 18, "0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d"),
      ]),
    ]);
    expect(none).toBe("0");

    const unknown = spendableCash(null);
    expect(unknown).toBeNull();

    // The point of the whole representation: a caller gating a withdraw button
    // can tell "you have nothing" from "we do not know yet".
    expect(none).not.toBe(unknown);
  });

  it("leaves the native coin out of cash however much of it there is", () => {
    // 10 ETH is money, but it is not spendable cash: buying with it means a
    // swap, and this figure is what a purchase draws on directly. Pricing it
    // would also need a price source, which is exactly what this path avoids.
    const wallets = [wallet(OURS, [], { native: eth("10000000000000000000") })];
    expect(spendableCash(wallets)).toBe("0");
  });

  it("excludes the native coin by what it is, not by what it is called", () => {
    // Two shapes a symbol test alone would wave through. The native slot
    // holding something that reads as cash is the first; the second is a
    // tokens[] entry carrying the null address that means native in this
    // domain (lib/balance/types.ts), which is the native coin listed twice.
    // Counting either would put the gas coin in the cash figure.
    const inNativeSlot = wallet(OURS, [], {
      native: {
        symbol: "USDC",
        name: "USD Coin",
        address: null,
        amount: token("USDC", "10000000", 6).amount,
      },
    });
    const nativeAmongTokens = wallet(OURS, [{ ...token("USDC", "10000000", 6), address: null }]);

    expect(spendableCash([inNativeSlot])).toBe("0");
    expect(spendableCash([nativeAmongTokens])).toBe("0");
  });

  it("ignores a stablecoin on a chain this app does not settle on", () => {
    // Everything here settles on Base. A balance the service reports on
    // another chain is real money that a purchase in this app cannot reach.
    const wallets = [wallet(OURS, [token("USDC", "1000000", 6)], { chain: "0xa4b1" })];
    expect(spendableCash(wallets)).toBe("0");
  });

  it("counts every stablecoin symbol the app already treats as cash", () => {
    const wallets = [
      wallet(OURS, [
        token("USDC", "1000000", 6),
        token("usdt", "1000000", 6),
        token("DAI", "1000000000000000000", 18),
      ]),
    ];
    expect(spendableCash(wallets)).toBe("3");
  });
});

describe("compareCashFigures", () => {
  it("agrees when the two figures are the same", () => {
    // 0.5% of $100 is fifty cents, which is already wider than the floor —
    // the floor only governs figures below $2.
    expect(compareCashFigures("100", 100)).toEqual({
      verdict: "agree",
      differenceUsd: "0",
      toleranceUsd: "0.5",
    });
  });

  it("falls back to the cent floor when a percentage of the figure is less", () => {
    expect(compareCashFigures("0", 0)).toEqual({
      verdict: "agree",
      differenceUsd: "0",
      toleranceUsd: CASH_TOLERANCE_FLOOR_USD,
    });
  });

  it("agrees when a large balance differs by the incumbent's price noise", () => {
    // The incumbent values a stablecoin at its live feed price rather than at
    // $1, so a big balance lands a few tens of basis points away from ours.
    const result = compareCashFigures("1000", 999.5);
    expect(result.verdict).toBe("agree");
    expect(result.differenceUsd).toBe("0.5");
    expect(result.toleranceUsd).toBe("5");
  });

  it("reports a divergence a price feed cannot explain", () => {
    // A whole wallet counted on one side and not the other.
    const result = compareCashFigures("1000", 100);
    expect(result.verdict).toBe("diverged");
    expect(result.differenceUsd).toBe("900");
  });

  it("holds a small figure to the cent floor rather than to the percentage", () => {
    // 0.5% of two cents is a fiftieth of a cent, which no balance can be off
    // by for an honest reason.
    const result = compareCashFigures("0.02", 0.005);
    expect(result.verdict).toBe("diverged");
    expect(result.toleranceUsd).toBe(CASH_TOLERANCE_FLOOR_USD);
  });

  it("judges nothing when the exact figure is unknown", () => {
    expect(compareCashFigures(null, 12)).toEqual({
      verdict: "unknown",
      differenceUsd: null,
      toleranceUsd: null,
    });
  });

  it("throws on a figure it cannot read rather than calling it a divergence", () => {
    // A NaN total is an upstream defect in the float path, not a disagreement
    // about someone's money, and reporting it as "unknown" would hide it
    // behind the same verdict a not-yet-loaded balance produces.
    expect(() => compareCashFigures("10", Number.NaN)).toThrow(/finite/u);
    expect(() => compareCashFigures("ten", 10)).toThrow(/decimal/u);
  });

  it("publishes the tolerance it applied", () => {
    expect(CASH_TOLERANCE_FLOOR_USD).toBe("0.01");
    expect(CASH_TOLERANCE_RELATIVE).toBe("0.005");
  });
});

describe("spendableCash counts USDC on Base and nothing else", () => {
  // "Ready to spend" means money that has already settled as USDC on Base.
  // It is not a portfolio valuation: it is a claim about what the reader can
  // act on right now, and it gates the withdraw button.
  const ONE_USDC = "1000000";

  it("counts the canonical Base USDC contract", () => {
    const wallets = embeddedWallets(balanceOf([wallet(OURS, [token("USDC", ONE_USDC, 6)])]), [
      OURS,
    ]);
    expect(spendableCash(wallets)).toBe("1");
  });

  it("ignores a token that merely calls itself USDC", () => {
    // Anyone can deploy a token on Base and name it USDC, and this endpoint
    // reports whatever the wallet holds. Matching on the symbol would let an
    // airdropped forgery inflate the figure that decides whether someone may
    // withdraw. The activity feed has already seen this attack in the wild,
    // with a homoglyph "USDC" whose S was U+1E62.
    const forged = token("USDC", "500000000", 6, "0x6c9458b7e1c1742c68d2662ea6a41ac5de43d28c");
    const wallets = embeddedWallets(balanceOf([wallet(OURS, [forged])]), [OURS]);
    expect(spendableCash(wallets)).toBe("0");
  });

  it("does not count USDT on Base, which has not settled as USDC", () => {
    const usdt = token("USDT", "9000000", 6, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
    const wallets = embeddedWallets(balanceOf([wallet(OURS, [usdt])]), [OURS]);
    expect(spendableCash(wallets)).toBe("0");
  });

  it("does not count USDC on another chain", () => {
    // Arbitrum USDC is real money and belongs in the main balance. It is not
    // ready to spend, because it has not settled on Base.
    const arbitrum = wallet(
      OURS,
      [token("USDC", ONE_USDC, 6, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831")],
      { chain: "0xa4b1" as HexChainId }
    );
    const wallets = embeddedWallets(balanceOf([arbitrum]), [OURS]);
    expect(spendableCash(wallets)).toBe("0");
  });
});
