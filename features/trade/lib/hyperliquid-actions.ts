"use client";

import { useCallback } from "react";
import { useEvmSend } from "@/hooks/use-evm-send";
import { useReroutedWithdraw } from "@/hooks/use-withdraw";
import { useHyperliquidSigner } from "@/features/trade/lib/hyperliquid-signer";
import {
  confirmBridge,
  getAbstractionModeStatus,
  getAccountState,
  getArbitrumBalance,
  getBuilderFeeStatus,
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
  // Continues a withdrawal's last hop (HyperCore -> Arbitrum, Hyperliquid's
  // own withdraw3, which can only ever settle to Arbitrum) on to Base, the
  // chain funding actually originates from — reusing the same generic
  // deposit-pipeline-in-reverse the funds page already ships with.
  const { withdraw: sendArbitrumBalanceToBase } = useReroutedWithdraw("withdrawal");

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

  // `onStatus` mirrors placeOrder's own progress callback — this can run for
  // up to several minutes (Hyperliquid's own withdrawal confirmation window,
  // ARK_WITHDRAWAL_CONFIRMATION_TIMEOUT_MS on the backend, matched here by
  // WITHDRAWAL_POLL_TIMEOUT_MS) before it continues on to Base, so the UI
  // needs something better to show than a static spinner. If this window
  // still isn't enough, useWithdrawalResume picks the withdrawal back up
  // the next time the wallet panel loads — see hyperliquid-actions.ts's
  // own note there.
  const withdraw = useCallback(
    async (
      amountUsdc: string,
      onStatus?: (status: string) => void
    ): Promise<{ treasuryMovementId: string }> => {
      if (!walletId) throw new Error("Wallet is not ready yet.");
      onStatus?.("Withdrawing…");
      const startingArbitrumBalance = address
        ? await getArbitrumBalance(address).catch(() => null)
        : null;
      const prepared = await prepareWithdrawal(walletId, amountUsdc);
      const signature = await signWithdrawal(prepared.action);
      const result = await submitWithdrawal(walletId, prepared.action, signature);

      // The withdrawal above has already succeeded by this point — Hyperliquid
      // accepted it and the funds are on their way to the user's own wallet.
      // Everything from here is a best-effort continuation: if it fails or
      // times out, the money is still safe, just one hop short of home, so
      // none of this is allowed to throw back out of `withdraw`.
      if (address && startingArbitrumBalance !== null) {
        onStatus?.("Waiting for funds…");
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
          onStatus?.("Moving funds to your main wallet…");
          await sendArbitrumBalanceToBase({
            originNetwork: SETTLE_CHAINS.arbitrum.alchemyNetwork,
            originChainId: SETTLE_CHAINS.arbitrum.chainId,
            originTokenAddress: SETTLE_CHAINS.arbitrum.usdc,
            originDecimals: SETTLE_CHAINS.arbitrum.decimals,
            destinationChainId: SETTLE_CHAINS.base.chainId,
            destinationAsset: SETTLE_CHAINS.base.usdc,
            to: address,
            amount: creditedRaw,
            refundTo: address,
          }).catch(() => {
            // Fail soft — see the comment above this block.
          });
        }
      }

      return result;
    },
    [walletId, address, signWithdrawal, sendArbitrumBalanceToBase]
  );

  // Catches up a withdrawal whose Arbitrum -> Base leg never finished (see
  // WithdrawalService.getPendingWithdrawal on the backend) — `withdraw`'s
  // own poll above only continues the leg if it catches the credit live;
  // closing the tab, or the credit simply taking longer than the poll
  // window, leaves funds sitting on Arbitrum with nothing left to move
  // them. Meant to be called once when the wallet loads (see
  // useWithdrawalResume). Deliberately gated on the backend already
  // knowing about an unresolved WITHDRAWAL-direction movement, never on
  // "there happens to be an Arbitrum balance" alone — a wallet mid-FUNDING
  // (a different movement type) also has a nonzero Arbitrum balance, and
  // this must never redirect that to Base instead of letting it bridge to
  // HyperCore. Silent no-op otherwise; never surfaces an error, since a
  // background catch-up check failing is not something a page load should
  // interrupt the user over — the funds are exactly as safe as before.
  const resumeWithdrawal = useCallback(async (): Promise<void> => {
    if (!walletId || !address) return;
    try {
      const pending = await getPendingWithdrawal(walletId);
      if (!pending) return;
      const balance = await getArbitrumBalance(address).catch(() => null);
      if (balance === null || Number(balance) <= 0) return;
      await sendArbitrumBalanceToBase({
        originNetwork: SETTLE_CHAINS.arbitrum.alchemyNetwork,
        originChainId: SETTLE_CHAINS.arbitrum.chainId,
        originTokenAddress: SETTLE_CHAINS.arbitrum.usdc,
        originDecimals: SETTLE_CHAINS.arbitrum.decimals,
        destinationChainId: SETTLE_CHAINS.base.chainId,
        destinationAsset: SETTLE_CHAINS.base.usdc,
        to: address,
        amount: toBaseUnits(balance, SETTLE_CHAINS.arbitrum.decimals),
        refundTo: address,
      });
    } catch {
      // Best-effort — see the comment above.
    }
  }, [walletId, address, sendArbitrumBalanceToBase]);

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
    cancelOrder,
    closePosition,
    updateTriggerOrder,
    getAbstractionMode,
    setAbstractionMode,
  };
}
