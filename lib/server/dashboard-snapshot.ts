import "server-only";

import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { DASHBOARD_FEED_KEY } from "@/lib/dashboard-feed";
import { buildDashboardFeed } from "@/lib/server/dashboard-feed";
import { prefetchPortfolio } from "@/lib/server/portfolio-snapshot";

// Everything the dashboard's first paint needs, as one dehydrated query
// cache: the session's balance, which is per user, and the public feed, which
// is shared. Both land under the keys the browser's hooks build, so the page
// renders with real numbers and the hooks' first requests are refreshes, not
// first loads.
//
// The two halves are independent and run together; a failure in either leaves
// that key absent and the browser fetches it as it always did. Never throws.
export async function dehydratedDashboard(): Promise<DehydratedState | null> {
  try {
    const client = new QueryClient();
    await Promise.all([
      prefetchPortfolio(client),
      client.prefetchQuery({ queryKey: DASHBOARD_FEED_KEY, queryFn: buildDashboardFeed }),
    ]);
    return dehydrate(client);
  } catch {
    return null;
  }
}
