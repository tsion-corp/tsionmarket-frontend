import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ verifyRequest: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({
  verifyRequest: mocks.verifyRequest,
  accessTokenFromCookie: () => null,
  verifyPrivyAccessToken: vi.fn(),
}));

const { POST } = await import("./route");

const account = privateKeyToAccount(generatePrivateKey());
const UPSTREAM = "https://rpc.example.com/base/SECRET-KEY";
const WALLET = "http://wallet.local";
const HASH = `0x${"cd".repeat(32)}`;
const TO = "0x1111111111111111111111111111111111111111" as const;

const signed = (chainId = 8453) =>
  account.signTransaction({
    type: "eip1559",
    chainId,
    nonce: 3,
    to: TO,
    value: 1n,
    gas: 21_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
  });

function call(network: string, body: unknown, authed = true, userId = "user-1") {
  mocks.verifyRequest.mockResolvedValue(authed ? { provider: "decane", userId } : null);
  const req = new NextRequest(`http://localhost:3000/api/evm-broadcast/${network}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ network }) });
}

function routes({ owned = [account.address], upstream = { result: HASH } as unknown } = {}) {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (String(url).startsWith(WALLET)) {
      return new Response(
        JSON.stringify({
          success: true,
          data: { addresses: owned.map((address) => ({ family: "evm", address })) },
        })
      );
    }
    return new Response(JSON.stringify(upstream));
  });
}

beforeEach(() => {
  mocks.verifyRequest.mockReset();
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("EVM_BROADCAST_RPC_BASE_MAINNET", UPSTREAM);
  vi.stubEnv("CRYPTO_WALLET_API_URL", WALLET);
  vi.stubEnv("WALLET_INTERNAL_KEY", "k".repeat(40));
  routes();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const upstreamCalls = () => mocks.fetch.mock.calls.filter(([url]) => url === UPSTREAM);

describe("POST /api/evm-broadcast/[network]", () => {
  it("sends a signed transaction from the caller's own wallet, as the one allowed method, and returns its hash", async () => {
    const raw = await signed();
    const res = await call("base-mainnet", { raw });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { hash: HASH } });

    expect(upstreamCalls()).toHaveLength(1);
    const body = JSON.parse(upstreamCalls()[0]![1].body as string);
    expect(body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendRawTransaction",
      params: [raw],
    });
  });

  it("turns away a caller who is not signed in with Decane", async () => {
    expect((await call("base-mainnet", { raw: await signed() }, false)).status).toBe(401);
    mocks.verifyRequest.mockResolvedValue({ provider: "privy", userId: "did:privy:x" });
    const req = new NextRequest("http://localhost:3000/api/evm-broadcast/base-mainnet", {
      method: "POST",
      body: "{}",
    });
    expect((await POST(req, { params: Promise.resolve({ network: "base-mainnet" }) })).status).toBe(
      401
    );
    expect(upstreamCalls()).toHaveLength(0);
  });

  it("looks like nothing at all for a network that is unknown or not switched on", async () => {
    const raw = await signed();
    expect((await call("not-a-network", { raw })).status).toBe(404);
    expect((await call("opt-mainnet", { raw })).status).toBe(404); // registered, but no endpoint set
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses a transaction signed by an address that is not this caller's, without sending it", async () => {
    routes({ owned: [TO] });
    const res = await call("base-mainnet", { raw: await signed() });
    expect(res.status).toBe(403);
    expect(upstreamCalls()).toHaveLength(0);
  });

  it("fails closed when it cannot check the sender", async () => {
    vi.stubEnv("WALLET_INTERNAL_KEY", "");
    expect((await call("base-mainnet", { raw: await signed() })).status).toBe(503);
    vi.stubEnv("WALLET_INTERNAL_KEY", "k".repeat(40));
    mocks.fetch.mockImplementation(async () => new Response("down", { status: 500 }));
    expect((await call("base-mainnet", { raw: await signed() })).status).toBe(502);
    expect(upstreamCalls()).toHaveLength(0);
  });

  it("refuses a transaction for another chain, an unsigned one, and garbage", async () => {
    for (const raw of [await signed(1), "0x1234", "nope", null, 5]) {
      const res = await call("base-mainnet", { raw });
      expect(res.status, String(raw).slice(0, 20)).toBe(400);
    }
    expect((await call("base-mainnet", "{not json")).status).toBe(400);
    expect((await call("base-mainnet", {})).status).toBe(400);
    expect(upstreamCalls()).toHaveLength(0);
  });

  it("refuses an oversized request before looking at it", async () => {
    expect((await call("base-mainnet", { raw: "0x" + "ab".repeat(300 * 1024) })).status).toBe(413);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("passes the network's refusal on in plain words, shortened, without the endpoint", async () => {
    routes({
      upstream: {
        error: { code: -32000, message: "nonce too low: next nonce 9, tx nonce 3 ".repeat(20) },
      },
    });
    const res = await call("base-mainnet", { raw: await signed() });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("BROADCAST_REJECTED");
    expect(body.error.message).toMatch(/^nonce too low/);
    expect(body.error.message.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(body)).not.toContain("SECRET-KEY");
  });

  it("says the network is unreachable, and never leaks the endpoint, when it is", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith(WALLET)) {
        return new Response(
          JSON.stringify({ data: { addresses: [{ family: "evm", address: account.address }] } })
        );
      }
      throw new Error(`connect ECONNREFUSED ${UPSTREAM}`);
    });
    const res = await call("base-mainnet", { raw: await signed() });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET-KEY");
  });

  it("stops a runaway client with a rate limit", async () => {
    const raw = await signed();
    const statuses: number[] = [];
    for (let i = 0; i < 24; i += 1) {
      statuses.push((await call("base-mainnet", { raw }, true, "user-rate-limit")).status);
    }
    // Another user is not slowed down by this one.
    expect((await call("base-mainnet", { raw }, true, "user-someone-else")).status).toBe(200);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429, 429, 429]);
  });
});
