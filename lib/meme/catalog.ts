import type { MemeToken } from "@/lib/meme/types";

// Normalisation of the trade service's token lists, shared by the browser
// client and the dashboard feed on the server.

export interface Paged<T> {
  items: T[];
  meta: { page: number; limit: number; total: number };
}

// Base mainnet USDC. The trade service refuses it as a meme-token selection —
// it is the quote currency on both sides of every swap — so a card for it can
// only dead-end when tapped. The catalog lists it because the catalog is every
// indexed token, not every tradable meme coin.
export const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// /tokens/trending omits the whole risk block that /tokens returns:
// riskLevel, warnings, buyEnabled and sellEnabled are simply absent. Rendering
// one of those rows raw crashed the dashboard — RiskBadge called .charAt on a
// missing level and Next replaced the page with its unrecoverable-error
// screen. Normalising here rather than in each component keeps every consumer
// safe, per this app's rule that upstream payloads are mapped into our own
// types at the boundary.
//
// buyEnabled/sellEnabled default to TRUE deliberately. The service documents
// them as display hints and repeats every policy check when a quote is
// created, so the server still refuses a token it will not trade. Defaulting
// to false would instead make every trending coin look untradable.
export function withRiskDefaults(token: MemeToken): MemeToken {
  return {
    ...token,
    riskLevel: token.riskLevel ?? "UNKNOWN",
    warnings: token.warnings ?? [],
    buyEnabled: token.buyEnabled ?? true,
    sellEnabled: token.sellEnabled ?? true,
  };
}

export function withoutQuoteCurrency(page: Paged<MemeToken>): Paged<MemeToken> {
  const items = page.items
    .filter((t) => t.address.toLowerCase() !== BASE_USDC)
    .map(withRiskDefaults);
  return { items, meta: { ...page.meta, total: items.length } };
}
