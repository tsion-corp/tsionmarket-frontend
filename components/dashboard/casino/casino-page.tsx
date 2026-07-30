"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { buildNav } from "@/components/dashboard/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { loadInterest } from "@/lib/preferences";

// Chrome wrapper shared by every casino route: auth guard plus the app shell
// with the Casino tab active. Any screen below the hub also gets a back link,
// since the sidebar only points at the hub itself.
export function CasinoPage({ children }: { children: React.ReactNode }) {
  const nav = useMemo(() => buildNav(loadInterest()), []);
  const pathname = usePathname();
  const isHub = pathname === "/casino";

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="casino">
        {isHub ? null : (
          <div className="mx-auto w-full max-w-[1520px] px-4 pt-5 sm:px-6 lg:px-8">
            <Link
              href="/casino"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white"
            >
              <ChevronLeftIcon size={12} />
              Casino
            </Link>
          </div>
        )}
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}
