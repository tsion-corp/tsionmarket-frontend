import type { Hex } from "viem";
import { createServiceClient } from "@/lib/api/service";
import type { GatewayApiError } from "@/lib/api/envelope";
import {
  attestationFromIrisBody,
  type CctpAttestation,
  type IrisMessage,
} from "@/lib/cctp/attestation";
import type { CctpFeeQuote } from "@/lib/cctp/fees";

// Circle's CCTP attestation service, reached through the app's own proxy
// (app/api/cctp/[...path]/route.ts), which validates both answers. Signed-in
// reads only: these back the perps top-up and withdrawal, both of which need a
// session anyway.
const cctp = createServiceClient("/api/cctp", "The transfer service is unavailable right now.");

export function getCctpFeeQuote(
  source: number,
  destination: number,
  flags: { forward: boolean; hyperCoreDeposit: boolean }
): Promise<CctpFeeQuote> {
  const params: Record<string, string> = {};
  if (flags.forward) params.forward = "true";
  if (flags.hyperCoreDeposit) params.hyperCoreDeposit = "true";
  return cctp.authedGet<CctpFeeQuote>(`/v2/burn/USDC/fees/${source}/${destination}`, params);
}

/** The burn's mint inputs once Circle has signed them; null while not indexed. */
export async function lookupCctpAttestation(
  sourceDomain: number,
  txHash: Hex
): Promise<CctpAttestation | null> {
  try {
    const body = await cctp.authedGet<{ messages?: IrisMessage[] }>(
      `/v2/messages/${sourceDomain}`,
      { transactionHash: txHash }
    );
    return attestationFromIrisBody(body);
  } catch (error) {
    // Circle answers 404 until it has indexed the burn: keep polling. Any
    // other failure is a real one and goes back to the caller.
    if ((error as GatewayApiError).status === 404) return null;
    throw error;
  }
}
