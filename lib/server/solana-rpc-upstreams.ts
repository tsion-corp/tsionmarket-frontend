import "server-only";
import { alchemyUrls } from "@/lib/server/alchemy-keys";
import { heliusSolanaRpcUrls } from "@/lib/server/helius";

const PUBLIC_SOLANA_RPC = "https://api.mainnet-beta.solana.com";

function isLegacyAlchemyUrl(url: string): boolean {
  return url.includes("solana-mainnet.g.alchemy.com");
}

/**
 * Shared Solana RPC priority for reads and sponsored submission.
 *
 * A provider-neutral operator override remains authoritative. Older deploys
 * commonly set SOLANA_RPC_URL to Alchemy, so that legacy value is retained as
 * a fallback behind Helius rather than silently defeating the Helius rollout.
 */
export function solanaRpcUpstreams(): string[] {
  const configured = process.env.SOLANA_RPC_URL?.trim();
  const custom = configured && !isLegacyAlchemyUrl(configured) ? configured : undefined;
  const legacyAlchemy = configured && isLegacyAlchemyUrl(configured) ? configured : undefined;

  return [
    custom,
    ...heliusSolanaRpcUrls(),
    ...alchemyUrls((key) => `https://solana-mainnet.g.alchemy.com/v2/${key}`),
    legacyAlchemy,
    PUBLIC_SOLANA_RPC,
  ].filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);
}
