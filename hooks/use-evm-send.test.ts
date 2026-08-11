import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Hoisted so the vi.mock factories (which run before top-level consts) can see them.
const { sendSponsoredEvmCalls, sendTransaction, signAuthorization } = vi.hoisted(() => ({
  sendSponsoredEvmCalls: vi.fn(async () => "0xsponsoredhash"),
  sendTransaction: vi.fn(async () => ({ hash: "0xnormalhash" })),
  signAuthorization: vi.fn(),
}));

vi.mock("@/lib/trade/sponsor", () => ({ sendSponsoredEvmCalls }));
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
const ROBINHOOD = 4663;
const ZKSYNC = 324;

describe("useEvmSend routing", () => {
  beforeEach(() => {
    sendSponsoredEvmCalls.mockClear();
    sendTransaction.mockClear();
  });

  it("routes Base transactions through the gasless sponsored path", async () => {
    const { result } = renderHook(() => useEvmSend());
    const hash = await result.current({ to: "0xdead", data: "0xbeef", chainId: BASE });
    expect(sendSponsoredEvmCalls).toHaveBeenCalledOnce();
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(hash).toBe("0xsponsoredhash");
  });

  it("routes other sponsored EVM chains through the same sponsored path", async () => {
    const { result } = renderHook(() => useEvmSend());
    const hash = await result.current({ to: "0xdead", data: "0xbeef", chainId: ARBITRUM });
    expect(sendSponsoredEvmCalls).toHaveBeenCalledOnce();
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(hash).toBe("0xsponsoredhash");
  });

  it("routes newly added sponsored chains through the same sponsored path", async () => {
    const { result } = renderHook(() => useEvmSend());
    const hash = await result.current({ to: "0xdead", data: "0xbeef", chainId: ROBINHOOD });
    expect(sendSponsoredEvmCalls).toHaveBeenCalledOnce();
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(hash).toBe("0xsponsoredhash");
  });

  it("routes unsupported EVM chains through the normal EOA send", async () => {
    const { result } = renderHook(() => useEvmSend());
    const hash = await result.current({ to: "0xdead", data: "0xbeef", chainId: ZKSYNC });
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(sendSponsoredEvmCalls).not.toHaveBeenCalled();
    expect(hash).toBe("0xnormalhash");
  });

  it("forwards the exact call (to/data/value) into the sponsored path", async () => {
    const { result } = renderHook(() => useEvmSend());
    await result.current({ to: "0xrouter", data: "0x1234", value: 5n, chainId: BASE });
    expect(sendSponsoredEvmCalls).toHaveBeenCalledWith(
      expect.objectContaining({ calls: [{ to: "0xrouter", data: "0x1234", value: 5n }] })
    );
  });

  it("passes the gas-limit hint through on the unsupported-chain path", async () => {
    const { result } = renderHook(() => useEvmSend());
    await result.current({ to: "0xrouter", chainId: ZKSYNC, gasLimit: 21000n });
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ gasLimit: 21000n, chainId: ZKSYNC }),
      undefined
    );
  });
});
