import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Hoisted so the vi.mock factories (which run before top-level consts) can see them.
const { sendSponsoredBaseCalls, sendTransaction, signAuthorization } = vi.hoisted(() => ({
  sendSponsoredBaseCalls: vi.fn(async () => "0xsponsoredhash"),
  sendTransaction: vi.fn(async () => ({ hash: "0xnormalhash" })),
  signAuthorization: vi.fn(),
}));

vi.mock("@/lib/trade/base-sponsor", () => ({ sendSponsoredBaseCalls }));
vi.mock("@privy-io/react-auth", () => ({
  useSendTransaction: () => ({ sendTransaction }),
  useSign7702Authorization: () => ({ signAuthorization }),
  useWallets: () => ({
    wallets: [
      {
        walletClientType: "privy",
        address: "0xUser",
        getEthereumProvider: async () => ({}),
      },
    ],
  }),
  getAccessToken: async () => "access-token",
}));

import { useEvmSend } from "@/hooks/use-evm-send";

const BASE = 8453;
const ARBITRUM = 42161;

describe("useEvmSend routing", () => {
  beforeEach(() => {
    sendSponsoredBaseCalls.mockClear();
    sendTransaction.mockClear();
  });

  it("routes Base transactions through the gasless sponsored path", async () => {
    const { result } = renderHook(() => useEvmSend());
    const hash = await result.current({ to: "0xdead", data: "0xbeef", chainId: BASE });
    expect(sendSponsoredBaseCalls).toHaveBeenCalledOnce();
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(hash).toBe("0xsponsoredhash");
  });

  it("routes non-Base transactions through the normal EOA send", async () => {
    const { result } = renderHook(() => useEvmSend());
    const hash = await result.current({ to: "0xdead", data: "0xbeef", chainId: ARBITRUM });
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(sendSponsoredBaseCalls).not.toHaveBeenCalled();
    expect(hash).toBe("0xnormalhash");
  });

  it("forwards the exact call (to/data/value) into the sponsored path on Base", async () => {
    const { result } = renderHook(() => useEvmSend());
    await result.current({ to: "0xrouter", data: "0x1234", value: 5n, chainId: BASE });
    expect(sendSponsoredBaseCalls).toHaveBeenCalledWith(
      expect.objectContaining({ calls: [{ to: "0xrouter", data: "0x1234", value: 5n }] })
    );
  });

  it("passes the gas-limit hint through on the non-Base path", async () => {
    const { result } = renderHook(() => useEvmSend());
    await result.current({ to: "0xrouter", chainId: ARBITRUM, gasLimit: 21000n });
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ gasLimit: 21000n, chainId: ARBITRUM }),
      undefined
    );
  });
});
