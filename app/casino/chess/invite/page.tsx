"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { InviteSection } from "@/features/casino";

function InviteFromParams() {
  return <InviteSection inviteCode={useSearchParams()?.get("code") ?? null} />;
}

// No app shell on purpose: a challenge link lands on a focused offer card.
export default function ChessInvitePage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <InviteFromParams />
      </Suspense>
    </AuthGuard>
  );
}
