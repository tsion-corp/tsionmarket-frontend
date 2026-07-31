"use client";

import { useState } from "react";
import { AsyncEmpty, AsyncError, AsyncLoading } from "@/components/dashboard/async-state";
import { WinnerPicker } from "@/components/dashboard/earn/sponsor/winner-picker";
import { useRejectSubmissions, useSponsorSubmissions } from "@/hooks/use-earn-sponsor-listings";
import { ordinal } from "@/lib/earn/ordinal";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { RewardTier, Submission } from "@/lib/earn/api/types";

const STATUS_STYLE: Record<Submission["status"], string> = {
  winner: "border-up/40 text-up",
  rejected: "border-white/10 text-white/35",
  pending: "border-white/10 text-white/55",
};

export function SubmissionReviewList({ slug, rewards }: { slug: string; rewards: RewardTier[] }) {
  const { submissions, isLoading, error } = useSponsorSubmissions(slug);
  const reject = useRejectSubmissions(slug);
  const [rejecting, setRejecting] = useState<string | null>(null);

  async function onReject(submission: Submission) {
    setRejecting(submission.id);
    const id = toast.loading("Rejecting…");
    try {
      await reject.mutateAsync([submission.id]);
      toast.success("Entry rejected.", { id });
    } catch (rejectError) {
      toast.error(friendlyError(rejectError, "Couldn't reject that entry."), { id });
    } finally {
      setRejecting(null);
    }
  }

  if (error) {
    return (
      <AsyncError
        error={error}
        subject="the entries"
        unconfiguredDetail="This goes live once the earn service is switched on."
      />
    );
  }

  if (isLoading) return <AsyncLoading label="Loading entries" rows={4} />;

  if (!submissions.length) {
    return <AsyncEmpty>No entries yet.</AsyncEmpty>;
  }

  return (
    <div className="flex flex-col gap-5">
      <WinnerPicker slug={slug} submissions={submissions} rewards={rewards} />

      <ul className="flex flex-col gap-2.5">
        {submissions.map((submission) => (
          <li key={submission.id} className="ws-card rounded-[16px] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-sans text-[13.5px] font-semibold text-white/90">
                  {submission.applicant?.username ?? "Anonymous"}
                </div>
                {submission.link ? (
                  <a
                    href={submission.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-0.5 block truncate font-sans text-[12.5px] font-normal text-white/50 underline-offset-2 transition-colors hover:text-white hover:underline"
                  >
                    {submission.link}
                  </a>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 font-sans text-[11.5px] font-medium ${STATUS_STYLE[submission.status]}`}
                >
                  {submission.status === "winner"
                    ? submission.winnerPosition
                      ? `${ordinal(submission.winnerPosition)} place`
                      : "Winner"
                    : submission.status === "rejected"
                      ? "Rejected"
                      : "Pending"}
                </span>

                {submission.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => void onReject(submission)}
                    disabled={rejecting === submission.id}
                    className="cursor-pointer rounded-full border border-white/10 px-3 py-1.5 font-sans text-[12px] font-medium text-white/55 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {rejecting === submission.id ? "Rejecting…" : "Reject"}
                  </button>
                ) : null}
              </div>
            </div>

            {submission.otherInfo ? (
              <p className="mt-2.5 font-sans text-[12.5px] leading-[1.6] font-normal whitespace-pre-line text-white/60">
                {submission.otherInfo}
              </p>
            ) : null}

            {submission.eligibilityAnswers.length ? (
              <dl className="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3">
                {submission.eligibilityAnswers.map((answer, index) => (
                  <div key={index}>
                    <dt className="font-sans text-[11.5px] font-medium text-white/40">
                      {answer.question}
                    </dt>
                    <dd className="font-sans text-[12.5px] font-normal text-white/70">
                      {answer.answer || "No answer"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
