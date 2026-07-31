"use client";

import { useState } from "react";
import { AsyncError, AsyncLoading } from "@/components/dashboard/async-state";
import { RewardBadge } from "@/components/dashboard/earn/reward-badge";
import { SubmissionStatus } from "@/components/dashboard/earn/submission-status";
import { SubmitSheet } from "@/components/dashboard/earn/submit-sheet";
import { useListingDetail } from "@/hooks/use-earn-listings";
import { useSubmissionCheck } from "@/hooks/use-earn-submission";
import { deadlineLabel, formatDeadline } from "@/lib/earn/deadline";
import { ordinal } from "@/lib/earn/ordinal";
import { formatReward } from "@/lib/earn/reward";
import type { Listing } from "@/lib/earn/api/types";

const PAGE = "mx-auto w-full max-w-[1100px] px-4 pt-6 pb-20 sm:px-6 lg:px-8";

const UNCONFIGURED_DETAIL = "Bounties go live once the earn service is switched on.";

export function ListingDetailSection({ slug }: { slug: string | null }) {
  const { listing, isLoading, error } = useListingDetail(slug);
  // Only asked once the listing is known, since the check is keyed by id.
  const { check } = useSubmissionCheck(listing?.id ?? null);
  const [submitOpen, setSubmitOpen] = useState(false);

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
        <AsyncLoading label="Loading the listing" rows={6} />
      </div>
    );
  }

  const deadline = deadlineLabel(listing.deadline);
  const alreadySubmitted = check?.hasSubmitted ?? false;
  const canSubmit = !alreadySubmitted && !deadline.closed && listing.status === "open";

  return (
    <div className={PAGE}>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article>
          <div className="flex items-center gap-3">
            {listing.sponsor?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.sponsor.logo}
                alt=""
                className="size-11 rounded-full border border-white/10 object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <div className="font-sans text-[13px] font-medium text-white/60">
                {listing.sponsor?.name ?? "Unknown sponsor"}
              </div>
              <div className="font-sans text-[12px] font-normal text-white/40">
                {listing.region}
              </div>
            </div>
          </div>

          <h1 className="ws-display mt-4 text-[clamp(24px,3.4vw,34px)] tracking-[-0.02em] text-white">
            {listing.title}
          </h1>

          <Description text={listing.description} />

          {listing.skills.length ? (
            <section className="mt-7">
              <h2 className="ws-display text-[15px] text-white/85">Skills</h2>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {listing.skills.flatMap((group) =>
                  group.subskills.length
                    ? group.subskills.map((sub) => <Tag key={`${group.skill}-${sub}`}>{sub}</Tag>)
                    : [<Tag key={group.skill}>{group.skill}</Tag>]
                )}
              </div>
            </section>
          ) : null}

          {check ? <SubmissionStatus check={check} /> : null}
        </article>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="ws-card rounded-[20px] p-5">
            <div className="font-sans text-[12px] font-normal text-white/45">Total reward</div>
            <div className="mt-1">
              <RewardBadge reward={listing.reward} size="lg" />
            </div>

            {listing.rewards.length > 1 ? (
              <ul className="mt-4 flex flex-col gap-1.5 border-t border-white/8 pt-4">
                {listing.rewards.map((tier) => (
                  <li key={tier.position} className="flex justify-between gap-3">
                    <span className="font-sans text-[12.5px] font-normal text-white/50">
                      {ordinal(tier.position)}
                    </span>
                    <span className="tnum font-sans text-[12.5px] font-medium text-white/80">
                      {formatReward(tier.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 border-t border-white/8 pt-4">
              <div className="font-sans text-[12px] font-normal text-white/45">Deadline</div>
              <div className="tnum mt-0.5 font-sans text-[13px] font-medium text-white/80">
                {formatDeadline(listing.deadline)}
              </div>
              <div
                className={`tnum mt-0.5 font-sans text-[12px] font-normal ${
                  deadline.closed ? "text-white/35" : "text-white/55"
                }`}
              >
                {deadline.text}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSubmitOpen(true)}
              disabled={!canSubmit}
              className="bg-accent text-ink mt-5 w-full cursor-pointer rounded-full px-4 py-2.5 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {alreadySubmitted ? "Already submitted" : deadline.closed ? "Closed" : "Submit work"}
            </button>

            {listing.pocSocials ? (
              <a
                href={listing.pocSocials}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 block text-center font-sans text-[12.5px] font-medium text-white/50 transition-colors hover:text-white"
              >
                Contact the sponsor
              </a>
            ) : null}
          </div>
        </aside>
      </div>

      <SubmitSheet
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        listingId={listing.id}
        listingTitle={listing.title}
        eligibility={listing.eligibility}
      />
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 px-2.5 py-1 font-sans text-[11.5px] font-medium text-white/55">
      {children}
    </span>
  );
}

// Descriptions arrive as plain text from the service. Rendering them as HTML
// would let a sponsor inject markup into everyone else's browser, so paragraphs
// are split on blank lines and nothing else is interpreted.
function Description({ text }: { text: Listing["description"] }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  if (!paragraphs.length) return null;

  return (
    <div className="mt-5 flex flex-col gap-3">
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className="font-sans text-[13.5px] leading-[1.7] font-normal whitespace-pre-line text-white/70"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}
