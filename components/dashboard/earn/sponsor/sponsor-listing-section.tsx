"use client";

import { useState } from "react";
import { AsyncError, AsyncLoading } from "@/components/dashboard/async-state";
import { RewardBadge } from "@/components/dashboard/earn/reward-badge";
import { ListingEditorSection } from "@/components/dashboard/earn/sponsor/listing-editor-section";
import { SubmissionReviewList } from "@/components/dashboard/earn/sponsor/submission-review-list";
import { useSponsorListing } from "@/hooks/use-earn-sponsor-listings";
import { deadlineLabel, formatDeadline } from "@/lib/earn/deadline";
import { listingToForm } from "@/lib/earn/listing-form";
import type { ListingType } from "@/lib/earn/api/types";

const PAGE = "mx-auto w-full max-w-[900px] px-4 pt-6 pb-20 sm:px-6";

const UNCONFIGURED_DETAIL = "This goes live once the earn service is switched on.";

export function SponsorListingSection({ slug, type }: { slug: string | null; type: ListingType }) {
  const { listing, isLoading, error } = useSponsorListing(slug, type);
  const [editing, setEditing] = useState(false);

  if (error) {
    return (
      <div className={PAGE}>
        <AsyncError error={error} subject="this listing" unconfiguredDetail={UNCONFIGURED_DETAIL} />
      </div>
    );
  }

  if (isLoading || !listing) {
    return (
      <div className={PAGE}>
        <AsyncLoading label="Loading the listing" rows={5} />
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <div className={`${PAGE} pb-0`}>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="cursor-pointer rounded-full border border-white/10 px-3.5 py-1.5 font-sans text-[12.5px] font-medium text-white/60 transition-colors hover:border-white/25 hover:text-white"
          >
            Back to the listing
          </button>
        </div>
        <ListingEditorSection existing={listing} initialState={listingToForm(listing)} />
      </div>
    );
  }

  const deadline = deadlineLabel(listing.deadline);

  return (
    <div className={PAGE}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="ws-display text-[clamp(22px,3vw,30px)] tracking-[-0.02em] text-white">
            {listing.title}
          </h1>
          <div className="tnum mt-1.5 font-sans text-[12.5px] font-normal text-white/45">
            {formatDeadline(listing.deadline)} · {deadline.text} ·{" "}
            {listing.isPublished ? "Published" : "Draft"}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <RewardBadge reward={listing.reward} />
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ws-inset cursor-pointer rounded-full px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/30"
          >
            Edit
          </button>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="ws-display text-[16px] text-white/90">Entries</h2>
        <div className="mt-3">
          <SubmissionReviewList slug={listing.slug} rewards={listing.rewards} />
        </div>
      </section>
    </div>
  );
}
