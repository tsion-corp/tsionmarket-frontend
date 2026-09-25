// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator, type Messages } from "next-intl";
import en from "@/messages/en.json";
import { apiError } from "@/lib/api/envelope";
import { entryPriceFromUsdString } from "@/lib/shine/money";
import { SHINE_POSTED_KEY } from "@/lib/shine/posted-store";
import {
  configureShine,
  reportShine,
  shineFailures,
  whenShineIdle,
  type ShineRuntime,
  type ShineTranslate,
} from "@/lib/shine";
import type { EntryPrice } from "@/lib/shine/money";

const ALICE = "did:privy:alice";
const BOB = "did:privy:bob";

const PRICE = entryPriceFromUsdString("0.0000042") as EntryPrice;

function buy(id: string) {
  return { service: "memecoin", id, kind: "buy", symbol: "PEPE", price: PRICE } as const;
}

// The English catalogue through next-intl, the same path the provider hands
// the runtime. A post is composed from `shine.post`, so a report test that
// stubbed the copy would stop proving that the wiring reaches it.
const messages: Messages = en;
const translator = createTranslator({ locale: "en", messages, namespace: "shine.post" });
const translate: ShineTranslate = (key, values) => translator(key, values);

function install(overrides: Partial<ShineRuntime> = {}) {
  const post = vi.fn(async () => ({ id: "post-1" }));
  configureShine({
    accountDid: ALICE,
    isEnabled: () => true,
    translate,
    post,
    ...overrides,
  });
  return post;
}

beforeEach(() => {
  window.localStorage.clear();
  configureShine(null);
});

afterEach(() => {
  configureShine(null);
  vi.restoreAllMocks();
});

describe("reporting an event", () => {
  it("posts the composed text once", async () => {
    const post = install();
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(post).toHaveBeenCalledWith("Aped into $PEPE at $0.0000042.");
  });

  it("posts once when the same confirmation is reported twice", async () => {
    const post = install();
    reportShine(buy("swap-1"));
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("still posts once when a poller re-serves the row after a reload", async () => {
    const post = install();
    reportShine(buy("swap-1"));
    await whenShineIdle();

    // A reload keeps localStorage and loses everything else, including the
    // configured runtime and the queue.
    const raw = window.localStorage.getItem(SHINE_POSTED_KEY);
    configureShine(null);
    window.localStorage.clear();
    window.localStorage.setItem(SHINE_POSTED_KEY, raw ?? "");
    const postAfterReload = install();

    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(postAfterReload).not.toHaveBeenCalled();
  });

  it("does not let one account inherit another's already-posted set", async () => {
    const alicePost = install();
    reportShine(buy("swap-1"));
    await whenShineIdle();

    const bobPost = vi.fn(async () => ({ id: "post-2" }));
    install({ accountDid: BOB, post: bobPost });
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(alicePost).toHaveBeenCalledTimes(1);
    expect(bobPost).toHaveBeenCalledTimes(1);
  });
});

describe("the gate", () => {
  it("posts nothing when Shine is off for that service", async () => {
    const post = install({ isEnabled: (service) => service !== "memecoin" });
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
  });

  it("treats an unresolved preference as off, never as on", async () => {
    const post = install({ isEnabled: () => null });
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
  });

  it("leaves the event unclaimed when the gate says no, so a later toggle still works", async () => {
    const off = install({ isEnabled: () => null });
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(off).not.toHaveBeenCalled();

    const on = install();
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(on).toHaveBeenCalledTimes(1);
  });

  it("posts nothing when there is no account to key the record by", async () => {
    const post = install({ accountDid: null });
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
  });

  it("leaves a trace when nothing installed the runtime", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    reportShine(buy("swap-1"));
    await whenShineIdle();
    expect(shineFailures().at(-1)?.code).toBe("SHINE_NOT_CONFIGURED");
  });
});

describe("fire and forget", () => {
  it("returns nothing and never throws, whatever the caller hands it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    install({
      isEnabled: () => {
        throw new Error("the preference query exploded");
      },
    });
    expect(() => reportShine(buy("swap-1"))).not.toThrow();
    expect(reportShine(buy("swap-2"))).toBeUndefined();
  });

  it("does not surface a failed post to the caller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A refusal the square will keep making, so the queue does not sit in a
    // backoff while the test waits.
    const post = vi.fn(async () => {
      throw apiError("VALIDATION_ERROR", "text is required", 422);
    });
    install({ post });
    expect(() => reportShine(buy("swap-1"))).not.toThrow();
    await whenShineIdle();
    expect(shineFailures().at(-1)?.id).toBe("swap-1");
  });

  it("posts nothing and records why when the event cannot be composed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const post = install();
    reportShine({ service: "memecoin", id: "swap-1", kind: "buy", symbol: "$500", price: PRICE });
    await whenShineIdle();
    expect(post).not.toHaveBeenCalled();
    expect(shineFailures().at(-1)?.code).toBe("SHINE_UNCOMPOSABLE");
  });
});
