import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { isPersistedKey } from "@/lib/query-persist";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const session = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  userId: "did:privy:alice" as string | null,
  evmAddress: null as string | null,
  solanaAddress: null as string | null,
  profile: { name: "u", email: "", avatarSeed: "u" },
  logout: async () => {},
}));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));

import {
  SHINE_SERVICES,
  shinePreferencesKey,
  useShine,
  type ShinePreferences,
} from "@/hooks/use-shine";

const ALICE = "did:privy:alice";
const BOB = "did:privy:bob";

const ALL_ON: ShinePreferences = {
  memecoin: true,
  spot: true,
  rwa: true,
  prediction: true,
  perps: true,
  arcade: true,
  sports: true,
};

function answer(shine: Partial<ShinePreferences> = {}) {
  return new Response(JSON.stringify({ shine: { ...ALL_ON, ...shine } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function refusal(status = 502) {
  return new Response(JSON.stringify({ error: "nope" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A read that stays pending, so the loading window can be inspected.
function pending() {
  return new Promise<Response>(() => {});
}

describe("useShine", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    session.userId = ALICE;
  });
  afterEach(() => client.clear());

  it("names the seven services the product has, and no others", () => {
    expect([...SHINE_SERVICES]).toEqual([
      "memecoin",
      "spot",
      "rwa",
      "prediction",
      "perps",
      "arcade",
      "sports",
    ]);
  });

  it("reads every service back from the account", async () => {
    apiFetch.mockResolvedValue(answer({ perps: false }));
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.preferences).toEqual({ ...ALL_ON, perps: false });
    expect(result.current.isOn("perps")).toBe(false);
    expect(result.current.isOn("memecoin")).toBe(true);
    expect(String(apiFetch.mock.calls[0][0])).toBe("/api/preferences");
  });

  // Shine on memecoins is a different setting from Shine on perps.
  it("keeps the seven independent of each other", async () => {
    apiFetch.mockResolvedValue(answer({ memecoin: false, sports: false }));
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.isOn("memecoin")).toBe(false);
    expect(result.current.isOn("sports")).toBe(false);
    expect(result.current.isOn("spot")).toBe(true);
    expect(result.current.isOn("perps")).toBe(true);
  });

  // The toggle shows the product default while the read is in flight, which
  // is the conservative direction: it never understates what will be posted.
  it("shows on while the read is still in flight", async () => {
    apiFetch.mockReturnValue(pending());
    const { result } = renderHook(() => useShine(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isResolved).toBe(false);
    expect(result.current.isOn("perps")).toBe(true);
  });

  // ...and the posting decision does not run on that guess.
  it("refuses to authorise a post until the account's record has actually arrived", async () => {
    apiFetch.mockReturnValue(pending());
    const { result } = renderHook(() => useShine(), { wrapper });
    for (const service of SHINE_SERVICES) expect(result.current.mayPost(service)).toBe(false);
  });

  it("refuses to authorise a post when the read failed", async () => {
    apiFetch.mockResolvedValue(refusal());
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isResolved).toBe(false);
    expect(result.current.mayPost("memecoin")).toBe(false);
    // The toggle still shows the default rather than a blank control.
    expect(result.current.isOn("memecoin")).toBe(true);
  });

  it("authorises a post only for a service the account has on", async () => {
    apiFetch.mockResolvedValue(answer({ arcade: false }));
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.mayPost("spot")).toBe(true);
    expect(result.current.mayPost("arcade")).toBe(false);
  });

  it("refuses to authorise a post with nobody signed in", async () => {
    session.userId = null;
    const { result } = renderHook(() => useShine(), { wrapper });
    expect(result.current.mayPost("spot")).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("writes one service, and sends only that one", async () => {
    apiFetch.mockResolvedValueOnce(answer());
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    apiFetch.mockResolvedValueOnce(answer({ perps: false }));
    await act(async () => {
      await result.current.setShine("perps", false);
    });

    const [path, init] = apiFetch.mock.calls[1] as [string, RequestInit];
    expect(path).toBe("/api/preferences");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ shine: { perps: false } });
    expect(result.current.isOn("perps")).toBe(false);
    expect(result.current.isOn("spot")).toBe(true);
  });

  it("flips the toggle at once rather than on the round trip", async () => {
    apiFetch.mockResolvedValueOnce(answer());
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    let release: (res: Response) => void = () => {};
    apiFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      })
    );
    let saved: Promise<void> = Promise.resolve();
    act(() => {
      saved = result.current.setShine("spot", false);
    });
    await waitFor(() => expect(result.current.isOn("spot")).toBe(false));
    await act(async () => {
      release(answer({ spot: false }));
      await saved;
    });
    expect(result.current.isOn("spot")).toBe(false);
  });

  // A toggle that silently fails to save is worse than one that refuses.
  it("puts the toggle back and reports the failure when the save is refused", async () => {
    apiFetch.mockResolvedValueOnce(answer());
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    apiFetch.mockResolvedValueOnce(refusal());
    await expect(result.current.setShine("rwa", false)).rejects.toThrow();
    await waitFor(() => expect(result.current.isOn("rwa")).toBe(true));
  });

  it("puts the toggle back when the request never reaches the server", async () => {
    apiFetch.mockResolvedValueOnce(answer());
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    apiFetch.mockRejectedValueOnce(new Error("offline"));
    await expect(result.current.setShine("sports", false)).rejects.toThrow("offline");
    await waitFor(() => expect(result.current.isOn("sports")).toBe(true));
  });

  // A private preference has no business in a snapshot that outlives the
  // session, and the account is the only truth for it.
  it("is never written to the persisted cache snapshot", () => {
    expect(isPersistedKey(shinePreferencesKey(ALICE))).toBe(false);
  });

  it("drops the previous account's preferences when the signed-in account changes", async () => {
    apiFetch.mockResolvedValue(answer({ perps: false }));
    const { result, rerender } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isOn("perps")).toBe(false));
    expect(client.getQueryData(shinePreferencesKey(ALICE))).toBeDefined();

    apiFetch.mockResolvedValue(answer());
    session.userId = BOB;
    rerender();

    await waitFor(() => expect(client.getQueryData(shinePreferencesKey(ALICE))).toBeUndefined());
    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.isOn("perps")).toBe(true);
  });

  it("refuses a response that is not the record it asked for", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ shine: { perps: "yes" } }), { status: 200 })
    );
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isResolved).toBe(false);
    expect(result.current.mayPost("perps")).toBe(false);
  });
});
