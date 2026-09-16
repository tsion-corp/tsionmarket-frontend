import Link from "next/link";

interface DiscoveryRowProps {
  /** Rich, because two of the headings colour one word differently from the rest. */
  title: React.ReactNode;
  /** Where the heading's chevron leads: the service this row is a doorway to. */
  href: string;
  /** A sibling deployment: the heading opens it in a new tab as a plain anchor. */
  external?: boolean;
  children: React.ReactNode;
}

// One shelf of the dashboard's discovery area: a heading that is itself the way
// through to the service, and whatever cards the caller lays out beneath it.
// The comp drew the heading in Quicksand; production keeps its display face.
//
// A long locale wraps the heading rather than pushing the chevron off the row.
// Two things hold that together. The title takes `min-w-0`, so it can shrink
// under the row's cap instead of standing at the width of its longest word and
// carrying the chevron out past the edge, and `break-words` then breaks a word
// too long to fit a line on its own. The chevron never shrinks, and the 6px
// between it and the title is a gap on the box, so a heading that has wrapped
// to two lines keeps exactly the same distance from the chevron as a heading
// that fits on one.
//
// Hover is `ws-pressable` and nothing else: the whole link lifts, chevron
// included. No shadow, and no second treatment layered on top of it.
export function DiscoveryRow({ title, href, external, children }: DiscoveryRowProps) {
  const className = "ws-pressable flex w-fit max-w-full items-center gap-1.5 text-white";
  const heading = (
    <>
      <span className="ws-discovery-title min-w-0 text-[19px] tracking-[-0.01em] break-words">
        {title}
      </span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
        <path
          d="m9 6 6 6-6 6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );

  return (
    <section className="flex flex-col gap-4">
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
          {heading}
        </a>
      ) : (
        <Link href={href} className={className}>
          {heading}
        </Link>
      )}
      {children}
    </section>
  );
}
