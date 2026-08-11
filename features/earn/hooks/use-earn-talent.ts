"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { completeTalentProfile, fetchTalentProfile } from "@/features/earn/lib/api/talent";
import type { TalentProfileInput } from "@/features/earn/lib/api/types";

export const TALENT_KEYS = {
  profile: ["earn", "talent", "profile"] as const,
};

// The caller's own profile. `needsProfile` is what gates entering a listing:
// the service refuses a submission until it is filled in, so a screen asks this
// before offering the submit form rather than after a rejected request.
export function useTalentProfile() {
  const query = useQuery({
    queryKey: TALENT_KEYS.profile,
    queryFn: fetchTalentProfile,
  });

  return {
    profile: query.data ?? null,
    // Undefined while loading, so a caller never briefly treats a complete
    // profile as missing and shows the form over the top of the real one.
    needsProfile: query.data === undefined ? undefined : !query.data?.isTalentFilled,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useCompleteTalentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TalentProfileInput) => completeTalentProfile(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TALENT_KEYS.profile });
    },
  });
}
