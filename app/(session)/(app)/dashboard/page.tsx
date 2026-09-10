import { Suspense } from "react";
import { QueryHydration } from "@/components/providers/query-hydration";
import { dehydratedDashboard } from "@/lib/server/dashboard-snapshot";
import { DashboardPage } from "./dashboard-page";

// The server half of the dashboard. It starts the prefetch of the session's
// balance and of the public feed the briefs and marquee read, and hands the
// promise down without awaiting it, so the page streams at once and both land
// in the query cache as soon as the upstreams answer: usually before the
// browser has finished starting Privy. See lib/server/dashboard-snapshot.
//
// The Suspense boundary is around the hydration alone. Awaiting the snapshot
// here would block the whole page on it, which is the one thing this must not
// do; wrapped this way the fallback is nothing and the rest renders freely.
// Rendered per request. The page is dynamic at runtime already, through the
// cookie its layout reads, but the build's static pass still evaluates it,
// and the feed prefetch starts before any request API is touched, so the
// composer ran on the build machine against live upstreams. Declaring it
// keeps the build off the network entirely.
export const dynamic = "force-dynamic";

export default function Page() {
  const snapshot = dehydratedDashboard();
  return (
    <>
      <Suspense fallback={null}>
        <QueryHydration snapshot={snapshot} />
      </Suspense>
      <DashboardPage />
    </>
  );
}
