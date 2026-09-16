"use client";

import { tradeRequest } from "@/lib/meme/api";
import type { Paged } from "@/lib/meme/catalog";
import type {
  PortfolioChain,
  PortfolioPosition,
  PortfolioPositionDetail,
  PortfolioSummary,
  TradeActivity,
  TradeActivityStatus,
} from "@/lib/meme/types";

// The trade service's portfolio, profit/loss and activity, for the user the
// bearer names. The service scopes every route by the authenticated identity,
// so no user id is ever sent from here. `/portfolio` is the canonical record
// of what was bought through the service, built from confirmed swaps only;
// `/activity` is the user-facing feed of every swap in any state.
//
// Requests go through the trade client's `tradeRequest`, which parses each
// body with a mapper loaded on demand. This module is in the first-load
// payload of /portfolio and /dashboard, and the trade hook reads its query
// keys on /meme and /spot, so it must never import lib/meme/parse or zod
// itself (lib/meme/api.first-load.test.ts holds it to that).

export type {
  PortfolioChain,
  PortfolioPosition,
  PortfolioPositionDetail,
  PortfolioSummary,
  TradeActivity,
  TradeActivityStatus,
} from "@/lib/meme/types";

/** The contract's default page for /portfolio and /activity. */
export const PORTFOLIO_PAGE_LIMIT = 50;
/** The contract's maximum page for /portfolio and /activity. */
export const PORTFOLIO_MAX_LIMIT = 100;

// Never cached by the browser: the figures are the user's money and the poll
// exists to replace them.
const UNCACHED: RequestInit = { cache: "no-store" };
const AUTH = { auth: true } as const;

function pageQuery(page: number, limit: number): URLSearchParams {
  return new URLSearchParams({
    page: String(page),
    limit: String(Math.min(Math.max(1, limit), PORTFOLIO_MAX_LIMIT)),
  });
}

/** One page of positions, open and closed, optionally on one chain. */
export function fetchPortfolio(
  page: number,
  limit: number = PORTFOLIO_PAGE_LIMIT,
  chain?: PortfolioChain
): Promise<Paged<PortfolioPosition>> {
  const query = pageQuery(page, limit);
  if (chain) query.set("chain", chain);
  return tradeRequest(`/portfolio?${query.toString()}`, "parsePortfolioPage", UNCACHED, AUTH);
}

export function fetchPortfolioSummary(): Promise<PortfolioSummary> {
  return tradeRequest("/portfolio/summary", "parsePortfolioSummary", UNCACHED, AUTH);
}

/**
 * One position with its confirmed trades. The address is one path segment,
 * sent as written: a Solana mint is case-sensitive.
 */
export function fetchPosition(
  chain: PortfolioChain,
  address: string
): Promise<PortfolioPositionDetail> {
  return tradeRequest(
    `/portfolio/${chain}/${encodeURIComponent(address)}`,
    "parsePortfolioPosition",
    UNCACHED,
    AUTH
  );
}

export interface ActivityFilters {
  chain?: PortfolioChain;
  side?: "BUY" | "SELL";
  status?: TradeActivityStatus;
}

export function fetchActivity({
  page,
  limit = PORTFOLIO_PAGE_LIMIT,
  chain,
  side,
  status,
}: ActivityFilters & { page: number; limit?: number }): Promise<Paged<TradeActivity>> {
  const query = pageQuery(page, limit);
  if (chain) query.set("chain", chain);
  if (side) query.set("side", side);
  if (status) query.set("status", status);
  return tradeRequest(`/activity?${query.toString()}`, "parseActivityPage", UNCACHED, AUTH);
}

// Every portfolio query sits under one prefix, so the trade hook invalidates
// all four with one call the moment a swap is CONFIRMED.
export const memePortfolioKeys = {
  all: ["meme", "portfolio"] as const,
  summary: () => [...memePortfolioKeys.all, "summary"] as const,
  positions: (chain?: PortfolioChain) =>
    [...memePortfolioKeys.all, "positions", chain ?? "all"] as const,
  position: (chain: PortfolioChain, address: string) =>
    [...memePortfolioKeys.all, "position", chain, address] as const,
  activity: (filters: ActivityFilters = {}) =>
    [
      ...memePortfolioKeys.all,
      "activity",
      filters.chain ?? "all",
      filters.side ?? "all",
      filters.status ?? "all",
    ] as const,
};
