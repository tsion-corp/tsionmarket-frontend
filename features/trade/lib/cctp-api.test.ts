import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError } from "@/lib/api/envelope";

// The browser's side of /api/cctp, through the app's one transport: the fee
// quote for a burn, and the attestation lookup the withdrawal leg polls.

const client = vi.hoisted(() => ({ authedGet: vi.fn() }));
vi.mock("@/lib/api/service", () => ({ createServiceClient: () => client }));

import { getCctpFeeQuote, lookupCctpAttestation } from "@/features/trade/lib/cctp-api";

const TX = `0x${"ab".repeat(32)}` as const;

beforeEach(() => {
  client.authedGet.mockReset();
});

describe("getCctpFeeQuote", () => {
  it("asks the proxy for a route's quote with the forward flags", async () => {
    client.authedGet.mockResolvedValue([{ finalityThreshold: 1000, minimumFee: 1 }]);
    const quote = await getCctpFeeQuote(6, 19, { forward: true, hyperCoreDeposit: true });
    expect(client.authedGet).toHaveBeenCalledWith("/v2/burn/USDC/fees/6/19", {
      forward: "true",
      hyperCoreDeposit: "true",
    });
    expect(quote).toEqual([{ finalityThreshold: 1000, minimumFee: 1 }]);
  });

  it("sends no flags for a plain transfer", async () => {
    client.authedGet.mockResolvedValue([]);
    await getCctpFeeQuote(3, 6, { forward: false, hyperCoreDeposit: false });
    expect(client.authedGet).toHaveBeenCalledWith("/v2/burn/USDC/fees/3/6", {});
  });
});

describe("lookupCctpAttestation", () => {
  it("reads a complete message as ready to mint", async () => {
    client.authedGet.mockResolvedValue({
      messages: [{ status: "complete", message: "0xdead", attestation: "0xbeef" }],
    });
    await expect(lookupCctpAttestation(3, TX)).resolves.toEqual({
      status: "complete",
      message: "0xdead",
      attestation: "0xbeef",
    });
    expect(client.authedGet).toHaveBeenCalledWith("/v2/messages/3", { transactionHash: TX });
  });

  it("reads a 404 as not indexed yet, so the poll keeps going", async () => {
    client.authedGet.mockRejectedValue(apiError("NOT_FOUND", "Not found", 404));
    await expect(lookupCctpAttestation(3, TX)).resolves.toBeNull();
  });

  it("lets any other failure through, rather than reading it as pending", async () => {
    client.authedGet.mockRejectedValue(apiError("SERVICE_UNAVAILABLE", "down", 502));
    await expect(lookupCctpAttestation(3, TX)).rejects.toThrow("down");
  });
});
