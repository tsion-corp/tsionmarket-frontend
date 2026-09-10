"use client";

import { Children, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";

// The phone's balance area, as the mobile comp draws it: the balance card and
// the Kash+ card ride a swipe carousel instead of stacking, with a pill
// indicator that tracks the card in view. Each top-level child is one slide, so
// the caller composes the cards exactly as it does for the desktop grid.
export function BalanceCarousel({ children }: { children: React.ReactNode }) {
  const t = useTranslations("portfolio");
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: false, loop: false });
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
