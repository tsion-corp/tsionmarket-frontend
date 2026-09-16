import type { PredictionMarketCategory } from "../categories";
import {
  categoryEventHref,
  marketPrediction,
  type CategoryPrediction,
} from "../category-market-presenter";
import type { DiscoveryMarketEvent } from "../markets/api";
import { CategoryMarketRow } from "./category-market-shared";

interface CategoryEventRowProps {
  event: DiscoveryMarketEvent;
  category: PredictionMarketCategory;
  matches: (prediction: CategoryPrediction) => boolean;
  accessAllowed: boolean;
  onBuy: (prediction: CategoryPrediction, side: "yes" | "no") => void;
  selectedSide?: (conditionId: string) => "yes" | "no" | undefined;
  showVolume?: boolean;
  surface?: "default" | "black";
}

export function CategoryEventRow({
  event,
  category,
  matches,
  accessAllowed,
  onBuy,
  selectedSide = () => undefined,
  showVolume = true,
  surface = "default",
}: CategoryEventRowProps) {
  const predictions = event.markets.flatMap((market) => {
    const prediction = marketPrediction(event, market, category);
    return prediction ? [prediction] : [];
  });
  const preview = predictions[0];
  const eventMatches = preview ? matches({ ...preview, q: `${event.title} ${preview.q}` }) : false;

  if (event.marketCount <= 1) {
    const prediction = predictions.find(matches);
    return prediction ? (
      <CategoryMarketRow
        prediction={prediction}
        href={categoryEventHref(event.id, category)}
        accessAllowed={accessAllowed}
        onBuy={(side) => onBuy(prediction, side)}
        selectedSide={selectedSide(prediction.conditionId)}
        showVolume={showVolume}
        surface={surface}
      />
    ) : null;
  }

  if (!preview || !eventMatches) return null;

  return (
    <CategoryMarketRow
      prediction={preview}
      eventTitle={event.title}
      marketCount={event.marketCount}
      href={categoryEventHref(event.id, category)}
      accessAllowed={accessAllowed}
      onBuy={(side) => onBuy(preview, side)}
      selectedSide={selectedSide(preview.conditionId)}
      showVolume={showVolume}
      surface={surface}
    />
  );
}
