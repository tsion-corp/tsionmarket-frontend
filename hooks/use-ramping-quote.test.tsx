import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));

import { useRampingQuote } from "./use-ramping";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function answer(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data }),
  } as unknown as Response);
}

const OFFRAMP_50 = {
  side: "offramp",
  rate: "1350",
  input: { currency: "USDC", amount: "50" },
  output: { currency: "NGN", amount: "67480" },
  fee: { currency: "NGN", amount: "20" },
};

beforeEach(() => {
  apiFetch.mockReset();
});

describe("useRampingQuote", () => {
  // 50 USDC at 1350 is 67500 gross. The rail pays 67480. Taking its figure
  // rather than multiplying is the whole point of the hook.
  it("returns the rail's payout, which is net of the fee", async () => {
    apiFetch.mockReturnValue(answer(OFFRAMP_50));
    const { result } = renderHook(() => useRampingQuote("offramp", "50"), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.outputAmount).toBe("67480");
    expect(result.current.data?.feeAmount).toBe("20");
    expect(result.current.data?.outputAmount).not.toBe("67500");
  });

  it("asks for the side's own amount parameter", async () => {
    apiFetch.mockReturnValue(answer(OFFRAMP_50));
    renderHook(() => useRampingQuote("offramp", "50"), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch.mock.calls[0][0]).toBe("/api/ramping/rates/quote?side=offramp&usdcAmount=50");

    apiFetch.mockClear();
    renderHook(() => useRampingQuote("onramp", "100000"), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch.mock.calls[0][0]).toBe("/api/ramping/rates/quote?side=onramp&ngnAmount=100000");
  });

  // A quote for nothing is not a quote, and asking for one would price an
  // empty field on every keystroke.
  it("asks for nothing until there is an amount to price", async () => {
    const { rerender } = renderHook(
      ({ a }: { a: string | null }) => useRampingQuote("offramp", a),
      {
        wrapper,
        initialProps: { a: null as string | null },
      }
    );
    expect(apiFetch).not.toHaveBeenCalled();

    rerender({ a: "" });
    expect(apiFetch).not.toHaveBeenCalled();

    rerender({ a: "0" });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("does not send a session, because the rail serves prices publicly", async () => {
    apiFetch.mockReturnValue(answer(OFFRAMP_50));
    renderHook(() => useRampingQuote("offramp", "50"), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch.mock.calls[0][1]).toBeUndefined();
  });
});
