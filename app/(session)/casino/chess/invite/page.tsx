"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { InviteSection } from "@/features/casino";

function InviteFromParams() {
  return <InviteSection inviteCode={useSearchParams()?.get("code") ?? null} />;
}

export default function ChessInvitePage() {
  return (
    <CasinoPage hideBackLink>
      <Suspense fallback={null}>
        <InviteFromParams />
      </Suspense>
    </CasinoPage>
  );
}
