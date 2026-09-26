"use client";

import { useState, type JSX } from "react";

export interface PlayerAvatarProps {
  /** A Market Square profile picture when we have one. */
  src: string | null;
  /** The wallet address, used to derive a stable fallback. */
  seed: string;
  /** Edge of the square, in pixels. The activity table draws 28. */
  size?: number;
  /** Already-localised alt text. Empty marks the avatar decorative, for when
   *  the player's name is already rendered beside it. */
  alt: string;
}

// The fallback palette. Five pairs lifted from the avatar ring colours the
// design draws in the activity rows, each a fill and the ink that reads on it.
// Indexed by a hash of the address, so a wallet keeps the same mark on every
// screen and across reloads — never random, never a per-render surprise.
const PALETTE: readonly { fill: string; ink: string }[] = [
  { fill: "#c8922b", ink: "#1a1204" },
  { fill: "#3f6fb5", ink: "#f2f6ff" },
  { fill: "#b53f3f", ink: "#fff1f1" },
  { fill: "#4b9e77", ink: "#04241a" },
  { fill: "#8a6ab5", ink: "#f6f1ff" },
];

// FNV-1a, 32-bit. A few lines of arithmetic rather than a dependency, and it
// spreads adjacent addresses across the palette far better than a character
// sum does. `>>> 0` keeps every step an unsigned 32-bit integer.
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// The two characters the mark shows: the first two of the address past its 0x
// prefix, upper-cased. A seed too short to supply two falls back to what it
// has, so an odd address still renders a mark rather than an empty circle.
function markOf(seed: string): string {
  const body = seed.replace(/^0x/iu, "");
  return body.slice(0, 2).toUpperCase();
}

// A player's picture, or a mark derived from their wallet address when there is
// none. The mark is painted on the container itself and the picture sits over
// it, so a slow or failing image never flashes an empty box: the coloured mark
// is already there, and the picture simply covers it once decoded.
//
// The address is public chain data, but it is never logged — a failed image is
// handled by swapping to the mark, not by reporting who failed to load.
export function PlayerAvatar({ src, seed, size = 29, alt }: PlayerAvatarProps): JSX.Element {
  // The URL that failed, not a bare flag: a row recycled onto a different
  // player then gets a fresh attempt without an effect resetting the flag.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const { fill, ink } = PALETTE[hashSeed(seed) % PALETTE.length];
  const showPicture = src !== null && failedSrc !== src;
  const decorative = alt === "";

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full select-none"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: fill,
        color: ink,
        fontSize: `${Math.round(size * 0.4)}px`,
      }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : alt}
      aria-hidden={decorative ? true : undefined}
    >
      <span className="font-semibold tracking-tight tabular-nums">{markOf(seed)}</span>
      {showPicture ? (
        /* A Market Square profile picture sits on an arbitrary host, which
           next/image would need declared one by one, and these are 28px
           thumbnails that gain nothing from the optimiser. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : null}
    </span>
  );
}
