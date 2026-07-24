import { createPublicClient } from "@polymarket/client";

// Public (unauthenticated) Polymarket client for market data: markets, order
// books, prices. No signer or credentials needed. One shared instance.
let client: ReturnType<typeof createPublicClient> | null = null;

export function polymarketPublic(): ReturnType<typeof createPublicClient> {
  if (!client) client = createPublicClient();
  return client;
}
