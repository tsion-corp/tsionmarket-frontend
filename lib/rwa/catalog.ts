// The real-asset catalog's domain type and the rules that decide what the app
// lists from it. Pure and framework-free, and below the feature line, because
// two sides need the same answer: the RWA feature in the browser and the
// dashboard feed on the server. A rule that lived in the feature could not be
// used by the server without either duplicating it or breaking the layering.

export type RwaChain = "solana" | "ethereum" | "base" | "arbitrum" | "bsc" | "polygon";
export type AccessMode = "dex" | "issuer" | "hybrid";

export interface RwaApiAsset {
  id: string;
  chain: RwaChain;
  address: string;
  symbol: string;
  name: string;
  issuer: string;
  category: string;
  // Null for most assets in practice, not merely absent.
  yieldApyBps?: number | null;
  priceUsd: string | null;
  freelyTradable: boolean;
  accessMode?: AccessMode;
  kycRequired?: boolean;
  minInvestmentUsd?: string | null;
  redemption?: string;
  issuerUrl?: string;
  deprecated?: boolean;
  tvlUsd?: string;
  meta?: { note?: string };
  issuerData?: { navPriceUsd?: string; apyBps?: number; tvlUsdTotal?: string };
}

export function assetPriceUsd(a: RwaApiAsset): number | null {
  const p = a.priceUsd ?? a.issuerData?.navPriceUsd ?? null;
  const n = p != null ? Number(p) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Real token logo by contract address, resolved server-side (CoinGecko first,
// then Trust Wallet). AssetIcon tries web3icons by symbol first, then this, so
// every asset resolves to its real logo.
export function rwaLogoPath(chain: RwaChain, address: string): string {
  return `/api/token-logo/${chain}/${address}`;
}

// The gateway payload is cast, not validated, so one malformed row would
// otherwise crash the table, the modal or the voice prefill on a null field.
export function isUsableAsset(a: RwaApiAsset): boolean {
  return Boolean(a && a.id && a.chain && a.address && a.symbol);
}

// Only assets the DEX can actually fill get a buy panel.
export function isTradable(a: RwaApiAsset): boolean {
  return a.freelyTradable === true && a.accessMode !== "issuer";
}

// Chains the RWA table trades on. Quote and build route both live (verified
// against the gateway: Jupiter on Solana, aggregators on Base); the catalog's
// other chains stay hidden until their portfolio and gas support lands.
// Arbitrum and Polygon qualify like Base: sponsored transactions, USDC
// defined, balances indexed. Ethereum is excluded on purpose (unsponsored
// gas) and BSC until the portfolio indexes it.
export const LIVE_RWA_CHAINS: readonly RwaChain[] = ["base", "arbitrum", "polygon", "solana"];

export function isLiveChain(a: RwaApiAsset): boolean {
  return (LIVE_RWA_CHAINS as readonly string[]).includes(a.chain);
}

// The chains the table lists. A row is only offered where the buy can
// complete without asking the user for gas they do not hold: Base, sponsored
// through the 7702 path, and Solana, sponsored by the platform's gas-sponsor
// service (fee payer reseated, rent covered by the funding plan's setup leg).
// Arbitrum and Polygon stay unlisted until their sponsorship is wired.
//
// Deliberately narrower than LIVE_RWA_CHAINS. That says which chains are wired
// end to end, which still matters for selling something already held; this says
// which we offer to buy.
export const LISTED_RWA_CHAINS: readonly RwaChain[] = ["base", "solana"];

export function isListedChain(a: RwaApiAsset): boolean {
  return (LISTED_RWA_CHAINS as readonly string[]).includes(a.chain);
}

/** Whether an asset earns a row in the table: complete, buyable, on a listed chain. */
export function isListedAsset(a: RwaApiAsset): boolean {
  return isUsableAsset(a) && isTradable(a) && isLiveChain(a) && isListedChain(a);
}

// Which chain to keep when the catalog lists one asset on several. Base first,
// then Solana: both are sponsored, and Base is where most of a user's USDC
// sits, so the same asset is one fewer hop there.
const CHAIN_PREFERENCE: readonly RwaChain[] = ["base", "arbitrum", "polygon", "solana"];

function chainRank(a: RwaApiAsset): number {
  const at = (CHAIN_PREFERENCE as readonly string[]).indexOf(a.chain);
  return at === -1 ? CHAIN_PREFERENCE.length : at;
}

// One row per asset. The catalog lists the same token on several chains — Maple
// Syrup USDC is on Base and Solana — which reads as a duplicate row with nothing
// to tell the two apart, and picking the wrong one lands the user on the chain
// where the trade costs more. Ordering is preserved, so the table's existing
// sort still decides where the surviving row sits.
export function dedupeByChain(assets: RwaApiAsset[]): RwaApiAsset[] {
  const best = new Map<string, RwaApiAsset>();
  for (const a of assets) {
    const key = a.symbol.toUpperCase();
    const held = best.get(key);
    if (!held || chainRank(a) < chainRank(held)) best.set(key, a);
  }
  return assets.filter((a) => best.get(a.symbol.toUpperCase()) === a);
}

/** The listed, deduplicated catalog: what both the table and the brief start from. */
export function listedRwaAssets(assets: RwaApiAsset[]): RwaApiAsset[] {
  return dedupeByChain(assets.filter(isListedAsset));
}
