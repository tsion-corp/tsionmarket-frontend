"use client";

import { createServiceClient } from "@/lib/api/service";

export interface AuthMeWallet {
  address: string | null;
  chainType: "ethereum" | "solana" | null;
  delegated: boolean;
  id: string | null;
}

export interface AuthMeUser {
  id: string;
  createdAt: string;
  linkedAccounts: string[];
  wallets: AuthMeWallet[];
}

export interface AuthMeResponse {
  userId: string;
  sessionId: string;
  user: AuthMeUser | null;
}

export const userClient = createServiceClient(
  "/api/auth",
  "User authentication service unavailable."
);

export async function fetchCurrentUser(): Promise<AuthMeResponse> {
  return userClient.authedGet<AuthMeResponse>("/me");
}
