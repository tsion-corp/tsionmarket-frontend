"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  normalizeInitiation,
  normalizeKycState,
  type KycInitiation,
  type KycState,
} from "@/lib/pouch/kyc";

// Client hooks over the Shared KYC proxy routes. Each returns normalized domain
// objects; raw provider shapes stay behind the /api/pouch boundary. The user's
// JWT is passed as an argument and forwarded as an Authorization header.

async function readError(res: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") message = body.error;
  } catch {
    // Non-JSON error body; keep the fallback.
  }
  throw new Error(message);
}

export function useKycInitiate() {
  return useMutation<KycInitiation, Error, { email: string; countryCode: string }>({
    mutationFn: async ({ email, countryCode }) => {
      const res = await fetch("/api/pouch/kyc/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, countryCode }),
      });
      if (!res.ok) await readError(res, "Could not start verification");
      return normalizeInitiation(await res.json());
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
      const res = await fetch("/api/pouch/kyc/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      if (!res.ok) await readError(res, "That code did not match");
      const data = await res.json();
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
      const res = await fetch("/api/pouch/kyc/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ countryCode, documents }),
      });
      if (!res.ok) await readError(res, "Could not submit your details");
      const data = await res.json();
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
      const res = await fetch(
        `/api/pouch/kyc/status?countryCode=${encodeURIComponent(countryCode)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) await readError(res, "Could not check your status");
      const data = await res.json();
      return {
        state: normalizeKycState(data?.status),
        failureReason: typeof data?.failureReason === "string" ? data.failureReason : null,
      };
    },
  });
}
