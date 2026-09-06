// Domain types and pure helpers for buying a market asset. A buy is a Dextopus
// cross-chain route: the origin is always the user's USDC on Base, the
// destination is the chosen token on its chain, delivered to the user's own
// wallet. This module only resolves which routes exist for a symbol; amount and
// quote math live with the buy execution. No framework or wallet imports here.

import { SETTLE_CHAINS, SOLANA_CHAIN_ID } from "@/lib/deposit";

// Every buy is funded from the user's USDC balance on Base. Single source of
// truth for the origin leg of the Dextopus quote.
export const BUY_ORIGIN = {
  chainId: SETTLE_CHAINS.base.chainId,
  asset: SETTLE_CHAINS.base.usdc,
  decimals: SETTLE_CHAINS.base.decimals,
} as const;

// Base is the default destination when a symbol can be delivered to several
// chains, and the auto-selected chain when a symbol lives on only one.
export const DEFAULT_BUY_CHAIN_ID = SETTLE_CHAINS.base.chainId;

// One place a symbol can settle to: a single Dextopus destination. Mapped from
// the deposit/destinations payload (currency is the destination token address,
// chainName is its "blockchain" label).
export interface BuyRoute {
  destinationChainId: number;
  chainName: string;
  asset: string;
  symbol: string;
  decimals: number;
  // Dextopus's own token icon, when the destinations catalog carries one.
  logoUrl: string | null;
}

// The chains we settle buys on and can display in holdings. A bought asset lands
// on the network picked in the sheet, so we only offer networks the portfolio
// reads back (Alchemy-supported) and that our embedded wallets control. Anything
// else (obscure L2s, or chains we hold no wallet for like bitcoin/tron/xrp/ton)
// is never offered. Classified by the Dextopus blockchain label, which is always
// present (addressKind is not).
//
// Every entry past the original six went through two checks: an eth_chainId
// call against Alchemy's own RPC confirmed the chain ID Dextopus reports for
// that blockchain label, AND a real request to Alchemy's Portfolio Data API
// (assets/tokens/by-address, what lib/server/alchemy.ts actually calls for
// holdings) accepted the network rather than returning "Unsupported
// network." The two do not agree on the same set: cronos, plasma, stable,
// mantle, mode, metis, sei, boba, flow-evm, degen, katana, sonic, and
// superseed all have working RPC endpoints but are rejected by the Portfolio
// API, so a buy there could never be shown as a holding — left out for that
// reason, not because Dextopus or the RPC itself rejected them. A handful of
// other Dextopus labels were checked and left out because Alchemy's RPC did
// not confirm them at all: arbitrum-nova, lisk, morph, zircuit, plume,
// manta-pacific, somnia, b3, animechain, doma, ethereal, gunz, data, lighter,
// megaeth. Non-EVM chains (bitcoin, tron, xrp, ton, eclipse) stay out because
// our embedded wallets do not hold keys on them. Dextopus also lists a second
// "hyperliquid" label with chain ID 1337, separate from "hyperevm" (chain ID
// 999); only "hyperevm" is included, since 1337 did not match anything
// Alchemy serves. Keep in sync with EVM_NETWORKS in lib/server/alchemy.ts and
// CHAIN_TO_NETWORK in lib/server/buyable-registry.ts.
const SUPPORTED_CHAINS = new Set([
  "base",
  "ethereum",
  "arbitrum",
  "optimism",
  "polygon",
  "solana",
  "apechain",
  "berachain",
  "bsc",
  "celo",
  "gensyn",
  "hyperevm",
  "ink",
  "monad",
  "robinhood",
  "shape",
  "soneium",
  "unichain",
  "world-chain",
  "gnosis",
  "linea",
  "zksync",
  "scroll",
  "avalanche",
  "blast",
  "zora",
  "ronin",
  "abstract",
  "mythos",
]);

// Some coins are native to one ecosystem and appear on other chains only as
// wrapped representations that would mislead a buyer: an ERC-20 "SOL" on Base is
// not native SOL. For these symbols we only ever offer the native chain.
// Verified against the live Dextopus catalog. Legitimately multi-chain assets
// (ETH on L2s, USDC/USDT/PYUSD native issuances) are intentionally not listed.
const CANONICAL_CHAIN: Record<string, number> = {
  SOL: SOLANA_CHAIN_ID,
};

// Assets Dextopus lists as destinations but its quote endpoint cannot actually
// deliver. Addresses are lowercased for comparison. Empty today; SOL used to sit
// here, see SETTLEMENT_ADDRESS below for why it does not any more.
const NON_BUYABLE_ASSETS = new Set<string>();

// Wrapped SOL, which the destinations catalog advertises SOL under.
const WSOL_MINT = "So11111111111111111111111111111111111111112";
// The Solana system program, which is how native SOL is addressed.
const NATIVE_SOL = "11111111111111111111111111111111";

// Addresses the catalog advertises but the quote endpoint will not accept,
// mapped to the one that settles. Quoting the wSOL mint returns "Destination
// asset is not supported on chain"; the system-program address delivers native
// SOL fine. SOL was excluded from the whole buy list over this — it is a top-ten
// asset and a QA tester could not find it.
const SETTLEMENT_ADDRESS: Record<string, string> = {
  [WSOL_MINT.toLowerCase()]: NATIVE_SOL,
};

// The address to quote and settle against for a destination. Identical to the
// catalog's for everything except the handful it advertises wrongly.
export function settlementAddress(asset: string): string {
  return SETTLEMENT_ADDRESS[asset.toLowerCase()] ?? asset;
}

// A route is offerable when we can deliver to its chain, it is a token Dextopus
// can actually settle, and it is not a misleading wrapped representation of a
// coin native to another chain.
export function isOfferable(route: BuyRoute): boolean {
  if (!SUPPORTED_CHAINS.has(route.chainName.toLowerCase())) return false;
  if (NON_BUYABLE_ASSETS.has(route.asset.toLowerCase())) return false;
  const canonical = CANONICAL_CHAIN[route.symbol.toUpperCase()];
  return canonical == null || route.destinationChainId === canonical;
}

// Popular coins whose market ticker differs from the ticker Dextopus can deliver.
// The market list shows the display symbol; buying routes through the catalog
// one. Bitcoin has no native wallet here, so it is delivered as Coinbase Wrapped
// BTC (cbBTC) on Base. Keys and values are compared uppercased.
const SYMBOL_ALIAS: Record<string, string> = {
  BTC: "CBBTC",
  DOGE: "CBDOGE",
};

// Catalog symbol -> display symbol, derived so the alias has one source. Lets the
// buyable set report "BTC" for a cbBTC route so the market's BTC row survives the
// filter.
const DISPLAY_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_ALIAS).map(([display, catalog]) => [catalog, display])
);

// The display symbol for a held token's own on-chain symbol, e.g. "cbDOGE" ->
// "DOGE". Used wherever a portfolio holding is shown, so a wrapped
// representation reads as the coin it represents rather than its contract
// ticker. Anything not in the alias (almost every token) passes through
// unchanged.
export function displaySymbol(symbol: string): string {
  return DISPLAY_ALIAS[symbol.trim().toUpperCase()] ?? symbol;
}

// Display only: cbBTC actually settles on Base (the real network id is what
// every functional use — selling, sending, gas checks — keys off), but
// showing that next to a coin the user bought and sees as plain "BTC" reads
// as a mismatch. "Bitcoin" doubles as both the label and the network-icon
// key (see NETWORK_ICONS in components/ui/network-icon.tsx). DOGE has no
// equivalent: the icon set's only Dogecoin-adjacent entry is NetworkDogechain,
// an unrelated sidechain project, so it keeps showing its real network.
export function displayNetwork(symbol: string, network: string): string {
  return displaySymbol(symbol) === "BTC" ? "Bitcoin" : network;
}

// The Dextopus catalog symbol a market/display symbol resolves to, uppercased.
function catalogSymbol(symbol: string): string {
  const up = symbol.trim().toUpperCase();
  return SYMBOL_ALIAS[up] ?? up;
}

// Base first, then by chain name. Both the default-selection and the
// single-chain ("tied to a chain") cases fall out of this ordering: the first
// route is the one to pick, and a length of one means no chain choice to offer.
export function sortRoutes(routes: BuyRoute[]): BuyRoute[] {
  const rank = (r: BuyRoute) => (r.destinationChainId === DEFAULT_BUY_CHAIN_ID ? 0 : 1);
  return [...routes].sort((a, b) => rank(a) - rank(b) || a.chainName.localeCompare(b.chainName));
}

// All offerable routes for a market symbol: the chains we can deliver it to that
// are not misleading wrappers, Base first. The symbol is resolved through the
// display alias first (e.g. BTC -> cbBTC), then matched case-insensitively.
export function routesForSymbol(destinations: BuyRoute[], symbol: string): BuyRoute[] {
  const want = catalogSymbol(symbol);
  return sortRoutes(destinations.filter((d) => d.symbol.toUpperCase() === want && isOfferable(d)));
}

// The default route to select for a symbol (Base when available, else the first
// by chain name), or null when the symbol is not buyable.
export function defaultRouteForSymbol(destinations: BuyRoute[], symbol: string): BuyRoute | null {
  return routesForSymbol(destinations, symbol)[0] ?? null;
}

// The set of display symbols we can actually offer, uppercased, for intersecting
// the markets table down to buyable assets. Offerable catalog symbols are mapped
// back to their display ticker (cbBTC -> BTC), and symbols routable only to
// chains we cannot deliver to are excluded, so no unbuyable row survives.
export function buyableSymbols(destinations: BuyRoute[]): Set<string> {
  const out = new Set<string>();
  for (const d of destinations) {
    if (!isOfferable(d)) continue;
    const up = d.symbol.toUpperCase();
    out.add(DISPLAY_ALIAS[up] ?? up);
  }
  return out;
}

// Display symbol -> Dextopus token icon url, for markets the price feed doesn't
// cover. Keyed by the same display ticker as buyableSymbols; the first offerable
// route with a logo wins.
export function buyableLogos(destinations: BuyRoute[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of destinations) {
    if (!isOfferable(d) || !d.logoUrl) continue;
    const sym = DISPLAY_ALIAS[d.symbol.toUpperCase()] ?? d.symbol.toUpperCase();
    if (!out.has(sym)) out.set(sym, d.logoUrl);
  }
  return out;
}

// Whether a market symbol has at least one offerable route (via its alias).
export function isBuyable(destinations: BuyRoute[], symbol: string): boolean {
  const want = catalogSymbol(symbol);
  return destinations.some((d) => d.symbol.toUpperCase() === want && isOfferable(d));
}

// Dextopus blockchain label -> Alchemy portfolio network id, for matching a
// route against a held balance.
const CHAIN_NAME_TO_NETWORK: Record<string, string> = {
  base: "base-mainnet",
  ethereum: "eth-mainnet",
  arbitrum: "arb-mainnet",
  optimism: "opt-mainnet",
  polygon: "polygon-mainnet",
  solana: "solana-mainnet",
};

// Whether a held balance is the asset a market symbol trades: route-address
// match first, then symbol through the catalog alias (held "cbBTC" matches
// the "BTC" market).
export function holdingMatchesSymbol(
  held: { network: string; address: string | null; symbol: string },
  destinations: BuyRoute[],
  symbol: string
): boolean {
  if (held.address !== null) {
    const addr = held.address.toLowerCase();
    const routes = routesForSymbol(destinations, symbol);
    if (
      routes.some(
        (r) =>
          CHAIN_NAME_TO_NETWORK[r.chainName.toLowerCase()] === held.network &&
          r.asset.toLowerCase() === addr
      )
    ) {
      return true;
    }
  }
  const heldSym = held.symbol.trim().toUpperCase();
  return heldSym === symbol.trim().toUpperCase() || heldSym === catalogSymbol(symbol);
}

// One row of the Dextopus destinations catalog as it arrives. Only the fields
// the app reads; anything else passes through untouched.
export interface RawDestination {
  destinationChainId: number;
  blockchain?: string;
  currency?: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
}

// The destinations catalog as our routes. The body is either a bare array or
// `{ destinations: [...] }`, and a row without a currency, a symbol or a chain
// id cannot be traded, so it is dropped here rather than crashing a table.
// Shared by the browser's catalog hook and the dashboard feed on the server.
export function toBuyRoutes(data: unknown): BuyRoute[] {
  const body = data as { destinations?: unknown } | null;
  const rows: RawDestination[] = Array.isArray(data)
    ? (data as RawDestination[])
    : Array.isArray(body?.destinations)
      ? (body.destinations as RawDestination[])
      : [];
  return rows
    .filter(
      (d): d is Required<Pick<RawDestination, "currency" | "symbol">> & RawDestination =>
        Boolean(d.currency) && Boolean(d.symbol) && Number.isFinite(d.destinationChainId)
    )
    .map((d) => ({
      destinationChainId: d.destinationChainId,
      chainName: d.blockchain ?? "",
      asset: d.currency,
      symbol: d.symbol,
      decimals: d.decimals ?? 18,
      logoUrl: d.logoUrl ?? null,
    }));
}
