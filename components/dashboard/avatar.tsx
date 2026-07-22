"use client";

import Blockies from "react-blockies";

interface AvatarProps {
  seed: string;
  size?: number;
}

export function Avatar({ seed, size = 32 }: AvatarProps) {
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <Blockies seed={seed.toLowerCase()} size={8} scale={Math.ceil(size / 8)} />
    </span>
  );
}
