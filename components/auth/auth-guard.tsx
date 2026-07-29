"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { toast } from "@/lib/toast";

// Sign the user out after this long with no interaction, so a funded session
// left open on an unattended device doesn't stay open.
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/auth");
    }
  }, [ready, authenticated, router]);

  useIdleLogout(IDLE_TIMEOUT_MS, ready && authenticated, () =>
    toast.info("Signed out after 5 minutes of inactivity. Please sign in again.")
  );

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <span className="grid h-12 w-12 animate-pulse place-items-center rounded-full border border-white/18 bg-white/8">
          <span className="ws-display text-accent text-[26px] leading-none">w</span>
        </span>
        <span className="text-sm text-white/50">Opening World Street…</span>
      </div>
    );
  }

  return <>{children}</>;
}
