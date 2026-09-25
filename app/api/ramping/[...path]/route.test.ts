import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Wiring tests against the handler itself: it holds the allowlist and decides
// which routes need a session.

vi.mock("server-only", () => ({}));

const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

import { GET, POST } from "./route";

const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });
const get = (path: string) => new NextRequest(`http://app.test/api/ramping/${path}`);

function upstream(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  verifyRequest.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("the ramping proxy allowlist", () => {
  it("forwards a rates quote, which the withdraw screen needs for the real payout", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValue(
      upstream({
        success: true,
        data: {
          side: "offramp",
          rate: "1350",
          input: { currency: "USDC", amount: "50" },
          output: { currency: "NGN", amount: "67480" },
          fee: { currency: "NGN", amount: "20" },
        },
      }) as unknown as Promise<Response>
    );

    const res = await GET(get("rates/quote?side=offramp&usdcAmount=50"), ctx("rates/quote"));

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toContain("rates/quote?side=offramp&usdcAmount=50");
    const body = (await res.json()) as { data: { output: { amount: string } } };
    expect(body.data.output.amount).toBe("67480");
  });

  it("refuses the list and operator routes", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    for (const path of ["onramps", "offramps", "balances", "rates/history"]) {
      const res = await GET(get(path), ctx(path));
      expect(res.status, `GET ${path} should not be proxied`).toBe(404);
    }
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("still refuses a write without a session", async () => {
    verifyRequest.mockResolvedValue(null);
    const req = new NextRequest("http://app.test/api/ramping/offramps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await POST(req, ctx("offramps"));
    expect(res.status).toBe(401);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe("the public price reads", () => {
  it("serves rates and quotes to a signed-out visitor", async () => {
    verifyRequest.mockResolvedValue(null);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValue(
      upstream({ success: true, data: { onramp_rate: "1450", offramp_rate: "1350" } }) as never
    );

    for (const path of ["rates", "rates/quote?side=onramp&ngnAmount=100000"]) {
      fetchMock.mockClear();
      const res = await GET(get(path), ctx(path.split("?")[0]));
      expect(res.status, `${path} should not need a session`).toBe(200);
      expect(fetchMock).toHaveBeenCalled();
    }
  });

  it("keeps every other read behind a session", async () => {
    verifyRequest.mockResolvedValue(null);
    const res = await GET(get("banks"), ctx("banks"));
    expect(res.status).toBe(401);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
