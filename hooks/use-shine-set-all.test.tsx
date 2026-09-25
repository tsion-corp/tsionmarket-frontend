import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ userId: "did:test" }),
}));

import { SHINE_SERVICES, useShine } from "./use-shine";

const ALL_ON = Object.fromEntries(SHINE_SERVICES.map((s) => [s, true]));
const ALL_OFF = Object.fromEntries(SHINE_SERVICES.map((s) => [s, false]));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(shine: Record<string, boolean>) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ shine }) } as Response);
}

beforeEach(() => apiFetch.mockReset());

describe("setAll", () => {
  // The master switch writes every service in ONE request. Seven writes would
  // be seven chances to half-apply, and the route already takes several.
  it("writes all seven services in a single request", async () => {
    apiFetch.mockReturnValueOnce(ok(ALL_ON)).mockReturnValueOnce(ok(ALL_OFF));
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    apiFetch.mockClear();
    apiFetch.mockReturnValueOnce(ok(ALL_OFF));
    await act(async () => {
      await result.current.setAll(false);
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(apiFetch.mock.calls[0][1].body as string);
    expect(Object.keys(body.shine).sort()).toEqual([...SHINE_SERVICES].sort());
    expect(Object.values(body.shine).every((v) => v === false)).toBe(true);
  });

  it("reports whether every service is on, which is what the master switch draws", async () => {
    apiFetch.mockReturnValueOnce(ok({ ...ALL_ON, spot: false }));
    const { result } = renderHook(() => useShine(), { wrapper });
    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.allOn).toBe(false);
  });
});
