"use client";

import { createServiceClient } from "@/lib/api/service";
import type {
  bnsCommitmentSchema,
  bnsAvailabilitySchema,
  bnsLabelExpirySchema,
  bnsPriceSchema,
  bnsResolvedNameSchema,
  bnsReverseNameSchema,
  bnsStoreSchema,
  bnsTransactionSchema,
} from "@/lib/api/schemas/bns";
import type { z } from "zod";

const bns = createServiceClient("/api/bns", "Ark names are unavailable right now.");
export const ARK_NAME_DURATION_SECONDS = 365 * 24 * 60 * 60;

export type ArkLabelAvailability = z.infer<typeof bnsAvailabilitySchema>;
export type ArkLabelPrice = z.infer<typeof bnsPriceSchema>;
export type ArkLabelExpiry = z.infer<typeof bnsLabelExpirySchema>;
export type ArkResolvedName = z.infer<typeof bnsResolvedNameSchema>;
export type ArkReverseName = z.infer<typeof bnsReverseNameSchema>;
export type ArkCommitment = z.infer<typeof bnsCommitmentSchema>;
export type ArkTransaction = z.infer<typeof bnsTransactionSchema>;
export type ArkStore = z.infer<typeof bnsStoreSchema>;

export function getArkStore(): Promise<ArkStore> {
  return bns.get<ArkStore>("/stores/ark");
}

export function getArkLabelAvailability(label: string): Promise<ArkLabelAvailability> {
  return bns.get<ArkLabelAvailability>(`/stores/ark/labels/${encodeURIComponent(label)}/available`);
}

export function getArkLabelPrice(label: string): Promise<ArkLabelPrice> {
  return bns.get<ArkLabelPrice>(`/stores/ark/labels/${encodeURIComponent(label)}/price`, {
    duration: ARK_NAME_DURATION_SECONDS,
  });
}

// When a registered label expires, as a Unix timestamp in SECONDS (decimal
// string). The only source of expiry: /resolve and /reverse do not carry it.
export function getArkLabelExpiry(label: string): Promise<ArkLabelExpiry> {
  return bns.get<ArkLabelExpiry>(`/stores/ark/labels/${encodeURIComponent(label)}/expires`);
}

export function resolveArkName(name: string): Promise<ArkResolvedName> {
  return bns.get<ArkResolvedName>(`/resolve/${encodeURIComponent(name)}`);
}

export function reverseResolveArkAddress(address: string): Promise<ArkReverseName> {
  return bns.get<ArkReverseName>(`/reverse/${encodeURIComponent(address)}`);
}

export function createArkCommitment(
  label: string,
  body: {
    owner: string;
    resolver: string;
    data: string[];
    // Only the default reverse registrar (0x3992…) backs `/reverse`, so that is
    // the single reverse record we set. Setting the store's other
    // reverseRegistrar (the "eth" reverse) added revert surface to the register
    // tx for a record the app never reads.
    setDefaultReverseRecord: true;
    duration: number;
  }
): Promise<ArkCommitment> {
  return bns.post<ArkCommitment>(
    `/stores/ark/labels/${encodeURIComponent(label)}/commitment`,
    body
  );
}

export function buildArkRegistrationTx(
  registration: ArkCommitment["registration"]
): Promise<ArkTransaction> {
  return bns.post<ArkTransaction>("/stores/ark/register", { registration });
}

export function renewArkName(label: string): Promise<ArkTransaction> {
  return bns.post<ArkTransaction>(`/stores/ark/labels/${encodeURIComponent(label)}/renew`, {
    duration: ARK_NAME_DURATION_SECONDS,
  });
}
