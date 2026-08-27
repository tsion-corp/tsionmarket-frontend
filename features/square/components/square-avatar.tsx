"use client";

import { useState } from "react";
import { Identicon } from "@/components/ui/identicon";

/**
 * A person's real picture, with the generated one as the fallback.
 *
 * The shared `Avatar` is identicon-only, which is right for a wallet address
 * and wrong for a person: a feed of generated blocks reads as a list of
 * accounts, not a room with people in it. Faces are most of what makes a
 * social surface feel inhabited, so the uploaded image is used whenever there
 * is one — and a broken URL falls back rather than leaving a torn image.
 */
export function SquareAvatar({
  src,
  seed,
  size = 40,
}: {
  src: string | null;
  seed: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = src !== null && src !== "" && !failed;

  return (
    <span
      className="ring-grey-800 inline-block shrink-0 overflow-hidden rounded-full ring-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar host is user-supplied and unknown
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Identicon seed={seed} size={size} />
      )}
    </span>
  );
}
