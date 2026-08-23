"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { AccountModal } from "@/components/layout/modals/account-modal";
import { Avatar } from "@/components/ui/avatar";
import { ModalShell } from "@/components/ui/modal-shell";
import { useCasinoNavGuard } from "@/features/casino/components/casino-nav-guard";
import { useCasinoWallet } from "@/features/casino/hooks/use-casino-wallet";
import { usePrefetchDepositCatalog } from "@/hooks/use-catalog-prefetch";
import { markKnownUser } from "@/lib/known-user";
import { deriveProfile } from "@/lib/user";
import { cn } from "@/lib/utils";

interface ChessNavItem {
  label: string;
  href: string;
  paths: readonly string[];
}

const CHESS_NAV: readonly ChessNavItem[] = [
  { label: "Home", href: "/casino/chess", paths: ["/casino/chess"] },
  {
    label: "Play",
    href: "/casino/chess/create",
    paths: [
      "/casino/chess/create",
      "/casino/chess/invite",
      "/casino/chess/matchmaking",
      "/casino/chess/play",
      "/casino/chess/review",
    ],
  },
  { label: "Puzzles", href: "/casino/chess/puzzles", paths: ["/casino/chess/puzzles"] },
  { label: "Learn", href: "/casino/chess/learn", paths: ["/casino/chess/learn"] },
  { label: "Watch", href: "/casino/chess/watch", paths: ["/casino/chess/watch"] },
  {
    label: "Leaderboard",
    href: "/casino/chess/leaderboard",
    paths: ["/casino/chess/leaderboard"],
  },
  {
    label: "Tournaments",
    href: "/casino/chess/tournaments",
    paths: ["/casino/chess/tournaments", "/casino/chess/swiss"],
  },
  { label: "History", href: "/casino/chess/history", paths: ["/casino/chess/history"] },
];

function KnightMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-[10px] border border-white/14 bg-[linear-gradient(145deg,#6f777d_0%,#3b4146_48%,#22272b_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_22px_rgba(0,0,0,0.32)]",
        compact ? "size-8" : "size-9"
      )}
      aria-hidden
    >
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
        <path
          d="M8.8 4.1 15.7 2l-.8 3.2c2.2 1.6 3.6 4.1 3.6 6.8 0 1.9-.6 3.7-1.9 5.2H8.2c.3-2.8 1.7-5.1 4-6.8l-2.9-1.1-2.2 1.4-1.6-2.1 3.7-2.5-.4-2Z"
          fill="currentColor"
        />
        <path d="M6.5 19h11v2h-11z" fill="currentColor" />
        <circle cx="13.8" cy="6.8" r=".8" fill="#171a1d" />
      </svg>
    </span>
  );
}

function ChessNavLink({
  item,
  compact,
  ensureVisible = false,
}: {
  item: ChessNavItem;
  compact: boolean;
  ensureVisible?: boolean;
}) {
  const pathname = usePathname() ?? "/casino/chess";
  const guard = useCasinoNavGuard();
  const linkRef = useRef<HTMLAnchorElement>(null);
  const active =
    item.label === "Home"
      ? pathname === "/casino/chess"
      : item.paths.some((path) => pathname.startsWith(path));

  useEffect(() => {
    if (!active || !ensureVisible) return;
    linkRef.current?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
  }, [active, ensureVisible, pathname]);

  return (
    <Link
      ref={linkRef}
      href={item.href}
      onClick={(event) => {
        if (guard.blocked()) event.preventDefault();
      }}
      className={cn(
        "relative flex shrink-0 snap-start items-center rounded-[8px] border border-transparent font-sans font-semibold text-white/55 transition-[color,background-color,border-color] hover:border-white/[0.06] hover:bg-white/[0.055] hover:text-white",
        compact ? "h-10 px-3 text-[12px] md:h-8 md:px-2.5" : "h-9 px-3 text-[13px]",
        active &&
          "border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.045))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
      )}
      aria-current={active ? "page" : undefined}
    >
      {item.label}
      {active ? (
        <span className="absolute right-2.5 bottom-0 left-2.5 h-[2px] rounded-full bg-[linear-gradient(90deg,#626a70,#d7dbde,#626a70)]" />
      ) : null}
    </Link>
  );
}

export function ChessSiteHeader({ compact = false }: { compact?: boolean }) {
  const { user } = usePrivy();
  const profile = deriveProfile(user);
  const wallet = useCasinoWallet();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-[80] border-b border-[#252a2e] bg-[#090b0d]/95 shadow-[0_12px_36px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div
          className={cn(
            "mx-auto flex w-full max-w-[1720px] items-center gap-3 px-3 sm:px-5 lg:px-7",
            compact ? "h-[52px]" : "h-[60px]"
          )}
        >
          <Link
            href="/casino/chess"
            className="mr-1 flex shrink-0 items-center gap-2.5"
            aria-label="Ark Chess home"
          >
            <KnightMark compact={compact} />
            <span className="hidden leading-none min-[420px]:block">
              <span className="block font-serif text-[16px] font-bold tracking-[-0.02em] text-white">
                Ark Chess
              </span>
              {!compact ? (
                <span className="mt-1 block text-[8px] font-bold tracking-[0.16em] text-white/30 uppercase">
                  Play · learn · compete
                </span>
              ) : null}
            </span>
          </Link>

          <nav
            aria-label="Chess"
            className="hidden min-w-0 flex-1 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto md:flex [&::-webkit-scrollbar]:hidden"
          >
            {CHESS_NAV.map((item) => (
              <ChessNavLink key={item.label} item={item} compact={compact} />
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/casino/chess#cashier"
              className={cn(
                "hidden items-center rounded-[9px] border border-white/[0.08] bg-white/[0.035] text-right transition-colors hover:border-white/15 hover:bg-white/[0.06] sm:flex",
                compact ? "h-8 px-2.5" : "h-9 px-3"
              )}
            >
              <span className="mr-2 size-1.5 rounded-full bg-[#aeb5ba] shadow-[0_0_8px_rgba(174,181,186,0.45)]" />
              <span>
                <span className="block text-[8px] font-bold tracking-[0.1em] text-white/28 uppercase">
                  Balance
                </span>
                <span className="tnum block text-[11px] leading-tight font-semibold text-white/76">
                  {wallet.isLoading ? "…" : wallet.format(wallet.balanceUsd)}
                </span>
              </span>
            </Link>
            <Link
              href="/casino"
              className="hidden px-2 text-[11px] font-semibold text-white/35 transition-colors hover:text-white/72 xl:block"
            >
              Arkade
            </Link>
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="cursor-pointer rounded-full border border-white/12 transition-colors hover:border-white/28"
              aria-label="Open account"
            >
              <Avatar seed={profile.avatarSeed} size={compact ? 30 : 34} />
            </button>
          </div>
        </div>

        <nav
          aria-label="Chess mobile navigation"
          className="flex snap-x snap-mandatory [scrollbar-width:none] items-center gap-1 overflow-x-auto overscroll-x-contain border-t border-white/[0.055] px-2 py-1.5 md:hidden [&::-webkit-scrollbar]:hidden"
        >
          {CHESS_NAV.map((item) => (
            <ChessNavLink key={item.label} item={item} compact ensureVisible />
          ))}
        </nav>
      </header>

      <ModalShell open={accountOpen} onClose={() => setAccountOpen(false)}>
        <AccountModal onClose={() => setAccountOpen(false)} />
      </ModalShell>
    </>
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
    <div
      className={cn(
        "relative bg-[#080a0c] text-white",
        fixedViewport
          ? "min-h-dvh overflow-x-hidden xl:flex xl:h-dvh xl:min-h-0 xl:flex-col xl:overflow-hidden"
          : "min-h-dvh overflow-x-hidden"
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(circle at 14% -8%, rgba(164,173,180,0.075), transparent 31%), radial-gradient(circle at 88% 12%, rgba(255,255,255,0.028), transparent 25%), linear-gradient(180deg, #0d1012 0%, #090b0d 42%, #07090a 100%)",
        }}
      />
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
  );
}
