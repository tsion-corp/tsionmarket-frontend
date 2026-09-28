import { z } from "zod";
import { bnsCommitmentSchema } from "@/lib/api/schemas/bns";

const pendingRegistrationSchema = z.object({
  label: z.string(),
  name: z.string(),
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  commitment: bnsCommitmentSchema,
  commitTxHash: z.string().nullable(),
});

export type PendingArkRegistration = z.infer<typeof pendingRegistrationSchema>;

const pendingFundingSchema = z.object({
  label: z.string().min(3),
  requestId: z.string().min(1),
  transactionHash: z.string().min(1),
  requiredWei: z.string().regex(/^\d+$/),
  minimumOutput: z.string().regex(/^\d+$/),
  usdcAmount: z.string().regex(/^\d+$/),
});

export type PendingArkFunding = z.infer<typeof pendingFundingSchema>;

function storageKey(wallet: string, label: string): string {
  return `wsws:bns:ark:${wallet.toLowerCase()}:${label.toLowerCase()}`;
}

function localStorageOrNull(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function fundingStorageKey(wallet: string, label: string): string {
  return `${storageKey(wallet, label)}:funding`;
}

// The service is stateless and this tuple contains the only copy of the reveal secret.
export function savePendingArkRegistration(value: PendingArkRegistration): void {
  const parsed = pendingRegistrationSchema.parse(value);
  localStorageOrNull()?.setItem(storageKey(parsed.wallet, parsed.label), JSON.stringify(parsed));
}

export function getPendingArkRegistration(
  wallet: string,
  label: string
): PendingArkRegistration | null {
  const storage = localStorageOrNull();
  if (!storage) return null;
  const key = storageKey(wallet, label);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = pendingRegistrationSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // A damaged local entry cannot be used to reveal and is safe to discard.
  }
  storage.removeItem(key);
  return null;
}

export function clearPendingArkRegistration(wallet: string, label: string): void {
  localStorageOrNull()?.removeItem(storageKey(wallet, label));
}

export function savePendingArkFunding(
  wallet: string,
  label: string,
  value: PendingArkFunding
): void {
  const parsed = pendingFundingSchema.parse(value);
  localStorageOrNull()?.setItem(fundingStorageKey(wallet, label), JSON.stringify(parsed));
}

export function getPendingArkFunding(wallet: string, label: string): PendingArkFunding | null {
  const storage = localStorageOrNull();
  if (!storage) return null;
  const key = fundingStorageKey(wallet, label);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = pendingFundingSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // A damaged local entry cannot identify a Dextopus operation to resume.
  }
  storage.removeItem(key);
  return null;
}

export function clearPendingArkFunding(wallet: string, label: string): void {
  localStorageOrNull()?.removeItem(fundingStorageKey(wallet, label));
}
