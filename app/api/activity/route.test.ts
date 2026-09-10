import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyRequest = vi.fn();
const fetchActivity = vi.fn();

vi.mock("@/lib/server/auth", () => ({ verifyRequest: () => verifyRequest() }));
vi.mock("@/lib/server/activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/activity")>();
  return { ...actual, fetchActivity: (...args: unknown[]) => fetchActivity(...args) };
});

function request(query: string) {
  return new NextRequest(`http://localhost:3000/api/activity${query}`);
}

const WALLET = "0x7bd20000000000000000000000000000000043ba";

describe("GET /api/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyRequest.mockResolvedValue({ sub: "user" });
  });

  it("rejects a request that carries no wallet, instead of calling it empty", async () => {
    const { GET } = await import("./route");
    const res = await GET(request(""));

    expect(res.status).toBe(400);
    expect(fetchActivity).not.toHaveBeenCalled();
  });

  it("answers 429 when the sweep failed because the key pool is spent", async () => {
    const { ActivityUnavailableError } = await import("@/lib/server/activity");
    fetchActivity.mockRejectedValue(
      new ActivityUnavailableError([new Error("Alchemy request failed: 429")])
    );

    const { GET } = await import("./route");
    const res = await GET(request(`?evm=${WALLET}`));

    expect(res.status).toBe(429);
  });

  it("answers 502 when the sweep failed for any other reason", async () => {
    const { ActivityUnavailableError } = await import("@/lib/server/activity");
    fetchActivity.mockRejectedValue(new ActivityUnavailableError([new Error("socket hang up")]));

    const { GET } = await import("./route");
    const res = await GET(request(`?evm=${WALLET}`));

    expect(res.status).toBe(502);
  });

  it("passes the unavailable sources through and refuses to cache an incomplete read", async () => {
    fetchActivity.mockResolvedValue({ items: [], unavailable: ["eth-mainnet"] });

    const { GET } = await import("./route");
    const res = await GET(request(`?evm=${WALLET}`));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ items: [], unavailable: ["eth-mainnet"] });
  });

  it("caches a complete read for the caller's own browser", async () => {
    fetchActivity.mockResolvedValue({ items: [], unavailable: [] });

    const { GET } = await import("./route");
    const res = await GET(request(`?evm=${WALLET}`));

    expect(res.headers.get("Cache-Control")).toBe("private, max-age=30");
  });

  it("still refuses an unauthenticated caller", async () => {
    verifyRequest.mockResolvedValue(null);

    const { GET } = await import("./route");
    const res = await GET(request(`?evm=${WALLET}`));

    expect(res.status).toBe(401);
    expect(fetchActivity).not.toHaveBeenCalled();
  });
});
