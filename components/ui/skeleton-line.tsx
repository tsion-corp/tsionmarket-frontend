// A placeholder for one line of text that does not change the line's height.
//
// It is an inline-block sized in em, placed inside an element that carries the
// real line's font size and line height. The line box is then the one the text
// will have, so swapping the text in moves nothing below it. Skeleton bars sized
// in pixels and stacked in their own flex rows had rows landing 4px to 8px
// short of the real thing, and every card beneath them jumped on load.
//
// Use it where the real content is text. Icons and images reserve their own
// box with explicit dimensions.
export function SkeletonLine({ width, className = "" }: { width: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[0.7em] ${width} animate-pulse rounded bg-white/8 align-middle ${className}`}
    />
  );
}
