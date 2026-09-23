"use client";

import { useTranslations } from "next-intl";
import { useReferralStats } from "@/features/referrals/hooks/use-referrals";
import {
  ClaimScreen,
  InviteScreen,
  Spinner,
} from "@/features/referrals/components/referral-screens";

/**
 * The referral page.
 *
 * It was a modal opened from the account menu. A page instead, for two
 * reasons: the network view is something people come back to and read rather
 * than glance at, and a route can be linked, shared and returned to, which a
 * sheet that only exists while a menu is open cannot.
 *
 * Until a username exists there is no invite link and nothing below this
 * person, so a first visit is the claim step and nothing else.
 */
export function ReferralView() {
  const t = useTranslations("referral");
  const stats = useReferralStats(true);

  // A page, not a sheet, so the column grows with the viewport instead of
  // holding a 520px strip in the middle of a desktop. The claim step keeps a
  // narrow measure of its own: it is a single form, and a form stretched to
  // 1100px is harder to fill, not easier.
  const claiming = !stats.isPending && !stats.isError && !stats.data?.username;

  return (
    <div
      className={
        "mx-auto w-full px-4 pt-2 pb-16 sm:px-6 lg:px-8 " +
        (claiming ? "max-w-[520px]" : "max-w-[1180px]")
      }
    >
      <h1 className="ws-display text-center text-[19px] lg:text-left lg:text-[24px]">
        {t("title")}
      </h1>

      <div className="mt-4 lg:mt-5">
        {stats.isPending ? (
          <Spinner />
        ) : stats.isError || !stats.data ? (
          <div className="py-14 text-center">
            <p className="text-[13.5px] font-normal text-white/55">{t("loadFailed")}</p>
            <button
              onClick={() => void stats.refetch()}
              className="mt-4 cursor-pointer rounded-full border border-white/14 bg-white/6 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-white/10"
            >
              {t("retry")}
            </button>
          </div>
        ) : stats.data.username ? (
          <InviteScreen
            username={stats.data.username}
            referred={stats.data.referred}
            pending={stats.data.pending}
            referrals={stats.data.referrals}
          />
        ) : (
          <ClaimScreen />
        )}
      </div>
    </div>
  );
}
