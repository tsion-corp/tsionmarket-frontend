// Pure logic for the prediction-market realtime stream (ws-gateway). The gateway
// pushes per-market frames on the topic `prediction:market:<marketId>`. These
// helpers build the subscribe topics and narrow incoming frames into a typed
// union so the hook that owns the socket never touches raw JSON. Malformed frames
// are dropped silently: a stream glitch must never take the UI down, REST polling
// keeps the market alive.

import type { Outcome, Side } from "@/lib/prediction/types";

export function marketTopic(marketId: bigint | string): string {
  return `prediction:market:${marketId}`;
}

export function subscribeMessage(marketIds: readonly (bigint | string)[]): string {
  return JSON.stringify({ type: "subscribe", topics: marketIds.map(marketTopic) });
}

export const PING_MESSAGE = JSON.stringify({ type: "ping" });

// Keepalive and reconnect cadence, matching the perp stream.
export const STREAM_PING_MS = 25_000;
export const STREAM_RECONNECT_MS = 2_000;
export const STREAM_FRESH_MS = 10_000;

export type MarketFrame =
  | { type: "created"; closeTime: number; feeBps: number }
  | {
      type: "trade";
      trader: string;
      buy: boolean;
      side: Side;
      usdcAmount: bigint;
      shareAmount: bigint;
      rYes: bigint;
      rNo: bigint;
    }
  | { type: "liquidity"; rYes: bigint; rNo: bigint }
  | { type: "closed" }
  | { type: "resolved"; outcome: Outcome }
  | { type: "invalidated" }
  | { type: "redeemed"; holder: string; payout: bigint }
  | {
      type: "comment";
      id: string;
      wallet: string;
      body: string;
      parentId: string | null;
      likeCount: number;
      deleted: boolean;
      at: number;
    };

// A non-negative integer string/number to bigint, or null if malformed.
function big(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function side(value: unknown): Side | null {
  return value === "yes" || value === "no" ? value : null;
}

// Parses one incoming frame; returns the typed frame or null for anything else
// (welcome, subscribed, pong, malformed).
export function parseMarketFrame(raw: unknown): MarketFrame | null {
  if (typeof raw !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (msg == null || typeof msg !== "object") return null;
  const { type, data } = msg as { type?: unknown; data?: unknown };
  const d = (data ?? {}) as Record<string, unknown>;

  switch (type) {
    case "created": {
      const closeTime = big(d.closeTime);
      const feeBps = big(d.feeBps);
      if (closeTime == null || feeBps == null) return null;
      return { type: "created", closeTime: Number(closeTime), feeBps: Number(feeBps) };
    }
    case "trade": {
      const s = side(d.side);
      const usdcAmount = big(d.usdcAmount);
      const shareAmount = big(d.shareAmount);
      const rYes = big(d.rYes);
      const rNo = big(d.rNo);
      if (s == null || usdcAmount == null || shareAmount == null || rYes == null || rNo == null) {
        return null;
      }
      return {
        type: "trade",
        trader: typeof d.trader === "string" ? d.trader : "",
        buy: Boolean(d.buy),
        side: s,
        usdcAmount,
        shareAmount,
        rYes,
        rNo,
      };
    }
    case "liquidity": {
      const rYes = big(d.rYes);
      const rNo = big(d.rNo);
      if (rYes == null || rNo == null) return null;
      return { type: "liquidity", rYes, rNo };
    }
    case "closed":
      return { type: "closed" };
    case "resolved": {
      const outcome = d.outcome;
      if (outcome !== "Yes" && outcome !== "No" && outcome !== "Unresolved") return null;
      return { type: "resolved", outcome };
    }
    case "invalidated":
      return { type: "invalidated" };
    case "redeemed": {
      const payout = big(d.payout);
      if (payout == null) return null;
      return { type: "redeemed", holder: typeof d.holder === "string" ? d.holder : "", payout };
    }
    case "comment": {
      if (typeof d.id !== "string" || typeof d.body !== "string") return null;
      return {
        type: "comment",
        id: d.id,
        wallet: typeof d.wallet === "string" ? d.wallet : "",
        body: d.body,
        parentId: typeof d.parentId === "string" ? d.parentId : null,
        likeCount: typeof d.likeCount === "number" ? d.likeCount : 0,
        deleted: Boolean(d.deleted),
        at: typeof d.at === "number" ? d.at : Date.parse(String(d.at ?? "")) || 0,
      };
    }
    default:
      return null;
  }
}
