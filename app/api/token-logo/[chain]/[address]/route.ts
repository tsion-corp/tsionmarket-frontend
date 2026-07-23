import { NextResponse, type NextRequest } from "next/server";

const ONE_DAY = 86400;

const GECKOTERMINAL_NETWORK: Record<string, string> = {
  ethereum: "eth",
  base: "base",
  arbitrum: "arbitrum",
  polygon: "polygon_pos",
  bsc: "bsc",
  solana: "solana",
};

const COINGECKO_PLATFORM: Record<string, string> = {
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum-one",
  polygon: "polygon-pos",
  bsc: "binance-smart-chain",
  solana: "solana",
};

const TRUSTWALLET_CHAIN: Record<string, string> = {
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  polygon: "polygon",
  bsc: "smartchain",
  solana: "solana",
};

function cachedRedirect(url: string) {
  return NextResponse.redirect(url, {
    status: 307,
    headers: { "Cache-Control": "public, max-age=86400, immutable" },
  });
}

// Resolves a real token logo by contract address. GeckoTerminal covers the most
// DEX-listed tokens with the highest keyless rate limit, then CoinGecko's
// contract endpoint, then Trust Wallet. Heavily cached since logos rarely change.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ chain: string; address: string }> }
) {
  const { chain, address } = await ctx.params;

  const network = GECKOTERMINAL_NETWORK[chain];
  if (network) {
    try {
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${address}`,
        { next: { revalidate: ONE_DAY } }
      );
      if (res.ok) {
        const data = await res.json();
        const image: string | undefined = data?.data?.attributes?.image_url;
        if (image && image !== "missing.png") return cachedRedirect(image);
      }
    } catch {
      // Fall through.
    }
  }

  const platform = COINGECKO_PLATFORM[chain];
  if (platform) {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address}`,
        { next: { revalidate: ONE_DAY } }
      );
      if (res.ok) {
        const data = await res.json();
        const image: string | undefined = data?.image?.large ?? data?.image?.small;
        if (image) return cachedRedirect(image);
      }
    } catch {
      // Fall through.
    }
  }

  const twChain = TRUSTWALLET_CHAIN[chain];
  if (twChain) {
    return cachedRedirect(
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${twChain}/assets/${address}/logo.png`
    );
  }

  return NextResponse.json({ error: "No logo" }, { status: 404 });
}
