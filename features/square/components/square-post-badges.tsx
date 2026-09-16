"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import {
  BadgeArkGlyph,
  BadgeMarketGlyph,
} from "@/features/square/components/square-org-badge-glyphs";

/**
 * The marks beside an author's name on the Square's post card, carried over
 * from market-square-frontend/components/ui/badge.tsx: the verified seal,
 * the organisation lockup, and the role chip for the two roles that wear
 * one. Each renders nothing for an account that has not earned it.
 */

/** The Square's verification seal: the file's own gradient badge. */
export function VerifiedBadge({
  verification,
  className,
}: {
  verification: string | undefined;
  className?: string;
}) {
  const gradient = `verified-${useId().replace(/:/g, "")}`;
  if (verification !== "verified") return null;
  return (
    <span
      title="Verified"
      className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center", className)}
    >
      <span className="sr-only">Verified</span>
      <svg viewBox="0 0 132 131" fill="none" aria-hidden className="h-full w-full">
        <path
          d="M61.6855 3.67676C64.0942 1.65336 67.608 1.65336 70.0166 3.67676L77.835 10.2441C80.1441 12.1839 83.1601 13.0701 86.1514 12.6865L96.2783 11.3877C99.3984 10.9877 102.355 12.8874 103.287 15.8916L106.313 25.6445C107.207 28.5247 109.266 30.8998 111.989 32.1943L121.211 36.5771C123.963 37.8853 125.42 40.9261 124.744 43.8711L124.673 44.1562L121.945 53.9951C121.14 56.9014 121.587 60.0125 123.179 62.5742L128.567 71.2471V71.248C130.227 73.92 129.727 77.398 127.382 79.4941L119.769 86.2979C117.52 88.3074 116.214 91.1662 116.168 94.1816L116.012 104.392C115.964 107.537 113.662 110.193 110.556 110.688L100.473 112.296C97.4946 112.771 94.8507 114.47 93.1816 116.981L87.5312 125.485C85.7904 128.105 82.4181 129.096 79.5371 127.833L70.1846 123.733C67.4226 122.523 64.2796 122.523 61.5176 123.733L52.166 127.833C49.2849 129.096 45.9129 128.105 44.1719 125.485L38.5205 116.981C36.8515 114.47 34.2076 112.771 31.2295 112.296L21.1465 110.688C18.04 110.193 15.7386 107.537 15.6904 104.392L15.5342 94.1816C15.4881 91.1662 14.1823 88.3074 11.9336 86.2979L4.32031 79.4941C1.97483 77.3979 1.47467 73.9191 3.13477 71.2471L8.52344 62.5742C10.1149 60.0125 10.5623 56.9014 9.75684 53.9951L7.03027 44.1562C6.1901 41.1246 7.64988 37.9276 10.4912 36.5771L19.7129 32.1943C22.4368 30.8997 24.4949 28.524 25.3887 25.6436L28.4141 15.8926C29.3463 12.888 32.3035 10.9876 35.4238 11.3877L45.5508 12.6865C48.542 13.07 51.5581 12.1839 53.8672 10.2441L61.6855 3.67676ZM97.0977 44.5439C93.6268 41.8062 88.6326 42.1414 85.5576 45.3164L85.2568 45.6426L60.7627 73.6299L47.8379 62.1436C44.3846 59.0753 39.1563 59.2826 35.9531 62.5381L35.6494 62.8633C32.58 66.3171 32.7881 71.545 36.0439 74.748L36.3682 75.0518L52.542 89.4297C57.8332 94.1333 65.9039 93.7098 70.6738 88.5312L70.8984 88.2803L98.2549 57.0117C101.394 53.4224 101.028 47.9688 97.4404 44.8291L97.4395 44.8281L97.0977 44.5439Z"
          fill={`url(#${gradient})`}
          stroke="#9E58FF"
          strokeWidth="4.3176"
        />
        <defs>
          <linearGradient
            id={gradient}
            x1="92.4598"
            y1="14.6278"
            x2="62.2366"
            y2="135.521"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#A361FF" />
            <stop offset="0.429415" stopColor="#623A99" />
            <stop offset="0.961538" stopColor="#9F5AFF" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}

/** The organisation lockup: "market" or "ark", bare beside a name. */
export function OrgBadgeChip({
  orgBadge,
  className,
  bare = false,
}: {
  orgBadge: string | null | undefined;
  className?: string;
  bare?: boolean;
}) {
  if (orgBadge !== "market" && orgBadge !== "ark") return null;
  const Glyph = orgBadge === "market" ? BadgeMarketGlyph : BadgeArkGlyph;
  return (
    <span
      title={orgBadge === "market" ? "Market" : "Ark"}
      className={cn(
        "inline-flex shrink-0 items-center",
        !bare && "rounded-[21px] border bg-white/[0.04] px-1 py-[2.5px]",
        !bare && (orgBadge === "market" ? "border-[#008CFF]" : "border-white/[0.19]"),
        className
      )}
    >
      <span className="sr-only">{orgBadge === "market" ? "Market" : "Ark"}</span>
      <Glyph
        className={
          bare
            ? orgBadge === "market"
              ? "h-[14px] w-[71px]"
              : "h-[9px] w-[44px]"
            : orgBadge === "market"
              ? "h-[7px] w-[35px]"
              : "h-[7px] w-[34px]"
        }
      />
    </span>
  );
}

const ROLE_LABEL: Record<string, string | null> = {
  citizen: null,
  creator: null,
  ambassador: "Ambassador",
  worldstreet: "WorldStreet",
};

export function RoleChip({ role, className }: { role: string; className?: string }) {
  const label = ROLE_LABEL[role] ?? null;
  if (!label) return null;
  return (
    <span
      className={cn(
        "text-grey-200 inline-flex shrink-0 items-center rounded-[21px] border border-white/[0.19] bg-white/[0.04] px-2 py-px text-[9px] font-semibold tracking-wide uppercase",
        className
      )}
    >
      {label}
    </span>
  );
}
