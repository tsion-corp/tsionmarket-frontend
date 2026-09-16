import { createServiceClient } from "@/lib/api/service";
import type {
  CctpDepositConfig,
  CctpDepositStatus,
  HlAbstractionModeStatus,
  HlAllMids,
  HlApproveBuilderFeeAction,
  HlAsset,
  HlBuilderFeeStatus,
  HlClearinghouseState,
  HlClosedPositionView,
  HlFundingHistoryEntry,
  HlL1Action,
  HlMarketContext,
  HlOrderRow,
  HlPositionView,
  HlSendAssetAction,
  HlSetAbstractionAction,
  HlSignature,
  HlTriggerKind,
  HlWallet,
  HlWithdraw3Action,
  PendingWithdrawal,
  PlaceOrderRequest,
  PlaceOrderResult,
  PreparedBridge,
  PreparedDexTransfer,
  PrepareLeverageResult,
  PreparedAbstractionMode,
  PreparedBuilderFeeApproval,
  PreparedCancel,
  PreparedClosePosition,
  PreparedOrder,
  PreparedTriggerOrder,
  PreparedWithdrawal,
} from "@/features/trade/lib/hyperliquid-types";

// The app's perp proxy (app/api/perp/[...path]/route.ts), under its /ark/*
// sub-paths: one backend service and one transport, per this app's
// architecture rules.
const perp = createServiceClient("/api/perp", "The perp service is unavailable right now.");

export async function getOrCreateWallet(address: string): Promise<HlWallet> {
  return perp.authedGet<HlWallet>(`/ark/wallet/${address}`);
}

export async function listAssets(): Promise<HlAsset[]> {
  return perp.get<HlAsset[]>("/ark/assets");
}

export async function getPrices(): Promise<HlAllMids> {
  return perp.get<HlAllMids>("/ark/prices");
}

export async function getMarketContexts(): Promise<HlMarketContext[]> {
  return perp.get<HlMarketContext[]>("/ark/market-contexts");
}

export async function getFundingHistory(
  symbol: string,
  startTime: number,
  endTime?: number
): Promise<HlFundingHistoryEntry[]> {
  return perp.get<HlFundingHistoryEntry[]>(`/ark/funding-history/${symbol}`, {
    startTime,
    ...(endTime !== undefined ? { endTime } : {}),
  });
}

// This is the only call in the app that carries Hyperliquid's own liquidation
// figure, and it is currently dropped: `assetPositions` is typed `unknown[]`
// on HlClearinghouseState, and the venue puts `liquidationPx` on each entry's
// `position` (see @nktkas/hyperliquid's clearinghouseState contract). That
// figure exists only for a position that is already open. There is no
// pre-trade equivalent anywhere on the info surface, so the order ticket's
// estimate is computed: features/trade/lib/liquidation.ts.
export async function getAccountState(
  address: string,
  dex?: string
): Promise<HlClearinghouseState> {
  // Each HIP-3 dex margins as a separate Hyperliquid account; dex unset = native.
  const query = dex ? `?dex=${encodeURIComponent(dex)}` : "";
  return perp.authedGet<HlClearinghouseState>(`/ark/account-state/${address}${query}`);
}

// Native -> HIP-3 dex margin transfer (sendAsset): prepare returns the
// unsigned EIP-712 action, submit relays the client-signed result. Instant,
// off-chain, no gas — see apps/perp's BridgeService.
export async function prepareDexTransfer(
  walletId: string,
  destinationDex: string,
  amountUsdc: string
): Promise<PreparedDexTransfer> {
  return perp.post<PreparedDexTransfer>("/ark/dex-transfer/prepare", {
    walletId,
    destinationDex,
    amountUsdc,
  });
}

export async function submitDexTransfer(
  walletId: string,
  action: HlSendAssetAction,
  signature: HlSignature
): Promise<void> {
  await perp.post("/ark/dex-transfer/submit", { walletId, action, signature });
}

// Reads the destination chain directly rather than the Dextopus-webhook-driven
// treasury ledger — used to confirm a Base deposit actually landed, since a
// webhook can be missed, delayed, or (in local development) unreachable.
export async function getArbitrumBalance(address: string): Promise<string> {
  const { balance } = await perp.authedGet<{ balance: string }>(`/ark/arbitrum-balance/${address}`);
  return balance;
}

export async function listPositions(walletId: string): Promise<HlPositionView[]> {
  return perp.get<HlPositionView[]>(`/ark/wallets/${walletId}/positions`);
}

export async function listOrders(walletId: string): Promise<HlOrderRow[]> {
  return perp.get<HlOrderRow[]>(`/ark/wallets/${walletId}/orders`);
}

// Closed positions only — trading history. Kept off listPositions above so
// an open-positions poll never pages through history it doesn't need.
export async function listClosedPositions(
  walletId: string,
  limit = 50,
  offset = 0
): Promise<HlClosedPositionView[]> {
  return perp.get<HlClosedPositionView[]>(`/ark/wallets/${walletId}/positions/closed`, {
    limit,
    offset,
  });
}

export async function prepareOrder(request: PlaceOrderRequest): Promise<PreparedOrder> {
  return perp.post<PreparedOrder>("/ark/orders/prepare", request);
}

export async function submitOrder(
  walletId: string,
  prepared: PreparedOrder,
  signature: HlSignature
): Promise<PlaceOrderResult> {
  return perp.post<PlaceOrderResult>("/ark/orders/submit", { walletId, prepared, signature });
}

export async function prepareLeverageUpdate(
  walletId: string,
  assetSymbol: string,
  leverage: number,
  marginMode: "isolated" | "cross"
): Promise<PrepareLeverageResult> {
  return perp.post<PrepareLeverageResult>("/ark/leverage/prepare", {
    walletId,
    assetSymbol,
    leverage,
    marginMode,
  });
}

export async function submitLeverageUpdate(
  walletId: string,
  action: HlL1Action,
  nonce: number,
  signature: HlSignature
): Promise<{ updated: true }> {
  return perp.post<{ updated: true }>("/ark/leverage/submit", {
    walletId,
    action,
    nonce,
    signature,
  });
}

export async function prepareCancelOrder(
  walletId: string,
  orderId: string
): Promise<PreparedCancel> {
  return perp.post<PreparedCancel>("/ark/orders/cancel/prepare", { walletId, orderId });
}

export async function submitCancelOrder(
  walletId: string,
  prepared: PreparedCancel,
  signature: HlSignature
): Promise<HlOrderRow> {
  return perp.post<HlOrderRow>("/ark/orders/cancel/submit", { walletId, prepared, signature });
}

export async function prepareClosePosition(
  walletId: string,
  positionId: string,
  size?: string
): Promise<PreparedClosePosition> {
  return perp.post<PreparedClosePosition>("/ark/positions/close/prepare", {
    walletId,
    positionId,
    size,
  });
}

export async function submitClosePosition(
  walletId: string,
  prepared: PreparedClosePosition,
  signature: HlSignature
): Promise<{ closeOrder: HlOrderRow }> {
  return perp.post<{ closeOrder: HlOrderRow }>("/ark/positions/close/submit", {
    walletId,
    prepared,
    signature,
  });
}

export async function prepareTriggerOrder(
  walletId: string,
  positionId: string,
  kind: HlTriggerKind,
  triggerPrice: string
): Promise<PreparedTriggerOrder> {
  return perp.post<PreparedTriggerOrder>("/ark/orders/trigger/prepare", {
    walletId,
    positionId,
    kind,
    triggerPrice,
  });
}

export async function submitTriggerOrder(
  walletId: string,
  prepared: PreparedTriggerOrder,
  signature: HlSignature
): Promise<HlOrderRow> {
  return perp.post<HlOrderRow>("/ark/orders/trigger/submit", { walletId, prepared, signature });
}

export async function prepareBridge(walletId: string): Promise<PreparedBridge> {
  return perp.post<PreparedBridge>("/ark/bridge/prepare", { walletId });
}

export async function confirmBridge(
  walletId: string,
  txHash: string,
  amountUsdc: string
): Promise<{ treasuryMovementId: string }> {
  return perp.post<{ treasuryMovementId: string }>("/ark/bridge/confirm", {
    walletId,
    txHash,
    amountUsdc,
  });
}

export async function prepareWithdrawal(
  walletId: string,
  amountUsdc: string
): Promise<PreparedWithdrawal> {
  return perp.post<PreparedWithdrawal>("/ark/withdrawals/prepare", { walletId, amountUsdc });
}

// `fee` is the platform fee leg, signed beside the withdraw3, or null when the
// backend prepared none. The backend relays the withdrawal first, then the fee.
export async function submitWithdrawal(
  walletId: string,
  action: HlWithdraw3Action,
  signature: HlSignature,
  fee: { action: HlSendAssetAction; signature: HlSignature } | null
): Promise<{ treasuryMovementId: string }> {
  return perp.post<{ treasuryMovementId: string }>("/ark/withdrawals/submit", {
    walletId,
    action,
    signature,
    fee,
  });
}

export async function getPendingWithdrawal(walletId: string): Promise<PendingWithdrawal | null> {
  return perp.get<PendingWithdrawal | null>(`/ark/wallets/${walletId}/withdrawals/pending`);
}

// ── Builder fee (the venue's own revenue-collection mechanism) ────────

export async function getBuilderFeeStatus(walletId: string): Promise<HlBuilderFeeStatus> {
  return perp.get<HlBuilderFeeStatus>(`/ark/wallets/${walletId}/builder-fee`);
}

export async function prepareBuilderFeeApproval(
  walletId: string
): Promise<PreparedBuilderFeeApproval> {
  return perp.post<PreparedBuilderFeeApproval>("/ark/builder-fee/prepare", { walletId });
}

export async function submitBuilderFeeApproval(
  walletId: string,
  action: HlApproveBuilderFeeAction,
  signature: HlSignature
): Promise<{ approved: true }> {
  return perp.post<{ approved: true }>("/ark/builder-fee/submit", { walletId, action, signature });
}

// ── Account-abstraction mode (HyperCore's own mode, not EIP-7702) ───────

export async function getAbstractionModeStatus(walletId: string): Promise<HlAbstractionModeStatus> {
  return perp.get<HlAbstractionModeStatus>(`/ark/wallets/${walletId}/abstraction-mode`);
}

export async function prepareAbstractionMode(
  walletId: string,
  abstraction: HlAbstractionModeStatus["mode"]
): Promise<PreparedAbstractionMode> {
  return perp.post<PreparedAbstractionMode>("/ark/abstraction-mode/prepare", {
    walletId,
    abstraction,
  });
}

export async function submitAbstractionMode(
  walletId: string,
  action: HlSetAbstractionAction,
  signature: HlSignature
): Promise<{ mode: HlAbstractionModeStatus["mode"] }> {
  return perp.post<{ mode: HlAbstractionModeStatus["mode"] }>("/ark/abstraction-mode/submit", {
    walletId,
    action,
    signature,
  });
}

// ── CCTP deposit (Base -> HyperCore, one hop; llms.txt §6a) ──────────────

export async function getCctpDepositConfig(): Promise<CctpDepositConfig> {
  return perp.get<CctpDepositConfig>("/ark/deposit/cctp/config");
}

export async function recordCctpDeposit(
  walletId: string,
  burnTxHash: string,
  amountUsdc: string
): Promise<{ treasuryMovementId: string }> {
  return perp.post<{ treasuryMovementId: string }>("/ark/deposit/cctp/record", {
    walletId,
    burnTxHash,
    amountUsdc,
  });
}

// `data: null` means the backend has not seen the burn yet, which reads as
// still pending, not as an error.
export async function getCctpDepositStatus(txHash: string): Promise<CctpDepositStatus | null> {
  return perp.authedGet<CctpDepositStatus | null>(`/ark/deposit/cctp/status/${txHash}`);
}
