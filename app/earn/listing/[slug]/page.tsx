"use client";

import { use } from "react";
import { EarnPage } from "@/components/dashboard/earn/earn-page";
import { ListingDetailSection } from "@/components/dashboard/earn/listing-detail-section";

export default function EarnListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  return (
    <EarnPage>
      <ListingDetailSection slug={slug} />
    </EarnPage>
  );
}
