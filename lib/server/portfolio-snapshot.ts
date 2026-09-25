import "server-only";

import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { fetchPortfolio } from "@/lib/server/alchemy";
import { embeddedWalletAddress } from "@/lib/server/embedded-wallets";
import { getSessionUser } from "@/lib/server/session";

// The dashboard's balance, fetched on the server for the session that asked
// and handed to the browser as a dehydrated query cache. usePortfolio then
// finds its data already there under the key it would have built itself,
// ["portfolio", evm, solana], and paints the number instead of a skeleton.
//
// Before this the balance sat four network hops behind the first paint: the
// bundle, then Privy's own start-up, then its /users/me call for the identity
// token, then /api/portfolio, which itself verified the token and called
// Alchemy. Every hop was serial. Here the server already holds the session
// cookie, so it resolves the user and the balance while the HTML is still
// being written.
//
// Per request and per user by construction: the session comes from the
// cookie, the wallets from that user, and the result is never stored beyond
// the process cache fetchPortfolio already keeps per wallet pair. The route
// handler that serves /api/portfolio shares that cache, so the browser's first
// background refetch, a minute later, is answered from it.
//
// Never throws. A missing session, a user without wallets, or an Alchemy
// failure all yield a state the client treats as "nothing prefetched", and the
// browser fetches as it always did.
export async function dehydratedPortfolio(): Promise<DehydratedState | null> {
  try {
    const client = new QueryClient();
    const prefetched = await prefetchPortfolio(client);
    if (!prefetched) return null;
    return dehydrate(client);
  } catch {
    return null;
  }
}

// Puts the session's balance into `client` under the browser's key. Resolves
// false when there is no session or no wallet to read for. Shared with the
// dashboard snapshot, which prefetches the public feed beside it.
export async function prefetchPortfolio(client: QueryClient): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  const evm = embeddedWalletAddress(user, "ethereum");
  const solana = embeddedWalletAddress(user, "solana");
  if (!evm && !solana) return false;

  // prefetchQuery resolves on failure rather than rejecting, and dehydrate
  // only carries successful queries, so a failed fetch yields an empty state.
  await client.prefetchQuery({
    queryKey: ["portfolio", evm, solana],
    queryFn: () => fetchPortfolio(evm ?? undefined, solana ?? undefined),
  });
  return true;
}
