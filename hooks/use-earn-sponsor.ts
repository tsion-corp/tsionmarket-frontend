"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkSponsorName,
  checkSponsorSlug,
  createSponsor,
  fetchCurrentSponsor,
  saveSponsorProfile,
} from "@/lib/earn/api/sponsors";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { CreateSponsorInput, SponsorProfileInput } from "@/lib/earn/api/types";

// Long enough that a name is checked once the sponsor stops typing it, not
// once per keystroke.
const CHECK_DEBOUNCE_MS = 400;

// Below this a name is still being typed and the answer would be noise.
const MIN_CHECK_LENGTH = 3;

export const SPONSOR_KEYS = {
  current: ["earn", "sponsor"] as const,
  nameAvailable: (name: string) => ["earn", "sponsor", "check-name", name] as const,
  slugAvailable: (slug: string) => ["earn", "sponsor", "check-slug", slug] as const,
};

// The company the signed-in user owns, or null when they have not made one.
// Null is a normal state here, so `sponsor === null` with no error means "show
// the sign-up prompt", not "something failed".
export function useCurrentSponsor() {
  const query = useQuery({
    queryKey: SPONSOR_KEYS.current,
    queryFn: fetchCurrentSponsor,
  });

  return {
    sponsor: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

// Shared shape for the two availability checks. `available` is null while the
// answer is unknown, so the form can stay quiet instead of flashing "taken".
function useAvailability(
  value: string,
  keyFor: (value: string) => readonly unknown[],
  check: (value: string) => Promise<boolean>
) {
  const debounced = useDebouncedValue(value.trim(), CHECK_DEBOUNCE_MS);
  const longEnough = debounced.length >= MIN_CHECK_LENGTH;

  const query = useQuery({
    queryKey: keyFor(debounced),
    queryFn: () => check(debounced),
    enabled: longEnough,
  });

  return {
    available: longEnough && query.data !== undefined ? query.data : null,
    isChecking: longEnough && query.isFetching,
    // The value the answer belongs to, so a form does not apply a stale result
    // to what is currently in the field.
    checked: debounced,
  };
}

export function useSponsorNameAvailable(name: string) {
  return useAvailability(name, SPONSOR_KEYS.nameAvailable, checkSponsorName);
}

export function useSponsorSlugAvailable(slug: string) {
  return useAvailability(slug, SPONSOR_KEYS.slugAvailable, checkSponsorSlug);
}

export function useCreateSponsor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSponsorInput) => createSponsor(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPONSOR_KEYS.current });
    },
  });
}

export function useSaveSponsorProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SponsorProfileInput) => saveSponsorProfile(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SPONSOR_KEYS.current });
    },
  });
}
