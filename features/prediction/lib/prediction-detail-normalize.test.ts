import { describe, expect, it } from "vitest";
import {
  normalizeActivityPage,
  normalizeComments,
  normalizeGroup,
  normalizeHolders,
  normalizeQuote,
} from "@/features/prediction/lib/normalize";
import { commentMessage, likeMessage } from "@/features/prediction/lib/comment-signing";
import { PRICE_SCALE } from "@/features/prediction/lib/types";

// Normalizers + comment-signing parity for the Polymarket-style detail surfaces.
// The signing messages MUST match the backend CommentService strings exactly or
// signatures won't verify — pinned here as a regression guard.

describe("normalizeGroup", () => {
  it("maps an event with outcomes and derives priceNo", () => {
    const g = normalizeGroup({
      id: "g1",
      slug: "french-election",
      title: "Next French Presidential Election",
      category: "politics",
      description: null,
      rules: null,
      resolutionSource: null,
      imageUrl: null,
      closeTime: 1800000000,
      status: "Open",
      volumeUsdc: "350",
      outcomeCount: 1,
      outcomes: [
        {
          memberId: "m1",
          marketId: "1",
          label: "Marine Le Pen",
          imageUrl: null,
          status: "Open",
          outcome: "Unresolved",
          priceYes: 304000,
          normalizedYes: 304000,
          volumeUsdc: "100",
          closeTime: 1800000000,
        },
      ],
    });
    expect(g.title).toContain("French");
    expect(g.outcomes[0].priceNo).toBe(PRICE_SCALE - 304000n);
    expect(g.volumeUsdc).toBe(350n);
  });

  it("tolerates a Pending outcome whose market is not indexed", () => {
    const g = normalizeGroup({
      id: "g1",
      slug: "s",
      title: "T",
      volumeUsdc: "0",
      outcomes: [
        {
          memberId: "m",
          marketId: "9",
          label: "X",
          imageUrl: null,
          status: "Pending",
          outcome: "Unresolved",
          priceYes: 0,
          normalizedYes: 0,
          volumeUsdc: "0",
          closeTime: 0,
        },
      ],
    });
    expect(g.outcomes[0].status).toBe("Pending");
  });
});

describe("normalizeHolders", () => {
  it("maps holders and skips malformed rows", () => {
    const rows = normalizeHolders([
      { holder: "0xabc", shares: "5000000", costUsdc: "2500000", marketId: "1" },
      { holder: "0xdef", shares: "not-a-number", costUsdc: "0", marketId: "1" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].shares).toBe(5_000_000n);
  });
});

describe("normalizeActivityPage", () => {
  it("maps items + cursor and coerces ISO time", () => {
    const page = normalizeActivityPage({
      items: [
        {
          id: "a1",
          txHash: "0x1",
          kind: "trade",
          marketId: "1",
          actor: "0xabc",
          side: "yes",
          buy: true,
          usdcAmount: "1742000000",
          shareAmount: "5000000",
          priceYes: 305000,
          block: "100",
          at: "2026-08-02T10:00:00.000Z",
        },
      ],
      nextCursor: "100:0",
    });
    expect(page.items[0].kind).toBe("trade");
    expect(page.items[0].usdcAmount).toBe(1_742_000_000n);
    expect(page.nextCursor).toBe("100:0");
  });
});

describe("normalizeComments", () => {
  it("maps a comment", () => {
    const [c] = normalizeComments([
      {
        id: "c1",
        wallet: "0xabc",
        body: "gm",
        parentId: null,
        likeCount: 3,
        deleted: false,
        at: "2026-08-02T10:00:00.000Z",
      },
    ]);
    expect(c.body).toBe("gm");
    expect(c.likeCount).toBe(3);
  });
});

describe("normalizeQuote", () => {
  it("maps a buy quote with negative price impact allowed", () => {
    const q = normalizeQuote({
      kind: "buy",
      side: "yes",
      sharesOut: "1500000",
      avgPriceCents: 66.67,
      priceYesBefore: 500000,
      priceYesAfter: 800000,
      priceImpactBps: 6000,
    });
    expect(q.sharesOut).toBe(1_500_000n);
    expect(q.priceImpactBps).toBe(6000);
  });
});

describe("comment-signing parity", () => {
  // These strings are duplicated in the backend CommentService — keep in sync.
  it("builds the exact comment message", () => {
    expect(commentMessage({ scope: "group", scopeId: "g1", body: "hello", timestamp: 123 })).toBe(
      "World Street — post comment\nscope: group:g1\nbody: hello\nts: 123"
    );
  });
  it("builds the exact like message", () => {
    expect(likeMessage("c1", 123)).toBe("World Street — like comment\nid: c1\nts: 123");
  });
});
