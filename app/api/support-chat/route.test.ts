import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as NextRequest;
}

describe("POST /api/support-chat", () => {
  const originalEnv = process.env.SUPPORT_CHAT_API_URL;

  beforeEach(() => {
    process.env.SUPPORT_CHAT_API_URL = "https://support.tsionark.com";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env.SUPPORT_CHAT_API_URL = originalEnv;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("successfully proxies chat message to upstream AI and returns formatted response", async () => {
    const upstreamPayload = {
      ok: true,
      parsed: {
        reply: "World Street is a non-custodial wallet.",
        confidence: 0.95,
        needs_human: false,
        reason: null,
      },
    };

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { POST } = await import("./route");
    const res = await POST(makeReq({ message: "How do I deposit?" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      ok: true,
      reply: "World Street is a non-custodial wallet.",
      confidence: 0.95,
      needsHuman: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://support.tsionark.com/api/demo-chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      message: "How do I deposit?",
    });
  });

  it("rejects empty or malformed requests with 400", async () => {
    const { POST } = await import("./route");

    const resEmpty = await POST(makeReq({ message: "" }));
    expect(resEmpty.status).toBe(400);

    const resNull = await POST(makeReq({}));
    expect(resNull.status).toBe(400);

    const resInvalidType = await POST(makeReq({ message: 123 }));
    expect(resInvalidType.status).toBe(400);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles upstream 500 error gracefully by returning 502 with fallback", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

    const { POST } = await import("./route");
    const res = await POST(makeReq({ message: "Help" }));

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBeDefined();
  });

  it("handles network failure / timeout gracefully", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network connection reset"));

    const { POST } = await import("./route");
    const res = await POST(makeReq({ message: "Help" }));

    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toBeDefined();
  });
});
