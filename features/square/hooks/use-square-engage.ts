"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  setPostLike,
  setPostRepost,
  type MarketSquareFeedPage,
  type MarketSquareFeedPost,
} from "@/lib/api/market-square";

type FeedCache = { pages: MarketSquareFeedPage[]; pageParams: unknown[] };

const FEED_KEY = ["market-square", "feed"];

/**
 * Applies an edit to one post wherever it appears in the cached feeds.
 *
 * The same post can sit in several cached lanes at once (for-you, following, a
 * topic), so editing only the visible one leaves the others stale — switch tab
 * and the heart you just filled is empty again.
 */
function patchPost(
  queryClient: ReturnType<typeof useQueryClient>,
  postId: string,
  edit: (post: MarketSquareFeedPost) => MarketSquareFeedPost
) {
  queryClient.setQueriesData<FeedCache>({ queryKey: FEED_KEY }, (data) =>
    !data
      ? data
      : {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.post?.id === postId && item.post ? { ...item, post: edit(item.post) } : item
            ),
          })),
        }
  );
}

/**
 * Like and repost, optimistically.
 *
 * A heart or a repost that waits for a round trip feels broken, and both are
 * reversible and cost nothing — which is exactly why optimism is safe here and
 * would be wrong for the tip flow, which never shows a receipt it has not been
 * handed.
 *
 * On failure the previous cache is restored, so an action that did not land
 * never leaves a filled control lying about what the server holds.
 */
export function useSquareEngage() {
  const queryClient = useQueryClient();

  return useMutation<
    { likeCount?: number; repostCount?: number },
    unknown,
    { postId: string; action: "like" | "repost"; on: boolean },
    { snapshot: [readonly unknown[], unknown][] }
  >({
    mutationFn: ({
      postId,
      action,
      on,
    }: {
      postId: string;
      action: "like" | "repost";
      on: boolean;
    }) => (action === "like" ? setPostLike(postId, on) : setPostRepost(postId, on)),

    onMutate: async ({ postId, action, on }) => {
      // Stop an in-flight refetch from landing on top of the optimistic edit
      // and flipping the control back under the user's finger.
      await queryClient.cancelQueries({ queryKey: FEED_KEY });
      const snapshot = queryClient.getQueriesData({ queryKey: FEED_KEY });

      patchPost(queryClient, postId, (post) =>
        action === "like"
          ? {
              ...post,
              likedByMe: on,
              // Clamped: a count the server has not confirmed must never
              // render as -1 because of a double tap.
              likeCount: Math.max(0, post.likeCount + (on ? 1 : -1)),
            }
          : {
              ...post,
              repostedByMe: on,
              repostCount: Math.max(0, post.repostCount + (on ? 1 : -1)),
            }
      );
      return { snapshot };
    },

    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    // Deliberately no invalidate on success: refetching the whole feed would
    // reorder posts under someone who just tapped, and the optimistic edit
    // already matches what the server returned.
  });
}

/** Bumps a post's comment tally after the reader adds one. */
export function useBumpCommentCount() {
  const queryClient = useQueryClient();
  return (postId: string) =>
    patchPost(queryClient, postId, (post) => ({
      ...post,
      commentCount: post.commentCount + 1,
    }));
}
