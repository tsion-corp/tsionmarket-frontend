"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { formatCompact } from "@/lib/square/format-count";
import { marketSquareHref } from "@/lib/market-square";
import {
  applyCommentLike,
  expanderLabel,
  groupThread,
  patchCommentIn,
  threadOf,
} from "@/lib/square/comment-thread";
import {
  addPostComment,
  fetchCommentReplies,
  fetchPostComments,
  setCommentLike,
  type MarketSquareComment,
  type MarketSquareFeedPost,
} from "@/lib/api/market-square";
import { useBumpCommentCount } from "@/features/square/hooks/use-square-engage";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import {
  OrgBadgeChip,
  RoleChip,
  VerifiedBadge,
} from "@/features/square/components/square-post-badges";
import { IconMsComment, IconMsLike } from "@/features/square/components/square-post-icons";
import { SquareSheet } from "@/features/square/components/square-sheet";

/**
 * The Square's comments sheet, carried over (market-square-frontend/
 * features/feed/components/comments-sheet.tsx and comment-thread.tsx): the
 * thread in the sheet, each comment with its author's marks, its heart and
 * its Reply, replies indented under their parent behind a "View N replies"
 * expander, and the reply field pinned at the foot, which says who it is
 * answering.
 *
 * Reading, replying and liking are relayed by this app, so all three act
 * here. Deleting a comment is the Square's and is not offered; the Square's
 * mention picker is not here either, so a handle is typed rather than picked.
 */

interface ReplyTarget {
  parentId: string;
  threadId: string;
  username: string | null;
  displayName: string;
}

type Page = { items: MarketSquareComment[]; nextCursor: string | null };
type Cache = { pages: Page[]; pageParams: unknown[] };

const commentsKey = (postId: string) => ["market-square", "comments", postId] as const;
const repliesKey = (commentId: string) => ["market-square", "replies", commentId] as const;

function useComments(postId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: commentsKey(postId),
    queryFn: ({ pageParam }) => fetchPostComments(postId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

function useReplies(commentId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: repliesKey(commentId),
    queryFn: ({ pageParam }) => fetchCommentReplies(commentId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

/**
 * Like a comment, optimistically, wherever it sits in the cached thread or
 * its replies; put the previous state back if the server refuses.
 */
function useLikeComment(postId: string) {
  const queryClient = useQueryClient();
  const patch = (commentId: string, like: boolean) => {
    const edit = (data: Cache | undefined) =>
      !data
        ? data
        : {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: [
                ...patchCommentIn(page.items, commentId, (comment) =>
                  applyCommentLike(comment, like)
                ),
              ],
            })),
          };
    queryClient.setQueryData<Cache>(commentsKey(postId), edit);
    queryClient.setQueriesData<Cache>({ queryKey: ["market-square", "replies"] }, edit);
  };
  return useMutation({
    mutationFn: ({ commentId, like }: { commentId: string; like: boolean }) =>
      setCommentLike(commentId, like),
    onMutate: ({ commentId, like }) => patch(commentId, like),
    onError: (_error, { commentId, like }) => patch(commentId, !like),
  });
}

function AuthorLink({ username, children }: { username: string; children: React.ReactNode }) {
  const href = marketSquareHref(`u/${username}`);
  if (!href) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
      {children}
    </a>
  );
}

function CommentBox({
  postId,
  replyTo,
  onCancelReply,
  onPosted,
}: {
  postId: string;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  onPosted: (comment: MarketSquareComment, parentId: string | null) => void;
}) {
  const t = useTranslations("square");
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (replyTo) field.current?.focus();
  }, [replyTo]);

  const add = useMutation({
    mutationFn: (body: string) => addPostComment(postId, body, replyTo?.parentId),
    onSuccess: (comment) => {
      onPosted(comment, replyTo?.parentId ?? null);
      setText("");
      onCancelReply();
    },
  });

  const submit = () => {
    const body = text.trim();
    if (!body || add.isPending) return;
    add.mutate(body);
  };

  return (
    <div className="-mx-5 -mb-5 flex flex-col gap-2 border-t border-white/[0.08] px-4 py-3">
      {replyTo ? (
        <div className="flex items-center justify-between gap-2 text-[13px] text-[#71717a]">
          <span className="min-w-0 truncate">
            {t("replyingTo")}{" "}
            <span className="font-semibold text-[#d4d4d8]">
              {replyTo.username ? `@${replyTo.username}` : replyTo.displayName}
            </span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={t("cancelReply")}
            className="ws-pressable flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#71717a] transition-colors hover:bg-white/10 hover:text-[#fafafa]"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ) : null}
      {add.isError ? <p className="text-[12px] text-[#f6a5a5]">{t("commentFailed")}</p> : null}
      <div className="relative flex items-center gap-2">
        <input
          ref={field}
          value={text}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape" && replyTo) {
              event.preventDefault();
              onCancelReply();
            }
          }}
          placeholder={replyTo ? t("writeReplyTo") : t("writeReply")}
          aria-label={replyTo ? t("writeReplyToLabel") : t("writeReplyLabel")}
          disabled={add.isPending}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[15px] text-[#fafafa] outline-none placeholder:text-[#71717a] focus:border-white/25 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || add.isPending}
          aria-label={replyTo ? t("postReplyToComment") : t("postReply")}
          className="ws-pressable shrink-0 rounded-full bg-[#d4d4d8] p-2 text-[#0a0a0a] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
            <path
              d="m3 11 18-8-8 18-2-8-8-2Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  reply = false,
  onReply,
  like,
  children,
}: {
  comment: MarketSquareComment;
  reply?: boolean;
  onReply: (comment: MarketSquareComment) => void;
  like: ReturnType<typeof useLikeComment>;
  children?: React.ReactNode;
}) {
  const t = useTranslations("square");
  const author = comment.author;
  const size = reply ? 28 : 36;
  const liked = comment.likedByMe === true;

  return (
    <article
      id={`comment-${comment.id}`}
      className={cn("flex gap-3 px-4 py-3 transition-colors", reply && "pl-16")}
    >
      <span className="shrink-0">
        <SquareAvatar
          src={author?.avatarUrl ?? null}
          seed={author?.id ?? comment.authorId ?? comment.id}
          name={author?.displayName}
          size={size}
          shape="squircle"
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px]">
          {author ? (
            <>
              <AuthorLink username={author.username}>
                <span className="font-bold text-[#fafafa]">
                  {author.displayName?.trim() || author.username}
                </span>
              </AuthorLink>
              <VerifiedBadge verification={author.verification} className="h-3.5 w-3.5 shrink-0" />
              <OrgBadgeChip orgBadge={author.orgBadge} />
              <RoleChip role={author.role} className="shrink-0" />
              <span className="text-[13px] text-[#71717a]">@{author.username}</span>
            </>
          ) : (
            <span className="font-bold text-[#fafafa]">{t("member")}</span>
          )}
          <span className="text-[13px] text-[#71717a]">· {timeAgo(comment.createdAt)}</span>
        </p>
        <div className="mt-0.5 text-[15px] leading-normal break-words whitespace-pre-wrap text-[#d4d4d8]">
          {reply && comment.replyTo?.username ? (
            <AuthorLink username={comment.replyTo.username}>
              <span className="mr-1 font-semibold text-[#9f65fd]">@{comment.replyTo.username}</span>
            </AuthorLink>
          ) : null}
          {comment.text}
        </div>
        <div className="mt-1.5 flex items-center gap-4 text-[13px] font-semibold text-[#71717a]">
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="transition-colors hover:text-[#fafafa]"
          >
            {t("reply")}
          </button>
        </div>
        {children}
      </div>
      <button
        type="button"
        onClick={() => like.mutate({ commentId: comment.id, like: !liked })}
        disabled={like.isPending}
        aria-label={liked ? t("unlikeComment") : t("likeComment")}
        aria-pressed={liked}
        className={cn(
          "flex shrink-0 flex-col items-center gap-0.5 self-start transition-colors",
          liked ? "text-[#e84a4a]" : "text-[#9b9b9b] hover:text-[#fafafa]"
        )}
      >
        <IconMsLike className="h-5 w-5" filled={liked} />
        <span className="tnum text-[11px] leading-4 text-[#bfbfbf]">
          {formatCompact(comment.likeCount ?? 0)}
        </span>
      </button>
    </article>
  );
}

function Thread({
  comment,
  inlineReplies,
  onReply,
  like,
}: {
  comment: MarketSquareComment;
  inlineReplies: MarketSquareComment[];
  onReply: (comment: MarketSquareComment) => void;
  like: ReturnType<typeof useLikeComment>;
}) {
  const t = useTranslations("square");
  const [open, setOpen] = useState(false);
  const fetched = useReplies(comment.id, open);
  const fetchedItems = fetched.data?.pages.flatMap((page) => page.items) ?? [];
  const seen = new Set<string>();
  const replies = [...inlineReplies, ...(open ? fetchedItems : [])].filter((item) =>
    seen.has(item.id) ? false : (seen.add(item.id), true)
  );
  const count = Math.max(comment.replyCount ?? 0, inlineReplies.length);
  const label = expanderLabel(count, replies.length, open);

  return (
    <CommentRow comment={comment} onReply={onReply} like={like}>
      {label ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-[#71717a] transition-colors hover:text-[#fafafa]"
        >
          <span aria-hidden className="h-px w-6 border-t border-white/[0.08]" />
          {label.kind === "hide"
            ? t("hideReplies")
            : label.more
              ? t("viewMoreReplies", { count: label.count })
              : t("viewReplies", { count: label.count })}
        </button>
      ) : null}
      {open && fetched.isPending ? (
        <div className="mt-2 h-10 animate-pulse rounded-[14px] bg-white/6" />
      ) : null}
      {open && fetched.isError ? (
        <p className="mt-2 text-[13px] text-[#71717a]">{t("repliesFailed")}</p>
      ) : null}
      {open && fetched.hasNextPage ? (
        <button
          type="button"
          onClick={() => void fetched.fetchNextPage()}
          disabled={fetched.isFetchingNextPage}
          className="mt-2 text-[13px] font-semibold text-[#71717a] transition-colors hover:text-[#fafafa] disabled:opacity-40"
        >
          {t("moreReplies")}
        </button>
      ) : null}
      {replies.length > 0 ? (
        <div className="-mx-4 mt-2 -mb-3 border-t border-white/5">
          {replies.map((item) => (
            <CommentRow key={item.id} comment={item} reply onReply={onReply} like={like} />
          ))}
        </div>
      ) : null}
    </CommentRow>
  );
}

export function SquareCommentsSheet({
  post,
  open,
  onClose,
}: {
  post: MarketSquareFeedPost;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("square");
  const queryClient = useQueryClient();
  const bumpCount = useBumpCommentCount();
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const comments = useComments(post.id, open);
  const like = useLikeComment(post.id);
  const items = comments.data?.pages.flatMap((page) => page.items) ?? [];
  const threads = groupThread(items);

  // A new comment lands at the head of the thread, or under its parent, at
  // once: the page's count is bumped as the dashboard's card bumps it.
  const onPosted = (comment: MarketSquareComment, parentId: string | null) => {
    bumpCount(post.id);
    queryClient.setQueryData<Cache>(commentsKey(post.id), (data) => {
      if (!data) return data;
      const withParent = { ...comment, parentId: comment.parentId ?? parentId };
      const [first, ...rest] = data.pages;
      return {
        ...data,
        pages: [{ ...first, items: [withParent, ...first.items] }, ...rest],
      };
    });
  };

  return (
    <SquareSheet
      open={open}
      onClose={onClose}
      title={t("commentsSheetTitle")}
      closeLabel={t("close")}
    >
      <div className="flex max-h-[70vh] flex-col">
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto">
          {comments.isPending ? (
            <div className="flex flex-col gap-2 px-4 py-3" role="status" aria-live="polite">
              <span className="sr-only">{t("commentsLoading")}</span>
              <div className="h-12 animate-pulse rounded-[14px] bg-white/6" />
              <div className="h-12 animate-pulse rounded-[14px] bg-white/6" />
            </div>
          ) : comments.isError ? (
            <div className="flex flex-col items-center gap-3 rounded-[16.5px] border border-white/10 px-6 py-10 text-center">
              <p className="text-sm text-[#f6a5a5]">{t("repliesFailed")}</p>
              <button
                type="button"
                onClick={() => void comments.refetch()}
                className="ws-pressable rounded-full border border-white/15 px-4 py-2 text-[12.5px] font-semibold text-white"
              >
                {t("tryAgain")}
              </button>
            </div>
          ) : threads.length === 0 ? (
            <div className="p-4">
              <div className="flex flex-col items-center gap-2 rounded-[16.5px] border border-white/10 px-6 py-12 text-center">
                <span
                  aria-hidden
                  className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-[#9b9b9b] ring-1 ring-white/10 ring-inset"
                >
                  <IconMsComment className="h-5 w-5" />
                </span>
                <p className="ws-display text-[15px] text-[#f4f4f4]">{t("noComments")}</p>
                <p className="max-w-sm text-[13px] leading-5 text-[#7a7a7a]">
                  {t("noCommentsBody")}
                </p>
              </div>
            </div>
          ) : (
            <>
              {threads.map(({ comment, replies }) => (
                <Thread
                  key={comment.id}
                  comment={comment}
                  inlineReplies={replies}
                  like={like}
                  onReply={(target) =>
                    setReplyTo({
                      parentId: target.id,
                      threadId: threadOf(target),
                      username: target.author?.username ?? null,
                      displayName:
                        target.author?.displayName?.trim() ||
                        target.author?.username ||
                        t("thisComment"),
                    })
                  }
                />
              ))}
              {comments.hasNextPage ? (
                <div className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void comments.fetchNextPage()}
                    disabled={comments.isFetchingNextPage}
                    className="text-[13px] font-semibold text-[#71717a] transition-colors hover:text-[#fafafa] disabled:opacity-40"
                  >
                    {t("moreComments")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
        <CommentBox
          postId={post.id}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onPosted={onPosted}
        />
      </div>
    </SquareSheet>
  );
}
