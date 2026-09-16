import { signOf } from "@/lib/meme/decimal";
import type {
  MemeToken,
  PortfolioChain,
  PortfolioPosition,
  TradeActivity,
  TradeActivityStatus,
} from "@/lib/meme/types";

// Pure pieces of the Memecoins section, kept out of the components so the
// rules they carry read in one place.

/**
 * A service position as the trade sheet's token, on the position's OWN chain.
 *
 * The sheet re-reads the live listing (risk, tradability) by chainId and
 * address and previews the sale before any confirmation, so this only has to
 * identify the coin honestly. The position's mark is `currentPriceUsd`, null
 * when the providers cannot price it. It carries no buy switch: the sheet
 * opens on SELL and the quote re-checks every policy server-side.
 */
export function positionToMemeToken(position: PortfolioPosition): MemeToken {
  return {
    chainId: position.chainId,
    address: position.address,
    name: position.name,
    symbol: position.symbol,
    decimals: position.decimals,
    logoUrl: position.logoUrl,
    priceUsd: position.currentPriceUsd,
    liquidityUsd: position.liquidityUsd,
    volume24hUsd: position.volume24hUsd,
    priceChange24hPercent: position.priceChange24hPercent,
    marketCapUsd: position.marketCapUsd,
    fdvUsd: position.fdvUsd,
    pairAddress: position.pairAddress,
    dexName: position.dexName,
    riskLevel: position.riskLevel,
    buyEnabled: true,
    sellEnabled: position.sellEnabled,
    warnings: position.warnings,
  };
}

/**
 * The logo to draw for a memecoin. The service's own URL when it sent one,
 * otherwise the app's token-logo route, which looks the contract up the way
 * every other held asset's logo is found. The route's chain names match the
 * service's ("base", "solana"), and a Solana mint is passed exactly as written.
 */
export function memeLogoUrl(
  chain: PortfolioChain,
  address: string,
  serviceLogo: string | null
): string {
  return serviceLogo ?? `/api/token-logo/${chain}/${encodeURIComponent(address)}`;
}

/** The colour of a signed figure: green up, red down, neutral for zero or none. */
export function toneClass(value: string | null): string {
  const sign = signOf(value);
  if (sign === 1) return "text-up";
  if (sign === -1) return "text-down";
  return "text-white/70";
}

/**
 * The rows a positions tab shows. Open and Closed filter the loaded pages (the
 * service has no status filter on /portfolio); a chain tab shows both, open
 * first, in the server's order within each.
 */
export function positionsForTab(
  items: readonly PortfolioPosition[],
  status: PortfolioPosition["positionStatus"] | null
): PortfolioPosition[] {
  if (status) return items.filter((p) => p.positionStatus === status);
  return [
    ...items.filter((p) => p.positionStatus === "OPEN"),
    ...items.filter((p) => p.positionStatus !== "OPEN"),
  ];
}

// Submitted to the chain or waiting to be, but not confirmed: the contract
// says these never affect holdings, profit or cost basis.
const PENDING: readonly TradeActivityStatus[] = ["AWAITING_SUBMISSION", "SUBMITTED", "CONFIRMING"];

export function isPendingActivity(status: TradeActivityStatus): boolean {
  return PENDING.includes(status);
}

/**
 * The transaction worth linking for a trade: the last one, which is the swap
 * (an earlier hash is its approval). Null when the service holds no
 * transaction hash; a user-operation hash is not a transaction an explorer
 * can open.
 */
export function activityTxHash(activity: TradeActivity): string | null {
  return activity.transactionHashes.at(-1) ?? null;
}
