import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/privy-token", () => ({
  resolveAuthTokens: () => Promise.resolve({ accessToken: "token", idToken: "id" }),
}));

const { apiFetch } = await import("@/lib/api");
const { resetCircuitForTest } = await import("@/lib/api/circuit-store");

const failing = () => Promise.resolve(new Response("{}", { status: 502 }));

beforeEach(() => {
  resetCircuitForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch under an outage", () => {
  /**
   * The claim this app needs to be able to make: when the server is
   * unreachable, polling stops COSTING anything. Match state polls every
   * second, tickets every second, some of it in a hidden tab — so "each
   * request finds out on its own" is thousands of requests and as many
   * serverless invocations.
   */
  it("stops sending reads once the server has failed three times", async () => {
    const fetchMock = vi.fn(failing);
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 20; i += 1) {
      await apiFetch("/api/prices").catch(() => {});
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // A write is the player doing something deliberate — a move, a bet, a
  // transfer. Refusing it in-process would look like it happened when it did
  // not, so writes always go out and fail honestly.
  it("still sends writes while the circuit is open", async () => {
    const fetchMock = vi.fn(failing);
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 5; i += 1) await apiFetch("/api/prices").catch(() => {});
    const before = fetchMock.mock.calls.length;
    await apiFetch("/api/pouch/offramp", { method: "POST" }).catch(() => {});

    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });

  // Recovery must need no ceremony: the first success on a service closes
  // its circuit and ordinary traffic to it resumes.
  it("reopens a service the moment a request to it succeeds", async () => {
    const fetchMock = vi.fn(failing);
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 5; i += 1) await apiFetch("/api/pouch/rate").catch(() => {});

    // A write gets through, and its success is what tells us the service is back.
    fetchMock.mockImplementation(() => Promise.resolve(new Response("{}", { status: 200 })));
    await apiFetch("/api/pouch/offramp", { method: "POST" }).catch(() => {});

    const after = fetchMock.mock.calls.length;
    await apiFetch("/api/pouch/rate").catch(() => {});
    expect(fetchMock.mock.calls.length).toBe(after + 1);
  });

  // One breaker per service. A dead game gateway, polled by a decorative
  // strip, must not stop the balance from loading.
  it("keeps one service's outage from refusing another's reads", async () => {
    const fetchMock = vi.fn(failing);
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 5; i += 1) await apiFetch("/api/chess/matches").catch(() => {});
    const before = fetchMock.mock.calls.length;

    await apiFetch("/api/portfolio").catch(() => {});
    expect(fetchMock.mock.calls.length).toBe(before + 1);
  });
});
