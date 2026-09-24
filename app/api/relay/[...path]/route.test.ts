import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wiring tests for the relay itself. It is the only path from the browser to
// Mixpanel, and both of its jobs are failure-shaped: forward the SDK's batches
// with the visitor's own IP, and refuse anything that is not ours, so it can
// never be used to post into someone else's project or anywhere else.

const TOKEN = "proj_token_4051122";

// What mixpanel-browser posts: form-encoded `data`, holding base64 JSON.
function sdkBody(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return `data=${encodeURIComponent(b64)}`;
}

const trackBatch = (token = TOKEN) => [
  { event: "page_view", properties: { token, distinct_id: "0xAbC", page: "portfolio" } },
  { event: "trade_completed", properties: { token, distinct_id: "0xAbC", amount_usd: 5 } },
];

function request(
  route: string,
  body: string,
  headers: Record<string, string> = {}
): Request & { nextUrl: URL } {
  const url = `http://localhost/api/relay/${route}?ip=1&_=1758500000000`;
  const req = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
  return Object.assign(req, { nextUrl: new URL(url) });
}

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

async function load(token: string = TOKEN) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_MIXPANEL_TOKEN", token);
  return import("./route");
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("1", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("POST /api/relay/[...path]", () => {
  it("forwards a track batch to Mixpanel's ingest host with the query and body unchanged", async () => {
    const { POST } = await load();
    const body = sdkBody(trackBatch());

    const res = await POST(request("e", body) as never, ctx("e"));

    expect(res.status).toBe(200);
    // The SDK reads the response body to decide whether to retry.
    expect(await res.text()).toBe("1");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.mixpanel.com/track/?ip=1&_=1758500000000");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
  });

  it("forwards profile updates, whose token is `$token`", async () => {
    const { POST } = await load();
    const body = sdkBody([{ $token: TOKEN, $distinct_id: "0xAbC", $set: { $name: "A" } }]);

    const res = await POST(request("p", body) as never, ctx("p"));

    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://api.mixpanel.com/engage/");
  });

  it("forwards the visitor's public IP, so Mixpanel places them and not our server", async () => {
    const { POST } = await load();

    await POST(
      request("e", sdkBody(trackBatch()), { "x-forwarded-for": "197.210.53.1, 10.0.0.2" }) as never,
      ctx("e")
    );

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("x-forwarded-for")).toBe("197.210.53.1");
    expect(headers.get("x-real-ip")).toBe("197.210.53.1");
  });

  it("refuses a batch carrying another project's token", async () => {
    // Without this the relay is open: anyone could post here and have our
    // server write into any Mixpanel project.
    const { POST } = await load();

    const res = await POST(request("e", sdkBody(trackBatch("someone_else"))) as never, ctx("e"));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a batch where any one event is not ours", async () => {
    const { POST } = await load();
    const mixed = [...trackBatch(), ...trackBatch("someone_else")];

    const res = await POST(request("e", sdkBody(mixed)) as never, ctx("e"));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards nothing on a route it does not relay", async () => {
    const { POST } = await load();

    for (const path of [["track"], ["x"], ["e", "extra"]]) {
      const res = await POST(request(path.join("/"), sdkBody(trackBatch())) as never, ctx(...path));
      expect(res.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a body that is not an SDK payload", async () => {
    const { POST } = await load();

    const res = await POST(request("e", "hello") as never, ctx("e"));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before it costs an upstream call", async () => {
    const { POST } = await load();

    const res = await POST(request("e", `data=${"a".repeat(2_000_001)}`) as never, ctx("e"));

    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes Mixpanel's rate limit back, so the SDK backs off", async () => {
    fetchMock.mockResolvedValue(
      new Response("0", { status: 429, headers: { "retry-after": "30" } })
    );
    const { POST } = await load();

    const res = await POST(request("e", sdkBody(trackBatch())) as never, ctx("e"));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
  });

  it("says why when Mixpanel refuses a batch", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"bad token"}', { status: 401 }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await load();

    const res = await POST(request("e", sdkBody(trackBatch())) as never, ctx("e"));

    expect(res.status).toBe(401);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("401"));
  });

  it("answers 502 and logs when Mixpanel cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("connect ETIMEDOUT"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await load();

    const res = await POST(request("e", sdkBody(trackBatch())) as never, ctx("e"));

    expect(res.status).toBe(502);
    expect(error).toHaveBeenCalled();
  });

  it("accepts and discards when analytics is not configured", async () => {
    const { POST } = await load("");

    const res = await POST(request("e", sdkBody(trackBatch())) as never, ctx("e"));

    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
