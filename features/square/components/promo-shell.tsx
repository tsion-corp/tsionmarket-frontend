"use client";

import { squareLinks } from "@/lib/square/links";

/**
 * The shared frame for a Market Square block sitting between dashboard
 * sections.
 *
 * These exist to recruit: someone reading their portfolio meets a little of
 * the square on the way down, rather than having to reach the very bottom of
 * the page to discover it exists. So each block is ONE horizontal rail — it
 * costs a fixed slice of height however much it has to show, and it never
 * interrupts the vertical read for long.
 *
 * The cards deliberately keep Market Square's own palette (its card grey, its
 * blue verification, its red live dot) rather than Ark's monochrome. They are
 * a window into another product, and looking slightly foreign is the point:
 * it reads as "this is the square", not as another Ark widget.
 */
export function PromoShell({
  title,
  action,
  children,
}: {
  title: string;
  action: string;
  children: React.ReactNode;
}) {
  const href = squareLinks.home();

  return (
    <section className="mx-auto w-full max-w-[1520px] px-4 sm:px-6 lg:px-8">
      <div className="ws-card overflow-hidden p-4 sm:p-5">
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[13.5px] font-semibold text-white">{title}</h2>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-grey-500 hover:text-grey-200 shrink-0 text-[12px] font-medium transition-colors"
            >
              {action}
            </a>
          ) : null}
        </header>

        {/* One rail. Scroll-snap rather than a JS carousel, so a trackpad, a
            swipe, shift-wheel and the keyboard all work and the browser is
            left to do what it is good at. */}
        <div className="ws-no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
          {children}
        </div>
      </div>
    </section>
  );
}

/** The card body every promo card shares: the square's own grey, 8px radius. */
export function PromoCard({
  href,
  width,
  height = "h-[210px]",
  children,
}: {
  href: string | null;
  width: string;
  /**
   * A FIXED height, deliberately.
   *
   * Cards in a rail hold captions of wildly different lengths, so sized to
   * their content the engagement pill lands at a different height on every
   * card — it rides up under a short post and drops under a long one, and the
   * row reads as ragged. Fixing the height lets the action sit at the same
   * baseline across the whole rail: the card's footer is pinned with
   * `mt-auto`, and only the text absorbs the difference.
   */
  height?: string;
  children: React.ReactNode;
}) {
  const className = `bg-grey-800 ${width} ${height} flex shrink-0 snap-start flex-col rounded-lg p-3 text-left transition-colors hover:brightness-110`;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <div className={className}>{children}</div>
  );
}
