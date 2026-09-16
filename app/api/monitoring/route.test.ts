import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wiring tests for the forwarder itself, not for a helper it calls. This route
// is the only thing standing between the browser and Watchtower, and its two
// jobs are both failure-shaped: forward a real envelope, and refuse everything
// else so it cannot be used as an open relay.

const KEY = "wt_cb940c5fd034a098dd2bc75a6620ac9a";
const DSN = `https://${KEY}@watchtower-logger.vercel.app/e7988bd6-487f-4fcc-ab6c-aefb8a5e5fd3`;

function envelope(dsn: string | undefined, body = "probe"): string {
  const header = dsn ? { event_id: "a".repeat(32), dsn } : { event_id: "a".repeat(32) };
  return (
    JSON.stringify(header) +
    "\n" +
    JSON.stringify({ type: "event" }) +
    "\n" +
    JSON.stringify({ message: body }) +
    "\n"
  );
}

function request(body: string): Request {
  return new Request("http://localhost/api/monitoring", {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body,
  });
}

/** Loads the route with a controlled environment; the module reads env once. */
async function load(dsn?: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_WATCHTOWER_DSN", dsn ?? "");
  return import("./route");
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("POST /api/monitoring", () => {
  it("forwards a valid envelope to Watchtower and echoes the upstream status", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { POST } = await load(DSN);

    const res = await POST(request(envelope(DSN)) as never);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    // Forwarded to Watchtower's envelope endpoint, carrying the project key.
    expect(String(url)).toContain("watchtower-logger.vercel.app");
    expect(String(url)).toContain(`sentry_key=${KEY}`);
    expect(init.method).toBe("POST");
  });

  it("refuses an envelope belonging to a different project", async () => {
    // Without this the route is an open relay: anyone could post here and have
    // our server forward it upstream under our project.
    const { POST } = await load(DSN);

    const res = await POST(request(envelope("https://wt_someoneelse@example.com/1")) as never);

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an envelope with no DSN at all", async () => {
    const { POST } = await load(DSN);
    const res = await POST(request(envelope(undefined)) as never);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed envelope rather than forwarding it", async () => {
    const { POST } = await load(DSN);
    const res = await POST(request("this is not an envelope\n") as never);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized payload before paying for an upstream round trip", async () => {
    // Watchtower documents a 1 MB limit; refusing here saves the hop.
    const { POST } = await load(DSN);
    const huge = envelope(DSN, "x".repeat(1_000_001));
    const res = await POST(request(huge) as never);
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts and discards when reporting is not configured", async () => {
    // Local development. The client should not be left retrying a route that
    // can never work, so this is a 204 rather than an error.
    const { POST } = await load(undefined);
    const res = await POST(request(envelope(DSN)) as never);
    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a rate limit and its retry-after back to the SDK", async () => {
    // The SDK backs off on its own, but only if it sees the 429. Swallowing it
    // here would leave the client hammering a throttled upstream.
    fetchMock.mockResolvedValue(
      new Response(null, { status: 429, headers: { "retry-after": "60" } })
    );
    const { POST } = await load(DSN);

    const res = await POST(request(envelope(DSN)) as never);

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("reports a dead upstream as 502 rather than throwing", async () => {
    // Telemetry failing must never surface as an unhandled rejection.
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await load(DSN);

    const res = await POST(request(envelope(DSN)) as never);

    expect(res.status).toBe(502);
  });
});
