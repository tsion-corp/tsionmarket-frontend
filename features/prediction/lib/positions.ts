// Pure presentation logic for a prediction "bet slip": the detail view of an
// open position. Polymarket position fields are read defensively (they arrive as
// strings or numbers, and the SDK schema can change), so every field is optional
// and coerced. No framework imports, so this is unit tested.

// The subset of a Polymarket position the slip reads. Every field is optional
// and nullable: the SDK types many of them as `string | null` and the values
// arrive as strings or numbers, so the coercers below tolerate all of it.
type Str = string | null | undefined;
type Num = string | number | null | undefined;

export interface RawPosition {
  title?: Str;
  outcome?: Str;
  size?: Num;
  avgPrice?: Num;
  curPrice?: Num;
  initialValue?: Num;
  currentValue?: Num;
  cashPnl?: Num;
  percentPnl?: Num;
  redeemable?: boolean | null;
  conditionId?: Str;
  // CLOB token of the held outcome (the SDK normalizes the raw `asset` field
  // to this). Needed to sell the position back to the market.
  tokenId?: Str;
  endDate?: Str;
  icon?: Str;
}

export interface BetSlip {
  market: string;
  outcome: string;
  // Shares held. Each winning share settles at $1, so this is also the payout if
  // the position wins.
  shares: number;
  // Average price paid per share, 0..1 (a probability, shown as cents).
  avgPrice: number;
  // Dollars staked to open the position.
  staked: number;
  // What the position is worth now.
  currentValue: number;
  // Payout if this outcome wins (shares x $1).
  payoutIfWins: number;
  // Profit or loss so far, in dollars, and as a percent of the stake.
  pnl: number;
  pnlPct: number;
  redeemable: boolean;
  conditionId: string | null;
  tokenId: string | null;
  // Market resolution date as an ISO string, when known.
  resolvesAt: string | null;
  icon: string | null;
}

function num(v: string | number | undefined | null): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

// Derive the slip figures from a raw position. Prefers the provider's own
// initial/current/pnl values and falls back to deriving them from shares and
// prices, so a slip renders even when only part of the data is present.
export function betSlip(raw: RawPosition): BetSlip {
  const shares = num(raw.size);
  const avgPrice = num(raw.avgPrice);
  const curPrice = num(raw.curPrice);

  const staked = num(raw.initialValue) || shares * avgPrice;
  const currentValue = num(raw.currentValue) || shares * curPrice;
  const payoutIfWins = shares;

  const pnl = raw.cashPnl != null ? num(raw.cashPnl) : currentValue - staked;
  const pnlPct =
    raw.percentPnl != null ? num(raw.percentPnl) : staked > 0 ? (pnl / staked) * 100 : 0;

  return {
    market: raw.title?.trim() || "Market",
    outcome: raw.outcome?.trim() || "—",
    shares,
    avgPrice,
    staked,
    currentValue,
    payoutIfWins,
    pnl,
    pnlPct,
    redeemable: raw.redeemable === true,
    conditionId: raw.conditionId ?? null,
    tokenId: raw.tokenId ?? null,
    resolvesAt: raw.endDate ?? null,
    icon: raw.icon ?? null,
  };
}

// Whether a position can be sold back to the market before resolution: the
// market is still live (not redeemable), there are shares to sell, and we
// know which CLOB token to sell.
export function isCashoutable(
  redeemable: boolean | null | undefined,
  shares: number,
  tokenId: string | null
): boolean {
  return redeemable !== true && shares > 0 && tokenId != null && tokenId !== "";
}

// The lowest fill price a market SELL accepts, from the estimated crossing
// price: a small tolerance below the estimate so a normal book move between
// estimate and placement still fills, but the shares are never dumped far
// under it. The tick must come from the market: low-probability outcomes can
// trade below one cent on 0.001 or 0.0001 ticks.
const SELL_SLIPPAGE = 0.03;

export function sellFloorPrice(estimate: number, marketTick = 0.01): number {
  const tick = Number.isFinite(marketTick) && marketTick > 0 ? marketTick : 0.01;
  const flooredTicks = Math.floor((estimate * (1 - SELL_SLIPPAGE)) / tick);
  const floor = Math.max(tick, flooredTicks * tick);
  return Number(Math.min(floor, 1 - tick).toFixed(6));
}

// Whether a position actually has winnings to claim. A market resolving marks
// BOTH sides `redeemable`, but the losing side settles to $0, so redeeming it
// adds nothing. Only offer a claim when the held tokens still have value.
export function isClaimable(redeemable: boolean | null | undefined, currentValue: number): boolean {
  return redeemable === true && currentValue > 0.01;
}

// A share price of 0..1 shown as whole cents, e.g. 0.68 -> "68¢".
export function priceCents(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "—";
  return `${Math.round(price * 100)}¢`;
}

// A dollar figure, always two decimals: 12.5 -> "$12.50". Negative values keep
// the sign inside: -3 -> "-$3.00".
export function formatMoney(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

// A signed P&L amount for display, e.g. "+$4.20" or "-$1.10".
export function formatSignedMoney(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  return `${v >= 0 ? "+" : "-"}$${Math.abs(v).toFixed(2)}`;
}

// The market resolution date as a short, human date. Empty string when unknown
// or unparseable, so the caller can hide the row.
export function formatResolveDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// The resolution status row for a bet slip, or null when there's nothing useful
// to show. Three honest states, because a market's scheduled endDate can lie in
// the past while it's still open and unsettled:
//   - redeemable: the market resolved and the win can be claimed.
//   - scheduled date passed but not yet redeemable: the outcome is pending, so
//     show "Awaiting result" rather than a stale past date.
//   - scheduled date still ahead: show the expected date.
// `now` is injectable for deterministic tests.
export function resolutionInfo(
  redeemable: boolean,
  iso: string | null,
  now: number = Date.now(),
  claimable = false
): { k: string; v: string } | null {
  // Redeemable means the market resolved. If it isn't claimable, the held side
  // lost, so say that rather than a bare "Resolved".
  if (redeemable) return { k: "Status", v: claimable ? "Resolved · you won" : "Resolved · no win" };
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isFinite(t) && t < now) return { k: "Status", v: "Awaiting result" };
  const date = formatResolveDate(iso);
  return date ? { k: "Est. resolution", v: date } : null;
}
