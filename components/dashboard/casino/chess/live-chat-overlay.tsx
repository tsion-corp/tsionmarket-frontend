"use client";

import { useEffect, useRef, useState } from "react";
import { truncateAddress } from "@/lib/format";
import type { ChessChatMessage } from "@/lib/casino/api/types";

interface FloatItem {
  id: number;
  author: string;
  text: string;
}

// Chat lines drift up over the board and fade, the way a livestream floats
// incoming comments over the video. Only lines that arrive after mount float —
// the backlog already loaded stays in the side panel and never bursts onscreen —
// and at most a handful are shown at once so a busy chat does not bury the board.
export function LiveChatOverlay({ messages }: { messages: ChessChatMessage[] }) {
  const [items, setItems] = useState<FloatItem[]>([]);
  // null until the first run, which seeds "seen" with the existing backlog.
  const seen = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    const fresh = messages.filter((m) => !seen.current!.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seen.current!.add(m.id));
    setItems((prev) =>
      [...prev, ...fresh.map((m) => ({ id: m.id, author: m.author, text: m.text }))].slice(-5)
    );
    const ids = new Set(fresh.map((m) => m.id));
    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((it) => !ids.has(it.id)));
    }, 8200);
    return () => clearTimeout(timer);
  }, [messages]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {items.map((it) => (
        <div
          key={it.id}
          className="ws-float-chat absolute left-3 w-fit max-w-[85%] rounded-2xl bg-black/55 px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.35)] backdrop-blur-sm"
        >
          <span className="mr-2 text-[11px] font-medium text-white/55">
            {truncateAddress(it.author)}
          </span>
          <span className="text-[13px] leading-5 text-white">{it.text}</span>
        </div>
      ))}
      <style>{`
        @keyframes wsFloatChat {
          0% { bottom: 0.75rem; opacity: 0; }
          6% { opacity: 1; }
          88% { opacity: 1; }
          100% { bottom: 100%; opacity: 0; }
        }
        /* Each line rises from the foot of the board to the top and fades out,
           the way a livestream scrolls its comments up over the video. */
        .ws-float-chat { animation: wsFloatChat 8s linear forwards; }
      `}</style>
    </div>
  );
}
