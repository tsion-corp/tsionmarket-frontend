"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { buildNav } from "@/components/dashboard/nav-items";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { loadInterest } from "@/lib/preferences";

// Names for the routes that are somewhere to go back to. Anything else falls
// back to its own last path segment.
const ROUTE_LABEL: Record<string, string> = {
  "/earn": "Earn",
  "/earn/listing": "Earn",
  "/earn/sponsor": "Your company",
  "/earn/sponsor/listing": "Your company",
};

function titleCase(segment: string): string {
  const words = segment.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Back goes up one level rather than always to the browse feed, so a
// submission list returns to the listing it belongs to.
export function parentRoute(pathname: string): { href: string; label: string } {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return { href: "/earn", label: "Earn" };
  const href = `/${parts.slice(0, -1).join("/")}`;
  return { href, label: ROUTE_LABEL[href] ?? titleCase(parts[parts.length - 2]) };
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
