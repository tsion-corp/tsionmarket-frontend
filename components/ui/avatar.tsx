"use client";

import { Identicon } from "@/components/ui/identicon";

interface AvatarProps {
  seed: string;
  size?: number;
}

export function Avatar({ seed, size = 32 }: AvatarProps) {
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
    >
      <Identicon seed={seed} size={size} />
    </span>
  );
}
