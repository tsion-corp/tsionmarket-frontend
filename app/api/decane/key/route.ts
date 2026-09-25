import { NextResponse } from "next/server";

// Hands the browser the Decane publishable key at runtime instead of baking it
// into the bundle at build time.
//
// What this buys, precisely: the key stops living in the static JS and its
// source maps, so it is not readable from a build artefact, a CDN cache or a
// leaked bundle, and it can be rotated by restarting the server rather than
// rebuilding and redeploying. What it does NOT buy is secrecy — the SDK runs
// in the browser and must send the key, so anyone can read it from devtools or
// by calling this route. The control that stops a third party USING it is the
// key's allowed_origins list, configured in Decane, not this route.
//
// The value is deliberately read from DECANE_API_KEY (server-only). If
// NEXT_PUBLIC_DECANE_API_KEY is still set anywhere it defeats the whole
// exercise, because Next inlines that into the client bundle.

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.DECANE_API_KEY;
  // The app id is an identifier, not a credential; it is only served here so
  // the client needs one round trip rather than two sources of truth.
  const appId = process.env.DECANE_APP_ID ?? process.env.NEXT_PUBLIC_DECANE_APP_ID;

  if (!apiKey || !appId) {
    // Nothing usable to hand over: say so plainly rather than serving a
    // placeholder the SDK would fail on in a way nobody could read.
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_CONFIGURED",
          message: "Decane credentials are not configured on the server.",
        },
      },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  return NextResponse.json(
    { apiKey, appId },
    {
      headers: {
        // Never shared, never stored: a cache in front of this would serve one
        // deployment's key after a rotation.
        "cache-control": "no-store, no-cache, must-revalidate, private",
      },
    }
  );
}
