"use client";

import { createServiceClient } from "@/lib/api/service";
import type {
  ArkjetBalance,
  ArkjetDeposit,
  ArkjetFundingConfig,
  ArkjetWithdrawal,
} from "@/features/casino/lib/api/arkjet";

const spin = createServiceClient("/api/arkjet", "Spin Da Bottle is unavailable right now.");

export const SPIN_QUERY_KEYS = {
  funding: ["casino", "spin-da-bottle", "funding", "config", "usdc-v1"] as const,
  balance: ["casino", "spin-da-bottle", "balance", "usdc-v1"] as const,
};

export type SpinOutcome = "UP" | "DOWN" | "MIDDLE";
export type SpinPick = Exclude<SpinOutcome, "MIDDLE">;
export type SpinWagerStatus = "prepared" | "settled" | "expired";

export interface SpinRules {
  algorithmVersion: string;
  currency: string;
  currencyDecimalPlaces: number;
  reserveWalletAddress: string | null;
  reserveChainId: number | null;
  reserveTokenAddress: string | null;
  minimumAmount: string;
  minimumAmountMinor: number;
  maximumStake: string;
  maximumStakeMinor: number;
  maximumPayout: string;
  maximumPayoutMinor: number;
  commitmentTtlSeconds: number;
  hashAlgorithm: string;
  commitmentDomain: string;
  resultDomain: string;
  rtpBasisPoints: number;
  maximumRtpPercent: string;
  houseEdgeBasisPoints: number;
  payoutMultiplierHundredths: number;
  reserveRiskBasisPoints: number;
  randomOutcomeDistribution: string;
  effectiveOutcomeFormula: string;
  liabilityFormula: string;
  disclosure: string;
}

export interface SpinWager {
  wagerId: string;
  status: SpinWagerStatus;
  currency: string;
  amount: string | null;
  payout: string | null;
  playerPick: SpinPick | null;
  randomOutcome: SpinOutcome | null;
  effectiveOutcome: SpinOutcome | null;
  outcomeReason: string | null;
  won: boolean | null;
  roll: number | null;
  serverSeedCommitment: string;
  serverSeed: string | null;
  clientSeed: string | null;
  resultHash: string | null;
  availableLiability: string | null;
  algorithmVersion: string;
  preparedAt: string;
  expiresAt: string;
  settledAt: string | null;
}

export interface SpinHistory {
  items: SpinWager[];
  total: number;
}

export interface PlaySpinInput {
  amount: string;
  currency: string;
  playerPick: SpinPick;
  clientSeed: string;
  idempotencyKey: string;
}

export interface SpinLiquiditySnapshot {
  reserveBalanceMinor: number;
  reservedLiabilityMinor: number;
  reserveRiskBasisPoints: number;
}

export interface SpinProof {
  algorithmVersion: string;
  wagerId: string;
  serverSeed: string;
  serverSeedCommitment: string;
  clientSeed: string;
  playerPick: SpinPick;
  stakeMinor: number;
  liquidity: SpinLiquiditySnapshot;
  resultHash: string;
  roll: number;
  randomOutcome: SpinOutcome;
  effectiveOutcome: SpinOutcome;
  outcomeReason: "random" | "liquidity";
  payoutMinor: number;
}

export interface SpinProofVerification {
  valid: boolean;
  commitmentValid: boolean;
  resultHashValid: boolean;
  calculationValid: boolean;
}

export interface SpinComment {
  id: string;
  authorName: string;
  avatarSeed: string;
  text: string;
  createdAt: string;
  isOwn: boolean;
}

export interface SpinCommentFeed {
  items: SpinComment[];
  onlineCount: number;
}

export function fetchSpinRules(): Promise<SpinRules> {
  return spin.get<SpinRules>("/spin/rules");
}

export function fetchSpinBalance(): Promise<ArkjetBalance> {
  return spin.authedGet<ArkjetBalance>("/spin/balance");
}

export function fetchSpinFundingConfig(): Promise<ArkjetFundingConfig> {
  return spin.get<ArkjetFundingConfig>("/spin/funding/config");
}

export function confirmSpinDeposit(txHash: string): Promise<ArkjetDeposit> {
  return spin.post<ArkjetDeposit>("/spin/funding/deposits/confirm", { txHash });
}

export function createSpinWithdrawal(
  amount: string,
  idempotencyKey: string
): Promise<ArkjetWithdrawal> {
  return spin.post<ArkjetWithdrawal>("/spin/funding/withdrawals", {
    amount,
    idempotencyKey,
  });
}

export function fetchSpinHistory(limit = 20, offset = 0): Promise<SpinHistory> {
  return spin.authedGet<SpinHistory>("/spin/wagers/history", { limit, offset });
}

export function prepareSpin(idempotencyKey: string): Promise<SpinWager> {
  return spin.post<SpinWager>("/spin/wagers/prepare", { idempotencyKey });
}

export function playSpin(wagerId: string, input: PlaySpinInput): Promise<SpinWager> {
  return spin.post<SpinWager>(`/spin/wagers/${wagerId}/play`, input);
}

export function fetchSpinProof(wagerId: string): Promise<SpinProof> {
  return spin.get<SpinProof>(`/spin/proofs/${wagerId}`);
}

export function verifySpinProof(proof: SpinProof): Promise<SpinProofVerification> {
  return spin.publicPost<SpinProofVerification>("/spin/proofs/verify", proof);
}

export function fetchSpinComments(): Promise<SpinCommentFeed> {
  return spin.authedGet<SpinCommentFeed>("/comments/spin-da-bottle", { limit: 40 });
}

export function postSpinComment(text: string): Promise<SpinComment> {
  return spin.post<SpinComment>("/comments/spin-da-bottle", { text });
}

export function refreshSpinCommentPresence(): Promise<{ onlineCount: number }> {
  return spin.post<{ onlineCount: number }>("/comments/spin-da-bottle/presence");
}
