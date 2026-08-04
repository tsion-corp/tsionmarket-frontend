"use client";

import type { ChessChatMessage } from "@/lib/casino/api/types";

// Only the tail of the room is ever on screen; older lines are pushed out the
// masked top rather than scrolled to.
const VISIBLE = 14;

// A livestream-style chat feed: the newest lines sit at the foot of the
// column, each arrival rises in and pushes the older ones up, and everything
// dissolves toward the top instead of scrolling — the way comments float up a
// TikTok or Instagram live.
export function LiveChatFeed({
  messages,
  labelFor,
  emptyHint,
  className = "",
}: {
  messages: ChessChatMessage[];
  labelFor: (line: ChessChatMessage) => string;
  emptyHint: string;
  className?: string;
}) {
  const items = messages.slice(-VISIBLE);

  return (
    <div
      className={`relative flex flex-col justify-end overflow-hidden ${className}`}
      style={{
        maskImage: "linear-gradient(to bottom, transparent 0%, black 24%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 24%)",
      }}
    >
      {items.length === 0 ? (
        <div className="pb-1 text-[12.5px] leading-5 text-white/40">{emptyHint}</div>
      ) : (
        <div className="space-y-2">
          {items.map((line) => (
            <div
              key={line.id}
              className="ws-live-chat-in w-fit max-w-full rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-[2px]"
            >
              <span className="mr-2 text-[11px] font-semibold text-white/50">{labelFor(line)}</span>
              <span className="text-[13px] leading-5 break-words text-white">{line.text}</span>
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes wsLiveChatIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }
        .ws-live-chat-in { animation: wsLiveChatIn 0.35s ease-out backwards; }
      `}</style>
    </div>
  );
}
