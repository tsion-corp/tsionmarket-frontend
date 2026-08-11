"use client";

import { use } from "react";
import { EarnPage, ListingDetailSection } from "@/features/earn";

export default function EarnListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  return (
    <EarnPage>
      <ListingDetailSection slug={slug} />
    </EarnPage>
  );
}
