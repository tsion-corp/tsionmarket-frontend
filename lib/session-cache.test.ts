import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionCache } from "@/lib/session-cache";

// A small cache over sessionStorage: namespaced, versioned, bounded, and loud
// when a write fails. Tests run against an in-memory Storage so quota and
// sandbox failures can be produced on demand.

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  // Set to make the next setItem calls throw, one error per call.
  failures: unknown[] = [];

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    const failure = this.failures.shift();
    if (failure !== undefined) throw failure;
    this.store.set(key, value);
  }
  keys(): string[] {
    return [...this.store.keys()];
  }
}

function quotaError(): DOMException {
  return new DOMException("The quota has been exceeded.", "QuotaExceededError");
}

function setup(overrides: { maxEntries?: number; version?: number } = {}) {
  const storage = new MemoryStorage();
  let clock = 1_000;
  const warn = vi.fn();
  const cache = createSessionCache({
    namespace: "wsws.test",
    version: overrides.version ?? 1,
    maxEntries: overrides.maxEntries ?? 3,
    storage,
    now: () => clock,
    warn,
  });
  return {
    storage,
    warn,
    cache,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createSessionCache", () => {
  it("round-trips data with the time it was saved", () => {
    const { cache, storage } = setup();
    cache.write("list:a", { items: [1, 2] });
    expect(cache.read<{ items: number[] }>("list:a", 60_000)).toEqual({
      data: { items: [1, 2] },
      savedAt: 1_000,
    });
    expect(storage.keys()).toEqual(["wsws.test.list:a"]);
  });

  it("returns null for a key never written", () => {
    const { cache } = setup();
    expect(cache.read("missing", 60_000)).toBeNull();
  });

  it("keeps an entry up to its maximum age and removes it after", () => {
    const { cache, storage, tick } = setup();
    cache.write("k", "v");
    tick(60_000);
    expect(cache.read("k", 60_000)?.data).toBe("v");
    tick(1);
    expect(cache.read("k", 60_000)).toBeNull();
    expect(storage.getItem("wsws.test.k")).toBeNull();
  });

  it("never expires an entry read with an infinite age", () => {
    const { cache, tick } = setup();
    cache.write("ui", { timeframe: "1h" });
    tick(365 * 24 * 60 * 60_000);
    expect(cache.read("ui", Infinity)?.data).toEqual({ timeframe: "1h" });
  });

  it("removes an entry written by another version", () => {
    const storage = new MemoryStorage();
    const warn = vi.fn();
    const older = createSessionCache({
      namespace: "wsws.test",
      version: 1,
      maxEntries: 3,
      storage,
    });
    older.write("k", "old");
    const newer = createSessionCache({
      namespace: "wsws.test",
      version: 2,
      maxEntries: 3,
      storage,
      warn,
    });
    expect(newer.read("k", Infinity)).toBeNull();
    expect(storage.getItem("wsws.test.k")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("removes a corrupt or foreign entry", () => {
    const { cache, storage, warn } = setup();
    for (const raw of [
      "{not json",
      "null",
      "42",
      JSON.stringify({ v: 1, data: "no time" }),
      JSON.stringify({ v: 1, savedAt: "yesterday", data: 1 }),
      JSON.stringify({ v: 1, savedAt: 5 }),
      JSON.stringify({ v: "1", savedAt: 5, data: 1 }),
    ]) {
      storage.setItem("wsws.test.k", raw);
      expect(cache.read("k", Infinity), raw).toBeNull();
      expect(storage.getItem("wsws.test.k"), raw).toBeNull();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("removes one key", () => {
    const { cache, storage } = setup();
    cache.write("a", 1);
    cache.write("b", 2);
    cache.remove("a");
    expect(storage.keys()).toEqual(["wsws.test.b"]);
  });

  it("evicts the oldest entries beyond maxEntries, counting only its namespace", () => {
    const { cache, storage, tick } = setup({ maxEntries: 3 });
    storage.setItem("wsws.other.x", "keep");
    storage.setItem("unrelated", "keep");
    for (const key of ["a", "b", "c", "d", "e"]) {
      cache.write(key, key);
      tick(10);
    }
    expect(storage.keys().sort()).toEqual([
      "unrelated",
      "wsws.other.x",
      "wsws.test.c",
      "wsws.test.d",
      "wsws.test.e",
    ]);
  });

  it("does not evict when rewriting a key it already holds", () => {
    const { cache, storage, tick } = setup({ maxEntries: 2 });
    cache.write("a", 1);
    tick(10);
    cache.write("b", 2);
    tick(10);
    cache.write("a", 3);
    expect(storage.keys().sort()).toEqual(["wsws.test.a", "wsws.test.b"]);
    expect(cache.read("a", Infinity)).toEqual({ data: 3, savedAt: 1_020 });
  });

  it("evicts by the time saved, not by insertion order", () => {
    const { cache, storage, tick } = setup({ maxEntries: 2 });
    cache.write("a", 1);
    tick(10);
    cache.write("b", 2);
    tick(10);
    // Rewriting a makes b the oldest.
    cache.write("a", 3);
    tick(10);
    cache.write("c", 4);
    expect(storage.keys().sort()).toEqual(["wsws.test.a", "wsws.test.c"]);
  });

  it("evicts a corrupt entry before any readable one", () => {
    const { cache, storage, tick } = setup({ maxEntries: 2 });
    cache.write("a", 1);
    tick(10);
    storage.setItem("wsws.test.broken", "{");
    cache.write("b", 2);
    expect(storage.keys().sort()).toEqual(["wsws.test.a", "wsws.test.b"]);
  });

  it("on a quota error evicts the oldest entry and retries once", () => {
    const { cache, storage, warn, tick } = setup({ maxEntries: 5 });
    cache.write("a", 1);
    tick(10);
    cache.write("b", 2);
    tick(10);
    storage.failures = [quotaError()];
    cache.write("c", 3);
    expect(storage.keys().sort()).toEqual(["wsws.test.b", "wsws.test.c"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns with the key and the error when the retry also fails", () => {
    const { cache, storage, warn } = setup({ maxEntries: 5 });
    cache.write("a", 1);
    const second = quotaError();
    storage.failures = [quotaError(), second];
    cache.write("big", "x".repeat(10));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("wsws.test.big");
    expect(warn.mock.calls[0][1]).toBe(second);
    expect(storage.getItem("wsws.test.big")).toBeNull();
  });

  it("warns without retrying when there is nothing to evict", () => {
    const { cache, storage, warn } = setup();
    const error = quotaError();
    storage.failures = [error, quotaError()];
    cache.write("only", 1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toBe(error);
    // The second failure was never consumed: no retry happened.
    expect(storage.failures).toHaveLength(1);
  });

  it("recognises Firefox's quota error name", () => {
    const { cache, storage, warn, tick } = setup({ maxEntries: 5 });
    cache.write("a", 1);
    tick(10);
    storage.failures = [new DOMException("full", "NS_ERROR_DOM_QUOTA_REACHED")];
    cache.write("b", 2);
    expect(storage.keys()).toEqual(["wsws.test.b"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns at once on a write failure that is not about quota", () => {
    const { cache, storage, warn } = setup();
    cache.write("a", 1);
    const error = new DOMException("denied", "SecurityError");
    storage.failures = [error];
    cache.write("b", 2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toBe(error);
    expect(storage.keys()).toEqual(["wsws.test.a"]);
  });

  it("warns through console.warn by default", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = new MemoryStorage();
    const cache = createSessionCache({ namespace: "n", version: 1, maxEntries: 2, storage });
    const error = new DOMException("denied", "SecurityError");
    storage.failures = [error];
    cache.write("k", 1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("n.k"), error);
    spy.mockRestore();
  });

  describe("without usable storage", () => {
    it("is a silent no-op when storage is null", () => {
      const warn = vi.fn();
      const cache = createSessionCache({
        namespace: "n",
        version: 1,
        maxEntries: 2,
        storage: null,
        warn,
      });
      cache.write("k", 1);
      expect(cache.read("k", Infinity)).toBeNull();
      cache.remove("k");
      expect(warn).not.toHaveBeenCalled();
    });

    it("is a silent no-op on the server, where there is no window", () => {
      vi.stubGlobal("window", undefined);
      const warn = vi.fn();
      const cache = createSessionCache({ namespace: "n", version: 1, maxEntries: 2, warn });
      cache.write("k", 1);
      expect(cache.read("k", Infinity)).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });

    // A sandboxed iframe throws a SecurityError on the property access itself.
    it("is a silent no-op when reaching sessionStorage throws", () => {
      const access = vi.fn(() => {
        throw new DOMException("sandboxed", "SecurityError");
      });
      vi.stubGlobal(
        "window",
        Object.defineProperty({}, "sessionStorage", { get: access, configurable: true })
      );
      const warn = vi.fn();
      const cache = createSessionCache({ namespace: "n", version: 1, maxEntries: 2, warn });
      cache.write("k", 1);
      expect(cache.read("k", Infinity)).toBeNull();
      cache.remove("k");
      expect(warn).not.toHaveBeenCalled();
      // Probed once when the cache was made, not on every call.
      expect(access).toHaveBeenCalledTimes(1);
    });

    it("uses window.sessionStorage when it is reachable", () => {
      const storage = new MemoryStorage();
      vi.stubGlobal("window", { sessionStorage: storage });
      const cache = createSessionCache({ namespace: "n", version: 1, maxEntries: 2 });
      cache.write("k", 1);
      expect(storage.keys()).toEqual(["n.k"]);
    });
  });
});
