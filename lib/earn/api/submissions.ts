"use client";

// The talent side of a listing: whether this user already entered, what they
// sent, and entering.

import { earnAuthedGet, earnPost } from "@/lib/earn/api/client";
import {
  toMySubmissions,
  toSubmission,
  toSubmissionCheck,
  type MySubmissionWire,
  type SubmissionCheckWire,
  type SubmissionWire,
} from "@/lib/earn/api/wire";
import {
  FIXTURE_MY_SUBMISSIONS,
  FIXTURE_SUBMISSION_CHECK,
  USE_FIXTURES,
} from "@/lib/earn/api/fixtures";
import type {
  CreateSubmissionInput,
  MySubmission,
  Submission,
  SubmissionCheck,
} from "@/lib/earn/api/types";

export async function checkSubmission(listingId: string): Promise<SubmissionCheck> {
  if (USE_FIXTURES) return FIXTURE_SUBMISSION_CHECK;
  return toSubmissionCheck(
    await earnAuthedGet<SubmissionCheckWire>("/submission/check", { listingId })
  );
}

// Null when the user has not entered this listing. Not having submitted is the
// normal state, so the service's 404 is not treated as a failure.
export async function fetchMySubmission(listingId: string): Promise<Submission | null> {
  if (USE_FIXTURES) return null;
  try {
    return toSubmission(await earnAuthedGet<SubmissionWire>("/submission/get", { id: listingId }));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "NOT_FOUND") return null;
    throw error;
  }
}

// Everything the caller has entered, newest first. The only view that answers
// "what have I applied for, and how did it go" without already knowing which
// listing to look at.
export async function fetchMySubmissions(): Promise<MySubmission[]> {
  if (USE_FIXTURES) return FIXTURE_MY_SUBMISSIONS;
  return toMySubmissions(await earnAuthedGet<MySubmissionWire[] | null>("/submission/mine"));
}

export interface ClaimInfo {
  claimable: boolean;
  escrowAddress?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  decimals?: number;
  // uint256 as a string; a JS number cannot hold 18-decimal amounts.
  amountMinor?: string;
  alreadyClaimed?: boolean;
}

// Where a winner's reward is held and how much is left to collect. Read from
// the contract, since nothing here tracks what has already been withdrawn.
export async function fetchClaimInfo(listingId: string): Promise<ClaimInfo> {
  if (USE_FIXTURES) return { claimable: false };
  return earnAuthedGet<ClaimInfo>("/submission/claim", { listingId });
}

export async function createSubmission(input: CreateSubmissionInput): Promise<Submission | null> {
  if (USE_FIXTURES) return null;
  return toSubmission(await earnPost<SubmissionWire>("/submission/create", input));
}
