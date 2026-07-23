import "server-only";

// Alchemy Portfolio API. One call returns native + ERC-20 + SPL balances with
// USD prices across every requested network. Key stays server-side.

const EVM_NETWORKS = [
  "eth-mainnet",
  "base-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
];
const SOLANA_NETWORK = "solana-mainnet";

export interface TokenBalance {
  symbol: string;
  name: string;
  network: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  logo: string | null;
}

export interface Portfolio {
  totalUsd: number;
  tokens: TokenBalance[];
}

interface AlchemyToken {
  network: string;
  tokenBalance: string;
  tokenMetadata?: { decimals?: number; logo?: string; name?: string; symbol?: string };
  tokenPrices?: { currency: string; value: string }[];
}

function toNumber(hexOrDec: string, decimals: number): number {
  const raw = hexOrDec.startsWith("0x") ? BigInt(hexOrDec) : BigInt(hexOrDec || "0");
  return Number(raw) / 10 ** decimals;
}

function normalize(tokens: AlchemyToken[]): TokenBalance[] {
  const out: TokenBalance[] = [];
  for (const t of tokens) {
    const decimals = t.tokenMetadata?.decimals ?? 18;
    const balance = toNumber(t.tokenBalance, decimals);
    if (balance <= 0) continue;
    const usdPrice = t.tokenPrices?.find((p) => p.currency === "usd");
    const priceUsd = usdPrice ? parseFloat(usdPrice.value) : 0;
    out.push({
      symbol: t.tokenMetadata?.symbol ?? "?",
      name: t.tokenMetadata?.name ?? "Unknown token",
      network: t.network,
      balance,
      priceUsd,
      valueUsd: balance * priceUsd,
      logo: t.tokenMetadata?.logo ?? null,
    });
  }
  return out.sort((a, b) => b.valueUsd - a.valueUsd);
}

export interface SymbolPrice {
  symbol: string;
  priceUsd: number;
}

export async function fetchPrices(symbols: string[]): Promise<SymbolPrice[]> {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("ALCHEMY_API_KEY is not set");
  if (symbols.length === 0) return [];

  const params = new URLSearchParams();
  for (const s of symbols) params.append("symbols", s);
  const res = await fetch(
    `https://api.g.alchemy.com/prices/v1/${key}/tokens/by-symbol?${params.toString()}`
  );
  if (!res.ok) throw new Error(`Alchemy prices failed: ${res.status}`);
  const data = await res.json();
  const out: SymbolPrice[] = [];
  for (const item of data?.data ?? []) {
    const usd = item?.prices?.find((p: { currency: string }) => p.currency === "usd");
    out.push({ symbol: item.symbol, priceUsd: usd ? parseFloat(usd.value) : 0 });
  }
  return out;
}

export async function fetchPortfolio(evm?: string, solana?: string): Promise<Portfolio> {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("ALCHEMY_API_KEY is not set");

  const addresses: { address: string; networks: string[] }[] = [];
  if (evm) addresses.push({ address: evm, networks: EVM_NETWORKS });
  if (solana) addresses.push({ address: solana, networks: [SOLANA_NETWORK] });
  if (addresses.length === 0) return { totalUsd: 0, tokens: [] };

  const res = await fetch(`https://api.g.alchemy.com/data/v1/${key}/assets/tokens/by-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      addresses,
      withMetadata: true,
      withPrices: true,
      includeNativeTokens: true,
      includeErc20Tokens: true,
    }),
  });

  if (!res.ok) throw new Error(`Alchemy request failed: ${res.status}`);
  const data = await res.json();
  const tokens = normalize(data?.data?.tokens ?? []);
  const totalUsd = tokens.reduce((sum, t) => sum + t.valueUsd, 0);
  return { totalUsd, tokens };
}
