import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const session = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  userId: "did:privy:alice" as string | null,
  evmAddress: null as string | null,
  solanaAddress: null as string | null,
  profile: { name: "u", email: "", avatarSeed: "u" },
  logout: async () => {},
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { usePushSubscription } from "@/hooks/use-push-subscription";

const ALICE = "did:privy:alice";
const SUBSCRIPTIONS = `/api/user-management/users/${encodeURIComponent(ALICE)}/push/subscriptions`;
const VAPID_KEY = `/api/user-management/users/${encodeURIComponent(ALICE)}/push/vapid-public-key`;
const EARN_UNSUBSCRIBE = "/api/earn/notifications/unsubscribe";

// A real uncompressed P-256 point, so applicationServerKey accepts it.
const GOOD_KEY =
  "BAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK-2vcTL0tng5-71AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3vsU";
const SHORT_KEY = "BAAAAAAAAAAAAA";

const ENDPOINT = "https://push.example.com/platform-endpoint";
const LEGACY_ENDPOINT = "https://push.example.com/earn-endpoint";

interface StubSubscription {
  endpoint: string;
  unsubscribe: ReturnType<typeof vi.fn>;
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
}

function subscription(endpoint: string): StubSubscription {
  const stub: StubSubscription = {
    endpoint,
    // The browser drops the subscription it just unsubscribed, so the stub
    // does too. Leaving it in place would let a later getSubscription hand
    // back a dead one.
    unsubscribe: vi.fn(async () => {
      if (current === stub) current = null;
      if (legacy === stub) legacy = null;
      return true;
    }),
    toJSON: () => ({ endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } }),
  };
  return stub;
}

type WorkerListener = (event: MessageEvent) => void;
type PermissionMock = ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>;
type SubscribeMock = ReturnType<
  typeof vi.fn<(options: PushSubscriptionOptionsInit) => Promise<StubSubscription>>
>;

let current: StubSubscription | null;
let legacy: StubSubscription | null;
let legacyRegistrations: Array<Record<string, unknown>>;
let vapidKey: string | null;
let subscribeStatus: number;
let permission: NotificationPermission;
let requestPermission: PermissionMock;
let subscribe: SubscribeMock;
let register: ReturnType<typeof vi.fn>;
let legacyUnregister: ReturnType<typeof vi.fn>;
const workerListeners = new Set<WorkerListener>();

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function refusal(code: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: { code, message: "no" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function route(url: string): Response {
  if (url === VAPID_KEY) return envelope({ publicKey: vapidKey });
  if (url === SUBSCRIPTIONS) {
    if (subscribeStatus !== 200) return refusal("CONFLICT", subscribeStatus);
    return envelope({ subscribed: true });
  }
  if (url === EARN_UNSUBSCRIBE) return envelope({ ok: true });
  throw new Error(`unexpected request: ${url}`);
}

function installBrowserStubs({
  supported = true,
  ios = false,
}: { supported?: boolean; ios?: boolean } = {}) {
  const registration = {
    active: { scriptURL: "http://localhost:3000/push-service-worker.js" },
    pushManager: {
      getSubscription: vi.fn(async () => current),
      subscribe: (options: PushSubscriptionOptionsInit) => subscribe(options),
    },
    unregister: vi.fn(async () => true),
  };
  register = vi.fn(async () => registration);
  subscribe = vi.fn<(options: PushSubscriptionOptionsInit) => Promise<StubSubscription>>(
    async () => {
      const created = subscription(ENDPOINT);
      current = created;
      return created;
    }
  );

  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: ios
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"
      : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
  });

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register,
      ready: Promise.resolve(registration),
      getRegistrations: vi.fn(async () => legacyRegistrations),
      addEventListener: (_type: string, listener: WorkerListener) => workerListeners.add(listener),
      removeEventListener: (_type: string, listener: WorkerListener) =>
        workerListeners.delete(listener),
    },
  });

  if (supported) {
    Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        get permission() {
          return permission;
        },
        requestPermission: () => requestPermission(),
      },
    });
  } else {
    Reflect.deleteProperty(window, "PushManager");
    Reflect.deleteProperty(window, "Notification");
  }
}

function addLegacyRegistration() {
  legacy = subscription(LEGACY_ENDPOINT);
  legacyUnregister = vi.fn(async () => true);
  legacyRegistrations = [
    {
      active: { scriptURL: "http://localhost:3000/sw.js" },
      pushManager: { getSubscription: vi.fn(async () => legacy) },
      unregister: legacyUnregister,
    },
  ];
}

function postFromWorker(data: unknown) {
  for (const listener of [...workerListeners]) listener({ data } as MessageEvent);
}

const requestsTo = (path: string) => apiFetch.mock.calls.filter((call) => String(call[0]) === path);

describe("usePushSubscription", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string) => route(url));
    workerListeners.clear();
    window.localStorage.clear();
    session.ready = true;
    session.authenticated = true;
    session.userId = ALICE;
    current = null;
    legacy = null;
    legacyRegistrations = [];
    vapidKey = GOOD_KEY;
    subscribeStatus = 200;
    permission = "default";
    requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => "granted");
    legacyUnregister = vi.fn(async () => true);
    installBrowserStubs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a browser without push as unsupported and asks for nothing", async () => {
    installBrowserStubs({ supported: false });
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => expect(result.current.state).toBe("unsupported"));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("tells an iOS tab it has to be installed first", async () => {
    installBrowserStubs({ ios: true });
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => expect(result.current.state).toBe("needs-install"));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("renders unavailable when the server has no key", async () => {
    vapidKey = null;
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => expect(result.current.state).toBe("unavailable"));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("offers the prompt without requesting anything when nothing is subscribed", async () => {
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => expect(result.current.state).toBe("prompt"));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(requestsTo(SUBSCRIPTIONS)).toHaveLength(0);
  });

  it("re-posts an existing subscription on load without ever prompting", async () => {
    current = subscription(ENDPOINT);
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => expect(result.current.state).toBe("enabled"));
    const posts = requestsTo(SUBSCRIPTIONS);
    expect(posts).toHaveLength(1);
    expect(posts[0][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(posts[0][1].body))).toEqual({
      endpoint: ENDPOINT,
      keys: { p256dh: "p256dh-value", auth: "auth-value" },
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("subscribes and registers the endpoint when the reader turns it on", async () => {
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("prompt"));

    await act(() => result.current.enable());

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/push-service-worker.js");
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(requestsTo(SUBSCRIPTIONS)).toHaveLength(1);
    expect(result.current.state).toBe("enabled");
    expect(result.current.error).toBeNull();
  });

  it("stays on the prompt when the reader dismisses the browser dialog", async () => {
    requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => "default");
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("prompt"));

    await act(() => result.current.enable());

    expect(result.current.state).toBe("prompt");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("is blocked when permission was refused, and never asks again", async () => {
    permission = "denied";
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("blocked"));

    await act(() => result.current.enable());

    expect(result.current.state).toBe("blocked");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("becomes blocked when the dialog is refused", async () => {
    requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => {
      permission = "denied";
      return "denied";
    });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("prompt"));

    await act(() => result.current.enable());

    expect(result.current.state).toBe("blocked");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("reads a 409 from subscribe as push not being configured", async () => {
    subscribeStatus = 409;
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("prompt"));

    await act(() => result.current.enable());

    expect(result.current.state).toBe("unavailable");
  });

  it("fails loudly on a key the push service would reject", async () => {
    vapidKey = SHORT_KEY;
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("prompt"));

    await act(() => result.current.enable());

    expect(result.current.state).toBe("failed");
    expect(result.current.error).toBe("failed");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("retries the whole check after a failure", async () => {
    vapidKey = SHORT_KEY;
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("prompt"));
    await act(() => result.current.enable());
    expect(result.current.state).toBe("failed");

    vapidKey = GOOD_KEY;
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.state).toBe("prompt"));
    expect(result.current.error).toBeNull();
  });

  it("turns off in the browser and upstream", async () => {
    current = subscription(ENDPOINT);
    const existing = current;
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("enabled"));

    await act(() => result.current.disable());

    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    const deletes = requestsTo(SUBSCRIPTIONS).filter((call) => call[1]?.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(JSON.parse(String(deletes[0][1].body))).toEqual({ endpoint: ENDPOINT });
    expect(result.current.state).toBe("prompt");
  });

  it("reports a failure to turn off rather than pretending it worked", async () => {
    current = subscription(ENDPOINT);
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("enabled"));

    apiFetch.mockImplementationOnce(async () => refusal("UPSTREAM_ERROR", 502));
    await act(() => result.current.disable());

    expect(result.current.state).toBe("failed");
    expect(result.current.error).toBe("failedOff");
  });

  // A reader who sees "we couldn't turn notifications on" can say nothing
  // useful about why, and the hook used to log nothing at all, so neither
  // could anyone helping them. The cause is reported with its code and status
  // and nothing else: the DID rides in these URLs and the endpoint in their
  // bodies, and neither may reach a console.
  // Subscribing makes the browser register with its push service, and an ad
  // blocker or privacy extension commonly blocks that call. The browser
  // reports it as an AbortError with no status, which says nothing to a
  // reader staring at a button that will not work, so it gets its own line.
  it("names the blocker when the browser cannot reach its push service", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    current = null;
    // A DOMException named AbortError already reports code 20, and code is
    // read-only, so this is exactly what the browser throws.
    subscribe.mockRejectedValueOnce(new DOMException("Registration failed", "AbortError"));
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("prompt"));
    await act(() => result.current.enable());

    expect(result.current.state).toBe("failed");
    expect(result.current.error).toBe("failedBlocked");
  });

  it("reports why it failed, without the endpoint, the DID or the URL", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiFetch.mockImplementationOnce(async () => refusal("UPSTREAM_ERROR", 502));
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("failed"));

    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("UPSTREAM_ERROR");
    expect(logged).toContain("502");
    expect(logged).not.toContain(ENDPOINT);
    expect(logged).not.toContain(ALICE);
    expect(logged).not.toContain("/api/user-management");
    warn.mockRestore();
  });

  it("re-registers when the worker says the browser replaced the subscription", async () => {
    current = subscription(ENDPOINT);
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("enabled"));
    expect(requestsTo(SUBSCRIPTIONS)).toHaveLength(1);

    current = subscription("https://push.example.com/replaced-endpoint");
    await act(async () => {
      postFromWorker({ type: "pushsubscriptionchange" });
    });

    await waitFor(() => expect(requestsTo(SUBSCRIPTIONS)).toHaveLength(2));
    expect(JSON.parse(String(requestsTo(SUBSCRIPTIONS)[1][1].body)).endpoint).toBe(
      "https://push.example.com/replaced-endpoint"
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("retires Earn's worker and its row before the platform subscribes", async () => {
    addLegacyRegistration();
    const retired = legacy;
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toBe("prompt"));

    expect(retired?.unsubscribe).toHaveBeenCalledTimes(1);
    expect(legacyUnregister).toHaveBeenCalledTimes(1);
    const reported = requestsTo(EARN_UNSUBSCRIBE);
    expect(reported).toHaveLength(1);
    expect(JSON.parse(String(reported[0][1].body))).toEqual({ endpoint: LEGACY_ENDPOINT });
  });

  it("retires Earn's push only once per browser", async () => {
    addLegacyRegistration();
    const first = renderHook(() => usePushSubscription());
    await waitFor(() => expect(first.result.current.state).toBe("prompt"));
    first.unmount();

    addLegacyRegistration();
    const second = renderHook(() => usePushSubscription());
    await waitFor(() => expect(second.result.current.state).toBe("prompt"));

    expect(legacyUnregister).not.toHaveBeenCalled();
    expect(requestsTo(EARN_UNSUBSCRIBE)).toHaveLength(1);
  });

  it("does nothing at all while signed out", async () => {
    session.userId = null;
    session.authenticated = false;
    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {});
    expect(apiFetch).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(result.current.state).toBe("unsupported");
  });
});
