import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const service = vi.hoisted(() => ({ fetchVaultConfig: vi.fn(), rpc: vi.fn() }));
vi.mock("@/features/casino/lib/vault-api", () => ({
  fetchVaultConfig: service.fetchVaultConfig,
}));
// Every contract read in the app goes through this client; the params must
// never reach it now that the service serves them.
vi.mock("@/lib/trade/receipt", () => ({
  publicClientForChain: () => new Proxy({}, { get: () => service.rpc }),
}));
vi.mock("@/hooks/use-prices", () => ({ usePrices: () => ({ ETH: 4000 }) }));

import { useVaultParams } from "@/features/casino/hooks/use-vault-params";
import { useDefaultEntry } from "@/features/casino/hooks/use-default-entry";
import { DEFAULT_SPLIT_BPS } from "@/features/casino/lib/last-standing/split";

// Captured from GET /config on the live gateway, 2026-09-10.
const CONFIG = {
  contract: "0x202Af4dB1F742782709873040Afd6c99190E2684",
  minStartStakeWei: "200000000000000",
  timerSeconds: 60,
  winnerBps: 5000,
  starterBps: 1000,
  treasuryBps: 4000,
  paused: false,
};

// The floor, the split and the round length come from the service in one
// read, shared: the entry hook and the game page used to make three separate
// contract reads for the same numbers.
describe("useVaultParams", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    service.fetchVaultConfig.mockReset();
    service.rpc.mockReset();
    service.fetchVaultConfig.mockResolvedValue(CONFIG);
  });
  afterEach(() => client.clear());

  it("serves the entry hook and the params hook from one service read, no contract read", async () => {
    const { result } = renderHook(() => ({ params: useVaultParams(), entry: useDefaultEntry() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.params.floorWei).toBe(200000000000000n));
    expect(result.current.params.split).toEqual({ winner: 5000, starter: 1000 });
    expect(result.current.params.timerSeconds).toBe(60);
    expect(result.current.entry.floorWei).toBe(200000000000000n);
    expect(result.current.entry.usd).toBeCloseTo(0.8, 2);
    expect(service.fetchVaultConfig).toHaveBeenCalledTimes(1);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("keeps the deployment split and reports the floor as failed when the read fails", async () => {
    service.fetchVaultConfig.mockRejectedValue(new Error("service down"));
    const { result } = renderHook(() => useVaultParams(), { wrapper });
    // One retry a second later before the read is declared failed.
    await waitFor(() => expect(result.current.floorFailed).toBe(true), { timeout: 4_000 });
    expect(result.current.floorWei).toBeNull();
    expect(result.current.split).toEqual(DEFAULT_SPLIT_BPS);
    expect(result.current.timerSeconds).toBeNull();
  });
});
