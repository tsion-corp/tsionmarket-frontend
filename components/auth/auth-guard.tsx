"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { ArkMark } from "@/components/ui/ark-mark";
import { toast } from "@/lib/toast";

// Sign the user out after this long with no interaction, so a funded session
// left open on an unattended device doesn't stay open.
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/auth");
    }
  }, [ready, authenticated, router]);

  useIdleLogout(IDLE_TIMEOUT_MS, ready && authenticated, () =>
    toast.info("Signed out after 15 minutes of inactivity. Please sign in again.")
  );

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <span className="animate-pulse">
          <ArkMark height={26} />
        </span>
        <span className="text-sm text-white/50">Opening Ark…</span>
      </div>
    );
  }

  return <>{children}</>;
}
