import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  evmAddress: "0x0000000000000000000000000000000000000001" as string | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: session.evmAddress,
    solanaAddress: null,
    profile: { name: "Emmanuel Omemgboji", email: "e@example.com", avatarSeed: "seed" },
    logout: vi.fn(),
  }),
}));

const bns = vi.hoisted(() => ({ reverseResolveArkAddress: vi.fn() }));
vi.mock("@/lib/bns/api", () => bns);

import { useDisplayName } from "@/hooks/use-display-name";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// The Ark ID is the identity people hand out, so where the shell names the
// person it shows the name they bought. Only a verified .ark reverse record
// counts: an unverified one is not pointed at this wallet yet, and until the
// lookup answers, the profile name stands so the shell never renders blank.
describe("useDisplayName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.evmAddress = "0x0000000000000000000000000000000000000001";
  });

  it("shows the wallet's verified Ark ID in place of the profile name", async () => {
    bns.reverseResolveArkAddress.mockResolvedValue({ name: "signor.ark", verified: true });
    const { result } = renderHook(() => useDisplayName(), { wrapper });

    expect(result.current).toBe("Emmanuel Omemgboji");
    await waitFor(() => expect(result.current).toBe("signor.ark"));
    expect(bns.reverseResolveArkAddress).toHaveBeenCalledWith(session.evmAddress);
  });

  it("keeps the profile name for an unverified record", async () => {
    bns.reverseResolveArkAddress.mockResolvedValue({ name: "signor.ark", verified: false });
    const { result } = renderHook(() => useDisplayName(), { wrapper });

    await waitFor(() => expect(bns.reverseResolveArkAddress).toHaveBeenCalled());
    expect(result.current).toBe("Emmanuel Omemgboji");
  });

  it("keeps the profile name when the lookup fails", async () => {
    bns.reverseResolveArkAddress.mockRejectedValue(new Error("bns down"));
    const { result } = renderHook(() => useDisplayName(), { wrapper });

    await waitFor(() => expect(bns.reverseResolveArkAddress).toHaveBeenCalled());
    expect(result.current).toBe("Emmanuel Omemgboji");
  });

  it("asks nothing without a wallet", () => {
    session.evmAddress = null;
    const { result } = renderHook(() => useDisplayName(), { wrapper });

    expect(result.current).toBe("Emmanuel Omemgboji");
    expect(bns.reverseResolveArkAddress).not.toHaveBeenCalled();
  });
});
