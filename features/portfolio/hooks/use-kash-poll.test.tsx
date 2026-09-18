import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The kash account poll, exercised rather than grepped.
 *
 * The test this replaces read `use-kash.ts` as text and asserted that the
 * string "refetchIntervalInBackground: false" appeared in it, which passes if
 * the string is in a comment. Worse, it read the interval with
 * /ACCOUNT_POLL_MS = (\d+)/ against `10 * 1000`, capturing "10" rather than
 * 10000, so it asserted the multiplier and would have accepted a ten MINUTE
 * poll as "fast enough that outside changes feel live".
 *
 * This one drives the real hook against a real QueryClient and asserts what
 * the network actually does.
 */

const getKashAccount = vi.fn();
vi.mock("@/features/portfolio/lib/kash", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/portfolio/lib/kash")>();
  return { ...actual, getKashAccount: (...a: unknown[]) => getKashAccount(...a) };
});

const WALLET = "0x1111111111111111111111111111111111111111";
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: {}, ready: true, authenticated: true }),
  // lib/privy-token.ts binds both of these at module load.
  getAccessToken: () => Promise.resolve("test-token"),
  getIdentityToken: () => Promise.resolve("test-id-token"),
}));
vi.mock("@/lib/user", () => ({ getWalletAddress: () => WALLET }));

function visibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  // React Query's focusManager listens on `window`, and a bare `new Event` does
  // not bubble, so dispatching only on `document` never reaches it. The
  // interval check reads visibilityState directly and does not need the event,
  // which is why a half-wired version of this helper still looks like it works.
  window.dispatchEvent(new Event("visibilitychange"));
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

let client: QueryClient;

beforeEach(() => {
  getKashAccount.mockReset();
  getKashAccount.mockResolvedValue({ balance: "1" });
  visibility("visible");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  client.clear();
  visibility("visible");
  vi.useRealTimers();
});

describe("kash account reads", () => {
  // Cache-first (2026-09-17): the balance is persisted to localStorage and no
  // longer polled. It changes when the user acts (every action refreshes the
  // card itself) and when a credit lands from outside; those outside credits
  // are caught on opening the card and on returning to the tab, not a timer.
  it("reads once on mount and never again on a timer", async () => {
    const { useKashAccount } = await import("@/features/portfolio/hooks/use-kash");
    vi.useFakeTimers();
    renderHook(() => useKashAccount(), { wrapper: wrapper(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getKashAccount).toHaveBeenCalledTimes(1);

    // Minutes pass with the tab in front: no background poll, so no re-read.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(getKashAccount).toHaveBeenCalledTimes(1);
  });

  // A hop to another page and back used to re-read the account on every
  // mount. A figure read seconds ago is still the figure.
  it("does not re-read on a remount within half a minute", async () => {
    const { useKashAccount } = await import("@/features/portfolio/hooks/use-kash");
    vi.useFakeTimers();
    const first = renderHook(() => useKashAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    first.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    const second = renderHook(() => useKashAccount(), { wrapper: wrapper(client) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getKashAccount).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it("spends no request while the tab is hidden", async () => {
    const { useKashAccount } = await import("@/features/portfolio/hooks/use-kash");
    vi.useFakeTimers();
    renderHook(() => useKashAccount(), { wrapper: wrapper(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    visibility("hidden");
    const whenHidden = getKashAccount.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // A backgrounded tab cannot show anyone a new number, so it must not spend
    // a request on one. With no poll there is nothing on a timer either.
    expect(getKashAccount.mock.calls.length).toBe(whenHidden);
  });

  it("catches up when the tab comes back, so nothing is stale on return", async () => {
    const { useKashAccount } = await import("@/features/portfolio/hooks/use-kash");
    vi.useFakeTimers();
    renderHook(() => useKashAccount(), { wrapper: wrapper(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    visibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const whenHidden = getKashAccount.mock.calls.length;

    await act(async () => {
      visibility("visible");
      await vi.advanceTimersByTimeAsync(2_000);
    });

    // This is what makes pausing safe: the figure refreshes on return, so the
    // case the background poll was defending is still covered.
    expect(getKashAccount.mock.calls.length).toBeGreaterThan(whenHidden);
  });
});
