import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeDsn, redact, scrubEvent } from "@/lib/analytics/watchtower";

// @sentry/nextjs is an ESM namespace, so its exports cannot be spied on with
// vi.spyOn. The module is mocked instead, which also keeps these tests from
// booting a real client or touching the network.
const sentryMock = vi.hoisted(() => {
  const scope = {
    setFingerprint: vi.fn(),
    setLevel: vi.fn(),
    setTag: vi.fn(),
    setExtra: vi.fn(),
  };
  return {
    scope,
    captureMessage: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => void) => cb(scope)),
    consoleLoggingIntegration: vi.fn(() => ({ name: "ConsoleLogging" })),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureMessage: sentryMock.captureMessage,
  withScope: sentryMock.withScope,
  init: vi.fn(),
  captureException: vi.fn(),
  consoleLoggingIntegration: sentryMock.consoleLoggingIntegration,
}));

// These are the tests that decide whether this integration is safe to ship.
// Watchtower removes secrets on ingest, which is after the payload has crossed
// the network; everything here runs before it leaves the device. A regression
// in this file is a disclosure, not a cosmetic bug.
//
// The fixtures below are invented, not real credentials.

describe("redact", () => {
  it("removes a twelve word recovery phrase from an error message", () => {
    const phrase =
      "ridge apple scatter wisdom pupil ocean forest metal cluster gravity noble silver";
    const out = redact(`Error: invalid mnemonic "${phrase}"`);

    expect(out).not.toContain("ridge");
    expect(out).not.toContain("silver");
    expect(out).toContain("[redacted: recovery phrase]");
  });

  it("removes a twenty four word phrase as well as a twelve word one", () => {
    const words = [
      "ridge",
      "apple",
      "scatter",
      "wisdom",
      "pupil",
      "ocean",
      "forest",
      "metal",
      "cluster",
      "gravity",
      "noble",
      "silver",
      "candle",
      "harbor",
      "velvet",
      "puzzle",
      "orbit",
      "tunnel",
      "meadow",
      "frozen",
      "cabin",
      "spiral",
      "walnut",
      "ember",
    ].join(" ");

    expect(redact(words)).toBe("[redacted: recovery phrase]");
  });

  it("removes a private key but keeps a wallet address", () => {
    // 32 bytes is a key. 20 bytes is an address: pseudonymous, not a
    // credential, and an issue without one is usually not debuggable.
    const key = `0x${"a1b2c3d4".repeat(8)}`;
    const address = "0xb381bBC996fa0e326A4a81a881573fB501bD8AAE";

    const out = redact(`signing with ${key} for ${address}`);

    expect(out).not.toContain(key);
    expect(out).toContain("[redacted: private key]");
    expect(out).toContain(address);
  });

  it("removes JWTs and bearer credentials", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    expect(redact(`token=${jwt}`)).toContain("[redacted");
    expect(redact(`token=${jwt}`)).not.toContain("dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    expect(redact("Authorization: Bearer sk_live_abcdef123456789")).toBe(
      "Authorization: Bearer [redacted]"
    );
  });

  it("removes secrets from a query string but keeps the parameter name", () => {
    // The name is what makes the URL readable in an issue; the value is what
    // must not be there. Watchtower's own ?key= form is covered too.
    const out = redact(
      "https://api.example.com/v1/thing?id=42&access_token=abc123xyz&key=wt_secret"
    );

    expect(out).toContain("id=42");
    expect(out).toContain("access_token=[redacted]");
    expect(out).toContain("key=[redacted]");
    expect(out).not.toContain("abc123xyz");
  });

  it("redacts the org token but leaves the public project key alone", () => {
    // wtt_ is a real credential: it writes to every project in the workspace.
    // wt_ is the public project key. It already travels in the request URL on
    // every event, and Sentry copies it into the envelope's dynamic sampling
    // context, so redacting it corrupts the trace header of every outgoing
    // event. That was observed live on the wire before this was narrowed.
    expect(redact("token wtt_abcdefghijklmnopqrstuvwxyz123456")).toContain(
      "[redacted: watchtower org token]"
    );
    expect(redact("key wt_cb940c5fd034a098dd2bc75a6620ac9a")).toBe(
      "key wt_cb940c5fd034a098dd2bc75a6620ac9a"
    );
  });

  it("leaves ordinary error prose alone", () => {
    // The recovery phrase pattern needs a run of lowercase words. Short
    // connectives like "to" and "a" break the run, which is what keeps normal
    // English out of its way. If this test starts failing, the pattern has
    // become too greedy and engineers will stop trusting the issue feed.
    const message =
      "Failed to fetch the market list because the upstream service returned an error";

    expect(redact(message)).toBe(message);
  });
});

describe("scrubEvent", () => {
  it("reaches strings nested anywhere in the payload", () => {
    // Secrets turn up in stack frame locals and breadcrumbs far more often
    // than in the top level message, so the walk has to be exhaustive rather
    // than a list of known fields.
    const key = `0x${"f".repeat(64)}`;
    const event = {
      message: "boom",
      exception: {
        values: [{ stacktrace: { frames: [{ vars: { privateKey: key } }] } }],
      },
      breadcrumbs: [{ message: `POST /api/x?token=${"s".repeat(20)}` }],
    };

    const out = scrubEvent(event)!;
    const serialized = JSON.stringify(out);

    expect(serialized).not.toContain(key);
    expect(serialized).not.toContain("s".repeat(20));
    expect(serialized).toContain("[redacted: private key]");
  });

  it("redacts object keys, not just values", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.Zm9vYmFyYmF6cXV4";
    const out = scrubEvent({ sessions: { [jwt]: "active" } })!;

    expect(JSON.stringify(out)).not.toContain("Zm9vYmFyYmF6cXV4");
  });

  it("drops credential headers outright", () => {
    // Their entire value is the secret, so there is nothing to pattern match.
    const out = scrubEvent({
      request: {
        headers: {
          Cookie: "privy-session=abc",
          Authorization: "Bearer abc",
          "X-Watchtower-Key": "wt_abc",
          "User-Agent": "Mozilla/5.0",
        },
      },
    })!;

    const headers = (out.request as { headers: Record<string, string> }).headers;
    expect(headers).not.toHaveProperty("Cookie");
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers).not.toHaveProperty("X-Watchtower-Key");
    // Everything that is not a credential survives, or the issue is useless.
    expect(headers["User-Agent"]).toBe("Mozilla/5.0");
  });

  it("drops the whole event rather than send one it could not scrub", () => {
    // A report we cannot guarantee is clean is worth less than the risk of
    // sending it, so the failure mode is silence.
    const hostile = {
      get boom(): string {
        throw new Error("cannot read");
      },
    };

    expect(scrubEvent(hostile as unknown as Record<string, unknown>)).toBeNull();
  });

  it("does not hang on a cyclic payload", () => {
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;

    // The depth cap is what makes this terminate; without it the walk runs
    // until the stack gives out and reporting takes the app down with it.
    expect(() => scrubEvent(cyclic)).not.toThrow();
  });

  it("preserves arrays as arrays", () => {
    const out = scrubEvent({ tags: ["a", "b"] })!;
    expect(Array.isArray(out.tags)).toBe(true);
    expect(out.tags).toEqual(["a", "b"]);
  });
});

// The options object is the other half of this integration: a scrubber that
// works is useless if it is not actually attached, or if the DSN never reaches
// the client. These load the module fresh under a controlled environment,
// because it reads process.env once at module scope.
describe("watchtowerOptions", () => {
  const DSN = "https://wt_abc123@watchtower-logger.vercel.app/00000000-0000-0000-0000-000000000000";

  async function load(env: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) vi.stubEnv(k, "");
      else vi.stubEnv(k, v);
    }
    return import("@/lib/analytics/watchtower");
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("attaches the scrubber to all three outbound paths", async () => {
    // A breadcrumb carries every fetch URL and a transaction every route, so a
    // token would walk out through either if only beforeSend were covered.
    const { watchtowerOptions } = await load({
      NEXT_PUBLIC_WATCHTOWER_DSN: DSN,
      NEXT_PUBLIC_VERCEL_ENV: "production",
    });
    const options = watchtowerOptions();

    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeSendTransaction).toBeTypeOf("function");
    expect(options.beforeBreadcrumb).toBeTypeOf("function");
    // And it is the real one, not a stub that passes everything through.
    expect(JSON.stringify(options.beforeSend({ message: `0x${"a".repeat(64)}` }))).toContain(
      "[redacted: private key]"
    );
  });

  it("scrubs logs too, which do NOT go through beforeSend", async () => {
    // The trap: @sentry/core runs logs down a separate path (logs/internal.js)
    // that consults beforeSendLog and nothing else. Without this wiring,
    // enabling logs would ship every console.error in the app to Watchtower
    // unredacted, and this app logs upstream payloads.
    const { watchtowerOptions } = await load({
      NEXT_PUBLIC_WATCHTOWER_DSN: DSN,
      NEXT_PUBLIC_VERCEL_ENV: "production",
    });
    const options = watchtowerOptions();

    expect(options.beforeSendLog).toBeTypeOf("function");
    const scrubbed = options.beforeSendLog({
      body: `seed: ridge apple scatter wisdom pupil ocean forest metal cluster gravity noble silver`,
    });
    expect(JSON.stringify(scrubbed)).toContain("[redacted: recovery phrase]");
    expect(JSON.stringify(scrubbed)).not.toContain("ridge apple scatter");
  });

  it("forwards console.error into Watchtower's Logs view, and only error", async () => {
    // A handled failure otherwise exists only in one person's browser console,
    // where nobody can read it afterwards. `warn` is excluded because it is
    // mostly framework noise and a log view that must be filtered is one
    // nobody opens.
    const { watchtowerOptions } = await load({
      NEXT_PUBLIC_WATCHTOWER_DSN: DSN,
      NEXT_PUBLIC_VERCEL_ENV: "production",
    });
    const options = watchtowerOptions();

    expect(options.enableLogs).toBe(true);
    expect(options.integrations).toHaveLength(1);
    expect(sentryMock.consoleLoggingIntegration).toHaveBeenCalledWith({ levels: ["error"] });
  });

  it("never sends PII by default", async () => {
    const { watchtowerOptions } = await load({ NEXT_PUBLIC_WATCHTOWER_DSN: DSN });
    expect(watchtowerOptions().sendDefaultPii).toBe(false);
  });

  it("stays switched off entirely without a DSN", async () => {
    // The local-development state. Nothing configured means nothing reported,
    // rather than a client that boots and quietly fails every send.
    const { watchtowerEnabled } = await load({ NEXT_PUBLIC_WATCHTOWER_DSN: undefined });
    expect(watchtowerEnabled).toBe(false);
  });

  it("reports from production and preview, but not from a developer's machine", async () => {
    const prod = await load({
      NEXT_PUBLIC_WATCHTOWER_DSN: DSN,
      NEXT_PUBLIC_VERCEL_ENV: "production",
    });
    expect(prod.watchtowerOptions().enabled).toBe(true);
    expect(prod.watchtowerOptions().tracesSampleRate).toBe(0.1);

    const dev = await load({
      NEXT_PUBLIC_WATCHTOWER_DSN: DSN,
      NEXT_PUBLIC_VERCEL_ENV: "development",
    });
    expect(dev.watchtowerOptions().enabled).toBe(false);
    // No traces off production either: a handful of developers would otherwise
    // dominate the sample.
    expect(dev.watchtowerOptions().tracesSampleRate).toBe(0);
  });
});

// The bug that made the whole integration silently inert. Watchtower issues a
// DSN with a UUID project id; the Sentry SDK requires a numeric one and, when
// it does not get one, builds a client with no transport and drops every event
// without raising anything. These pin the rewrite that fixes it.
describe("normalizeDsn", () => {
  const UUID_DSN =
    "https://wt_cb940c5fd034a098dd2bc75a6620ac9a@watchtower-logger.vercel.app/e7988bd6-487f-4fcc-ab6c-aefb8a5e5fd3";

  it("replaces a UUID project id with a numeric one the SDK will accept", () => {
    expect(normalizeDsn(UUID_DSN)).toBe(
      "https://wt_cb940c5fd034a098dd2bc75a6620ac9a@watchtower-logger.vercel.app/0"
    );
  });

  it("satisfies the exact rule @sentry/core validates against", () => {
    // core/src/utils/dsn.ts: if (!projectId.match(/^\d+$/)) reject.
    const projectId = normalizeDsn(UUID_DSN)!.split("/").pop()!;
    expect(projectId).toMatch(/^\d+$/);
  });

  it("keeps the public key and host untouched, since the key is what routes", () => {
    // Watchtower resolves the project from sentry_key, not the path, so the
    // key must survive exactly. Verified live: /api/<uuid>/, /api/0/ and
    // /api/1/ all accepted the same envelope with dropped: 0.
    const out = normalizeDsn(UUID_DSN)!;
    expect(out).toContain("wt_cb940c5fd034a098dd2bc75a6620ac9a@");
    expect(out).toContain("watchtower-logger.vercel.app");
  });

  it("leaves an already numeric project id alone", () => {
    // If Watchtower starts issuing Sentry-shaped DSNs this becomes a no-op and
    // the whole function can be deleted.
    const numeric = "https://wt_abc@watchtower-logger.vercel.app/4503599627370496";
    expect(normalizeDsn(numeric)).toBe(numeric);
  });

  it("passes through undefined and anything it cannot parse", () => {
    expect(normalizeDsn(undefined)).toBeUndefined();
    expect(normalizeDsn("not-a-dsn")).toBe("not-a-dsn");
  });
});

// The gap this closes is the one that made Watchtower worth having: an upstream
// returning 502 to every user, handled correctly by every caller, and therefore
// invisible. These pin what gets reported and, just as importantly, what does
// not, because a feed full of 401s on cold tokens is a feed nobody reads.
describe("reportUpstreamFailure", () => {
  const DSN = "https://wt_abc123@watchtower-logger.vercel.app/0";

  async function load() {
    vi.resetModules();
    sentryMock.captureMessage.mockClear();
    sentryMock.scope.setFingerprint.mockClear();
    sentryMock.scope.setLevel.mockClear();
    vi.stubEnv("NEXT_PUBLIC_WATCHTOWER_DSN", DSN);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    const mod = await import("@/lib/analytics/watchtower");
    mod.resetUpstreamReportThrottle();
    return { ...mod, captureMessage: sentryMock.captureMessage, scope: sentryMock.scope };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports a 502, which is the case the whole integration exists for", async () => {
    const { reportUpstreamFailure, captureMessage, scope } = await load();

    reportUpstreamFailure("/api/dextopus/markets?limit=20", 502);

    expect(captureMessage).toHaveBeenCalledOnce();
    expect(captureMessage.mock.calls[0][0]).toContain("502");
    expect(captureMessage.mock.calls[0][0]).toContain("/api/dextopus/markets");
    // The query string is dropped: ids and cursors would split one broken
    // endpoint into thousands of separate issues.
    expect(captureMessage.mock.calls[0][0]).not.toContain("limit=20");
    expect(scope.setFingerprint).toHaveBeenCalledWith(["upstream", "/api/dextopus/markets", "502"]);
  });

  it("stays quiet for 4xx, which is ordinary traffic", async () => {
    const { reportUpstreamFailure, captureMessage } = await load();

    reportUpstreamFailure("/api/whatever", 401);
    reportUpstreamFailure("/api/whatever", 404);
    reportUpstreamFailure("/api/whatever", 400);

    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("reports rate limiting, but as a warning rather than an error", async () => {
    const { reportUpstreamFailure, scope, captureMessage } = await load();
    reportUpstreamFailure("/api/thing", 429);
    expect(captureMessage).toHaveBeenCalledOnce();
    expect(scope.setLevel).toHaveBeenCalledWith("warning");
  });

  it("throttles a hard-polled broken endpoint to one report per window", async () => {
    // This app polls every second in several places. Without the throttle, one
    // dead endpoint would exhaust Watchtower's 1000 events/min project budget
    // in seconds and bury every other issue.
    const { reportUpstreamFailure, captureMessage } = await load();

    for (let i = 0; i < 50; i++) reportUpstreamFailure("/api/poll", 503);

    expect(captureMessage).toHaveBeenCalledOnce();
  });

  it("keeps different endpoints and different statuses apart", async () => {
    const { reportUpstreamFailure, captureMessage } = await load();

    reportUpstreamFailure("/api/a", 502);
    reportUpstreamFailure("/api/b", 502);
    reportUpstreamFailure("/api/a", 503);

    expect(captureMessage).toHaveBeenCalledTimes(3);
  });

  it("says nothing while the browser knows it is offline", async () => {
    // A person on a train produces network errors nobody can act on.
    const { reportUpstreamFailure, captureMessage } = await load();
    const original = globalThis.navigator;
    vi.stubGlobal("navigator", { ...original, onLine: false });

    reportUpstreamFailure("/api/thing", undefined, new TypeError("Failed to fetch"));

    expect(captureMessage).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", original);
  });

  it("reports a network failure when the browser believes it is online", async () => {
    const { reportUpstreamFailure, captureMessage } = await load();
    const original = globalThis.navigator;
    vi.stubGlobal("navigator", { ...original, onLine: true });

    reportUpstreamFailure("/api/thing", undefined, new TypeError("Failed to fetch"));

    expect(captureMessage).toHaveBeenCalledOnce();
    expect(captureMessage.mock.calls[0][0]).toContain("network failure");
    vi.stubGlobal("navigator", original);
  });
});

// The trade contract says to preserve the service's requestId in client logs
// and support reports. Watchtower is the client log, so a failure that carried
// one is tagged with it, and the recording mismatch (delivered on-chain, but
// the service recorded FAILED or refused the registration) goes there too,
// with everything the trade team needs to find the swap.
describe("trade request ids reach Watchtower", () => {
  const DSN = "https://wt_abc123@watchtower-logger.vercel.app/0";

  async function load() {
    vi.resetModules();
    sentryMock.captureMessage.mockClear();
    sentryMock.scope.setFingerprint.mockClear();
    sentryMock.scope.setLevel.mockClear();
    sentryMock.scope.setTag.mockClear();
    vi.stubEnv("NEXT_PUBLIC_WATCHTOWER_DSN", DSN);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    const mod = await import("@/lib/analytics/watchtower");
    mod.resetUpstreamReportThrottle();
    return { ...mod, captureMessage: sentryMock.captureMessage, scope: sentryMock.scope };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("tags an upstream failure with the requestId the relay echoed", async () => {
    const { reportUpstreamFailure, scope } = await load();
    reportUpstreamFailure("/api/trade/swaps/quote", 502, undefined, "req-77");
    expect(scope.setTag).toHaveBeenCalledWith("request_id", "req-77");
  });

  it("reports a recording mismatch with the swap, request and hash", async () => {
    const { reportTradeRecordingMismatch, captureMessage, scope } = await load();
    reportTradeRecordingMismatch({
      swapId: "swap-1",
      requestId: "req-1",
      hash: "0xswap",
      recorded: "FAILED",
    });
    expect(captureMessage).toHaveBeenCalledOnce();
    expect(captureMessage.mock.calls[0][0]).toContain("swap-1");
    expect(scope.setTag).toHaveBeenCalledWith("swap_id", "swap-1");
    expect(scope.setTag).toHaveBeenCalledWith("request_id", "req-1");
    expect(scope.setTag).toHaveBeenCalledWith("tx_hash", "0xswap");
    expect(scope.setTag).toHaveBeenCalledWith("recorded", "FAILED");
    expect(scope.setFingerprint).toHaveBeenCalledWith(["trade_recording_mismatch", "FAILED"]);
  });

  it("still reports a mismatch when the service gave no requestId, tagged as such", async () => {
    const { reportTradeRecordingMismatch, captureMessage, scope } = await load();
    reportTradeRecordingMismatch({
      swapId: "swap-2",
      requestId: null,
      hash: "0xswap",
      recorded: "SWAP_ALREADY_SUBMITTED",
    });
    expect(captureMessage).toHaveBeenCalledOnce();
    expect(scope.setTag).toHaveBeenCalledWith("request_id", "none");
  });
});
