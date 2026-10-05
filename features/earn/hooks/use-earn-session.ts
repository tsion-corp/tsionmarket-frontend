"use client";

import { useAuthSession } from "@/hooks/use-auth-session";

// The personal Earn reads (profile, submissions, sponsor, notifications) all
// need a session, and Earn pages are open to visitors.
export function useEarnSignedIn(): boolean {
  const { ready, authenticated } = useAuthSession();
  return ready && authenticated;
}
