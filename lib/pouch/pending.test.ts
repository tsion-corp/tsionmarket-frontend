import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingOnramp,
  isPendingOnrampActive,
  PENDING_ONRAMP_TTL_MS,
  pendingOnrampSnapshot,
  savePendingOnramp,
  subscribePendingOnramp,
} from "@/lib/pouch/pending";

const KEY = "wsws.pouch.pending-onramp.v1";

// The test environment leaves window.localStorage undefined, so a Map-backed
// stand-in is installed before each test.
const backing = new Map<string, string>();
const storage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
};

describe("pending onramp store", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
    backing.clear();
    clearPendingOnramp();
  });

  it("round-trips a confirmed transfer under the versioned key", () => {
    savePendingOnramp("sess-1", 1_000);
    expect(backing.has(KEY)).toBe(true);
    expect(pendingOnrampSnapshot()).toEqual({ sessionId: "sess-1", confirmedAt: 1_000 });
  });

  it("keeps the snapshot referentially stable between reads", () => {
    savePendingOnramp("sess-1", 1_000);
    expect(pendingOnrampSnapshot()).toBe(pendingOnrampSnapshot());
  });

  it("clears the stored transfer", () => {
    savePendingOnramp("sess-1", 1_000);
    clearPendingOnramp();
    expect(pendingOnrampSnapshot()).toBeNull();
    expect(backing.has(KEY)).toBe(false);
  });

  it("notifies subscribers on save and clear", () => {
    const cb = vi.fn();
    const unsubscribe = subscribePendingOnramp(cb);
    savePendingOnramp("sess-1", 1_000);
    clearPendingOnramp();
    expect(cb).toHaveBeenCalledTimes(2);
    unsubscribe();
    savePendingOnramp("sess-2", 2_000);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("ignores a corrupted stored value and reads as nothing pending", async () => {
    backing.set(KEY, "{not json");
    vi.resetModules();
    const fresh = await import("@/lib/pouch/pending");
    expect(fresh.pendingOnrampSnapshot()).toBeNull();
  });

  it("ignores a stored value with the wrong shape", async () => {
    backing.set(KEY, JSON.stringify({ sessionId: "", confirmedAt: "soon" }));
    vi.resetModules();
    const fresh = await import("@/lib/pouch/pending");
    expect(fresh.pendingOnrampSnapshot()).toBeNull();
  });
});

describe("isPendingOnrampActive", () => {
  const pending = { sessionId: "sess-1", confirmedAt: 0 };

  it("holds within the TTL", () => {
    expect(isPendingOnrampActive(pending, PENDING_ONRAMP_TTL_MS - 1)).toBe(true);
  });

  it("frees once the TTL has passed", () => {
    expect(isPendingOnrampActive(pending, PENDING_ONRAMP_TTL_MS)).toBe(false);
  });

  it("is inactive with nothing stored", () => {
    expect(isPendingOnrampActive(null, 0)).toBe(false);
  });
});
