// Domain types mirroring apps/perp's Hyperliquid rebuild ("Ark"). Kept in
// lockstep with the backend's own domain/*.ts and services/*.ts return
// shapes by hand, the same way lib/perp/types.ts mirrors the Avantis
// service. See apps/perp/src/signing/README.md for the signing model these
// prepare/submit shapes exist for: every write is signed client-side, this
// frontend never sends a private key anywhere.

// Every Hyperliquid perp is margined and settled in USDC — displayed as
// "{symbol}-USDC" everywhere a market/pair is shown to the user, matching
// Hyperliquid's own convention. The bare `symbol` (e.g. "BTC") stays what
// every API call, WS subscription, and order still actually uses; this is
// display-only. A HIP-3 asset's symbol carries a dex prefix on the wire
// (e.g. "xyz:AAPL", matching Hyperliquid's own naming) — stripped here so
// the user sees "AAPL-USDC", not the internal dex name.
export function hlPairLabel(symbol: string): string {
  const bareSymbol = symbol.includes(":") ? symbol.split(":")[1]! : symbol;
  return `${bareSymbol}-USDC`;
}

export interface HlWallet {
  id: string;
  userId: string;
  address: string;
  isActive: boolean;
  smartAccountUpgradedAt: string | null;
  dextopusDepositAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HlAsset {
  id: string;
  assetIndex: number;
  /** '' = native perps; a HIP-3 dex name (e.g. "xyz") otherwise. */
  dex: string;
  symbol: string;
  /** Coarse asset class for the market picker's category tabs — "crypto"
   *  for native assets, otherwise normalized from the venue's own
   *  curation ("equities" | "forex" | "commodities" | "indices" | "other"). */
  category: string | null;
  szDecimals: number;
  maxLeverage: number;
  isActive: boolean;
}

export type HlAllMids = Record<string, string>;

/** One asset's live market stats for the market list — mirrors apps/perp's `AssetContextRow`. */
export interface HlMarketContext {
  symbol: string;
  markPrice: string;
  oraclePrice: string;
  prevDayPrice: string;
  dayVolumeUsd: string;
  openInterest: string;
  fundingRate: string;
}

// Market-wide funding sample — NOT a wallet's own funding payments (that's
// a different, user-scoped Hyperliquid read this app doesn't currently
// surface). Drives the chart panel's Funding tab.
export interface HlFundingHistoryEntry {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

interface HlMarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

export interface HlClearinghouseState {
  marginSummary: HlMarginSummary;
  crossMarginSummary: HlMarginSummary;
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  assetPositions: unknown[];
  time: number;
}

export type HlPositionSide = "long" | "short";
export type HlMarginMode = "isolated" | "cross";
export type HlPositionStatus = "open" | "closed";

export interface HlPositionView {
  id: string;
  walletId: string;
  assetId: string;
  entryOrderId: string;
  side: HlPositionSide;
  size: string;
  entryPrice: string;
  leverage: number;
  marginMode: HlMarginMode;
  status: HlPositionStatus;
  closeReason: string | null;
  closePrice: string | null;
  realizedPnlUsdc: string | null;
  markPrice: string | null;
  unrealizedPnlUsdc: string | null;
  accruedFundingUsdc: string;
  openedAt: string;
  closedAt: string | null;
}

export type HlPositionCloseReason =
  "take_profit" | "stop_loss" | "manual_close" | "liquidation" | "reconciled";

// A closed position, for the trading-history view. No live valuation —
// everything about a closed position is already final. Carries the asset's
// symbol, which HlPositionView does not (only assetId).
export interface HlClosedPositionView {
  id: string;
  walletId: string;
  assetId: string;
  symbol: string;
  side: HlPositionSide;
  size: string;
  entryPrice: string;
  leverage: number;
  marginMode: HlMarginMode;
  status: "closed";
  closeReason: HlPositionCloseReason;
  closePrice: string;
  realizedPnlUsdc: string;
  openedAt: string;
  closedAt: string;
}

export type HlOrderType = "market" | "limit" | "take_profit" | "stop_loss" | "close";
export type HlOrderSide = "buy" | "sell";
export type HlOrderStatus =
  "submitted" | "open" | "partially_filled" | "filled" | "cancelled" | "rejected";

// Mirrors apps/perp's own RESTING_STATUSES — listOrders returns every order
// for a wallet, not just resting ones, so "is this order still pending" is a
// status check, not a presence check.
const RESTING_ORDER_STATUSES = new Set<HlOrderStatus>(["submitted", "open", "partially_filled"]);
export function isRestingOrder(order: HlOrderRow): boolean {
  return RESTING_ORDER_STATUSES.has(order.status);
}

export interface HlOrderRow {
  id: string;
  walletId: string;
  assetId: string;
  cloid: string;
  externalOrderId: string | null;
  parentOrderId: string | null;
  orderType: HlOrderType;
  side: HlOrderSide;
  size: string;
  limitPrice: string | null;
  reduceOnly: boolean;
  status: HlOrderStatus;
  /** Hyperliquid's own error string when status is "rejected" — a TP/SL leg
   *  can be rejected while the entry of the same batch filled. */
  rejectionReason?: string | null;
}

// ── Hyperliquid /exchange wire shapes (signed client-side) ──────────────

export interface HlOrderLeg {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t:
    | { limit: { tif: "Gtc" | "Ioc" | "Alo" } }
    | { trigger: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" } };
  c?: string;
}

export type HlL1Action =
  | {
      type: "order";
      orders: HlOrderLeg[];
      grouping: "na" | "normalTpsl" | "positionTpsl";
      /** World Street's own cut, attached server-side (TradingService.prepareOrder) — see HlBuilderFeeStatus. */
      builder?: { b: string; f: number };
    }
  | { type: "cancel"; cancels: { a: number; o: number }[] }
  | { type: "updateLeverage"; asset: number; isCross: boolean; leverage: number };

// Native -> HIP-3 dex margin transfer: each builder dex margins as a
// separate Hyperliquid account, and sendAsset is the venue's own primitive
// for moving USDC between them. Same signed-EIP-712 family as withdraw3;
// this platform only ever sends to the wallet's OWN address.
export interface HlSendAssetAction {
  type: "sendAsset";
  signatureChainId: `0x${string}`;
  hyperliquidChain: "Mainnet" | "Testnet";
  destination: string;
  sourceDex: string;
  destinationDex: string;
  token: string;
  amount: string;
  fromSubAccount: string;
  nonce: number;
}

export interface PreparedDexTransfer {
  action: HlSendAssetAction;
  nonce: number;
}

export interface HlWithdraw3Action {
  type: "withdraw3";
  signatureChainId: `0x${string}`;
  hyperliquidChain: "Mainnet" | "Testnet";
  destination: string;
  amount: string;
  time: number;
}

// One-time approval a wallet grants the platform treasury before its orders
// can carry Hyperliquid's builder fee — same signed-EIP-712 family as
// withdraw3, see hyperliquid-signer.ts's signApproveBuilderFee.
export interface HlApproveBuilderFeeAction {
  type: "approveBuilderFee";
  signatureChainId: `0x${string}`;
  hyperliquidChain: "Mainnet" | "Testnet";
  maxFeeRate: `${string}%`;
  builder: string;
  nonce: number;
}

export interface HlSignature {
  r: string;
  s: string;
  v: number;
}

// ── Trading prepare/submit ───────────────────────────────────────────────

export interface PlaceOrderRequest {
  walletId: string;
  assetSymbol: string;
  side: HlOrderSide;
  size: string;
  limitPrice?: string;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  slippagePct?: number;
}

export interface PreparedOrder {
  action: HlL1Action;
  nonce: number;
  entryCloid: string;
  takeProfitCloid: string | null;
  stopLossCloid: string | null;
}

export interface PlaceOrderResult {
  entryOrder: HlOrderRow;
  takeProfitOrder: HlOrderRow | null;
  stopLossOrder: HlOrderRow | null;
}

export interface PreparedLeverageUpdate {
  action: HlL1Action;
  nonce: number;
}

export type PrepareLeverageResult = PreparedLeverageUpdate | { alreadySet: true };

// ── Trade lifecycle: cancel / manual close / TP-SL edit ─────────────────
// Hyperliquid has no in-place "modify" for a resting order, and closing a
// position is just a standalone reduce-only order (no dedicated "close"
// action either) — see apps/perp's TradingService for the full rationale.

export interface PreparedCancel {
  action: HlL1Action;
  nonce: number;
  orderId: string;
}

export interface PreparedClosePosition {
  action: HlL1Action;
  nonce: number;
  cloid: string;
  positionId: string;
}

export type HlTriggerKind = "take_profit" | "stop_loss";

export interface PreparedTriggerOrder {
  action: HlL1Action;
  nonce: number;
  cloid: string;
  positionId: string;
  kind: HlTriggerKind;
}

// ── Bridge (Arbitrum -> HyperCore) ───────────────────────────────────────

export interface PreparedBridge {
  to: string;
  data: string;
  value: string;
  amountUsdc: string;
}

// ── Withdrawal (HyperCore -> Arbitrum) ───────────────────────────────────

export interface PreparedWithdrawal {
  action: HlWithdraw3Action;
  nonce: number;
}

/** A withdrawal that landed on Arbitrum but never finished forwarding on to
 *  Base — see WithdrawalService.getPendingWithdrawal on the backend. */
export interface PendingWithdrawal {
  treasuryMovementId: string;
  amountUsdc: string;
  status: "pending" | "confirmed" | "failed" | "stuck";
}

// ── Builder fee (Hyperliquid's own revenue-collection mechanism) ────────

export interface HlBuilderFeeStatus {
  approved: boolean;
  /** What the wallet has already granted the treasury — 0 if never approved. */
  maxFeeRateTenthsBps: number;
}

export interface PreparedBuilderFeeApproval {
  action: HlApproveBuilderFeeAction;
  nonce: number;
}

// ── Account-abstraction mode (HyperCore's own mode, not EIP-7702) ───────
// A wallet must be in "disabled" (Manual/Standard) mode before its orders
// are eligible to carry Hyperliquid's builder fee — see HlBuilderFeeStatus.

export type HlAbstractionMode = "disabled" | "unifiedAccount" | "portfolioMargin";

// User-signed EIP-712 action — same family as approveBuilderFee/withdraw3,
// see hyperliquid-signer.ts's signSetAbstractionMode.
export interface HlSetAbstractionAction {
  type: "userSetAbstraction";
  signatureChainId: `0x${string}`;
  hyperliquidChain: "Mainnet" | "Testnet";
  user: string;
  abstraction: HlAbstractionMode;
  nonce: number;
}

export interface HlAbstractionModeStatus {
  mode: HlAbstractionMode;
  /** Whether this wallet is currently eligible to collect builder fees. */
  eligibleForBuilderFees: boolean;
}

export interface PreparedAbstractionMode {
  action: HlSetAbstractionAction;
  nonce: number;
}

/** The insufficient-margin error the backend throws from `POST /hl/orders/prepare` (see apps/perp's TradingService). */
export interface InsufficientMarginDetails {
  reason: "insufficient_margin";
  walletId: string;
  requiredUsdc: string;
  withdrawableUsdc: string;
  /** Set for HIP-3 assets: the shortfall is on THIS dex's own balance and
   *  the fix is a native -> dex transfer, never an Arbitrum bridge. */
  dex?: string;
}

export function isInsufficientMarginDetails(
  details: unknown
): details is InsufficientMarginDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    (details as { reason?: unknown }).reason === "insufficient_margin"
  );
}

/**
 * The error BridgeService throws when a bridge is genuinely blocked, not
 * just unneeded: Arbitrum's balance is below Hyperliquid's own protocol
 * minimum deposit (see apps/perp's BridgeService.prepareBridge). No `reason`
 * field — matched structurally on the two numeric fields it always carries.
 */
export interface BridgeMinimumDetails {
  walletId: string;
  arbitrumBalanceUsdc: number;
  minDepositUsdc: number;
}

export function isBridgeMinimumDetails(details: unknown): details is BridgeMinimumDetails {
  return (
    typeof details === "object" &&
    details !== null &&
    typeof (details as { arbitrumBalanceUsdc?: unknown }).arbitrumBalanceUsdc === "number" &&
    typeof (details as { minDepositUsdc?: unknown }).minDepositUsdc === "number"
  );
}

// ── Dextopus funding (Base -> Arbitrum) ──────────────────────────────────
// One static, reusable deposit address per wallet; the client sends a plain
// USDC transfer to it with its own embedded wallet (same one-click,
// no-popup feel as every other write in this app — see
// HyperliquidFundModal), and Dextopus bridges whatever lands there to the
// wallet's own Arbitrum address. A prior Circle CCTP V2 integration lived
// here (native burn/mint, its own relayer key) — removed once Dextopus's
// perps-specific fee dropped to make it unnecessary. See apps/perp's root
// README ("Funding (Base -> Arbitrum, via Dextopus)") for the backend side.

export interface DepositAddress {
  address: string;
  originChainId: number;
  originAsset: string;
}

export type DepositMovementStatus = "pending" | "confirmed" | "failed" | "stuck";

export interface DepositStatus {
  status: DepositMovementStatus;
  destTxHash: string | null;
}
