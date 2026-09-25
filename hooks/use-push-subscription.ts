"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { errorCode, errorStatus, unwrap } from "@/lib/api/envelope";
import { NOTIFICATION_ROUTES } from "@/lib/notifications/routes";
import { applicationServerKey, pushSupport, toSubscriptionDto } from "@/lib/notifications/push";

// The bell mounts in the app shell, so this hook is in the first-load payload
// of every route. A static import of the zod-backed parsers put zod and every
// schema there and CI's budget refused the build
// (hooks/notifications.first-load.test.ts). They are loaded when a response
// comes back instead, never on first paint, the same rule lib/meme/api.ts
// follows.
async function parsers(): Promise<typeof import("@/lib/notifications/schema")> {
  return import("@/lib/notifications/schema");
}

// The one place this app turns browser push on and off.
//
// A browser holds a single push subscription per service worker registration,
// bound to the one VAPID key it was created with, so there can only be one
// owner. That owner is the platform, and Earn's old subscription is retired on
// the first load that finds it (see ADR-2026-09-21 section 1).
//
// Nothing here ever logs an endpoint or a DID. The endpoint is a capability
// URL: anyone holding it can push to that device.

export type PushState =
  | "unsupported"
  | "needs-install"
  | "unavailable"
  | "prompt"
  | "enabling"
  | "enabled"
  | "blocked"
  | "failed";

export interface PushSubscriptionControls {
  state: PushState;
  /** A translated reason, shown next to the toggle. Null when nothing failed. */
  error: string | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
  retry(): void;
}

const WORKER_PATH = "/push-service-worker.js";
const LEGACY_WORKER_PATH = "/sw.js";
const EARN_UNSUBSCRIBE_PATH = "/api/earn/notifications/unsubscribe";
const MIGRATION_KEY = "wsws.push-retired-earn.v1";
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

// The server answers 409 when it holds no VAPID keys, which is a statement
// about the deployment rather than about this request.
const NOT_CONFIGURED_STATUS = 409;

function permissionNow(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}

function readMigrationMarker(): boolean {
  try {
    return window.localStorage.getItem(MIGRATION_KEY) === "done";
  } catch {
    // Storage is refused in some private windows. Without the marker the scan
    // below simply runs again, and it only ever touches a /sw.js registration,
    // so running twice costs two lookups and changes nothing.
    return false;
  }
}

function writeMigrationMarker(): void {
  try {
    window.localStorage.setItem(MIGRATION_KEY, "done");
  } catch {
    // Same as above: a lost marker costs a repeat scan, never a subscription.
  }
}

async function workerRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(WORKER_PATH);
  await navigator.serviceWorker.ready;
  return registration;
}

function scriptOf(registration: ServiceWorkerRegistration): string {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  return worker?.scriptURL ?? "";
}

async function reportEarnUnsubscribe(endpoint: string): Promise<void> {
  try {
    const res = await apiFetch(
      EARN_UNSUBSCRIBE_PATH,
      { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ endpoint }) },
      { requireAuth: true }
    );
    if (!res.ok) console.warn("Earn refused the retired push subscription:", res.status);
  } catch {
    // The browser subscription is already gone, so there is nothing to retry
    // with. Earn's table clears the row itself the next time the push service
    // answers 410 for it. Reported as a warning rather than raised, because
    // the reader is turning the platform's notifications on and this is
    // housekeeping for a feature they just left behind.
    console.warn("Could not tell Earn its push subscription was retired.");
  }
}

// Earn's worker and its subscription, retired once per browser.
//
// Only a /sw.js registration is touched, so this can never take down the
// platform subscription, which lives on its own registration. The order
// matters: the endpoint has to reach Earn before the registration goes, and
// the registration has to go before the platform registers at the same scope,
// or the old subscription would still be hanging off it.
async function retireEarnPush(): Promise<void> {
  if (readMigrationMarker()) return;
  const worker = navigator.serviceWorker;
  if (typeof worker.getRegistrations === "function") {
    for (const registration of await worker.getRegistrations()) {
      if (!scriptOf(registration).endsWith(LEGACY_WORKER_PATH)) continue;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        await reportEarnUnsubscribe(endpoint);
      }
      await registration.unregister();
    }
  }
  writeMigrationMarker();
}

async function readVapidKey(userId: string): Promise<string | null> {
  const res = await apiFetch(NOTIFICATION_ROUTES.vapidKey(userId), {}, { requireAuth: true });
  const body = await unwrap<unknown>(res, "Could not read the notification key");
  return (await parsers()).vapidKeySchema.parse(body).publicKey;
}

async function postSubscription(userId: string, subscription: PushSubscription): Promise<void> {
  const res = await apiFetch(
    NOTIFICATION_ROUTES.subscriptions(userId),
    {
      method: "POST",
      headers: JSON_HEADERS,
      // toSubscriptionDto, not toJSON(): it checks the same limits the
      // service's validator applies, so a bad shape fails here with a field
      // name instead of as an opaque 400.
      body: JSON.stringify(toSubscriptionDto(subscription)),
    },
    { requireAuth: true }
  );
  const body = await unwrap<unknown>(res, "Could not turn notifications on");
  (await parsers()).subscribeResultSchema.parse(body);
}

async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
  const res = await apiFetch(
    NOTIFICATION_ROUTES.subscriptions(userId),
    { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ endpoint }) },
    { requireAuth: true }
  );
  const body = await unwrap<unknown>(res, "Could not turn notifications off");
  (await parsers()).subscribeResultSchema.parse(body);
}

export function usePushSubscription(): PushSubscriptionControls {
  const t = useTranslations("notifications");
  const { userId } = useAuthSession();
  // Starts closed. The server cannot know what this browser supports, and a
  // soft ask that appears and then withdraws itself is worse than one that
  // arrives a frame late.
  const [state, setState] = useState<PushState>("unsupported");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const keyRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  // Held in a ref so the callbacks below do not change identity whenever the
  // translator does. They are what the load effect depends on, and a new
  // identity per render would re-run the whole reconciliation on every render.
  const textRef = useRef(t);

  useEffect(() => {
    textRef.current = t;
  }, [t]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const settle = useCallback((next: PushState, message: string | null = null) => {
    if (!aliveRef.current) return;
    setState(next);
    setError(message);
  }, []);

  // A failure is either the deployment having no keys, which is a state of its
  // own, or something the reader can retry.
  //
  // The reader is told "we couldn't turn notifications on", which is all the
  // screen can usefully say, so the cause is reported to the console instead:
  // without it neither they nor anyone helping them can tell a missing key
  // from a refused request. Only the code, the status and the error's name go
  // out. Never the cause's message, the URL, the DID or the endpoint: the DID
  // rides in these paths and the endpoint in their bodies.
  const fail = useCallback(
    (cause: unknown) => {
      if (errorStatus(cause) === NOT_CONFIGURED_STATUS) {
        settle("unavailable");
        return;
      }
      // Subscribing makes the browser register with its own push service, and
      // an ad blocker or privacy extension commonly blocks that request. The
      // browser reports it as an AbortError carrying no status, which tells
      // the reader nothing, so it gets its own sentence naming the likely
      // cause. Everything else stays the generic failure.
      const blocked = cause instanceof DOMException && cause.name === "AbortError";
      console.warn(
        "Push notifications could not be turned on.",
        `code=${errorCode(cause) ?? "none"}`,
        `status=${errorStatus(cause) ?? "none"}`,
        `error=${cause instanceof Error ? cause.name : typeof cause}`
      );
      settle("failed", textRef.current(blocked ? "failedBlocked" : "failed"));
    },
    [settle]
  );

  const unsupportedState = useCallback((): PushState | null => {
    const support = pushSupport();
    if (support === "supported") return null;
    return support === "needs-install" ? "needs-install" : "unsupported";
  }, []);

  // What runs on every signed-in load.
  //
  // The silent refresh is the important half: an existing subscription is
  // posted again with no permission prompt at all. The route upserts, so this
  // repairs a server row that was lost and moves the endpoint to whoever is
  // signed in now, which is how switching account is handled.
  const reconcile = useCallback(async () => {
    if (!userId) return;
    const blocked = unsupportedState();
    if (blocked) {
      settle(blocked);
      return;
    }
    try {
      await retireEarnPush();
      const registration = await workerRegistration();
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await postSubscription(userId, existing);
        settle("enabled");
        return;
      }
      // Checked before the key is read, so a browser that has refused costs
      // no request at all.
      if (permissionNow() === "denied") {
        settle("blocked");
        return;
      }
      const key = await readVapidKey(userId);
      keyRef.current = key;
      settle(key === null ? "unavailable" : "prompt");
    } catch (cause) {
      fail(cause);
    }
  }, [fail, settle, unsupportedState, userId]);

  useEffect(() => {
    void reconcile();
  }, [reconcile, attempt]);

  const enable = useCallback(async () => {
    if (!userId) return;
    const blocked = unsupportedState();
    if (blocked) {
      settle(blocked);
      return;
    }
    // Terminal. Re-prompting a browser that has refused shows nothing and
    // resolves "denied" straight away, so the only honest answer is the
    // instructions for undoing it.
    if (permissionNow() === "denied") {
      settle("blocked");
      return;
    }

    settle("enabling");
    try {
      if (permissionNow() === "default") {
        // This is why enable() may only be called from a click: iOS drops a
        // permission request that is not inside a user gesture.
        const answer = await Notification.requestPermission();
        if (answer === "denied") {
          settle("blocked");
          return;
        }
        if (answer !== "granted") {
          settle("prompt");
          return;
        }
      }

      const key = keyRef.current ?? (await readVapidKey(userId));
      keyRef.current = key;
      if (key === null) {
        settle("unavailable");
        return;
      }

      await retireEarnPush();
      const registration = await workerRegistration();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          // Required by every browser that implements push: a subscription
          // that cannot show a notification is not allowed.
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(key),
        }));
      await postSubscription(userId, subscription);
      settle("enabled");
    } catch (cause) {
      fail(cause);
    }
  }, [fail, settle, unsupportedState, userId]);

  const disable = useCallback(async () => {
    if (!userId) return;
    try {
      const registration = await workerRegistration();
      const existing = await registration.pushManager.getSubscription();
      if (!existing) {
        settle("prompt");
        return;
      }
      // Read before unsubscribing: the object keeps the string, but taking it
      // first makes the order obvious. It is never logged.
      const endpoint = existing.endpoint;
      await existing.unsubscribe();
      await deleteSubscription(userId, endpoint);
      settle("prompt");
    } catch {
      // Both sides have to agree. Saying "off" while the server still holds
      // the row would keep the device receiving pushes it cannot explain.
      settle("failed", textRef.current("failedOff"));
    }
  }, [settle, userId]);

  // The worker cannot re-register a replaced subscription itself: it holds no
  // session and does not know the DID. It tells the page instead, and the page
  // registers again with the id it already has.
  const reRegister = useCallback(async () => {
    if (!userId || unsupportedState()) return;
    try {
      const registration = await workerRegistration();
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await postSubscription(userId, existing);
        settle("enabled");
        return;
      }
      // The browser dropped the subscription without replacing it. Permission
      // is still granted, so this re-subscribes without a prompt.
      if (permissionNow() !== "granted") return;
      const key = keyRef.current ?? (await readVapidKey(userId));
      keyRef.current = key;
      if (key === null) {
        settle("unavailable");
        return;
      }
      const created = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(key),
      });
      await postSubscription(userId, created);
      settle("enabled");
    } catch (cause) {
      fail(cause);
    }
  }, [fail, settle, unsupportedState, userId]);

  useEffect(() => {
    if (!userId) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const worker = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null;
      if (!data || data.type !== "pushsubscriptionchange") return;
      void reRegister();
    };
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, [reRegister, userId]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  return { state, error, enable, disable, retry };
}
