import { describe, expect, it, vi } from "vitest";
import { apiError } from "@/lib/api/envelope";
import { ShinePostQueue, isRetryableShineFailure, type ShineDedupStore } from "@/lib/shine/queue";

const DID = "did:privy:alice";

/** A dedup store with no storage behind it, so the queue can be tested in node. */
function memoryStore(overrides: Partial<ShineDedupStore> = {}): ShineDedupStore {
  const claimed = new Set<string>();
  const key = (did: string, service: string, id: string) => `${did}|${service}|${id}`;
  return {
    has: (did, service, id) => claimed.has(key(did, service, id)),
    claim: (did, service, id) => {
      const k = key(did, service, id);
      if (claimed.has(k)) return "already-posted";
      claimed.add(k);
      return "claimed";
    },
    ...overrides,
  };
}

function job(id: string, text = `post ${id}`) {
  return { did: DID, service: "memecoin" as const, id, text };
}

describe("one post in flight at a time", () => {
  it("serialises a burst instead of firing it at the gateway at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const order: string[] = [];
    const queue = new ShinePostQueue({
      store: memoryStore(),
      delay: async () => {},
      post: async (text) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        order.push(text);
        inFlight -= 1;
      },
    });

    for (const id of ["1", "2", "3", "4", "5"]) queue.enqueue(job(id));
    await queue.whenIdle();

    expect(peak).toBe(1);
    expect(order).toEqual(["post 1", "post 2", "post 3", "post 4", "post 5"]);
  });

  it("spaces posts apart so a burst does not earn its own 429", async () => {
    const waits: number[] = [];
    let clock = 0;
    const queue = new ShinePostQueue({
      store: memoryStore(),
      now: () => clock,
      delay: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      post: async () => {},
      minGapMs: 1200,
    });
    queue.enqueue(job("1"));
    queue.enqueue(job("2"));
    await queue.whenIdle();
    expect(waits).toEqual([1200]);
  });

  it("picks up work enqueued while a post is in flight", async () => {
    const sent: string[] = [];
    const queue = new ShinePostQueue({
      store: memoryStore(),
      delay: async () => {},
      post: async (text) => {
        sent.push(text);
        if (sent.length === 1) queue.enqueue(job("late"));
      },
    });
    queue.enqueue(job("first"));
    await queue.whenIdle();
    expect(sent).toEqual(["post first", "post late"]);
  });
});

describe("dedup", () => {
  it("posts a repeated event once", async () => {
    const post = vi.fn(async () => {});
    const queue = new ShinePostQueue({ store: memoryStore(), delay: async () => {}, post });
    queue.enqueue(job("swap-1"));
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("claims before sending, so a crash mid-post cannot duplicate", async () => {
    const seen: string[] = [];
    const store = memoryStore();
    const queue = new ShinePostQueue({
      store,
      delay: async () => {},
      post: async () => {
        seen.push(store.has(DID, "memecoin", "swap-1") ? "claimed" : "unclaimed");
      },
    });
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    expect(seen).toEqual(["claimed"]);
  });

  it("sends nothing when the claim cannot be stored", async () => {
    const post = vi.fn(async () => {});
    const queue = new ShinePostQueue({
      store: memoryStore({ has: () => false, claim: () => "storage-unavailable" }),
      delay: async () => {},
      post,
    });
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    expect(post).not.toHaveBeenCalled();
    expect(queue.failures()).toHaveLength(1);
    expect(queue.failures()[0].code).toBe("SHINE_STORAGE_UNAVAILABLE");
  });
});

describe("retrying", () => {
  it("retries a transient failure with a growing backoff", async () => {
    const waits: number[] = [];
    let attempts = 0;
    const queue = new ShinePostQueue({
      store: memoryStore(),
      random: () => 1,
      delay: async (ms) => {
        waits.push(ms);
      },
      post: async () => {
        attempts += 1;
        if (attempts < 3) throw apiError("SERVICE_UNAVAILABLE", "upstream down", 503);
      },
    });
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    expect(attempts).toBe(3);
    expect(waits).toEqual([1000, 2000]);
    expect(queue.failures()).toHaveLength(0);
  });

  it("waits longer when the square says it is being posted to too quickly", async () => {
    const waits: number[] = [];
    let attempts = 0;
    const queue = new ShinePostQueue({
      store: memoryStore(),
      random: () => 1,
      delay: async (ms) => {
        waits.push(ms);
      },
      post: async () => {
        attempts += 1;
        if (attempts < 2) throw apiError("RATE_LIMITED", "too fast", 429);
      },
    });
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    expect(waits[0]).toBeGreaterThanOrEqual(5000);
  });

  it("does not retry a refusal that will never succeed", async () => {
    const post = vi.fn(async () => {
      throw apiError("VALIDATION_ERROR", "text is required", 422);
    });
    const queue = new ShinePostQueue({ store: memoryStore(), delay: async () => {}, post });
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    expect(post).toHaveBeenCalledTimes(1);
    expect(queue.failures()).toHaveLength(1);
  });

  it("gives up after the attempt budget and leaves a trace", async () => {
    const onFailure = vi.fn();
    const post = vi.fn(async () => {
      throw apiError("SERVICE_UNAVAILABLE", "upstream down", 503);
    });
    const queue = new ShinePostQueue({
      store: memoryStore(),
      delay: async () => {},
      post,
      onFailure,
      maxAttempts: 4,
    });
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    expect(post).toHaveBeenCalledTimes(4);
    const failures = queue.failures();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ service: "memecoin", id: "swap-1", attempts: 4 });
    expect(failures[0].message).toContain("Market Square is unreachable");
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("keeps the claim after a permanent failure, so a re-fire cannot duplicate", async () => {
    const post = vi.fn(async () => {
      throw apiError("VALIDATION_ERROR", "nope", 422);
    });
    const queue = new ShinePostQueue({ store: memoryStore(), delay: async () => {}, post });
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    queue.enqueue(job("swap-1"));
    await queue.whenIdle();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("carries on with the next post after one fails", async () => {
    const sent: string[] = [];
    const queue = new ShinePostQueue({
      store: memoryStore(),
      delay: async () => {},
      post: async (text) => {
        if (text === "post bad") throw apiError("VALIDATION_ERROR", "nope", 422);
        sent.push(text);
      },
    });
    queue.enqueue(job("bad"));
    queue.enqueue(job("good"));
    await queue.whenIdle();
    expect(sent).toEqual(["post good"]);
  });

  it("bounds the failure trace so a broken session cannot grow without limit", async () => {
    const queue = new ShinePostQueue({
      store: memoryStore(),
      delay: async () => {},
      post: async () => {
        throw apiError("VALIDATION_ERROR", "nope", 422);
      },
      maxFailures: 3,
    });
    for (let i = 0; i < 10; i += 1) queue.enqueue(job(`swap-${i}`));
    await queue.whenIdle();
    expect(queue.failures()).toHaveLength(3);
    expect(queue.failures()[2].id).toBe("swap-9");
  });
});

describe("classifying a gateway failure", () => {
  it("retries what may succeed later", () => {
    expect(isRetryableShineFailure(apiError("SERVICE_UNAVAILABLE", "", 503))).toBe(true);
    expect(isRetryableShineFailure(apiError("UPSTREAM_ERROR", "", 502))).toBe(true);
    expect(isRetryableShineFailure(apiError("RATE_LIMITED", "", 429))).toBe(true);
    expect(isRetryableShineFailure(apiError("TIMEOUT", "", 408))).toBe(true);
    // A network drop carries no status at all.
    expect(isRetryableShineFailure(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not retry what the square has already decided", () => {
    expect(isRetryableShineFailure(apiError("VALIDATION_ERROR", "", 422))).toBe(false);
    expect(isRetryableShineFailure(apiError("BAD_REQUEST", "", 400))).toBe(false);
    expect(isRetryableShineFailure(apiError("UNAUTHORIZED", "", 401))).toBe(false);
    expect(isRetryableShineFailure(apiError("FORBIDDEN", "", 403))).toBe(false);
    expect(isRetryableShineFailure(apiError("NOT_FOUND", "", 404))).toBe(false);
    expect(isRetryableShineFailure(apiError("NOT_CONFIGURED", "", 404))).toBe(false);
  });
});
