import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The browser's only way to Circle's attestation service (Iris). It holds the
// allowlist, rebuilds the query from known parameters rather than passing the
// browser's through, validates what Circle answers, and only serves a signed-in
// session, so it cannot be used as an open relay.

vi.mock("server-only", () => ({}));

const { verifyRequest, irisRequest } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  irisRequest: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));
vi.mock("@/lib/server/cctp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/cctp")>()),
  irisRequest,
}));

import { GET } from "./route";

const TX = `0x${"ab".repeat(32)}`;

const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
const get = (pathAndQuery: string) =>
  new NextRequest(`http://app.test/api/cctp/${pathAndQuery}`, {
    headers: { authorization: "Bearer t" },
  });

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  verifyRequest.mockReset().mockResolvedValue({ userId: "did:x" });
  irisRequest.mockReset();
});

describe("the attestation lookup", () => {
  it("forwards a burn's lookup with only the transaction hash", async () => {
    irisRequest.mockResolvedValue(
      answer({ messages: [{ status: "complete", message: "0xdead", attestation: "0xbeef" }] })
    );
    const res = await GET(get(`v2/messages/3?transactionHash=${TX}&extra=1`), ctx("v2/messages/3"));
    expect(res.status).toBe(200);
    expect(irisRequest).toHaveBeenCalledWith(`v2/messages/3?transactionHash=${TX}`);
    // The app's one envelope, so the browser reads it with the one transport.
    expect(await res.json()).toEqual({
      success: true,
      data: { messages: [{ status: "complete", message: "0xdead", attestation: "0xbeef" }] },
    });
  });

  it("passes Circle's 404 through, which means not indexed yet", async () => {
    irisRequest.mockResolvedValue(answer({ code: 404 }, 404));
    const res = await GET(get(`v2/messages/6?transactionHash=${TX}`), ctx("v2/messages/6"));
    expect(res.status).toBe(404);
  });

  it("refuses a lookup without a well-formed transaction hash", async () => {
    const res = await GET(get("v2/messages/6?transactionHash=0x12"), ctx("v2/messages/6"));
    expect(res.status).toBe(400);
    expect(irisRequest).not.toHaveBeenCalled();
  });
});

describe("the fee quote", () => {
  it("forwards the forward and HyperCore flags, and nothing else", async () => {
    irisRequest.mockResolvedValue(answer([{ finalityThreshold: 1000, minimumFee: 1 }]));
    const res = await GET(
      get("v2/burn/USDC/fees/6/19?forward=true&hyperCoreDeposit=true&x=y"),
      ctx("v2/burn/USDC/fees/6/19")
    );
    expect(res.status).toBe(200);
    expect(irisRequest).toHaveBeenCalledWith(
      "v2/burn/USDC/fees/6/19?forward=true&hyperCoreDeposit=true"
    );
    expect(await res.json()).toEqual({
      success: true,
      data: [{ finalityThreshold: 1000, minimumFee: 1 }],
    });
  });

  it("asks without flags when none are given", async () => {
    irisRequest.mockResolvedValue(answer([{ finalityThreshold: 1000, minimumFee: 1 }]));
    await GET(get("v2/burn/USDC/fees/3/6"), ctx("v2/burn/USDC/fees/3/6"));
    expect(irisRequest).toHaveBeenCalledWith("v2/burn/USDC/fees/3/6");
  });

  it("answers 502 when Circle's quote is not the documented shape, rather than a guess", async () => {
    irisRequest.mockResolvedValue(answer({ fees: "cheap" }));
    const res = await GET(get("v2/burn/USDC/fees/6/19"), ctx("v2/burn/USDC/fees/6/19"));
    expect(res.status).toBe(502);
  });
});

describe("the gate", () => {
  it("answers 404 for any path it does not offer", async () => {
    for (const path of ["v1/attestations/abc", "v2/burn/EURC/fees/6/19", "v2/messages/abc"]) {
      const res = await GET(get(path), ctx(path));
      expect(res.status).toBe(404);
    }
    expect(irisRequest).not.toHaveBeenCalled();
  });

  it("rejects traversal", async () => {
    const res = await GET(get("v2/messages/../../x"), ctx("v2/messages/../../x"));
    expect(res.status).toBe(404);
  });

  it("serves only a signed-in session", async () => {
    verifyRequest.mockResolvedValue(null);
    const res = await GET(get(`v2/messages/6?transactionHash=${TX}`), ctx("v2/messages/6"));
    expect(res.status).toBe(401);
    expect(irisRequest).not.toHaveBeenCalled();
  });

  it("answers 502 when Circle cannot be reached", async () => {
    irisRequest.mockRejectedValue(new Error("down"));
    const res = await GET(get(`v2/messages/6?transactionHash=${TX}`), ctx("v2/messages/6"));
    expect(res.status).toBe(502);
  });
});
