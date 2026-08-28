"use client";

import { useState } from "react";
import { artworkForSeed, resolveSeed } from "@/lib/square/avatar-seed";

/**
 * A square member's picture, rendered EXACTLY as Market Square renders it.
 *
 * Three tiers, in the square's own order:
 *   1. `src` — the person's own upload. Always wins.
 *   2. Seeded artwork — one of the nine ARK mascots, chosen by a stable hash
 *      of the identity (see lib/square/avatar-seed.ts).
 *   3. A neutral monogram — only when nothing identifies the row at all.
 *
 * Ark's shared `Avatar` draws a geometric identicon, which meant the same
 * account showed a mascot in the square and a pattern of blocks here. Two
 * faces for one person reads as two people, and it undermines the whole point
 * of surfacing the square's content on this dashboard.
 *
 * `seed` must be the STABLE identity — the Privy DID — not a display name.
 * Seeding on a name re-rolls someone's avatar the moment they rename.
 */
export function SquareAvatar({
  src,
  seed,
  name,
  size = 40,
}: {
  src: string | null;
  seed: string;
  name?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar hosts are user-supplied and unknown
      <img
        src={src}
        alt=""
        style={style}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="ring-grey-800 shrink-0 rounded-full object-cover ring-1"
      />
    );
  }

  const artwork = artworkForSeed(resolveSeed({ id: seed, name }));
  if (artwork) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a local static asset, sized by the caller
      <img
        src={artwork}
        alt=""
        style={style}
        loading="lazy"
        decoding="async"
        className="ring-grey-800 shrink-0 rounded-full object-cover ring-1"
      />
    );
  }

  // Nothing identifies this row, so it gets a neutral mark rather than
  // borrowing a specific person's illustration.
  return (
    <span
      style={style}
      aria-hidden
      className="bg-grey-800 text-grey-500 ring-grey-700 grid shrink-0 place-items-center rounded-full ring-1"
    >
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2">
        <path
          d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5c0-2.5-3-4.5-7-4.5Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
