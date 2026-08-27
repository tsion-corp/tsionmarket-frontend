"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ModalShell } from "@/components/ui/modal-shell";
import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { timeAgo } from "@/lib/format";
import { authorName } from "@/lib/square/author";
import { addPostComment, fetchPostComments } from "@/lib/api/market-square";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import { useBumpCommentCount } from "@/features/square/hooks/use-square-engage";
import type { MarketSquareFeedPost } from "@/lib/api/market-square";

/** Mirrors the service's own comment limit (`createCommentBodySchema`). */
const COMMENT_MAX = 1000;

/**
 * A post's replies, read and written without leaving the dashboard.
 *
 * Newest-first, matching the order the service returns, and the composer sits
 * at the TOP rather than under the thread: on a phone a reply box below a long
 * list is a scroll away from the button that opened it, and the reason most
 * people opened the sheet is to say something.
 *
 * New replies are prepended locally on success. Refetching the thread instead
 * would work, but it moves the list under the person who just typed — and the
 * one comment we can be certain about is the one the server just handed back.
 */
export function SquareComments({
  post,
  onClose,
}: {
  post: MarketSquareFeedPost;
  onClose: () => void;
}) {
  const t = useTranslations("square");
  const bumpCount = useBumpCommentCount();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Awaited<ReturnType<typeof addPostComment>>[]>([]);

  const thread = useInfiniteQuery({
    queryKey: ["market-square", "comments", post.id],
    queryFn: ({ pageParam }) => fetchPostComments(post.id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const comments = [...mine, ...(thread.data?.pages.flatMap((page) => page.items) ?? [])];
  const ready = text.trim() !== "" && text.trim().length <= COMMENT_MAX && !sending;

  async function send() {
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      const comment = await addPostComment(post.id, text.trim());
      setMine((current) => [comment, ...current]);
      setText("");
      bumpCount(post.id);
    } catch {
      // Keep the text: a failure should cost a second tap, not the reply.
      setError(t("commentFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <ModalShell open onClose={onClose}>
      <div className="flex max-h-[80dvh] flex-col p-5">
        <h2 className="font-sans text-[17px] font-semibold text-white">{t("commentsTitle")}</h2>

        <div className="mt-3 flex gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={t("commentPlaceholder")}
            aria-label={t("commentPlaceholder")}
            disabled={sending}
            className="border-grey-800 h-[68px] flex-1 resize-none rounded-xl border bg-black/40 p-2.5 font-sans text-[13.5px] text-white outline-none placeholder:text-white/30 focus:border-white/30 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!ready}
            className="bg-accent text-ink h-9 shrink-0 self-end rounded-full px-4 text-[13px] font-semibold transition-[filter] hover:brightness-110 disabled:opacity-40"
          >
            {sending ? t("commentSending") : t("commentSend")}
          </button>
        </div>
        {error ? <p className="text-down mt-2 text-[12.5px]">{error}</p> : null}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {thread.isPending ? <AsyncLoading label={t("commentsLoading")} rows={2} /> : null}

          {thread.isError ? (
            <AsyncError
              error={thread.error}
              subject={t("commentsSubject")}
              onRetry={() => void thread.refetch()}
            />
          ) : null}

          {!thread.isPending && !thread.isError && comments.length === 0 ? (
            <p className="text-grey-500 py-8 text-center text-[13px]">{t("commentsEmpty")}</p>
          ) : null}

          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li key={comment.id} className="flex gap-2.5">
                <SquareAvatar
                  src={comment.author?.avatarUrl ?? null}
                  seed={comment.author?.id ?? comment.id}
                  size={30}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-white">
                      {authorName(comment.author, t("someone"))}
                    </span>
                    <span className="text-grey-600 shrink-0 text-[11.5px]">
                      {timeAgo(comment.createdAt)}
                    </span>
                  </p>
                  <p className="text-grey-200 mt-0.5 text-[13.5px] leading-[20px] break-words whitespace-pre-wrap">
                    {comment.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {thread.hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void thread.fetchNextPage()}
                disabled={thread.isFetchingNextPage}
                className="border-grey-800 hover:bg-grey-900 text-grey-300 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50"
              >
                {thread.isFetchingNextPage ? t("loadingMore") : t("loadMore")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
