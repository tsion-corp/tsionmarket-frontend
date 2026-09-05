"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchArkjetChat,
  postArkjetMessage,
  refreshArkjetPresence,
  setArkjetMessageLike,
  type ArkjetChatFeed,
  type ArkjetChatMessage,
} from "@/features/casino/lib/api/arkjet";

const CHAT_KEY = ["casino", "arkjet", "chat"] as const;

function mergeMessage(items: ArkjetChatMessage[], message: ArkjetChatMessage) {
  return [...items.filter((item) => item.id !== message.id), message].slice(-40);
}

export function useArkjetChat(enabled: boolean) {
  const queryClient = useQueryClient();
  const chat = useQuery({
    queryKey: CHAT_KEY,
    queryFn: fetchArkjetChat,
    enabled,
    refetchInterval: enabled ? 1_500 : false,
    staleTime: 500,
    retry: 2,
  });
  const send = useMutation({
    mutationFn: postArkjetMessage,
    onSuccess: (message) => {
      queryClient.setQueryData<ArkjetChatFeed>(CHAT_KEY, (current) => ({
        onlineCount: current?.onlineCount ?? 1,
        items: mergeMessage(current?.items ?? [], message),
      }));
    },
  });
  const like = useMutation({
    mutationFn: ({ messageId, liked }: { messageId: string; liked: boolean }) =>
      setArkjetMessageLike(messageId, liked),
    onMutate: async ({ messageId, liked }) => {
      await queryClient.cancelQueries({ queryKey: CHAT_KEY });
      const previous = queryClient.getQueryData<ArkjetChatFeed>(CHAT_KEY);
      queryClient.setQueryData<ArkjetChatFeed>(CHAT_KEY, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      viewerLiked: liked,
                      likeCount: Math.max(0, message.likeCount + (liked ? 1 : -1)),
                    }
                  : message
              ),
            }
          : current
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(CHAT_KEY, context.previous);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<ArkjetChatFeed>(CHAT_KEY, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((message) =>
                message.id === result.messageId
                  ? { ...message, viewerLiked: result.liked, likeCount: result.likeCount }
                  : message
              ),
            }
          : current
      );
    },
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const heartbeat = async () => {
      try {
        const presence = await refreshArkjetPresence();
        if (!active) return;
        queryClient.setQueryData<ArkjetChatFeed>(CHAT_KEY, (current) =>
          current ? { ...current, onlineCount: presence.onlineCount } : current
        );
      } catch {
        // The feed poll remains the recovery path for transient presence failures.
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
    items: chat.data?.items ?? [],
    onlineCount: chat.data?.onlineCount ?? (enabled ? 1 : 0),
    loading: chat.isLoading,
    error: chat.error,
    send: send.mutateAsync,
    sending: send.isPending,
    toggleLike: (message: ArkjetChatMessage) =>
      like.mutate({ messageId: message.id, liked: !message.viewerLiked }),
  };
}
