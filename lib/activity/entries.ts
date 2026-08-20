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

// A stablecoin movement worth less than a cent is dust: the change a
// settlement or a route hands back, not something the user did. Shown, it read
// as "Deposited USDC +0" after every withdrawal, in the feed and in the bell,
// and it counted as an arrival for the deposit analytics. Only standalone
// stablecoin movements are judged; a trade is kept whole, and other assets are
// left alone because their price is not known here.
export const DUST_STABLE_AMOUNT = 0.01;

function isDust(item: ActivityItem): boolean {
  return isStable(item.symbol) && item.amount < DUST_STABLE_AMOUNT;
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
    for (const item of group) if (!isDust(item)) entries.push(movement(item));
  }

  return pairAcrossChains(entries).sort((a, b) => b.timestamp - a.timestamp);
}

// A sale that settles on another chain cannot share a hash with its payout:
// selling SOL emits "Sent SOL" on Solana and, seconds later, "Deposited USDC"
// on Base. Two rows for one action, and the second one baffles ("who deposited
// money to me?"). Cross-chain settlement lands well inside this window.
const CROSS_CHAIN_WINDOW_MS = 3 * 60 * 1000;

// The settled leg always arrives after the leg the user sent; anything earlier
// cannot be this trade's other half. Chains stamp blocks on their own clocks,
// so a little backwards drift is tolerated.
const CROSS_CHAIN_SKEW_MS = 45 * 1000;

// Whether `into` can be the settlement of `out`: after it (allowing clock
// skew) and within the settlement window.
function settlesAfter(out: ActivityEntry, into: ActivityEntry): boolean {
  const delta = into.timestamp - out.timestamp;
  return delta >= -CROSS_CHAIN_SKEW_MS && delta <= CROSS_CHAIN_WINDOW_MS;
}

// Merge an asset leaving one chain with money arriving on another into one
// sale (and the reverse into one purchase). Deliberately strict: both legs
// must be unpaired movements on different chains inside the window, and each
// must have exactly one candidate partner. Any ambiguity leaves the rows
// alone, because a wrong merge misdescribes someone's money.
function pairAcrossChains(entries: ActivityEntry[]): ActivityEntry[] {
  const assetOut = entries.filter((e) => e.kind === "sent");
  const moneyIn = entries.filter((e) => e.kind === "deposited");
  const moneyOut = entries.filter((e) => e.kind === "withdrew");
  const assetIn = entries.filter((e) => e.kind === "received");

  const merged = new Set<string>();
  const trades: ActivityEntry[] = [];

  const tryPair = (subjects: ActivityEntry[], monies: ActivityEntry[], kind: "sold" | "bought") => {
    // On a sale the asset leaves first and the money settles after; on a
    // purchase the money leaves first. Order matters: a deposit that landed
    // before a sale cannot be that sale's payout, and dropping it from the
    // candidates is what lets a busy feed still pair unambiguously.
    const fits = (subject: ActivityEntry, money: ActivityEntry) =>
      kind === "sold" ? settlesAfter(subject, money) : settlesAfter(money, subject);
    for (const subject of subjects) {
      if (merged.has(subject.id)) continue;
      const candidates = monies.filter(
        (m) => !merged.has(m.id) && m.network !== subject.network && fits(subject, m)
      );
      if (candidates.length !== 1) continue;
      const money = candidates[0];
      const rivalSubjects = subjects.filter(
        (s) => !merged.has(s.id) && s.network !== money.network && fits(s, money)
      );
      if (rivalSubjects.length !== 1) continue;
      merged.add(subject.id);
      merged.add(money.id);
      trades.push({
        id: `${subject.id}+${money.id}`,
        hash: subject.hash,
        network: subject.network,
        timestamp: Math.max(subject.timestamp, money.timestamp),
        kind,
        symbol: subject.symbol,
        amount: subject.amount,
        direction: subject.direction,
        counterSymbol: money.symbol,
        counterAmount: money.amount,
        counterparty: null,
        logo: subject.logo,
      });
    }
  };

  tryPair(assetOut, moneyIn, "sold");
  tryPair(assetIn, moneyOut, "bought");

  if (merged.size === 0) return entries;
  return [...entries.filter((e) => !merged.has(e.id)), ...trades];
}
