import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

async function loadProxy({ polygonPolicy = "test-polygon-policy" } = {}) {
  vi.resetModules();
  process.env.ALCHEMY_API_KEY = "test-key";
  process.env.ALCHEMY_GAS_POLICY_ID = "test-bso-policy";
  if (polygonPolicy) {
    process.env.ALCHEMY_POLYGON_GAS_POLICY_ID = polygonPolicy;
  } else {
    delete process.env.ALCHEMY_POLYGON_GAS_POLICY_ID;
  }
  return import("./alchemy-bundler");
}

describe("Alchemy bundler proxy", () => {
  beforeEach(() => {
    verifyRequest.mockReset();
    verifyRequest.mockResolvedValue({ userId: "user" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: "0x1" }), { status: 200 }))
    );
  });

  it("injects the server-only policy into Polygon paymaster requests", async () => {
    const { forwardAlchemyBundlerRequest } = await loadProxy();
    const response = await forwardAlchemyBundlerRequest(
      makeReq({
        id: 1,
        jsonrpc: "2.0",
        method: "pm_getPaymasterStubData",
        params: [{ sender: "0x1" }, "0xentrypoint", "0x89", {}],
      }),
      "polygon-mainnet"
    );

    expect(response.status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const forwarded = JSON.parse(String(init?.body));
    expect(forwarded.params[3]).toEqual({ policyId: "test-polygon-policy" });
    expect((init?.headers as Record<string, string>)["x-alchemy-policy-id"]).toBeUndefined();
  });

  it("rejects Polygon paymaster requests when its standard policy is missing", async () => {
    const { forwardAlchemyBundlerRequest } = await loadProxy({ polygonPolicy: "" });
    const response = await forwardAlchemyBundlerRequest(
      makeReq({
        id: 1,
        jsonrpc: "2.0",
        method: "pm_getPaymasterData",
        params: [{ sender: "0x1" }, "0xentrypoint", "0x89", {}],
      }),
      "polygon-mainnet"
    );

    expect(response.status).toBe(424);
    await expect(response.json()).resolves.toEqual({
      error: "Polygon gas sponsorship policy is missing",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not use the BSO header for Polygon user operations", async () => {
    const { forwardAlchemyBundlerRequest } = await loadProxy();
    await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "polygon-mainnet"
    );

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-alchemy-policy-id"]).toBeUndefined();
  });

  it("keeps the BSO policy header for Base user operations", async () => {
    const { forwardAlchemyBundlerRequest } = await loadProxy();
    await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-alchemy-policy-id"]).toBe(
      "test-bso-policy"
    );
  });
});
