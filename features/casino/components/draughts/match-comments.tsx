"use client";

import { useMemo, useState } from "react";
import { useDraughtsMatchSocial } from "@/features/casino/hooks/use-draughts-match";
import type { DraughtsMatch } from "@/features/casino/lib/draughts/types";
import { friendlyError } from "@/lib/errors";
import { truncateAddress } from "@/lib/format";
import { toast } from "@/lib/toast";

const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/u;

function authorLabel(author: string, match: DraughtsMatch, wallet: string | null): string {
  const same = (candidate: string | null | undefined) =>
    !!candidate && candidate.toLowerCase() === author.toLowerCase();
  if (wallet && same(wallet)) return "You";
  if (same(match.white?.walletAddress)) return "White";
  if (same(match.black?.walletAddress)) return "Black";
  return EVM_WALLET.test(author) ? truncateAddress(author) : author;
}

export function MatchComments({
  match,
  wallet,
  ply = match.ply,
  className = "",
}: {
  match: DraughtsMatch;
  wallet: string | null;
  ply?: number;
  className?: string;
}) {
  const { comments, saveComment, removeComment } = useDraughtsMatchSocial(
    match.id,
    wallet,
    "spectator",
    { comments: true }
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(
    () => [...comments].sort((left, right) => left.ply - right.ply),
    [comments]
  );
  const canPost = !!wallet && ply > 0 && ply <= match.ply;

  const submit = async () => {
    const text = draft.trim();
    if (!text || !canPost || busy) return;
    setBusy(true);
    try {
      await saveComment(ply, text);
      setDraft("");
    } catch (cause) {
      toast.error(friendlyError(cause, "Couldn't post that comment."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11.5px] font-semibold tracking-[0.05em] text-white/45 uppercase">
          Move comments
        </span>
        {ply > 0 ? (
          <span className="font-mono text-[10.5px] text-white/30">
            Move {Math.floor((ply - 1) / 2) + 1}
          </span>
        ) : null}
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {sorted.length === 0 ? (
          <li className="flex h-full min-h-24 items-center justify-center text-center text-[12px] text-white/34">
            No comments on this game yet.
          </li>
        ) : (
          sorted.map((comment) => (
            <li key={comment.id} className="rounded-[8px] bg-white/[0.035] px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-white/35">
                <span>
                  Move {Math.floor((comment.ply - 1) / 2) + 1} ·{" "}
                  {authorLabel(comment.author, match, wallet)}
                </span>
                {wallet && comment.author.toLowerCase() === wallet.toLowerCase() ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await removeComment(comment.id);
                      } catch (cause) {
                        toast.error(friendlyError(cause, "Couldn't delete that comment."));
                      }
                    }}
                    className="cursor-pointer hover:text-red-300"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] leading-5 text-white/76">{comment.text}</p>
            </li>
          ))
        )}
      </ul>

      {wallet ? (
        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            disabled={!canPost}
            maxLength={500}
            placeholder={ply > 0 ? "Comment on this move" : "Comments open after the first move"}
            className="min-w-0 flex-1 rounded-[8px] border border-white/12 bg-transparent px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none disabled:opacity-45"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canPost || busy || !draft.trim()}
            className="cursor-pointer rounded-[8px] bg-white px-4 py-2 text-[13px] font-semibold text-black disabled:opacity-35"
          >
            Post
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-white/30">Sign in to comment.</p>
      )}
    </div>
  );
}
