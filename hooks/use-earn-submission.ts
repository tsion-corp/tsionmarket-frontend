"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkSubmission, createSubmission, fetchMySubmission } from "@/lib/earn/api/submissions";
import type { CreateSubmissionInput } from "@/lib/earn/api/types";

export const SUBMISSION_KEYS = {
  check: (listingId: string) => ["earn", "submission", "check", listingId] as const,
  mine: (listingId: string) => ["earn", "submission", "mine", listingId] as const,
};

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
    },
  });
}
