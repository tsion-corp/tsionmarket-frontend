import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("Alchemy sponsorship proxy", () => {
  beforeEach(() => {
    verifyRequest.mockReset();
    verifyRequest.mockResolvedValue({ userId: "user" });
    vi.stubEnv("ALCHEMY_GAS_MANAGER_API_KEY", "policy-owner-key");
    vi.stubEnv("ALCHEMY_API_KEY", "data-api-key");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "different-account-key");
    vi.stubEnv("ALCHEMY_GAS_POLICY_ID", "base-policy");
    vi.stubEnv("ALCHEMY_POLYGON_GAS_POLICY_ID", "polygon-policy");
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

  it("uses only the policy-owning primary key for Base sponsorship", async () => {
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [{ sender: "0x1" }, "0xentrypoint"],
      }),
      "base-mainnet"
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("base-mainnet.g.alchemy.com/v2/policy-owner-key");
    expect(String(url)).not.toContain("data-api-key");
    expect(String(url)).not.toContain("different-account-key");
    expect((init?.headers as Record<string, string>)["x-alchemy-policy-id"]).toBe("base-policy");
  });

  it("keeps the existing primary key as a compatibility fallback", async () => {
    vi.stubEnv("ALCHEMY_GAS_MANAGER_API_KEY", "");
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(200);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "base-mainnet.g.alchemy.com/v2/data-api-key"
    );
  });

  it("rejects ordinary node reads so they stay on ZeroDev", async () => {
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_call", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("injects the Polygon policy into paymaster context", async () => {
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({
        jsonrpc: "2.0",
        id: 1,
        method: "pm_getPaymasterData",
        params: [{ sender: "0x1" }, "0xentrypoint", "0x89", {}],
      }),
      "polygon-mainnet"
    );

    expect(response.status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body)).params[3]).toEqual({ policyId: "polygon-policy" });
    expect((init?.headers as Record<string, string>)["x-alchemy-policy-id"]).toBeUndefined();
  });

  it("fails closed when the Base policy is missing", async () => {
    vi.stubEnv("ALCHEMY_GAS_POLICY_ID", "");
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires authentication before contacting Alchemy", async () => {
    verifyRequest.mockResolvedValue(null);
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
