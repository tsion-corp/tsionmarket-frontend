// What a general Ark broadcast is, as opposed to a game broadcast.
//
// Deep link: null, deliberately.
//
// Market Square models `{ kind: "game", ref }` as "this stream IS a game, open
// the board" and treats such a stream as watch-only. A trade, a portfolio
// review or a prediction market is not a game and must not be routed like one:
// giving it kind "game" would send a viewer into the casino for a stream about
// a bond. There is also no `kind` in the service's vocabulary that means "an
// Ark route", so inventing one here would produce a ref nothing can resolve.
//
// A null deep link makes it a native-style stream, which is what it is, and
// the watch link in the description still carries a viewer to the exact Ark
// route the broadcaster was on. When Market Square adds a kind that means
// "a route in a partner app", this is the one place that changes.

import type { BroadcastTarget } from "@/components/broadcast/broadcast-session";

/** Human name for the Ark surface a path is on, used in the stream title. */
export function surfaceName(path: string): string {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  if (segments.length === 0) return "Ark";
  const [first, second] = segments;
  if (first === "dashboard") return "Ark";
  if (first === "casino") return second ? titleCase(second) : "Arkade";
  return titleCase(first);
}

function titleCase(segment: string): string {
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function arkBroadcastTarget(path: string, displayName: string | null): BroadcastTarget {
  const where = surfaceName(path);
  const who = displayName?.trim();
  return {
    title: who ? `${who} on Ark — ${where}` : `Live on Ark — ${where}`,
    watchPath: path,
    descriptionLead: `Live from Ark. Follow along:`,
    // A trading screen updates constantly and its charts move, so framerate
    // matters more than a sharp still.
    content: "motion",
    deepLink: null,
    creatorApplicationNote: "I want to broadcast my trading and portfolio activity on Ark.",
  };
}
