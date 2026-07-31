"use client";

// The talent side of a listing: whether this user already entered, what they
// sent, and entering.

import { earnGet, earnPost } from "@/lib/earn/api/client";
import {
  toSubmission,
  toSubmissionCheck,
  type SubmissionCheckWire,
  type SubmissionWire,
} from "@/lib/earn/api/wire";
import { FIXTURE_SUBMISSION_CHECK, USE_FIXTURES } from "@/lib/earn/api/fixtures";
import type { CreateSubmissionInput, Submission, SubmissionCheck } from "@/lib/earn/api/types";

export async function checkSubmission(listingId: string): Promise<SubmissionCheck> {
  if (USE_FIXTURES) return FIXTURE_SUBMISSION_CHECK;
  return toSubmissionCheck(await earnGet<SubmissionCheckWire>("/submission/check", { listingId }));
}

// Null when the user has not entered this listing. Not having submitted is the
// normal state, so the service's 404 is not treated as a failure.
export async function fetchMySubmission(listingId: string): Promise<Submission | null> {
  if (USE_FIXTURES) return null;
  try {
    return toSubmission(await earnGet<SubmissionWire>("/submission/get", { id: listingId }));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "NOT_FOUND") return null;
    throw error;
  }
}

export async function createSubmission(input: CreateSubmissionInput): Promise<Submission | null> {
  if (USE_FIXTURES) return null;
  return toSubmission(await earnPost<SubmissionWire>("/submission/create", input));
}
