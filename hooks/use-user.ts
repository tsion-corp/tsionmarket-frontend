"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { queryKeys } from "@/lib/query-keys";
import { deriveProfile, getWalletAddress, isWalletDelegated } from "@/lib/user";
import { fetchCurrentUser, type AuthMeResponse } from "@/lib/api/services/user";

export interface UserSessionData {
  /** The raw Privy user object */
  user: ReturnType<typeof usePrivy>["user"];
  /** Derived profile information (display name, email, avatarSeed) */
  profile: ReturnType<typeof deriveProfile>;
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
  const { ready, authenticated, user } = usePrivy();

  const enabled = ready && authenticated && !!user;

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

  const evmAddress = useMemo(() => getWalletAddress(user, "ethereum"), [user]);
  const solanaAddress = useMemo(() => getWalletAddress(user, "solana"), [user]);
  const profile = useMemo(() => deriveProfile(user), [user]);

  const isEvmDelegated = useMemo(() => {
    if (!user) return false;
    return isWalletDelegated(user, "ethereum");
  }, [user]);

  const isSolanaDelegated = useMemo(() => {
    if (!user) return false;
    return isWalletDelegated(user, "solana");
  }, [user]);

  const isDelegated = isEvmDelegated || isSolanaDelegated;

  return {
    user,
    profile,
    evmAddress,
    solanaAddress,
    isEvmDelegated,
    isSolanaDelegated,
    isDelegated,
    verifiedSession: verifiedSession ?? null,
    isAuthenticated: authenticated,
    isLoading: !ready || (enabled && isQueryLoading),
    error,
  };
}
