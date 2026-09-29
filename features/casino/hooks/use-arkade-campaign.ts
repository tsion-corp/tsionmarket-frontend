"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ARKADE_CAMPAIGN_QUERY_KEY,
  fetchCurrentArkadeCampaign,
} from "@/features/casino/lib/api/arkjet";

export function useArkadeCampaign(enabled: boolean, playerId: string | null) {
  return useQuery({
    queryKey: [...ARKADE_CAMPAIGN_QUERY_KEY, playerId],
    queryFn: fetchCurrentArkadeCampaign,
    enabled: enabled && Boolean(playerId),
    retry: false,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const status = query.state.data?.campaign.status;
      return status === "active" || status === "upcoming" ? 5_000 : false;
    },
  });
}
