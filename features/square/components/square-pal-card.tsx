"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { setFollow, type SuggestedProfile } from "@/lib/api/market-square";
import { squareLinks } from "@/lib/square/links";
import { cn } from "@/lib/utils";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import {
  IconPalAdd,
  IconPalPass,
  IconPalWink,
  IconPalWinkOpen,
} from "@/features/square/components/square-deck-icons";

/**
 * Home's deck card, at the file's own numbers (node 844:23437 as the Square
 * draws it on Home: market-square-frontend/components/layout/pal-card.tsx,
 * HOME_DECK_CARD).
 */
export const HOME_DECK_CARD = {
  width: 310.24,
  height: 422.24,
  radius: 50,
  rim: 5.07,
  photo: { width: 283.92, height: 298.24, left: 13.08, top: 12, radius: 47.22 },
  scrim: { height: 129.67, name: 20.98, nameLeading: 35.97, handle: 14.78, handleLeading: 22.17 },
  lines: { nameLeft: 28.98, nameBottom: 26.97, handleLeft: 33.87, handleBottom: 11.94 },
  badge: { size: 66.08, right: 12.32, top: 12.32, ring: 5.07, glyph: 38.55, ringColor: "#FFFFFF" },
  controls: {
    size: 60.55,
    gap: 15.61,
    bottom: 25.76,
    passGlyph: 35.84,
    winkGlyph: 40.32,
    lift: 5.59,
  },
} as const;

/**
 * A person on the deck, the Square's own pal card carried over: the
 * white-to-lavender ground in its dark rim, the photo with the name and
 * handle on a scrim at its foot, the follow badge on the photo's corner, and
 * the pass and wink discs under it.
 *
 * What each control does, split the way the ADR splits them: following is
 * backed by this app's relay, so the badge is a real button; pass steps the
 * deck on, as it does on the Square's Home; a wink is the Square's, so it
 * opens the person's profile there, which the photo opens too.
 */
export function SquarePalCard({
  person,
  interactive = true,
  onPass,
  onFollowed,
}: {
  person: SuggestedProfile;
  interactive?: boolean;
  onPass?: () => void;
  onFollowed?: () => void;
}) {
  const t = useTranslations("square");
  const c = HOME_DECK_CARD;
  const name = person.displayName?.trim() || person.username;
  const href = squareLinks.profile(person.username);

  // Seeded from the directory's viewer state, owned locally afterwards so the
  // badge answers at once; put back on failure rather than left lying.
  const [following, setFollowing] = useState(person.isFollowing ?? false);
  const follow = useMutation({
    mutationFn: (next: boolean) => setFollow(person.id, next),
    onMutate: (next) => {
      const previous = following;
      setFollowing(next);
      return { previous };
    },
    onError: (_error, _next, context) => setFollowing(context?.previous ?? false),
  });

  const photo = (
    <>
      <SquareAvatar
        src={person.avatarUrl}
        seed={person.id}
        name={person.displayName}
        size={Math.round(c.photo.height)}
        shape="fill"
      />
      <span
        className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,1)_100%)] font-[family-name:var(--font-roboto)]"
        style={{ height: c.scrim.height }}
      >
        {/* Home's card (647:16300) carries the name alone; the crown a
            verified account wears is the /pals front card's (1331:21359). */}
        <span
          className="absolute flex items-center"
          style={{ left: c.lines.nameLeft, right: c.lines.nameLeft, bottom: c.lines.nameBottom }}
        >
          <span
            className="min-w-0 truncate font-semibold text-white"
            style={{ fontSize: c.scrim.name, lineHeight: `${c.scrim.nameLeading}px` }}
          >
            {name}
          </span>
        </span>
        <span
          className="absolute block truncate text-white/50"
          style={{
            fontSize: c.scrim.handle,
            lineHeight: `${c.scrim.handleLeading}px`,
            left: c.lines.handleLeft,
            right: c.lines.nameLeft,
            bottom: c.lines.handleBottom,
          }}
        >
          @{person.username}
        </span>
      </span>
    </>
  );

  const photoStyle = {
    left: c.photo.left,
    top: c.photo.top,
    width: c.photo.width,
    height: c.photo.height,
    borderRadius: c.photo.radius,
  };

  return (
    <div className="relative shrink-0" style={{ width: c.width, height: c.height }}>
      <div
        className="absolute inset-0 bg-[linear-gradient(180deg,#FFFFFF_0%,#D0B3FF_100%)]"
        style={{ borderRadius: c.radius, boxShadow: `0 0 0 ${c.rim}px #0F0F0F` }}
      />

      {/* Painted before the photo, so z-10 is what keeps it on top of it. */}
      <button
        type="button"
        disabled={!interactive || follow.isPending}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          follow.mutate(!following);
          if (!following) onFollowed?.();
        }}
        aria-pressed={following}
        aria-label={following ? t("unfollowName", { name }) : t("followName", { name })}
        className="ws-pressable absolute z-10 flex items-center justify-center rounded-full border-solid bg-[#7E3BEB] transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{
          width: c.badge.size,
          height: c.badge.size,
          right: c.badge.right,
          top: c.badge.top,
          borderWidth: c.badge.ring,
          borderColor: c.badge.ringColor,
        }}
      >
        <IconPalAdd
          className={cn("shrink-0", following && "opacity-50")}
          style={{ width: c.badge.glyph, height: c.badge.glyph }}
        />
      </button>

      {href && interactive ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={name}
          className="absolute block overflow-hidden"
          style={photoStyle}
        >
          {photo}
        </a>
      ) : (
        <span className="absolute block overflow-hidden" style={photoStyle}>
          {photo}
        </span>
      )}

      <div
        className="absolute inset-x-0 flex items-center justify-center"
        style={{ bottom: c.controls.bottom, gap: c.controls.gap }}
      >
        <button
          type="button"
          disabled={!interactive}
          onClick={onPass}
          aria-label={t("skipName", { name })}
          className="ws-pressable relative flex shrink-0 items-center justify-center rounded-full bg-[rgba(159,101,253,0.23)] transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ width: c.controls.size, height: c.controls.size }}
        >
          <IconPalPass
            className="shrink-0"
            style={{ width: c.controls.passGlyph, height: c.controls.passGlyph }}
          />
        </button>
        {href ? (
          <a
            href={interactive ? href : undefined}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={interactive ? undefined : -1}
            aria-label={t("winkAt", { name })}
            className="ws-pressable relative flex shrink-0 items-center justify-center overflow-hidden rounded-full transition-opacity hover:opacity-90"
            style={{
              width: c.controls.size,
              height: c.controls.size,
              translate: `0 -${c.controls.lift}px`,
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0 rotate-[17.773deg] rounded-full bg-[linear-gradient(180deg,#9F65FD_0%,#7E3BEB_100%)]"
            />
            <span
              className="relative block shrink-0"
              style={{ width: c.controls.winkGlyph, height: c.controls.winkGlyph }}
            >
              <IconPalWink className="absolute inset-0 h-full w-full" />
              <IconPalWinkOpen className="ws-wink-blink absolute inset-0 h-full w-full" />
            </span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
