"use client";

import { Children, createContext, useContext, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

// Whether the card consuming this is the one currently in view. A banner reads it
// to play or replay its entrance the moment it becomes the active slide. Defaults
// to true so a banner used on its own, outside the carousel, still animates.
const PromoFrontContext = createContext(true);

export function usePromoFront() {
  return useContext(PromoFrontContext);
}

// A swipeable row of promo banners, per the mobile comp. Each top-level child is
// one slide; the user swipes between them and a pill indicator tracks the one in
// view. No auto-advance — the deck used to rotate itself, but this is a carousel
// the user drives. The slide in view is the "front", so its entrance animation
// plays as it lands.
export function PromoCarousel({ children }: { children: React.ReactNode }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: false });
  const [selected, setSelected] = useState(0);
  const slides = Children.toArray(children);

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

  return (
    <div>
      {/* The comp frames the scroll in a dark #232222 card (node 1:2687): the
          banners inset onto it, and the Set-the-stake ticket's scalloped notches
          reveal it between the bumps. */}
      <div className="rounded-lg bg-[#232222] px-1.5 py-1.75">
        <div ref={emblaRef} className="overflow-hidden">
          <div className="flex touch-pan-y items-center">
            {slides.map((slide, i) => (
              <div key={i} className="flex min-w-0 shrink-0 grow-0 basis-full">
                <PromoFrontContext.Provider value={i === selected}>
                  <div className="w-full">{slide}</div>
                </PromoFrontContext.Provider>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* The comp's indicator: a long bar for the slide in view, a short one for
          the rest; tap to jump. Hidden when there is nothing to page through. */}
      {slides.length > 1 ? (
        <div className="mt-3 flex justify-center gap-[3px]">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Go to promo ${i + 1}`}
              className={`h-1 cursor-pointer rounded-full transition-all ${
                i === selected ? "w-9 bg-white" : "w-3.5 bg-white/45"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
