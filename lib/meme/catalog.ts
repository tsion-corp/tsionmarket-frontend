import type { MemeToken } from "@/lib/meme/types";
import { BASE_CHAIN_ID, isQuoteCurrency, isSupportedChain } from "@/lib/meme/chain";

// Normalisation of the trade service's token lists, shared by the browser
// client and the dashboard feed on the server.

export interface Paged<T> {
  items: T[];
  meta: { page: number; limit: number; total: number };
}

// Wrapped majors the catalog lists among the memecoins. cbBTC is Bitcoin in a
// Base wrapper: a wrapper worth billions between two joke coins makes the whole
// list read as unfiltered, and it already has a home on the spot desk.
//
// A list here is a stopgap. What belongs on a memecoin surface is a judgement
// the trade service should make and return, the way it returns a risk
// assessment; until it does, each new wrapper is added here by hand.
const WRAPPED_MAJORS: Record<number, Set<string>> = {
  [BASE_CHAIN_ID]: new Set(["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"]),
};

export function isWrappedMajor(chainId: number, address: string): boolean {
  return WRAPPED_MAJORS[chainId]?.has(address.toLowerCase()) ?? false;
}

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

// The trade service indexes more chains than this client executes on, and
// its discovery routes return them mixed together; only the catalog honours
// ?chain. A row from a chain the client cannot open or trade is a card that
// can only dead-end when tapped, so it is dropped here, at the boundary. So
// is each chain's quote currency, which sits on both sides of every swap and
// which the service refuses as a meme-token selection, and so are the wrapped
// majors, which are not memecoins at all.
export function isMemecoinHere(token: MemeToken): boolean {
  return (
    isSupportedChain(token.chainId) &&
    !isQuoteCurrency(token.chainId, token.address) &&
    !isWrappedMajor(token.chainId, token.address)
  );
}

export function tradableHere(page: Paged<MemeToken>): Paged<MemeToken> {
  const items = page.items.filter(isMemecoinHere).map(withRiskDefaults);
  return { items, meta: { ...page.meta, total: items.length } };
}
