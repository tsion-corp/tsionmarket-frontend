"use client";

import { BookSportsbookView } from "@/features/prediction/components/book-sportsbook-view";
import { PredictionCategoryNav } from "@/features/prediction/components/prediction-category-nav";

export default function LocalSportsbookPage() {
  return (
    <>
      <PredictionCategoryNav activeFilter="local" />
      <BookSportsbookView />
    </>
  );
}
