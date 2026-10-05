"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { useSignedIn } from "@/hooks/use-signed-in";
import { openSignIn } from "@/hooks/use-sign-in";
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
  const tAuth = useTranslations("auth");
  const signedOut = useSignedIn() === "no";
  const stats = useReferralStats(true);

  // A page, not a sheet, so the column grows with the viewport instead of
  // holding a 520px strip in the middle of a desktop. The claim step keeps a
  // narrow measure of its own: it is a single form, and a form stretched to
  // 1100px is harder to fill, not easier.
  // The claim form is the whole screen only for someone who has NO link at
  // all. Since kash gives every wallet a code (ADR-0015) that is nobody who
  // has loaded, so this is now the narrow case: an engine that predates the
  // code, or a read that has not landed. A username is an upgrade to a nicer
  // link, offered inside the invite screen, not a toll gate in front of it.
  const shareCode = stats.data?.username ?? stats.data?.refCode ?? null;
  // Asked for from the invite screen, where the link already works: claiming a
  // username is the upgrade to a nicer one, not a gate in front of it.
  const [wantsUsername, setWantsUsername] = useState(false);
  const claiming =
    !stats.isPending && !stats.isError && (!shareCode || (wantsUsername && !stats.data?.username));

  return (
    <div
      className={
        // The page width the portfolio sets, which is the app's. The claim step
        // keeps its narrow column: it is one field and a button, and a form
        // stretched across 1520px is not easier to fill in.
        "mx-auto w-full p-4 sm:p-6 lg:p-8 " + (claiming ? "max-w-[520px]" : "max-w-[1520px]")
      }
    >
      <h1 className="ws-display text-center text-[clamp(20px,2vw,28px)] lg:text-left">
        {t("title")}
      </h1>

      <div className="mt-4 lg:mt-5">
        {signedOut ? (
          <div className="py-14 text-center">
            <p className="text-[13.5px] font-normal text-white/55">{tAuth("signInToInvite")}</p>
            <button
              type="button"
              onClick={openSignIn}
              className="text-ink mt-4 cursor-pointer rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold hover:opacity-90"
            >
              {tAuth("signIn")}
            </button>
          </div>
        ) : stats.isPending ? (
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
        ) : shareCode && !claiming ? (
          <InviteScreen
            username={shareCode}
            hasUsername={Boolean(stats.data.username)}
            onClaimUsername={() => setWantsUsername(true)}
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
