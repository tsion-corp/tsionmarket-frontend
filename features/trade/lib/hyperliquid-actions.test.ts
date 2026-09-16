// @vitest-environment jsdom
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
  getAccountState: vi.fn(),
  getCctpDepositConfig: vi.fn(),
  recordCctpDeposit: vi.fn(),
  getCctpDepositStatus: vi.fn(),
}));
vi.mock("@/features/trade/lib/hyperliquid-api", () => api);

const signer = vi.hoisted(() => ({
  signL1: vi.fn(),
  signWithdrawal: vi.fn(),
  signDexTransfer: vi.fn(),
  signBuilderFeeApproval: vi.fn(),
}));
vi.mock("@/features/trade/lib/hyperliquid-signer", () => ({
  useHyperliquidSigner: () => signer,
}));

const evmSend = vi.hoisted(() => vi.fn());
const evmSendBatch = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-evm-send", () => ({
  useEvmSend: () => evmSend,
  useEvmSendBatch: () => evmSendBatch,
}));

// The CCTP moves themselves are pinned at their calldata in
// cctp-transfers.test.ts; here they are the seam the actions drive.
type Transfers = typeof import("@/features/trade/lib/cctp-transfers");
const transfers = vi.hoisted(() => ({
  burnBaseUsdcToPerps: vi.fn<Transfers["burnBaseUsdcToPerps"]>(),
  sendArbitrumUsdcToBase: vi.fn<Transfers["sendArbitrumUsdcToBase"]>(),
}));
vi.mock("@/features/trade/lib/cctp-transfers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/trade/lib/cctp-transfers")>()),
  ...transfers,
}));
vi.mock("@/features/trade/lib/cctp-api", () => ({
  getCctpFeeQuote: vi.fn(),
  lookupCctpAttestation: vi.fn(),
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
    transfers.sendArbitrumUsdcToBase.mockImplementation(async () => {});
  });

  const WITHDRAW3 = { type: "withdraw3" };
  const FEE_ACTION = { type: "sendAsset" };
  const FEE_SIGNATURE = { r: "0xfr", s: "0xfs", v: 28 };

  // llms.txt §6b: the typed amount is the TOTAL. The withdraw3 carries the
  // total less the platform fee, and the fee travels as its own signed leg.
  it("prepares the total less the platform fee, signs both legs and submits the fee with it", async () => {
    api.prepareWithdrawal.mockResolvedValue({
      withdraw: { action: WITHDRAW3, nonce: 3 },
      fee: { action: FEE_ACTION, nonce: 4, amountUsdc: "0.5" },
    });
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    signer.signDexTransfer.mockResolvedValue(FEE_SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.withdraw("100");

    expect(api.prepareWithdrawal).toHaveBeenCalledTimes(1);
    expect(api.prepareWithdrawal).toHaveBeenCalledWith(WALLET_ID, "99.5");
    expect(signer.signWithdrawal).toHaveBeenCalledWith(WITHDRAW3);
    expect(signer.signDexTransfer).toHaveBeenCalledWith(FEE_ACTION);
    expect(api.submitWithdrawal).toHaveBeenCalledWith(WALLET_ID, WITHDRAW3, SIGNATURE, {
      action: FEE_ACTION,
      signature: FEE_SIGNATURE,
    });
    expect(output.treasuryMovementId).toBe("movement-1");
  });

  it("prepares again with the backend's own fee when it differs, before signing anything", async () => {
    api.prepareWithdrawal
      .mockResolvedValueOnce({
        withdraw: { action: { type: "withdraw3", stale: true }, nonce: 3 },
        fee: { action: FEE_ACTION, nonce: 4, amountUsdc: "0.75" },
      })
      .mockResolvedValueOnce({
        withdraw: { action: WITHDRAW3, nonce: 5 },
        fee: { action: FEE_ACTION, nonce: 6, amountUsdc: "0.75" },
      });
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    signer.signDexTransfer.mockResolvedValue(FEE_SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.withdraw("100");

    expect(api.prepareWithdrawal.mock.calls).toEqual([
      [WALLET_ID, "99.5"],
      [WALLET_ID, "99.25"],
    ]);
    expect(signer.signWithdrawal).toHaveBeenCalledTimes(1);
    expect(signer.signWithdrawal).toHaveBeenCalledWith(WITHDRAW3);
  });

  it("withdraws the whole total with no fee leg when the backend has no fee configured", async () => {
    api.prepareWithdrawal
      .mockResolvedValueOnce({ withdraw: { action: { stale: true }, nonce: 3 }, fee: null })
      .mockResolvedValueOnce({ withdraw: { action: WITHDRAW3, nonce: 5 }, fee: null });
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.withdraw("20");

    expect(api.prepareWithdrawal.mock.calls).toEqual([
      [WALLET_ID, "19.5"],
      [WALLET_ID, "20"],
    ]);
    expect(signer.signDexTransfer).not.toHaveBeenCalled();
    expect(api.submitWithdrawal).toHaveBeenCalledWith(WALLET_ID, WITHDRAW3, SIGNATURE, null);
  });

  it("refuses a total that would leave nothing to receive, before preparing anything", async () => {
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await expect(result.current.withdraw("1.5")).rejects.toThrow(/minimum/i);
    expect(api.prepareWithdrawal).not.toHaveBeenCalled();
  });

  it("continues the credited amount home to Base over CCTP, reporting each step", async () => {
    api.prepareWithdrawal.mockResolvedValue({
      withdraw: { action: WITHDRAW3, nonce: 3 },
      fee: { action: FEE_ACTION, nonce: 4, amountUsdc: "0.5" },
    });
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    signer.signDexTransfer.mockResolvedValue(FEE_SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });
    // The starting balance, then the poll already sees the credit.
    api.getArbitrumBalance.mockResolvedValueOnce("10").mockResolvedValueOnce("15");
    transfers.sendArbitrumUsdcToBase.mockImplementation(async (_deps, opts) => {
      opts.onStatus?.("moving");
      opts.onStatus?.("confirming");
      opts.onStatus?.("finishing");
    });
    const onStatus = vi.fn();

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.withdraw("6", onStatus);

    expect(transfers.sendArbitrumUsdcToBase).toHaveBeenCalledWith(
      expect.objectContaining({
        sendBatch: evmSendBatch,
      }),
      expect.objectContaining({ amount: 5_000_000n, recipient: ADDRESS })
    );
    expect(onStatus.mock.calls.map((call) => call[0])).toEqual([
      "withdrawing",
      "waiting",
      "moving",
      "confirming",
      "finishing",
    ]);
  });

  it("skips the continuation when the starting Arbitrum balance can't be read, without failing the withdrawal", async () => {
    api.prepareWithdrawal.mockResolvedValue({
      withdraw: { action: WITHDRAW3, nonce: 3 },
      fee: { action: FEE_ACTION, nonce: 4, amountUsdc: "0.5" },
    });
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    signer.signDexTransfer.mockResolvedValue(FEE_SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.withdraw("6");

    expect(transfers.sendArbitrumUsdcToBase).not.toHaveBeenCalled();
    expect(output.treasuryMovementId).toBe("movement-1");
  });

  it("does not fail an already accepted withdrawal when the last leg fails, and says so in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    api.prepareWithdrawal.mockResolvedValue({
      withdraw: { action: WITHDRAW3, nonce: 3 },
      fee: { action: FEE_ACTION, nonce: 4, amountUsdc: "0.5" },
    });
    signer.signWithdrawal.mockResolvedValue(SIGNATURE);
    signer.signDexTransfer.mockResolvedValue(FEE_SIGNATURE);
    api.submitWithdrawal.mockResolvedValue({ treasuryMovementId: "movement-1" });
    api.getArbitrumBalance.mockResolvedValueOnce("10").mockResolvedValueOnce("15");
    transfers.sendArbitrumUsdcToBase.mockRejectedValueOnce(new Error("attestation timed out"));

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const output = await result.current.withdraw("6");

    expect(output.treasuryMovementId).toBe("movement-1");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("useHyperliquidActions.resumeWithdrawal", () => {
  beforeEach(() => {
    transfers.sendArbitrumUsdcToBase.mockImplementation(async () => {});
  });

  it("does nothing when the backend has no unresolved withdrawal for this wallet", async () => {
    api.getPendingWithdrawal.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.resumeWithdrawal();

    expect(api.getPendingWithdrawal).toHaveBeenCalledWith(WALLET_ID);
    expect(api.getArbitrumBalance).not.toHaveBeenCalled();
    expect(transfers.sendArbitrumUsdcToBase).not.toHaveBeenCalled();
  });

  it("does nothing when a wallet or address isn't ready yet, without calling the backend", async () => {
    const { result } = renderHook(() => useHyperliquidActions(undefined, undefined));
    await result.current.resumeWithdrawal();

    expect(api.getPendingWithdrawal).not.toHaveBeenCalled();
  });

  it("does nothing when there's a pending withdrawal but the funds haven't landed on Arbitrum yet", async () => {
    api.getPendingWithdrawal.mockResolvedValueOnce({
      treasuryMovementId: "movement-1",
      amountUsdc: "18",
      status: "stuck",
    });
    api.getArbitrumBalance.mockResolvedValueOnce("0");

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.resumeWithdrawal();

    expect(transfers.sendArbitrumUsdcToBase).not.toHaveBeenCalled();
  });

  it("sends the whole Arbitrum balance home to Base over CCTP when a withdrawal is stuck there", async () => {
    api.getPendingWithdrawal.mockResolvedValueOnce({
      treasuryMovementId: "movement-1",
      amountUsdc: "18",
      status: "stuck",
    });
    api.getArbitrumBalance.mockResolvedValueOnce("18");

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.resumeWithdrawal();

    expect(transfers.sendArbitrumUsdcToBase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 18_000_000n, recipient: ADDRESS })
    );
  });

  it("does not interrupt a page load when the lookup fails, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    api.getPendingWithdrawal.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));

    await expect(result.current.resumeWithdrawal()).resolves.toBeUndefined();
    expect(transfers.sendArbitrumUsdcToBase).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not interrupt a page load when forwarding fails, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    api.getPendingWithdrawal.mockResolvedValueOnce({
      treasuryMovementId: "movement-1",
      amountUsdc: "18",
      status: "stuck",
    });
    api.getArbitrumBalance.mockResolvedValueOnce("18");
    transfers.sendArbitrumUsdcToBase.mockRejectedValueOnce(new Error("fee unavailable"));

    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));

    await expect(result.current.resumeWithdrawal()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// llms.txt §6a: config, then the Base burn, then record, then poll the burn's
// status until confirmed. The burn is the point of no return, so everything
// after it reports what happened rather than failing.
describe("useHyperliquidActions.depositToPerps", () => {
  const BURN = `0x${"b1".repeat(32)}` as const;
  const FAST = { recordRetryDelaysMs: [1, 1], statusIntervalMs: 1, statusTimeoutMs: 50 };

  beforeEach(() => {
    api.getCctpDepositConfig.mockResolvedValue({ userPaysDepositFee: false, sourceDomain: 6 });
    api.getAccountState.mockResolvedValue({ withdrawable: "10" });
    api.recordCctpDeposit.mockResolvedValue({ treasuryMovementId: "movement-9" });
    api.getCctpDepositStatus.mockResolvedValue({
      treasuryMovementId: "movement-9",
      amountUsdc: "25",
      status: "confirmed",
      burnTxHash: BURN,
      mintTxHash: "0xmint",
    });
    transfers.burnBaseUsdcToPerps.mockResolvedValue(BURN);
  });

  it("burns the exact amount for this wallet, records the burn, and reports the credit", async () => {
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const outcome = await result.current.depositToPerps("25", undefined, FAST);

    expect(transfers.burnBaseUsdcToPerps).toHaveBeenCalledWith(
      expect.objectContaining({ sendBatch: evmSendBatch }),
      { amount: 25_000_000n, recipient: ADDRESS, userPaysForward: false }
    );
    expect(api.recordCctpDeposit).toHaveBeenCalledWith(WALLET_ID, BURN, "25");
    expect(api.getCctpDepositStatus).toHaveBeenCalledWith(BURN);
    expect(outcome).toEqual({ kind: "credited", burnTxHash: BURN });
  });

  it("has Circle relay the mint when the backend says the user pays for it", async () => {
    api.getCctpDepositConfig.mockResolvedValue({ userPaysDepositFee: true, sourceDomain: 6 });
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.depositToPerps("25", undefined, FAST);
    expect(transfers.burnBaseUsdcToPerps).toHaveBeenCalledWith(expect.anything(), {
      amount: 25_000_000n,
      recipient: ADDRESS,
      userPaysForward: true,
    });
  });

  it("burns nothing when the deposit config cannot be read", async () => {
    api.getCctpDepositConfig.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await expect(result.current.depositToPerps("25", undefined, FAST)).rejects.toThrow("down");
    expect(transfers.burnBaseUsdcToPerps).not.toHaveBeenCalled();
  });

  it("retries the record, and reports a burn the backend never heard about", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    api.recordCctpDeposit.mockRejectedValue(new Error("gateway timeout"));
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const outcome = await result.current.depositToPerps("25", undefined, FAST);

    expect(api.recordCctpDeposit).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ kind: "recordFailed", burnTxHash: BURN });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("counts a rising perps balance as the credit, even before the status says so", async () => {
    api.getCctpDepositStatus.mockResolvedValue(null);
    api.getAccountState
      .mockResolvedValueOnce({ withdrawable: "10" })
      .mockResolvedValue({ withdrawable: "34.9" });
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const outcome = await result.current.depositToPerps("25", undefined, FAST);
    expect(outcome).toEqual({ kind: "credited", burnTxHash: BURN });
  });

  it("reports a deposit the backend marks failed or stuck, with the burn to trace it by", async () => {
    api.getCctpDepositStatus.mockResolvedValue({
      treasuryMovementId: "movement-9",
      amountUsdc: "25",
      status: "stuck",
      burnTxHash: BURN,
      mintTxHash: null,
    });
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const outcome = await result.current.depositToPerps("25", undefined, FAST);
    expect(outcome).toEqual({ kind: "failed", burnTxHash: BURN, status: "stuck" });
  });

  it("reports a deposit still on its way when the wait runs out, never an error", async () => {
    api.getCctpDepositStatus.mockResolvedValue({
      treasuryMovementId: "movement-9",
      amountUsdc: "25",
      status: "pending",
      burnTxHash: BURN,
      mintTxHash: null,
    });
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    const outcome = await result.current.depositToPerps("25", undefined, FAST);
    expect(outcome).toEqual({ kind: "pending", burnTxHash: BURN });
  });

  it("reports each stage as it goes", async () => {
    const onStage = vi.fn();
    const { result } = renderHook(() => useHyperliquidActions(WALLET_ID, ADDRESS));
    await result.current.depositToPerps("25", onStage, FAST);
    expect(onStage.mock.calls.map((call) => call[0])).toEqual([
      "sending",
      "recording",
      "confirming",
    ]);
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
