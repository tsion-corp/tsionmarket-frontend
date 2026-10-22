import { artworkForSeed, resolveSeed } from "@/lib/avatar/avatar-seed";

/**
 * An account's generated avatar: one of the nine ARK artworks chosen by a
 * stable hash of `seed`, or a neutral mark when nothing identifies the row.
 *
 * `seed` must be the stable identity (wallet or user id), not a display name,
 * or a rename re-rolls the face.
 */
export function AccountAvatar({
  seed,
  name,
  size = 40,
}: {
  seed: string;
  name?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size };
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
