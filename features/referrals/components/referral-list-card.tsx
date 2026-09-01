"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  referralHandle,
  splitReferrals,
  type ReferralEntry,
} from "@/features/referrals/lib/referrals";
import { ReferralCard } from "@/features/referrals/components/referral-card";

/**
 * The invited people, split across an Active / Inactive toggle.
 *
 * Built to the "referral list" component set, both variants: the comp's
 * balcard holding a 48px pill-shaped segmented control, a 24px gap, then 49px
 * rows. Every number below is the file's, not a guess.
 *
 * The status pill is the only thing that differs between the two lists, and
 * the file gives each its own colour: green for a referral that has paid out,
 * amber for one still waiting on the deposit.
 */

const TABS = ["active", "inactive"] as const;
type Tab = (typeof TABS)[number];

/** The comp's two pill treatments, at its exact alphas. */
const PILL: Record<Tab, string> = {
  active: "border-[#7CE7B0]/25 bg-[#7CE7B0]/12 text-[#7CE7B0]",
  inactive: "border-[#F5C619]/25 bg-[#F5C619]/12 text-[#F5C619]",
};

function StatusPill({ tab, label }: { tab: Tab; label: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] leading-[13px] font-medium",
        PILL[tab]
      )}
    >
      {label}
    </span>
  );
}

function Row({ entry, tab, status }: { entry: ReferralEntry; tab: Tab; status: string }) {
  return (
    <li className="flex min-h-[49px] items-center justify-between gap-3 px-2 py-4">
      {/* A handle when the invitee claimed one, their truncated wallet when
          they did not. The comp draws only the handle case, since it does not
          show an invitee who never picked a name. */}
      <span className="tnum min-w-0 truncate text-[12px] leading-[15.6px] font-medium text-white">
        {referralHandle(entry)}
      </span>
      <StatusPill tab={tab} label={status} />
    </li>
  );
}

export function ReferralListCard({
  referrals,
  referred,
  pending,
}: {
  referrals?: ReferralEntry[];
  /** Counted referrals, the number behind the Active tab. */
  referred: number;
  /** Joined but not yet deposited, the number behind the Inactive tab. */
  pending: number;
}) {
  const t = useTranslations("referral");
  const [tab, setTab] = useState<Tab>("active");
  const { active, inactive } = splitReferrals(referrals);
  const rows = tab === "active" ? active : inactive;

  // The engine reports the two totals but not yet the people behind them, so a
  // tab can know it has three referrals and still have no rows to draw. Saying
  // "none yet" there would contradict the Progress card directly above, which
  // is counting the same referrals. Say the count instead, and name the reason.
  const total = tab === "active" ? referred : pending;
  const countedButUnlisted = rows.length === 0 && total > 0;

  return (
    <ReferralCard className="mt-3">
      {/* 326x48 in a 358 card: a 4px inset track holding two 40px pills with
          8px between them. Tab semantics, not plain buttons: these select one
          of two views, and a screen reader should hear it that way. */}
      <div
        role="tablist"
        aria-label={t("listTitle")}
        className="flex items-center gap-2 rounded-full bg-white/4 p-1"
      >
        {TABS.map((value) => {
          const selected = tab === value;
          return (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setTab(value)}
              className={cn(
                "h-10 flex-1 cursor-pointer rounded-full text-[10px] leading-[14px] font-medium transition-colors",
                selected ? "bg-white/10 text-white" : "text-[#7A7A7A] hover:text-white/70"
              )}
            >
              {value === "active" ? t("activeTab") : t("inactiveTab")}
            </button>
          );
        })}
      </div>

      {/* The comp's 24px between the control and the first row. */}
      <div className="mt-6">
        {rows.length > 0 ? (
          <ul>
            {rows.map((entry, i) => (
              <Row
                key={entry.wallet || `${tab}-${i}`}
                entry={entry}
                tab={tab}
                status={tab === "active" ? t("counted") : t("depositPending")}
              />
            ))}
          </ul>
        ) : (
          // The comp draws no empty state, because it draws a populated list.
          // Held at one row's height so switching tabs does not resize the
          // card under the pointer.
          <p className="flex min-h-[49px] items-center justify-center px-2 text-center text-[12px] leading-[15.6px] font-normal text-white/40">
            {countedButUnlisted
              ? t("listUnavailable", { count: total })
              : tab === "active"
                ? t("noActive")
                : t("noInactive")}
          </p>
        )}
      </div>
    </ReferralCard>
  );
}
