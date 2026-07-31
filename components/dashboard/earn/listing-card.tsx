"use client";

import Link from "next/link";
import { RewardBadge } from "@/components/dashboard/earn/reward-badge";
import { deadlineLabel } from "@/lib/earn/deadline";
import type { ListingSummary } from "@/lib/earn/api/types";

const TYPE_LABEL: Record<ListingSummary["type"], string> = {
  bounty: "Bounty",
  project: "Project",
  hackathon: "Hackathon",
  grant: "Grant",
};

// `featured` puts the animated border beam on the first card, which is how the
// rest of the app marks the one thing it wants looked at first.
export function ListingCard({
  listing,
  featured = false,
}: {
  listing: ListingSummary;
  featured?: boolean;
}) {
  const deadline = deadlineLabel(listing.deadline);

  return (
    <Link
      href={`/earn/listing/${listing.slug}`}
      className={`${featured ? "ws-beam" : ""}ws-card relative flex flex-col gap-3 overflow-hidden rounded-[20px] p-5 transition-colors hover:border-white/25`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="ws-display truncate text-[16px] text-white">{listing.title}</div>
          <div className="mt-1 truncate font-sans text-[12.5px] font-normal text-white/50">
            {listing.sponsor?.name ?? "Unknown sponsor"}
          </div>
        </div>
        {listing.sponsor?.logo ? (
          // Sponsor logos are arbitrary remote URLs, so they go through a plain
          // img rather than the Next image loader.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.sponsor.logo}
            alt=""
            className="size-9 shrink-0 rounded-full border border-white/10 object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/10 px-2.5 py-1 font-sans text-[11.5px] font-medium text-white/55">
          {TYPE_LABEL[listing.type]}
        </span>
        <span className="rounded-full border border-white/10 px-2.5 py-1 font-sans text-[11.5px] font-medium text-white/55">
          {listing.region}
        </span>
        {listing.isPro ? (
          <span className="border-accent/40 text-accent rounded-full border px-2.5 py-1 font-sans text-[11.5px] font-semibold">
            Pro
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex items-end justify-between gap-4">
        <RewardBadge reward={listing.reward} />
        <div className="text-right">
          <div
            className={`tnum font-sans text-[12.5px] font-medium ${
              deadline.closed ? "text-white/35" : "text-white/60"
            }`}
          >
            {deadline.text}
          </div>
          <div className="tnum font-sans text-[11.5px] font-normal text-white/40">
            {listing.submissionCount} {listing.submissionCount === 1 ? "entry" : "entries"}
          </div>
        </div>
      </div>
    </Link>
  );
}
