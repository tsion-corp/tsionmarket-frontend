// The browser half of push, kept pure so it imports cleanly on the server.
// Nothing here touches a DOM global at module scope: the window is always
// passed in or read inside a function.

export type PushSupport = "supported" | "needs-install" | "unsupported";

/** A VAPID key that the push service would reject, caught before subscribe(). */
export class PushKeyError extends Error {
  constructor(problem: string) {
    super(`The push key is unusable: ${problem}`);
    this.name = "PushKeyError";
  }
}

export type PushSubscriptionField = "endpoint" | "keys.p256dh" | "keys.auth";

/**
 * A subscription the user-management validator would refuse. The message names
 * the field and never the endpoint: the endpoint is a capability URL, and
 * anyone holding it can push to that device, so it must not reach a log or a
 * toast.
 */
export class PushSubscriptionShapeError extends Error {
  readonly field: PushSubscriptionField;

  constructor(field: PushSubscriptionField, problem: string) {
    super(`The push subscription's ${field} ${problem}.`);
    this.name = "PushSubscriptionShapeError";
    this.field = field;
  }
}

// iOS and iPadOS only expose Web Push to a site installed on the Home Screen.
// In a tab there is no PushManager at all, so a plain capability check would
// report "unsupported" and hide the one thing the reader can do about it.
const IOS_AGENT = /iPad|iPhone|iPod/;
const MAC_AGENT = /Macintosh|Mac OS X/;

interface IosNavigator extends Navigator {
  /** Safari's pre-standard flag for a Home Screen launch. */
  standalone?: boolean;
}

function isIosFamily(nav: IosNavigator): boolean {
  const agent = typeof nav.userAgent === "string" ? nav.userAgent : "";
  if (IOS_AGENT.test(agent)) return true;
  // iPadOS reports itself as a Mac. A real Mac has no touch points.
  const touchPoints = typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : 0;
  return MAC_AGENT.test(agent) && touchPoints > 1;
}

function isInstalled(win: Window, nav: IosNavigator): boolean {
  if (nav.standalone === true) return true;
  if (typeof win.matchMedia !== "function") return false;
  return win.matchMedia("(display-mode: standalone)").matches === true;
}

/**
 * Whether this browser can hold a push subscription. "needs-install" means iOS
 * or iPadOS in a browser tab, where push only exists once the site is added to
 * the Home Screen.
 */
export function pushSupport(win?: Window): PushSupport {
  const target = win ?? (typeof window === "undefined" ? null : window);
  if (!target) return "unsupported";

  const nav = target.navigator as IosNavigator | undefined;
  if (!nav) return "unsupported";

  // Checked before the capabilities, because on iOS the capabilities are
  // exactly what an install would add.
  if (isIosFamily(nav) && !isInstalled(target, nav)) return "needs-install";

  const hasWorker = "serviceWorker" in nav;
  const hasPush = "PushManager" in target;
  const hasNotification = "Notification" in target;
  return hasWorker && hasPush && hasNotification ? "supported" : "unsupported";
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

// An uncompressed P-256 point: the 0x04 prefix then the two 32-byte coordinates.
const KEY_BYTES = 65;
const UNCOMPRESSED_PREFIX = 0x04;

/**
 * A VAPID public key as the bytes PushManager.subscribe wants.
 *
 * Returns an ArrayBuffer rather than a view, because TypeScript's BufferSource
 * does not accept a Uint8Array over a generic ArrayBufferLike.
 *
 * Every malformed input is caught here. A truncated key is otherwise accepted
 * by subscribe() and fails much later as an opaque DOMException that says
 * nothing about which key was wrong.
 */
export function applicationServerKey(base64url: string): ArrayBuffer {
  const value = base64url.trim();
  if (value === "") throw new PushKeyError("it is empty");
  if (!BASE64URL.test(value)) throw new PushKeyError("it is not base64url");

  const unpadded = value.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) throw new PushKeyError("its length is not valid base64");

  const padded = unpadded.padEnd(unpadded.length + ((4 - (unpadded.length % 4)) % 4), "=");
  let raw: string;
  try {
    raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    // Rethrown, not swallowed: the caller needs to know it was the key.
    throw new PushKeyError("it could not be decoded");
  }

  if (raw.length !== KEY_BYTES) {
    throw new PushKeyError(`it is ${raw.length} bytes, not ${KEY_BYTES}`);
  }
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  if (bytes[0] !== UNCOMPRESSED_PREFIX) {
    throw new PushKeyError("it is not an uncompressed P-256 point");
  }
  return bytes.buffer;
}

export interface PushSubscriptionDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// The user-management validator's limits, copied from its code. Checking them
// here turns a 400 from the gateway into a message the hook can act on.
const MAX_ENDPOINT = 2048;
const MAX_KEY = 255;

function readKey(keys: Record<string, string> | null | undefined, name: "p256dh" | "auth"): string {
  const field: PushSubscriptionField = name === "p256dh" ? "keys.p256dh" : "keys.auth";
  const value = keys?.[name];
  if (typeof value !== "string" || value === "") {
    throw new PushSubscriptionShapeError(field, "is missing or empty");
  }
  if (value.length > MAX_KEY) {
    throw new PushSubscriptionShapeError(field, `is longer than ${MAX_KEY} characters`);
  }
  return value;
}

/**
 * The subscription as the service's body, checked against the same limits its
 * validator applies.
 *
 * The host allowlist stays on the server: it knows which push services it
 * recognises, and a browser that rejected an endpoint the server would have
 * accepted would silently lose notifications on that platform.
 */
export function toSubscriptionDto(sub: PushSubscription): PushSubscriptionDto {
  const json = sub.toJSON();
  const endpoint = json.endpoint;
  if (typeof endpoint !== "string" || endpoint === "") {
    throw new PushSubscriptionShapeError("endpoint", "is missing or empty");
  }
  if (endpoint.length > MAX_ENDPOINT) {
    throw new PushSubscriptionShapeError("endpoint", `is longer than ${MAX_ENDPOINT} characters`);
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    // Rethrown as our own error so the endpoint stays out of the message.
    throw new PushSubscriptionShapeError("endpoint", "is not a URL");
  }
  if (parsed.protocol !== "https:") {
    throw new PushSubscriptionShapeError("endpoint", "is not https");
  }

  return {
    endpoint,
    keys: { p256dh: readKey(json.keys, "p256dh"), auth: readKey(json.keys, "auth") },
  };
}
