"use client";

import { useEffect, useState } from "react";

// The active section is the last one whose top has scrolled up to just beneath
// the sticky header. This reads scroll position rather than visible area, so a
// short section is never overshadowed by a tall neighbour on small screens.
const HEADER_OFFSET = 130;

export function useScrollSpy<T extends string>(sectionIds: readonly T[]): T {
  const [activeId, setActiveId] = useState<T>(sectionIds[0]);

  useEffect(() => {
    let ticking = false;

    const measure = () => {
      ticking = false;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= HEADER_OFFSET) current = id;
      }
      setActiveId(current);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };

    const raf = requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sectionIds]);

  return activeId;
}
