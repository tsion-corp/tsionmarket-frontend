"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { setFollow, type MarketSquareAuthor } from "@/lib/api/market-square";

/**
 * Follow an author from the feed.
 *
 * The one relayed action that reaches another account, and it earns that:
 * following is what turns a feed you read once into one you come back to, and
 * the Following lane is dead without it.
 *
 * The label follows the convention people already have — "Following" while it
 * holds, "Unfollow" on hover, so the destructive reading only appears when the
 * pointer is on it and a glance never suggests you are about to undo something.
 */
export function FollowButton({ author }: { author: MarketSquareAuthor }) {
  const t = useTranslations("square");
  // Seeded from the feed's viewer state; owned locally afterwards so the
  // button answers instantly rather than waiting on a feed refetch.
  const [following, setFollowing] = useState(author.isFollowing ?? false);
  const [hovering, setHovering] = useState(false);

  const mutation = useMutation({
    mutationFn: (next: boolean) => setFollow(author.id, next),
    onMutate: (next) => {
      const previous = following;
      setFollowing(next);
      return { previous };
    },
    // Put it back rather than leaving a button that lies about the state.
    onError: (_error, _next, context) => setFollowing(context?.previous ?? false),
  });

  const label = following ? (hovering ? t("unfollow") : t("following")) : t("follow");

  return (
    <button
      type="button"
      onClick={(event) => {
        // The card's header is a link to the post; following is not opening it.
        event.preventDefault();
        event.stopPropagation();
        mutation.mutate(!following);
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={mutation.isPending}
      aria-pressed={following}
      className={
        "shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors disabled:opacity-60 " +
        (following
          ? "border-grey-700 text-grey-300 hover:border-down hover:text-down border"
          : "bg-accent text-ink hover:brightness-110")
      }
    >
      {label}
    </button>
  );
}
