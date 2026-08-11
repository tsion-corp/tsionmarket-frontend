"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { buildNav } from "@/components/layout/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { loadInterest } from "@/lib/preferences";

// The earn routes that have a page of their own, and what to call them.
// `/earn/listing` and `/earn/sponsor/listing` are missing on purpose: they are
// grouping segments with no page, so a back link pointing at either 404s.
const ROUTE_LABEL: Record<string, string> = {
  "/earn": "Earn",
  "/earn/sponsor": "Your company",
};

// Back goes to the nearest ancestor that is a real page, so a listing under a
// company returns to the company rather than to the segment in between.
export function parentRoute(pathname: string): { href: string; label: string } {
  const parts = pathname.split("/").filter(Boolean);
  for (let depth = parts.length - 1; depth > 0; depth--) {
    const href = `/${parts.slice(0, depth).join("/")}`;
    const label = ROUTE_LABEL[href];
    if (label) return { href, label };
  }
  return { href: "/earn", label: "Earn" };
}

function BackLink({ pathname }: { pathname: string }) {
  const { href, label } = parentRoute(pathname);

  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 pt-5 sm:px-6 lg:px-8">
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12.5px] font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white"
      >
        <ChevronLeftIcon size={12} />
        {label}
      </Link>
    </div>
  );
}

// Chrome wrapper shared by every earn route: auth guard plus the app shell with
// the Earn tab active. Any screen below the feed also gets a back link, since
// the sidebar only points at the feed itself.
export function EarnPage({ children }: { children: React.ReactNode }) {
  const tSections = useTranslations("sections");
  const nav = useMemo(() => buildNav(loadInterest(), tSections), [tSections]);
  const pathname = usePathname();
  const isFeed = pathname === "/earn";

  return (
    <AuthGuard>
      <DashboardShell nav={nav} activeSection="earn">
        {isFeed || !pathname ? null : <BackLink pathname={pathname} />}
        {children}
      </DashboardShell>
    </AuthGuard>
  );
}
