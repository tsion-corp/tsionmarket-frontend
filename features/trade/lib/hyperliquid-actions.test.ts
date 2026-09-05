import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { PendingWithdrawal } from "@/features/trade/lib/hyperliquid-types";

const api = vi.hoisted(() => ({
  prepareOrder: vi.fn(),
  submitOrder: vi.fn(),
  prepareLeverageUpdate: vi.fn(),
  submitLeverageUpdate: vi.fn(),
  prepareBridge: vi.fn(),
  confirmBridge: vi.fn(),
  prepareWithdrawal: vi.fn(),
  submitWithdrawal: vi.fn(),
  getPendingWithdrawal: vi.fn(async (): Promise<PendingWithdrawal | null> => null),
  prepareCancelOrder: vi.fn(),
  submitCancelOrder: vi.fn(),
  prepareClosePosition: vi.fn(),
  submitClosePosition: vi.fn(),
  prepareTriggerOrder: vi.fn(),
  submitTriggerOrder: vi.fn(),
  // Defaults to "unavailable" so tests that don't care about the
  // withdrawal's Arbitrum -> Base continuation never enter its poll loop at
  // all (see the `startingArbitrumBalance !== null` guard in withdraw()).
  // Tests exercising the continuation itself override this explicitly.
  getArbitrumBalance: vi.fn(async (): Promise<string> => {
    throw new Error("balance check unavailable");
  }),
  // Defaults to "already approved" so existing order tests exercise one
  // harmless extra status check without triggering the full approval flow.
  // Tests exercising the approval flow itself override this explicitly.
  getBuilderFeeStatus: vi.fn(async () => ({ approved: true, maxFeeRateTenthsBps: 100 })),
  prepareBuilderFeeApproval: vi.fn(),
  submitBuilderFeeApproval: vi.fn(),
}));
vi.mock("@/features/trade/lib/hyperliquid-api", () => api);

const signer = vi.hoisted(() => ({
  signL1: vi.fn(),
  signWithdrawal: vi.fn(),
  signBuilderFeeApproval: vi.fn(),
}));
vi.mock("@/features/trade/lib/hyperliquid-signer", () => ({
  useHyperliquidSigner: () => signer,
}));

const evmSend = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-evm-send", () => ({
  useEvmSend: () => evmSend,
}));

const reroutedWithdraw = vi.hoisted(() =>
  vi.fn(async () => ({
    depositRequestId: "req-1",
    txHash: "0xRerouteTx",
    amountOut: "5",
    minAmountOut: "4.9",
  }))
);
vi.mock("@/hooks/use-withdraw", () => ({
  useReroutedWithdraw: () => ({ withdraw: reroutedWithdraw, quoting: false, sending: false }),
}));

import { useHyperliquidActions } from "@/features/trade/lib/hyperliquid-actions";

const WALLET_ID = "wallet-1";
const ADDRESS = "0x000000000000000000000000000000000000aA";
const SIGNATURE = { r: "0xr", s: "0xs", v: 27 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useHyperliquidActions.placeOrder", () => {
  it("prepares, signs, then submits with the exact prepared payload", async () => {
    const prepared = {
      action: { type: "order" },
      nonce: 1,
      entryCloid: "0xc",
      takeProfitCloid: null,
      stopLossCloid: null,
    };
    api.prepareOrder.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);
    api.submitOrder.mockResolvedValue({
      entryOrder: { id: "order-1" },
      takeProfitOrder: null,
      stopLossOrder: null,
    });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.placeOrder({ assetSymbol: "BTC", side: "buy", size: "1" });

    expect(api.prepareOrder).toHaveBeenCalledWith({
      assetSymbol: "BTC",
      side: "buy",
      size: "1",
      walletId: WALLET_ID,
    });
    expect(signer.signL1).toHaveBeenCalledWith(prepared.action, prepared.nonce);
    expect(api.submitOrder).toHaveBeenCalledWith(WALLET_ID, prepared, SIGNATURE);
    expect(output.entryOrder.id).toBe("order-1");
  });

  it("throws without calling the API when the wallet is not ready", async () => {
    const { result } = renderHook(() => useHyperliquidActions(undefined, ADDRESS));

    await expect(
      result.current.placeOrder({ assetSymbol: "BTC", side: "buy", size: "1" })
    ).rejects.toThrow("Wallet is not ready");
    expect(api.prepareOrder).not.toHaveBeenCalled();
  });
});

describe("useHyperliquidActions.placeOrder — builder fee approval", () => {
  function mockOrderSubmission() {
    const prepared = {
      action: { type: "order" },
      nonce: 1,
      entryCloid: "0xc",
      takeProfitCloid: null,
      stopLossCloid: null,
    };
    api.prepareOrder.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);
    api.submitOrder.mockResolvedValue({
      entryOrder: { id: "order-1" },
      takeProfitOrder: null,
      stopLossOrder: null,
    });
  }

  it("checks approval status but signs nothing extra when already approved", async () => {
    const walletId = "wallet-already-approved";
    api.getBuilderFeeStatus.mockResolvedValue({ approved: true, maxFeeRateTenthsBps: 100 });
    mockOrderSubmission();

    const { result } = renderHook(() => useHyperliquidActions(walletId, ADDRESS));
    await result.current.placeOrder({ assetSymbol: "BTC", side: "buy", size: "1" });

    expect(api.getBuilderFeeStatus).toHaveBeenCalledWith(walletId);
    expect(api.prepareBuilderFeeApproval).not.toHaveBeenCalled();
    expect(signer.signBuilderFeeApproval).not.toHaveBeenCalled();
  });

  it("silently approves once, before the order, for a wallet that hasn't yet — then never re-checks", async () => {
    const walletId = "wallet-needs-approval";
    api.getBuilderFeeStatus.mockResolvedValue({ approved: false, maxFeeRateTenthsBps: 0 });
    const approvalPrepared = { action: { type: "approveBuilderFee" }, nonce: 2 };
    api.prepareBuilderFeeApproval.mockResolvedValue(approvalPrepared);
    signer.signBuilderFeeApproval.mockResolvedValue(SIGNATURE);
    api.submitBuilderFeeApproval.mockResolvedValue({ approved: true });
    mockOrderSubmission();

    const { result } = renderHook(() => useHyperliquidActions(walletId, ADDRESS));
    const output = await result.current.placeOrder({ assetSymbol: "BTC", side: "buy", size: "1" });

    expect(api.prepareBuilderFeeApproval).toHaveBeenCalledWith(walletId);
    expect(signer.signBuilderFeeApproval).toHaveBeenCalledWith(approvalPrepared.action);
    expect(api.submitBuilderFeeApproval).toHaveBeenCalledWith(
      walletId,
      approvalPrepared.action,
      SIGNATURE
    );
    expect(output.entryOrder.id).toBe("order-1");

    // A second order for the same wallet is cached — no re-check, no re-approval.
    await result.current.placeOrder({ assetSymbol: "ETH", side: "buy", size: "1" });
    expect(api.getBuilderFeeStatus).toHaveBeenCalledTimes(1);
    expect(api.prepareBuilderFeeApproval).toHaveBeenCalledTimes(1);
  });

  it("still places the order when the approval flow itself fails — revenue collection never blocks a trade", async () => {
    const walletId = "wallet-approval-check-fails";
    api.getBuilderFeeStatus.mockRejectedValue(new Error("network error"));
    mockOrderSubmission();

    const { result } = renderHook(() => useHyperliquidActions(walletId, ADDRESS));
    const output = await result.current.placeOrder({ assetSymbol: "BTC", side: "buy", size: "1" });

    expect(output.entryOrder.id).toBe("order-1");
  });
});

describe("useHyperliquidActions.updateLeverage", () => {
  it("signs and submits when the backend returns a real action to sign", async () => {
    const prepared = { action: { type: "updateLeverage" }, nonce: 2 };
    api.prepareLeverageUpdate.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.updateLeverage("BTC", 10, "cross");

    expect(signer.signL1).toHaveBeenCalledWith(prepared.action, prepared.nonce);
    expect(api.submitLeverageUpdate).toHaveBeenCalledWith(
      WALLET_ID,
      prepared.action,
      prepared.nonce,
      SIGNATURE
    );
  });

  it("short-circuits without signing when the setting is already correct", async () => {
    api.prepareLeverageUpdate.mockResolvedValue({ alreadySet: true });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.updateLeverage("BTC", 10, "cross");

    expect(signer.signL1).not.toHaveBeenCalled();
    expect(api.submitLeverageUpdate).not.toHaveBeenCalled();
  });
});

describe("useHyperliquidActions.bridge", () => {
  it("sends the sponsored transfer and confirms it, unconditionally — eager, not gated on existing margin", async () => {
    api.prepareBridge.mockResolvedValue({
      to: "0xUsdc",
      data: "0xdata",
      value: "0",
      amountUsdc: "10",
    });
    evmSend.mockResolvedValue("0xTxHash");

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.bridge();

    expect(api.prepareBridge).toHaveBeenCalledWith(WALLET_ID);
    expect(evmSend).toHaveBeenCalledWith({
      to: "0xUsdc",
      data: "0xdata",
      value: 0n,
      chainId: 42161,
      address: ADDRESS,
    });
    expect(api.confirmBridge).toHaveBeenCalledWith(WALLET_ID, "0xTxHash", "10");
  });

  it("propagates a rejection (e.g. below Hyperliquid's minimum deposit) rather than swallowing it", async () => {
    const belowMinimum = new Error("below minimum");
    api.prepareBridge.mockRejectedValue(belowMinimum);

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));

    await expect(result.current.bridge()).rejects.toBe(belowMinimum);
    expect(evmSend).not.toHaveBeenCalled();
    expect(api.confirmBridge).not.toHaveBeenCalled();
  });
});

describe("useHyperliquidActions.withdraw", () => {
  // mockResolvedValue (unlike the "Once" variants) is a persistent override
  // that outlives clearAllMocks, so re-arm the "unavailable" default before
  // every test here regardless of what an earlier test left behind.
  beforeEach(() => {
    api.getArbitrumBalance.mockImplementation(async (): Promise<string> => {
      throw new Error("balance check unavailable");
    });
  });

  it("prepares, signs, then submits the withdrawal", async () => {
    const prepared = { action: { type: "withdraw3" }, nonce: 3 };
    api.prepareWithdrawal.mockResolvedValue(prepared);
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.withdraw("5");

    expect(signer.signWithdrawal).toHaveBeenCalledWith(prepared.action);
    expect(api.submitWithdrawal).toHaveBeenCalledWith(WALLET_ID, prepared.action, SIGNATURE);
    expect(output.treasuryMovementId).toBe("movement-1");
  });

  it("continues the withdrawal on to the user's main wallet once the credit lands on Arbitrum, reporting progress", async () => {
    const prepared = { action: { type: "withdraw3" }, nonce: 3 };
    api.prepareWithdrawal.mockResolvedValue(prepared);
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });
    // First call is the pre-withdrawal starting balance; every call after
    // that (the poll) already sees it risen, so the loop exits on its very
    // first check with no real delay.
    api.getArbitrumBalance.mockResolvedValueOnce("10").mockResolvedValueOnce("15");
    const onStatus = vi.fn();

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.withdraw("5", onStatus);

    expect(reroutedWithdraw).toHaveBeenCalledWith({
      originNetwork: "arb-mainnet",
      originChainId: 42161,
      originTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      originDecimals: 6,
      destinationChainId: 8453,
      destinationAsset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      to: ADDRESS,
      amount: 5_000_000n,
      refundTo: ADDRESS,
    });
    expect(output.treasuryMovementId).toBe("movement-1");
    expect(onStatus.mock.calls.map((call) => call[0])).toEqual([
      "Withdrawing…",
      "Waiting for funds…",
      "Moving funds to your main wallet…",
    ]);
  });

  it("skips the continuation when the starting Arbitrum balance can't be read, without failing the withdrawal", async () => {
    const prepared = { action: { type: "withdraw3" }, nonce: 3 };
    api.prepareWithdrawal.mockResolvedValue(prepared);
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });
    // Default mock behavior: getArbitrumBalance always rejects.

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.withdraw("5");

    expect(reroutedWithdraw).not.toHaveBeenCalled();
    expect(output.treasuryMovementId).toBe("movement-1");
  });

  it("fails soft when the continuation itself fails — the withdrawal has already succeeded", async () => {
    const prepared = { action: { type: "withdraw3" }, nonce: 3 };
    api.prepareWithdrawal.mockResolvedValue(prepared);
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });
    api.getArbitrumBalance.mockResolvedValueOnce("10").mockResolvedValueOnce("15");
    reroutedWithdraw.mockRejectedValueOnce(new Error("quote failed"));

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.withdraw("5");

    expect(reroutedWithdraw).toHaveBeenCalled();
    expect(output.treasuryMovementId).toBe("movement-1");
  });
});

describe("useHyperliquidActions.resumeWithdrawal", () => {
  it("does nothing when the backend has no unresolved withdrawal for this wallet", async () => {
    api.getPendingWithdrawal.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.resumeWithdrawal();

    expect(api.getPendingWithdrawal).toHaveBeenCalledWith(WALLET_ID);
    expect(api.getArbitrumBalance).not.toHaveBeenCalled();
    expect(reroutedWithdraw).not.toHaveBeenCalled();
  });

  it("does nothing when a wallet or address isn't ready yet, without calling the backend", async () => {
    const { result } = renderHook(() => useHyperliquidActions(undefined, undefined));
    await result.current.resumeWithdrawal();

    expect(api.getPendingWithdrawal).not.toHaveBeenCalled();
  });

  it("does nothing when there's a pending withdrawal but the funds haven't actually landed on Arbitrum yet", async () => {
    api.getPendingWithdrawal.mockResolvedValueOnce({
      treasuryMovementId: "movement-1",
      amountUsdc: "18",
      status: "stuck",
    });
    api.getArbitrumBalance.mockResolvedValueOnce("0");

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.resumeWithdrawal();

    expect(reroutedWithdraw).not.toHaveBeenCalled();
  });

  it("forwards the full Arbitrum balance on to the user's main wallet when a withdrawal is stuck there", async () => {
    api.getPendingWithdrawal.mockResolvedValueOnce({
      treasuryMovementId: "movement-1",
      amountUsdc: "18",
      status: "stuck",
    });
    api.getArbitrumBalance.mockResolvedValueOnce("18");

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.resumeWithdrawal();

    expect(reroutedWithdraw).toHaveBeenCalledWith({
      originNetwork: "arb-mainnet",
      originChainId: 42161,
      originTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      originDecimals: 6,
      destinationChainId: 8453,
      destinationAsset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      to: ADDRESS,
      amount: 18_000_000n,
      refundTo: ADDRESS,
    });
  });

  it("fails soft when the backend lookup itself errors", async () => {
    api.getPendingWithdrawal.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));

    await expect(result.current.resumeWithdrawal()).resolves.toBeUndefined();
    expect(reroutedWithdraw).not.toHaveBeenCalled();
  });

  it("fails soft when forwarding the funds itself fails", async () => {
    api.getPendingWithdrawal.mockResolvedValueOnce({
      treasuryMovementId: "movement-1",
      amountUsdc: "18",
      status: "stuck",
    });
    api.getArbitrumBalance.mockResolvedValueOnce("18");
    reroutedWithdraw.mockRejectedValueOnce(new Error("quote failed"));

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));

    await expect(result.current.resumeWithdrawal()).resolves.toBeUndefined();
  });
});

describe("useHyperliquidActions.cancelOrder", () => {
  it("prepares, signs, then submits the cancel", async () => {
    const prepared = { action: { type: "cancel" }, nonce: 4, orderId: "order-1" };
    api.prepareCancelOrder.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);
    api.submitCancelOrder.mockResolvedValue({ id: "order-1", status: "cancelled" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.cancelOrder("order-1");

    expect(api.prepareCancelOrder).toHaveBeenCalledWith(WALLET_ID, "order-1");
    expect(signer.signL1).toHaveBeenCalledWith(prepared.action, prepared.nonce);
    expect(api.submitCancelOrder).toHaveBeenCalledWith(WALLET_ID, prepared, SIGNATURE);
    expect(output.status).toBe("cancelled");
  });

  it("throws without calling the API when the wallet is not ready", async () => {
    const { result } = renderHook(() => useHyperliquidActions(undefined, ADDRESS));

    await expect(result.current.cancelOrder("order-1")).rejects.toThrow("Wallet is not ready");
    expect(api.prepareCancelOrder).not.toHaveBeenCalled();
  });
});

describe("useHyperliquidActions.closePosition", () => {
  it("prepares, signs, then submits the close, with no sibling cleanup by default", async () => {
    const prepared = { action: { type: "order" }, nonce: 5, cloid: "0xc", positionId: "pos-1" };
    api.prepareClosePosition.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);
    api.submitClosePosition.mockResolvedValue({ closeOrder: { id: "order-2" } });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.closePosition("pos-1");

    expect(api.prepareClosePosition).toHaveBeenCalledWith(WALLET_ID, "pos-1");
    expect(api.submitClosePosition).toHaveBeenCalledWith(WALLET_ID, prepared, SIGNATURE);
    expect(api.prepareCancelOrder).not.toHaveBeenCalled();
    expect(output.id).toBe("order-2");
  });

  it("best-effort cancels leftover sibling TP/SL orders after a successful close", async () => {
    const prepared = { action: { type: "order" }, nonce: 5, cloid: "0xc", positionId: "pos-1" };
    api.prepareClosePosition.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);
    api.submitClosePosition.mockResolvedValue({ closeOrder: { id: "order-2" } });
    api.prepareCancelOrder.mockResolvedValue({
      action: { type: "cancel" },
      nonce: 6,
      orderId: "tp-order",
    });
    api.submitCancelOrder.mockResolvedValue({ id: "tp-order", status: "cancelled" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.closePosition("pos-1", ["tp-order"]);

    expect(api.prepareCancelOrder).toHaveBeenCalledWith(WALLET_ID, "tp-order");
  });

  it("does not let a failed sibling cancel undo the already-completed close", async () => {
    const prepared = { action: { type: "order" }, nonce: 5, cloid: "0xc", positionId: "pos-1" };
    api.prepareClosePosition.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);
    api.submitClosePosition.mockResolvedValue({ closeOrder: { id: "order-2" } });
    api.prepareCancelOrder.mockRejectedValue(new Error("already filled"));

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.closePosition("pos-1", ["tp-order"]);

    expect(output.id).toBe("order-2");
  });
});

describe("useHyperliquidActions.updateTriggerOrder", () => {
  it("adds a new trigger order without cancelling anything when none existed", async () => {
    const prepared = {
      action: { type: "order" },
      nonce: 7,
      cloid: "0xc",
      positionId: "pos-1",
      kind: "take_profit" as const,
    };
    api.prepareTriggerOrder.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);
    api.submitTriggerOrder.mockResolvedValue({ id: "order-3" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.updateTriggerOrder("pos-1", "take_profit", "60000");

    expect(api.prepareCancelOrder).not.toHaveBeenCalled();
    expect(api.prepareTriggerOrder).toHaveBeenCalledWith(
      WALLET_ID,
      "pos-1",
      "take_profit",
      "60000"
    );
    expect(output.id).toBe("order-3");
  });

  it("cancels the existing trigger order before placing the replacement", async () => {
    api.prepareCancelOrder.mockResolvedValue({
      action: { type: "cancel" },
      nonce: 6,
      orderId: "old-tp",
    });
    api.submitCancelOrder.mockResolvedValue({ id: "old-tp", status: "cancelled" });
    const prepared = {
      action: { type: "order" },
      nonce: 7,
      cloid: "0xc",
      positionId: "pos-1",
      kind: "take_profit" as const,
    };
    api.prepareTriggerOrder.mockResolvedValue(prepared);
    signer.signL1.mockResolvedValue(SIGNATURE);
    api.submitTriggerOrder.mockResolvedValue({ id: "order-4" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.updateTriggerOrder("pos-1", "take_profit", "61000", "old-tp");

    expect(api.prepareCancelOrder).toHaveBeenCalledWith(WALLET_ID, "old-tp");
    expect(api.prepareTriggerOrder).toHaveBeenCalledWith(
      WALLET_ID,
      "pos-1",
      "take_profit",
      "61000"
    );
  });

  it("propagates a failed cancel instead of placing a second trigger on top of a live one", async () => {
    api.prepareCancelOrder.mockRejectedValue(new Error("already filled"));

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));

    await expect(
      result.current.updateTriggerOrder("pos-1", "take_profit", "61000", "old-tp")
    ).rejects.toThrow("already filled");
    expect(api.prepareTriggerOrder).not.toHaveBeenCalled();
  });
});
