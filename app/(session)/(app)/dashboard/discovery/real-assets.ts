"use client";

import { useMemo } from "react";
import { useDashboardFeed } from "@/hooks/use-dashboard-feed";
import type { RwaBriefRow } from "@/lib/dashboard-feed";
import type { RwaSpot } from "@/features/discovery/types";
import { formatUsd } from "@/lib/trade/math";

// Adapter between the dashboard feed's real-asset rows and the "Own the Real
// World" cards.
//
// Discovery may not import the real-assets feature, and the dashboard must not
// mount the desk's own registry poll, so the cards are fed from the feed the
// page already loads for everyone. Every figure is formatted here: the cards
// render strings and a colour flag, nothing else.

/** Where every card leads. The desk is the only place these trade. */
const RWA_DESK = "/rwa";

// The registry's categories, grouped as the four cards see them. Funds and
// cash equivalents are treasuries to a reader: they are the same short-dated
// government paper under a different wrapper.
export const RWA_CARD_CATEGORIES = {
  gold: ["commodity"],
  treasuries: ["treasury", "fund", "cash-equivalent"],
  realEstate: ["real-estate"],
  stocks: ["equity"],
} as const;

export type RwaCardId = keyof typeof RWA_CARD_CATEGORIES;

export interface RwaSpots {
  gold: RwaSpot[];
  treasuries: RwaSpot[];
  realEstate: RwaSpot[];
  stocks: RwaSpot[];
}

const NO_SPOTS: RwaSpots = Object.freeze({
  gold: [],
  treasuries: [],
  realEstate: [],
  stocks: [],
}) as RwaSpots;

function formatChange(pct: number): { change: string; up: boolean } {
  const rounded = Number(pct.toFixed(2));
  const up = rounded >= 0;
  return { change: `${up ? "+" : "-"}${Math.abs(rounded).toFixed(2)}%`, up };
}

/** Basis points as the percentage a reader sees: 376 is "3.76%". */
export function formatApy(bps: number | null): string | null {
  if (bps === null || !Number.isFinite(bps) || bps <= 0) return null;
  return `${(bps / 100).toFixed(2)}%`;
}

function toSpot(row: RwaBriefRow): RwaSpot {
  const move = row.change24h === null ? null : formatChange(row.change24h);
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    issuer: row.issuer,
    category: row.category ?? "other",
    price: row.priceUsd === null ? null : formatUsd(row.priceUsd),
    change: move?.change ?? null,
    up: move?.up ?? true,
    apy: formatApy(row.apyBps),
    logo: row.logo || null,
    href: RWA_DESK,
  };
}

/**
 * The feed's real assets, grouped for the four cards.
 *
 * Gold and real estate lead with the assets that carry a live price, since
 * the card shows one; treasuries lead with the highest published yield, since
 * that card shows the yield; stocks keep the registry's order and the card
 * rotates through them. Nothing is invented: a group with no priced asset
 * still lists its assets, and the card shows the ones it has without a figure.
 */
export function groupRwaSpots(rows: readonly RwaBriefRow[]): RwaSpots {
  const spots = rows.map(toSpot);
  const of = (categories: readonly string[]) =>
    spots.filter((s) => categories.includes(s.category));
  const pricedFirst = (list: RwaSpot[]) =>
    [...list].sort((a, b) => Number(b.price !== null) - Number(a.price !== null));
  const yieldFirst = (list: RwaSpot[]) =>
    [...list].sort(
      (a, b) => Number(b.apy !== null) - Number(a.apy !== null) || apyValue(b) - apyValue(a)
    );
  return {
    gold: pricedFirst(of(RWA_CARD_CATEGORIES.gold)),
    treasuries: yieldFirst(of(RWA_CARD_CATEGORIES.treasuries)),
    realEstate: pricedFirst(of(RWA_CARD_CATEGORIES.realEstate)),
    stocks: of(RWA_CARD_CATEGORIES.stocks),
  };
}

function apyValue(spot: RwaSpot): number {
  return spot.apy === null ? -1 : Number.parseFloat(spot.apy);
}

/** The feed's real assets as the four cards want them; empty groups while the feed has none. */
export function useRwaSpots(): RwaSpots {
  const rows = useDashboardFeed().data?.rwa ?? null;
  return useMemo(() => (rows && rows.length > 0 ? groupRwaSpots(rows) : NO_SPOTS), [rows]);
}
