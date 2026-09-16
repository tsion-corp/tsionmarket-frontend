"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { ChatwootSession, ChatwootRawMessage } from "./types";
import { chatwootClient } from "./chatwoot-client";

export interface UseChatwootSocketOptions {
  session: ChatwootSession | null;
  enabled?: boolean;
  onMessageCreated?: (msg: ChatwootRawMessage) => void;
  onTypingStatusChange?: (isTyping: boolean) => void;
}

export function useChatwootSocket({
  session,
  enabled = true,
  onMessageCreated,
  onTypingStatusChange,
}: UseChatwootSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const isSubscribedRef = useRef(false);

  const onMessageCreatedRef = useRef(onMessageCreated);
  const onTypingStatusChangeRef = useRef(onTypingStatusChange);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    onMessageCreatedRef.current = onMessageCreated;
  }, [onMessageCreated]);

  useEffect(() => {
    onTypingStatusChangeRef.current = onTypingStatusChange;
  }, [onTypingStatusChange]);

  const startFallbackPolling = useCallback(() => {
    if (pollIntervalRef.current || !session) return;
    pollIntervalRef.current = setInterval(async () => {
      if (!session) return;
      try {
        const messages = await chatwootClient.getMessages(session);
        if (messages.length > 0 && onMessageCreatedRef.current) {
          const latest = messages[messages.length - 1];
          if (latest) {
            onMessageCreatedRef.current(latest);
          }
        }
      } catch {
        // ignore
      }
    }, 3500);
  }, [session]);

  const stopFallbackPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !session?.pubsubToken || typeof window === "undefined") {
      return;
    }

    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const wsBaseUrl =
      process.env.NEXT_PUBLIC_SUPPORT_CHAT_WS_URL || "wss://support.tsionark.com/cable";

    try {
      const ws = new WebSocket(wsBaseUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        retryCountRef.current = 0;
        stopFallbackPolling();

        const identifier = JSON.stringify({
          channel: "WidgetEventsChannel",
          pubsub_token: session.pubsubToken,
        });

        const subscribeMsg = JSON.stringify({
          command: "subscribe",
          identifier,
        });

        ws.send(subscribeMsg);
        isSubscribedRef.current = true;
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "ping" || payload.type === "welcome") {
            return;
          }

          if (payload.type === "confirm_subscription") {
            isSubscribedRef.current = true;
            return;
          }

          if (payload.message && typeof payload.message === "object") {
            const msgObj = payload.message as { event?: string; data?: ChatwootRawMessage };
            const chatEvent = msgObj.event;
            const data = msgObj.data;

            if (chatEvent === "message.created" && data) {
              onMessageCreatedRef.current?.(data);
            } else if (chatEvent === "conversation.typing_on") {
              onTypingStatusChangeRef.current?.(true);
            } else if (chatEvent === "conversation.typing_off") {
              onTypingStatusChangeRef.current?.(false);
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
        startFallbackPolling();
      };

      ws.onclose = () => {
        setIsConnected(false);
        isSubscribedRef.current = false;
        wsRef.current = null;

        if (enabled && session) {
          startFallbackPolling();
          const delay = Math.min(10000, 1000 * Math.pow(1.5, retryCountRef.current));
          retryCountRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, delay);
        }
      };
    } catch {
      startFallbackPolling();
    }
  }, [enabled, session, startFallbackPolling, stopFallbackPolling]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (enabled && session) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopFallbackPolling();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, session, connect, stopFallbackPolling]);

  return {
    isConnected,
  };
}
