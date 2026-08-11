"use client";

import { useMemo, useState } from "react";
import { useDraughtsMatchSocial } from "@/features/casino/hooks/use-draughts-match";
import { truncateAddress } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

// Chat is not here: it is the match's live room and sits beside the board, the
// way it does on the chess screens. This panel is the quiet, personal side.
type Tab = "notes" | "comments";

const TABS: { id: Tab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "comments", label: "Comments" },
];

const EVM_WALLET = /^0x[0-9a-fA-F]{40}$/u;

function authorLabel(author: string, wallet: string | null): string {
  if (wallet && author.toLowerCase() === wallet.toLowerCase()) return "You";
  return EVM_WALLET.test(author) ? truncateAddress(author) : author;
}

interface MatchSocialProps {
  matchId: string;
  wallet: string | null;
  /** Players get their own private room; spectators only ever see the open one. */
  isPlayer: boolean;
  /** Ply a new comment attaches to, which is wherever the game has reached. */
  ply: number;
}

export function MatchSocial({ matchId, wallet, isPlayer, ply }: MatchSocialProps) {
  const [tab, setTab] = useState<Tab>("notes");
  // Only the public room is read here, so this panel never opens a second
  // subscription for a room the chat sidebar is already showing.
  const { comments, note, saveNote, saveComment, removeComment } = useDraughtsMatchSocial(
    matchId,
    wallet,
    "spectator"
  );

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex border-b border-white/10">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`flex-1 cursor-pointer px-3 py-2.5 font-sans text-[13px] transition-colors ${
              tab === entry.id
                ? "border-b-2 border-white text-white"
                : "text-white/45 hover:text-white/70"
            }`}
          >
            {entry.label}
            {entry.id === "comments" && comments.length > 0 ? (
              <span className="ml-1.5 text-white/35 tabular-nums">{comments.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="p-3.5">
        {tab === "notes" ? (
          <NotesTab note={note} onSave={saveNote} canEdit={isPlayer && !!wallet} />
        ) : (
          <CommentsTab
            comments={comments}
            wallet={wallet}
            ply={ply}
            canPost={!!wallet}
            onSave={saveComment}
            onDelete={removeComment}
          />
        )}
      </div>
    </section>
  );
}

function NotesTab({
  note,
  onSave,
  canEdit,
}: {
  note: string;
  onSave: (text: string) => Promise<void>;
  canEdit: boolean;
}) {
  const [saving, setSaving] = useState(false);
  // The saved note arrives after the first render, and again after a save. The
  // box tracks which server text it was seeded from, so a newly loaded note is
  // adopted during render without an effect, while typing in between is kept.
  const [edit, setEdit] = useState<{ source: string; draft: string }>({
    source: note,
    draft: note,
  });
  if (edit.source !== note) setEdit({ source: note, draft: note });

  const draft = edit.draft;
  const setDraft = (next: string) => setEdit({ source: note, draft: next });
  const dirty = draft !== note;

  if (!canEdit) {
    return (
      <p className="py-6 text-center font-sans text-[13px] text-white/35">
        Notes are private to the players in this game.
      </p>
    );
  }

  return (
    <>
      <p className="mb-2 font-sans text-[11px] text-white/30">
        Only you can see this. It stays with the game.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        maxLength={2000}
        placeholder="Notes on this game"
        className="w-full resize-none rounded-[12px] border border-white/12 bg-transparent px-3 py-2.5 font-sans text-[14px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none"
      />
      <button
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(draft);
            toast.success("Note saved.");
          } catch (cause) {
            toast.error(friendlyError(cause, "Couldn't save that note."));
          } finally {
            setSaving(false);
          }
        }}
        disabled={saving || !dirty}
        className="text-ink mt-2 w-full cursor-pointer rounded-[12px] bg-white py-2.5 font-sans text-[14px] font-semibold hover:opacity-90 disabled:opacity-40"
      >
        {saving ? "Saving…" : dirty ? "Save note" : "Saved"}
      </button>
    </>
  );
}

function CommentsTab({
  comments,
  wallet,
  ply,
  canPost,
  onSave,
  onDelete,
}: {
  comments: ReturnType<typeof useDraughtsMatchSocial>["comments"];
  wallet: string | null;
  ply: number;
  canPost: boolean;
  onSave: (ply: number, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const byPly = useMemo(
    () => [...comments].sort((left, right) => left.ply - right.ply),
    [comments]
  );

  return (
    <>
      <p className="mb-2 font-sans text-[11px] text-white/30">
        Pinned to a move, so they read back alongside the game.
      </p>
      <ul className="mb-3 max-h-52 space-y-2 overflow-y-auto">
        {byPly.length === 0 ? (
          <li className="py-6 text-center font-sans text-[13px] text-white/35">No comments yet.</li>
        ) : (
          byPly.map((comment) => (
            <li key={comment.id} className="rounded-[10px] bg-white/[0.03] px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-sans text-[12px] text-white/40">
                  Move {Math.floor((comment.ply - 1) / 2) + 1} ·{" "}
                  {authorLabel(comment.author, wallet)}
                </span>
                {wallet && comment.author.toLowerCase() === wallet.toLowerCase() ? (
                  <button
                    onClick={async () => {
                      try {
                        await onDelete(comment.id);
                      } catch (cause) {
                        toast.error(friendlyError(cause, "Couldn't delete that comment."));
                      }
                    }}
                    className="shrink-0 cursor-pointer font-sans text-[12px] text-white/30 hover:text-red-400"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 font-sans text-[13px] leading-snug text-white/80">
                {comment.text}
              </p>
            </li>
          ))
        )}
      </ul>
      {canPost ? (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder={ply > 0 ? `Comment on move ${Math.floor((ply - 1) / 2) + 1}` : "Comment"}
            className="min-w-0 flex-1 rounded-[12px] border border-white/12 bg-transparent px-3 py-2 font-sans text-[14px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none"
          />
          <button
            onClick={async () => {
              const text = draft.trim();
              if (!text) return;
              setBusy(true);
              try {
                await onSave(Math.max(1, ply), text);
                setDraft("");
              } catch (cause) {
                toast.error(friendlyError(cause, "Couldn't save that comment."));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || !draft.trim()}
            className="text-ink shrink-0 cursor-pointer rounded-[12px] bg-white px-4 py-2 font-sans text-[14px] font-semibold hover:opacity-90 disabled:opacity-40"
          >
            Post
          </button>
        </div>
      ) : (
        <p className="font-sans text-[12px] text-white/30">Sign in to comment.</p>
      )}
    </>
  );
}
