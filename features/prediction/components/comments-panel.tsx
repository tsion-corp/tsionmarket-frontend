"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Identicon } from "@/components/ui/identicon";
import { useComments } from "@/features/prediction/hooks/use-prediction-detail";
import { usePredictionComments } from "@/features/prediction/hooks/use-prediction-comments";
import { shortAddress, timeAgo } from "@/features/prediction/lib/format";
import type { Comment } from "@/features/prediction/lib/types";

// Comments panel — signature-verified social thread on a market or event, like
// Polymarket's "Comments" tab. Posting signs the body with the user's wallet
// (no gas, no server key). Threaded one level deep (top-level + replies).

interface CommentsPanelProps {
  // Exactly one of these identifies the scope.
  marketId?: string;
  groupId?: string;
}

export function CommentsPanel({ marketId, groupId }: CommentsPanelProps) {
  const t = useTranslations("prediction");
  const scope = groupId
    ? ({ scope: "group", scopeId: groupId } as const)
    : ({ scope: "market", scopeId: marketId as string } as const);

  const { data: comments, isLoading } = useComments(groupId ? { groupId } : { marketId }, 100);
  const { submit, like, busy, canComment } = usePredictionComments(scope);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Group into top-level + replies for a one-level thread.
  const { roots, repliesByParent } = useMemo(() => groupThread(comments ?? []), [comments]);

  const onSubmit = async () => {
    setError(null);
    try {
      await submit(draft);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("commentFailed"));
    }
  };

  return (
    <div className="ws-card p-5 sm:p-6">
      <span className="ws-display mb-4 block text-[15px]">{t("comments")}</span>

      {/* Composer */}
      <div className="mb-5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={canComment ? t("commentPlaceholder") : t("commentConnect")}
          disabled={!canComment || busy}
          className="ws-inset w-full resize-none rounded-xl px-3.5 py-2.5 text-[13.5px] text-white placeholder:text-white/35 focus:outline-none disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-end">
          <button
            onClick={onSubmit}
            disabled={!canComment || busy || !draft.trim()}
            className="border-accent/45 bg-accent/16 text-accent cursor-pointer rounded-lg border px-4 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
          >
            {busy ? t("commentPosting") : t("commentPost")}
          </button>
        </div>
        {error ? <p className="text-down mt-1.5 text-[12px]">{error}</p> : null}
      </div>

      {/* Thread */}
      {isLoading ? (
        <p className="py-6 text-center text-[13px] font-normal text-white/45">{t("loading")}</p>
      ) : roots.length === 0 ? (
        <p className="py-6 text-center text-[13px] font-normal text-white/45">
          {t("comments_empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {roots.map((c) => (
            <li key={c.id}>
              <CommentRow comment={c} onLike={() => void like(c.id)} />
              {repliesByParent.get(c.id)?.length ? (
                <ul className="mt-3 flex flex-col gap-3 border-l border-white/[0.08] pl-4">
                  {repliesByParent.get(c.id)!.map((r) => (
                    <li key={r.id}>
                      <CommentRow comment={r} onLike={() => void like(r.id)} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentRow({ comment, onLike }: { comment: Comment; onLike: () => void }) {
  const t = useTranslations("prediction");
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 overflow-hidden rounded-full">
        <Identicon seed={comment.wallet} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-white/70">
            {shortAddress(comment.wallet)}
          </span>
          <span className="text-[11px] font-normal text-white/35">{timeAgo(comment.at)}</span>
        </div>
        <p className="mt-0.5 text-[13.5px] break-words whitespace-pre-wrap text-white/90">
          {comment.deleted ? (
            <span className="text-white/40 italic">{t("commentDeleted")}</span>
          ) : (
            comment.body
          )}
        </p>
        {!comment.deleted ? (
          <button
            onClick={onLike}
            className="mt-1 cursor-pointer text-[12px] font-medium text-white/45 hover:text-white/80"
          >
            ♥ {comment.likeCount > 0 ? comment.likeCount : ""} {t("commentLike")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function groupThread(comments: Comment[]): {
  roots: Comment[];
  repliesByParent: Map<string, Comment[]>;
} {
  const roots: Comment[] = [];
  const repliesByParent = new Map<string, Comment[]>();
  // API returns newest-first; show roots newest-first, replies oldest-first.
  for (const c of comments) {
    if (c.parentId) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.unshift(c);
      repliesByParent.set(c.parentId, list);
    } else {
      roots.push(c);
    }
  }
  return { roots, repliesByParent };
}
