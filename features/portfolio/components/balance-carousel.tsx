"use client";

import { Children, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";

// The phone's balance area, as the mobile comp draws it: the balance card and
// the Kash+ card ride a swipe carousel instead of stacking, with a pill
// indicator that tracks the card in view. Each top-level child is one slide, so
// the caller composes the cards exactly as it does for the desktop grid.
export function BalanceCarousel({
  children,
  card,
}: {
  children: React.ReactNode;
  /**
   * The card the page's scroll is asking for, when something is driving it.
   *
   * Undefined leaves the carousel exactly as it was: a swipe carousel that
   * answers to nothing else. The scroll driver is additive, which is what lets
   * the desktop grid and the reduced-motion path use this component unchanged.
   */
  card?: number;
}) {
  const t = useTranslations("portfolio");
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: false, loop: false });
  const [selected, setSelected] = useState(0);
  const slides = Children.toArray(children);
  // What the scroll driver last asked for. The carousel moves when this
  // CHANGES, not while it merely differs: a reader who swipes back to the
  // balance card halfway down the hold would otherwise be dragged to Kash
  // again on the very next scroll frame, with no way to disagree.
  const lastAsked = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || card === undefined) return;
    if (lastAsked.current === card) return;
    lastAsked.current = card;
    // Animated, not a jump: the point of the hold is that the reader SEES the
    // card travel. A jump would land on Kash with nothing to notice.
    emblaApi.scrollTo(card);
  }, [emblaApi, card]);

  return (
    <div>
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex touch-pan-y items-stretch">
          {slides.map((slide, i) => (
            <div key={i} className="flex min-w-0 shrink-0 grow-0 basis-[88%] pr-2.5 last:pr-0">
              <div className="h-full w-full">{slide}</div>
            </div>
          ))}
        </div>
      </div>
      {/* The comp's indicator: a long bar for the card in view, a short one for
          the rest. */}
      <div className="mt-3.5 flex justify-center gap-[3px]">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => emblaApi?.scrollTo(i)}
            aria-label={t("goToCard", { number: i + 1 })}
            className={`h-1 cursor-pointer rounded-full transition-all ${
              i === selected ? "w-9 bg-white" : "w-3.5 bg-white/45"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
