import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, resetResponseCache } from "@/lib/server/response-cache";

beforeEach(() => {
  resetResponseCache();
  vi.useRealTimers();
});

describe("cached", () => {
  it("calls upstream once and serves the snapshot inside the TTL", async () => {
    const load = vi.fn().mockResolvedValue("value");
    expect(await cached("k", load, 60_000)).toBe("value");
    expect(await cached("k", load, 60_000)).toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent misses onto one upstream call", async () => {
    // The load that matters. Twenty thousand users on their own timers put
    // many simultaneous requests on the same wallet; without this each one
    // fires its own sweep and the burst walks into a rate limit.
    let release: (v: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));

    const all = Promise.all([
      cached("k", load, 60_000),
      cached("k", load, 60_000),
      cached("k", load, 60_000),
    ]);
    release("value");

    expect(await all).toEqual(["value", "value", "value"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has passed", async () => {
    const load = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    expect(await cached("k", load, 10)).toBe("first");
    await new Promise((r) => setTimeout(r, 25));
    expect(await cached("k", load, 10)).toBe("second");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("serves the last snapshot when the upstream fails", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce("snapshot")
      .mockRejectedValueOnce(new Error("Alchemy request failed: 429"));
    await cached("k", load, 10);
    await new Promise((r) => setTimeout(r, 25));
    // A throttled provider degrades to slightly stale rather than erroring
    // every caller for the length of the outage.
    expect(await cached("k", load, 10)).toBe("snapshot");
  });

  it("throws when it fails with nothing cached to fall back on", async () => {
    const load = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(cached("k", load, 60_000)).rejects.toThrow("boom");
  });

  it("keeps separate keys separate", async () => {
    const load = vi.fn(async (v: string) => v);
    expect(await cached("a", () => load("a"), 60_000)).toBe("a");
    expect(await cached("b", () => load("b"), 60_000)).toBe("b");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("goes upstream when the caller must observe its own write", async () => {
    const load = vi.fn().mockResolvedValueOnce("before").mockResolvedValueOnce("after");
    expect(await cached("k", load, 60_000)).toBe("before");
    expect(await cached("k", load, 60_000, true)).toBe("after");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not let a failed refetch clear a usable snapshot", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce("snapshot")
      .mockRejectedValue(new Error("Alchemy request failed: 429"));
    await cached("k", load, 10);
    await new Promise((r) => setTimeout(r, 25));
    expect(await cached("k", load, 10)).toBe("snapshot");
    expect(await cached("k", load, 10)).toBe("snapshot");
  });
});
