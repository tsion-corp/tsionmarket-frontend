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

  // Regression: a stale ALCHEMY_GAS_MANAGER_API_KEY once took precedence over
  // ALCHEMY_API_KEY and built the whole bundler URL from it, so rotating
  // ALCHEMY_API_KEY changed nothing and every sponsored call kept going to an
  // account that was over its monthly capacity. Spot, perps and withdrawals
  // all failed with a 429 that named no cause. The variable is gone; this
  // proves nothing reads it again.
  it("ignores ALCHEMY_GAS_MANAGER_API_KEY entirely, even when it is set", async () => {
    vi.stubEnv("ALCHEMY_GAS_MANAGER_API_KEY", "stale-dead-key");
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(200);
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain("base-mainnet.g.alchemy.com/v2/data-api-key");
    expect(url).not.toContain("stale-dead-key");
  });

  // Base runs through the paymaster path: the policy the team holds is a
  // paymaster-type policy, and Alchemy answers the bundler header path for it
  // with "does not support bundler sponsorship" (ADR-2026-09-06-base-
  // sponsorship-via-paymaster). The proxy injects Base's own policy into the
  // paymaster context and sends no bundler header.
  it("injects the Base policy into paymaster context and sends no bundler header", async () => {
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({
        jsonrpc: "2.0",
        id: 1,
        method: "pm_getPaymasterStubData",
        params: [{ sender: "0x1" }, "0xentrypoint", "0x2105", {}],
      }),
      "base-mainnet"
    );

    expect(response.status).toBe(200);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("base-mainnet.g.alchemy.com/v2/data-api-key");
    expect(JSON.parse(String(init?.body)).params[3]).toEqual({ policyId: "base-policy" });
    expect((init?.headers as Record<string, string>)["x-alchemy-policy-id"]).toBeUndefined();
  });

  it("never rotates sponsorship onto the fallback key", async () => {
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain("different-account-key");
  });

  it("answers 503 when no Alchemy key is configured at all", async () => {
    vi.stubEnv("ALCHEMY_API_KEY", "");
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");
    const response = await forwardAlchemyBundlerRequest(
      makeReq({ method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
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
      makeReq({ method: "pm_getPaymasterData", params: [{}, "0xentrypoint", "0x2105", {}] }),
      "base-mainnet"
    );

    expect(response.status).toBe(424);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/base-mainnet/) });
    expect(fetch).not.toHaveBeenCalled();
  });

  // Seen in production on 2026-09-06: the account owning the Gas Manager policy
  // had used its monthly capacity, so every sponsored call answered 429 with
  // "Monthly capacity limit exceeded". Passed through as a 429, viem retried
  // it four times and the user was told "we're a bit busy, try again", which
  // could not be true until the next billing cycle.
  it("turns exhausted monthly capacity into an error the client will not retry", async () => {
    const exhausted = {
      jsonrpc: "2.0",
      id: 7,
      error: {
        code: 429,
        message:
          "Monthly capacity limit exceeded. Visit https://dashboard.alchemy.com/settings/billing to upgrade your scaling policy for continued service.",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(exhausted), { status: 429 }))
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");

    const response = await forwardAlchemyBundlerRequest(
      makeReq({ jsonrpc: "2.0", id: 7, method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );
    const body = await response.json();

    // 200 with a JSON-RPC error, not a 429: viem retries 429s.
    expect(response.status).toBe(200);
    expect(body.id).toBe(7);
    // -32002 is "resource unavailable", which viem surfaces without retrying.
    expect(body.error.code).toBe(-32002);
    expect(body.error.message).toMatch(/monthly capacity/i);
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/capacity/i), expect.anything());
    logged.mockRestore();
  });

  it("answers every call of a batch when capacity is exhausted", async () => {
    const exhausted = {
      jsonrpc: "2.0",
      id: null,
      error: { code: 429, message: "Monthly capacity limit exceeded." },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(exhausted), { status: 429 }))
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");

    const response = await forwardAlchemyBundlerRequest(
      makeReq([
        { jsonrpc: "2.0", id: 1, method: "pm_getPaymasterStubData", params: [] },
        { jsonrpc: "2.0", id: 2, method: "eth_estimateUserOperationGas", params: [] },
      ]),
      "base-mainnet"
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.map((entry: { id: number }) => entry.id)).toEqual([1, 2]);
    expect(body.every((entry: { error: { code: number } }) => entry.error.code === -32002)).toBe(
      true
    );
  });

  // Alchemy answers a rejected user operation or a paymaster refusal with a
  // 200 whose body is a JSON-RPC error. Relayed silently, the only record of
  // why a sponsored send failed was a toast in one user's browser.
  it("logs a JSON-RPC error the bundler returns inside a 200, with its method", async () => {
    const rejected = {
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32521, message: "UserOperation reverted during simulation with reason: 0x" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(rejected), { status: 200 }))
    );
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");

    const response = await forwardAlchemyBundlerRequest(
      makeReq({ jsonrpc: "2.0", id: 3, method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    // Relayed unchanged: the client's bundler library reads it as before.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rejected);
    expect(logged).toHaveBeenCalledWith(
      expect.stringMatching(/eth_sendUserOperation/),
      -32521,
      expect.stringMatching(/reverted during simulation/)
    );
    logged.mockRestore();
  });

  it("still passes an ordinary rate limit through as a 429 the client may retry", async () => {
    const throttled = { jsonrpc: "2.0", id: 1, error: { code: 429, message: "Too many requests" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(throttled), { status: 429 }))
    );
    const { forwardAlchemyBundlerRequest } = await import("./alchemy-bundler");

    const response = await forwardAlchemyBundlerRequest(
      makeReq({ jsonrpc: "2.0", id: 1, method: "eth_sendUserOperation", params: [] }),
      "base-mainnet"
    );

    expect(response.status).toBe(429);
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
