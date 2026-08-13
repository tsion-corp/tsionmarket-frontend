"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ChevronLeftIcon } from "@/components/ui/icons";
import {
  CasinoNavGuardProvider,
  useCasinoNavGuard,
} from "@/features/casino/components/casino-nav-guard";
import { parentRoute } from "@/features/casino/components/casino-page";
import { usePrefetchDepositCatalog } from "@/hooks/use-catalog-prefetch";
import { markKnownUser } from "@/lib/known-user";
import { cn } from "@/lib/utils";

function RoundBackLink({ pathname }: { pathname: string }) {
  const guard = useCasinoNavGuard();
  const { href, label } = parentRoute(pathname);

  return (
    <Link
      href={href}
      onClick={(event) => {
        if (guard.blocked()) event.preventDefault();
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-sans text-[12px] font-medium text-white/62 transition-colors hover:border-white/24 hover:text-white"
    >
      <ChevronLeftIcon size={12} />
      {label}
    </Link>
  );
}

function RoundNavLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium transition-colors",
        active
          ? "border-white/22 bg-white/10 text-white"
          : "border-white/8 bg-white/[0.03] text-white/62 hover:border-white/18 hover:text-white"
      )}
    >
      {label}
    </Link>
  );
}

export function ChessRoundPageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/casino/chess";
  const tPlay = useTranslations("casino.chess.play");

  useEffect(() => {
    markKnownUser();
  }, []);

  usePrefetchDepositCatalog();

  return (
    <AuthGuard>
      <CasinoNavGuardProvider>
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_34%),linear-gradient(180deg,#0d0d0d_0%,#070707_100%)] text-white">
          <header className="sticky top-0 z-[70] border-b border-white/8 bg-black/72 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[1720px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <RoundBackLink pathname={pathname} />
                <div className="hidden h-5 w-px bg-white/10 sm:block" />
                <Link
                  href="/casino/chess"
                  className="min-w-0 truncate font-sans text-[13px] font-semibold tracking-[0.18em] text-white/82 uppercase"
                >
                  Ark Chess
                </Link>
              </div>

              <nav className="flex flex-wrap items-center gap-2">
                <RoundNavLink
                  href="/casino/chess/create"
                  label={tPlay("navNewGame")}
                  active={pathname.startsWith("/casino/chess/create")}
                />
                <RoundNavLink
                  href="/casino/chess/history"
                  label={tPlay("navGames")}
                  active={pathname.startsWith("/casino/chess/history")}
                />
              </nav>
            </div>
          </header>

          <main className="pt-6 pb-10">{children}</main>
        </div>
      </CasinoNavGuardProvider>
    </AuthGuard>
  );
}
