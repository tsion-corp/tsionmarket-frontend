import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dextopusRequest, isAllowedPath, splitPurpose } from "@/lib/server/dextopus";

const originalApiKey = process.env.DEXTOPUS_API_KEY;
const originalTradeApiKey = process.env.DEXTOPUS_TRADE_API_KEY;
const originalWithdrawApiKey = process.env.DEXTOPUS_WITHDRAW_API_KEY;

beforeEach(() => {
  process.env.DEXTOPUS_API_KEY = "test-key";
  delete process.env.DEXTOPUS_TRADE_API_KEY;
  delete process.env.DEXTOPUS_WITHDRAW_API_KEY;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.DEXTOPUS_API_KEY;
  else process.env.DEXTOPUS_API_KEY = originalApiKey;
  if (originalTradeApiKey === undefined) delete process.env.DEXTOPUS_TRADE_API_KEY;
  else process.env.DEXTOPUS_TRADE_API_KEY = originalTradeApiKey;
  if (originalWithdrawApiKey === undefined) delete process.env.DEXTOPUS_WITHDRAW_API_KEY;
  else process.env.DEXTOPUS_WITHDRAW_API_KEY = originalWithdrawApiKey;
});

describe("splitPurpose", () => {
  it("signs a plain Dextopus path with the deposit key", () => {
    expect(splitPurpose("deposit/quote")).toEqual({ purpose: "deposit", path: "deposit/quote" });
  });

  it("routes a withdraw-prefixed path to the withdrawal key, prefix stripped", () => {
    // Withdrawals are a second Dextopus integration; a request created under
    // its key can only be read back under the same key.
    expect(splitPurpose("withdraw/deposit/status")).toEqual({
      purpose: "withdrawal",
      path: "deposit/status",
    });
  });

  it("routes a trade-prefixed path to the trade key", () => {
    // Spot buys, sells, the catalog and gas top-ups are a third integration.
    expect(splitPurpose("trade/deposit/quote")).toEqual({
      purpose: "trade",
      path: "deposit/quote",
    });
  });

  it("still allowlists what is left after the prefix", () => {
    expect(isAllowedPath(splitPurpose("withdraw/deposit/quote").path)).toBe(true);
    expect(isAllowedPath(splitPurpose("withdraw/admin/keys").path)).toBe(false);
    // The prefix alone does not open a door: "withdraw/" is not a Dextopus path.
    expect(isAllowedPath(splitPurpose("withdraw/").path)).toBe(false);
  });
});

describe("dextopusRequest retries", () => {
  it("falls back to the existing key for a trade integration", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await dextopusRequest("deposit/quote", {
      method: "POST",
      purpose: "trade",
      body: { amount: "1000000" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: expect.objectContaining({ "x-api-key": "test-key" }) })
    );
  });

  it("prefers a purpose-specific trade key when configured", async () => {
    process.env.DEXTOPUS_TRADE_API_KEY = "trade-key";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    await dextopusRequest("deposit/quote", {
      method: "POST",
      purpose: "trade",
      body: { amount: "1000000" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: expect.objectContaining({ "x-api-key": "trade-key" }) })
    );
  });

  it("retries one transient quote transport failure", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("socket closed"))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    const responsePromise = dextopusRequest("deposit/quote", {
      method: "POST",
      purpose: "deposit",
      body: { amount: "1000000" },
    });
    await vi.advanceTimersByTimeAsync(300);

    await expect(responsePromise).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries transaction submission", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("socket closed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      dextopusRequest("deposit/submit", {
        method: "POST",
        purpose: "deposit",
        body: { depositRequestId: "request-1", txHash: "hash-1" },
      })
    ).rejects.toThrow("socket closed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
