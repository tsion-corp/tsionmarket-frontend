import "server-only";

import { senderCheck } from "@/lib/server/evm-broadcast";
import type { AccessClaims } from "@/lib/server/auth";

/**
 * Whether this session may act as `claimed` through a proxy that only ever acted as the
 * session's own Decane wallet.
 *
 * Once an account uses the new wallet, the app asks for that wallet's addresses, not the Decane
 * ones, so those proxies saw a wallet that was not the session's and answered 403. An address
 * the wallet service has registered to this same account counts too. The service is the only
 * authority on that, and an address is only registered after its key has signed a challenge, so
 * this opens the proxy to the person's own wallets and no one else's.
 *
 * Decane sessions only: a Privy token is on its way out and must not reach a wallet.
 */
export async function isRegisteredWallet(
  claims: Pick<AccessClaims, "provider" | "userId">,
  claimed: string
): Promise<boolean> {
  if (claims.provider !== "decane") return false;
  return (await senderCheck(claims.userId, claimed)) === "registered";
}
