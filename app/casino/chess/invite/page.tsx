"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { InviteSection } from "@/components/dashboard/casino/chess/invite-section";
import {
  parseCurrencyParam,
  parseStakeMinorParam,
  parseTimeControlParam,
} from "@/lib/casino/stake-params";

function InviteFromParams() {
  const params = useSearchParams();
  return (
    <InviteSection
      stakeMinor={parseStakeMinorParam(params.get("stake"))}
      currency={parseCurrencyParam(params.get("cur"))}
      timeControl={parseTimeControlParam(params.get("tc"))}
    />
  );
}

// No app shell here on purpose: a challenge link lands on a focused offer
// card, not the dashboard chrome.
export default function ChessInvitePage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <InviteFromParams />
      </Suspense>
    </AuthGuard>
  );
}
