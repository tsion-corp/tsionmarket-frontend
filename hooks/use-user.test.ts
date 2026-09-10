// @vitest-environment jsdom
// This suite renders, so it needs a DOM. vitest.config.ts puts .ts suites in
// the node project to avoid booting jsdom for the many that never touch it;
// the pragma above opts this one back in, per that config's own note.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { User } from "@privy-io/react-auth";

const mockUsePrivy = vi.fn();
const mockUseQuery = vi.fn();

vi.mock("@privy-io/react-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@privy-io/react-auth")>();
  return {
    ...actual,
    usePrivy: () => mockUsePrivy(),
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (options: unknown) => mockUseQuery(options),
  };
});

describe("useUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthenticated defaults when Privy is not authenticated", async () => {
    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: false,
      user: null,
    });
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    const { useUser } = await import("./use-user");
    const { result } = renderHook(() => useUser());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.evmAddress).toBeNull();
    expect(result.current.solanaAddress).toBeNull();
    expect(result.current.isDelegated).toBe(false);
    expect(result.current.profile.name).toBe("Account");
  });

  it("extracts wallet addresses, profile, and delegation status when authenticated", async () => {
    const mockUser = {
      id: "did:privy:user123",
      google: { email: "trader@worldstreet.com", name: "Alpha Trader" },
      linkedAccounts: [
        {
          type: "wallet",
          walletClientType: "privy",
          chainType: "ethereum",
          address: "0x1111111111111111111111111111111111111111",
          delegated: true,
        },
        {
          type: "wallet",
          walletClientType: "privy",
          chainType: "solana",
          address: "So11111111111111111111111111111111111111112",
          delegated: true,
        },
      ],
    } as unknown as User;

    mockUsePrivy.mockReturnValue({
      ready: true,
      authenticated: true,
      user: mockUser,
    });
    mockUseQuery.mockReturnValue({
      data: {
        userId: "did:privy:user123",
        sessionId: "session-1",
        user: { id: "did:privy:user123", wallets: [] },
      },
      isLoading: false,
      error: null,
    });

    const { useUser } = await import("./use-user");
    const { result } = renderHook(() => useUser());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.evmAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(result.current.solanaAddress).toBe("So11111111111111111111111111111111111111112");
    expect(result.current.isEvmDelegated).toBe(true);
    expect(result.current.isSolanaDelegated).toBe(true);
    expect(result.current.isDelegated).toBe(true);
    expect(result.current.profile.name).toBe("Alpha Trader");
    expect(result.current.profile.email).toBe("trader@worldstreet.com");
  });
});
