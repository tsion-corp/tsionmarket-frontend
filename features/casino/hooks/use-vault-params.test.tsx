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

// Captured from GET /config on the live gateway, 2026-09-15, after the v5
// cutover. `minStartStakeWei` at the top level is the NATIVE floor, kept for
// older clients; the floor that matters is the one on the asset we play in.
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CONFIG = {
  contract: "0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0",
  version: "v5",
  minStartStakeWei: "200000000000000",
  assets: [
    {
      token: "0x0000000000000000000000000000000000000000",
      symbol: "ETH",
      decimals: 18,
      minStartStakeWei: "200000000000000",
      enabled: true,
    },
    { token: USDC, symbol: "USDC", decimals: 6, minStartStakeWei: "100000", enabled: true },
  ],
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
    // The USDC floor, not the native one: 100000 at six decimals is 0.1 USDC.
    // Reading the top-level field instead quoted a 0.0002 ETH stake against a
    // 6-decimal token, which is how a 10-cent game advertised itself at $0.49.
    await waitFor(() => expect(result.current.params.floorUnits).toBe(100_000n));
    expect(result.current.params.split).toEqual({ winner: 5000, starter: 1000 });
    expect(result.current.params.timerSeconds).toBe(60);
    expect(result.current.entry.floorUnits).toBe(100_000n);
    // Our preferred entry, which sits above the 0.1 USDC floor. No price read
    // either way: a USDC amount IS a dollar amount, so nothing can move between
    // the number on the button and the number that is sent.
    expect(result.current.entry.usd).toBeCloseTo(0.38, 6);
    expect(service.fetchVaultConfig).toHaveBeenCalledTimes(1);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  // An older service sends no asset allowlist at all. There is nothing honest
  // to quote then, so the floor stays null rather than falling back to the
  // native figure dressed up as dollars.
  it("quotes no floor when the service names no asset allowlist", async () => {
    service.fetchVaultConfig.mockResolvedValue({ ...CONFIG, assets: undefined });
    const { result } = renderHook(() => useDefaultEntry(), { wrapper });
    await waitFor(() => expect(service.fetchVaultConfig).toHaveBeenCalled());
    expect(result.current.floorUnits).toBeNull();
    expect(result.current.usd).toBeNull();
  });

  it("keeps the deployment split and reports the floor as failed when the read fails", async () => {
    service.fetchVaultConfig.mockRejectedValue(new Error("service down"));
    const { result } = renderHook(() => useVaultParams(), { wrapper });
    // One retry a second later before the read is declared failed.
    await waitFor(() => expect(result.current.floorFailed).toBe(true), { timeout: 4_000 });
    expect(result.current.floorUnits).toBeNull();
    expect(result.current.split).toEqual(DEFAULT_SPLIT_BPS);
    expect(result.current.timerSeconds).toBeNull();
  });
});
