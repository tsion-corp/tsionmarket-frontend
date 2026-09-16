# ADR-2026-09-12: Watchtower error tracking via the Sentry SDK

- **Status:** Accepted (approved by MarkDavid Ojukwu, 2026-09-13)
- **Date:** 2026-09-12
- **Companion:** `ADR-2026-09-12-watchtower-error-tracking-for-dummies.md`

## Context

The app has no error reporting. `app/error.tsx` catches a render crash, shows the
reader a recovery screen, and tells nobody; `app/global-error.tsx` did not exist
at all, so a crash in the root layout reached Next's built-in screen and was
never recorded. Server errors in route handlers went to the platform log and
nowhere else. In practice a production failure was discovered when a person
reported it.

A team at Worldstreet has built Watchtower (`Worldstreet-Web-Services/watchtower`),
an error, log, performance and uptime service deployed at
`watchtower-logger.vercel.app`. It ships its own SDKs and, importantly, accepts
the Sentry wire protocol: a project exposes both a native key (`wt_...`) and a
Sentry-compatible DSN.

The decision is how to connect this frontend to it.

## Decision

Integrate with the **official `@sentry/nextjs` SDK pointed at Watchtower's DSN**,
not the first-party `@folajindayo/watchtower-browser` package.

Scrubbing of secrets happens **on the device, before transmission**, in
`lib/analytics/watchtower.ts`.

## Why not the first-party SDK

Three reasons, in order of weight.

**1. Watchtower scrubs on ingest, which is the wrong side of the network.**
The documentation states that "passwords, tokens, cookies, card numbers, private
keys and seed phrases are removed on ingest". Ingest is server-side. For an
application that renders balances, wallet addresses and, in recovery flows,
mnemonic phrases, that means a secret has already left the reader's browser and
crossed the network before anything redacts it. The first-party SDK documents no
client-side filtering hook. The Sentry SDK has `beforeSend`, `beforeSendTransaction`
and `beforeBreadcrumb`, which is where redaction belongs.

**2. Supply chain.** The packages are published under `@folajindayo`, a personal
npm scope on a personal email address, while the repository itself is org-owned.
Code from an individual's namespace would execute inside a bundle that signs
transactions. At time of writing the package is four days old (first published
2026-09-07), has two published versions (`1.0.0` then `2.1.0`) and 5 downloads in
the last month. None of that is a criticism of the work; it is simply not yet a
dependency profile this particular bundle should carry.

**3. Exit cost.** A DSN is a URL. If Watchtower is unavailable, retired, or
outgrown, moving to hosted Sentry is one environment variable and no code change.
Adopting the bespoke SDK would make that a rewrite.

The Sentry-protocol compatibility is the single best decision in Watchtower's
design, and this ADR leans on it entirely.

## Architecture

```
                        lib/analytics/watchtower.ts
                        (DSN, environment, release,
                         REDACTIONS, scrubEvent)
                                   |
             +---------------------+---------------------+
             |                     |                     |
  instrumentation-client.ts   instrumentation.ts    next.config.ts
     (browser: Sentry.init,     (server + edge:      (withSentryConfig:
      router transitions,        register,            source maps when
      tunnel -> /api/monitoring) onRequestError)      credentials are set)
             |                          |
             |                          +--> Watchtower (direct)
             v
  app/api/monitoring/route.ts --------------> Watchtower (forwarded)
     (same-origin forwarder, past ad blockers)

     app/error.tsx  ...........  captureException
     app/global-error.tsx ......  captureException
```

One module owns the options so the three runtimes cannot drift apart. The entry
points call `watchtowerOptions()` and add nothing of their own.

### Layering

`lib/analytics/watchtower.ts` sits beside `mixpanel.ts` and `clarity.ts`, the two
existing third-party telemetry modules. It imports nothing from `features/` or
`components/`, so the downward-import rule holds. The choice of `lib/analytics/`
over a new `lib/observability/` is deliberate: `clarity.ts` already captures JS
errors, so error reporting is not a new family, and one module does not justify
a parallel directory.

### Redaction

`scrubEvent` walks the whole payload and rewrites every string, keys included,
rather than redacting a list of known fields. The reason is that dangerous values
arrive in free text far more often than in tidily named fields: a wallet library
throwing `invalid mnemonic "ridge apple ..."` puts a seed phrase in
`exception.value`, where no field allowlist would catch it.

Patterns covered: BIP-39 phrases (12 to 24 lowercase words), 32-byte hex values
(private keys), JWTs, `Bearer` credentials, sensitive query parameters, and the
Watchtower org token (`wtt_`).

Two things are deliberately **not** redacted. Twenty-byte wallet addresses are
pseudonymous rather than a credential, and an issue without one is usually not
debuggable. The public project key (`wt_`) already travels in the request URL on
every event and is copied by Sentry into the envelope's dynamic sampling
context, so redacting it corrupts real payloads while hiding nothing.

Two failure modes are chosen explicitly:

- Scrubbing throws: the event is dropped. A report we cannot guarantee is clean
  is worth less than the risk of sending it.
- Payload nests past `MAX_DEPTH` (8): the deep part is dropped, not sent
  unscrubbed. Unreported beats unredacted. This also terminates cyclic payloads.

### Settings

| Setting            | Value                              | Reason                                                             |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| `sendDefaultPii`   | `false`                            | Would attach IPs, cookies and request bodies                       |
| `enabled`          | off in development                 | Hot-reload crashes must not reach the on-call project              |
| `tracesSampleRate` | `0.1` in production, `0` elsewhere | Enough to see a p95 regression without paying for every navigation |
| Session replay     | **not enabled**                    | Highest-risk feature; see below                                    |
| `tunnelRoute`      | **not set**                        | Its rewrite is hardcoded to sentry.io; see below                   |
| `telemetry`        | `false`                            | The plugin otherwise reports our build metrics to Sentry           |
| Source map upload  | off until credentials are set      | Runs only when WATCHTOWER_ORG/PROJECT/AUTH_TOKEN are all present   |

### Three defects found by verifying in a real browser

None of these were visible from code review, a green test suite, or a clean
build. All three were found by loading a production build in a browser and
watching what actually went over the wire.

**1. The Sentry-compatible DSN is not accepted by the Sentry SDK.** Watchtower
issues a DSN whose project id is a UUID. `@sentry/core` validates project ids
with `projectId.match(/^\d+$/)` and rejects anything else. A rejected DSN leaves
the client with **no transport at all**, and the failure is entirely silent
outside debug mode: `init` returns normally, `captureException` hands back an
event id, `flush()` resolves `true`, and every event is discarded. Observed
live: `client.getTransport()` was `undefined` and `getDsn()` falsy.

`normalizeDsn` in `lib/analytics/watchtower.ts` rewrites the project id to `0`.
That is safe because Watchtower routes on the `sentry_key` query parameter, not
the path, which was verified against the live endpoint by posting the same
envelope to `/api/<uuid>/`, `/api/0/` and `/api/1/` and getting
`{"events":1,"dropped":0}` from each. If Watchtower ever issues numeric project
ids the function becomes a no-op and can be deleted.

**2. Ad blockers drop the direct request, so the browser needs a tunnel.**
Filter lists match Sentry's ingest shape on any host. From a Brave tab a POST
carrying `sentry_key` never leaves the browser ("Failed to fetch"), while the
identical request from Node succeeds. This is not CORS; Watchtower answers the
preflight correctly with `Access-Control-Allow-Origin: *`.

The fix is `app/api/monitoring/route.ts`, a same-origin forwarder, with the
client setting `tunnel: "/api/monitoring"`. This is also what the architecture
rules already require ("every upstream call goes through a route handler in
`app/api/`"). The route refuses any envelope whose DSN is not this project's, so
it cannot be used as an open relay. The server SDK does not tunnel: there is no
blocker in front of it and the extra hop would be pointless.

**3. The scrubber was redacting our own public key.** The first redaction
pattern matched both `wt_` (public project key) and `wtt_` (org token). Sentry
copies the public key into the envelope's dynamic sampling context, so every
outgoing event went out with `"public_key":"[redacted: watchtower key]"` in its
trace header. Narrowed to `wtt_` only. The project key is public by design and
already travels in the request URL on every event; hiding it there bought
nothing and corrupted real payloads.

### Two things found while configuring the build

**`tunnelRoute` would have sent our events to Sentry.** It is the documented way
to proxy events through your own origin so ad blockers cannot silence reporting,
and it was in the first draft of this change. The rewrite it generates ignores
`sentryUrl` and is hardcoded to Sentry's SaaS ingest:

```
destination: https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/
```

That would have forwarded this app's error payloads to a third party we have no
agreement with. It is removed, with a comment in `next.config.ts` explaining why
it must not be added back. If ad blockers do turn out to drop events, the fix is
a route handler under `app/api/` forwarding to Watchtower, which is what this
codebase does for every other upstream.

**Source map upload hung, and the cause was a second monitoring account.** The
first build ran a real `sentry-cli sourcemaps upload` against
`watchtower-logger.vercel.app` and never returned. The reason was a pre-existing
**sentry.io** account configured in `.env` (org `tsion-n2`, project
`frontend-monitor`, plus a live `sntrys_` auth token and a
`NEXT_PUBLIC_SENTRY_DSN` pointing at `ingest.us.sentry.io`). The bundler plugin
picked those up on its own and tried to authenticate a sentry.io token against
Watchtower's host.

Three consequences, all now applied:

1. Those variables are removed from `.env`. The `NEXT_PUBLIC_SENTRY_DSN` one
   mattered most: the SDK falls back to it when no DSN is passed, so leaving it
   in place meant any misconfiguration would have quietly sent this app's events
   to sentry.io instead of Watchtower.
2. The build options read `WATCHTOWER_ORG`, `WATCHTOWER_PROJECT` and
   `WATCHTOWER_AUTH_TOKEN` rather than the plugin's conventional `SENTRY_*`
   names. Since the plugin reads `SENTRY_*` from the environment by itself, our
   own names are the only way to guarantee a stray token cannot switch uploading
   back on.
3. Upload runs only when `WATCHTOWER_ORG`, `WATCHTOWER_PROJECT` and
   `WATCHTOWER_AUTH_TOKEN` are all set, and is guarded by an
   `errorHandler` that warns instead of failing. Turn it on once Watchtower's
   upload endpoint is confirmed to answer.

The credentials exposed by that investigation should be rotated at sentry.io
regardless; removing a token from a file does not revoke it.

Session replay is left off on purpose. A recording of a funding or recovery
screen is the breach itself, not a route to one. If it is ever wanted it should
be its own decision with its own masking review, using the `MASK_ATTRIBUTE`
discipline `lib/analytics/clarity.ts` already defines, not switched on quietly
alongside error reporting.

### Reporting handled failures, not just crashes

Sentry's global handlers only see what nobody caught. This codebase catches
everything: a hook handles the error and the screen shows "Couldn't load"
rather than crashing, which is correct and is also why the most important
production signal was invisible. An audit found 109 `console.error` sites and
97 files with catch blocks in `features/`, none of which reported anything. An
upstream returning 502 to every user would have raised no alert at all.

`reportUpstreamFailure` closes that, called from the one transport in
`lib/api.ts` rather than from 109 call sites. That placement follows the
existing rule that there is exactly one `apiFetch`, and it means a new feature
gets reporting without its author doing anything.

What it reports is deliberately narrow, because a feed nobody trusts is a feed
nobody reads:

| Condition               | Reported     | Why                                           |
| ----------------------- | ------------ | --------------------------------------------- |
| 5xx                     | yes, error   | Something upstream is broken                  |
| Network failure, online | yes, error   | DNS, TCP, CORS; the "Couldn't load" case      |
| 429                     | yes, warning | Being rate limited in production matters      |
| 4xx                     | no           | Cold-token 401s and 404s are ordinary traffic |
| Anything while offline  | no           | Nobody can act on a person on a train         |

Two details that matter at this app's polling rate. Events are grouped by route
and status via an explicit fingerprint, because every one of these is raised
from the same line and default grouping would fold every broken endpoint in the
app into one useless issue. And reports are throttled to one per route+status
per minute: several surfaces poll every second, some deliberately in a hidden
tab, so an unthrottled dead endpoint would exhaust Watchtower's 1000 events/min
project budget in seconds and bury everything else.

### The four Watchtower surfaces, and what feeds each

| Surface         | Fed by                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **Issues**      | Uncaught exceptions, both error boundaries, `onRequestError`, and `reportUpstreamFailure` from the transport |
| **Logs**        | `console.error`, via `consoleLoggingIntegration`                                                             |
| **Performance** | Tracing at 10% in production, 100% in preview; Web Vitals come with it                                       |
| **Monitors**    | `app/api/heartbeat/route.ts`, on the Vercel cron in `vercel.json`                                            |

**Logs do not go through `beforeSend`.** `@sentry/core` runs them down a
separate path (`logs/internal.js`) that consults `beforeSendLog` and nothing
else. Turning on `enableLogs` without wiring that hook would have shipped every
`console.error` in the app to Watchtower unredacted, and this app logs upstream
payloads. All four outbound paths are now scrubbed: `beforeSend`,
`beforeSendTransaction`, `beforeBreadcrumb`, `beforeSendLog`.

Only `error` level is forwarded. `warn` here is mostly framework and
third-party noise, and a log view that must be filtered before it can be read is
one nobody opens.

**The monitor probes the gateway, not itself.** A heartbeat that only proves
"this serverless function still runs" is close to worthless, because that is the
part least likely to fail. What actually goes down is the upstream, and when it
does every screen shows an error state. So the route checks `WSAPI_BASE/health`
and checks in as `error` when that fails, even though the route itself was
healthy. It also raises an Issue carrying which upstream and why, because the
monitor says "unhealthy" and the issue says "and here is what broke".

The route returns 200 either way: the cron is the transport, not the judgement.
Returning 500 would make Vercel retry and log a failure for something already
reported. It is guarded by `CRON_SECRET` when set, since otherwise it is a free
unauthenticated way to make our server call the gateway on a loop.

Preview is sampled at 100% deliberately. It carries almost no traffic and the
whole point of a preview deploy is to be able to look at it.

## Consequences

**Gained.** Uncaught browser exceptions, unhandled rejections, route-handler and
Server Component errors, and root-layout crashes are all reported with a release
and environment attached. `app/error.tsx` stops swallowing errors silently.

**Cost.** One dependency (`@sentry/nextjs` 10.74.0, which declares
`next ^16.0.0-0`). A `/monitoring` route added by the tunnel. Source-map upload
adds build time in CI only.

**Risks accepted.**

- Watchtower has no SLA, status page, data-residency statement or compliance
  posture. It is a four-day-old internal service. Mitigated by the fact that
  telemetry failing is not user-visible and the exit is one variable.
- The recovery-phrase pattern can over-match a run of twelve or more short
  lowercase words. A redacted sentence is the accepted cost of not leaking a
  seed phrase; `watchtower.test.ts` pins the common false-positive case.
- GDPR: error payloads carrying user identifiers are personal data. `sendDefaultPii`
  is off and no `setUser` call is included in this change, but a lawful basis and
  a processor record are still owed before EU traffic is reported at volume. This
  is out of scope here and flagged as follow-up.

## Alternatives considered

**First-party `@folajindayo/watchtower-*` SDK.** Rejected for the three reasons
above. Should be revisited once the packages move to an org scope with 2FA and
provenance, and once a client-side filtering hook exists.

**Hosted Sentry.** Works, costs money, and does not support the team's own
service. The chosen approach keeps this option one variable away.

**Nothing.** Rejected. The current state is that production failures are found
by users telling us.

## Follow-up

1. Confirm with Watchtower's author that the ingest endpoint tolerates the full
   Sentry envelope, including transactions.
2. Publish the SDKs under an org scope before any first-party package is adopted.
3. Decide the GDPR position before enabling `setUser` or replay.
4. Staged rollout: preview first, production once the issue feed is quiet.
