"use client";

import type { ChessChatMessage } from "@/lib/casino/api/types";

// Only the tail of the room is ever on screen; older lines are pushed out the
// masked top rather than scrolled to.
const VISIBLE = 12;

// A livestream-style chat feed, the way comments float up a TikTok live: the
// newest line grows in at the foot of the column — physically pushing the
// whole stack upward in one smooth motion — and lines dissolve progressively
// as they ride toward the top, where a long gradient mask fades them out.
// Name colors, live-stream style: the viewer's own lines sign in green, and
// every other author keeps one stable hue picked from a palette that reads
// well on the dark chrome.
const OWN_COLOR = "#4ade80";
const AUTHOR_COLORS = [
  "#fbbf24",
  "#38bdf8",
  "#fb7185",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#a3e635",
  "#e879f9",
];

function authorColor(author: string, viewer: string | null): string {
  if (viewer && author.toLowerCase() === viewer.toLowerCase()) return OWN_COLOR;
  let hash = 0;
  const key = author.toLowerCase();
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

export function LiveChatFeed({
  messages,
  labelFor,
  emptyHint,
  viewer = null,
  className = "",
}: {
  messages: ChessChatMessage[];
  labelFor: (line: ChessChatMessage) => string;
  emptyHint: string;
  // The viewer's wallet, so their own lines carry the green signature.
  viewer?: string | null;
  className?: string;
}) {
  const items = messages.slice(-VISIBLE);

  return (
    <div
      className={`relative flex flex-col justify-end overflow-hidden ${className}`}
      style={{
        maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 30%, black 62%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) 30%, black 62%)",
      }}
    >
      {items.length === 0 ? (
        <div className="pb-1 text-[12.5px] leading-5 text-white/40">{emptyHint}</div>
      ) : (
        <div>
          {items.map((line) => (
            // The outer grid animates 0fr -> 1fr, so the entry opens up from
            // zero height and everything above glides upward instead of
            // jumping a row.
            <div key={line.id} className="ws-live-slot">
              <div className="min-h-0">
                <div className="ws-live-bubble mt-2 w-fit max-w-full rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-[2px]">
                  <span
                    className="mr-2 text-[11px] font-semibold"
                    style={{ color: authorColor(line.author, viewer) }}
                  >
                    {labelFor(line)}
                  </span>
                  <span className="text-[13px] leading-5 break-words text-white">{line.text}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes wsLiveSlot {
          from { grid-template-rows: 0fr; }
          to { grid-template-rows: 1fr; }
        }
        @keyframes wsLiveBubble {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        .ws-live-slot {
          display: grid;
          grid-template-rows: 1fr;
          animation: wsLiveSlot 0.4s ease-out backwards;
        }
        .ws-live-slot > div { overflow: hidden; }
        .ws-live-bubble { animation: wsLiveBubble 0.4s ease-out backwards; }
      `}</style>
    </div>
  );
}
