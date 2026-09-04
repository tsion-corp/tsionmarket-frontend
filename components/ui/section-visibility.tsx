"use client";

import { createContext, useContext } from "react";
import { useInView } from "@/hooks/use-in-view";

/**
 * Marks a region of the page as on screen or not, for the polls inside it.
 *
 * The dashboard is one long scrolling page: portfolio, spot, perps, memecoins
 * and real assets all mount together on load, so every poll each of them owns
 * starts at once. Someone who opens the site to read their balance pays for
 * the whole page whether or not they ever scroll to it.
 *
 * A context rather than a prop, because the polls live several components deep
 * and threading a flag through every view to reach them would touch far more
 * code than it saves. A hook opts in with one line and stays honest outside a
 * section too: the default is `true`, so anything rendered elsewhere, in a
 * modal or on another route, keeps polling exactly as it did.
 *
 * This is deliberately NOT unmounting. The section renders as it always did,
 * so nothing about the layout, scroll height or scroll-spy anchors changes. It
 * only stops asking for data nobody is looking at.
 */
const SectionActiveContext = createContext(true);

export function useSectionActive(): boolean {
  return useContext(SectionActiveContext);
}

export function SectionVisibility({
  className,
  id,
  children,
}: {
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} id={id} className={className}>
      <SectionActiveContext.Provider value={inView}>{children}</SectionActiveContext.Provider>
    </div>
  );
}
