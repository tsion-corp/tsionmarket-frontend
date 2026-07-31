"use client";

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { EarnPage } from "@/components/dashboard/earn/earn-page";
import { SponsorListingSection } from "@/components/dashboard/earn/sponsor/sponsor-listing-section";
import type { ListingType } from "@/lib/earn/api/types";

const TYPES: ListingType[] = ["bounty", "project", "hackathon", "grant"];

// The sponsor-facing read is scoped by type as well as slug, so the link that
// got here carries it. An unrecognized value falls back to bounty rather than
// being passed through to the service.
function typeFromParam(value: string | null): ListingType {
  return TYPES.includes(value as ListingType) ? (value as ListingType) : "bounty";
}

function ListingFromParams({ slug }: { slug: string }) {
  const type = typeFromParam(useSearchParams()?.get("type") ?? null);
  return <SponsorListingSection slug={slug} type={type} />;
}

export default function EarnSponsorListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  return (
    <EarnPage>
      <Suspense fallback={null}>
        <ListingFromParams slug={slug} />
      </Suspense>
    </EarnPage>
  );
}
