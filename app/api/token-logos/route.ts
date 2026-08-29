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

interface TokenRef {
  chain: string;
  address: string;
}

// One GeckoTerminal multi-token call per network (up to 30 addresses each)
// resolves real logos in bulk, which avoids the per-token rate limiting that
// leaves many icons blank on first load. Keyed by `${chain}:${address}` to match
// the asset id. Missing entries are simply absent; the client falls back.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tokens: TokenRef[] = Array.isArray(body?.tokens) ? body.tokens : [];

  const byNetwork = new Map<string, TokenRef[]>();
  for (const t of tokens) {
    if (!t?.chain || !t?.address || !GECKOTERMINAL_NETWORK[t.chain]) continue;
    const list = byNetwork.get(t.chain) ?? [];
    list.push(t);
    byNetwork.set(t.chain, list);
  }

  const logos: Record<string, string> = {};

  await Promise.all(
    [...byNetwork.entries()].map(async ([chain, list]) => {
      const network = GECKOTERMINAL_NETWORK[chain];
      for (let i = 0; i < list.length; i += 30) {
        const batch = list.slice(i, i + 30);
        const addresses = batch.map((t) => t.address).join(",");
        try {
          const res = await fetch(
            `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/multi/${addresses}`,
            { next: { revalidate: ONE_DAY }, signal: AbortSignal.timeout(8_000) }
          );
          if (!res.ok) continue;
          const data = await res.json();
          const imageByAddress = new Map<string, string>();
          for (const item of data?.data ?? []) {
            const addr = String(item?.attributes?.address ?? "").toLowerCase();
            const image = item?.attributes?.image_url;
            if (addr && image && image !== "missing.png") imageByAddress.set(addr, image);
          }
          for (const t of batch) {
            const image = imageByAddress.get(t.address.toLowerCase());
            if (image) logos[`${t.chain}:${t.address}`] = image;
          }
        } catch {
          // Skip this batch; those assets fall back client-side.
        }
      }
    })
  );

  return NextResponse.json({ logos });
}
