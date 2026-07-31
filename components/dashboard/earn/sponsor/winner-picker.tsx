"use client";

import { useMemo, useState } from "react";
import { useToggleWinners } from "@/hooks/use-earn-sponsor-listings";
import { formatReward } from "@/lib/earn/reward";
import { ordinal } from "@/lib/earn/ordinal";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { RewardTier, Submission, WinnerSelection } from "@/lib/earn/api/types";

// Assigns entries to paying positions. Every position the listing pays gets a
// row, so a sponsor can see which are still unfilled rather than having to
// count.
export function WinnerPicker({
  slug,
  submissions,
  rewards,
}: {
  slug: string;
  submissions: Submission[];
  rewards: RewardTier[];
}) {
  const toggle = useToggleWinners(slug);

  // What the service currently says, keyed by position.
  const saved = useMemo(() => {
    const map = new Map<number, string>();
    for (const submission of submissions) {
      if (submission.status === "winner" && submission.winnerPosition) {
        map.set(submission.winnerPosition, submission.id);
      }
    }
    return map;
  }, [submissions]);

  const [draft, setDraft] = useState<Map<number, string>>(saved);
  // The saved state is the source of truth. Re-seeding when it changes keeps
  // the picker honest after a save or a refetch.
  const [seenSaved, setSeenSaved] = useState(saved);
  if (seenSaved !== saved) {
    setSeenSaved(saved);
    setDraft(saved);
  }

  const eligible = submissions.filter((submission) => submission.status !== "rejected");
  const dirty = rewards.some((tier) => draft.get(tier.position) !== saved.get(tier.position));

  if (!rewards.length) return null;

  function pick(position: number, submissionId: string) {
    setDraft((prev) => {
      const next = new Map(prev);
      if (submissionId) next.set(position, submissionId);
      else next.delete(position);
      // One entry cannot hold two positions, so taking it frees the other.
      for (const [otherPosition, id] of next) {
        if (otherPosition !== position && id === submissionId) next.delete(otherPosition);
      }
      return next;
    });
  }

  async function onSave() {
    // Send both the additions and the removals: a position that was filled and
    // is now empty has to be explicitly unset, or the old winner stands.
    const selections: WinnerSelection[] = [];
    for (const tier of rewards) {
      const before = saved.get(tier.position);
      const after = draft.get(tier.position);
      if (before === after) continue;
      if (before) selections.push({ id: before, isWinner: false, winnerPosition: null });
      if (after) selections.push({ id: after, isWinner: true, winnerPosition: tier.position });
    }
    if (!selections.length) return;

    const id = toast.loading("Saving winners…");
    try {
      await toggle.mutateAsync(selections);
      toast.success("Winners saved.", { id });
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't save those winners."), { id });
    }
  }

  return (
    <div className="ws-card rounded-[18px] p-4">
      <h3 className="ws-display text-[15px] text-white/90">Winners</h3>
      <p className="mt-1 font-sans text-[12.5px] font-normal text-white/45">
        Assign an entry to each paying position.
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        {rewards.map((tier) => (
          <div key={tier.position} className="flex flex-wrap items-center gap-2.5">
            <span className="w-24 shrink-0 font-sans text-[12.5px] font-medium text-white/70">
              {ordinal(tier.position)}
            </span>
            <span className="tnum w-28 shrink-0 font-sans text-[12.5px] font-normal text-white/45">
              {formatReward(tier.amount)}
            </span>
            <select
              value={draft.get(tier.position) ?? ""}
              aria-label={`Winner for ${ordinal(tier.position)} place`}
              onChange={(event) => pick(tier.position, event.target.value)}
              className="ws-inset focus:border-accent/50 min-w-[180px] flex-1 cursor-pointer rounded-[12px] px-3 py-2 font-sans text-[12.5px] text-white outline-none"
            >
              <option value="" className="bg-sheet">
                Nobody yet
              </option>
              {eligible.map((submission) => (
                <option key={submission.id} value={submission.id} className="bg-sheet">
                  {submission.applicant?.username ?? submission.link ?? submission.id}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void onSave()}
        disabled={!dirty || toggle.isPending}
        className="bg-accent text-ink mt-4 cursor-pointer rounded-full px-4 py-2 font-sans text-[12.5px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {toggle.isPending ? "Saving…" : "Save winners"}
      </button>
    </div>
  );
}
