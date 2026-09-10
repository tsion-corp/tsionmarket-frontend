import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { fetchUserActivity } = await import("./activity");

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const WALLET = "0x7bd20000000000000000000000000000000043ba";

describe("fetchUserActivity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the caller's own addresses, which is how the route finds anything", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ items: [], unavailable: [] }));

    await fetchUserActivity({ evm: WALLET, solana: "So1111" });

    const path = String(apiFetch.mock.calls[0][0]);
    expect(path).toContain(`evm=${WALLET}`);
    expect(path).toContain("solana=So1111");
  });

  it("carries the unavailable sources through to the view", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ items: [], unavailable: ["base-mainnet"] }));

    await expect(fetchUserActivity({ evm: WALLET })).resolves.toEqual({
      items: [],
      unavailable: ["base-mainnet"],
    });
  });

  it("treats a body with no items array as a failure, not as an empty history", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ error: "Wallet address required" }, 200));

    await expect(fetchUserActivity({ evm: WALLET })).rejects.toThrow("Could not load activity");
  });

  it("reports a throttled read as a throttled read, so the client backs off", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ error: "slow down" }, 429));

    await expect(fetchUserActivity({ evm: WALLET })).rejects.toThrow(/too many/i);
  });
});
