"use client";

import { useState } from "react";
import { AsyncError, AsyncLoading } from "@/components/dashboard/async-state";
import { RewardBadge } from "@/components/dashboard/earn/reward-badge";
import { ListingEditorSection } from "@/components/dashboard/earn/sponsor/listing-editor-section";
import { SubmissionReviewList } from "@/components/dashboard/earn/sponsor/submission-review-list";
import { useAnnounceWinners, useSponsorListing } from "@/hooks/use-earn-sponsor-listings";
import { deadlineLabel, formatDeadline } from "@/lib/earn/deadline";
import { listingToForm } from "@/lib/earn/listing-form";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { ListingType } from "@/lib/earn/api/types";

const PAGE = "mx-auto w-full max-w-[1520px] px-4 pt-6 pb-20 sm:px-6";

const UNCONFIGURED_DETAIL = "This goes live once the earn service is switched on.";

// Publishing the result. Marking winners only records the choice; until this
// runs `winnersAnnounced` stays false and nobody who entered is told how they
// did. It happens once and cannot be undone, so it asks first.
function AnnounceWinners({
  listingId,
  slug,
  winnersAnnounced,
  isPublished,
}: {
  listingId: string;
  slug: string;
  winnersAnnounced: boolean;
  isPublished: boolean;
}) {
  const announce = useAnnounceWinners(slug);
  const [confirming, setConfirming] = useState(false);

  if (!isPublished) return null;

  if (winnersAnnounced) {
    return (
      <span className="border-up/40 text-up rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium">
        Winners announced
      </span>
    );
  }

  async function onAnnounce() {
    const id = toast.loading("Announcing…");
    try {
      await announce.mutateAsync(listingId);
      toast.success("Winners announced. Everyone who entered can see the result.", { id });
      setConfirming(false);
    } catch (error) {
      // The service refuses an announce whose winners do not cover every prize
      // position, and says which. That message is more use than ours.
      toast.error(friendlyError(error, "Couldn't announce the winners."), { id });
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="ws-inset cursor-pointer rounded-full px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/30"
      >
        Announce winners
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-sans text-[12px] font-normal text-white/55">
        This is final and everyone is notified.
      </span>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={announce.isPending}
        className="ws-inset cursor-pointer rounded-full px-3.5 py-2 font-sans text-[12.5px] font-medium text-white/70 transition-colors hover:text-white disabled:opacity-40"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onAnnounce}
        disabled={announce.isPending}
        className="bg-accent text-ink cursor-pointer rounded-full px-4 py-2 font-sans text-[12.5px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {announce.isPending ? "Announcing…" : "Confirm"}
      </button>
    </div>
  );
}

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="ws-display text-[16px] text-white/90">Entries</h2>
          <AnnounceWinners
            listingId={listing.id}
            slug={listing.slug}
            winnersAnnounced={listing.winnersAnnounced}
            isPublished={listing.isPublished}
          />
        </div>
        <div className="mt-3">
          <SubmissionReviewList slug={listing.slug} rewards={listing.rewards} />
        </div>
      </section>
    </div>
  );
}
