"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  normalizeInitiation,
  normalizeKycState,
  type KycInitiation,
  type KycState,
} from "@/features/funds/lib/kyc";

import { pouchPostWithAuth, pouchGetWithAuth } from "@/lib/api/services/funds";

// Client hooks over the Shared KYC proxy routes. Each returns normalized domain
// objects; raw provider shapes stay behind the /api/pouch boundary. The user's
// JWT is passed as an argument and forwarded as an Authorization header.

export function useKycInitiate() {
  return useMutation<KycInitiation, Error, { email: string; countryCode: string }>({
    mutationFn: async ({ email, countryCode }) => {
      const data = await pouchPostWithAuth<unknown>("/kyc/initiate", { email, countryCode });
      return normalizeInitiation(data);
    },
  });
}

export interface KycVerifyResult {
  token: string;
  expiresAt: string;
}

export function useKycVerify() {
  return useMutation<KycVerifyResult, Error, { email: string; otp: string }>({
    mutationFn: async ({ email, otp }) => {
      const data = await pouchPostWithAuth<{ token?: unknown; expiresAt?: unknown }>(
        "/kyc/verify",
        { email, otp }
      );
      if (typeof data?.token !== "string") throw new Error("Verification did not return a token");
      return {
        token: data.token,
        expiresAt: typeof data?.expiresAt === "string" ? data.expiresAt : "",
      };
    },
  });
}

export interface KycSubmitResult {
  state: KycState;
  message: string;
}

export function useKycSubmit() {
  return useMutation<
    KycSubmitResult,
    Error,
    { token: string; countryCode: string; documents: Record<string, string> }
  >({
    mutationFn: async ({ token, countryCode, documents }) => {
      const data = await pouchPostWithAuth<{ status?: string | null; message?: string }>(
        "/kyc/submit",
        { countryCode, documents },
        token
      );
      return {
        state: normalizeKycState(data?.status),
        message: typeof data?.message === "string" ? data.message : "",
      };
    },
  });
}

export interface KycStatusResult {
  state: KycState;
  failureReason: string | null;
}

export function useKycStatus(
  token: string | null,
  countryCode: string,
  options: { enabled: boolean; pollMs: number }
) {
  return useQuery<KycStatusResult>({
    queryKey: ["pouch-kyc-status", countryCode],
    enabled: options.enabled && Boolean(token) && Boolean(countryCode),
    refetchInterval: options.pollMs > 0 ? options.pollMs : false,
    queryFn: async () => {
      const data = await pouchGetWithAuth<{
        status?: string | null;
        failureReason?: string | null;
      }>("/kyc/status", { countryCode }, token ?? undefined);
      return {
        state: normalizeKycState(data?.status),
        failureReason: typeof data?.failureReason === "string" ? data.failureReason : null,
      };
    },
  });
}
