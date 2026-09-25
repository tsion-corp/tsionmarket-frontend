import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { notificationDestination } from "@/lib/notifications/destination";
import { readPushPayload } from "@/lib/notifications/payload";

// The worker is served straight from public/ and is never bundled, so there is
// nothing to import here. The file is read as text and evaluated in a vm
// context whose only global is a stub `self`, which is the closest thing to a
// ServiceWorkerGlobalScope we can build in Node.
const WORKER_SOURCE = readFileSync("public/push-service-worker.js", "utf8");
const ORIGIN = "https://app.ark.test";

interface ShownOptions {
  body?: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  renotify?: boolean;
  data?: { url?: unknown; campaignId?: unknown };
}

interface StubClient {
  url: string;
  focus: Mock;
  navigate: Mock;
  postMessage: Mock;
}

interface WorkerEvent {
  waitUntil: (work: Promise<unknown>) => void;
  data?: { json: () => unknown };
  notification?: { close: Mock; data?: { url?: unknown; campaignId?: unknown } };
}

interface Dispatched {
  waitUntilCalls: number;
}

interface Harness {
  dispatch: (type: string, event: Omit<WorkerEvent, "waitUntil">) => Promise<Dispatched>;
  evaluate: (expression: string) => unknown;
  shown: Array<{ title: string; options: ShownOptions }>;
  openWindow: Mock;
  clients: StubClient[];
}

function makeClient(url: string): StubClient {
  return {
    url,
    focus: vi.fn(() => Promise.resolve()),
    navigate: vi.fn(() => Promise.resolve()),
    postMessage: vi.fn(),
  };
}

function loadWorker(clients: StubClient[] = []): Harness {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const shown: Array<{ title: string; options: ShownOptions }> = [];
  const openWindow: Mock = vi.fn(() => Promise.resolve(null));

  const self = {
    addEventListener(type: string, handler: (event: WorkerEvent) => void): void {
      handlers.set(type, handler);
    },
    location: { origin: ORIGIN, href: `${ORIGIN}/` },
    skipWaiting: vi.fn(() => Promise.resolve()),
    registration: {
      showNotification: vi.fn((title: string, options: ShownOptions) => {
        shown.push({ title, options });
        return Promise.resolve();
      }),
    },
    clients: {
      claim: vi.fn(() => Promise.resolve()),
      matchAll: vi.fn(() => Promise.resolve(clients)),
      openWindow,
    },
  };

  const context = vm.createContext({ self, URL, console });
  vm.runInContext(WORKER_SOURCE, context, { filename: "push-service-worker.js" });

  return {
    shown,
    openWindow,
    clients,
    evaluate: (expression) => vm.runInContext(expression, context),
    dispatch: async (type, event) => {
      const handler = handlers.get(type);
      if (!handler) throw new Error(`the worker registered no ${type} handler`);
      const pending: Array<Promise<unknown>> = [];
      handler({ ...event, waitUntil: (work) => void pending.push(work) });
      await Promise.all(pending);
      return { waitUntilCalls: pending.length };
    },
  };
}

function pushEvent(payload: unknown): Omit<WorkerEvent, "waitUntil"> {
  return { data: { json: () => payload } };
}

const VALID_PAYLOAD = {
  campaignId: "c-1",
  title: "Markets are open",
  body: "Gold is live for the session.",
  url: "/markets/gold",
  imageUrl: "https://cdn.ark.test/banner.png",
  tag: "admin:c-1",
};

function clickEvent(url: unknown, campaignId = "c-1"): Omit<WorkerEvent, "waitUntil"> {
  return { notification: { close: vi.fn(), data: { url, campaignId } } };
}

describe("push-service-worker", () => {
  it("declares a SW_VERSION so a deployed worker can be identified", () => {
    const worker = loadWorker();
    expect(worker.evaluate("SW_VERSION")).toMatch(/^\d{4}-\d{2}-\d{2}/u);
  });

  it("caches nothing and intercepts no fetch", () => {
    expect(WORKER_SOURCE).not.toMatch(/addEventListener\(\s*"fetch"/u);
    expect(WORKER_SOURCE).not.toMatch(/caches\./u);
  });

  describe("push", () => {
    it("shows one notification with the payload's tag, data and image", async () => {
      const worker = loadWorker();
      const dispatched = await worker.dispatch("push", pushEvent(VALID_PAYLOAD));

      expect(dispatched.waitUntilCalls).toBe(1);
      expect(worker.shown).toHaveLength(1);
      const [{ title, options }] = worker.shown;
      expect(title).toBe("Markets are open");
      expect(options.body).toBe("Gold is live for the session.");
      expect(options.tag).toBe("admin:c-1");
      expect(options.renotify).toBe(true);
      expect(options.image).toBe("https://cdn.ark.test/banner.png");
      expect(options.icon).toMatch(/^\/icons\//u);
      expect(options.badge).toMatch(/^\/icons\//u);
      expect(options.data).toEqual({ url: "/markets/gold", campaignId: "c-1" });
    });

    it("omits image when imageUrl is null", async () => {
      const worker = loadWorker();
      await worker.dispatch("push", pushEvent({ ...VALID_PAYLOAD, imageUrl: null }));

      expect(worker.shown).toHaveLength(1);
      expect(worker.shown[0].options.image).toBeUndefined();
    });

    it("shows nothing when the payload has no title", async () => {
      const worker = loadWorker();
      await worker.dispatch("push", pushEvent({ ...VALID_PAYLOAD, title: "" }));
      await worker.dispatch("push", pushEvent({ ...VALID_PAYLOAD, title: "   " }));
      await worker.dispatch("push", pushEvent({ ...VALID_PAYLOAD, title: 42 }));

      expect(worker.shown).toHaveLength(0);
    });

    it("rebuilds the tag from the campaign when the sender omitted it", async () => {
      const worker = loadWorker();
      const withoutTag: Record<string, unknown> = { ...VALID_PAYLOAD };
      delete withoutTag.tag;
      await worker.dispatch("push", pushEvent(withoutTag));

      expect(worker.shown[0].options.tag).toBe("admin:c-1");
      expect(worker.shown[0].options.renotify).toBe(true);
    });

    it("omits renotify when there is no tag, because Chrome throws on that pair", async () => {
      const worker = loadWorker();
      await worker.dispatch("push", pushEvent({ title: "Only a title" }));

      expect(worker.shown).toHaveLength(1);
      expect(worker.shown[0].options.tag).toBe("");
      expect(worker.shown[0].options.renotify).toBeUndefined();
      expect(worker.shown[0].options.data).toEqual({ url: "", campaignId: "" });
    });

    it("shows nothing for a foreign payload", async () => {
      const worker = loadWorker();
      await worker.dispatch("push", pushEvent({ hello: "from somewhere else" }));
      await worker.dispatch("push", pushEvent("a bare string"));
      await worker.dispatch("push", pushEvent(null));

      expect(worker.shown).toHaveLength(0);
    });

    it("shows nothing when the push body is not JSON", async () => {
      const worker = loadWorker();
      await worker.dispatch("push", {
        data: {
          json: () => {
            throw new SyntaxError("Unexpected token");
          },
        },
      });

      expect(worker.shown).toHaveLength(0);
    });

    it("messages every open client so the bell refreshes at once", async () => {
      const tab = makeClient(`${ORIGIN}/portfolio`);
      const other = makeClient(`${ORIGIN}/markets`);
      const worker = loadWorker([tab, other]);

      await worker.dispatch("push", pushEvent(VALID_PAYLOAD));

      expect(tab.postMessage).toHaveBeenCalledWith({ type: "notification", campaignId: "c-1" });
      expect(other.postMessage).toHaveBeenCalledWith({ type: "notification", campaignId: "c-1" });
    });

    it("messages no client when the payload is not ours", async () => {
      const tab = makeClient(`${ORIGIN}/portfolio`);
      const worker = loadWorker([tab]);

      await worker.dispatch("push", pushEvent({ hello: "elsewhere" }));

      expect(tab.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("notificationclick", () => {
    it("closes the notification and focuses a client already on that path", async () => {
      const match = makeClient(`${ORIGIN}/markets/gold?tab=chart`);
      const other = makeClient(`${ORIGIN}/portfolio`);
      const worker = loadWorker([other, match]);
      const event = clickEvent("/markets/gold");

      const dispatched = await worker.dispatch("notificationclick", event);

      expect(event.notification?.close).toHaveBeenCalledTimes(1);
      expect(dispatched.waitUntilCalls).toBe(1);
      expect(match.focus).toHaveBeenCalledTimes(1);
      expect(worker.openWindow).not.toHaveBeenCalled();
    });

    it("opens a window when no client is on that path", async () => {
      const other = makeClient(`${ORIGIN}/portfolio`);
      const worker = loadWorker([other]);

      await worker.dispatch("notificationclick", clickEvent("/markets/gold"));

      expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/markets/gold`);
    });

    it("never navigates a client that is on another path", async () => {
      const other = makeClient(`${ORIGIN}/portfolio`);
      const worker = loadWorker([other]);

      await worker.dispatch("notificationclick", clickEvent("/markets/gold"));

      expect(other.navigate).not.toHaveBeenCalled();
      expect(other.focus).not.toHaveBeenCalled();
    });

    it("opens an absolute https destination in a new window and touches no client", async () => {
      const other = makeClient(`${ORIGIN}/portfolio`);
      const worker = loadWorker([other]);

      await worker.dispatch("notificationclick", clickEvent("https://blog.ark.test/post"));

      expect(worker.openWindow).toHaveBeenCalledWith("https://blog.ark.test/post");
      expect(other.navigate).not.toHaveBeenCalled();
      expect(other.focus).not.toHaveBeenCalled();
    });

    it("opens nothing for a javascript: destination", async () => {
      const other = makeClient(`${ORIGIN}/portfolio`);
      const worker = loadWorker([other]);

      await worker.dispatch("notificationclick", clickEvent("javascript:alert(1)"));

      expect(worker.openWindow).not.toHaveBeenCalled();
      expect(other.navigate).not.toHaveBeenCalled();
      expect(other.focus).not.toHaveBeenCalled();
    });

    it("keeps the query and hash of an internal destination", async () => {
      const worker = loadWorker([]);

      await worker.dispatch("notificationclick", clickEvent("/markets/gold?tab=chart#depth"));

      expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/markets/gold?tab=chart#depth`);
    });

    it("opens nothing for a protocol-relative destination, slash or backslash", async () => {
      const worker = loadWorker([makeClient(`${ORIGIN}/portfolio`)]);

      await worker.dispatch("notificationclick", clickEvent("//evil.com"));
      await worker.dispatch("notificationclick", clickEvent("/\\evil.com"));
      await worker.dispatch("notificationclick", clickEvent("  //evil.com  "));

      expect(worker.openWindow).not.toHaveBeenCalled();
    });

    it("opens nothing for an https url carrying credentials", async () => {
      const worker = loadWorker([makeClient(`${ORIGIN}/portfolio`)]);

      // Reads as docs.ark.test to a human and navigates to evil.com.
      await worker.dispatch("notificationclick", clickEvent("https://docs.ark.test@evil.com/a"));
      await worker.dispatch("notificationclick", clickEvent("https://user:pw@evil.com/a"));

      expect(worker.openWindow).not.toHaveBeenCalled();
    });

    it("opens nothing for http:, a bare word, an empty url, or a missing url", async () => {
      const worker = loadWorker([makeClient(`${ORIGIN}/portfolio`)]);

      await worker.dispatch("notificationclick", clickEvent("http://evil.com"));
      await worker.dispatch("notificationclick", clickEvent("JavaScript:alert(1)"));
      await worker.dispatch("notificationclick", clickEvent("data:text/html,<b>hi</b>"));
      await worker.dispatch("notificationclick", clickEvent("perps"));
      await worker.dispatch("notificationclick", clickEvent("   "));
      await worker.dispatch("notificationclick", clickEvent(undefined));

      expect(worker.openWindow).not.toHaveBeenCalled();
    });
  });

  // The worker cannot import from the bundle, so its readPushPayload and
  // notificationDestination are hand copies of lib/notifications/*. These two
  // run the same inputs through both copies. If one side is edited without the
  // other, this is what fails.
  describe("mirrors lib/notifications", () => {
    function throughWorker(fn: string, input: unknown): unknown {
      const worker = loadWorker();
      const encoded = JSON.stringify(input) ?? "undefined";
      return JSON.parse(
        String(worker.evaluate(`JSON.stringify(${fn}(${encoded})) ?? "null"`))
      ) as unknown;
    }

    const PAYLOADS: unknown[] = [
      VALID_PAYLOAD,
      { ...VALID_PAYLOAD, imageUrl: null },
      { ...VALID_PAYLOAD, imageUrl: "" },
      { ...VALID_PAYLOAD, tag: "" },
      { ...VALID_PAYLOAD, campaignId: "", tag: "" },
      { ...VALID_PAYLOAD, title: "  " },
      { ...VALID_PAYLOAD, body: 7, url: null },
      { title: "Only a title" },
      { hello: "from somewhere else" },
      [VALID_PAYLOAD],
      null,
      "a bare string",
      42,
    ];

    it.each(PAYLOADS.map((input, i) => [i, input] as const))(
      "reads payload %i the same way as payload.ts",
      (_index, input) => {
        expect(throughWorker("readPushPayload", input)).toEqual(
          JSON.parse(JSON.stringify(readPushPayload(input)) ?? "null") as unknown
        );
      }
    );

    const URLS = [
      "/markets/gold",
      "/markets/gold?tab=chart#depth",
      "  /perps  ",
      "/",
      "//evil.com",
      "/\\evil.com",
      "https://blog.ark.test/post",
      "https://docs.ark.test@evil.com/a",
      "https://user:pw@evil.com/a",
      "http://evil.com",
      "JavaScript:alert(1)",
      "data:text/html,<b>hi</b>",
      "perps",
      "",
      "   ",
    ];

    it.each(URLS)("resolves %j the same way as destination.ts", (url) => {
      expect(throughWorker("notificationDestination", url)).toEqual(
        JSON.parse(JSON.stringify(notificationDestination(url)) ?? "null") as unknown
      );
    });
  });

  describe("pushsubscriptionchange", () => {
    it("tells open clients to re-register rather than guessing a subscribe url", async () => {
      const tab = makeClient(`${ORIGIN}/portfolio`);
      const worker = loadWorker([tab]);

      const dispatched = await worker.dispatch("pushsubscriptionchange", {});

      expect(dispatched.waitUntilCalls).toBe(1);
      expect(tab.postMessage).toHaveBeenCalledWith({ type: "pushsubscriptionchange" });
      // The re-subscribe route is keyed by the Privy DID, which the worker
      // cannot know, so it must not call the network at all from here.
      expect(WORKER_SOURCE).not.toMatch(/\bfetch\s*\(/u);
      expect(WORKER_SOURCE).not.toMatch(/pushManager/u);
    });
  });
});
