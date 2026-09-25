import { describe, expect, it } from "vitest";
import {
  applicationServerKey,
  PushKeyError,
  PushSubscriptionShapeError,
  pushSupport,
  toSubscriptionDto,
} from "@/lib/notifications/push";

// Support detection, the VAPID key decode and the subscription DTO. This suite
// runs in the node environment on purpose: every one of these must import and
// answer honestly with no DOM at all, because the modules are pulled in by
// server-rendered code before hydration.

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

interface FakeWindowOptions {
  userAgent: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  displayMode?: "standalone" | "browser";
  hasServiceWorker?: boolean;
  hasPushManager?: boolean;
  hasNotification?: boolean;
  hasMatchMedia?: boolean;
}

function fakeWindow(options: FakeWindowOptions): Window {
  const {
    userAgent,
    maxTouchPoints = 0,
    standalone,
    displayMode = "browser",
    hasServiceWorker = true,
    hasPushManager = true,
    hasNotification = true,
    hasMatchMedia = true,
  } = options;

  const navigator: Record<string, unknown> = { userAgent, maxTouchPoints };
  if (hasServiceWorker) navigator.serviceWorker = { register: () => Promise.resolve({}) };
  if (standalone !== undefined) navigator.standalone = standalone;

  const win: Record<string, unknown> = { navigator };
  if (hasMatchMedia) {
    win.matchMedia = (query: string) => ({
      matches: query === "(display-mode: standalone)" && displayMode === "standalone",
    });
  }
  if (hasPushManager) win.PushManager = class {};
  if (hasNotification) win.Notification = class {};
  return win as unknown as Window;
}

describe("pushSupport", () => {
  it("is unsupported on the server, where there is no window", () => {
    expect(pushSupport()).toBe("unsupported");
  });

  it("is supported in a desktop browser with the three APIs", () => {
    expect(pushSupport(fakeWindow({ userAgent: CHROME }))).toBe("supported");
  });

  it("is supported on a real Mac, which reports no touch points", () => {
    expect(pushSupport(fakeWindow({ userAgent: MAC_SAFARI, maxTouchPoints: 0 }))).toBe("supported");
  });

  it("needs an install on iOS in a browser tab", () => {
    // iOS exposes no PushManager in a tab, so the capability check alone would
    // say "unsupported" and hide the one thing the reader can do about it.
    const win = fakeWindow({
      userAgent: IPHONE_SAFARI,
      maxTouchPoints: 5,
      standalone: false,
      hasPushManager: false,
      hasNotification: false,
    });
    expect(pushSupport(win)).toBe("needs-install");
  });

  it("is supported on iOS once installed to the Home Screen", () => {
    const win = fakeWindow({
      userAgent: IPHONE_SAFARI,
      maxTouchPoints: 5,
      standalone: true,
      displayMode: "standalone",
    });
    expect(pushSupport(win)).toBe("supported");
  });

  it("reads the display mode when navigator.standalone is absent", () => {
    const win = fakeWindow({
      userAgent: IPHONE_SAFARI,
      maxTouchPoints: 5,
      displayMode: "standalone",
    });
    expect(pushSupport(win)).toBe("supported");
  });

  it("needs an install on iPadOS, which reports itself as a Mac", () => {
    const win = fakeWindow({
      userAgent: MAC_SAFARI,
      maxTouchPoints: 5,
      hasPushManager: false,
      hasNotification: false,
    });
    expect(pushSupport(win)).toBe("needs-install");
  });

  it("is unsupported when PushManager is missing off iOS", () => {
    expect(pushSupport(fakeWindow({ userAgent: CHROME, hasPushManager: false }))).toBe(
      "unsupported"
    );
  });

  it("is unsupported when the service worker container is missing", () => {
    expect(pushSupport(fakeWindow({ userAgent: CHROME, hasServiceWorker: false }))).toBe(
      "unsupported"
    );
  });

  it("is unsupported when Notification is missing", () => {
    expect(pushSupport(fakeWindow({ userAgent: CHROME, hasNotification: false }))).toBe(
      "unsupported"
    );
  });

  it("does not need matchMedia to answer", () => {
    const win = fakeWindow({ userAgent: CHROME, hasMatchMedia: false });
    expect(pushSupport(win)).toBe("supported");
  });
});

// A real uncompressed P-256 point: 0x04 then 64 bytes.
function validKeyBytes(): Uint8Array {
  const bytes = new Uint8Array(65);
  bytes[0] = 0x04;
  for (let i = 1; i < 65; i += 1) bytes[i] = (i * 7 + 3) % 256;
  return bytes;
}

function base64url(bytes: Uint8Array, padded = false): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  const encoded = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_");
  return padded ? encoded : encoded.replace(/=+$/, "");
}

describe("applicationServerKey", () => {
  it("decodes an unpadded base64url key to 65 bytes", () => {
    const key = applicationServerKey(base64url(validKeyBytes()));
    expect(key.byteLength).toBe(65);
    expect(new Uint8Array(key)).toEqual(validKeyBytes());
  });

  it("decodes the same key when the padding is present", () => {
    const withPadding = base64url(validKeyBytes(), true);
    expect(withPadding.endsWith("=")).toBe(true);
    expect(new Uint8Array(applicationServerKey(withPadding))).toEqual(validKeyBytes());
  });

  it("rejects a truncated key rather than letting subscribe() fail opaquely", () => {
    const truncated = base64url(validKeyBytes().slice(0, 64));
    expect(() => applicationServerKey(truncated)).toThrow(PushKeyError);
  });

  it("rejects a key that is not an uncompressed point", () => {
    const compressed = validKeyBytes();
    compressed[0] = 0x02;
    expect(() => applicationServerKey(base64url(compressed))).toThrow(PushKeyError);
  });

  it("rejects characters outside the base64url alphabet", () => {
    expect(() => applicationServerKey("not base64!!")).toThrow(PushKeyError);
    expect(() => applicationServerKey("BPk+/abc")).toThrow(PushKeyError);
  });

  it("rejects an empty key", () => {
    expect(() => applicationServerKey("")).toThrow(PushKeyError);
    expect(() => applicationServerKey("   ")).toThrow(PushKeyError);
  });

  it("rejects a length that cannot be base64 at all", () => {
    expect(() => applicationServerKey("BPkA".repeat(21) + "B")).toThrow(PushKeyError);
  });

  it("throws a named error the hook can recognise", () => {
    try {
      applicationServerKey("nope!");
      expect.unreachable("a malformed key must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PushKeyError);
      expect((error as PushKeyError).name).toBe("PushKeyError");
    }
  });
});

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bHqTest-token_value";
const P256DH =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const AUTH = "tBHItJI5svbpez7KI4CCXg";

function subscriptionJson(json: Record<string, unknown>): PushSubscription {
  return { toJSON: () => json } as unknown as PushSubscription;
}

describe("toSubscriptionDto", () => {
  it("maps a real subscription to the body the service accepts", () => {
    const dto = toSubscriptionDto(
      subscriptionJson({
        endpoint: ENDPOINT,
        expirationTime: null,
        keys: { p256dh: P256DH, auth: AUTH },
      })
    );
    expect(dto).toEqual({ endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: AUTH } });
  });

  it("drops expirationTime, which the validator does not read", () => {
    const dto = toSubscriptionDto(
      subscriptionJson({
        endpoint: ENDPOINT,
        expirationTime: 1790000000000,
        keys: { p256dh: P256DH, auth: AUTH },
      })
    );
    expect(Object.keys(dto).sort()).toEqual(["endpoint", "keys"]);
  });

  it("rejects a subscription with no keys, naming the field", () => {
    expect(() => toSubscriptionDto(subscriptionJson({ endpoint: ENDPOINT }))).toThrow(/p256dh/);
  });

  it("rejects an empty p256dh", () => {
    const sub = subscriptionJson({ endpoint: ENDPOINT, keys: { p256dh: "", auth: AUTH } });
    expect(() => toSubscriptionDto(sub)).toThrow(/p256dh/);
  });

  it("rejects an auth secret over 255 characters", () => {
    const sub = subscriptionJson({
      endpoint: ENDPOINT,
      keys: { p256dh: P256DH, auth: "a".repeat(256) },
    });
    expect(() => toSubscriptionDto(sub)).toThrow(/auth/);
  });

  it("rejects an endpoint over 2048 characters", () => {
    const long = `https://fcm.googleapis.com/fcm/send/${"a".repeat(2049)}`;
    const sub = subscriptionJson({
      endpoint: long,
      keys: { p256dh: P256DH, auth: AUTH },
    });
    expect(() => toSubscriptionDto(sub)).toThrow(/endpoint/);
  });

  it("rejects an endpoint that is not https", () => {
    const sub = subscriptionJson({
      endpoint: "http://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: P256DH, auth: AUTH },
    });
    expect(() => toSubscriptionDto(sub)).toThrow(/endpoint/);
  });

  it("rejects a missing endpoint", () => {
    const sub = subscriptionJson({ keys: { p256dh: P256DH, auth: AUTH } });
    expect(() => toSubscriptionDto(sub)).toThrow(/endpoint/);
  });

  it("never puts the endpoint in the error, because it is a capability URL", () => {
    const cases: Array<Record<string, unknown>> = [
      { endpoint: ENDPOINT },
      { endpoint: ENDPOINT, keys: { p256dh: "", auth: AUTH } },
      { endpoint: ENDPOINT, keys: { p256dh: P256DH, auth: "a".repeat(256) } },
      { endpoint: `https://fcm.googleapis.com/fcm/send/${"a".repeat(2049)}`, keys: {} },
    ];
    for (const json of cases) {
      try {
        toSubscriptionDto(subscriptionJson(json));
        expect.unreachable("an invalid subscription must throw");
      } catch (error) {
        expect(error).toBeInstanceOf(PushSubscriptionShapeError);
        const message = (error as Error).message;
        expect(message).not.toContain("fcm.googleapis.com");
        expect(message).not.toContain("dQw4w9WgXcQ");
        expect(message).not.toContain(String(json.endpoint));
      }
    }
  });

  it("carries the offending field on the error", () => {
    try {
      toSubscriptionDto(subscriptionJson({ endpoint: ENDPOINT, keys: { p256dh: P256DH } }));
      expect.unreachable("a missing auth must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PushSubscriptionShapeError);
      expect((error as PushSubscriptionShapeError).field).toBe("keys.auth");
      expect((error as PushSubscriptionShapeError).name).toBe("PushSubscriptionShapeError");
    }
  });
});
