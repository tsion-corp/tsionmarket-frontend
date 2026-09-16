import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The monitor's whole value is that a missing check-in is the alert. These pin
// the two things that would quietly destroy that: a heartbeat that reports "ok"
// when the upstream is down, and a route anyone can call.

const sentryMock = vi.hoisted(() => {
  const scope = { setFingerprint: vi.fn(), setTag: vi.fn(), setExtra: vi.fn(), setLevel: vi.fn() };
  return {
    scope,
    captureCheckIn: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureCheckIn: sentryMock.captureCheckIn,
  captureMessage: sentryMock.captureMessage,
  withScope: sentryMock.withScope,
  init: vi.fn(),
  captureException: vi.fn(),
  consoleLoggingIntegration: vi.fn(() => ({ name: "ConsoleLogging" })),
}));

const DSN = "https://wt_abc123@watchtower-logger.vercel.app/0";

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/heartbeat", { method: "GET", headers });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  sentryMock.captureCheckIn.mockClear();
  sentryMock.captureMessage.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_WATCHTOWER_DSN", env.dsn ?? DSN);
  vi.stubEnv("CRON_SECRET", env.secret ?? "");
  vi.stubEnv("NEXT_PUBLIC_WSAPI_BASE_URL", "https://gateway.example.com");
  return import("./route");
}

describe("GET /api/heartbeat", () => {
  it("checks in ok when the gateway answers", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { GET } = await load();

    const res = await GET(request() as never);

    expect(res.status).toBe(200);
    expect(sentryMock.captureCheckIn).toHaveBeenCalledOnce();
    expect(sentryMock.captureCheckIn.mock.calls[0][0]).toMatchObject({
      monitorSlug: "wsws-frontend-heartbeat",
      status: "ok",
    });
    // It probes the real gateway, not itself.
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://gateway.example.com/health");
  });

  it("sends a schedule with the check-in, or a missed one can never alert", async () => {
    // Without monitorConfig the monitor has nothing to measure lateness
    // against, so the failure it exists to catch (a check-in that never
    // arrives) would just be silence. The schedule must also match vercel.json.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { GET } = await load();

    await GET(request() as never);

    const config = sentryMock.captureCheckIn.mock.calls[0][1];
    expect(config).toMatchObject({
      schedule: { type: "crontab", value: "0 * * * *" },
      failureIssueThreshold: 1,
    });
  });

  it("checks in as an error when the gateway is down, and raises an issue too", async () => {
    // The failure this monitor exists for. A heartbeat that reported "ok" here
    // would be worse than no monitor: it would actively assert health during an
    // outage.
    fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));
    const { GET } = await load();

    const res = await GET(request() as never);

    expect(res.status).toBe(200);
    expect(sentryMock.captureCheckIn.mock.calls[0][0]).toMatchObject({ status: "error" });
    // The monitor says unhealthy; the issue says which upstream and why.
    expect(sentryMock.captureMessage).toHaveBeenCalledOnce();
    expect(sentryMock.captureMessage.mock.calls[0][0]).toContain("503");
  });

  it("checks in as an error when the gateway cannot be reached at all", async () => {
    fetchMock.mockRejectedValue(new Error("ETIMEDOUT"));
    const { GET } = await load();

    await GET(request() as never);

    expect(sentryMock.captureCheckIn.mock.calls[0][0]).toMatchObject({ status: "error" });
    expect(sentryMock.captureMessage.mock.calls[0][0]).toContain("ETIMEDOUT");
  });

  it("never serves a cached answer to a liveness check", async () => {
    // A stale 200 from an edge cache is exactly the reading that would hide an
    // outage.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { GET } = await load();

    await GET(request() as never);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("refuses an unsigned call when CRON_SECRET is set", async () => {
    // Otherwise this is a free, unauthenticated way to make our server hammer
    // the gateway.
    const { GET } = await load({ secret: "s3cret" });

    const res = await GET(request() as never);

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sentryMock.captureCheckIn).not.toHaveBeenCalled();
  });

  it("accepts the call Vercel's cron actually signs", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { GET } = await load({ secret: "s3cret" });

    const res = await GET(request({ authorization: "Bearer s3cret" }) as never);

    expect(res.status).toBe(200);
    expect(sentryMock.captureCheckIn).toHaveBeenCalledOnce();
  });

  it("still answers when reporting is not configured", async () => {
    // Local and any environment without a DSN: the probe runs, nothing is sent.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { GET } = await load({ dsn: "" });

    const res = await GET(request() as never);

    expect(res.status).toBe(200);
    expect(sentryMock.captureCheckIn).not.toHaveBeenCalled();
  });

  it("does not let a reporting failure take the cron down", async () => {
    // A throwing monitor would look exactly like an outage.
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    sentryMock.captureCheckIn.mockImplementationOnce(() => {
      throw new Error("transport exploded");
    });
    const { GET } = await load();

    const res = await GET(request() as never);

    expect(res.status).toBe(200);
  });
});
