"use client";

import Link from "next/link";
import { AssetIcon } from "@/components/ui/asset-icon";
import { SkeletonLine } from "@/components/ui/skeleton-line";

interface PreviewRowProps {
  /** Where the row leads: the service's own page. */
  href: string;
  sym: string;
  /** Dropped when it only repeats the ticker. */
  name?: string;
  logo?: string | null;
  bg: string;
  /** Already formatted. Money math stays in the feature that owns the number. */
  price: string;
  /** 24h move as a percentage. Omit for a feed that does not publish one. */
  change?: number | null;
  /** A short muted line shown in place of the change, e.g. "Up to 50x". */
  note?: string;
}

function changeLabel(change: number): string {
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}

// One asset in a dashboard overview: icon, ticker, price, movement. The whole
// row is a link because an overview is a doorway, not a desk. It takes the
// price pre-formatted so this layer never does money math.
export function PreviewRow({ href, sym, name, logo, bg, price, change, note }: PreviewRowProps) {
  const showName = name && name.toLowerCase() !== sym.toLowerCase();

  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-t border-white/6 px-4 py-3 transition-colors hover:bg-white/4 sm:px-5"
    >
      <AssetIcon sym={sym} bg={bg} logo={logo} size={30} fallback="gradient" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-[14px] font-medium">{sym}</div>
        {showName ? (
          <div className="truncate text-[11.5px] font-normal text-white/45">{name}</div>
        ) : null}
      </div>
      <div className="text-right">
        <div className="tnum text-[13.5px] font-normal">{price}</div>
        {change != null ? (
          <div
            className={`tnum text-[11.5px] font-normal ${change >= 0 ? "text-up" : "text-down"}`}
          >
            {changeLabel(change)}
          </div>
        ) : note ? (
          <div className="text-[11.5px] font-normal text-white/40">{note}</div>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Placeholder rows with the exact geometry of PreviewRow: the same icon, the
 * same two lines of the same font sizes on each side. Rows arrive with a name
 * and a change figure, so the skeleton assumes both; a row without them is
 * shorter, and shrinking is the one direction that costs nothing above.
 */
export function PreviewRowSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-white/6 px-4 py-3 sm:px-5">
          <div className="h-[30px] w-[30px] shrink-0 animate-pulse rounded-full bg-white/8" />
          <div className="min-w-0 flex-1">
            <div className="font-sans text-[14px] font-medium">
              <SkeletonLine width="w-16" />
            </div>
            <div className="text-[11.5px] font-normal">
              <SkeletonLine width="w-24" />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[13.5px] font-normal">
              <SkeletonLine width="w-16" />
            </div>
            <div className="text-[11.5px] font-normal">
              <SkeletonLine width="w-10" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** What the block says instead of rows when there is nothing to show. */
export function PreviewNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-white/6 px-4 py-8 text-center text-[13px] font-normal text-white/45 sm:px-5">
      {children}
    </div>
  );
}
