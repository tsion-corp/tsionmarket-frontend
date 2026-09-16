import { describe, expect, it, vi } from "vitest";
import {
  attestationFromIrisBody,
  fetchAttestation,
  waitForAttestation,
} from "@/lib/cctp/attestation";
import { CCTP_DOMAIN } from "@/lib/cctp/config";

const TX = "0xabc123" as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchAttestation", () => {
  it("returns null (keep polling) when Circle has not indexed the burn yet (404)", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    expect(await fetchAttestation(CCTP_DOMAIN.base, TX, fetchImpl)).toBeNull();
  });

  it("reports pending with no attestation while confirmations accrue", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        messages: [{ status: "pending_confirmations", message: "0x", attestation: "PENDING" }],
      })
    );
    const att = await fetchAttestation(CCTP_DOMAIN.base, TX, fetchImpl);
    expect(att?.status).toBe("pending_confirmations");
    expect(att?.attestation).toBeNull();
  });

  it("returns the message and attestation once complete", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ messages: [{ status: "complete", message: "0xdead", attestation: "0xbeef" }] })
    );
    expect(await fetchAttestation(CCTP_DOMAIN.base, TX, fetchImpl)).toEqual({
      status: "complete",
      message: "0xdead",
      attestation: "0xbeef",
    });
  });

  it("queries the v2 messages endpoint with the source domain and tx hash", async () => {
    let requested = "";
    const fetchImpl: typeof fetch = async (input) => {
      requested = String(input);
      return jsonResponse({ messages: [] });
    };
    await fetchAttestation(CCTP_DOMAIN.base, TX, fetchImpl);
    expect(requested).toContain("/v2/messages/6?transactionHash=0xabc123");
  });

  it("says a failed lookup failed, rather than reading it as not indexed yet", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({}, 502);
    await expect(fetchAttestation(CCTP_DOMAIN.base, TX, fetchImpl)).rejects.toThrow(/502/);
  });
});

describe("attestationFromIrisBody", () => {
  it("reads a complete message as ready to mint, and anything else as not yet", () => {
    expect(
      attestationFromIrisBody({
        messages: [{ status: "complete", message: "0xdead", attestation: "0xbeef" }],
      })
    ).toEqual({ status: "complete", message: "0xdead", attestation: "0xbeef" });
    expect(
      attestationFromIrisBody({
        messages: [{ status: "pending_confirmations", message: "0x", attestation: "PENDING" }],
      })
    ).toEqual({ status: "pending_confirmations", message: null, attestation: null });
    expect(attestationFromIrisBody({ messages: [] })).toBeNull();
  });
});

describe("waitForAttestation", () => {
  // In the browser the lookup goes through the app's own proxy and transport,
  // never to Circle directly, so the poller takes the lookup as a function.
  it("polls through the lookup it is given", async () => {
    let call = 0;
    const lookup = vi.fn(async () => {
      call += 1;
      return call < 3
        ? null
        : { status: "complete", message: "0xdead" as const, attestation: "0xbeef" as const };
    });
    const result = await waitForAttestation(CCTP_DOMAIN.arbitrum, TX, {
      lookup,
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(result).toEqual({ message: "0xdead", attestation: "0xbeef" });
    expect(lookup).toHaveBeenCalledWith(CCTP_DOMAIN.arbitrum, TX);
  });

  it("gives up at its timeout rather than polling forever", async () => {
    await expect(
      waitForAttestation(CCTP_DOMAIN.base, TX, {
        lookup: async () => null,
        intervalMs: 1,
        timeoutMs: 5,
      })
    ).rejects.toThrow(/timed out/);
  });

  it("polls until complete, then resolves the mint inputs", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call < 2
        ? jsonResponse({
            messages: [{ status: "pending_confirmations", message: "0x", attestation: "PENDING" }],
          })
        : jsonResponse({
            messages: [{ status: "complete", message: "0xdead", attestation: "0xbeef" }],
          });
    });
    const result = await waitForAttestation(CCTP_DOMAIN.base, TX, {
      fetchImpl,
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(result).toEqual({ message: "0xdead", attestation: "0xbeef" });
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
