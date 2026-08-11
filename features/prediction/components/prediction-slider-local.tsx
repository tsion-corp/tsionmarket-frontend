"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";
import { LocalPredictionCard } from "@/features/prediction/components/prediction-card-local";
import type { Market } from "@/features/prediction/lib/types";

interface PredictionSliderProps {
  markets: Market[];
}

export function LocalPredictionSlider({ markets }: PredictionSliderProps) {
  const t = useTranslations("prediction");
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: false, loop: false });
  const [selected, setSelected] = useState(0);

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
        <div className="flex touch-pan-y">
          {markets.map((m) => (
            <div
              key={m.marketId.toString()}
              className="min-w-0 shrink-0 grow-0 basis-[86%] pr-3 last:pr-0"
            >
              <LocalPredictionCard market={m} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-1.5">
        {markets.map((m, i) => (
          <button
            key={m.marketId.toString()}
            onClick={() => emblaApi?.scrollTo(i)}
            aria-label={t("goToPrediction", { number: i + 1 })}
            className={`h-1.5 rounded-full transition-all ${
              i === selected ? "bg-accent w-5" : "w-1.5 bg-white/25"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
