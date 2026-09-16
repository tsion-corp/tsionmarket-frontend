import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getWsapiBase } from "@/lib/wsapi-base";
import {
  HEARTBEAT_MONITOR_CONFIG,
  HEARTBEAT_MONITOR_SLUG,
  watchtowerEnabled,
} from "@/lib/analytics/watchtower";

// The uptime half of Watchtower, driven by the Vercel cron in vercel.json.
//
// Issues tell us something broke while somebody was using the app. They cannot
// tell us the app stopped answering at 3am, because nobody was there to hit it.
// A monitor inverts that: Watchtower expects a check-in on a schedule and
// raises an alert when one does not arrive. Silence becomes the signal.
//
// The check deliberately includes the API gateway rather than just returning
// 200. A heartbeat that only proves "this serverless function still runs" is
// close to worthless: that is the part least likely to fail. What actually goes
// down is the upstream, and when it does every screen in the app shows an error
// state. So a failed gateway probe reports the check-in as `error`, and
// Watchtower alerts on it even though this route itself was perfectly healthy.

// Keep the probe well inside the 30s function budget in vercel.json. A gateway
// that takes longer than this to answer its own health endpoint is a fault
// worth reporting anyway.
const PROBE_TIMEOUT_MS = 8_000;

export async function GET(req: NextRequest) {
  // Vercel signs cron invocations with CRON_SECRET when it is set. Without the
  // guard this route is a free, unauthenticated way for anyone to make our
  // server call the gateway on a loop.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const base = getWsapiBase();

  let healthy = false;
  let detail = "";
  try {
    const response = await fetch(`${base}/health`, {
      // Never serve a cached answer to a liveness check: a stale 200 from an
      // edge cache is exactly the reading that would hide an outage.
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    healthy = response.ok;
    detail = `HTTP ${response.status}`;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  const duration = (Date.now() - startedAt) / 1000;

  // Reported through the configured client, so it carries the same release and
  // environment as every other event and passes through the same scrubbing.
  if (watchtowerEnabled) {
    try {
      // monitorConfig upserts the monitor, so it exists with the right
      // schedule without anyone creating it in the dashboard. It is also what
      // lets Watchtower alert on a check-in that never arrives: with no
      // schedule there is nothing to measure lateness against.
      Sentry.captureCheckIn(
        {
          monitorSlug: HEARTBEAT_MONITOR_SLUG,
          status: healthy ? "ok" : "error",
          duration,
        },
        HEARTBEAT_MONITOR_CONFIG
      );
      // A failed probe is also worth an Issue. The monitor tells us the
      // heartbeat is unhealthy; the issue carries which upstream and why.
      if (!healthy) {
        Sentry.withScope((scope) => {
          scope.setFingerprint(["heartbeat", "gateway-unreachable"]);
          scope.setTag("upstream_route", "/health");
          scope.setExtra("detail", detail);
          Sentry.captureMessage(`Gateway health check failed: ${detail}`);
        });
      }
    } catch {
      // A monitor that throws would take the cron down with it, which would
      // then look like an outage. Reporting is best effort, always.
    }
  }

  // 200 either way. The cron is the transport, not the judgement: returning 500
  // here would make Vercel retry and log a failure for something that is
  // already reported, and Watchtower is the place that decides what is an
  // incident.
  return NextResponse.json(
    { ok: healthy, checked: `${base}/health`, detail, duration },
    { headers: { "Cache-Control": "no-store" } }
  );
}
