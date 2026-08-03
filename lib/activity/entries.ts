// Turns raw transfers into what the user actually did. A transfer on its own
// only knows a direction, so the list read "Sent USDC / Received GLDx" for what
// was one purchase — two rows, neither of which named the action.
//
// Transfers that share a transaction are one action: spending a stablecoin and
// receiving something else is a buy, the reverse is a sell. A transfer with no
// partner is a plain movement, and a stablecoin moving on its own is what most
// people call a deposit or a withdrawal.
//
// Pure: no framework, no network, so every branch here is unit tested.

import type { ActivityDirection, ActivityItem } from "@/lib/server/activity";

export type ActivityKind =
  "bought" | "sold" | "swapped" | "deposited" | "withdrew" | "moved" | "received" | "sent";

export interface ActivityEntry {
  id: string;
  hash: string;
  network: string;
  timestamp: number;
  kind: ActivityKind;
  // The asset the row is about: what was bought, sold, or moved.
  symbol: string;
  amount: number;
  // Whether that asset came in or went out, for the sign and the colour.
  direction: ActivityDirection;
  // The other side of a trade — what it cost, or what it fetched.
  counterSymbol?: string;
  counterAmount?: number;
  counterparty: string | null;
  logo: string | null;
}

// Contracts that are a route, not a destination. Money sent into one is the
// user moving their own funds between chains — calling that a withdrawal reads
// as if it left the platform. Verified from the calldata of our own funding
// legs, not guessed.
const ROUTERS = new Set(["0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae"]);

function isRouter(address: string | null): boolean {
  return address != null && ROUTERS.has(address.toLowerCase());
}

// Stablecoins read as money rather than as an asset, which is what separates
// "bought GLDx" from "swapped ETH for GLDx".
const STABLES = new Set(["USDC", "USDT", "USDC.E", "DAI", "PYUSD", "USDG", "USDS"]);

export function isStable(symbol: string): boolean {
  return STABLES.has(symbol.toUpperCase());
}

// The transfer that best represents its side of a trade: the largest by value
// we can see. A swap can emit several hops of the same asset; the biggest is
// the one the user meant.
function principal(items: ActivityItem[]): ActivityItem {
  return items.reduce((best, item) => (item.amount > best.amount ? item : best));
}

function movement(item: ActivityItem): ActivityEntry {
  const stable = isStable(item.symbol);
  const kind: ActivityKind = isRouter(item.counterparty)
    ? "moved"
    : item.direction === "in"
      ? stable
        ? "deposited"
        : "received"
      : stable
        ? "withdrew"
        : "sent";
  return {
    id: item.id,
    hash: item.hash,
    network: item.network,
    timestamp: item.timestamp,
    kind,
    symbol: item.symbol,
    amount: item.amount,
    direction: item.direction,
    counterparty: item.counterparty,
    logo: item.logo,
  };
}

function trade(outgoing: ActivityItem, incoming: ActivityItem): ActivityEntry {
  const paidWithMoney = isStable(outgoing.symbol) && !isStable(incoming.symbol);
  const soldForMoney = isStable(incoming.symbol) && !isStable(outgoing.symbol);
  // A buy is described by what you got; a sell by what you gave up. Either way
  // the row names the asset, not the money.
  const subject = soldForMoney ? outgoing : incoming;
  const counter = soldForMoney ? incoming : outgoing;
  return {
    id: `${outgoing.hash}:trade`,
    hash: outgoing.hash,
    network: outgoing.network,
    timestamp: Math.max(outgoing.timestamp, incoming.timestamp),
    kind: paidWithMoney ? "bought" : soldForMoney ? "sold" : "swapped",
    symbol: subject.symbol,
    amount: subject.amount,
    direction: subject.direction,
    counterSymbol: counter.symbol,
    counterAmount: counter.amount,
    counterparty: null,
    logo: subject.logo,
  };
}

// One entry per action, newest first. Transfers are grouped by transaction on
// the chain they happened on, so a hash colliding across chains cannot merge
// two unrelated actions into one.
export function buildActivityEntries(items: ActivityItem[]): ActivityEntry[] {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const key = `${item.network}:${item.hash}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const entries: ActivityEntry[] = [];
  for (const group of groups.values()) {
    const outs = group.filter((i) => i.direction === "out");
    const ins = group.filter((i) => i.direction === "in");
    // Both sides present, and genuinely different assets: one action, not two.
    if (outs.length > 0 && ins.length > 0) {
      const out = principal(outs);
      const into = principal(ins);
      if (out.symbol.toUpperCase() !== into.symbol.toUpperCase()) {
        entries.push(trade(out, into));
        continue;
      }
    }
    for (const item of group) entries.push(movement(item));
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp);
}
