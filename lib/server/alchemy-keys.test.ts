import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alchemyFetch,
  alchemyKeys,
  alchemyPairs,
  hasAlchemyKey,
  markAlchemyKeyBlocked,
  resetAlchemyKeyBlocks,
} from "@/lib/server/alchemy-keys";

const PRIMARY = "primary-key";
const FALLBACK = "fallback-key";

/** Records which key each attempt used, and answers from a scripted queue. */
function scriptedFetch(answers: (number | "network")[]) {
  const used: string[] = [];
  const fetchMock = vi.fn((url: string | URL) => {
    used.push(String(url).split("/v2/")[1] ?? String(url));
    const next = answers.shift() ?? 200;
    if (next === "network") return Promise.reject(new Error("socket hang up"));
    return Promise.resolve(new Response("{}", { status: next }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { used };
}

const url = (key: string) => `https://eth-mainnet.g.alchemy.com/v2/${key}`;

beforeEach(() => {
  // The block list is process state; a key blocked by one test must not
  // steer the next.
  resetAlchemyKeyBlocks();
  vi.stubEnv("ALCHEMY_API_KEY", PRIMARY);
  vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", FALLBACK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("alchemyKeys", () => {
  it("returns the primary first, then the fallback", () => {
    expect(alchemyKeys()).toEqual([PRIMARY, FALLBACK]);
  });

  it("drops a fallback that repeats the primary, so it is not tried twice", () => {
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", PRIMARY);
    expect(alchemyKeys()).toEqual([PRIMARY]);
  });

  it("ignores an unset or blank fallback", () => {
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "   ");
    expect(alchemyKeys()).toEqual([PRIMARY]);
  });

  it("reports whether anything is configured at all", () => {
    expect(hasAlchemyKey()).toBe(true);
    vi.stubEnv("ALCHEMY_API_KEY", "");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "");
    expect(hasAlchemyKey()).toBe(false);
  });
});

describe("alchemyFetch key rotation", () => {
  it("never reaches the fallback while the primary answers", async () => {
    const { used } = scriptedFetch([200]);
    const res = await alchemyFetch(url);
    expect(res.ok).toBe(true);
    expect(used).toEqual([PRIMARY]);
  });

  it("moves to the fallback when the primary is rate limited", async () => {
    // The reason the pool exists: the second key has its own budget.
    const { used } = scriptedFetch([429, 200]);
    const res = await alchemyFetch(url);
    expect(res.ok).toBe(true);
    expect(used).toEqual([PRIMARY, FALLBACK]);
  });

  it("does not retry a rate-limited key before moving on", async () => {
    const { used } = scriptedFetch([429, 429]);
    await expect(alchemyFetch(url)).rejects.toThrow("429");
    expect(used).toEqual([PRIMARY, FALLBACK]);
  });

  it("moves to the fallback when the primary key is rejected", async () => {
    const { used } = scriptedFetch([401, 200]);
    await expect(alchemyFetch(url)).resolves.toBeInstanceOf(Response);
    expect(used).toEqual([PRIMARY, FALLBACK]);
  });

  it("retries a 5xx on the same key once, then hands over", async () => {
    const { used } = scriptedFetch([500, 500, 200]);
    const res = await alchemyFetch(url);
    expect(res.ok).toBe(true);
    expect(used).toEqual([PRIMARY, PRIMARY, FALLBACK]);
  });

  it("retries a network fault on the same key once, then hands over", async () => {
    const { used } = scriptedFetch(["network", "network", 200]);
    const res = await alchemyFetch(url);
    expect(res.ok).toBe(true);
    expect(used).toEqual([PRIMARY, PRIMARY, FALLBACK]);
  });

  it("spends no fallback quota on a request that is simply wrong", async () => {
    // A 400 is our bug. The second key would answer it the same way, so
    // asking it only burns budget that a rate-limited caller will need.
    const { used } = scriptedFetch([400, 200]);
    await expect(alchemyFetch(url)).rejects.toThrow("400");
    expect(used).toEqual([PRIMARY]);
  });

  it("surfaces the last failure when every key is exhausted", async () => {
    const { used } = scriptedFetch([429, 429]);
    await expect(alchemyFetch(url)).rejects.toThrow("Alchemy request failed: 429");
    expect(used).toHaveLength(2);
  });

  it("still works with only one key configured", async () => {
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "");
    const { used } = scriptedFetch([500, 200]);
    const res = await alchemyFetch(url);
    expect(res.ok).toBe(true);
    expect(used).toEqual([PRIMARY, PRIMARY]);
  });

  it("refuses to call out with no key configured", async () => {
    vi.stubEnv("ALCHEMY_API_KEY", "");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "");
    const { used } = scriptedFetch([200]);
    await expect(alchemyFetch(url)).rejects.toThrow("No Alchemy API key configured");
    expect(used).toEqual([]);
  });
});

// The team holds several keys, each with its own gas policy, configured as
// comma-separated lists in the same order. The pool walks them in that order
// and a key that has answered capacity or auth is skipped for a cooldown, so
// a request does not pay for the same failed call again and again.
describe("alchemyKeys as a list", () => {
  it("reads a comma-separated list in order, ignoring blanks and spaces", () => {
    vi.stubEnv("ALCHEMY_API_KEY", " k0, k1 ,,k2 ");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "");
    expect(alchemyKeys()).toEqual(["k0", "k1", "k2"]);
  });

  it("still appends the deprecated fallback after the list", () => {
    vi.stubEnv("ALCHEMY_API_KEY", "k0,k1");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "old");
    expect(alchemyKeys()).toEqual(["k0", "k1", "old"]);
  });
});

describe("alchemyPairs", () => {
  it("pairs each key with the policy at the same index", () => {
    vi.stubEnv("ALCHEMY_API_KEY", "k0,k1,k2");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "");
    vi.stubEnv("ALCHEMY_GAS_POLICY_ID", "p0,p1,p2");
    vi.stubEnv("ALCHEMY_POLYGON_GAS_POLICY_ID", "q0,,q2");
    expect(alchemyPairs()).toEqual([
      { index: 0, key: "k0", policyId: "p0", polygonPolicyId: "q0" },
      { index: 1, key: "k1", policyId: "p1", polygonPolicyId: undefined },
      { index: 2, key: "k2", policyId: "p2", polygonPolicyId: "q2" },
    ]);
  });

  it("leaves a key without a policy at its index unpaired, never borrowing another", () => {
    vi.stubEnv("ALCHEMY_API_KEY", "k0,k1");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "old");
    vi.stubEnv("ALCHEMY_GAS_POLICY_ID", "p0");
    vi.stubEnv("ALCHEMY_POLYGON_GAS_POLICY_ID", "");
    expect(alchemyPairs().map((p) => [p.key, p.policyId])).toEqual([
      ["k0", "p0"],
      ["k1", undefined],
      ["old", undefined],
    ]);
  });
});

describe("blocked keys", () => {
  beforeEach(() => {
    resetAlchemyKeyBlocks();
    vi.stubEnv("ALCHEMY_API_KEY", "k0,k1");
    vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", "");
  });

  it("goes straight to the next key while the first is blocked", async () => {
    const { used } = scriptedFetch([200]);
    markAlchemyKeyBlocked("k0", 60_000);
    await alchemyFetch(url);
    expect(used).toEqual(["k1"]);
  });

  it("blocks a key that answers monthly capacity, so the next request skips it", async () => {
    const { used } = scriptedFetch([429, 200, 200]);
    await alchemyFetch(url);
    await alchemyFetch(url);
    expect(used).toEqual(["k0", "k1", "k1"]);
  });

  it("tries a blocked key again once its cooldown has passed", async () => {
    vi.useFakeTimers();
    const { used } = scriptedFetch([200, 200]);
    markAlchemyKeyBlocked("k0", 1_000);
    await alchemyFetch(url);
    vi.advanceTimersByTime(1_500);
    await alchemyFetch(url);
    expect(used).toEqual(["k1", "k0"]);
    vi.useRealTimers();
  });

  it("still tries a blocked key when every key is blocked", async () => {
    const { used } = scriptedFetch([200]);
    markAlchemyKeyBlocked("k0", 60_000);
    markAlchemyKeyBlocked("k1", 60_000);
    await alchemyFetch(url);
    expect(used).toEqual(["k0"]);
  });
});
