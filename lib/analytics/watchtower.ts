// Watchtower: error tracking, logs and performance, running on the team's own
// service at watchtower-logger.vercel.app. It speaks the Sentry protocol, so
// the client here is the official Sentry SDK pointed at our endpoint rather
// than a bespoke package. Two reasons that matter:
//
//  - The Sentry SDK gives us `beforeSend`, which is the only place a secret can
//    be removed BEFORE it crosses the network. Watchtower scrubs on ingest,
//    which is too late for this app: a seed phrase in an error message would
//    already have left the browser. Everything in `scrubEvent` below runs on
//    the reader's device.
//  - If Watchtower is ever unavailable or retired, moving to hosted Sentry is
//    one environment variable, not a rewrite.
//
// This module owns the shared options. The three entry points (client, server,
// edge) differ only in where they run, so they all call `watchtowerOptions()`
// and add nothing of their own.
//
// Masking discipline is shared with Clarity, deliberately. The screens that
// must not be recorded are the same screens that must not be reported, so see
// MASK_ATTRIBUTE in lib/analytics/clarity.ts for the field-level rule. This
// file is the safety net underneath it, not a replacement for it.

import * as Sentry from "@sentry/nextjs";
import { ANALYTICS_ENVIRONMENT } from "@/lib/analytics/environment";

// The endpoint and project, as one Sentry-format DSN:
// https://<project key>@watchtower-logger.vercel.app/<project id>
//
// Public by design. A DSN is write-only: it can post an event and can read
// nothing back, which is why it ships in the browser bundle the same way the
// Privy app id and the Clarity project id already do. The org token (wtt_...)
// is a different credential entirely, it is NOT this, and it must never reach
// the client. It belongs in CI for source map upload and nowhere else.
const CONFIGURED_DSN = process.env.NEXT_PUBLIC_WATCHTOWER_DSN;

/**
 * Rewrites a Watchtower DSN so the Sentry SDK will accept it.
 *
 * Watchtower issues DSNs whose project id is a UUID:
 *
 *   https://wt_<key>@watchtower-logger.vercel.app/e7988bd6-487f-4fcc-...
 *
 * The Sentry SDK rejects that. Its DSN validator requires a numeric project id
 * (`@sentry/core` checks `projectId.match(/^\d+$/)`), and a DSN that fails
 * validation leaves the client with no transport at all. The failure is
 * completely silent outside debug mode: `init` returns, `captureException`
 * hands back an event id, `flush` resolves true, and every event is discarded.
 * That is exactly what happened here, and it is why this function exists rather
 * than a comment saying "the DSN works".
 *
 * Swapping the project id is safe because Watchtower identifies the project by
 * the `sentry_key` query parameter, not by the path. Verified directly against
 * the live endpoint: posting the same envelope to /api/<uuid>/envelope/,
 * /api/0/envelope/ and /api/1/envelope/ each returned
 * `{"events":1,...,"dropped":0}`. The public key is what routes it.
 *
 * A DSN that already has a numeric project id passes through untouched, so if
 * Watchtower starts issuing Sentry-shaped DSNs this quietly becomes a no-op and
 * can be deleted.
 */
export function normalizeDsn(dsn: string | undefined): string | undefined {
  if (!dsn) return undefined;
  const match = /^(https?:\/\/[^@]+@[^/]+)\/(.+)$/.exec(dsn.trim());
  if (!match) return dsn;
  const [, prefix, projectId] = match;
  return /^\d+$/.test(projectId) ? dsn : `${prefix}/0`;
}

const DSN = normalizeDsn(CONFIGURED_DSN);

// Which deployment an event came from, so a staging crash never pages anyone
// for production. Shared with Mixpanel; see ./environment.
const ENVIRONMENT = ANALYTICS_ENVIRONMENT;

// Ties an event to the build it came from. next.config.ts already stamps the
// package version into the bundle for analytics, so this reuses it rather than
// introducing a second notion of "which release is this".
const RELEASE = process.env.NEXT_PUBLIC_APP_VERSION;

/** Whether reporting is configured at all. Without a DSN every entry point is a no-op. */
export const watchtowerEnabled = Boolean(DSN);

/**
 * Where the browser posts its events: our own origin, not Watchtower's.
 *
 * Ad blocker filter lists match Sentry's ingest shape on any host, so a direct
 * request is dropped in the browser before it reaches the network. Measured
 * from a Brave tab: the POST fails outright while the identical request from
 * Node succeeds. app/api/monitoring/route.ts forwards it on.
 */
export const WATCHTOWER_TUNNEL_PATH = "/api/monitoring";

/**
 * The uptime monitor Watchtower expects a check-in from, on the schedule in
 * vercel.json. app/api/heartbeat/route.ts sends it.
 *
 * Issues only fire when a person is using the app. A monitor is the opposite
 * signal: the alert is the check-in that does not arrive, which is the only way
 * to learn the site stopped answering overnight.
 */
export const HEARTBEAT_MONITOR_SLUG = "wsws-frontend-heartbeat";

/**
 * The schedule Watchtower should expect check-ins on.
 *
 * MUST match the cron entry in vercel.json. It is duplicated because vercel.json
 * is data, not code, and cannot import this; if you change one, change both.
 *
 * Sending this alongside the check-in is what makes the monitor work as an
 * alarm rather than a log. Without a schedule Watchtower has nothing to measure
 * lateness against, so a check-in that never arrives, which is the entire
 * failure this is meant to catch, would simply be silence.
 */
export const HEARTBEAT_SCHEDULE = "0 * * * *";

/**
 * Self-provisioning config sent with every check-in, so the monitor exists with
 * the right schedule without anyone creating it in the dashboard by hand.
 */
export const HEARTBEAT_MONITOR_CONFIG = {
  schedule: { type: "crontab", value: HEARTBEAT_SCHEDULE },
  // Minutes of grace before a late check-in counts as missed. Vercel cron
  // firing is not to-the-second, and a cold start plus an 8s probe is well
  // inside this.
  checkinMargin: 5,
  // The probe times out at 8s, so anything still running after two minutes is
  // wedged rather than slow.
  maxRuntime: 2,
  // One miss is an alert. At hourly checks that is already up to an hour of
  // silence; waiting for a second would be two.
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
} as const;

/** The project's public key, used by the forwarder to reject foreign envelopes. */
export function watchtowerPublicKey(): string | undefined {
  if (!CONFIGURED_DSN) return undefined;
  return /^https?:\/\/([^@]+)@/.exec(CONFIGURED_DSN.trim())?.[1];
}

/**
 * The real Watchtower envelope endpoint, rebuilt from the configured DSN.
 *
 * Server-side only. The project path is taken from the DSN as issued (the UUID),
 * not from the normalised form, because that is the address Watchtower
 * documents even though its routing actually keys off `sentry_key`.
 */
export function watchtowerIngestUrl(): string | undefined {
  if (!CONFIGURED_DSN) return undefined;
  const match = /^(https?):\/\/([^@]+)@([^/]+)\/(.+)$/.exec(CONFIGURED_DSN.trim());
  if (!match) return undefined;
  const [, protocol, key, host, projectId] = match;
  return `${protocol}://${host}/api/${projectId}/envelope/?sentry_version=7&sentry_key=${key}`;
}

// What must never leave the device, as patterns rather than field names.
//
// Field names are not enough on their own: the dangerous values arrive inside
// free text far more often than in a tidily named field. A wallet SDK throwing
// `Error: invalid mnemonic "ridge apple ..."` puts a seed phrase in
// `exception.value`, where no allowlist of keys would catch it.
//
// Each entry replaces the secret and keeps the shape, so an engineer reading
// the issue can still tell what kind of value was there.
const REDACTIONS: { pattern: RegExp; replacement: string }[] = [
  // BIP-39 recovery phrases. Twelve or more lowercase words in a row is not
  // something this app's copy produces, so the false positive cost is a
  // redacted sentence in an error message and the false negative cost is a
  // drained wallet. Ordered first so it wins over narrower patterns.
  {
    pattern: /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/g,
    replacement: "[redacted: recovery phrase]",
  },
  // Private keys, and any other 32-byte hex blob. Addresses are 20 bytes and
  // are left alone: they are pseudonymous, they are not a credential, and an
  // issue without one is usually not debuggable.
  { pattern: /\b0x[a-fA-F0-9]{64}\b/g, replacement: "[redacted: private key]" },
  { pattern: /\b[a-fA-F0-9]{64}\b/g, replacement: "[redacted: 32-byte hex]" },
  // JSON Web Tokens, including the Privy session token.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
    replacement: "[redacted: jwt]",
  },
  // Bearer credentials wherever they appear as text.
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, replacement: "Bearer [redacted]" },
  // Secrets carried in a query string. Captures the parameter name so the URL
  // still reads correctly, and covers the ?key= form Watchtower's own API
  // accepts as well as the usual auth parameters.
  {
    pattern:
      /([?&](?:key|token|secret|password|passphrase|code|signature|api[_-]?key|access[_-]?token|id[_-]?token|refresh[_-]?token)=)[^&#\s]+/gi,
    replacement: "$1[redacted]",
  },
  // Watchtower's ORG token (wtt_), which is a real credential: it can write to
  // every project in the workspace and upload releases.
  //
  // Only wtt_. The project key (wt_) is deliberately NOT matched, and that
  // distinction is load-bearing rather than pedantic. It is public by design,
  // it travels in the request URL on every single event anyway, and Sentry
  // copies it into the envelope's dynamic sampling context. Redacting it there
  // corrupted the trace header of every outgoing event, observed live as
  // `"public_key":"[redacted: watchtower key]"` on the wire. A pattern that
  // hides a non-secret at the cost of mangling real payloads is a bad trade.
  { pattern: /\bwtt_[A-Za-z0-9]{16,}\b/g, replacement: "[redacted: watchtower org token]" },
];

/** Applies every redaction to one string. Exported for the tests only. */
export function redact(value: string): string {
  let out = value;
  for (const { pattern, replacement } of REDACTIONS) {
    // Each RegExp carries /g and therefore `lastIndex`. `replace` resets it,
    // but only because it is called with a global pattern; do not switch this
    // to `exec` without resetting between calls.
    out = out.replace(pattern, replacement);
  }
  return out;
}

// How deep to walk a payload. Sentry events nest a few levels (exception ->
// values -> stacktrace -> frames -> vars), and a cap keeps a cyclic or
// pathological object from turning reporting into a hang. Anything past this
// depth is dropped rather than sent unscrubbed: unreported beats unredacted.
const MAX_DEPTH = 8;

/**
 * Walks a payload and redacts every string in it, keys included.
 *
 * Strings are where secrets live, and they can be anywhere: a message, a
 * breadcrumb, a stack frame's local variables, a fetch URL, a header. Rather
 * than enumerate the places, this rewrites all of them, which is the only
 * version that stays correct as the SDK adds fields.
 */
function scrubDeep<T>(input: T, depth = 0): T {
  if (depth > MAX_DEPTH) return undefined as unknown as T;
  if (typeof input === "string") return redact(input) as unknown as T;
  if (input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) {
    return input.map((item) => scrubDeep(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // A key can carry a secret too, e.g. an object keyed by session token.
    out[redact(key)] = scrubDeep(value, depth + 1);
  }
  return out as unknown as T;
}

// Headers that are a credential by definition. Removed outright rather than
// pattern-matched, because their whole value is the secret.
const DROPPED_HEADERS = new Set(["cookie", "set-cookie", "authorization", "x-watchtower-key"]);

/**
 * The last gate before an event leaves the device.
 *
 * Returning null drops the event entirely. That is the right answer when
 * scrubbing itself fails: a report we cannot guarantee is clean is worth less
 * than the risk of sending it.
 */
// `object` rather than `Record<string, unknown>` on purpose. Sentry's own
// ErrorEvent, TransactionEvent and Breadcrumb are interfaces without an index
// signature, so a Record constraint would not accept them and the options
// below would need a cast each. This shape takes all three as they are.
export function scrubEvent<T extends object>(event: T): T | null {
  try {
    const scrubbed = scrubDeep(event);
    const request = (scrubbed as { request?: { headers?: Record<string, string> } }).request;
    if (request?.headers) {
      for (const name of Object.keys(request.headers)) {
        if (DROPPED_HEADERS.has(name.toLowerCase())) delete request.headers[name];
      }
    }
    return scrubbed;
  } catch {
    return null;
  }
}

// How long to wait before reporting the same endpoint failing the same way
// again. This app polls hard (match state every second, tickets every second,
// some of it deliberately continuing in a hidden tab), so an upstream that is
// down would otherwise produce an event per poll per open tab and exhaust
// Watchtower's 1000 events/min project budget in seconds, burying everything
// else. One report a minute per endpoint is enough to see it and to watch it
// recover.
const REPORT_WINDOW_MS = 60_000;
const lastReportedAt = new Map<string, number>();

/**
 * Reports an upstream call that failed, from the one transport.
 *
 * The gap this fills: a caught error is invisible. Sentry's global handlers see
 * uncaught exceptions, but this codebase handles its failures properly, showing
 * a toast or an error state rather than letting anything crash. The result was
 * that the single most important production signal, "the gateway is returning
 * 502 and every user is seeing Couldn't load", raised nothing at all, because
 * from the browser's point of view nothing went wrong.
 *
 * Deliberately narrow about what counts as reportable:
 *
 * - 5xx and network failures are ours. Something upstream is broken.
 * - 429 is reported too, at warning. It is not a crash, but being rate limited
 *   in production is something we need to know about.
 * - 4xx is not reported. A 401 on a cold token, a 404 for a market that does
 *   not exist, a 400 from a bad input: these are normal traffic, and reporting
 *   them would train everyone to ignore the feed.
 * - Nothing is reported while the browser says it is offline. A person on a
 *   train generates network errors that no one can act on.
 */
export function reportUpstreamFailure(
  path: string,
  status: number | undefined,
  cause?: unknown,
  // The service's request id when the response carried one (the trade relay
  // echoes it as x-request-id). The contract asks for it to be preserved in
  // client logs, and this is the client log.
  requestId?: string | null
): void {
  if (!watchtowerEnabled) return;

  // A browser that knows it is offline is not evidence of a broken upstream.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const reportable = status === undefined || status >= 500 || status === 429;
  if (!reportable) return;

  // Query strings carry ids and cursors, so they would split one broken
  // endpoint into thousands of separate issues. Group by the path alone.
  const route = path.split("?")[0];
  const key = `${route}|${status ?? "network"}`;

  const now = Date.now();
  const previous = lastReportedAt.get(key);
  if (previous !== undefined && now - previous < REPORT_WINDOW_MS) return;
  lastReportedAt.set(key, now);

  try {
    Sentry.withScope((scope) => {
      // Group by endpoint and status rather than by stack. Every one of these
      // is thrown from the same line of lib/api.ts, so the default grouping
      // would fold every broken endpoint in the app into one useless issue.
      scope.setFingerprint(["upstream", route, String(status ?? "network")]);
      scope.setLevel(status === 429 ? "warning" : "error");
      scope.setTag("upstream_route", route);
      scope.setTag("upstream_status", String(status ?? "network"));
      if (requestId) scope.setTag("request_id", requestId);
      if (cause !== undefined) scope.setExtra("cause", String(cause));
      Sentry.captureMessage(`Upstream ${status ?? "network failure"} ${route}`);
    });
  } catch {
    // Reporting a failure must never become a second failure.
  }
}

/**
 * A memecoin trade that the chain says delivered but the trade service did
 * not record as CONFIRMED: it recorded FAILED or REVERTED, or refused the
 * submission with 409. The user is told "delivered, still being recorded";
 * the trade team needs the swap, the service's request id and the hash to
 * reconcile it, which is exactly what is tagged here. Not throttled: each one
 * is a distinct swap and a distinct ledger discrepancy.
 */
export function reportTradeRecordingMismatch(mismatch: {
  swapId: string;
  requestId: string | null;
  hash: string | null;
  recorded: string;
}): void {
  if (!watchtowerEnabled) return;
  try {
    Sentry.withScope((scope) => {
      // Grouped by what the service recorded rather than by stack: the point
      // is one issue per failure mode with every swap listed under it.
      scope.setFingerprint(["trade_recording_mismatch", mismatch.recorded]);
      scope.setLevel("error");
      scope.setTag("swap_id", mismatch.swapId);
      scope.setTag("request_id", mismatch.requestId ?? "none");
      scope.setTag("tx_hash", mismatch.hash ?? "none");
      scope.setTag("recorded", mismatch.recorded);
      Sentry.captureMessage(
        `Trade ${mismatch.swapId} delivered on-chain but recorded ${mismatch.recorded}`
      );
    });
  } catch {
    // Reporting a failure must never become a second failure.
  }
}

/** Test seam: the throttle is module state and would otherwise leak between tests. */
export function resetUpstreamReportThrottle(): void {
  lastReportedAt.clear();
}

/**
 * The options every entry point shares.
 *
 * `sendDefaultPii` stays false: it is the switch that would attach IP
 * addresses, cookies and request bodies automatically, and none of those are
 * worth having on an app that shows balances.
 *
 * Session replay is deliberately absent. It is the highest-risk feature here
 * (a recording of a funding or recovery screen is the breach itself, not a
 * route to one) and it should be turned on, if ever, as its own decision with
 * its own masking review, not smuggled in with error reporting.
 */
export function watchtowerOptions() {
  return {
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    sendDefaultPii: false,
    // Performance sampling. Full rate outside production would drown the
    // project in traces from a handful of developers; 10% in production is
    // enough to see a regression in a p95 without paying for every navigation.
    // Performance sampling, per environment.
    //
    // Production is sampled at 10%: enough to see a p95 regression without
    // paying for a trace on every navigation of every session. Preview is
    // sampled fully, because it carries almost no traffic and the whole point
    // of a preview deploy is to be able to look at it. Development sends
    // nothing.
    //
    // This is what populates Watchtower's Performance view, including Web
    // Vitals (LCP, INP, CLS), which the browser tracing integration collects
    // automatically once tracing is on.
    tracesSampleRate: ENVIRONMENT === "production" ? 0.1 : ENVIRONMENT === "preview" ? 1 : 0,
    // Local runs report nothing. Without this every hot reload crash would
    // land in the same project the on-call reads.
    enabled: ENVIRONMENT !== "development",
    // All four hooks, not just the first. An error event is the obvious
    // carrier, but a breadcrumb records every fetch URL and a transaction
    // records every route, so a token in a query string would walk straight
    // out through either of those if only `beforeSend` were covered.
    //
    // `beforeSendLog` is the one that is easy to miss and the most dangerous to
    // miss. Logs do NOT go through `beforeSend`: @sentry/core runs them down a
    // separate path (logs/internal.js) that consults `beforeSendLog` and
    // nothing else. Enabling logs without this line would ship every
    // console.error in the app to Watchtower unredacted, and this app logs
    // upstream payloads.
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubEvent,
    beforeSendLog: scrubEvent,
    // Populates Watchtower's Logs view. Without it the only record of a handled
    // failure is the browser console on one person's machine, which nobody can
    // read after the fact.
    enableLogs: true,
    // Errors only. `warn` in this app is mostly framework and third-party
    // noise, and a log view that has to be filtered before it can be read is
    // one nobody opens.
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["error"] })],
  };
}
