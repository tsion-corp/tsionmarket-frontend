import { encodeFunctionData, parseAbi } from "viem";
import { publicClientForChain } from "@/lib/trade/receipt";
import { PREDICTION_CHAIN_ID } from "@/features/prediction/lib/logic";

// The legacy contract exposes ERC-1155 balances as `shareOf(tokenId, holder)`
// (NOT `balanceOf`) — confirmed against its deployed bytecode — so this module
// uses its own minimal ABI rather than the current contract's PREDICTION_ABI.
const LEGACY_ABI = parseAbi([
  "function shareOf(uint256 tokenId, address holder) view returns (uint256)",
  "function pendingWithdrawals(address account) view returns (uint256)",
  "function markets(uint256) view returns (uint64 closeTime, uint8 status, uint8 outcome, address creator, uint256 rYes, uint256 rNo, uint256 totalLp, uint16 feeBps, uint256 collateral)",
  "function redeem(uint256 marketId, uint8 side, uint256 shares)",
  "function claim()",
]);

// Standalone "reclaim your winnings" support for the SUPERSEDED prediction
// contract at 0xF9A870…. That contract still holds real winnings, but the app's
// market list + positions come from the indexer, which only tracks the CURRENT
// contract — so those markets never appear and their winners can't reach a claim
// button. This module reads 0xF9A870 DIRECTLY from chain (no indexer) so a winner
// can log in and redeem + claim their own shares. Nobody else can pay them: the
// contract burns the caller's OWN shares (no admin/owner override exists), so the
// winner must sign it themselves — this page is that one required interaction.

// The old, non-upgradeable deploy that still holds ~488 USDC (~120 of it owed to
// winners; the rest is LP seed + losing-side collateral that belongs to the pool).
export const LEGACY_CONTRACT = "0xF9A870d3C3c597Fe167a5c8DB8394dec7B2a2Aa5" as const;

// side: 0 = YES, 1 = NO. tokenId = marketId * 2 + side (contract's ERC-1155 math).
const NO = 1;

// The resolved markets on the legacy contract and the side that WON. Reconstructed
// from the contract's MarketResolved events (see apps/prediction-market/claim-helper.mjs
// in the monorepo, which audits these on-chain). Winners hold the winning side.
export interface LegacyMarket {
  marketId: bigint;
  winningSide: 0 | 1;
  label: string;
}

export const LEGACY_RESOLVED_MARKETS: LegacyMarket[] = [
  {
    marketId: 14297121995637226772515487232263871369700855306604599397275415849598547527745n,
    winningSide: NO,
    label: "Resolved market #1",
  },
  {
    marketId: 18765686703622830863943138392046949055535699220285626387465417152089865560146n,
    winningSide: NO,
    label: "Resolved market #2",
  },
];

// The 6 markets we invalidated (their questions were lost, so they were voided
// rather than resolved). On an INVALID market either side refunds 1:1, so a
// bettor redeems whichever side(s) they still hold — no winning side. See the
// MarketInvalidated tx hashes in the monorepo (invalidate-legacy.mjs).
export const LEGACY_INVALIDATED_MARKETS: Array<{ marketId: bigint; label: string }> = [
  {
    marketId: 0x2c1b97f833f293bf3eafe14f1a1a071d0120e1578f9719538ce251b20c85d6b9n,
    label: "Refunded market #1",
  },
  {
    marketId: 0xaf214324f241d2775f04811b79974047bb46d890ff0dcfefce42d406a3c1bcadn,
    label: "Refunded market #2",
  },
  {
    marketId: 0x8cd7603af0596509148a0be4203fc1251aa0a1e225b0322be0c7270a8939bf97n,
    label: "Refunded market #3",
  },
  {
    marketId: 0xb42e5b5b088b8dc76a6547a9d1c01ce4559e8227f31347a3944628f117d1a1bbn,
    label: "Refunded market #4",
  },
  {
    marketId: 0xf39b372d3a917c8a1d7a96af6c5836641f1fcb08f3c4b0377d1469d025280613n,
    label: "Refunded market #5",
  },
  {
    marketId: 0x81d95352d25e9aed39dd4970e2017f28da182c705e2a616d4931d7280c5c755en,
    label: "Refunded market #6",
  },
];

// tokenId = (marketId << 1) | side, computed the SAME way the contract does it:
// with UNCHECKED uint256 overflow (see _tokenId + the "shifts are NOT overflow-
// checked" note in PredictionMarket.sol). Market ids sit near the top of the
// uint256 range, so the shift wraps around — we must mask to 256 bits to match,
// otherwise the value exceeds uint256 max and viem rejects the read.
const UINT256_MASK = (1n << 256n) - 1n;
function legacyTokenId(marketId: bigint, side: 0 | 1): bigint {
  return ((marketId << 1n) | BigInt(side)) & UINT256_MASK;
}

// One redeemable position: a (market, side) the wallet still holds and can
// redeem 1:1. Covers BOTH a resolved market's winning side AND either side of an
// invalidated (refunded) market.
export interface LegacyRedeemable {
  marketId: bigint;
  side: 0 | 1;
  shares: bigint; // USDC owed at 1:1 (6 decimals)
  label: string;
  kind: "winning" | "refund";
  // Whether the market actually holds enough collateral to pay this position.
  // The superseded contract over-minted shares on some markets (total owed >
  // collateral), so redeem() reverts "insolvent" there. We must NOT batch those,
  // or the whole atomic claim reverts and the user gets nothing — even from their
  // solvent markets. Insolvent positions are shown but excluded from the tx.
  solvent: boolean;
}

export interface LegacyClaimState {
  redeemables: LegacyRedeemable[];
  // Sum of SOLVENT positions — what the claim tx will actually pay out.
  claimableShares: bigint;
  // Sum of positions stuck on insolvent markets (shown, but the contract can't
  // pay them — the market holds less collateral than it owes).
  blockedShares: bigint;
  pending: bigint; // already-redeemed USDC waiting in pendingWithdrawals
}

/**
 * Read a wallet's claimable state on the legacy contract — pure on-chain, no
 * indexer. Covers two cases:
 *   - RESOLVED markets: the winning side redeems 1:1 (their winnings).
 *   - INVALIDATED markets: EITHER side redeems 1:1 (a refund of their stake),
 *     so we check both sides and include whichever the wallet holds.
 * Plus any already-redeemed balance sitting in pendingWithdrawals (needs only
 * claim()).
 */
export async function readLegacyClaimState(wallet: string): Promise<LegacyClaimState> {
  const client = publicClientForChain(PREDICTION_CHAIN_ID);
  const owner = wallet as `0x${string}`;

  const shareOf = (marketId: bigint, side: 0 | 1) =>
    client.readContract({
      address: LEGACY_CONTRACT,
      abi: LEGACY_ABI,
      functionName: "shareOf",
      args: [legacyTokenId(marketId, side), owner],
    }) as Promise<bigint>;

  // A market's remaining collateral — the ceiling on what redeem() can pay
  // before it reverts "insolvent". Cached per market so we read it once.
  const collateralCache = new Map<bigint, bigint>();
  const collateralOf = async (marketId: bigint): Promise<bigint> => {
    const hit = collateralCache.get(marketId);
    if (hit !== undefined) return hit;
    const m = (await client.readContract({
      address: LEGACY_CONTRACT,
      abi: LEGACY_ABI,
      functionName: "markets",
      args: [marketId],
    })) as readonly [bigint, number, number, string, bigint, bigint, bigint, number, bigint];
    const collateral = m[8];
    collateralCache.set(marketId, collateral);
    return collateral;
  };

  const raw: Array<Omit<LegacyRedeemable, "solvent">> = [];

  // Resolved → only the winning side pays.
  for (const m of LEGACY_RESOLVED_MARKETS) {
    const shares = await shareOf(m.marketId, m.winningSide);
    if (shares > 0n)
      raw.push({
        marketId: m.marketId,
        side: m.winningSide,
        shares,
        label: m.label,
        kind: "winning",
      });
  }

  // Invalidated → both sides refund 1:1.
  for (const m of LEGACY_INVALIDATED_MARKETS) {
    for (const side of [0, 1] as const) {
      const shares = await shareOf(m.marketId, side);
      if (shares > 0n)
        raw.push({ marketId: m.marketId, side, shares, label: m.label, kind: "refund" });
    }
  }

  // Mark each position solvent iff the market can actually pay it. redeem()
  // reverts "insolvent" when payout (= shares, 1:1) exceeds market collateral.
  // Collateral is a PER-MARKET pool that every redeem in the batch draws down,
  // so positions on the same market (both sides of an invalidated one) must
  // fit together: the check is cumulative, not per-position, or the second
  // side could pass alone yet revert the whole batch.
  const redeemables: LegacyRedeemable[] = [];
  const drawnByMarket = new Map<bigint, bigint>();
  for (const r of raw) {
    const collateral = await collateralOf(r.marketId);
    const drawn = drawnByMarket.get(r.marketId) ?? 0n;
    const solvent = drawn + r.shares <= collateral;
    if (solvent) drawnByMarket.set(r.marketId, drawn + r.shares);
    redeemables.push({ ...r, solvent });
  }

  const pending = (await client.readContract({
    address: LEGACY_CONTRACT,
    abi: LEGACY_ABI,
    functionName: "pendingWithdrawals",
    args: [owner],
  })) as bigint;

  const claimableShares = redeemables
    .filter((r) => r.solvent)
    .reduce((sum, r) => sum + r.shares, 0n);
  const blockedShares = redeemables
    .filter((r) => !r.solvent)
    .reduce((sum, r) => sum + r.shares, 0n);
  return { redeemables, claimableShares, blockedShares, pending };
}

/**
 * Batched calls to redeem the SOLVENT positions and then claim the resulting USDC
 * to the wallet, in one sponsored operation. Insolvent positions are EXCLUDED:
 * the whole batch is atomic, so including a market that reverts "insolvent" would
 * revert everything and the user would get nothing (the bug that gave a $79.51
 * claimant $0). Skipping them lets the user withdraw every solvent market in full.
 * Each redeem burns THIS wallet's own shares (only the holder can); the trailing
 * claim() pulls the credited pendingWithdrawals out.
 */
export function buildLegacyClaimCalls(
  redeemables: LegacyRedeemable[]
): Array<{ to: `0x${string}`; data: `0x${string}` }> {
  const solvent = redeemables.filter((r) => r.solvent);
  const calls = solvent.map((r) => ({
    to: LEGACY_CONTRACT,
    data: encodeFunctionData({
      abi: LEGACY_ABI,
      functionName: "redeem",
      args: [r.marketId, r.side, r.shares],
    }),
  }));
  calls.push({
    to: LEGACY_CONTRACT,
    data: encodeFunctionData({ abi: LEGACY_ABI, functionName: "claim", args: [] }),
  });
  return calls;
}
