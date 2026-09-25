// The platform push service worker.
//
// Deliberately minimal: it caches nothing and intercepts no fetch. A caching
// worker on a live trading surface would serve stale prices, so this stays out
// of the request path entirely. Its whole job is to show a notification when
// one is pushed, and to open the right page when it is tapped.
//
// This file is served straight from public/ and is never bundled, so it cannot
// import from lib/. readPushPayload and notificationDestination below are hand
// mirrors of lib/notifications/payload.ts and lib/notifications/destination.ts.
// If the rules change there, change them here too: __tests__/push-service-worker.test.ts
// evaluates this file directly and is what keeps the two honest.
//
// Never log a push endpoint or a Privy DID from here. An endpoint is a
// capability URL: anyone holding it can push to that device.

const SW_VERSION = "2026-09-21.1";

// Both live under public/icons/ and are generated from app/icon.svg.
const NOTIFICATION_ICON = "/icons/icon-192.png";
const NOTIFICATION_BADGE = "/icons/badge-72.png";

// A new script is fetched on every load because next.config.ts serves this file
// with no-store, but without these two a fresh worker would still sit waiting
// until every tab closed. Taking over immediately is what makes that header
// mean anything.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function text(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Mirrors lib/notifications/payload.ts.
 *
 * A title is the one required field: a notification without one is not a
 * notification, and every browser refuses to show it. Everything else is read
 * defensively, so a missing body or url costs the reader the notification's
 * detail rather than the notification itself.
 */
function readPushPayload(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;

  const title = text(raw.title);
  if (title.trim() === "") return null;

  const campaignId = text(raw.campaignId);
  const imageUrl = text(raw.imageUrl);
  // The sender always writes the tag, so an absent one is rebuilt the same way
  // it would have been. Without a tag the worker cannot use renotify.
  const tag = text(raw.tag) || (campaignId === "" ? "" : `admin:${campaignId}`);

  return {
    campaignId,
    title,
    body: text(raw.body),
    // Left exactly as sent. notificationDestination decides whether a click
    // may follow it.
    url: text(raw.url),
    imageUrl: imageUrl === "" ? null : imageUrl,
    tag,
  };
}

// Only ever used to resolve a relative path. A path that somehow reached
// another origin would no longer match this one, which is the check below.
const RELATIVE_BASE = "https://notification.invalid";

/**
 * Mirrors lib/notifications/destination.ts. This is a security boundary rather
 * than a formatter: the value decides where a tap sends the reader, and it
 * arrives from an operator-authored campaign. Only an app-relative path with
 * one leading slash, or an absolute https URL, is allowed.
 */
function notificationDestination(url) {
  const value = text(url).trim();
  if (value === "") return null;

  if (value.startsWith("/")) {
    // "//host" is protocol-relative and leaves the app. Some parsers read a
    // backslash the same way, so "/\host" goes too.
    if (value.startsWith("//") || value.startsWith("/\\")) return null;
    let parsed;
    try {
      parsed = new URL(value, RELATIVE_BASE);
    } catch {
      // Rethrowing nothing: an unparsable path is simply not a destination.
      return null;
    }
    if (parsed.origin !== RELATIVE_BASE) return null;
    return { kind: "internal", path: `${parsed.pathname}${parsed.search}${parsed.hash}` };
  }

  let parsed;
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

function readEventJson(data) {
  try {
    return data.json();
  } catch {
    // A push whose body is not JSON is not ours. Same as above: a guard around
    // a parse, not a swallowed failure.
    return null;
  }
}

function openWindowClients() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

async function messageClients(message) {
  const clients = await openWindowClients();
  for (const client of clients) {
    client.postMessage(message);
  }
}

async function deliver(notification) {
  const options = {
    body: notification.body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    // The service tags every campaign "admin:<campaignId>", so a re-send of the
    // same campaign replaces its own notification instead of stacking.
    tag: notification.tag,
    data: { url: notification.url, campaignId: notification.campaignId },
  };
  // renotify needs a tag to renotify about. Chrome throws a TypeError on
  // renotify with an empty tag, which would lose the notification entirely, so
  // a payload that gave us no tag simply goes without it.
  if (notification.tag !== "") options.renotify = true;
  if (notification.imageUrl) options.image = notification.imageUrl;

  // Both are started together so a tab still refreshes its bell even if the
  // platform refuses to show the notification, and either failure still
  // reaches waitUntil rather than being dropped.
  await Promise.all([
    self.registration.showNotification(notification.title, options),
    messageClients({ type: "notification", campaignId: notification.campaignId }),
  ]);
}

self.addEventListener("push", (event) => {
  const notification = readPushPayload(event.data ? readEventJson(event.data) : null);
  if (!notification) return;
  event.waitUntil(deliver(notification));
});

async function openDestination(destination) {
  if (destination.kind === "external") {
    // openWindow from a worker gives the new context no opener handle and
    // resolves to null for a cross-origin URL, which is the noopener
    // behaviour we want. An existing tab is never navigated off-site.
    await self.clients.openWindow(destination.href);
    return;
  }

  const target = new URL(destination.path, self.location.origin);
  const clients = await openWindowClients();
  for (const client of clients) {
    const current = new URL(client.url);
    if (current.origin === target.origin && current.pathname === target.pathname) {
      await client.focus();
      return;
    }
  }

  // Nothing is on that page, so open it. Deliberately not navigate() on some
  // other tab: that would pull a reader off whatever they were doing.
  await self.clients.openWindow(target.href);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  const destination = notificationDestination(data ? data.url : null);
  // A destination we refuse opens nothing at all. Falling back to "/" would
  // hide a bad campaign url instead of surfacing it.
  if (!destination) return;

  event.waitUntil(openDestination(destination));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // The re-subscribe target is /api/user-management/users/<privy did>/push/subscriptions
  // and a worker cannot know the DID: it holds no session and the access token
  // lives in the page. Posting a subscription to a guessed url would register
  // the device against the wrong person or against nothing, so the worker only
  // tells whatever pages are open that their subscription was replaced and
  // lets the page re-register with the id it already has. With no page open,
  // the hook's silent refresh on the next signed-in load repairs it.
  event.waitUntil(messageClients({ type: "pushsubscriptionchange" }));
});
