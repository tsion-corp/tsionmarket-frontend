// Service worker for Web Push.
//
// Deliberately minimal: it does not cache, intercept fetches, or version any
// assets. Its only job is to show a notification when one is pushed and to
// open the right page when it is tapped. A caching service worker on a live
// trading surface would serve stale prices, so this stays out of the way.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A push that is not our JSON is not ours to render.
    return;
  }

  const title = payload.title || "Ark";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || undefined,
      // Grouped by target, so a burst about one listing collapses into the
      // latest rather than stacking up.
      tag: payload.url || "ark-notification",
      renotify: true,
      data: { url: payload.url || "/earn" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/earn";

  // Focuses a tab already on the site rather than opening another one.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
