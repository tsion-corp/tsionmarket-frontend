"use client";

import { useQuery } from "@tanstack/react-query";
import { useSocialWallet } from "decane-connect-kit";
import { queryKeys } from "@/lib/query-keys";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { Profile } from "@/lib/user";
import { fetchCurrentUser, type AuthMeResponse } from "@/lib/api/services/user";

export interface UserSessionData {
  /** Kept for shape compatibility; Decane has no Privy user object. */
  user: null;
  /** Derived profile information (display name, email, avatarSeed) */
  profile: Profile;
  /** The user's primary embedded Ethereum wallet address */
  evmAddress: string | null;
  /** The user's primary embedded Solana wallet address */
  solanaAddress: string | null;
  /** Whether the EVM embedded wallet has active server delegation */
  isEvmDelegated: boolean;
  /** Whether the Solana embedded wallet has active server delegation */
  isSolanaDelegated: boolean;
  /** True if both wallets (if present) are delegated */
  isDelegated: boolean;
  /** Server-verified session details from /api/auth/me */
  verifiedSession: AuthMeResponse | null;
  /** True if the user is authenticated with Privy */
  isAuthenticated: boolean;
  /** True while Privy or the verified user query is loading */
  isLoading: boolean;
  /** Error from the verified user query, if any */
  error: unknown;
}

/**
 * Unified User Management Hook
 *
 * Combines Privy client-side authentication with TanStack React Query caching
 * for verified user state from `/api/auth/me`.
 *
 * Components across the app can consume this hook without triggering duplicate
 * network requests or manually deriving wallet addresses and profiles.
 */
export function useUser(): UserSessionData {
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  // Decane has no "delegation": an unlocked session can sign natively. Consumers
  // that gated signing on Privy delegation gate on this instead.
  const { isUnlocked } = useSocialWallet();

  const enabled = ready && authenticated;

  const {
    data: verifiedSession,
    isLoading: isQueryLoading,
    error,
  } = useQuery<AuthMeResponse>({
    queryKey: queryKeys.user.me(),
    queryFn: fetchCurrentUser,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    user: null,
    profile,
    evmAddress,
    solanaAddress,
    isEvmDelegated: isUnlocked,
    isSolanaDelegated: isUnlocked,
    isDelegated: isUnlocked,
    verifiedSession: verifiedSession ?? null,
    isAuthenticated: authenticated,
    isLoading: !ready || (enabled && isQueryLoading),
    error,
  };
}
