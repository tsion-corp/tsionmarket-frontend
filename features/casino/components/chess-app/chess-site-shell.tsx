"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCasinoNavGuard } from "@/features/casino/components/casino-nav-guard";
import { ChessHeaderActions } from "@/features/casino/components/chess-app/chess-profile-balance";
import { usePrefetchDepositCatalog } from "@/hooks/use-catalog-prefetch";
import { markKnownUser } from "@/lib/known-user";
import { cn } from "@/lib/utils";

interface ChessNavItem {
  label: string;
  href: string;
  paths: readonly string[];
}

const CHESS_NAV: readonly ChessNavItem[] = [
  {
    label: "Play",
    href: "/casino/chess",
    paths: [
      "/casino/chess",
      "/casino/chess/invite",
      "/casino/chess/matchmaking",
      "/casino/chess/play",
      "/casino/chess/tournaments",
      "/casino/chess/swiss",
    ],
  },
  {
    label: "Puzzles",
    href: "/casino/chess/puzzles",
    paths: ["/casino/chess/puzzles", "/casino/chess/coach-lab"],
  },
  {
    label: "Learn",
    href: "/casino/chess/learn",
    paths: [
      "/casino/chess/learn",
      "/casino/chess/learn/practice",
      "/casino/chess/learn/studies",
    ],
  },
  {
    label: "Watch",
    href: "/casino/chess/watch",
    paths: ["/casino/chess/watch"],
  },
];

function itemIsActive(item: ChessNavItem, pathname: string): boolean {
  if (item.href === "/casino/chess") {
    return item.paths.some((path) =>
      path === "/casino/chess" ? pathname === path : pathname.startsWith(path)
    );
  }
  return item.paths.some((path) => pathname.startsWith(path));
}

function ChessNavLink({ item }: { item: ChessNavItem }) {
  const pathname = usePathname() ?? "/casino/chess";
  const guard = useCasinoNavGuard();
  const active = itemIsActive(item, pathname);

  return (
    <section>
      <Link
        href={item.href}
        className="topnav-link"
        aria-current={active ? "page" : undefined}
        onClick={(event) => {
          if (guard.blocked()) event.preventDefault();
        }}
      >
        {item.label}
      </Link>
    </section>
  );
}

export function ChessSiteHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header
      id="top"
      className="chess-site-header"
      data-compact={compact || undefined}
      style={{
        position: "sticky",
        top: 0,
        width: "100%",
        maxWidth: "none",
        background: "#000",
      }}
    >
      <div className="site-title-nav">
        <input
          type="checkbox"
          id="tn-tg"
          className="topnav-toggle fullscreen-toggle"
          autoComplete="off"
          aria-label="Navigation"
        />
        <label htmlFor="tn-tg" className="fullscreen-mask" />
        <label htmlFor="tn-tg" className="hbg">
          <span className="hbg__in" />
        </label>
        <Link className="site-title" href="/casino/chess" aria-label="Ark Chess home">
          <div className="site-icon" data-icon="" />
          <div className="site-name">
            ark<span>.chess</span>
          </div>
        </Link>
        <nav id="topnav" className="hover" aria-label="Chess">
          <section className="arkade-mobile">
            <Link className="topnav-link mobile-only" href="/casino">
              Back to Arkade
            </Link>
          </section>
          {CHESS_NAV.map((item) => (
            <ChessNavLink key={item.label} item={item} />
          ))}
        </nav>
      </div>
      <div className="chess-header-actions-space" data-chess-header-actions-space>
        <ChessHeaderActions placement="header" />
      </div>
    </header>
  );
}

export function ChessSiteShell({
  children,
  compact = false,
  fixedViewport = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
  fixedViewport?: boolean;
}) {
  useEffect(() => {
    markKnownUser();
  }, []);

  usePrefetchDepositCatalog();

  return (
    <>
      <div
        className={cn(
          "ark-chess-page relative bg-black text-white",
          fixedViewport
            ? "min-h-[calc(100dvh-158px-var(--ws-live-bar,0px))] overflow-x-hidden md:min-h-[calc(100dvh-79px-var(--ws-live-bar,0px))] xl:flex xl:h-[calc(100dvh-79px-var(--ws-live-bar,0px))] xl:min-h-0 xl:flex-col xl:overflow-hidden"
            : "min-h-[calc(100dvh-158px-var(--ws-live-bar,0px))] overflow-x-hidden md:min-h-[calc(100dvh-79px-var(--ws-live-bar,0px))]"
        )}
      >
        <ChessSiteHeader compact={compact} />
        <main
          className={cn(
            "relative min-w-0",
            fixedViewport && "xl:min-h-0 xl:flex-1 xl:overflow-hidden"
          )}
        >
          {children}
        </main>
      </div>
    </>
  );
}
