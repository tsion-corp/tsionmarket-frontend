import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("ZeroDev bundler proxy", () => {
  beforeEach(() => {
    verifyRequest.mockReset();
    verifyRequest.mockResolvedValue({ userId: "user" });
    process.env.ZERODEV_PROJECT_ID = "test-project-id-123";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" })))
    );
  });

  it("keeps the project URL server-side and selects the requested chain", async () => {
    const { forwardZeroDevBundlerRequest } = await import("./zerodev-bundler");
    const response = await forwardZeroDevBundlerRequest(
      makeReq({ jsonrpc: "2.0", id: 1, method: "pm_getPaymasterData", params: [] }),
      "polygon-mainnet"
    );

    expect(response.status).toBe(200);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "https://rpc.zerodev.app/api/v3/test-project-id-123/chain/137"
    );
    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("allows only chains enabled for sponsorship", async () => {
    const { forwardZeroDevBundlerRequest } = await import("./zerodev-bundler");
    const response = await forwardZeroDevBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "arb-mainnet"
    );

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not expose a generic RPC relay", async () => {
    const { forwardZeroDevBundlerRequest } = await import("./zerodev-bundler");
    const response = await forwardZeroDevBundlerRequest(
      makeReq({ method: "eth_sendRawTransaction", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the server-only project URL is absent", async () => {
    delete process.env.ZERODEV_PROJECT_ID;
    const { forwardZeroDevBundlerRequest } = await import("./zerodev-bundler");
    const response = await forwardZeroDevBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires authentication before forwarding", async () => {
    verifyRequest.mockResolvedValue(null);
    const { forwardZeroDevBundlerRequest } = await import("./zerodev-bundler");
    const response = await forwardZeroDevBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
