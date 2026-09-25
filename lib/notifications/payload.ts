// The push payload the user-management service sends, read defensively.
//
// public/push-service-worker.js mirrors every rule in this file in plain JS. A
// service worker is its own top-level script and cannot import from the bundle,
// so the two copies have to be kept in step by hand: change a rule here and
// change it there in the same commit.
//
// The sender writes
// `{ campaignId, title, body, url, imageUrl, tag: "admin:<campaignId>" }`, but
// a browser will hand the worker whatever arrived, including a payload from an
// older deploy or from some other sender entirely.

export interface PushPayload {
  campaignId: string;
  title: string;
  body: string;
  url: string;
  imageUrl: string | null;
  tag: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The payload, or null if there is nothing worth showing.
 *
 * A title is the one required field: a notification without one is not a
 * notification, and every browser refuses to show it. Everything else is read
 * defensively, so a missing body or url costs the reader the notification's
 * detail rather than the notification itself.
 */
export function readPushPayload(raw: unknown): PushPayload | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;

  const title = text(source.title);
  if (title.trim() === "") return null;

  const campaignId = text(source.campaignId);
  const imageUrl = text(source.imageUrl);
  // The sender always writes the tag, so an absent one is rebuilt the same way
  // it would have been. Without a tag the worker cannot use renotify.
  const tag = text(source.tag) || (campaignId === "" ? "" : `admin:${campaignId}`);

  return {
    campaignId,
    title,
    body: text(source.body),
    // Left exactly as sent. notificationDestination decides whether a click may
    // follow it.
    url: text(source.url),
    imageUrl: imageUrl === "" ? null : imageUrl,
    tag,
  };
}
