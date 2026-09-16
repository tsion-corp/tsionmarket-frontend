"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChatHeader } from "./chat-header";
import { ChatMessageList, type ChatMessage } from "./chat-message-list";
import { ChatComposer } from "./chat-composer";
import type { ChatAttachment } from "./attachment-preview";
import { sendSupportChatMessage } from "@/lib/support-chat/client";

const CHAT_HISTORY_KEY = "wsws_support_chat_messages";

interface SupportChatWidgetProps {
  defaultOpen?: boolean;
}

export function SupportChatWidget({ defaultOpen = false }: SupportChatWidgetProps) {
  const t = useTranslations("supportChat");
  const topbarT = useTranslations("topbar");

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const welcomeMsg: ChatMessage = {
      id: "initial-welcome",
      sender: "agent",
      text: t("greetingMessage"),
      timestamp: Date.now(),
    };

    if (typeof window === "undefined" || !window.localStorage) {
      return [welcomeMsg];
    }

    try {
      const stored = window.localStorage.getItem(CHAT_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore storage parsing error
    }

    return [welcomeMsg];
  });

  // Save messages to local storage whenever they change
  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      if (messages.length > 0) {
        window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
      }
    } catch {
      // ignore storage write errors
    }
  }, [messages]);

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
  };

  const handleSendMessage = useCallback(
    async (text: string, attachments: ChatAttachment[]) => {
      const tempId = `user-${Date.now()}`;
      const userMsg: ChatMessage = {
        id: tempId,
        sender: "user",
        text,
        timestamp: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        const res = await sendSupportChatMessage(text);
        setIsTyping(false);

        if (res.ok && res.reply) {
          const aiMsg: ChatMessage = {
            id: `agent-${Date.now()}`,
            sender: "agent",
            text: res.reply,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, aiMsg]);
        } else {
          const fallbackMsg: ChatMessage = {
            id: `agent-${Date.now()}`,
            sender: "agent",
            text: res.error || t("defaultAgentReply"),
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, fallbackMsg]);
        }
      } catch (err) {
        console.error("[SupportChatWidget] Failed to send message:", err);
        setIsTyping(false);
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          sender: "agent",
          text: t("defaultAgentReply"),
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    },
    [t]
  );

  const handleSelectFaq = useCallback(
    (faqKey: string, promptText: string) => {
      handleSendMessage(promptText, []);
    },
    [handleSendMessage]
  );

  return (
    <>
      {/* Floating launcher trigger button */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={topbarT("support")}
          data-support-launcher
          className="group fixed right-[calc(var(--ws-frame-inset)+16px)] bottom-[calc(92px+env(safe-area-inset-bottom))] z-[80] flex cursor-pointer flex-col items-center gap-1 focus:outline-none md:right-6 md:bottom-6"
        >
          <span className="ws-glass relative grid size-[52px] place-items-center rounded-full shadow-[0_14px_40px_-12px_rgba(0,0,0,0.85)] transition-transform group-hover:scale-105 active:scale-95">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/support.png"
              alt="Support"
              width={36}
              height={36}
              className="h-9 w-9 grayscale"
            />
            {unreadCount > 0 && (
              <span className="animate-in zoom-in absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-black shadow-md">
                {unreadCount}
              </span>
            )}
          </span>
          <span className="text-[11px] font-medium text-white/60 transition-colors group-hover:text-white/85">
            {topbarT("support")}
          </span>
        </button>
      )}

      {/* Interactive Chat Panel Window */}
      {isOpen && (
        <div
          data-testid="support-chat-panel"
          className="fixed inset-0 z-[95] flex h-full w-full flex-col bg-zinc-950/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl md:inset-auto md:right-6 md:bottom-6 md:h-[580px] md:max-h-[calc(100dvh-48px)] md:w-[380px] md:rounded-2xl md:border md:border-white/15 md:bg-zinc-950/90 md:pt-0 md:pb-0"
        >
          <ChatHeader onClose={() => setIsOpen(false)} onMinimize={() => setIsOpen(false)} />

          <ChatMessageList messages={messages} isTyping={isTyping} onSelectFaq={handleSelectFaq} />

          <ChatComposer onSend={handleSendMessage} disabled={isTyping} />
        </div>
      )}
    </>
  );
}
