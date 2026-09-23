// How browser analytics reaches Mixpanel: through our own origin.
//
// Ad blockers drop requests to Mixpanel's hosts, and their filter lists also
// match words like "mixpanel", "track" and "analytics" in a path on any host.
// So the SDK posts to a neutral same-origin path, under short route names, and
// app/api/relay maps them back to Mixpanel's own endpoints. Watchtower's
// tunnel (app/api/monitoring) exists for the same reason.
//
// Shared by the browser (lib/analytics/mixpanel.ts) and the server
// (app/api/relay), so the two cannot drift apart.

/** The relay's path on our origin. */
export const RELAY_PATH = "/api/relay";

/**
 * Project 4051122 is stored in Mixpanel's EU data centre, so ingestion goes to
 * its EU host. The SDK's own default is the US host.
 */
export const MIXPANEL_INGEST_HOST = "https://api-eu.mixpanel.com";

/** The relay's short route for each Mixpanel endpoint it forwards. */
export const RELAY_ROUTES = {
  track: "e",
  engage: "p",
  groups: "g",
} as const;

export type RelayedEndpoint = keyof typeof RELAY_ROUTES;

/** The Mixpanel endpoint a relay route stands for, or null when it forwards none. */
export function endpointForRoute(route: string): RelayedEndpoint | null {
  for (const [endpoint, short] of Object.entries(RELAY_ROUTES)) {
    if (short === route) return endpoint as RelayedEndpoint;
  }
  return null;
}
