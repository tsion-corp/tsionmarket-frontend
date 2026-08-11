"use client";

// The minimum a line needs to be rendered here. Chess and draughts each have
// their own chat message type; both satisfy this, so one feed serves both.
export interface LiveChatLine {
  id: number;
  author: string;
  text: string;
}

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

// Bet announcements are composed by the bettor's client with a leading slot
// machine mark in every locale, so the mark doubles as the wire-level flag
// that a line is a stake event and should render as a highlight banner, the
// way a gift lands in a TikTok live rather than as an ordinary comment.
const BET_MARK = "🎰";
function isBetLine(line: LiveChatLine): boolean {
  return line.text.startsWith(BET_MARK);
}

function authorColor(author: string, viewer: string | null): string {
  if (viewer && author.toLowerCase() === viewer.toLowerCase()) return OWN_COLOR;
  let hash = 0;
  const key = author.toLowerCase();
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

export function LiveChatFeed<T extends LiveChatLine>({
  messages,
  labelFor,
  emptyHint,
  viewer = null,
  className = "",
}: {
  messages: T[];
  labelFor: (line: T) => string;
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
                {isBetLine(line) ? (
                  <div className="ws-live-bubble ws-live-bet mt-2 flex w-fit max-w-full items-center gap-2.5 rounded-2xl px-3 py-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-400/20 text-[14px]">
                      {BET_MARK}
                    </span>
                    <span className="min-w-0">
                      <span className="mr-2 text-[11px] font-semibold text-amber-300">
                        {labelFor(line)}
                      </span>
                      <span className="text-[13px] leading-5 font-semibold break-words text-white">
                        {line.text.slice(BET_MARK.length).trim()}
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="ws-live-bubble mt-2 w-fit max-w-full rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-[2px]">
                    <span
                      className="mr-2 text-[11px] font-semibold"
                      style={{ color: authorColor(line.author, viewer) }}
                    >
                      {labelFor(line)}
                    </span>
                    <span className="text-[13px] leading-5 break-words text-white">
                      {line.text}
                    </span>
                  </div>
                )}
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
        /* A bet banner lands with a spring and a passing shine, then keeps
           a steady amber glow so it stays findable in the column. */
        @keyframes wsLiveBetIn {
          0% { opacity: 0; transform: translateY(12px) scale(0.92); }
          60% { opacity: 1; transform: translateY(-2px) scale(1.03); }
          100% { opacity: 1; transform: none; }
        }
        @keyframes wsLiveBetShine {
          from { background-position: -160% 0; }
          to { background-position: 260% 0; }
        }
        .ws-live-bet {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(251, 191, 36, 0.45);
          background: linear-gradient(100deg, rgba(251, 191, 36, 0.24), rgba(251, 146, 60, 0.12) 55%, rgba(251, 191, 36, 0.2));
          box-shadow: 0 0 18px rgba(251, 191, 36, 0.18);
          animation: wsLiveBetIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
        }
        .ws-live-bet::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.35) 50%, transparent 60%);
          background-size: 200% 100%;
          animation: wsLiveBetShine 1.4s ease-out 0.25s backwards;
        }
      `}</style>
    </div>
  );
}
