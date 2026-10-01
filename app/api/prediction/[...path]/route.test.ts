import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

function makeReq(url: string): NextRequest {
  return {
    nextUrl: new URL(url),
    headers: new Headers(),
    text: async () => "",
  } as unknown as NextRequest;
}

async function loadRoute() {
  vi.resetModules();
  vi.stubEnv("WSAPI_BASE_URL", "https://staging.tsionark.com");
  vi.stubEnv("NEXT_PUBLIC_WSAPI_BASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_PREDICTION_API_URL", "https://api.tsionark.com/v1/prediction-market");
  vi.stubEnv("PREDICTION_BOOK_API_URL", "");
  return import("@/app/api/prediction/[...path]/route");
}

describe("prediction proxy route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    ) as unknown as typeof fetch;
  });

  it("routes the first-party book API through the prediction service", async () => {
    const { GET } = await loadRoute();

    const response = await GET(
      makeReq("https://app.test/api/prediction/book/board?state=prematch&limit=24")
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://staging.tsionark.com/v1/prediction/book/board?state=prematch&limit=24",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("keeps legacy markets on the prediction-market override", async () => {
    const { GET } = await loadRoute();

    const response = await GET(makeReq("https://app.test/api/prediction/markets"));

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.tsionark.com/v1/prediction-market/markets",
      expect.objectContaining({ method: "GET" })
    );
  });
});
