---
date: 2026-09-13
feature: Watchtower error, log, performance and uptime reporting
scope: observability, api, instrumentation, transport, build
scenario-impact: none
---

# Watchtower error, log, performance and uptime reporting

Connects the frontend to Watchtower (`watchtower-logger.vercel.app`), the team's
own error and observability service, using the official `@sentry/nextjs` SDK
pointed at Watchtower's Sentry-compatible DSN. See
`docs/adr/ADR-2026-09-12-watchtower-error-tracking.md` for the decision and the
plain-English companion beside it.

Before this, the app reported nothing. `app/error.tsx` caught a crash, showed a
recovery screen and told nobody, and there was no `global-error.tsx` at all, so
a root layout crash was never recorded. A production failure was discovered when
a person complained.

## What changed

- **Shared configuration (`lib/analytics/watchtower.ts`)**: DSN, environment,
  release and redaction, sitting beside `mixpanel.ts` and `clarity.ts`. All
  runtimes read from here so the client, server and edge cannot drift apart.
- **On-device redaction**: Watchtower scrubs on ingest, which is after a payload
  crosses the network. All four outbound paths are scrubbed in the browser
  instead: `beforeSend`, `beforeSendTransaction`, `beforeBreadcrumb` and
  `beforeSendLog`. Logs needed the fourth hook specifically, because
  `@sentry/core` runs them down a separate path that never consults
  `beforeSend`. Covers BIP-39 phrases, 32-byte hex private keys, JWTs, bearer
  credentials, sensitive query parameters and the `wtt_` org token. Wallet
  addresses and the public `wt_` project key are deliberately left intact.
- **Issues**: uncaught exceptions, both error boundaries, `onRequestError` for
  route handlers and Server Components, and upstream failures reported from the
  one transport in `lib/api.ts` (5xx, network failures and 429 only, grouped by
  route and status, throttled to one per minute per endpoint).
- **Logs**: `console.error` forwarded via `consoleLoggingIntegration`.
- **Performance**: tracing at 10% in production and 100% in preview, which also
  gives Web Vitals.
- **Monitors**: `app/api/heartbeat/route.ts` on an hourly Vercel cron, probing
  the real gateway rather than itself and upserting its own schedule so a missed
  check-in can alert.
- **Same-origin forwarder (`app/api/monitoring/route.ts`)**: ad blocker filter
  lists match Sentry's ingest shape on any host, so a direct request is dropped
  in the browser. The route refuses envelopes that are not this project's.
- **DSN normalisation**: Watchtower issues a UUID project id; the Sentry SDK
  requires a numeric one and silently builds a client with no transport
  otherwise, discarding every event. Rewritten to a numeric id, which is safe
  because Watchtower routes on `sentry_key`.
- **Build (`next.config.ts`)**: `withSentryConfig` from `@sentry/nextjs/config`,
  plugin telemetry off, source map upload gated on credentials being present so
  it can neither hang nor fail a release. `tunnelRoute` is deliberately NOT set:
  its rewrite is hardcoded to sentry.io regardless of `sentryUrl`.
- **Budgets (`scripts/first-load-budget.json`)**: `/`, `/privacy`, `/welcome`,
  `/prediction` and `/casino` raised 12-32 kB for the SDK, which is loaded
  statically on purpose. Deferring it would move the bytes out of first load but
  miss the hydration-time crashes that are the most valuable thing it catches.

## Environment

- `NEXT_PUBLIC_WATCHTOWER_DSN` enables reporting. Unset is a full no-op, which
  is the local development state.
- `CRON_SECRET` guards the heartbeat route. Without it the route is an
  unauthenticated way to make the server poll the gateway.
- `WATCHTOWER_ORG`, `WATCHTOWER_PROJECT`, `WATCHTOWER_AUTH_TOKEN` enable source
  map upload in CI. Deliberately not named `SENTRY_*`: the bundler plugin reads
  those from the environment by itself, and a leftover sentry.io token was
  enough to hang a build.
- A pre-existing sentry.io account was removed from `.env`, including a
  `NEXT_PUBLIC_SENTRY_DSN` that the SDK would otherwise have fallen back to,
  sending this app's events to a third party.

## Tests

- `lib/analytics/watchtower.test.ts` (redaction, DSN normalisation, option
  wiring, upstream failure reporting and its throttle).
- `app/api/monitoring/route.test.ts` (forwarding, foreign envelope rejection,
  size limit, rate limit passthrough, dead upstream).
- `app/api/heartbeat/route.test.ts` (gateway probe, error check-in, monitor
  schedule, `CRON_SECRET` guard, reporting failure containment).
- Verified live against Watchtower: events, logs, transactions and check-ins all
  accepted with `dropped: 0`, and a seed phrase in a thrown error and in a
  `console.error` confirmed redacted on the wire.
- `./scripts/preflight.sh` passing all 5 gates.
