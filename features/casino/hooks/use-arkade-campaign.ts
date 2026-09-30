"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ARKADE_CAMPAIGN_QUERY_KEY,
  fetchCurrentArkadeCampaign,
} from "@/features/casino/lib/api/arkjet";

// The player's campaign journey, keyed by the wallet the request is
// authenticated as. The in-game badge and the two banners share this cache.
export function useArkadeCampaign(enabled: boolean, wallet: string | null) {
  return useQuery({
    queryKey: [...ARKADE_CAMPAIGN_QUERY_KEY, wallet],
    queryFn: fetchCurrentArkadeCampaign,
    enabled: enabled && Boolean(wallet),
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
