// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The network endpoint is newer than this page, so the hook has to behave
// sensibly before it is deployed as well as after.

const api = vi.hoisted(() => ({
  network: vi.fn(),
  downline: vi.fn(),
}));

vi.mock("@/features/referrals/lib/referrals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/referrals/lib/referrals")>()),
  getMyReferralNetwork: api.network,
  getMyDownline: api.downline,
}));

const privy = vi.hoisted(() => ({
  state: { ready: true, authenticated: true, user: { wallet: { address: "0xabc" } } },
}));
vi.mock("@privy-io/react-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@privy-io/react-auth")>()),
  usePrivy: () => privy.state,
}));
vi.mock("@/lib/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/user")>()),
  getWalletAddress: () => "0xabc",
}));

import {
  useDownlineBranches,
  useReferralNetwork,
} from "@/features/referrals/hooks/use-referral-network";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const person = (n: number) => ({
  wallet: `0x${n}`,
  username: `user_${n}`,
  claimedAt: null,
  qualified: n % 2 === 0,
});

beforeEach(() => {
  api.network.mockReset();
  api.downline.mockReset();
});

describe("useReferralNetwork", () => {
  it("returns the network the engine answers with", async () => {
    api.network.mockResolvedValue({
      wallet: "0xabc",
      username: "ada",
      joinedAt: null,
      qualified: true,
      downline: { total: 7, counted: 3 },
      generations: [{ generation: 1, total: 5, counted: 2 }],
    });
    const { result } = renderHook(() => useReferralNetwork(true), { wrapper });
    await waitFor(() => expect(result.current.network).not.toBeNull());
    expect(result.current.network?.downline.total).toBe(7);
    expect(result.current.error).toBe(false);
  });

  /**
   * The route does not exist in every environment yet. A 404 has to read as
   * "no network" rather than an error: the rest of the page works, and a red
   * banner over a feature the backend has not deployed helps nobody.
   */
  it("treats a missing route as an empty network, not a failure", async () => {
    api.network.mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }));
    const { result } = renderHook(() => useReferralNetwork(true), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.network?.downline).toEqual({ total: 0, counted: 0 });
  });

  // A real outage is still an outage; only 404 is special.
  it("reports a genuine failure", async () => {
    api.network.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    const { result } = renderHook(() => useReferralNetwork(true), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(true));
  });

  it("asks for nothing while disabled", async () => {
    renderHook(() => useReferralNetwork(false), { wrapper });
    expect(api.network).not.toHaveBeenCalled();
  });
});

describe("useDownlineBranches", () => {
  it("loads a generation the first time it is opened", async () => {
    api.downline.mockResolvedValue({ people: [person(1), person(2)], nextCursor: null });
    const { result } = renderHook(() => useDownlineBranches(), { wrapper });

    await act(async () => result.current.toggle(1));
    await waitFor(() => expect(result.current.open[1]?.people).toHaveLength(2));
    expect(api.downline).toHaveBeenCalledWith(1, null);
  });

  it("closes without another request, and reopening does not refetch the page it has", async () => {
    api.downline.mockResolvedValue({ people: [person(1)], nextCursor: null });
    const { result } = renderHook(() => useDownlineBranches(), { wrapper });

    await act(async () => result.current.toggle(1));
    await waitFor(() => expect(result.current.open[1]).toBeTruthy());
    await act(async () => result.current.toggle(1));
    expect(result.current.open[1]).toBeUndefined();
    expect(api.downline).toHaveBeenCalledTimes(1);
  });

  // Paging walks one list; a second page that replaced the first would make
  // the reader lose the people they had already scrolled past.
  it("appends the next page rather than replacing it", async () => {
    api.downline
      .mockResolvedValueOnce({ people: [person(1), person(2)], nextCursor: "c1" })
      .mockResolvedValueOnce({ people: [person(3)], nextCursor: null });
    const { result } = renderHook(() => useDownlineBranches(), { wrapper });

    await act(async () => result.current.toggle(1));
    await waitFor(() => expect(result.current.open[1]?.nextCursor).toBe("c1"));
    await act(async () => result.current.more(1));
    await waitFor(() => expect(result.current.open[1]?.people).toHaveLength(3));
    expect(api.downline).toHaveBeenLastCalledWith(1, "c1");
    expect(result.current.open[1]?.nextCursor).toBeNull();
  });

  it("does not ask for more when there is no cursor", async () => {
    api.downline.mockResolvedValue({ people: [person(1)], nextCursor: null });
    const { result } = renderHook(() => useDownlineBranches(), { wrapper });
    await act(async () => result.current.toggle(1));
    await waitFor(() => expect(result.current.open[1]).toBeTruthy());
    await act(async () => result.current.more(1));
    expect(api.downline).toHaveBeenCalledTimes(1);
  });

  // One branch failing must not take the page with it.
  it("stops loading and keeps the rest of the page when a branch fails", async () => {
    api.downline.mockRejectedValue(new Error("upstream"));
    const { result } = renderHook(() => useDownlineBranches(), { wrapper });
    await act(async () => result.current.toggle(2));
    await waitFor(() => expect(result.current.open[2]?.loading).toBe(false));
    expect(result.current.open[2]?.people).toEqual([]);
  });

  it("keeps generations apart", async () => {
    api.downline
      .mockResolvedValueOnce({ people: [person(1)], nextCursor: null })
      .mockResolvedValueOnce({ people: [person(2), person(3)], nextCursor: null });
    const { result } = renderHook(() => useDownlineBranches(), { wrapper });

    await act(async () => result.current.toggle(1));
    await waitFor(() => expect(result.current.open[1]?.people).toHaveLength(1));
    await act(async () => result.current.toggle(2));
    await waitFor(() => expect(result.current.open[2]?.people).toHaveLength(2));
    expect(result.current.open[1]?.people).toHaveLength(1);
  });
});
