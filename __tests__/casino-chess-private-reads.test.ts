import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  ) as unknown as typeof fetch;
  api.apiFetch.mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
});

describe("chess private reads", () => {
  it("keeps cashier config on the public transport", async () => {
    const { fetchCashierConfig } = await import("@/features/casino/lib/api/cashier");

    await fetchCashierConfig();

    expect(global.fetch).toHaveBeenCalledWith("/api/chess/cashier/config");
    expect(api.apiFetch).not.toHaveBeenCalled();
  });

  it("sends cashier balance through the auth-aware transport", async () => {
    const { fetchChessBalance } = await import("@/features/casino/lib/api/cashier");

    await fetchChessBalance("0xabc");

    expect(api.apiFetch).toHaveBeenCalledWith(
      "/api/chess/cashier/players/0xabc/balance",
      {},
      { requireAuth: true }
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends my-bets reads through the auth-aware transport", async () => {
    const { fetchMyBets } = await import("@/features/casino/lib/api/betting");

    await fetchMyBets("match-1", "0xabc");

    expect(api.apiFetch).toHaveBeenCalledWith(
      "/api/chess/betting/markets/match-1/bets?bettor=0xabc",
      {},
      { requireAuth: true }
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
