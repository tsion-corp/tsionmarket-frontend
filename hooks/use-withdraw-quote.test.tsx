import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

import {
  createWithdrawQuote,
  useWithdrawQuote,
  type WithdrawQuoteInput,
} from "@/hooks/use-deposit";

const QUOTE = {
  success: true,
  depositRequestId: "req-1",
  depositAddress: "0xd5bccfd48bdaa725c816245e345022dead6394af",
  isStaticAddress: false,
  amountOut: "924893",
  minAmountOut: "924893",
  status: "PENDING_DEPOSIT",
  expiresInSeconds: 120,
};

const input: WithdrawQuoteInput = {
  originChainId: 8453,
  originAsset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  destinationChainId: 42161,
  destinationAsset: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  amount: "1000000",
  recipient: "0x6fe0c92d880678f86a7d213695757ed58b09877f",
  refundTo: "0x6fe0c92d880678f86a7d213695757ed58b09877f",
};

const bodies = () =>
  apiFetch.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));

// Every quote used to reserve a Dextopus deposit address, and the preview
// re-quoted on each debounced amount and every recipient character. Dextopus
// prices without persisting when asked with `dry`, verified live on
// 2026-09-09. The preview asks that way and ignores the recipient, which does
// not move the price; the real, strict quote is fetched once at submit.
describe("withdraw quotes", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiFetch.mockReset();
    apiFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify(QUOTE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
  });
  afterEach(() => client.clear());

  it("previews with a dry quote that reserves nothing", async () => {
    renderHook(() => useWithdrawQuote(input), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(String(apiFetch.mock.calls[0][0])).toBe("/api/dextopus/withdraw/deposit/quote");
    expect(bodies()[0]).toMatchObject({ ...input, strict: true, dry: true });
  });

  it("does not re-quote when only the recipient changes", async () => {
    const { rerender } = renderHook(({ q }) => useWithdrawQuote(q), {
      wrapper,
      initialProps: { q: input },
    });
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    rerender({ q: { ...input, recipient: "0x0000000000000000000000000000000000000abc" } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("re-quotes when the amount changes", async () => {
    const { rerender } = renderHook(({ q }) => useWithdrawQuote(q), {
      wrapper,
      initialProps: { q: input },
    });
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    rerender({ q: { ...input, amount: "2000000" } });
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(bodies()[1].amount).toBe("2000000");
  });

  it("fetches the real strict quote, with the recipient, at submit", async () => {
    await createWithdrawQuote(input);
    expect(bodies()[0]).toMatchObject({ ...input, strict: true });
    expect(bodies()[0].dry).toBeUndefined();
  });
});
