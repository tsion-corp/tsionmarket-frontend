"use client";

import Link from "next/link";
import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { RewardBadge } from "@/features/earn/components/reward-badge";
import { useMySubmissions } from "@/features/earn/hooks/use-earn-submission";
import { useClaimInfo, useClaimReward } from "@/features/earn/hooks/use-earn-claim";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { deadlineLabel } from "@/features/earn/lib/deadline";
import { ordinal } from "@/features/earn/lib/ordinal";
import type { MySubmission } from "@/features/earn/lib/api/types";

const PAGE = "mx-auto w-full max-w-[1520px] px-4 pt-6 pb-20 sm:px-6";

const UNCONFIGURED_DETAIL = "This goes live once the earn service is switched on.";

interface Outcome {
  label: string;
  detail: string;
  tone: "win" | "out" | "waiting";
}

// What this entry is doing, from the entrant's side. Before winners are
// announced there is nothing to say beyond "in review": the service does not
// expose a sponsor's in-progress opinion, and implying one would be a lie.
function outcomeOf(entry: MySubmission): Outcome {
  if (entry.status === "rejected") {
    return { label: "Rejected", detail: "The sponsor turned this entry down.", tone: "out" };
  }

  if (!entry.listing?.winnersAnnounced) {
    return {
      label: "In review",
      detail: "You'll see the result here once the sponsor picks winners.",
      tone: "waiting",
    };
  }

  if (entry.status !== "winner") {
    return {
      label: "Not selected",
      detail: "Winners were announced and this entry was not one of them.",
      tone: "out",
    };
  }

  const place = entry.winnerPosition ? `Won ${ordinal(entry.winnerPosition)}` : "Won";
  return {
    label: place,
    detail: entry.isPaid ? "Paid." : "The sponsor is preparing your payment.",
    tone: "win",
  };
}

const TONE: Record<Outcome["tone"], string> = {
  win: "border-up/40 text-up",
  out: "border-white/10 text-white/40",
  waiting: "border-white/12 text-white/60",
};

export function ApplicationsSection() {
  const { submissions, isLoading, error } = useMySubmissions();

  if (error) {
    return (
      <div className={PAGE}>
        <AsyncError
          error={error}
          subject="your applications"
          unconfiguredDetail={UNCONFIGURED_DETAIL}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={PAGE}>
        <AsyncLoading label="Loading your applications" rows={4} />
      </div>
    );
  }

  const won = submissions.filter((entry) => entry.status === "winner").length;

  return (
    <div className={PAGE}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="ws-display text-[clamp(22px,3vw,30px)] tracking-[-0.02em] text-white">
            Your applications
          </h1>
          <p className="mt-1 font-sans text-[13px] font-normal text-white/50">
            {submissions.length === 0
              ? "Everything you enter shows up here."
              : `${submissions.length} ${submissions.length === 1 ? "entry" : "entries"}${
                  won > 0 ? ` · ${won} won` : ""
                }`}
          </p>
        </div>

        <Link
          href="/earn"
          className="ws-inset cursor-pointer rounded-full px-4 py-2.5 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/30"
        >
          Find work
        </Link>
      </header>

      <div className="mt-6">
        {submissions.length === 0 ? (
          <div className="ws-inset grid place-items-center px-5 py-12 text-center">
            <div className="max-w-[44ch]">
              <div className="text-[14px] font-semibold text-white/85">
                You haven&apos;t entered anything yet.
              </div>
              <div className="mt-1.5 text-[12.5px] font-normal text-white/50">
                Pick something from the feed, ship it, and it will be tracked here until the sponsor
                picks winners.
              </div>
              <Link
                href="/earn"
                className="mt-4 inline-block cursor-pointer rounded-full border border-white/15 px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
              >
                Browse listings
              </Link>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {submissions.map((entry) => (
              <li key={entry.id}>
                <ApplicationRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ApplicationRow({ entry }: { entry: MySubmission }) {
  const outcome = outcomeOf(entry);
  const listing = entry.listing;

  // An entry whose listing could not be read is still shown: the person did
  // submit it, and hiding it would be worse than showing it without context.
  const body = (
    <>
      <div className="min-w-0">
        <div className="ws-display truncate text-[14.5px] text-white">
          {listing?.title ?? "A listing that could not be loaded"}
        </div>
        <div className="tnum mt-0.5 font-sans text-[12px] font-normal text-white/45">
          {listing?.sponsor?.name ? `${listing.sponsor.name} · ` : ""}
          {listing?.deadline ? deadlineLabel(listing.deadline).text : "No deadline"}
        </div>
        <div className="mt-1.5 font-sans text-[12px] font-normal text-white/40">
          {outcome.detail}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {listing?.reward ? <RewardBadge reward={listing.reward} /> : null}
        <span
          className={`rounded-full border px-2.5 py-1 font-sans text-[11px] font-medium ${TONE[outcome.tone]}`}
        >
          {outcome.label}
        </span>
      </div>
    </>
  );

  const className =
    "ws-card flex items-center justify-between gap-4 rounded-[16px] px-4 py-3.5 transition-colors";

  const row = !listing ? (
    <div className={className}>{body}</div>
  ) : (
    <Link href={`/earn/listing/${listing.slug}`} className={`${className} hover:border-white/25`}>
      {body}
    </Link>
  );

  // Claiming sits outside the row rather than inside it, because the row is a
  // link and a button nested in a link is not reliably clickable.
  return (
    <div className="flex flex-col gap-2">
      {row}
      {entry.status === "winner" ? <ClaimReward entry={entry} /> : null}
    </div>
  );
}

// Collecting a reward the sponsor has already released.
//
// Releasing credits a balance in escrow rather than transferring, so one winner
// whose address cannot receive never blocks anybody else. This is the second
// half: the winner's own wallet collects what is theirs.
function ClaimReward({ entry }: { entry: MySubmission }) {
  const { info } = useClaimInfo(entry.listingId, entry.listing?.winnersAnnounced === true);
  const claim = useClaimReward(entry.listingId);

  if (!info?.claimable || !info.escrowAddress || !info.tokenAddress) return null;

  const amount =
    info.amountMinor && info.decimals !== undefined
      ? Number(info.amountMinor) / 10 ** info.decimals
      : 0;

  if (info.alreadyClaimed || amount <= 0) {
    return (
      <p className="px-4 font-sans text-[11.5px] font-normal text-white/35">
        Reward collected. It is in your wallet.
      </p>
    );
  }

  async function onClaim() {
    const id = toast.loading("Confirm in your wallet…");
    try {
      await claim.mutateAsync({
        escrowAddress: info!.escrowAddress as string,
        tokenAddress: info!.tokenAddress as string,
      });
      toast.success(`${amount.toLocaleString()} ${info!.tokenSymbol} is in your wallet.`, { id });
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't collect that reward."), { id });
    }
  }

  return (
    <div className="ws-inset flex flex-wrap items-center justify-between gap-3 rounded-[14px] px-4 py-3">
      <div className="min-w-0">
        <div className="text-up font-sans text-[12.5px] font-semibold">
          {amount.toLocaleString()} {info.tokenSymbol} is waiting for you.
        </div>
        <div className="mt-0.5 font-sans text-[11.5px] font-normal text-white/45">
          Held in escrow until you collect it.
        </div>
      </div>
      <button
        type="button"
        onClick={() => void onClaim()}
        disabled={claim.isPending}
        className="bg-accent text-ink shrink-0 cursor-pointer rounded-full px-4 py-2 font-sans text-[12.5px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {claim.isPending ? "Collecting…" : "Claim reward"}
      </button>
    </div>
  );
}
