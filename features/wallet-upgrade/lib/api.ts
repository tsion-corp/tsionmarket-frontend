"use client";

import { unwrap } from "@/lib/api/envelope";
import { createServiceClient } from "@/lib/api/service";

const upgrade = createServiceClient("/api/wallet-upgrade", "The wallet upgrade is unavailable.");

export interface LegacyWalletAddresses {
  evm: string | null;
  solana: string | null;
}

export interface UpgradeStatus {
  linked: boolean;
  /** The platform id this Clerk account carries, or null until linked. */
  uid: string | null;
  /** How the account got its id: joined to an old account, or set up fresh. */
  method: "decane_proof" | "new_user" | null;
  legacy: LegacyWalletAddresses | null;
}

export interface LinkResult {
  linked: true;
  uid: string;
  legacy: LegacyWalletAddresses;
  linkedAt: string;
}

export const UPGRADE_STATUS_KEY = ["walletUpgradeStatus"] as const;

// Needs only the Clerk session (its cookie rides along), so plain fetch: the
// shared client would insist on a Decane token this call does not use.
export async function getUpgradeStatus(): Promise<UpgradeStatus> {
  const res = await fetch("/api/wallet-upgrade/status", { cache: "no-store" });
  return unwrap<UpgradeStatus>(res, "The wallet upgrade is unavailable.");
}

// Carries the Decane access token (the shared client attaches it); the route
// adds the Clerk session itself.
export function linkAccounts(): Promise<LinkResult> {
  return upgrade.post<LinkResult>("/link");
}

// For someone who never had an account here. Clerk session only.
export async function provisionAccount(): Promise<{ uid: string; created: boolean }> {
  const res = await fetch("/api/wallet-upgrade/provision", { method: "POST" });
  return unwrap<{ uid: string; created: boolean }>(res, "The wallet upgrade is unavailable.");
}
