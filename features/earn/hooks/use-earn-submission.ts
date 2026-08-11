"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkSubmission,
  createSubmission,
  fetchMySubmission,
  fetchMySubmissions,
} from "@/features/earn/lib/api/submissions";
import type { CreateSubmissionInput } from "@/features/earn/lib/api/types";

export const SUBMISSION_KEYS = {
  check: (listingId: string) => ["earn", "submission", "check", listingId] as const,
  mine: (listingId: string) => ["earn", "submission", "mine", listingId] as const,
  all: ["earn", "submission", "all-mine"] as const,
};

// Everything the caller has entered. Answers "what did I apply for and did I
// win" in one place, which per-listing checks cannot: they need the listing in
// hand already.
export function useMySubmissions() {
  const query = useQuery({
    queryKey: SUBMISSION_KEYS.all,
    queryFn: fetchMySubmissions,
  });

  return {
    submissions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// Whether this user already entered, and once winners are out, how they did.
export function useSubmissionCheck(listingId: string | null) {
  const query = useQuery({
    queryKey: SUBMISSION_KEYS.check(listingId ?? "none"),
    queryFn: () => checkSubmission(listingId as string),
    enabled: !!listingId,
  });

  return {
    check: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useMySubmission(listingId: string | null) {
  const query = useQuery({
    queryKey: SUBMISSION_KEYS.mine(listingId ?? "none"),
    queryFn: () => fetchMySubmission(listingId as string),
    enabled: !!listingId,
  });

  return {
    submission: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useCreateSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubmissionInput) => createSubmission(input),
    onSuccess: (_submission, input) => {
      void queryClient.invalidateQueries({ queryKey: SUBMISSION_KEYS.check(input.listingId) });
      void queryClient.invalidateQueries({ queryKey: SUBMISSION_KEYS.mine(input.listingId) });
      // A new entry has to appear on the applications screen without a reload.
      void queryClient.invalidateQueries({ queryKey: SUBMISSION_KEYS.all });
    },
  });
}
