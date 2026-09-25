// Where a notification may send the reader.
//
// This is a security boundary, not a formatter. The url is operator-authored
// text that reaches every user, and it decides what a click does, so anything
// that is not plainly an app path or an https page is refused.
//
// The service accepts an app-relative path starting with one "/" or an
// absolute https URL, and nothing else. public/push-service-worker.js mirrors
// these rules in plain JS, because a service worker cannot import from the
// bundle.

export type NotificationDestination =
  { kind: "internal"; path: string } | { kind: "external"; href: string };

// Only ever used to resolve a relative path. A path that somehow reached
// another origin would no longer match this one, which is the check below.
const RELATIVE_BASE = "https://notification.invalid";

/** The destination, or null if the url may not be followed. */
export function notificationDestination(url: string): NotificationDestination | null {
  const value = url.trim();
  if (value === "") return null;

  if (value.startsWith("/")) {
    // "//host" is protocol-relative and leaves the app. Some parsers read a
    // backslash the same way, so "/\host" goes too.
    if (value.startsWith("//") || value.startsWith("/\\")) return null;
    let parsed: URL;
    try {
      parsed = new URL(value, RELATIVE_BASE);
    } catch {
      // Rethrowing nothing: an unparsable path is simply not a destination.
      return null;
    }
    if (parsed.origin !== RELATIVE_BASE) return null;
    return { kind: "internal", path: `${parsed.pathname}${parsed.search}${parsed.hash}` };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  // https only: http would downgrade the connection, and javascript: and data:
  // would run the operator's text as code in our origin.
  if (parsed.protocol !== "https:") return null;
  // "https://docs.example.com@evil.com" reads as one host and goes to another.
  if (parsed.username !== "" || parsed.password !== "") return null;
  return { kind: "external", href: parsed.href };
}
