"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { RewardBadge } from "@/features/earn/components/reward-badge";
import { useCurrentSponsor } from "@/features/earn/hooks/use-earn-sponsor";
import { useSponsorListings } from "@/features/earn/hooks/use-earn-sponsor-listings";
import { deadlineLabel } from "@/features/earn/lib/deadline";
import type { SponsorListing } from "@/features/earn/lib/api/types";

const PAGE = "mx-auto w-full max-w-[1520px] px-4 pt-6 pb-20 sm:px-6";

const UNCONFIGURED_DETAIL = "This goes live once the earn service is switched on.";

// A draft is a listing the sponsor owns that the service says is not published.
// A listing whose state the service did not report is left out rather than
// guessed at, since a published listing shown here would invite a second
// publish of work that is already live.
function draftsOf(listings: SponsorListing[]): SponsorListing[] {
  return listings.filter((listing) => listing.isPublished === false);
}

export function SponsorDraftsSection() {
  const { sponsor, isLoading: sponsorLoading } = useCurrentSponsor();
  const { listings, isLoading, error } = useSponsorListings();
  const drafts = useMemo(() => draftsOf(listings), [listings]);

  if (error) {
    return (
      <div className={PAGE}>
        <AsyncError error={error} subject="your drafts" unconfiguredDetail={UNCONFIGURED_DETAIL} />
      </div>
    );
  }

  if (isLoading || sponsorLoading) {
    return (
      <div className={PAGE}>
        <AsyncLoading label="Loading your drafts" rows={3} />
      </div>
    );
  }

  // Drafts belong to a company, so someone without one has nothing to look at
  // here. Send them to set one up rather than showing an empty list.
  if (!sponsor) {
    return (
      <div className={PAGE}>
        <div className="ws-inset grid place-items-center px-5 py-12 text-center">
          <div className="max-w-[44ch]">
            <div className="text-[14px] font-semibold text-white/85">
              Drafts belong to a company.
            </div>
            <div className="mt-1.5 text-[12.5px] font-normal text-white/50">
              Set one up and anything you start writing is saved here until you publish it.
            </div>
            <Link
              href="/earn/sponsor/new"
              className="mt-4 inline-block cursor-pointer rounded-full border border-white/15 px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
            >
              Set up your company
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="ws-display text-[clamp(22px,3vw,30px)] tracking-[-0.02em] text-white">
            Drafts
          </h1>
          <p className="mt-1 font-sans text-[13px] font-normal text-white/50">
            Work in progress. Nobody sees a draft until you publish it.
          </p>
        </div>

        <Link
          href="/earn/sponsor/listing/new"
          className="ws-inset cursor-pointer rounded-full px-4 py-2.5 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/30"
        >
          New listing
        </Link>
      </header>

      <div className="mt-6">
        {drafts.length === 0 ? (
          <div className="ws-inset grid place-items-center px-5 py-12 text-center">
            <div className="max-w-[44ch]">
              <div className="text-[14px] font-semibold text-white/85">No drafts right now.</div>
              <div className="mt-1.5 text-[12.5px] font-normal text-white/50">
                Start a listing and save it without publishing, and it waits here until you are
                ready.
              </div>
              <Link
                href="/earn/sponsor"
                className="mt-4 inline-block cursor-pointer rounded-full border border-white/15 px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
              >
                Your published listings
              </Link>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <DraftRow draft={draft} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DraftRow({ draft }: { draft: SponsorListing }) {
  // A draft can be saved with nothing but a title, so the deadline and the
  // reward are both allowed to be missing here in a way a live listing's never
  // are. Say what is still needed instead of rendering a blank.
  const deadline = draft.deadline ? deadlineLabel(draft.deadline).text : "No deadline yet";

  return (
    <Link
      href={`/earn/sponsor/listing/${draft.slug}?type=${draft.type}`}
      className="ws-card flex items-center justify-between gap-4 rounded-[16px] px-4 py-3.5 transition-colors hover:border-white/25"
    >
      <div className="min-w-0">
        <div className="ws-display truncate text-[14.5px] text-white">{draft.title}</div>
        <div className="tnum mt-0.5 font-sans text-[12px] font-normal text-white/45">
          {draft.type} · {deadline}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {draft.reward ? (
          <RewardBadge reward={draft.reward} />
        ) : (
          <span className="font-sans text-[12px] font-normal text-white/35">No reward set</span>
        )}
        <span className="rounded-full border border-white/12 px-2.5 py-1 font-sans text-[11px] font-medium text-white/55">
          Draft
        </span>
      </div>
    </Link>
  );
}
