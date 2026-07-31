"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AsyncEmpty, AsyncError, AsyncLoading } from "@/components/dashboard/async-state";
import { RewardBadge } from "@/components/dashboard/earn/reward-badge";
import { useCurrentSponsor } from "@/hooks/use-earn-sponsor";
import { useIsCreateAllowed } from "@/hooks/use-earn-sponsor-listings";
import { useListingFeed } from "@/hooks/use-earn-listings";
import { deadlineLabel } from "@/lib/earn/deadline";
import { DEFAULT_BROWSE_QUERY, type ListingStatus } from "@/lib/earn/api/types";

const PAGE = "mx-auto w-full max-w-[900px] px-4 pt-6 pb-20 sm:px-6";

const UNCONFIGURED_DETAIL = "This goes live once the earn service is switched on.";

const STATUSES: { id: ListingStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "review", label: "In review" },
  { id: "completed", label: "Completed" },
];

export function SponsorHomeSection() {
  const { sponsor, isLoading, error } = useCurrentSponsor();

  // A failed lookup must not hide the way to sign up. "We couldn't read your
  // company" and "you don't have one yet" look identical from here, and only
  // one of them has a dead end.
  if (error) {
    return (
      <div className={PAGE}>
        <AsyncError error={error} subject="your company" unconfiguredDetail={UNCONFIGURED_DETAIL} />
        <div className="mt-4 text-center">
          <Link
            href="/earn/sponsor/new"
            className="font-sans text-[12.5px] font-medium text-white/55 underline-offset-2 transition-colors hover:text-white hover:underline"
          >
            Set up a company instead
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={PAGE}>
        <AsyncLoading label="Loading your company" rows={4} />
      </div>
    );
  }

  // No sponsor is the normal first visit, not a failure. Prompt rather than
  // redirect, so the user sees what they are being asked to do.
  if (!sponsor) return <NoSponsorPrompt />;

  return <SponsorListings sponsorSlug={sponsor.slug} sponsorName={sponsor.name} />;
}

function NoSponsorPrompt() {
  return (
    <div className={PAGE}>
      <div className="ws-card rounded-[20px] px-6 py-10 text-center">
        <h1 className="ws-display text-[22px] text-white">Post work, get it built</h1>
        <p className="mx-auto mt-2 max-w-[46ch] font-sans text-[13px] font-normal text-white/55">
          Set up a company page and you can publish bounties, review what comes in, and pay the
          people who ship.
        </p>
        <Link
          href="/earn/sponsor/new"
          className="bg-accent text-ink mt-6 inline-block cursor-pointer rounded-full px-5 py-2.5 font-sans text-[13px] font-semibold"
        >
          Set up your company
        </Link>
      </div>
    </div>
  );
}

function SponsorListings({
  sponsorSlug,
  sponsorName,
}: {
  sponsorSlug: string;
  sponsorName: string;
}) {
  const [status, setStatus] = useState<ListingStatus>("open");
  const { allowed } = useIsCreateAllowed();

  // Stopgap. The MVP has no endpoint that lists a sponsor's own listings, only
  // one that reads a single listing by slug, so this filters the public feed
  // down to this company. It cannot show unpublished drafts, which never reach
  // that feed. Replace once the service exposes GET /sponsor-dashboard/listings.
  const { listings, isLoading, error } = useListingFeed({ ...DEFAULT_BROWSE_QUERY, status });
  const mine = useMemo(
    () => listings.filter((listing) => listing.sponsor?.slug === sponsorSlug),
    [listings, sponsorSlug]
  );

  return (
    <div className={PAGE}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="ws-display text-[clamp(22px,3vw,30px)] tracking-[-0.02em] text-white">
            {sponsorName}
          </h1>
          <p className="mt-1 font-sans text-[13px] font-normal text-white/50">
            Your published listings.
          </p>
        </div>

        {allowed ? (
          <Link
            href="/earn/sponsor/listing/new"
            className="bg-accent text-ink cursor-pointer rounded-full px-4 py-2.5 font-sans text-[12.5px] font-semibold"
          >
            New listing
          </Link>
        ) : (
          <span className="ws-inset rounded-full px-4 py-2.5 font-sans text-[12.5px] font-medium text-white/40">
            Listing limit reached
          </span>
        )}
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        {STATUSES.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setStatus(option.id)}
            aria-pressed={status === option.id}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 font-sans text-[12.5px] transition-colors ${
              status === option.id
                ? "border-accent bg-accent text-ink font-semibold"
                : "border-white/10 font-medium text-white/55 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {error ? (
          <AsyncError
            error={error}
            subject="your listings"
            unconfiguredDetail={UNCONFIGURED_DETAIL}
          />
        ) : isLoading ? (
          <AsyncLoading label="Loading your listings" rows={3} />
        ) : mine.length === 0 ? (
          <AsyncEmpty>Nothing here yet. Drafts stay hidden until you publish them.</AsyncEmpty>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {mine.map((listing) => {
              const deadline = deadlineLabel(listing.deadline);
              return (
                <li key={listing.id}>
                  <Link
                    href={`/earn/sponsor/listing/${listing.slug}?type=${listing.type}`}
                    className="ws-card flex items-center justify-between gap-4 rounded-[16px] px-4 py-3.5 transition-colors hover:border-white/25"
                  >
                    <div className="min-w-0">
                      <div className="ws-display truncate text-[14.5px] text-white">
                        {listing.title}
                      </div>
                      <div className="tnum mt-0.5 font-sans text-[12px] font-normal text-white/45">
                        {listing.submissionCount}{" "}
                        {listing.submissionCount === 1 ? "entry" : "entries"} · {deadline.text}
                      </div>
                    </div>
                    <RewardBadge reward={listing.reward} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
