"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchRwaAssets, fetchRwaCategories } from "@/lib/rwa-api";

const SIXTY_SECONDS = 60 * 1000;

export function useRwaAssets(filters: Record<string, string> = {}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["rwa-assets", filters],
    queryFn: () => fetchRwaAssets(filters),
    staleTime: SIXTY_SECONDS,
    refetchInterval: SIXTY_SECONDS,
  });
  return { assets: data ?? [], loading: isPending, error: isError, refetch };
}

export function useRwaCategories() {
  const { data } = useQuery({
    queryKey: ["rwa-categories"],
    queryFn: fetchRwaCategories,
    staleTime: 5 * SIXTY_SECONDS,
  });
  return data ?? [];
}
