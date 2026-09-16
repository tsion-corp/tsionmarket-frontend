import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearPredictionResponseCache } from "../response-cache";

vi.mock("@/lib/wsapi-base", () => ({
  wsapiService: () => "https://prediction.test",
}));

function request(query = "category=esports&sort=volume_24h&limit=20&marketLimit=2") {
  return new NextRequest(`http://localhost:3000/api/prediction-combos/markets/events?${query}`);
}

const context = { params: Promise.resolve({ path: ["markets", "events"] }) };

describe("GET /api/prediction-combos/markets/events", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPredictionResponseCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("turns an upstream 503 into an uncached availability snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "SERVICE_UNAVAILABLE", message: "Unavailable" },
          }),
          { status: 503, headers: { "content-type": "application/json" } }
        )
      )
    );

    const { GET } = await import("./route");
    const response = await GET(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-wsws-prediction-cache")).toBe("unavailable");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        category: "esports",
        sort: "volume_24h",
        events: [],
        nextCursor: null,
        unavailable: true,
        retryAfterMs: 5000,
      },
    });
  });

  it("uses the same controlled response when the upstream cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const { GET } = await import("./route");
    const response = await GET(request("category=crypto&sort=newest"), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { category: "crypto", sort: "newest", unavailable: true },
    });
  });
});
