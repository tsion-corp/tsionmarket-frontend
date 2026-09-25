"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { useMoney } from "@/components/ui/currency-select";
import { LegacyChessBalance } from "@/features/casino/components/chess-app/legacy-chess-balance";
import { usePortfolio } from "@/hooks/use-portfolio";
import styles from "./chess-profile-balance.module.css";

export function ChessHeaderActions({
  placement = "overlay",
}: {
  placement?: "header" | "overlay";
}) {
  const pathname = usePathname();
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();

  if (!ready || !authenticated || pathname === "/casino/chess/embed") return null;

  const placementClass =
    placement === "header"
      ? "relative flex h-full min-w-0 items-center justify-end"
      : "pointer-events-none fixed top-[66px] right-0 z-[120] flex h-[52px] w-[232px] items-center justify-end md:top-[79px] min-[1020px]:h-[60px] min-[1020px]:w-[304px]";

  return (
    <div
      className={placementClass}
      data-chess-header-actions
      data-placement={placement}
    >
      <span className={placement === "overlay" ? "pointer-events-auto" : undefined}>
        <ChessProfileBalance />
      </span>
    </div>
  );
}

export function ChessProfileBalance({
  compact = false,
  showArkadeLink = true,
}: { compact?: boolean; showArkadeLink?: boolean } = {}) {
  const { totalUsd, loading, error } = usePortfolio({ scope: "base" });
  const money = useMoney();
  const { mask } = useBalanceVisibility();
  const value = loading ? "…" : error ? "—" : mask(money.format(totalUsd));

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      style={{ marginInlineEnd: compact ? undefined : "16px" }}
    >
      {showArkadeLink ? <Link
        href="/casino"
        className={`${styles.arkadeAction} hidden h-9 shrink-0 items-center rounded-[9px] border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold tracking-[0.02em] text-white/60 no-underline transition-colors hover:border-white/20 hover:bg-white/[0.075] hover:text-white min-[1020px]:inline-flex`}
        aria-label="Back to Arkade"
      >
        Arkade
      </Link> : null}
      <LegacyChessBalance compact={compact} />
      <Link
        href="/dashboard"
        className={`${styles.profileAction} flex h-10 ${compact ? "min-w-[84px] sm:min-w-[104px]" : "min-w-[104px]"} shrink-0 self-center items-center justify-end rounded-[10px] border border-white/10 bg-white/[0.045] px-3 text-right no-underline shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:border-white/20 hover:bg-white/[0.075]`}
        aria-label={error ? "Profile balance unavailable" : `Profile balance ${value}`}
        data-sensitive="balance"
      >
        <span>
          <span className="block text-[8px] leading-none font-bold tracking-[0.11em] text-white/35 uppercase">
            Balance
          </span>
          <span className="tnum mt-1 block text-[12px] leading-none font-semibold text-white/80">
            {value}
          </span>
        </span>
      </Link>
    </div>
  );
}
