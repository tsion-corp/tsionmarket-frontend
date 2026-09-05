"use client";

import { useState, type CSSProperties } from "react";

const FALLBACK_COLORS = ["#e65a45", "#e6a23c", "#2fa36b", "#3b82f6", "#d4549b", "#7b68ee"];

interface ProviderArtworkProps {
  src: string | null;
  alt: string;
  initials: string;
  color?: string | null;
  size?: "league" | "team";
}

function deterministicColor(value: string): string {
  const index = [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function safeColor(value: string | null | undefined, fallbackKey: string): string {
  const trimmed = value?.trim();
  if (trimmed && /^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  return deterministicColor(fallbackKey);
}

export function ProviderArtwork({
  src,
  alt,
  initials,
  color,
  size = "team",
}: ProviderArtworkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const dimension = size === "league" ? 40 : 24;
  const accent = safeColor(color, alt);
  const style = {
    width: dimension,
    height: dimension,
    borderColor: `${accent}66`,
    background: `linear-gradient(145deg, ${accent} 0%, #18181c 86%)`,
  } satisfies CSSProperties;

  if (src && failedSrc !== src) {
    return (
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-[7px] border bg-white/[0.06]"
        style={style}
      >
        {/* Polymarket serves artwork from provider-controlled hosts. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={dimension}
          height={dimension}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={alt}
      className="grid shrink-0 place-items-center rounded-[7px] border text-[9px] font-black tracking-[-0.02em] text-white"
      style={style}
    >
      {initials.slice(0, 2).toUpperCase()}
    </span>
  );
}
