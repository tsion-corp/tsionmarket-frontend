import "server-only";

import { DecaneClient } from "decane-node";

let client: DecaneClient | null = null;

// Decane verifies access tokens against its published JWKS (or the optional
// DECANE_VERIFICATION_KEY env var, which decane-node picks up on its own), so
// unlike Privy there is no app secret to hold here.
export function getDecaneClient(): DecaneClient {
  if (client) return client;
  const appId = process.env.NEXT_PUBLIC_DECANE_APP_ID;
  if (!appId) {
    throw new Error("Decane is not configured. Set NEXT_PUBLIC_DECANE_APP_ID.");
  }
  client = new DecaneClient({ appId });
  return client;
}

export function decaneConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_DECANE_APP_ID);
}
