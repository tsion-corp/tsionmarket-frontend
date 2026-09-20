// localStorage the browser may refuse to give us.
//
// Blocking site data (Chrome and Edge's "Block third-party cookies and site
// data", Safari's "Block All Cookies", some in-app browsers) makes reading
// `window.localStorage` throw rather than return null, and a full storage quota
// makes writing throw. Both happened during render, where a throw takes down
// the page, so a browser setting could cost a user their whole app, balance
// included. A probe write is the only way to tell a usable store from one that
// reads fine and refuses every write.
const PROBE_KEY = "wsws.storage-probe";

export function safeLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const storage = window.localStorage;
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    // No cache to restore and nowhere to save one. The app reads everything
    // from the network instead, which is slower on a cold load and correct.
    return undefined;
  }
}
