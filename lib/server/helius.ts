import "server-only";

/** Configured Helius keys, primary first. Blanks and duplicates are dropped. */
export function heliusKeys(): string[] {
  return [process.env.HELIUS_API_KEY, process.env.HELIUS_API_KEY_FALLBACK]
    .map((key) => key?.trim())
    .filter((key, index, all): key is string => Boolean(key) && all.indexOf(key) === index);
}

/** One Solana mainnet JSON-RPC URL per configured Helius key. */
export function heliusSolanaRpcUrls(): string[] {
  return heliusKeys().map(
    (key) => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`
  );
}
