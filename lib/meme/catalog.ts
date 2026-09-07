import type { MemeToken } from "@/lib/meme/types";
import {
  BASE_CHAIN_ID,
  SOLANA_CHAIN_ID,
  isQuoteCurrency,
  isSupportedChain,
} from "@/lib/meme/chain";

// Normalisation of the trade service's token lists, shared by the browser
// client and the dashboard feed on the server.

export interface Paged<T> {
  items: T[];
  meta: { page: number; limit: number; total: number };
}

// Wrapped majors the catalog lists among the memecoins: each chain's gas
// token in token form, and Bitcoin in a Base wrapper. A wrapper worth
// billions between two joke coins makes the whole list read as unfiltered,
// and each of these already has a home on the spot desk.
//
// A list here is a stopgap. What belongs on a memecoin surface is a judgement
// the trade service should make and return, the way it returns a risk
// assessment; until it does, each new wrapper is added here by hand. Keys are
// lowercased on Base; a Solana mint is compared as written.
const WRAPPED_MAJORS: Record<number, Set<string>> = {
  [BASE_CHAIN_ID]: new Set([
    "0x4200000000000000000000000000000000000006", // WETH
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", // cbBTC
  ]),
  [SOLANA_CHAIN_ID]: new Set([
    "So11111111111111111111111111111111111111112", // wrapped SOL
  ]),
};

// Names the majors go by. The discovery feed carries impersonators: dozens
// of Solana rows called "SOL", "Solana", "ETH" or "Ethereum" with liquidity
// in the billions. A coin that claims to be a major is either the major,
// which is not a memecoin, or a scam, so both are dropped. The contract says
// never to identify a token by symbol, and trading never does; this is a
// display rule for a discovery surface, and a stopgap until the service
// stops indexing them.
const MAJOR_SYMBOLS = new Set([
  "SOL",
  "WSOL",
  "ETH",
  "WETH",
  "BTC",
  "WBTC",
  "CBBTC",
  "USDC",
  "USDT",
  "SOLANA",
  "ETHEREUM",
  "BITCOIN",
]);
const MAJOR_NAMES = new Set([
  "solana",
  "wrapped sol",
  "wrapped solana",
  "ethereum",
  "ether",
  "wrapped ether",
  "wrapped ethereum",
  "bitcoin",
  "wrapped bitcoin",
  "tether",
  "usd coin",
]);

export function impersonatesMajor(token: Pick<MemeToken, "symbol" | "name">): boolean {
  const symbol = (token.symbol ?? "").trim().replace(/^\$/, "").toUpperCase();
  if (symbol && MAJOR_SYMBOLS.has(symbol)) return true;
  // "Wrapped Ethereum (Sollet)" is still Ethereum; a suffix in brackets does
  // not make it a different coin.
  const name = (token.name ?? "")
    .trim()
    .replace(/\s*\(.*\)\s*$/, "")
    .toLowerCase();
  return name !== "" && MAJOR_NAMES.has(name);
}

export function isWrappedMajor(chainId: number, address: string): boolean {
  const key = chainId === SOLANA_CHAIN_ID ? address : address.toLowerCase();
  return WRAPPED_MAJORS[chainId]?.has(key) ?? false;
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
    !isWrappedMajor(token.chainId, token.address) &&
    !impersonatesMajor(token)
  );
}

export function tradableHere(page: Paged<MemeToken>): Paged<MemeToken> {
  const items = page.items.filter(isMemecoinHere).map(withRiskDefaults);
  return { items, meta: { ...page.meta, total: items.length } };
}
