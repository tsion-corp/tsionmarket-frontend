/**
 * The shape of a comment thread, carried over from the Square
 * (market-square-frontend/lib/comment-thread.ts): top-level comments newest
 * first, each holding the replies the page already has oldest first, and the
 * label on the expander that fetches the rest. Pure, so it can be pinned
 * without a renderer.
 */
export interface ThreadComment {
  id: string;
  /** Absent on a deployment that does not thread; read as a root. */
  parentId?: string | null;
  createdAt: string;
  replyCount?: number;
  likeCount?: number;
  likedByMe?: boolean | undefined;
}

export function applyCommentLike<T extends ThreadComment>(comment: T, like: boolean): T {
  if ((comment.likedByMe ?? false) === like) return comment;
  return {
    ...comment,
    likedByMe: like,
    likeCount: Math.max(0, (comment.likeCount ?? 0) + (like ? 1 : -1)),
  };
}

/** The thread a reply belongs to: its parent, or itself when it is the root. */
export function threadOf(target: Pick<ThreadComment, "id" | "parentId">): string {
  return target.parentId ?? target.id;
}

export function groupThread<T extends ThreadComment>(
  items: readonly T[]
): { comment: T; replies: T[] }[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const replies = new Map<string, T[]>();
  const roots: T[] = [];
  for (const item of items) {
    const parent = item.parentId && byId.has(item.parentId) ? item.parentId : null;
    if (parent) {
      const list = replies.get(parent) ?? [];
      list.push(item);
      replies.set(parent, list);
    } else {
      roots.push(item);
    }
  }
  const byTime = (a: T, b: T) => Date.parse(a.createdAt) - Date.parse(b.createdAt);
  roots.sort((a, b) => byTime(b, a));
  return roots.map((comment) => ({
    comment,
    replies: (replies.get(comment.id) ?? []).sort(byTime),
  }));
}

export function patchCommentIn<T extends ThreadComment>(
  items: readonly T[],
  id: string,
  patch: (comment: T) => T
): readonly T[] {
  let touched = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    touched = true;
    return patch(item);
  });
  return touched ? next : items;
}

/**
 * What the expander under a comment says. Structured rather than worded, so
 * the catalogue supplies the words: view N (more) replies, hide them, or
 * nothing when there is nothing left to show.
 */
export type ExpanderLabel = { kind: "view"; count: number; more: boolean } | { kind: "hide" };

export function expanderLabel(
  replyCount: number,
  loaded: number,
  open: boolean
): ExpanderLabel | null {
  if (open) return loaded > 0 ? { kind: "hide" } : null;
  const remaining = Math.max(0, replyCount - loaded);
  if (remaining === 0) return null;
  return { kind: "view", count: remaining, more: loaded > 0 };
}
