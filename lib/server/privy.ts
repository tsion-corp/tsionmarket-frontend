import "server-only";

import { PrivyClient } from "@privy-io/node";

let client: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (client) return client;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.");
  }
  client = new PrivyClient({ appId, appSecret });
  return client;
}
