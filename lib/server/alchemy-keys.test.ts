import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alchemyFetch,
  alchemyKeys,
  alchemyRpcKeys,
  hasAlchemyKey,
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
  vi.stubEnv("ALCHEMY_API_KEY", PRIMARY);
  vi.stubEnv("ALCHEMY_API_KEY_FALLBACK", FALLBACK);
  vi.stubEnv("ALCHEMY_RPC_API_KEY", "");
  vi.stubEnv("ALCHEMY_RPC_API_KEY_FALLBACK", "");
});

describe("alchemyRpcKeys", () => {
  it("keeps node-RPC traffic on its dedicated key pool", () => {
    vi.stubEnv("ALCHEMY_RPC_API_KEY", "rpc-primary");
    vi.stubEnv("ALCHEMY_RPC_API_KEY_FALLBACK", "rpc-fallback");
    expect(alchemyRpcKeys()).toEqual(["rpc-primary", "rpc-fallback"]);
  });

  it("uses the legacy pool when dedicated RPC keys are not configured", () => {
    expect(alchemyRpcKeys()).toEqual([PRIMARY, FALLBACK]);
  });
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
