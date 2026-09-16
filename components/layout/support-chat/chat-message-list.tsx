"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { RichTextContent } from "./rich-text-content";
import { MessageAttachments, type ChatAttachment } from "./attachment-preview";

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: number;
  attachments?: ChatAttachment[];
}

interface ChatMessageListProps {
  messages: ChatMessage[];
  isTyping?: boolean;
  onSelectFaq?: (faqKey: string, promptText: string) => void;
}

export function ChatMessageList({ messages, isTyping = false, onSelectFaq }: ChatMessageListProps) {
  const t = useTranslations("supportChat");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, isTyping]);

  const faqItems = [
    { key: "faqDeposit", label: t("faqDeposit"), prompt: t("faqDepositPrompt") },
    { key: "faqTrade", label: t("faqTrade"), prompt: t("faqTradePrompt") },
    { key: "faqSecurity", label: t("faqSecurity"), prompt: t("faqSecurityPrompt") },
    { key: "faqBugReport", label: t("faqBugReport"), prompt: t("faqBugPrompt") },
  ];

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="ws-no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-3">
      {/* Intro Welcome Card */}
      <div className="flex flex-col items-center space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
        <div className="grid size-12 place-items-center rounded-full border border-white/15 bg-white/10 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/support.png"
            alt="Support"
            width={32}
            height={32}
            className="h-8 w-8 grayscale"
          />
        </div>
        <h4 className="text-[13px] font-semibold text-white">{t("welcomeTitle")}</h4>
        <p className="max-w-[260px] text-[11px] text-white/60">{t("welcomeSubtitle")}</p>
      </div>

      {/* Quick FAQ Starter chips */}
      {messages.length <= 1 && onSelectFaq && (
        <div className="space-y-1.5 pt-1">
          <span className="px-1 text-[10px] font-semibold tracking-wider text-white/40 uppercase">
            {t("suggestedTopics")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {faqItems.map((faq) => (
              <button
                key={faq.key}
                type="button"
                onClick={() => onSelectFaq(faq.key, faq.prompt)}
                className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/80 transition-all hover:bg-white/15 hover:text-white active:scale-95"
              >
                {faq.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message stream */}
      {messages.map((msg) => {
        const isUser = msg.sender === "user";

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isUser ? "items-end" : "items-start"} space-y-1`}
          >
            <div className="flex max-w-[85%] items-end gap-2">
              {!isUser && (
                <div className="mb-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/support.png"
                    alt=""
                    width={18}
                    height={18}
                    className="h-4 w-4 grayscale"
                  />
                </div>
              )}

              <div
                className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  isUser
                    ? "rounded-tr-sm bg-gradient-to-br from-zinc-100 to-zinc-300 font-medium text-zinc-950"
                    : "rounded-tl-sm border border-white/12 bg-white/[0.07] text-white backdrop-blur"
                }`}
              >
                {msg.text && (
                  <RichTextContent
                    content={msg.text}
                    className={isUser ? "text-zinc-950" : "text-white"}
                  />
                )}
                {msg.attachments && msg.attachments.length > 0 && (
                  <MessageAttachments attachments={msg.attachments} />
                )}
              </div>
            </div>

            <span className="px-2 font-mono text-[9px] text-white/40">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        );
      })}

      {/* Typing indicator */}
      {isTyping && (
        <div className="flex items-center gap-2">
          <div className="grid size-6 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/support.png" alt="" width={18} height={18} className="h-4 w-4 grayscale" />
          </div>
          <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-white/12 bg-white/[0.07] px-3 py-2">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
