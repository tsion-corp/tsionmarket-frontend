import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("Pimlico sponsorship proxy", () => {
  beforeEach(() => {
    verifyRequest.mockReset();
    verifyRequest.mockResolvedValue({ userId: "user" });
    vi.stubEnv("PIMLICO_API_KEY", "pim_test_key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), {
            status: 200,
          })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a session", async () => {
    verifyRequest.mockResolvedValue(null);
    const { forwardPimlicoBundlerRequest } = await import("./pimlico-bundler");
    const response = await forwardPimlicoBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a network that isn't routed through Pimlico", async () => {
    const { forwardPimlicoBundlerRequest } = await import("./pimlico-bundler");
    const response = await forwardPimlicoBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "polygon-mainnet"
    );
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the API key is missing, never reaching Pimlico", async () => {
    vi.unstubAllEnvs();
    const { forwardPimlicoBundlerRequest } = await import("./pimlico-bundler");
    const response = await forwardPimlicoBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a method outside the ERC-4337 allowlist", async () => {
    const { forwardPimlicoBundlerRequest } = await import("./pimlico-bundler");
    const response = await forwardPimlicoBundlerRequest(
      makeReq({ method: "eth_getBalance", params: [] }),
      "base-mainnet"
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards a call to Base's chain id at api.pimlico.io with the key as a query param", async () => {
    const { forwardPimlicoBundlerRequest } = await import("./pimlico-bundler");
    await forwardPimlicoBundlerRequest(
      makeReq({ id: 1, method: "eth_sendUserOperation", params: [{}, "0xentry"] }),
      "base-mainnet"
    );
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toBe("https://api.pimlico.io/v2/8453/rpc?apikey=pim_test_key");
  });

  it("injects the sponsorship policy id into the paymaster calls only, when configured", async () => {
    vi.stubEnv("PIMLICO_SPONSORSHIP_POLICY_ID", "sp_test_policy");
    const { forwardPimlicoBundlerRequest } = await import("./pimlico-bundler");
    await forwardPimlicoBundlerRequest(
      makeReq([
        { id: 1, method: "pm_getPaymasterStubData", params: [{}, "0xentry", "0x2105"] },
        { id: 2, method: "eth_sendUserOperation", params: [{}, "0xentry"] },
      ]),
      "base-mainnet"
    );
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as Array<{
      method: string;
      params: unknown[];
    }>;
    expect((body[0].params[3] as { sponsorshipPolicyId: string }).sponsorshipPolicyId).toBe(
      "sp_test_policy"
    );
    expect(body[1].params[3]).toBeUndefined();
  });

  it("passes Pimlico's status and body straight through on error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32500, message: "boom" } }),
            { status: 400 }
          )
      )
    );
    const { forwardPimlicoBundlerRequest } = await import("./pimlico-bundler");
    const response = await forwardPimlicoBundlerRequest(
      makeReq({ id: 1, method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe("boom");
  });
});
