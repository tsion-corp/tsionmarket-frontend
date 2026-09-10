// @vitest-environment jsdom
// This suite renders, so it needs a DOM. vitest.config.ts puts .ts suites in
// the node project to avoid booting jsdom for the many that never touch it;
// the pragma above opts this one back in, per that config's own note.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { User } from "@privy-io/react-auth";

const mockCreateEthereumWallet = vi.fn();
const mockCreateSolanaWallet = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  useCreateWallet: () => ({ createWallet: mockCreateEthereumWallet }),
}));

vi.mock("@privy-io/react-auth/solana", () => ({
  useCreateWallet: () => ({ createWallet: mockCreateSolanaWallet }),
}));

describe("useEnsureWallets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provisions missing wallets", async () => {
    const { useEnsureWallets } = await import("./use-ensure-wallets");
    const userWithoutWallets = {
      id: "did:privy:user1",
      linkedAccounts: [],
    } as unknown as User;

    mockCreateEthereumWallet.mockResolvedValue({
      address: "0x1111111111111111111111111111111111111111",
      chainType: "ethereum",
    });
    mockCreateSolanaWallet.mockResolvedValue({
      wallet: {
        address: "So11111111111111111111111111111111111111112",
        chainType: "solana",
      },
    });

    const { result } = renderHook(() => useEnsureWallets());
    await result.current(userWithoutWallets);

    expect(mockCreateEthereumWallet).toHaveBeenCalledTimes(1);
    expect(mockCreateSolanaWallet).toHaveBeenCalledTimes(1);
  });

  it("does not create wallets if already present", async () => {
    const { useEnsureWallets } = await import("./use-ensure-wallets");
    const userWithWallets = {
      id: "did:privy:user2",
      linkedAccounts: [
        {
          type: "wallet",
          walletClientType: "privy",
          chainType: "ethereum",
          address: "0x2222222222222222222222222222222222222222",
        },
        {
          type: "wallet",
          walletClientType: "privy",
          chainType: "solana",
          address: "So22222222222222222222222222222222222222222",
        },
      ],
    } as unknown as User;

    const { result } = renderHook(() => useEnsureWallets());
    await result.current(userWithWallets);

    expect(mockCreateEthereumWallet).not.toHaveBeenCalled();
    expect(mockCreateSolanaWallet).not.toHaveBeenCalled();
  });
});
