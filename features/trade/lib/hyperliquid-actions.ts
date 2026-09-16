"use client";

import { useCallback, useMemo } from "react";
import type { Address } from "viem";
import { useEvmSend, useEvmSendBatch } from "@/hooks/use-evm-send";
import { getCctpFeeQuote, lookupCctpAttestation } from "@/features/trade/lib/cctp-api";
import {
  burnBaseUsdcToPerps,
  sendArbitrumUsdcToBase,
  type ArbitrumToBaseStep,
  type CctpTransferDeps,
} from "@/features/trade/lib/cctp-transfers";
import { useHyperliquidSigner } from "@/features/trade/lib/hyperliquid-signer";
import {
  PERPS_PLATFORM_WITHDRAWAL_FEE_USDC,
  planWithdrawal,
} from "@/features/trade/lib/perps-withdrawal";
import {
  confirmBridge,
  getAbstractionModeStatus,
  getAccountState,
  getArbitrumBalance,
  getBuilderFeeStatus,
  getCctpDepositConfig,
  getCctpDepositStatus,
  getPendingWithdrawal,
  prepareAbstractionMode,
  prepareBridge,
  prepareBuilderFeeApproval,
  prepareCancelOrder,
  prepareDexTransfer,
  prepareClosePosition,
  prepareLeverageUpdate,
  prepareOrder,
  prepareTriggerOrder,
  prepareWithdrawal,
  recordCctpDeposit,
  submitAbstractionMode,
  submitBuilderFeeApproval,
  submitCancelOrder,
  submitDexTransfer,
  submitClosePosition,
  submitLeverageUpdate,
  submitOrder,
  submitTriggerOrder,
  submitWithdrawal,
} from "@/features/trade/lib/hyperliquid-api";
import {
  isInsufficientMarginDetails,
  type CctpDepositMovementStatus,
  type HlAbstractionModeStatus,
  type HlMarginMode,
  type HlOrderRow,
  type HlTriggerKind,
  type PlaceOrderRequest,
  type PlaceOrderResult,
} from "@/features/trade/lib/hyperliquid-types";
import type { GatewayApiError } from "@/lib/api/envelope";
import { SETTLE_CHAINS } from "@/lib/deposit";
import { toBaseUnits } from "@/lib/trade/math";

// Hyperliquid's own bridge contract lives on Arbitrum One; this is the only
// action in the whole Hyperliquid flow that is a real EVM transaction (every
// other action is an off-chain signed message, see hyperliquid-signer.ts).
const ARBITRUM_CHAIN_ID = 42161;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Matches the backend's own ARK_BRIDGE_CONFIRMATION_TIMEOUT_MS default — a
// bridge deposit typically shows up in clearinghouseState in under a minute.
const MARGIN_POLL_TIMEOUT_MS = 120_000;
const MARGIN_POLL_INTERVAL_MS = 4_000;
// Withdrawals settle slower than deposits in practice (matches the backend's
// own ARK_WITHDRAWAL_CONFIRMATION_TIMEOUT_MS) — a shorter shared timeout here
// would give up on a withdrawal that's still genuinely in flight.
const WITHDRAWAL_POLL_TIMEOUT_MS = 240_000;
const USDC_DECIMALS = 6;

/** What a withdrawal is doing, for the modal to put into words. */
export type WithdrawStep = "withdrawing" | "waiting" | ArbitrumToBaseStep;

/** What a top-up is doing, for the modal to put into words. */
export type DepositStage = "sending" | "recording" | "confirming";

/**
 * How a top-up ended, once the Base burn has happened. The burn is the point of
 * no return, so none of these is an error: each tells the modal what to say,
 * and every one carries the burn hash to trace the deposit by.
 */
export type DepositOutcome =
  | { kind: "credited"; burnTxHash: string }
  | { kind: "pending"; burnTxHash: string }
  | { kind: "recordFailed"; burnTxHash: string }
  | {
      kind: "failed";
      burnTxHash: string;
      status: Exclude<CctpDepositMovementStatus, "pending" | "confirmed">;
    };

export interface DepositTiming {
  /** Waits between attempts to record the burn; attempts = length + 1. */
  recordRetryDelaysMs: number[];
  statusIntervalMs: number;
  statusTimeoutMs: number;
}

// Recording is what tells the backend to relay a platform-paid mint, so it is
// worth a few tries. The credit typically lands in under a minute; three
// minutes only bounds the wait, it never fails the deposit.
const DEFAULT_DEPOSIT_TIMING: DepositTiming = {
  recordRetryDelaysMs: [1_000, 3_000],
  statusIntervalMs: 3_000,
  statusTimeoutMs: 180_000,
};

// Wallets confirmed to have approved the platform's builder fee (see
// ensureBuilderFeeApproved below) — module-scoped so it's checked at most
// once per wallet per page load, not on every single order.
const builderFeeApprovedWallets = new Set<string>();

/**
 * The write side of the Hyperliquid integration: each method is a complete
 * prepare -> sign -> submit round trip. Every signature is produced by the
 * user's own embedded wallet (useHyperliquidSigner / useEvmSend) — this hook
 * never touches a private key, it only orchestrates calls that already do
 * their own signing silently. See apps/perp/src/signing/README.md.
 */
export function useHyperliquidActions(walletId: string | undefined, address: string | undefined) {
  const {
    signL1,
    signWithdrawal,
    signDexTransfer,
    signBuilderFeeApproval,
    signSetAbstractionMode,
  } = useHyperliquidSigner(address);
  const evmSend = useEvmSend();
  const evmSendBatch = useEvmSendBatch();
  // The CCTP transfers (cctp-transfers.ts) run on the user's sponsored wallet
  // batch and reach Circle only through the app's /api/cctp proxy.
  const cctpDeps = useMemo<CctpTransferDeps>(
    () => ({
      sendBatch: evmSendBatch,
      feeQuote: getCctpFeeQuote,
      lookupAttestation: lookupCctpAttestation,
    }),
    [evmSendBatch]
  );

  // Bridges the wallet's full Arbitrum USDC balance to HyperCore — eager, not
  // deferred (see BridgeService on the backend): the only caller is the
  // funding flow, right after a deposit lands on Arbitrum, so this always
  // has something to bridge. Throws when Arbitrum's balance is below
  // Hyperliquid's own minimum deposit floor — a real, temporary block, not
  // something retrying fixes (see hyperliquid-types.ts's
  // isBridgeMinimumDetails) — or on any other failure; the caller decides
  // how to present that.
  const bridge = useCallback(async (): Promise<void> => {
    if (!walletId || !address) throw new Error("Wallet is not ready yet.");
    const prepared = await prepareBridge(walletId);
    const txHash = await evmSend({
      to: prepared.to as `0x${string}`,
      data: prepared.data as `0x${string}`,
      value: BigInt(prepared.value),
      chainId: ARBITRUM_CHAIN_ID,
      address,
    });
    await confirmBridge(walletId, txHash, prepared.amountUsdc);
  }, [walletId, address, evmSend]);

  // Grants the platform treasury permission to attach its builder fee to
  // this wallet's orders (TradingService.prepareOrder skips the fee
  // entirely for any wallet that hasn't — Hyperliquid rejects the WHOLE
  // order otherwise, it doesn't just fill fee-free). One-time and silent,
  // same embedded-wallet signing as everything else here. Best-effort: a
  // failed or skipped approval only costs platform revenue on this trade,
  // never blocks it — trading must keep working with or without it.
  const ensureBuilderFeeApproved = useCallback(
    async (id: string): Promise<void> => {
      if (builderFeeApprovedWallets.has(id)) return;
      try {
        const status = await getBuilderFeeStatus(id);
        if (status.approved) {
          builderFeeApprovedWallets.add(id);
          return;
        }
        const prepared = await prepareBuilderFeeApproval(id);
        const signature = await signBuilderFeeApproval(prepared.action);
        await submitBuilderFeeApproval(id, prepared.action, signature);
        builderFeeApprovedWallets.add(id);
      } catch (error) {
        // See doc comment — never let this block a trade. Still surfaced,
        // though (warn, not error — Next's dev overlay treats console.error
        // as a crash, and this is an expected, non-blocking condition until
        // the treasury wallet is funded on Hyperliquid): a silently-failing
        // approval means zero platform revenue on every trade this wallet
        // places until it succeeds.
        console.warn("Builder fee approval failed — trading without it this time", error);
      }
    },
    [signBuilderFeeApproval]
  );

  // The prepare -> sign -> submit round trip alone, reused for both the
  // first attempt and the post-bridge retry below.
  const submitPreparedOrder = useCallback(
    async (id: string, request: Omit<PlaceOrderRequest, "walletId">): Promise<PlaceOrderResult> => {
      await ensureBuilderFeeApproved(id);
      const prepared = await prepareOrder({ ...request, walletId: id });
      const signature = await signL1(prepared.action, prepared.nonce);
      return submitOrder(id, prepared, signature);
    },
    [signL1, ensureBuilderFeeApproved]
  );

  // `onStatus` exists purely so the UI can show something better than a
  // static "working" spinner during the up-to-two-minute auto-bridge path
  // below — it's cosmetic, never affects control flow.
  const placeOrder = useCallback(
    async (
      request: Omit<PlaceOrderRequest, "walletId">,
      onStatus?: (status: string) => void
    ): Promise<PlaceOrderResult> => {
      if (!walletId) throw new Error("Wallet is not ready yet.");
      try {
        return await submitPreparedOrder(walletId, request);
      } catch (error) {
        const details = (error as GatewayApiError)?.details;
        if (!isInsufficientMarginDetails(details) || !address) throw error;
        // A HIP-3 asset's shortfall lives on ITS dex's own balance —
        // Hyperliquid margins each builder dex as a separate account, so the
        // fix is a native -> dex transfer (instant, off-chain, no gas), and
        // an Arbitrum bridge would not help at all (observed live: plenty of
        // native margin, $0 on xyz, and the bridge path surfaced a baffling
        // "Insufficient Arbitrum balance" instead).
        if (details.dex) {
          const native = await getAccountState(address);
          const needed = Number(details.requiredUsdc);
          if (Number(native.withdrawable) < needed) {
            // Not enough anywhere — surface the honest original error.
            throw error;
          }
          onStatus?.("Moving margin to this market's balance…");
          // Small headroom over the exact requirement so fees/price drift
          // between prepare calls don't force a second round trip.
          const amount = Math.min(
            Number(native.withdrawable),
            Math.ceil(needed * 1.02 * 100) / 100
          ).toFixed(2);
          const prepared = await prepareDexTransfer(walletId, details.dex, amount);
          const transferSignature = await signDexTransfer(prepared.action);
          await submitDexTransfer(walletId, prepared.action, transferSignature);
          const deadline = Date.now() + MARGIN_POLL_TIMEOUT_MS;
          while (Date.now() < deadline) {
            const state = await getAccountState(address, details.dex);
            if (Number(state.withdrawable) >= needed) break;
            await delay(MARGIN_POLL_INTERVAL_MS);
          }
          onStatus?.("Placing your order…");
          return await submitPreparedOrder(walletId, request);
        }
        // TradingService.prepareOrder deliberately never bridges implicitly
        // (see its own comment) — do it here, once, transparently, instead
        // of making the user go fund manually and retry the same trade
        // themselves. If Arbitrum's balance is below Hyperliquid's minimum,
        // `bridge` throws its own clear error here and this propagates
        // instead of retrying — there is nothing a retry would fix.
        onStatus?.("Perps wallet balance is short — bridging more in automatically…");
        await bridge();
        // A bridge deposit takes a real amount of time (~1 minute typical)
        // to actually land in clearinghouseState — retrying immediately
        // would just reproduce the same error. Poll until it's there or
        // give up and let the retry surface an honest, current error.
        onStatus?.("Waiting for the balance to land — this can take up to 2 minutes…");
        const deadline = Date.now() + MARGIN_POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
          const state = await getAccountState(address);
          if (Number(state.withdrawable) >= Number(details.requiredUsdc)) break;
          await delay(MARGIN_POLL_INTERVAL_MS);
        }
        onStatus?.("Placing your order…");
        return await submitPreparedOrder(walletId, request);
      }
    },
    [walletId, address, bridge, submitPreparedOrder, signDexTransfer]
  );

  const cancelOrder = useCallback(
    async (orderId: string): Promise<HlOrderRow> => {
      if (!walletId) throw new Error("Wallet is not ready yet.");
      const prepared = await prepareCancelOrder(walletId, orderId);
      const signature = await signL1(prepared.action, prepared.nonce);
      return submitCancelOrder(walletId, prepared, signature);
    },
    [walletId, signL1]
  );

  // A standalone close order isn't part of Hyperliquid's normalTpsl grouping,
  // so a still-resting TP/SL from the original entry bracket isn't
  // auto-cancelled the way it would be if the bracket itself had filled.
  // Best-effort cleanup here — a failed cancel doesn't undo the close, it
  // just leaves a stale resting order for the user (or the backend's
  // reconciliation sweep) to catch later.
  const closePosition = useCallback(
    async (positionId: string, siblingOrderIdsToCancel: string[] = []): Promise<HlOrderRow> => {
      if (!walletId) throw new Error("Wallet is not ready yet.");
      const prepared = await prepareClosePosition(walletId, positionId);
      const signature = await signL1(prepared.action, prepared.nonce);
      const { closeOrder } = await submitClosePosition(walletId, prepared, signature);
      for (const orderId of siblingOrderIdsToCancel) {
        await cancelOrder(orderId).catch(() => {});
      }
      return closeOrder;
    },
    [walletId, signL1, cancelOrder]
  );

  // Adds a TP/SL to a position, or replaces one: Hyperliquid has no in-place
  // "modify" action, so replacing means cancelling the old resting trigger
  // order first (`existingOrderId`) — omitted when there wasn't one yet.
  const updateTriggerOrder = useCallback(
    async (
      positionId: string,
      kind: HlTriggerKind,
      triggerPrice: string,
      existingOrderId?: string
    ): Promise<HlOrderRow> => {
      if (!walletId) throw new Error("Wallet is not ready yet.");
      if (existingOrderId) await cancelOrder(existingOrderId);
      const prepared = await prepareTriggerOrder(walletId, positionId, kind, triggerPrice);
      const signature = await signL1(prepared.action, prepared.nonce);
      return submitTriggerOrder(walletId, prepared, signature);
    },
    [walletId, signL1, cancelOrder]
  );

  const updateLeverage = useCallback(
    async (assetSymbol: string, leverage: number, marginMode: HlMarginMode): Promise<void> => {
      if (!walletId) throw new Error("Wallet is not ready yet.");
      const prepared = await prepareLeverageUpdate(walletId, assetSymbol, leverage, marginMode);
      if ("alreadySet" in prepared) return;
      const signature = await signL1(prepared.action, prepared.nonce);
      await submitLeverageUpdate(walletId, prepared.action, prepared.nonce, signature);
    },
    [walletId, signL1]
  );

  // A withdrawal (llms.txt §6b). `total` is what leaves the perps wallet: the
  // withdraw3 carries it less the platform fee, which travels as its own
  // signed sendAsset. `onStatus` reports each step for the modal to word; the
  // venue's finalization alone takes a couple of minutes.
  const withdraw = useCallback(
    async (
      total: string,
      onStatus?: (step: WithdrawStep) => void
    ): Promise<{ treasuryMovementId: string }> => {
      if (!walletId) throw new Error("Wallet is not ready yet.");
      // The modal checks the total against the free balance; this guards the
      // minimum, which is all it can know on its own.
      let plan = planWithdrawal({ total, withdrawable: total });
      if (plan.kind !== "ok") throw new Error("That amount is below the minimum withdrawal.");

      onStatus?.("withdrawing");
      const startingArbitrumBalance = address
        ? await getArbitrumBalance(address).catch(() => null)
        : null;

      // prepare takes the withdraw3 amount itself, so the platform fee is
      // subtracted before it. The backend is the authority on that fee: if it
      // prepared a different one (or none), prepare again with its figure so
      // the total that leaves the wallet is still exactly the typed amount.
      let prepared = await prepareWithdrawal(walletId, plan.withdraw3Amount);
      const preparedFee = prepared.fee?.amountUsdc ?? "0";
      const assumedFee = toBaseUnits(PERPS_PLATFORM_WITHDRAWAL_FEE_USDC, USDC_DECIMALS);
      if (toBaseUnits(preparedFee, USDC_DECIMALS) !== assumedFee) {
        plan = planWithdrawal({ total, withdrawable: total, platformFee: preparedFee });
        if (plan.kind !== "ok") throw new Error("That amount is below the minimum withdrawal.");
        prepared = await prepareWithdrawal(walletId, plan.withdraw3Amount);
        const refreshedFee = toBaseUnits(prepared.fee?.amountUsdc ?? "0", USDC_DECIMALS);
        if (refreshedFee !== toBaseUnits(preparedFee, USDC_DECIMALS)) {
          throw new Error("The withdrawal fee changed. Try again.");
        }
      }

      const signature = await signWithdrawal(prepared.withdraw.action);
      const fee = prepared.fee
        ? { action: prepared.fee.action, signature: await signDexTransfer(prepared.fee.action) }
        : null;
      const result = await submitWithdrawal(walletId, prepared.withdraw.action, signature, fee);

      // The withdrawal has succeeded by this point: the venue accepted it and
      // the funds are on their way to the user's own Arbitrum wallet. What
      // follows only brings them the last hop home, so it never throws back
      // out of `withdraw`. If it cannot finish, resumeWithdrawal picks it up on
      // the next load.
      if (address && startingArbitrumBalance !== null) {
        onStatus?.("waiting");
        const startingRaw = toBaseUnits(startingArbitrumBalance, SETTLE_CHAINS.arbitrum.decimals);
        const deadline = Date.now() + WITHDRAWAL_POLL_TIMEOUT_MS;
        let creditedRaw = 0n;
        while (Date.now() < deadline) {
          const current = await getArbitrumBalance(address).catch(() => null);
          const currentRaw =
            current !== null ? toBaseUnits(current, SETTLE_CHAINS.arbitrum.decimals) : null;
          if (currentRaw !== null && currentRaw > startingRaw) {
            creditedRaw = currentRaw - startingRaw;
            break;
          }
          await delay(MARGIN_POLL_INTERVAL_MS);
        }

        if (creditedRaw > 0n) {
          await sendArbitrumUsdcToBase(cctpDeps, {
            amount: creditedRaw,
            recipient: address as Address,
            onStatus,
          }).catch((error) => {
            console.warn("Withdrawal reached Arbitrum; the move to Base will resume later", error);
          });
        }
      }

      return result;
    },
    [walletId, address, signWithdrawal, signDexTransfer, cctpDeps]
  );

  // Catches up a withdrawal whose Arbitrum -> Base leg never finished: closing
  // the tab, or a credit slower than withdraw's own poll, leaves the funds on
  // Arbitrum with nothing left to move them. Called once when the wallet loads
  // (see useHyperliquidTrading). Gated strictly on the backend knowing of an
  // unresolved withdrawal, never on "there is an Arbitrum balance" alone
  // (llms.txt §6b): a wallet mid-funding also has one, and that must not be
  // sent to Base. A page load is never interrupted by this; failures are logged.
  const resumeWithdrawal = useCallback(async (): Promise<void> => {
    if (!walletId || !address) return;
    try {
      const pending = await getPendingWithdrawal(walletId);
      if (!pending) return;
      const balance = await getArbitrumBalance(address);
      const balanceRaw = toBaseUnits(balance, SETTLE_CHAINS.arbitrum.decimals);
      if (balanceRaw <= 0n) return;
      await sendArbitrumUsdcToBase(cctpDeps, { amount: balanceRaw, recipient: address as Address });
    } catch (error) {
      console.warn("Could not resume a pending withdrawal; it will be tried again", error);
    }
  }, [walletId, address, cctpDeps]);

  // A top-up (llms.txt §6a): read who pays the mint relay, burn Base USDC to
  // the perps balance in one sponsored batch, record the burn, then follow it
  // to the credit. Throws only before the burn (nothing has moved yet); after
  // the burn it always resolves an outcome, because the money is already on
  // its way and an error would misstate that.
  const depositToPerps = useCallback(
    async (
      amountUsdc: string,
      onStage?: (stage: DepositStage) => void,
      timing: DepositTiming = DEFAULT_DEPOSIT_TIMING
    ): Promise<DepositOutcome> => {
      if (!walletId || !address) throw new Error("Wallet is not ready yet.");
      const amount = toBaseUnits(amountUsdc, USDC_DECIMALS);
      if (amount <= 0n) throw new Error("Enter an amount to top up.");

      const config = await getCctpDepositConfig();
      const withdrawableBefore = await getAccountState(address)
        .then((state) => toBaseUnits(state.withdrawable, USDC_DECIMALS))
        .catch(() => null);

      onStage?.("sending");
      const burnTxHash = await burnBaseUsdcToPerps(cctpDeps, {
        amount,
        recipient: address as Address,
        userPaysForward: config.userPaysDepositFee,
      });

      onStage?.("recording");
      let recorded = false;
      for (let attempt = 0; attempt <= timing.recordRetryDelaysMs.length; attempt++) {
        try {
          await recordCctpDeposit(walletId, burnTxHash, amountUsdc);
          recorded = true;
          break;
        } catch (error) {
          console.warn(`Recording deposit ${burnTxHash} failed (attempt ${attempt + 1})`, error);
          const wait = timing.recordRetryDelaysMs[attempt];
          if (wait !== undefined) await delay(wait);
        }
      }
      if (!recorded) return { kind: "recordFailed", burnTxHash };

      onStage?.("confirming");
      const deadline = Date.now() + timing.statusTimeoutMs;
      let lastPollError: unknown = null;
      while (Date.now() < deadline) {
        // A failed poll tick is retried on the next one; the deadline bounds
        // it, and the last failure is reported if the wait runs out.
        const status = await getCctpDepositStatus(burnTxHash).catch((error) => {
          lastPollError = error;
          return null;
        });
        if (status?.status === "confirmed") return { kind: "credited", burnTxHash };
        if (status?.status === "failed" || status?.status === "stuck") {
          return { kind: "failed", burnTxHash, status: status.status };
        }
        if (withdrawableBefore !== null) {
          const now = await getAccountState(address)
            .then((state) => toBaseUnits(state.withdrawable, USDC_DECIMALS))
            .catch(() => null);
          if (now !== null && now > withdrawableBefore) return { kind: "credited", burnTxHash };
        }
        await delay(timing.statusIntervalMs);
      }
      if (lastPollError) console.warn(`Deposit ${burnTxHash} status unreadable`, lastPollError);
      return { kind: "pending", burnTxHash };
    },
    [walletId, address, cctpDeps]
  );

  // Reads the wallet's current HyperCore account-abstraction mode — the
  // Manual/Unified/Portfolio pill in the order ticket uses this to show
  // which one is active.
  const getAbstractionMode = useCallback(async (): Promise<HlAbstractionModeStatus> => {
    if (!walletId) throw new Error("Wallet is not ready yet.");
    return getAbstractionModeStatus(walletId);
  }, [walletId]);

  // User-initiated, unlike ensureBuilderFeeApproved above: switching mode is
  // a deliberate choice made from the order ticket's pill, so a failure here
  // is thrown back to the UI rather than swallowed.
  const setAbstractionMode = useCallback(
    async (mode: HlAbstractionModeStatus["mode"]): Promise<void> => {
      if (!walletId) throw new Error("Wallet is not ready yet.");
      const prepared = await prepareAbstractionMode(walletId, mode);
      const signature = await signSetAbstractionMode(prepared.action);
      await submitAbstractionMode(walletId, prepared.action, signature);
    },
    [walletId, signSetAbstractionMode]
  );

  return {
    placeOrder,
    updateLeverage,
    bridge,
    withdraw,
    resumeWithdrawal,
    depositToPerps,
    cancelOrder,
    closePosition,
    updateTriggerOrder,
    getAbstractionMode,
    setAbstractionMode,
  };
}
