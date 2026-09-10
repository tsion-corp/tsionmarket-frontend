import { Suspense } from "react";
import { QueryHydration } from "@/components/providers/query-hydration";
import { dehydratedDashboard } from "@/lib/server/dashboard-snapshot";
import { DashboardPage } from "../dashboard/dashboard-page";

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
