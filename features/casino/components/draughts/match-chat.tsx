"use client";

import { useState } from "react";
import { LiveChatFeed } from "@/features/casino/components/live-chat-feed";
import { useDraughtsMatchSocial } from "@/features/casino/hooks/use-draughts-match";
import { truncateAddress } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";

const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/u;

// Who said it, from the point of view of whoever is reading. Seats are named so
// a spectator can follow the game, and the reader's own lines say "You".
function actorLabel(author: string, match: DraughtsMatch, viewer: string | null): string {
  const same = (left: string | null | undefined) =>
    !!left && left.toLowerCase() === author.toLowerCase();
  if (viewer && same(viewer)) return "You";
  if (same(match.white?.walletAddress)) return "White";
  if (same(match.black?.walletAddress)) return "Black";
  return EVM_WALLET.test(author) ? truncateAddress(author) : author;
}

interface MatchChatProps {
  match: DraughtsMatch;
  wallet: string | null;
  className?: string;
}

/**
 * The match's live chat. One public room, so both seats and everyone watching
 * read and write the same conversation.
 */
export function MatchChat({ match, wallet, className = "" }: MatchChatProps) {
  const { chat, sendChat } = useDraughtsMatchSocial(match.id, wallet, "spectator");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendChat(text);
      setDraft("");
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't send that message."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.05em] text-white/45 uppercase">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/70" />
        Live chat
      </div>

      <LiveChatFeed
        messages={chat}
        viewer={wallet}
        labelFor={(line) => actorLabel(line.author, match, wallet)}
        emptyHint="Players and everyone watching share this room."
        className="min-h-0 flex-1"
      />

      {wallet ? (
        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            maxLength={280}
            placeholder="Say something"
            className="min-w-0 flex-1 rounded-[12px] border border-white/12 bg-transparent px-3 py-2 font-sans text-[14px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none"
          />
          <button
            onClick={() => void submit()}
            disabled={sending || !draft.trim()}
            className="text-ink shrink-0 cursor-pointer rounded-[12px] bg-white px-4 py-2 font-sans text-[14px] font-semibold hover:opacity-90 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      ) : (
        <p className="mt-3 font-sans text-[12px] text-white/30">Sign in to join the chat.</p>
      )}
    </div>
  );
}
