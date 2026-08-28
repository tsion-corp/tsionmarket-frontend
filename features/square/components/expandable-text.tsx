"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Post text, clamped with a "Show more" that expands in place.
 *
 * A long caption otherwise makes one card taller than the screen and pushes
 * every other post out of the feed — the reader loses the thread to a single
 * person's essay. Clamping restores the rhythm without hiding anything: the
 * whole text is one tap away, and it opens HERE rather than navigating, so
 * nobody loses their scroll position to read four more lines.
 *
 * The detail that matters: the control appears ONLY when the text actually
 * overflows. Rendering "Show more" under a two-line post is the obvious
 * failure of this pattern, and it cannot be decided from character count —
 * wrapping depends on width, font and the words themselves. So it is measured
 * from the laid-out element, and re-measured when the container resizes.
 */
export function ExpandableText({
  children,
  clampClass = "line-clamp-4",
  className = "",
}: {
  /** The rendered text. Children, not a string, because a post's body carries
   *  cashtag chips that must stay tappable inside it. */
  children: React.ReactNode;
  /** The clamp to apply while collapsed. */
  clampClass?: string;
  className?: string;
}) {
  const t = useTranslations("square");
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    // Only meaningful while clamped; once expanded the two heights match and
    // the answer would flip to false, hiding the control that collapses it.
    if (expanded) return;
    setOverflows(node.scrollHeight > node.clientHeight + 1);
  }, [expanded]);

  useEffect(() => {
    measure();
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // Wrapping changes with width, so a resized column can turn a clamped
    // post into a complete one and vice versa.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, children]);

  return (
    <>
      <p ref={ref} className={`${className} ${expanded ? "" : clampClass}`}>
        {children}
      </p>
      {overflows ? (
        <button
          type="button"
          onClick={(event) => {
            // These sit inside cards that are themselves links; reading more
            // is not opening the post.
            event.preventDefault();
            event.stopPropagation();
            setExpanded((open) => !open);
          }}
          aria-expanded={expanded}
          className="text-grey-400 hover:text-grey-100 mt-1 text-[12.5px] font-semibold transition-colors"
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      ) : null}
    </>
  );
}
