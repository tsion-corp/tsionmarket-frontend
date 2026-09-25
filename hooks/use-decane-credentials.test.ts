// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

async function freshHook() {
  vi.resetModules();
  return (await import("@/hooks/use-decane-credentials")).useDecaneCredentials;
}

const ok = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("useDecaneCredentials", () => {
  it("returns null until the key arrives — the kit must not mount without one", async () => {
    vi.stubGlobal("fetch", ok({ apiKey: "dck_live_x", appId: "app-1" }));
    const useDecaneCredentials = await freshHook();

    const { result } = renderHook(() => useDecaneCredentials());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ apiKey: "dck_live_x", appId: "app-1" }));
  });

  it("fetches once however many times it is mounted", async () => {
    const fetchMock = ok({ apiKey: "dck_live_x", appId: "app-1" });
    vi.stubGlobal("fetch", fetchMock);
    const useDecaneCredentials = await freshHook();

    const a = renderHook(() => useDecaneCredentials());
    const b = renderHook(() => useDecaneCredentials());
    await waitFor(() => expect(a.result.current).not.toBeNull());
    await waitFor(() => expect(b.result.current).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays null when the route is not configured, rather than half-mounting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 }))
    );
    const useDecaneCredentials = await freshHook();

    const { result } = renderHook(() => useDecaneCredentials());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("retries after a failure instead of caching the failure forever", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ apiKey: "dck_live_x", appId: "app-1" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const useDecaneCredentials = await freshHook();

    const first = renderHook(() => useDecaneCredentials());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = renderHook(() => useDecaneCredentials());
    await waitFor(() => expect(second.result.current).not.toBeNull());
  });

  it("ignores a malformed payload", async () => {
    vi.stubGlobal("fetch", ok({ apiKey: 42 }));
    const useDecaneCredentials = await freshHook();

    const { result } = renderHook(() => useDecaneCredentials());
    await waitFor(() => expect(result.current).toBeNull());
  });
});
