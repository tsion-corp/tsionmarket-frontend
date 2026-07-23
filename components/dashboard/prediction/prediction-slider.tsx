"use client";

import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { PredictionCard } from "@/components/dashboard/prediction/prediction-card";
import type { Prediction } from "@/lib/types";

interface PredictionSliderProps {
  predictions: Prediction[];
  onBuy: (prediction: Prediction, yes: boolean) => void;
}

export function PredictionSlider({ predictions, onBuy }: PredictionSliderProps) {
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
          {predictions.map((p) => (
            <div key={p.q} className="min-w-0 shrink-0 grow-0 basis-[86%] pr-3 last:pr-0">
              <PredictionCard prediction={p} onBuy={(yes) => onBuy(p, yes)} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-1.5">
        {predictions.map((p, i) => (
          <button
            key={p.q}
            onClick={() => emblaApi?.scrollTo(i)}
            aria-label={`Go to prediction ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === selected ? "bg-accent w-5" : "w-1.5 bg-white/25"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
