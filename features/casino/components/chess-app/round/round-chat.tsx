"use client";

import { useEffect, useRef } from "react";
import type { LiveChatLine } from "@/features/casino/components/live-chat-feed";

export function RoundChatFeed<T extends LiveChatLine>({
  messages,
  labelFor,
  emptyHint,
  viewer,
}: {
  messages: T[];
  labelFor: (line: T) => string;
  emptyHint: string;
  viewer: string | null;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  return (
    <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto py-2 text-[1em]">
      {messages.length === 0 ? (
        <div className="px-3 py-2 text-white/42">{emptyHint}</div>
      ) : (
        messages.map((line) => {
          const own = viewer !== null && line.author.toLowerCase() === viewer.toLowerCase();
          return (
            <div
              key={line.id}
              className={`border-l-[3px] px-[0.7em] py-[0.42em] leading-[1.35] ${
                own ? "border-[#629924]" : "border-transparent"
              }`}
            >
              <span className="mr-[0.65em] font-semibold text-white/64">{labelFor(line)}</span>
              <span className="break-words text-white/70">{line.text}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
