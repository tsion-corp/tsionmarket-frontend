"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { setFollow, type SquareSearchProfile } from "@/lib/api/market-square";
import { squareLinks } from "@/lib/square/links";
import { cn } from "@/lib/utils";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import {
  OrgBadgeChip,
  RoleChip,
  VerifiedBadge,
} from "@/features/square/components/square-post-badges";
import { IconMsWinkFace } from "@/features/square/components/square-post-icons";

/**
 * A person in the search results, the Square's own row carried over
 * (market-square-frontend/features/profile, PersonRow): the squircle
 * photo, the name with its marks, the handle, then the wink disc and the
 * Follow pill at the row's end. On a phone the marks move down to the
 * handle line, as the Square does, so the name is never squeezed out.
 *
 * Following is relayed here, so the pill acts; a wink is the Square's, so
 * the disc opens the person's profile there, which the identity does too.
 * The Square's safety menu (block, report) stays in the Square.
 */
export function SquarePersonRow({
  profile,
  meId,
}: {
  profile: SquareSearchProfile;
  meId?: string;
}) {
  const t = useTranslations("square");
  const isMe = meId !== undefined && meId === profile.id;
  const name = profile.displayName?.trim() || profile.username;
  const href = squareLinks.profile(profile.username);

  const [following, setFollowing] = useState(profile.isFollowing ?? false);
  const follow = useMutation({
    mutationFn: (next: boolean) => setFollow(profile.id, next),
    onMutate: (next) => {
      const previous = following;
      setFollowing(next);
      return { previous };
    },
    onError: (_error, _next, context) => setFollowing(context?.previous ?? false),
  });

  const badges = (
    <>
      <VerifiedBadge verification={profile.verification} className="h-3 w-3 shrink-0" />
      <OrgBadgeChip orgBadge={profile.orgBadge} />
      <RoleChip role={profile.role} className="shrink-0" />
    </>
  );

  const identity = (
    <>
      <span className="shrink-0 overflow-hidden rounded-[25%] border border-white/20 bg-white/10">
        <SquareAvatar
          src={profile.avatarUrl}
          seed={profile.id}
          name={profile.displayName}
          size={38}
          shape="squircle"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-[12px] leading-4 font-bold text-white">{name}</span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex">{badges}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] leading-4 font-normal text-white/50">
            @{profile.username}
          </span>
          <span className="flex shrink-0 items-center gap-1 sm:hidden">{badges}</span>
        </span>
      </span>
    </>
  );

  return (
    <div className="flex items-center gap-2 px-4 py-3 sm:gap-[9px]">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-[9px]"
        >
          {identity}
        </a>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-[9px]">{identity}</span>
      )}
      {!isMe && href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("winkAt", { name })}
          className="ws-pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-[#d4d4d8] transition-colors hover:bg-white/10 hover:text-[#fafafa]"
        >
          <IconMsWinkFace className="h-[18px] w-[18px]" />
        </a>
      ) : null}
      {!isMe ? (
        <button
          type="button"
          aria-pressed={following}
          disabled={follow.isPending}
          onClick={() => follow.mutate(!following)}
          className={cn(
            "ws-pressable h-6 shrink-0 rounded-full px-3 text-[12px] leading-4 font-bold transition-colors disabled:opacity-60",
            following
              ? "border border-white/20 text-white hover:bg-white/10"
              : "min-w-[60px] bg-white text-black shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]"
          )}
        >
          {following ? t("following") : t("follow")}
        </button>
      ) : null}
    </div>
  );
}
