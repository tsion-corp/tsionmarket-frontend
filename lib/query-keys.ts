"use client";

import type { StaticAddressRequest } from "@/lib/deposit";

/**
 * Centralized Query Key Factory
 *
 * Ensures all hooks and components use strictly identical cache keys,
 * preventing cache misses and duplicate network requests across the application.
 */
export const queryKeys = {
  user: {
    all: ["user"] as const,
    me: () => [...queryKeys.user.all, "me"] as const,
    session: () => [...queryKeys.user.all, "session"] as const,
  },
  portfolio: {
    all: ["portfolio"] as const,
    byWallet: (evm?: string | null, solana?: string | null) =>
      [...queryKeys.portfolio.all, evm ?? null, solana ?? null] as const,
  },
  activity: {
    all: ["activity"] as const,
    byWallet: (evm?: string | null, solana?: string | null) =>
      [...queryKeys.activity.all, evm ?? null, solana ?? null] as const,
  },
  kash: {
    all: ["kash"] as const,
    status: () => [...queryKeys.kash.all, "status"] as const,
    account: (wallet?: string | null) =>
      [...queryKeys.kash.all, "account", wallet ?? null] as const,
  },
  dextopus: {
    all: ["dextopus"] as const,
    chains: () => ["deposit-chains"] as const,
    tokens: (chainId?: number | null) => ["deposit-tokens", chainId ?? null] as const,
    masterEligibility: () => ["deposit-master-eligibility"] as const,
    staticAddress: (req: StaticAddressRequest | null) =>
      [
        "deposit-static",
        req?.userId ?? null,
        req?.settlementChainId ?? null,
        req?.originChainId ?? null,
        req?.originAsset ?? null,
      ] as const,
    status: (requestId: string | null, purpose: string = "deposit") =>
      [...queryKeys.dextopus.all, "status", purpose, requestId ?? null] as const,
  },
} as const;
