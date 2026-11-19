import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardLockModal } from "@/components/landing/dashboard-lock-modal";
import { DASHBOARD_LOCKED } from "@/lib/dashboard-lock";
import { BRAND } from "@/lib/brand";

// The page proxy.ts rewrites every locked route to while the dashboard lock is
// on. The address in the bar stays whatever the visitor typed; this is only
// what answers it. With the lock off there is nothing to cover, so a visit
// here goes to the landing page.
export const metadata: Metadata = {
  title: `Under maintenance · ${BRAND}`,
  robots: { index: false, follow: false },
};

export default function MaintenanceRoute() {
  if (!DASHBOARD_LOCKED) redirect("/");
  return <DashboardLockModal />;
}
