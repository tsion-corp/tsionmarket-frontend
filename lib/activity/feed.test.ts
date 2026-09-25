import { describe, expect, it } from "vitest";
import type { ActivityEntry, ActivityKind } from "@/lib/activity/entries";
import {
  decimalFromNumber,
  explorerTxHref,
  fromChainEntry,
  toneFor,
  type ActivityProduct,
  type ActivityStatus,
  type ActivityTone,
} from "@/lib/activity/feed";

function entry(over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "e1",
    hash: "0xabc",
    network: "base-mainnet",
    timestamp: 1_757_419_080_000,
    kind: "deposited",
    symbol: "USDC",
    amount: 250,
    direction: "in",
    counterparty: null,
    logo: null,
    ...over,
  };
}

// A Record over the union, so adding an ActivityKind without deciding its
// product fails the typecheck rather than quietly landing under a default.
const PRODUCT: Record<ActivityKind, ActivityProduct> = {
  bought: "trade",
  sold: "trade",
  swapped: "trade",
  deposited: "deposit",
  withdrew: "withdrawal",
  moved: "transfer",
  received: "transfer",
  sent: "transfer",
  entered_game: "arkade",
  claimed_winnings: "arkade",
  prediction_buy: "predictions",
  prediction_payout: "predictions",
  perp_margin: "perps",
  perp_return: "perps",
  bought_kash: "rewards",
  arkade_deposit: "arkade",
  arkade_withdraw: "arkade",
  won_chess: "arkade",
  lost_chess: "arkade",
  drew_chess: "arkade",
  won_checkers: "arkade",
  lost_checkers: "arkade",
  drew_checkers: "arkade",
  arkball_ticket: "arkade",
  arkball_won: "arkade",
};

const EVERY_KIND = Object.keys(PRODUCT) as ActivityKind[];

describe("fromChainEntry", () => {
  it("titles every kind with the kind as its own message key", () => {
    // ActivityRow renders t(kind, { symbol }); the thirty-odd kind strings are
    // literally the keys under `activity` in messages/*.json. The adapter must
    // hand over that key, not new copy.
    for (const kind of EVERY_KIND) {
      const item = fromChainEntry(entry({ kind, symbol: "GLDX" }));
      expect(item.title).toEqual({ type: "message", key: kind, values: { symbol: "GLDX" } });
    }
  });

  it("names a stablecoin USD in the title, the way the row always has", () => {
    expect(fromChainEntry(entry({ kind: "deposited", symbol: "USDC" })).title).toEqual({
      type: "message",
      key: "deposited",
      values: { symbol: "USD" },
    });
  });

  it("uses the display alias for a token title and amount", () => {
    const item = fromChainEntry(entry({ kind: "received", symbol: "cbBTC", amount: 0.5 }));
    expect(item.title).toEqual({
      type: "message",
      key: "received",
      values: { symbol: "BTC" },
    });
    expect(item.amount.symbol).toBe("BTC");
  });

  it("gives every kind a product", () => {
    for (const kind of EVERY_KIND) {
      expect(fromChainEntry(entry({ kind })).product).toBe(PRODUCT[kind]);
    }
  });

  it("settles every on-chain kind as completed", () => {
    const onChainKinds = EVERY_KIND.filter((k) => !k.includes("chess"))
      .filter((k) => !k.includes("checkers"))
      .filter((k) => !k.startsWith("arkball"));
    for (const kind of onChainKinds) {
      expect(fromChainEntry(entry({ kind })).status).toBe("completed");
    }
  });

  it("reads a settled game's outcome", () => {
    const outcomes: [ActivityKind, ActivityStatus][] = [
      ["won_chess", "won"],
      ["won_checkers", "won"],
      ["arkball_won", "won"],
      ["lost_chess", "lost"],
      ["lost_checkers", "lost"],
      ["drew_chess", "completed"],
      ["drew_checkers", "completed"],
      // A ticket that has not won covers both a loser and a ticket still in
      // play, and the entry does not say which, so it is not "Awaiting Results".
      ["arkball_ticket", "completed"],
    ];
    for (const [kind, status] of outcomes) {
      expect(fromChainEntry(entry({ kind, network: "arkade" })).status).toBe(status);
    }
  });

  it("signs the amount by direction and never as a float", () => {
    const out = fromChainEntry(entry({ direction: "out", amount: 250 }));
    expect(out.amount).toEqual({ value: "-250", symbol: "USDC", signed: true });
    const into = fromChainEntry(entry({ direction: "in", amount: 250 }));
    expect(into.amount.value).toBe("250");
    expect(typeof into.amount.value).toBe("string");
  });

  it("leaves a zero amount unsigned in text", () => {
    const draw = fromChainEntry(entry({ kind: "drew_chess", network: "arkade", amount: 0 }));
    expect(draw.amount.value).toBe("0");
  });

  it("captions a trade with what the other leg was worth", () => {
    const bought = fromChainEntry(
      entry({
        kind: "bought",
        symbol: "GLDX",
        amount: 3,
        direction: "in",
        counterSymbol: "USDC",
        counterAmount: 750,
      })
    );
    expect(bought.caption).toEqual({
      label: { type: "message", key: "captions.paid", values: { amount: "750 USDC" } },
    });

    const sold = fromChainEntry(
      entry({
        kind: "sold",
        symbol: "GLDX",
        amount: 3,
        direction: "out",
        counterSymbol: "USDC",
        counterAmount: 750,
      })
    );
    expect(sold.caption).toEqual({
      label: { type: "message", key: "captions.received", values: { amount: "750 USDC" } },
    });
  });

  it("falls back to the direction for a plain movement", () => {
    expect(fromChainEntry(entry({ kind: "deposited", direction: "in" })).caption.label).toEqual({
      type: "message",
      key: "captions.amountReceived",
    });
    expect(fromChainEntry(entry({ kind: "withdrew", direction: "out" })).caption.label).toEqual({
      type: "message",
      key: "captions.amountSent",
    });
  });

  it("captions a committed stake rather than calling it an amount sent", () => {
    const staked: ActivityKind[] = [
      "entered_game",
      "prediction_buy",
      "perp_margin",
      "arkball_ticket",
      "lost_chess",
      "lost_checkers",
    ];
    for (const kind of staked) {
      expect(fromChainEntry(entry({ kind, direction: "out" })).caption.label).toEqual({
        type: "message",
        key: "captions.stakeCommitted",
      });
    }
  });

  it("captions a draw with the refund copy that already ships", () => {
    for (const kind of ["drew_chess", "drew_checkers"] as ActivityKind[]) {
      expect(fromChainEntry(entry({ kind, amount: 0 })).caption.label).toEqual({
        type: "message",
        key: "refunded",
      });
    }
  });

  it("captions KASH+ as reward points", () => {
    expect(fromChainEntry(entry({ kind: "bought_kash", symbol: "KASH+" })).caption.label).toEqual({
      type: "message",
      key: "captions.rewardPoints",
    });
  });

  it("carries the transaction for a transfer and the match for a game", () => {
    const transfer = fromChainEntry(entry({ network: "eth-mainnet", hash: "0xfeed" }));
    expect(transfer.onChain).toEqual({ network: "eth-mainnet", hash: "0xfeed" });
    expect(transfer.game).toBeUndefined();

    const match = fromChainEntry(
      entry({ kind: "won_chess", network: "arkade", hash: "match-7", direction: "in" })
    );
    expect(match.game).toEqual({ game: "chess", matchId: "match-7" });
    expect(match.onChain).toBeUndefined();
  });

  it("names the counterparty as an opponent on a game and an address elsewhere", () => {
    const game = fromChainEntry(
      entry({
        kind: "lost_checkers",
        network: "arkade",
        counterparty: "0x1234567890abcdef1234567890abcdef12345678",
      })
    );
    expect(game.subtitle).toEqual({
      type: "message",
      key: "subtitles.versus",
      values: { opponent: "0x1234…5678" },
    });

    const sent = fromChainEntry(
      entry({
        kind: "sent",
        direction: "out",
        counterparty: "0x1234567890abcdef1234567890abcdef12345678",
      })
    );
    expect(sent.subtitle).toEqual({
      type: "message",
      key: "subtitles.to",
      values: { address: "0x1234…5678" },
    });

    expect(fromChainEntry(entry({ counterparty: null })).subtitle).toBeUndefined();
  });

  it("keeps the entry id and timestamp", () => {
    const item = fromChainEntry(entry({ id: "tx:1", timestamp: 1_757_419_080_000 }));
    expect(item.id).toBe("tx:1");
    expect(item.occurredAt).toBe(1_757_419_080_000);
  });
});

describe("toneFor", () => {
  it("dresses each status in the chip's vocabulary", () => {
    const tones: Record<ActivityStatus, ActivityTone> = {
      won: "win",
      lost: "loss",
      live: "live",
      processing: "pending",
      awaitingResults: "pending",
      completed: "done",
      earned: "done",
      failed: "loss",
    };
    for (const [status, tone] of Object.entries(tones)) {
      expect(toneFor(status as ActivityStatus)).toBe(tone);
    }
  });
});

describe("explorerTxHref", () => {
  it("builds a link per chain", () => {
    expect(explorerTxHref({ network: "base-mainnet", hash: "0xabc" })).toBe(
      "https://basescan.org/tx/0xabc"
    );
    expect(explorerTxHref({ network: "solana-mainnet", hash: "5eYk" })).toBe(
      "https://solscan.io/tx/5eYk"
    );
  });

  it("has no link for an off-chain event or an unknown chain", () => {
    expect(explorerTxHref(undefined)).toBeUndefined();
    expect(explorerTxHref({ network: "arkade", hash: "match-7" })).toBeUndefined();
    expect(explorerTxHref({ network: "base-mainnet", hash: "" })).toBeUndefined();
  });
});

describe("decimalFromNumber", () => {
  it("keeps a plain decimal as it is", () => {
    expect(decimalFromNumber(250)).toBe("250");
    expect(decimalFromNumber(0.5)).toBe("0.5");
    expect(decimalFromNumber(0)).toBe("0");
  });

  it("expands an exponent instead of rounding it away", () => {
    // String(1e-7) is "1e-7", which every decimal parser in the repo rejects.
    expect(decimalFromNumber(1e-7)).toBe("0.0000001");
    expect(decimalFromNumber(1.751e-16)).toBe("0.0000000000000001751");
    expect(decimalFromNumber(-2.5e-7)).toBe("-0.00000025");
    expect(decimalFromNumber(1.5e21)).toBe("1500000000000000000000");
    expect(decimalFromNumber(1.2345e2)).toBe("123.45");
  });

  it("gives a readable zero for a figure that is not a number", () => {
    expect(decimalFromNumber(Number.NaN)).toBe("0");
    expect(decimalFromNumber(Number.POSITIVE_INFINITY)).toBe("0");
  });
});

describe("fromChainEntry icon", () => {
  it("carries the feed's own logo, so a token with no built-in mark keeps its art", () => {
    // ActivityEntry.logo is the only art a memecoin has: AssetIcon ships marks
    // for the majors and nothing for the long tail, which is most of this feed.
    const item = fromChainEntry(
      entry({ kind: "bought", symbol: "PEPE", logo: "https://cdn/pepe.png" })
    );
    expect(item.icon).toEqual({ symbol: "PEPE", logo: "https://cdn/pepe.png" });
  });

  it("shows the KASH+ coin for a KASH+ buy while the amount stays the USDC paid", () => {
    // The transfer is USDC leaving for the treasury, so the figure is USDC and
    // relabelling it "KASH+" would misstate it. Only the icon reads as the
    // thing bought, which is what the row it replaces did.
    const item = fromChainEntry(entry({ kind: "bought_kash", symbol: "USDC", direction: "out" }));
    expect(item.icon).toEqual({ symbol: "KASH+", logo: "/kash/kash-plus-coin.png" });
    expect(item.amount.symbol).toBe("USDC");
  });

  it("reads a stablecoin as its own ticker, not as USD", () => {
    // The title says "Deposited USD"; the coin is still a USDC coin.
    expect(fromChainEntry(entry({ symbol: "USDC" })).icon.symbol).toBe("USDC");
  });
});
