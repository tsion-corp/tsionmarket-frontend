import {
  storage
} from "./lib.NFSQQWN5.js";

// ../lib/src/notification.ts
var notifications = [];
var listening = false;
function listenToFocus() {
  if (!listening) {
    listening = true;
    window.addEventListener("focus", () => {
      notifications.forEach((n) => n.close());
      notifications = [];
    });
  }
}
function notify(msg) {
  const store = storage.make("just-notified");
  if (document.hasFocus() || Date.now() - parseInt(store.get(), 10) < 1e3) return;
  store.set(String(Date.now()));
  if ($.isFunction(msg)) msg = msg();
  const notification = new Notification("lichess.org", {
    icon: site.asset.url("logo/lichess-favicon-256.png"),
    body: msg
  });
  notification.onclick = () => window.focus();
  notifications.push(notification);
  listenToFocus();
}
function notification_default(msg) {
  if (document.hasFocus() || !("Notification" in window)) return;
  if (Notification.permission === "granted") setTimeout(notify, 10 + Math.random() * 500, msg);
}

export {
  notification_default
};
//# sourceMappingURL=lib.IKPBOCUL.js.map
