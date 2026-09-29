"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSpinComments,
  postSpinComment,
  refreshSpinCommentPresence,
  type SpinComment,
  type SpinCommentFeed,
} from "@/features/casino/lib/api/spin";
import { readRetryAt } from "@/lib/api/circuit-store";
import { pollUnlessFailing } from "@/lib/query-poll";

const COMMENTS_KEY = ["casino", "spin-da-bottle", "comments"] as const;
const COMMENTS_PATH = "/api/arkjet/comments/spin-da-bottle";

function mergeComment(items: SpinComment[], comment: SpinComment) {
  return [...items.filter((item) => item.id !== comment.id), comment].slice(-40);
}

export function useSpinComments(enabled: boolean) {
  const queryClient = useQueryClient();
  const comments = useQuery({
    queryKey: COMMENTS_KEY,
    queryFn: fetchSpinComments,
    enabled,
    refetchInterval: pollUnlessFailing(10_000),
    staleTime: 10_000,
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
  });
  const send = useMutation({
    mutationFn: postSpinComment,
    onSuccess: (comment) => {
      queryClient.setQueryData<SpinCommentFeed>(COMMENTS_KEY, (current) => ({
        onlineCount: current?.onlineCount ?? 1,
        items: mergeComment(current?.items ?? [], comment),
      }));
    },
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const heartbeat = async () => {
      if (document.visibilityState === "hidden" || readRetryAt(COMMENTS_PATH)) return;
      try {
        const presence = await refreshSpinCommentPresence();
        if (!active) return;
        queryClient.setQueryData<SpinCommentFeed>(COMMENTS_KEY, (current) =>
          current ? { ...current, onlineCount: presence.onlineCount } : current
        );
      } catch {
        // The feed poll retries presence after a transient backend failure.
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 20_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, queryClient]);

  return {
    items: comments.data?.items ?? [],
    onlineCount: comments.data?.onlineCount ?? (enabled ? 1 : 0),
    loading: comments.isLoading,
    error: comments.error,
    send: send.mutateAsync,
    sending: send.isPending,
  };
}
